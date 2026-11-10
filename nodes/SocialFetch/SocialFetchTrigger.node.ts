/**
 * "New post by monitored account" trigger (docs/internal/monitors-architecture-plan.md
 * §13.2): implemented as a webhook-subscription lifecycle. Activating the
 * workflow creates a SocialFetch monitor + inline webhook endpoint pointed at
 * this node's webhook URL (§11); deactivating deletes it. Incoming
 * deliveries are verified with the same HMAC scheme the server signs with
 * (§8.2, `webhook-signature.ts`).
 *
 * While someone tests the workflow in the editor ("Listen for test event"),
 * the trigger also asks Social Fetch to send a signed sample event, so the
 * editor shows data straight away instead of waiting for a real new post.
 */
import type {
	IDataObject,
	IHookFunctions,
	INodeProperties,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
	JsonObject,
} from "n8n-workflow";
import {
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
} from "n8n-workflow";

import { version as packageVersion } from "../../package.json";
import { triggerSources } from "./descriptions/trigger-sources.generated";
import {
	buildTriggerParams,
	type SocialFetchTriggerSource,
	webhookUrlProblem,
} from "./shared/trigger-source";
import { verifySocialFetchSignature } from "./webhook-signature.js";

const API_BASE_URL = "https://api.socialfetch.dev";

interface MonitorCreateResponse {
	data: {
		id: string;
		webhookEndpoint?: { id: string; secret: string };
	};
}

interface MonitorGetResponse {
	data: { id: string; status: string };
}

interface NodeWebhookStaticData extends IDataObject {
	monitorId?: string;
	webhookSecret?: string;
}

function extractHttpStatusCode(error: unknown): number | undefined {
	if (typeof error !== "object" || error === null) return undefined;
	const candidate = error as {
		httpCode?: string;
		statusCode?: number;
		response?: { status?: number; statusCode?: number };
		cause?: { response?: { status?: number } };
	};
	if (typeof candidate.httpCode === "string") {
		const parsed = Number.parseInt(candidate.httpCode, 10);
		if (!Number.isNaN(parsed)) return parsed;
	}
	if (typeof candidate.statusCode === "number") return candidate.statusCode;
	if (typeof candidate.response?.status === "number") {
		return candidate.response.status;
	}
	if (typeof candidate.response?.statusCode === "number") {
		return candidate.response.statusCode;
	}
	if (typeof candidate.cause?.response?.status === "number") {
		return candidate.cause.response.status;
	}
	return undefined;
}

function isNotFoundError(error: unknown): boolean {
	return extractHttpStatusCode(error) === 404;
}

function sourcesUsing(field: string): string[] {
	return triggerSources
		.filter((source) => field in source.params)
		.map((source) => source.value);
}

function findSource(operationId: string): SocialFetchTriggerSource | undefined {
	return triggerSources.find((source) => source.value === operationId);
}

function targetField(
	field: string,
	props: Omit<INodeProperties, "name" | "type" | "default" | "displayOptions">,
): INodeProperties {
	return {
		...props,
		name: field,
		type: "string",
		default: "",
		displayOptions: { show: { operationId: sourcesUsing(field) } },
	};
}

const userAgent = `socialfetch-integration-n8n/${packageVersion}`;

/**
 * Monitors created while testing in the editor, by webhook ID. The sample
 * event arrives while `create()` is still running, before n8n makes the node's
 * static data visible to `webhook()` and `delete()`, so both read it from here.
 * Without this, the test monitor would outlive the test and keep billing.
 */
const testMonitors = new Map<string, { monitorId: string; secret?: string }>();

