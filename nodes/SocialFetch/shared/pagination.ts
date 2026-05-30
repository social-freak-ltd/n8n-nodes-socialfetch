import type {
	DeclarativeRestApiSettings,
	IExecutePaginationFunctions,
	INodeExecutionData,
} from "n8n-workflow";

type PageEnvelope = {
	data?: { page?: { nextCursor?: string | null; hasMore?: boolean } };
};

function nextCursorFrom(items: INodeExecutionData[]): string | undefined {
	const last = items[items.length - 1];
	const page = (last?.json as PageEnvelope | undefined)?.data?.page;
	if (
		page?.hasMore === true &&
		typeof page.nextCursor === "string" &&
		page.nextCursor.length > 0
	) {
		return page.nextCursor;
	}
	return undefined;
}

/**
 * Cursor paginator for SocialFetch list endpoints.
 *
 * Gated by the `returnAll` parameter via `routing.send.paginate`: when
 * `returnAll` is false n8n performs a single request and this returns only the
 * first page. When true, it follows `data.page.nextCursor` until `hasMore` is
 * false, accumulating one item per page.
 */
export async function cursorPagination(
	this: IExecutePaginationFunctions,
	requestOptions: DeclarativeRestApiSettings.ResultOptions,
): Promise<INodeExecutionData[]> {
	const aggregate: INodeExecutionData[] = [];

	let responseData = await this.makeRoutingRequest(requestOptions);
	aggregate.push(...responseData);

	let cursor = nextCursorFrom(responseData);
	while (cursor !== undefined) {
		requestOptions.options.qs = {
			...(requestOptions.options.qs ?? {}),
			cursor,
		};
		responseData = await this.makeRoutingRequest(requestOptions);
		aggregate.push(...responseData);
		cursor = nextCursorFrom(responseData);
	}

	return aggregate;
}
