import type { INode, JsonObject } from "n8n-workflow";
import { NodeApiError } from "n8n-workflow";

const API_KEYS_URL = "https://app.socialfetch.dev/api-keys";
const BILLING_URL = "https://app.socialfetch.dev/billing";
const REQUESTS_URL = "https://app.socialfetch.dev/requests";
const TROUBLESHOOTING_URL =
	"https://www.socialfetch.dev/docs/integrations/n8n/troubleshooting";

/** The public API's error envelope: `{ error: { code, message, requestId, … } }`. */
type ApiErrorBody = {
	error?: {
		code?: string;
		message?: string;
		requestId?: string;
		checkoutUrl?: string;
		cardBonusUrl?: string;
		upgradeUrl?: string;
	};
};

export type ApiErrorResponse = {
	statusCode: number;
	body: unknown;
	headers?: Record<string, unknown>;
};

export type FriendlyApiError = {
	message: string;
	description: string;
};

function retryAfterSeconds(
	headers: Record<string, unknown> | undefined,
): number | undefined {
	if (!headers) return undefined;
	const raw = Object.entries(headers).find(
		([key]) => key.toLowerCase() === "retry-after",
	)?.[1];
	const value = Number.parseInt(String(Array.isArray(raw) ? raw[0] : raw), 10);
	return Number.isFinite(value) && value > 0 ? value : undefined;
}

function sentence(text: string | undefined): string {
	const trimmed = (text ?? "").trim();
	if (!trimmed) return "";
	return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * Turns a Social Fetch error response into a message a non-developer can act
 * on. The API's own message is always kept, and the request ID is included so
 * support can find the call in the request log.
 */
export function describeApiError(
	response: ApiErrorResponse,
	docsUrl?: string,
): FriendlyApiError {
	const error = (response.body as ApiErrorBody | undefined)?.error ?? {};
	const apiMessage = sentence(error.message);
	const requestId = error.requestId
		? ` Request ID: ${error.requestId}. See it in your request log: ${REQUESTS_URL}?requestId=${encodeURIComponent(error.requestId)}`
		: "";
	const retryAfter = retryAfterSeconds(response.headers);
	const retryHint = retryAfter
		? `Try again in ${retryAfter} seconds.`
		: "Try again in a minute.";
	const retryOnFail =
		"To retry automatically, open this node's Settings and turn on Retry On Fail.";

	switch (response.statusCode) {
		case 400:
			return {
				message: "Social Fetch couldn't use the inputs on this node",
				description: `${apiMessage} Check the fields on this node${
					docsUrl ? `, or see the example inputs at ${docsUrl}` : ""
				}.${requestId}`.trim(),
			};
		case 401:
			return {
				message: "Your Social Fetch API key wasn't accepted",
				description: `Open the Social Fetch credential and paste a current API key from ${API_KEYS_URL}. Keys start with sfk_.${requestId}`,
			};
		case 402: {
			const links: string[] = [];
			if (error.cardBonusUrl) {
				links.push(`Add a card for free bonus credits: ${error.cardBonusUrl}`);
			}
			if (error.upgradeUrl) {
				links.push(`Move to a bigger plan: ${error.upgradeUrl}`);
			}
			links.push(`Buy credits: ${error.checkoutUrl ?? BILLING_URL}`);
			// A key that hit its own monthly spend limit gets the same 402, but
			// never with checkout offers; buying credits doesn't help there.
			const keyLimit = error.checkoutUrl
				? ""
				: ` If this API key has a monthly spend limit, it may have reached it: raise the limit in ${API_KEYS_URL}.`;
			return {
				message: "Not enough Social Fetch credits for this request",
				description:
					`${apiMessage}${keyLimit} ${links.join(". ")}.${requestId}`.trim(),
			};
		}
		case 403:
			return {
				message: "This API key isn't allowed to make this request",
				description:
					`${apiMessage} The key may belong to someone who left the workspace, or their role may not allow this. Create a new key in ${API_KEYS_URL} or ask the workspace owner.${requestId}`.trim(),
			};
		case 429:
			// Only the free account routes (Balance, Whoami) are rate limited.
			return {
				message: "Too many account checks in a short time",
				description:
					`${apiMessage} Balance checks have a rate limit: check the balance once before a loop, not once per item. ${retryHint}${requestId}`.trim(),
			};
		case 502:
			return {
				message: "Social Fetch couldn't get this data right now",
				description:
					`${apiMessage} Failed lookups aren't charged. ${retryHint} ${retryOnFail}${requestId}`.trim(),
			};
		case 503:
			return {
				message: "Social Fetch is busy right now",
				description:
					`${apiMessage} Failed lookups aren't charged. ${retryHint} ${retryOnFail}${requestId}`.trim(),
			};
		default:
			if (response.statusCode >= 500) {
				return {
					message: "Social Fetch had a problem with this request",
					description:
						`${apiMessage} ${retryHint} If it keeps happening, send the request ID to support@socialfetch.dev.${requestId}`.trim(),
				};
			}
			return {
				message: `Social Fetch returned an error (HTTP ${response.statusCode})`,
				description:
					`${apiMessage} More help: ${TROUBLESHOOTING_URL}.${requestId}`.trim(),
			};
	}
}

export function toNodeApiError(
	node: INode,
	response: ApiErrorResponse,
	itemIndex: number,
	docsUrl?: string,
): NodeApiError {
	const friendly = describeApiError(response, docsUrl);
	const body =
		response.body && typeof response.body === "object"
			? (response.body as JsonObject)
			: ({ body: String(response.body ?? "") } as JsonObject);
	return new NodeApiError(node, body, {
		message: friendly.message,
		description: friendly.description,
		httpCode: String(response.statusCode),
		itemIndex,
	});
}
