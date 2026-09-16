HAND CRICKET ARENA — UNLIMITED MULTIPLAYER PRO v2

FEATURES IN THIS BUILD
- Player account / permanent Player ID using email OR phone + password.
- Server-side account storage (players.json) with SHA-256 password hashes. No OTP/email verification is included.
- Unlimited-player multiplayer rooms with Team A / Team B, captain, kick/ban, lobby + match chat, spectators and rotating active players.
- Room join/create now requires the authenticated player token, preventing the old anonymous join flow from causing identity/session conflicts.
- Live multiplayer scoreboard, ball-by-ball scorecard, automatic MOM calculation and CSV download.
- Local Quick/Test match scorecard, MOM and CSV download.
- Commentary voice uses browser SpeechSynthesis; no external voice file is required.
- Distinct 0–6 button sound effects are generated locally with Web Audio.
- Tournament has been moved into the Multiplayer area. Tournament Hub includes team setup, auction/purse, fixtures, match records and automatic standings/stat updates from recorded multiplayer matches.

LOCAL RUN
1. Install Node.js 18+
2. Open this folder in CMD/Terminal
3. npm install
4. npm start
5. Open http://localhost:3000
6. Create your Player ID first, then use Multiplayer.

RENDER / GITHUB
1. Upload the CONTENTS of this folder to GitHub (do not upload node_modules).
2. In Render, create a Web Service from the GitHub repository.
3. Build Command: npm install
4. Start Command: npm start
5. Render supplies PORT automatically.
6. Open the HTTPS URL Render gives you. Multiplayer automatically uses WSS on HTTPS.

IMPORTANT
- GitHub Pages alone cannot run server.js/WebSockets or the account API. Use Render or another Node/WebSocket host.
- players.json is created by the server and should be treated as private server data. For a production deployment, use a real database and a proper password/KDF system such as Argon2/bcrypt plus HTTPS, rate limiting and OTP/email verification.
- Browser speech commentary depends on the user's browser/OS speech engine. If speech is unavailable, the visual commentary still works.
