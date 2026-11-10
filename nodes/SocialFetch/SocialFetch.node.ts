import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from "n8n-workflow";
import {
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
} from "n8n-workflow";

import { version as packageVersion } from "../../package.json";
import {
	allResourceProperties,
	resourceOptions,
} from "./descriptions/index.generated";
import { operations } from "./descriptions/operations.generated";
import { toNodeApiError } from "./shared/errors";
import type { SocialFetchOperationSpec } from "./shared/operation-spec";
import { fetchAllPages, type PageEnvelope } from "./shared/pagination";
import {
	API_BASE_URL,
	collectInputs,
	simplifyEnvelopes,
} from "./shared/request";

type FullResponse = {
	statusCode: number;
	body: unknown;
	headers?: Record<string, unknown>;
};

export class SocialFetch implements INodeType {
	description: INodeTypeDescription = {
		displayName: "Social Fetch",
		name: "socialFetch",
		icon: {
			light: "file:socialfetch.svg",
			dark: "file:socialfetch.dark.svg",
		},
		group: ["input"],
		version: [1, 2],
		defaultVersion: 2,
		subtitle:
			'={{$parameter["operation"].replace(/\\./g, " › ").replace(/^[^›]+ › /, "")}}',
		description: "Fetch social media and web data via the Social Fetch API",
		defaults: { name: "Social Fetch" },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: "socialFetchApi", required: true }],
		properties: [
			{
				displayName: "Resource",
				name: "resource",
				type: "options",
				noDataExpression: true,
				options: resourceOptions,
				default: "tiktok",
			},
			...allResourceProperties,
			{
				displayName: "Simplify",
				name: "simplify",
				type: "boolean",
				default: true,
				displayOptions: { show: { "@version": [{ _cnd: { gte: 2 } }] } },
				description:
					"Whether to return just the results, one item per post, video, comment or profile. Turn off to get the full API response, including page and credit details.",
			},
		],
		usableAsTool: true,
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const node = this.getNode();
		const nodeVersion = node.typeVersion;

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const operation = this.getNodeParameter(
					"operation",
					itemIndex,
				) as string;
				const spec: SocialFetchOperationSpec | undefined =
					operations[operation];
				if (!spec) {
					throw new NodeOperationError(
						node,
						`Unknown operation "${operation}". Update the Social Fetch node to the latest version.`,
						{ itemIndex },
					);
				}

				const additional = this.getNodeParameter(
					"additionalOptions",
					itemIndex,
					{},
				) as IDataObject;
				let inputs: { path: string; qs: IDataObject };
				try {
					inputs = collectInputs(
						spec,
						(name) => this.getNodeParameter(name, itemIndex, null),
						additional,
					);
				} catch (error) {
					throw new NodeOperationError(node, (error as Error).message, {
						itemIndex,
					});
				}

				const returnAll =
					spec.pagination !== undefined &&
					(this.getNodeParameter("returnAll", itemIndex, false) as boolean);

				const fetchPage = async (
					continuation: Record<string, string | number>,
				): Promise<PageEnvelope> => {
					const request: IHttpRequestOptions = {
						method: spec.method,
						baseURL: API_BASE_URL,
						url: inputs.path,
						qs: { ...inputs.qs, ...continuation },
						arrayFormat: "repeat",
						headers: {
							Accept: "application/json",
							"User-Agent": `socialfetch-integration-n8n/${packageVersion}`,
						},
						json: true,
						returnFullResponse: true,
						ignoreHttpStatusErrors: true,
					};
					let response: FullResponse;
					try {
						response = (await this.helpers.httpRequestWithAuthentication.call(
							this,
							"socialFetchApi",
							request,
						)) as FullResponse;
					} catch (error) {
						throw new NodeApiError(node, error as JsonObject, { itemIndex });
					}
					if (response.statusCode >= 400) {
						throw toNodeApiError(node, response, itemIndex, spec.docsUrl);
					}
					return (response.body ?? {}) as PageEnvelope;
				};

				const envelopes =
					returnAll && spec.pagination
						? await fetchAllPages(spec.pagination, fetchPage)
						: [await fetchPage({})];

				const simplify =
					nodeVersion >= 2 &&
					(this.getNodeParameter("simplify", itemIndex, true) as boolean);
				const outputs = simplify
					? simplifyEnvelopes(envelopes as IDataObject[], spec.itemsPath)
					: (envelopes as IDataObject[]);

				for (const json of outputs) {
					returnData.push({ json, pairedItem: { item: itemIndex } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: (error as Error).message,
							...((error as { description?: string }).description
								? { details: (error as { description?: string }).description }
								: {}),
						},
						pairedItem: { item: itemIndex },
					});
					continue;
				}
				const nodeError =
					error instanceof NodeApiError || error instanceof NodeOperationError
						? error
						: new NodeOperationError(node, error as Error, { itemIndex });
				throw nodeError;
			}
		}

		return [returnData];
	}
}
