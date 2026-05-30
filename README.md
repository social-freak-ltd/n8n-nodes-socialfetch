# n8n-nodes-socialfetch

This is an [n8n](https://n8n.io) community node that lets you fetch real-time social media and web data using the [SocialFetch API](https://www.socialfetch.dev).

It exposes a single **SocialFetch** node with one resource per platform (TikTok, Twitter/X, Telegram, Facebook, Instagram, Threads, LinkedIn, Reddit, Spotify, YouTube, Web) plus account operations under **Account** (Whoami, Balance). Each operation maps directly to a SocialFetch public API endpoint.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) · [Example](#example-workflow) · [Development](#development) · [Publishing](PUBLISHING.md)

## Installation

Follow the [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) and install the npm package `n8n-nodes-socialfetch`.

## Credentials

You need a SocialFetch API key (it starts with `sfk_`). Create one in your [SocialFetch dashboard](https://www.socialfetch.dev).

In n8n, create a new **SocialFetch API** credential and paste your key. The credential is validated against `GET /v1/whoami` when you save it.

## Operations

Pick a **Resource** (platform) and an **Operation**. Required inputs appear as direct fields; optional inputs live under **Additional Fields**.

### Pagination and “Return All”

Only list endpoints that use SocialFetch’s **cursor** query parameter show a **Return All** toggle. When enabled, the node follows `data.page.nextCursor` until `data.page.hasMore` is false. Each page is a separate output item containing the full API JSON body (`data`, `meta`, etc.). Use n8n’s **Item Lists** or **Code** node if you need a single merged array.

List endpoints that return everything in one response (no cursor), or that paginate with other parameters such as `page`, do not show **Return All**—you get the first response only unless you pass those parameters under **Additional Fields**.

Every request consumes credits from your SocialFetch balance (most endpoints cost 1 credit; some search and media-download options cost more). The credits charged for each call are returned in `meta.creditsCharged`.

## Example workflow

This example fetches a TikTok creator's recent videos and keeps only the high-performing ones.

1. **Manual Trigger** — start the workflow manually for testing.
2. **SocialFetch** — set **Resource** to `TikTok` and **Operation** to `Profile videos`.
   - **Handle**: `n8n`
   - Turn on **Return All** to page through every video, or leave it off to fetch the first page.
   - Under **Additional Fields**, set **Sort By** to `Popular`.
3. **Split Out** — field to split out: `data.videos` (one item per video).
4. **Filter** — keep videos above a view threshold:
   - Condition: `{{ $json.stats.views }}` _is greater than_ `100000`.

Each SocialFetch item is one API page. With **Return All** off you get a single page; with it on you get one item per page, each containing `data.videos`, `data.page`, and `meta`. **Split Out** turns the videos array into individual items so the Filter node can evaluate `stats.views` on each video.

Example response shape (first video on a page):

```json
{
  "data": {
    "videos": [
      {
        "id": "7639528062975053069",
        "caption": "…",
        "url": "https://www.tiktok.com/@handle/video/7639528062975053069",
        "stats": {
          "views": 302447,
          "likes": 19880,
          "comments": 339,
          "shares": 2232,
          "saves": 389
        }
      }
    ],
    "page": { "nextCursor": "…", "hasMore": true }
  },
  "meta": { "creditsCharged": 1, "requestId": "…", "version": "v1" }
}
```

A second common pattern is enrichment: use **TikTok → User search** (or **Search videos**) to discover handles, then loop those results back into **Profile videos** or **Profile** to pull full details for each match.

## Development

The node descriptions are generated from the SocialFetch OpenAPI spec.

```bash
# from the repo root (codegen + eslint fix on generated descriptions)
pnpm generate:n8n

# full derived check before a PR (openapi, sdk, zapier, n8n, …)
pnpm check:derived

# local dev (standalone pnpm project — not part of the root pnpm workspace)
cd integrations/n8n
pnpm install --ignore-workspace
pnpm run build
pnpm run dev   # http://localhost:5678
```

`generate:n8n` syncs the package **version** from `@socialfetch/sdk`, regenerates descriptions, and runs `lint:fix`. `check:derived` also runs `check:n8n` (install, lint, build).

Releases and syncing to [n8n-nodes-socialfetch](https://github.com/social-freak-ltd/n8n-nodes-socialfetch) are automated from the monorepo — see [PUBLISHING.md](PUBLISHING.md).

## License

[MIT](./LICENSE)
