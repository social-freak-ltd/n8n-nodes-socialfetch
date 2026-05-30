# Publishing to npm

This repository is the **public home** of `n8n-nodes-socialfetch`. npm packages must be published from here (with provenance), not from the private SocialFetch monorepo.

## One-time setup

### 1. npm Trusted Publisher (recommended)

1. Sign in at [npmjs.com](https://www.npmjs.com).
2. Create the package name `n8n-nodes-socialfetch` if it does not exist yet (first publish can also create it via the workflow below).
3. Open **package → Settings → Publish access → Trusted Publishers → Add publisher**.
4. Choose **GitHub Actions** and set:
   - **Repository owner:** `social-freak-ltd`
   - **Repository name:** `n8n-nodes-socialfetch`
   - **Workflow filename:** `publish.yml` (the file name only, not the workflow `name:`)
   - **Environment:** leave blank

No `NPM_TOKEN` secret is required when Trusted Publishing is configured.

### 2. Fallback: npm token

If you prefer a token, create a granular access token on npm with publish rights for this package, then add a GitHub Actions secret named `NPM_TOKEN`.

## Releasing a new version

1. Sync source from the monorepo (`socialfetch` → `integrations/n8n/`), excluding `node_modules` and `dist`.
2. Bump `"version"` in `package.json` (semver).
3. Commit and push to `main`.
4. Create and push a tag that **matches the version** (no `v` prefix):

```bash
git tag 0.1.0
git push origin main
git push origin 0.1.0
```

5. The [Publish workflow](.github/workflows/publish.yml) runs `pnpm run release` (lint, build, publish with provenance).

Check the run on GitHub → **Actions** → **Publish**.

## Local development

```bash
pnpm install
pnpm run lint:fix
pnpm run build
pnpm run dev
```

Node descriptions are generated in the private monorepo (`pnpm generate:n8n`); commit the updated `nodes/SocialFetch/descriptions/*.generated.ts` files here when syncing.

## n8n verification

After the package is on npm with provenance, submit it in the [n8n Creator Portal](https://docs.n8n.io/integrations/creating-nodes/deploy/submit-community-nodes/).
