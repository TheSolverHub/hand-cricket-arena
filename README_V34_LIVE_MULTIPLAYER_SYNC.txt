HAND CRICKET ARENA — V34 LIVE MULTIPLAYER SYNC

This build uses the existing V33 Node/WebSocket game as the base and adapts the useful multiplayer ideas from the supplied feature blueprint.

PRIMARY FIXES
1. Server-authoritative live event sequence (`seq`) for state and ball events.
2. Every resolved ball is broadcast immediately with the exact ball object plus the full live state snapshot.
3. Clients ignore stale WebSocket state/ball packets, preventing an older packet from overwriting a newer score.
4. Reconnect support: if a player loses the WebSocket during a room/match, the client automatically reconnects and rejoins the same room using the logged-in account token.
5. Server heartbeat keeps dead WebSocket connections from remaining stuck.
6. Room/team/role model remains intact: creator controls team assignment, Management/Official, Referee, Commentator, Player, Kick and Ban.
7. Ball-by-ball feed and scorecard continue to use server-side ballHistory/playerStats.

LIVE BALL FLOW
- Batter and bowler submit 0–6 to the server.
- Server resolves the ball.
- Server records the ball in ballHistory.
- Server increments a live sequence number.
- Server immediately sends one `ball` WebSocket event containing:
  event, seq, exact ball object, and authoritative state.
- Every connected client renders the score, commentary and ball-by-ball feed from that event.

IMPORTANT
- This ZIP is code-validated with `node --check` for server.js and all inline JavaScript blocks in Hand_Cricket_Arena.html.
- A full npm install/live WebSocket/Render deployment test was not completed in this environment because dependency installation timed out.
- Therefore this build should be tested on the actual Render deployment with two browser/device sessions before calling it production-live.

DEPLOYMENT
Build: npm install
Start: npm start
Health: /health

If the game page and multiplayer server are hosted on the same HTTPS Render service, the browser automatically uses wss://<same-host> for WebSocket multiplayer.

ACCOUNT STORAGE
- If DATABASE_URL is configured, PostgreSQL persistence is used.
- Without DATABASE_URL, the game falls back to players.json.
