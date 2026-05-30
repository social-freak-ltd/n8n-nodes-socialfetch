# n8n-nodes-socialfetch

This is an [n8n](https://n8n.io) community node that lets you fetch real-time social media and web data using the [SocialFetch API](https://www.socialfetch.dev).

It exposes a single **SocialFetch** node with one resource per platform (TikTok, Twitter/X, Telegram, Facebook, Instagram, Threads, LinkedIn, Reddit, Spotify, YouTube, Web) plus account operations under **Account** (Whoami, Balance). Each operation maps directly to a SocialFetch public API endpoint.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) · [Development](#development) · [Publishing](PUBLISHING.md)

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

## Development

```bash
pnpm install
pnpm run lint:fix
pnpm run build
pnpm run dev   # local n8n at http://localhost:5678 with this node loaded
```

Source of truth for API coverage lives in the [SocialFetch](https://github.com/social-freak-ltd/socialfetch) monorepo (`integrations/n8n/`). Sync generated description files from there when the public API changes.

## License

[MIT](./LICENSE)
