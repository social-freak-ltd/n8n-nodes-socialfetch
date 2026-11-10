/**
 * Hard cap on pages fetched by "Return All". Every page is a billed API call,
 * so a misbehaving cursor must never loop forever. Keep in sync with the
 * `returnAll` field description in `scripts/generate-from-openapi.mts`.
 */
export const MAX_RETURN_ALL_PAGES = 100;

/** Empty pages in a row that end "Return All" even when the API says there's more. */
export const MAX_EMPTY_PAGES_IN_A_ROW = 3;

export type PageEnvelope = {
	data?: {
		page?: {
			nextCursor?: string | null;
			nextPage?: number | null;
			hasMore?: boolean;
		};
	} & Record<string, unknown>;
};

export type PaginationKind = "cursor" | "page";

function nextCursorFrom(envelope: PageEnvelope): string | undefined {
	const page = envelope.data?.page;
	if (
		page?.hasMore === true &&
		typeof page.nextCursor === "string" &&
		page.nextCursor.length > 0
	) {
		return page.nextCursor;
	}
	return undefined;
}

function nextPageFrom(envelope: PageEnvelope): number | undefined {
	const page = envelope.data?.page;
	if (page?.hasMore === true && typeof page.nextPage === "number") {
		return page.nextPage;
	}
	return undefined;
}

/**
 * True when the page returned no results: `data` carries result arrays and
 * every one of them is empty. Shapes without any array are treated as
 * non-empty so an unfamiliar envelope never truncates results.
 */
export function isEmptyPage(envelope: PageEnvelope | undefined): boolean {
	const data = envelope?.data;
	if (!data || typeof data !== "object") return false;
	let sawArray = false;
	for (const [key, value] of Object.entries(data)) {
		if (key === "page" || !Array.isArray(value)) continue;
		if (value.length > 0) return false;
		sawArray = true;
	}
	return sawArray;
}

/**
 * Fetches every page of a Social Fetch list, one envelope per page.
 *
 * Cursor lists follow `data.page.nextCursor` and page lists follow
 * `data.page.nextPage`, while `hasMore` is true. Some lists return a short
 * or empty page and still have more (for example TikTok profile videos
 * without pinned videos), so an empty page alone doesn't stop it; it stops
 * after {@link MAX_EMPTY_PAGES_IN_A_ROW} empty pages in a row, when a cursor
 * or page number repeats, or after {@link MAX_RETURN_ALL_PAGES} pages.
 */
export async function fetchAllPages(
	kind: PaginationKind,
	fetchPage: (
		continuation: Record<string, string | number>,
	) => Promise<PageEnvelope>,
): Promise<PageEnvelope[]> {
	const pages: PageEnvelope[] = [];
	const seen = new Set<string | number>();

	let envelope = await fetchPage({});
	pages.push(envelope);
	let emptyInARow = isEmptyPage(envelope) ? 1 : 0;

	while (
		pages.length < MAX_RETURN_ALL_PAGES &&
		emptyInARow < MAX_EMPTY_PAGES_IN_A_ROW
	) {
		const next =
			kind === "cursor" ? nextCursorFrom(envelope) : nextPageFrom(envelope);
		if (next === undefined || seen.has(next)) break;
		seen.add(next);
		envelope = await fetchPage(
			kind === "cursor" ? { cursor: next } : { page: next },
		);
		pages.push(envelope);
		emptyInARow = isEmptyPage(envelope) ? emptyInARow + 1 : 0;
	}

	return pages;
}
