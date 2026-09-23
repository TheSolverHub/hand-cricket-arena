Hand Cricket Arena Unlimited Multiplayer PRO - V31

CORE FIXES
1. Fixed session authentication: the server previously stored playerId in the session but auth() returned the raw playerId string. Admin APIs expected the account object, which caused Admin access failures; Multiplayer account handling was also inconsistent.
2. Multiplayer player records now use the authenticated account's real playerId and name consistently.
3. Room reconnect/join matching now uses the real playerId.
4. Room creator is the only player allowed to START MATCH.
5. START MATCH no longer depends on Ready flags. The creator only needs at least one Team A player and one Team B player.
6. Limited Overs remains two innings and the server broadcasts a ball event after every resolved ball with ballHistory in state.
7. Multiplayer connection errors now show the actual WebSocket endpoint being attempted.

RENDER
Build: npm install
Start: npm start
If the page is served by the same Render service over HTTPS, the client automatically uses wss://<same-host>.

IMPORTANT
This build has been syntax-checked. Full live Render WebSocket testing requires the deployed Render service URL and cannot be honestly claimed from this local environment.
