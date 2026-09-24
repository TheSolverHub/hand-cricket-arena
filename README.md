# Hand Cricket Arena — V38.1 Complete Package

This build keeps the existing V38 Google Sign-In, multiplayer, live ball-by-ball and accessibility work and adds:

- 💎 Membership: coin tiers + membership status; Premium-room access is synced with active membership.
- ✅ Name Verification: ₹50 verification request flow. Real-money confirmation is intentionally not auto-approved on the web.
- 🎁 Launch Offer: first 200 registered users, with the supplied four launch tiers.
- 🏆 Weekend Championship: Saturday 7 PM IST registration, 140-player cap, minimum 28 players, 7-player teams, 15 overs, 25-second ball timer and 5,000-coin prize metadata.
- 🔊 Existing V38 audio implementation is preserved; no opening-sound behavior was intentionally changed by this feature integration.

## Render

Build command: `npm install`
Start command: `npm start`

For Google Sign-In on the server, configure `FIREBASE_SERVICE_ACCOUNT` as the Firebase Admin service-account JSON. The existing V38 Firebase web configuration flow remains in the game.

Real-money membership/name-verification purchases require verified Google Play Billing in the Android app; the web server does not mark unpaid purchases as successful.
