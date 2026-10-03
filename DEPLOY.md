# Hand Cricket Arena — Deployment

## 1. Cloudflare Worker + D1

From this folder:

```bash
npm install
npx wrangler login
npx wrangler d1 execute hand-cricket-db --remote --file=./schema.sql --config ./wrangler-worker.toml
npx wrangler secret put SESSION_SECRET --config ./wrangler-worker.toml
npx wrangler deploy --config ./wrangler-worker.toml
```

Do not create a new D1 database unless you intentionally update `wrangler-worker.toml` with its new database ID.

## 2. Firebase Hosting

Install Firebase CLI if needed:

```bash
npm install -g firebase-tools
firebase login
```

Select the existing Firebase project:

```bash
firebase use --add
```

Choose project `hand-cricket-arena-a040d`, then deploy:

```bash
firebase deploy --only hosting
```

The Hosting site should use `index.html` as the public game entry point and `/admin` for `admin.html`.

## 3. Important

- `SESSION_SECRET` is a Cloudflare secret and is intentionally not stored in this ZIP.
- Never commit `.wrangler/`, `node_modules/`, or secret files.
- The Worker config uses the existing D1 database ID and Firebase project ID from the original project.