/** Schedule for monitors created by a test in the editor: the API's longest, 7 days. */
export const TEST_MONITOR_INTERVAL_MINUTES = 60 * 24 * 7;
export class SocialFetchTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: "Social Fetch Trigger",
		name: "socialFetchTrigger",
		icon: {
			light: "file:socialfetch.svg",
			dark: "file:socialfetch.dark.svg",
		},
		group: ["trigger"],
		version: [1, 2],
		defaultVersion: 2,
		subtitle: '={{$parameter["operationId"]}}',
		description:
			"Starts the workflow when a watched account, channel, subreddit or search has a new post",
		eventTriggerDescription: "Waiting for a new post from the watched source",
		activationMessage:
			"Social Fetch now checks this source on your schedule and runs the workflow for each new post. Each check uses credits.",
		triggerPanel: {
			header: "Social Fetch sends a sample post within a few seconds",
			executionsHelp: {
				inactive:
					"<b>While you build the workflow</b>, click 'Execute step'. Social Fetch sets up the check and sends a sample post, so you can map its fields in the next nodes. Each test runs one check, which uses credits.<br /><br /><b>Once you publish the workflow</b>, Social Fetch checks the source on your schedule and runs the workflow once for each new post.",
				active:
					"<b>The workflow is live.</b> Social Fetch checks the source on your schedule and runs the workflow once for each new post. Each check uses credits.",
			},
			activationHint:
				"When the workflow is ready, publish it. Social Fetch then checks the source on your schedule and runs the workflow for each new post.",
		},
		defaults: { name: "Social Fetch Trigger" },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: "socialFetchApi", required: true }],
		webhooks: [
			{
				name: "default",
				httpMethod: "POST",
				responseMode: "onReceived",
				path: "webhook",
			},
		],
		properties: [
			{
				displayName:
					"Social Fetch checks the source on your schedule and starts this workflow for each new post. The first check only records what's already there, so older posts don't trigger it. Each check uses credits.",
				name: "notice",
				type: "notice",
				default: "",
			},
			{
				displayName: "Watch",
				name: "operationId",
				type: "options",
				noDataExpression: true,
				required: true,
				default: "tiktok.profile.videos.list",
				options: triggerSources.map((source) => ({
					name: source.name,
					value: source.value,
					description: source.description,
				})),
				description: "What to watch for new posts",
			},
			targetField("handle", {
				displayName: "Handle",
				placeholder: "e.g. nasa",
				description:
					"Username of the account to watch, without the @ (for a YouTube channel, the @handle)",
			}),
			targetField("channelId", {
				displayName: "YouTube Channel ID",
				placeholder: "e.g. UCX6OQ3DkcsbYNE6H8uQQuVA",
				description: "YouTube channel ID, as an alternative to Handle",
			}),
			targetField("subreddit", {
				displayName: "Subreddit",
				placeholder: "e.g. programming",
				description: "Subreddit name, without r/",
			}),
			targetField("query", {
				displayName: "Search Query",
				placeholder: "e.g. social media API",
				description:
					"Words to search for. For an Instagram hashtag, enter the hashtag without #.",
			}),
			targetField("userId", {
				displayName: "Instagram User ID",
				placeholder: "e.g. 25025320",
				description: "Numeric Instagram user ID of the profile",
			}),
			targetField("entityId", {
				displayName: "LinkedIn Person Entity ID",
				description:
					"Case-sensitive entity ID from a LinkedIn person lookup (Social Fetch node → LinkedIn → Profile)",
			}),
			targetField("organizationId", {
				displayName: "LinkedIn Organisation ID",
				description:
					"Numeric organisation ID from a LinkedIn organisation lookup (Social Fetch node → LinkedIn → Organization)",
			}),
			// Same field twice so each version keeps its own default: workflows
			// saved with version 1 store no value for the old default of 15.
			{
				displayName: "Poll Interval (Minutes)",
				name: "intervalMinutes",
				type: "number",
				typeOptions: {
					minValue: 1,
				},
				required: true,
				default: 60,
				displayOptions: { show: { "@version": [{ _cnd: { gte: 2 } }] } },
				description:
					"How often Social Fetch checks the source, in minutes. Each check uses credits: every 60 minutes is 24 checks a day, every 15 minutes is 96. X (Twitter) sources need at least 5 minutes.",
			},
			{
				displayName: "Poll Interval (Minutes)",
				name: "intervalMinutes",
				type: "number",
				typeOptions: {
					minValue: 1,
				},
				required: true,
				default: 15,
				displayOptions: { show: { "@version": [1] } },
				description:
					"How often Social Fetch checks the source, in minutes. Each check uses credits, so a longer interval costs less. X (Twitter) sources need at least 5 minutes.",
			},
			{
				displayName: "Simplify",
				name: "simplify",
				type: "boolean",
				default: true,
				displayOptions: { show: { "@version": [{ _cnd: { gte: 2 } }] } },
				description:
					"Whether to output one item per new post. Turn off to get the whole event, with the monitor and billing details.",
			},
		],
		usableAsTool: true,
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData(
					"node",
				) as NodeWebhookStaticData;
				const monitorId = staticData.monitorId;
				if (typeof monitorId !== "string" || monitorId.length === 0) {
					return false;
				}

				try {
					const response =
						(await this.helpers.httpRequestWithAuthentication.call(
							this,
							"socialFetchApi",
							{
								method: "GET",
								url: `${API_BASE_URL}/v1/monitors/${monitorId}`,
								headers: { "User-Agent": userAgent },
								json: true,
							},
						)) as MonitorGetResponse;
					return response.data.status === "active";
				} catch (error) {
					if (isNotFoundError(error)) {
						delete staticData.monitorId;
						delete staticData.webhookSecret;
						return false;
					}
					throw new NodeApiError(this.getNode(), error as JsonObject);
				}
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl("default");
				if (!webhookUrl) {
					throw new NodeOperationError(
						this.getNode(),
						"Could not resolve the webhook URL for this node.",
					);
				}

				const unreachable = webhookUrlProblem(webhookUrl);
				if (unreachable) {
					throw new NodeOperationError(this.getNode(), unreachable);
				}

				const operationId = this.getNodeParameter("operationId", "") as string;
				if (!operationId) {
					throw new NodeOperationError(
						this.getNode(),
						"Choose what to watch in the Watch field.",
					);
				}
				const source = findSource(operationId);
				if (!source) {
					throw new NodeOperationError(
						this.getNode(),
						`Social Fetch can't watch "${operationId}". Pick another option in the Watch field.`,
					);
				}

				const built = buildTriggerParams(source, (field) =>
					String(this.getNodeParameter(field, "") ?? ""),
				);
				if (!built.ok) {
					throw new NodeOperationError(this.getNode(), built.message);
				}

				const intervalMinutes = this.getNodeParameter(
					"intervalMinutes",
					15,
				) as number;
				if (intervalMinutes < source.minIntervalMinutes) {
					throw new NodeOperationError(
						this.getNode(),
						`"${source.name}" can be checked every ${source.minIntervalMinutes} minutes at most. Set Poll Interval to ${source.minIntervalMinutes} or more.`,
					);
				}

				// A test in the editor creates a monitor that's deleted when the test
				// ends. If n8n stops before it can delete it, the longest interval
				// keeps the leftover cheap, and the name says what it is.
				const testing = this.getActivationMode() === "manual";
				const monitorName = testing
					? `${this.getNode().name} (n8n test, safe to delete)`
					: this.getNode().name;
				const scheduleMinutes = testing
					? TEST_MONITOR_INTERVAL_MINUTES
					: intervalMinutes;

				let response: MonitorCreateResponse;
				try {
					response = (await this.helpers.httpRequestWithAuthentication.call(
						this,
						"socialFetchApi",
						{
							method: "POST",
							url: `${API_BASE_URL}/v1/monitors`,
							headers: { "User-Agent": userAgent },
							body: {
								name: monitorName,
								operationId,
								params: built.params,
								schedule: { type: "interval", minutes: scheduleMinutes },
								webhook: { url: webhookUrl },
							},
							json: true,
						},
					)) as MonitorCreateResponse;
				} catch (error) {
					throw new NodeApiError(this.getNode(), error as JsonObject);
				}

				const staticData = this.getWorkflowStaticData(
					"node",
				) as NodeWebhookStaticData;
				staticData.monitorId = response.data.id;
				staticData.webhookSecret = response.data.webhookEndpoint?.secret;

				// In the editor, send a signed sample so the user sees the event
				// shape now. Best effort: the real checks still run either way.
				const endpointId = response.data.webhookEndpoint?.id;
				const webhookId = this.getNode().webhookId;
				const secret = response.data.webhookEndpoint?.secret;
				if (this.getActivationMode() === "manual" && webhookId) {
					testMonitors.set(webhookId, { monitorId: response.data.id, secret });
				}
				// The sample is delivered while this call is still running. n8n runs
				// the workflow with it, but the node panel can keep showing "Listening
				// for test event" until the user stops it. A request sent after
				// create() returns would avoid that, but n8n releases this context on
				// return and nodes can't use timers, so the sample is requested here.
				if (this.getActivationMode() === "manual" && endpointId) {
					try {
						await this.helpers.httpRequestWithAuthentication.call(
							this,
							"socialFetchApi",
							{
								method: "POST",
								url: `${API_BASE_URL}/v1/webhook-endpoints/${endpointId}/test`,
								headers: { "User-Agent": userAgent },
								body: { sampleType: operationId },
								json: true,
							},
						);
					} catch (error) {
						this.logger.warn(
							`SocialFetch Trigger: could not send a sample event: ${(error as Error).message}`,
							{ error },
						);
					}
				}

				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData(
					"node",
				) as NodeWebhookStaticData;
				const webhookId = this.getNode().webhookId ?? "";
				const monitorId =
					staticData.monitorId ?? testMonitors.get(webhookId)?.monitorId;

				if (typeof monitorId === "string" && monitorId.length > 0) {
					try {
						await this.helpers.httpRequestWithAuthentication.call(
							this,
							"socialFetchApi",
							{
								method: "DELETE",
								url: `${API_BASE_URL}/v1/monitors/${monitorId}`,
								headers: { "User-Agent": userAgent },
								json: true,
							},
						);
					} catch (error) {
						// Best-effort cleanup: don't block deactivation if the monitor is
						// already gone or the API call fails for a transient reason.
						if (!isNotFoundError(error)) {
							this.logger.warn(
								`SocialFetch Trigger: failed to delete monitor ${monitorId} on deactivation`,
								{ error },
							);
						}
					}
				}

				delete staticData.monitorId;
				delete staticData.webhookSecret;
				testMonitors.delete(webhookId);
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const requestObject = this.getRequestObject() as unknown as {
			rawBody?: Buffer;
			readRawBody?: () => Promise<void>;
		};
		if (
			requestObject.rawBody === undefined &&
			typeof requestObject.readRawBody === "function"
		) {
			await requestObject.readRawBody();
		}
		const rawBody = (requestObject.rawBody ?? Buffer.alloc(0)).toString("utf8");

		const headerData = this.getHeaderData();
		const rawSignatureHeader = headerData["socialfetch-signature"];
		const signatureHeader = Array.isArray(rawSignatureHeader)
			? rawSignatureHeader[0]
			: rawSignatureHeader;

		const staticData = this.getWorkflowStaticData(
			"node",
		) as NodeWebhookStaticData;
		const secret =
			staticData.webhookSecret ??
			testMonitors.get(this.getNode().webhookId ?? "")?.secret;

		const respondUnauthorized = (reason: string): IWebhookResponseData => {
			const responseObject = this.getResponseObject() as unknown as {
				status: (code: number) => { json: (body: unknown) => void };
			};
			responseObject.status(401).json({ error: reason });
			return { noWebhookResponse: true };
		};

		if (!secret) {
			return respondUnauthorized(
				"No webhook secret is stored for this node. Deactivate and reactivate the workflow to re-provision the monitor.",
			);
		}
		if (!signatureHeader) {
			return respondUnauthorized("Missing socialfetch-signature header.");
		}

		const verification = verifySocialFetchSignature({
			rawBody,
			header: signatureHeader,
			secret,
		});
		if (!verification.ok) {
			return respondUnauthorized(
				`Invalid webhook signature (${verification.reason}).`,
			);
		}

		const event = JSON.parse(rawBody) as IDataObject;
		const simplify =
			this.getNode().typeVersion >= 2 &&
			(this.getNodeParameter("simplify", true) as boolean);
		return {
			workflowData: [this.helpers.returnJsonArray(eventItems(event, simplify))],
		};
	}
}

/**
 * Simplified output: one item per new post. Events without posts (for example
 * a status change) pass through whole so the workflow can still see them.
 */
export function eventItems(
	event: IDataObject,
	simplify: boolean,
): IDataObject[] {
	if (!simplify) return [event];
	const items = (event.data as IDataObject | undefined)?.items;
	if (!Array.isArray(items) || items.length === 0) return [event];
	return items.map((item) =>
		item !== null && typeof item === "object" && !Array.isArray(item)
			? (item as IDataObject)
			: { value: item as IDataObject[keyof IDataObject] },
	);
}
