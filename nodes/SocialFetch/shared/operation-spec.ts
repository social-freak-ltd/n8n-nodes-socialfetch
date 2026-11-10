/** How to call one Social Fetch operation. Generated into `descriptions/operations.generated.ts`. */
export type SocialFetchOperationSpec = {
	method: "GET";
	/** OpenAPI path, with `{name}` placeholders for path parameters. */
	path: string;
	pathParams: string[];
	/**
	 * Every query parameter the node may send. `csv` lists go out comma-joined
	 * (`include=a,b`); `repeat` lists repeat the key (`url=a&url=b`).
	 */
	query: Array<{ name: string; format?: "csv" | "repeat" }>;
	/** Set when "Return All" can follow `data.page.nextCursor` or `data.page.nextPage`. */
	pagination?: "cursor" | "page";
	/** Dot path to the result list, e.g. `data.videos`. Simplify splits it into items. */
	itemsPath?: string;
	/** API reference page for this operation. */
	docsUrl?: string;
};
