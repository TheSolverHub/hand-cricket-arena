HAND CRICKET ARENA — UNLIMITED MULTIPLAYER PRO

RENDER / GITHUB READY

Local run:
1. Install Node.js 18+
2. Open this folder in CMD/Terminal
3. npm install
4. npm start
5. Open http://localhost:3000

Render deployment:
1. Upload the CONTENTS of this folder to a GitHub repository (do not upload node_modules).
2. In Render, create a Web Service from the GitHub repository.
3. Build Command: npm install
4. Start Command: npm start
5. Render supplies PORT automatically.
6. Open the HTTPS URL Render gives you. The game automatically uses WSS on HTTPS, so players do not need to enter a server URL.

The /health endpoint can be used by Render for health checks.

IMPORTANT:
- GitHub Pages alone cannot run server.js/WebSockets. Use Render (or another Node/WebSocket host) for the multiplayer server.
- Do not commit node_modules.
- For a production public game, use a persistent/appropriate server plan as player counts increase.
