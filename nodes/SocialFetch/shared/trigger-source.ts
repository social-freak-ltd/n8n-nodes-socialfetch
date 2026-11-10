/** One thing the Social Fetch Trigger can watch. Generated into `descriptions/trigger-sources.generated.ts`. */
export type SocialFetchTriggerSource = {
	/** Monitor source `operationId`, stored in the node's Source field. */
	value: string;
	/** Dropdown label, e.g. "TikTok: New videos from a profile". */
	name: string;
	description: string;
	platform: string;
	minIntervalMinutes: number;
	defaultIntervalMinutes: number;
	/** Trigger field name → API parameter it fills (e.g. `query` → `hashtag`). */
	params: Record<string, string>;
	/** Fields that must be filled. */
	required: string[];
	/** At least one of these fields must be filled. */
	anyOf?: string[];
};

export type TriggerParamsResult =
	| { ok: true; params: Record<string, string> }
	| { ok: false; message: string };

const FIELD_LABELS: Record<string, string> = {
	handle: "Handle",
	channelId: "YouTube Channel ID",
	subreddit: "Subreddit",
	query: "Search Query",
	userId: "Instagram User ID",
	entityId: "LinkedIn Person Entity ID",
	organizationId: "LinkedIn Organisation ID",
};

export function triggerFieldLabel(field: string): string {
	return FIELD_LABELS[field] ?? field;
}

/** Builds the monitor's API params from the trigger fields, or says what's missing. */
export function buildTriggerParams(
	source: SocialFetchTriggerSource,
	read: (field: string) => string,
): TriggerParamsResult {
	const params: Record<string, string> = {};
	for (const [field, apiParam] of Object.entries(source.params)) {
		const value = read(field).trim();
		if (value) params[apiParam] = value;
	}
	const missing = source.required.filter((field) => !read(field).trim());
	if (missing.length > 0) {
		return {
			ok: false,
			message: `Fill in ${missing.map(triggerFieldLabel).join(" and ")} to watch "${source.name}".`,
		};
	}
	if (source.anyOf && !source.anyOf.some((field) => read(field).trim())) {
		return {
			ok: false,
			message: `Fill in ${source.anyOf.map(triggerFieldLabel).join(" or ")} to watch "${source.name}".`,
		};
	}
	return { ok: true, params };
}

const PRIVATE_HOST =
	/^(localhost|.*\.localhost|.*\.local|.*\.internal|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|0\.0\.0\.0|\[?::1\]?|host\.docker\.internal)$/i;

/**
 * Social Fetch only delivers to public HTTPS URLs on port 443. Returns a
 * message when this n8n's webhook URL can't receive events, so the user
 * learns why before a monitor is created. The API still checks properly
 * (including what a hostname resolves to); this catches the common cases.
 */
export function webhookUrlProblem(webhookUrl: string): string | undefined {
	let url: URL;
	try {
		url = new URL(webhookUrl);
	} catch {
		return undefined;
	}
	const reachable =
		url.protocol === "https:" &&
		(url.port === "" || url.port === "443") &&
		!PRIVATE_HOST.test(url.hostname);
	if (reachable) return undefined;
	return `Social Fetch can't reach this n8n to deliver new posts. Its webhook address is ${url.origin}, and Social Fetch only sends to public https:// addresses on the standard port. n8n Cloud works as it is. On your own server, set N8N_WEBHOOK_URL (or WEBHOOK_URL on older versions) to your public https address. If your n8n isn't on the internet, use a Schedule Trigger with the Social Fetch node instead.`;
}
