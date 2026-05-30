# Publishing `n8n-nodes-socialfetch`

This folder is the **source of truth** for the npm package. The public repo [social-freak-ltd/n8n-nodes-socialfetch](https://github.com/social-freak-ltd/n8n-nodes-socialfetch) is a mirror used only because npm **provenance** must be built from that public repository.

## What lives where

| Item | Monorepo (`integrations/n8n/`) | Public repo | Monorepo workflows |
|------|-------------------------------|-------------|-------------------|
| Node source, credentials, generated descriptions | Yes | Synced automatically | — |
| `package.json` (version, `publishConfig`, …) | **Edit here** | Synced | — |
| `scripts/generate-from-openapi.mts` | Yes | Not synced | — |
| `.github/workflows/ci.yml` + `publish.yml` | Kept as reference | **Owned by public repo** — not synced | — |
| Pre-merge validation | — | — | **Validate n8n node** |
| Push mirror without npm release | — | Synced | **Sync n8n public mirror** |
| Release to npm | — | `publish.yml` on tag | **Publish n8n node** |

## One-time GitHub setup

Add a repository secret on the **private** `socialfetch` repo:

| Secret | Value |
|--------|--------|
| `N8N_PUBLIC_REPO_TOKEN` | Fine-grained PAT or machine token with **Contents: Read and write** on `social-freak-ltd/n8n-nodes-socialfetch` |

npm **Trusted Publisher** stays on the public package → workflow file **`publish.yml`** (already configured).

The sync **does not** touch `.github/workflows/**` in the public repo — those files are authoritative there. So the token needs only **Contents** write, not **Workflows** write, and the publish pipeline can never be clobbered by a sync.

### Safety guards in the sync

`scripts/sync-public-mirror.sh` refuses to run unless the destination is a git clone whose `origin` is `social-freak-ltd/n8n-nodes-socialfetch`, excludes `.git` from `rsync --delete`, and both workflows re-check the push remote before pushing. This makes it impossible for the sync to write to or push into the private monorepo.

If **Publish n8n node** ever fails with `403` on `socialfetch` and commit paths look like `mirror/...`, an older sync deleted the clone's `.git`. The current script prevents this; merge the latest workflows and re-run. Nothing is pushed to either repo when the guards trip — they fail before any push.

## Day-to-day: API changes (no npm release yet)

1. Implement API + update `public-api-endpoint-metadata.ts` + OpenAPI (same as SDK).
2. From the monorepo root: `pnpm generate:derived` (includes `generate:n8n` + lint:fix) or `pnpm check:derived` before opening a PR.
3. Commit to the monorepo (including `descriptions/*.generated.ts`).
4. Merge to `main`.
5. Run **Sync n8n public mirror** in GitHub Actions (or locally, see below).

## Releasing a new npm version (like Publish SDK)

1. Bump `"version"` in **`packages/sdk/package.json`** (same as a normal SDK release). Run `pnpm generate:n8n` or `pnpm generate:derived` so **`integrations/n8n/package.json`** picks up that version automatically.
2. Commit and merge to `main`.
3. GitHub → **Actions** → **Publish n8n node** → **Run workflow** (on `main`).

The workflow will:

- Fail if that version is already on npm (same guard as Publish SDK).
- Verify generated descriptions are committed.
- Lint and build the package.
- Sync to the public repo and push `main`.
- Push git tag `x.y.z` (no `v` prefix).
- The public repo’s **Publish** workflow publishes to npm with provenance.

## Local development

```bash
pnpm generate:n8n

cd integrations/n8n
pnpm install --ignore-workspace
pnpm run lint:fix
pnpm run build
pnpm run dev
```

### Local sync to your public clone (optional)

```bash
bash integrations/n8n/scripts/sync-public-mirror.sh /path/to/n8n-nodes-socialfetch
cd /path/to/n8n-nodes-socialfetch
git add -A && git commit -m "sync from monorepo" && git push
# To release: bump package.json version, tag, and push the tag
git tag 0.2.0 && git push origin 0.2.0
```

## What gets synced

Everything under `integrations/n8n/` **except**:

- `node_modules/`
- `dist/`
- `scripts/` (OpenAPI codegen stays in the monorepo)

Included: `package.json`, `pnpm-lock.yaml`, `.github/`, `nodes/`, `credentials/`, docs, etc.

## Why two repos?

npm provenance for n8n community nodes must attest that the package was built from the public package repository. Automation keeps the mirror in sync so you never copy files in Explorer again.
