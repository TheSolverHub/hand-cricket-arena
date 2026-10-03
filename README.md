# Hand Cricket Arena — Clean Release

Player authentication is Google Sign-In only. OTP UI is removed. Admin is separate at `/admin`.

Backend: Cloudflare Worker + Durable Object + D1. Frontend: Firebase Hosting.

Multiplayer: Limited Overs supports creator-selected 1–10 overs and 1–10 wickets. Test Match requires 20–90 overs. Per-ball timer supports 20/25/30/35/30+5/40/40+5/45 seconds; result-to-next-ball delay is 5 seconds. Max players per room: 2/4/6/8. Weekly Championship is Saturday 07:00 PM IST to Sunday 10:00 PM IST, 12 overs / 10 wickets / 30s, 7 playing + 2 reserve, 4–64 teams.

Deployment:
1. Keep the existing D1 users table. Apply schema.sql.
2. Set SESSION_SECRET with `npx wrangler secret put SESSION_SECRET`.
3. Deploy Worker using `npx wrangler deploy --config ./wrangler-worker.toml`.
4. Deploy Firebase Hosting using `firebase deploy --only hosting`.
