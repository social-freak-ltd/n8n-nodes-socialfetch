# n8n-nodes-socialfetch

The [Social Fetch](https://www.socialfetch.dev) community node for [n8n](https://n8n.io). Fetch live social media and web data in your workflows and AI agents: profiles, posts, videos, comments, transcripts, search results and ads from TikTok, Instagram, YouTube, X (Twitter), Facebook, LinkedIn, Reddit and more.

**Full guides:** [socialfetch.dev/docs/integrations/n8n](https://www.socialfetch.dev/docs/integrations/n8n) · [Your first workflow](https://www.socialfetch.dev/docs/integrations/n8n/first-workflow) · [Templates](https://www.socialfetch.dev/docs/integrations/n8n/templates) · [Troubleshooting](https://www.socialfetch.dev/docs/integrations/n8n/troubleshooting)

[Installation](#installation) · [Credentials](#credentials) · [Nodes](#nodes) · [Development](#development) · [Publishing](PUBLISHING.md)

## Installation

Social Fetch is a verified community node. In n8n, open the nodes panel, search for **Social Fetch** and click **Install node** (owner or admin only). On a self-hosted instance you can also install the npm package `n8n-nodes-socialfetch` from **Settings → Community nodes**. See n8n's [community nodes guide](https://docs.n8n.io/integrations/community-nodes/installation/).

## Credentials

Create an API key (it starts with `sfk_`) in [Social Fetch API Keys](https://app.socialfetch.dev/api-keys). In n8n, create a **Social Fetch API** credential and paste the key. n8n checks it against `GET /v1/whoami` when you save.

## Nodes

### Social Fetch

One node with a **Resource** per platform and an **Operation** per Social Fetch endpoint. The operation's main input (a handle, URL or query) is on the node; optional inputs are under **Additional Fields**. Every operation is listed in the [operation catalog](https://www.socialfetch.dev/docs/integrations/n8n/operations).

- **Simplify** (on by default) returns one item per result: one item per video, post or comment. Turn it off for the full response, including `data.page` and `meta.creditsCharged`.
- **Return All** follows the API's pages (`data.page.nextCursor` or `data.page.nextPage`) until there are no more, up to 100 pages. Each page is a request and uses credits.
- **Errors** explain what went wrong and what to do (for example an invalid key or an empty balance), with the request ID linked to the Social Fetch request log. Failed lookups aren't charged; turn on **Retry On Fail** for unattended workflows.
- **Usable as a tool** for n8n's AI Agent.

Node version 2 is the default for new nodes. Version 1 nodes keep their original behaviour (the full response, one item per page, most inputs under Additional Fields) so existing workflows don't change when you update the package.

### Social Fetch Trigger

Starts a workflow when a watched account, channel, subreddit or search has a new post (TikTok, Instagram, YouTube, X, LinkedIn and Reddit). Publishing the workflow creates a Social Fetch [monitor](https://www.socialfetch.dev/docs/monitors) that checks on your schedule and delivers signed events to the trigger; unpublishing deletes it. Testing in the editor sends a sample event within seconds. Each check uses credits.

The trigger needs n8n to be reachable at a public `https://` address on port 443 (n8n Cloud is). Guide: [Watch for new posts](https://www.socialfetch.dev/docs/integrations/n8n/watch-for-new-posts).

## Development

The node is generated from the Social Fetch OpenAPI spec and endpoint metadata. Labels follow n8n's [UX guidelines](https://docs.n8n.io/integrations/creating-nodes/build/reference/ux-guidelines/) (see `scripts/n8n-label-formatting.mts`).

| File | What it is |
| --- | --- |
| `scripts/generate-from-openapi.mts` | Writes `nodes/SocialFetch/descriptions/*.generated.ts` (UI, operations table, trigger sources) and the docs catalog `apps/web/content/docs/integrations/n8n/operations.mdx` |
| `scripts/build-templates.mts` | Writes the importable workflow templates to `apps/web/public/integrations/n8n/workflows/` |
| `nodes/SocialFetch/SocialFetch.node.ts` | Runs operations from the generated table (`shared/request.ts`, `shared/pagination.ts`, `shared/errors.ts`) |
| `nodes/SocialFetch/SocialFetchTrigger.node.ts` | Monitor-backed webhook trigger |

```bash
# from the repo root: version sync, codegen, templates, lint:fix
pnpm generate:n8n

# unit and generated-output tests (in tests/integrations/n8n)
pnpm test:n8n

# tests, lint and build for this package
pnpm check:n8n

# local n8n with the node loaded (standalone pnpm project, not in the root workspace)
cd integrations/n8n
pnpm install --ignore-workspace
pnpm run build
pnpm run dev   # http://localhost:5678
```

Releases and the public mirror ([n8n-nodes-socialfetch](https://github.com/social-freak-ltd/n8n-nodes-socialfetch)) are automated from the monorepo. See [PUBLISHING.md](PUBLISHING.md).

## License

[MIT](./LICENSE)
