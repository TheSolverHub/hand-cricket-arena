HAND CRICKET ARENA — V33 POSTGRES ACCOUNT PERSISTENCE

What changed
- Player accounts are now persisted in PostgreSQL when DATABASE_URL is configured.
- On startup, the server creates an accounts table automatically.
- Existing players.json accounts are migrated into PostgreSQL if the PostgreSQL table is empty.
- On later startups, PostgreSQL is the source of truth and restores accounts into memory.
- Account changes are mirrored to PostgreSQL through a serialized persistence queue.
- /health reports persistence: postgres or file.
- Local players.json remains as a compatibility/cache copy; it is not the production source when PostgreSQL is enabled.
- Added pg dependency.
- render.yaml now provisions a Render Postgres database and wires DATABASE_URL using fromDatabase.

Render deployment
1. Push this version to the GitHub repository connected to Render.
2. If using the included Blueprint, Render will provision the PostgreSQL database and inject DATABASE_URL.
3. If your existing Render service is not managed by this Blueprint, create/connect a Render Postgres database and add DATABASE_URL in the service Environment using the database's INTERNAL connection string.
4. Redeploy.
5. Open /health. It should show persistence: postgres.

Important
- Use Render's INTERNAL connection string for a Render-hosted service in the same region. Render documents that the internal URL is the preferred private-network connection.
- Do not put the database password directly in GitHub.
- The Blueprint database is named hand-cricket-arena-db. If a database with that exact name already exists in the same Blueprint/workspace, reuse it rather than creating a duplicate.
- This version makes player/account data durable across normal deploys/restarts. Room state, active WebSocket sessions, and live matches remain in memory and are intentionally not persistent across a service restart.
