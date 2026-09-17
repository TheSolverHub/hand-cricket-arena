HAND CRICKET ARENA — V14 FREE + SUBSCRIBER / ADMIN CONTROL

WHAT CHANGED
- First screen is now an access portal: User Login/Create Account or Admin Login.
- User and Admin are separated. Admin dashboard is /admin and API data is protected by ADMIN_KEY.
- User home now has Multiplayer, Settings, Rewards and Help & Support shortcuts.
- Multiplayer lobby lets the user choose Limited Overs or Test Match before creating a room.
- Limited Overs lets the creator choose 1–50 overs. Multiplayer Test Match uses four innings and can enforce follow-on after a 200-run first-innings lead.
- WebSocket auto-detection is improved; when HTML is opened as file://, use ws://localhost:3000 in Server Connection and run npm start.
- Accounts have role + subscription metadata.
- Owner accounts can have permanent free Premium through OWNER_GAME_ID or ADMIN dashboard owner entitlement.
- Admin can view Free / Active Subscriber / Expired / Owner counts and player details.
- Admin can grant promotional/testing Premium for a selected number of days, revoke Premium, and make an account OWNER.
- Subscription expiry is checked server-side and automatically falls back to Free.
- Google Play purchase verification is NOT live yet. The Admin Verify/production flow still requires a real Google Play Billing backend and service credentials.
- Google sign-in button remains a configuration placeholder. Real Google account selector needs Google OAuth/Firebase setup.
- Phone OTP requires Firebase/OTP provider setup.

OWNER SETUP
Set environment variables on the server:
ADMIN_KEY=your-secret-admin-key
OWNER_GAME_ID=YOUR_GAME_ID
OPTIONAL OWNER_EMAIL=your@email.com

If an existing account has the matching OWNER_GAME_ID or OWNER_EMAIL, its role is treated as OWNER and it receives Premium without payment. A new account matching those values is also assigned OWNER at registration.

ADMIN
Open /admin. Enter ADMIN_KEY. Keep the key private. The player app never receives the admin key.

LOCAL TEST
1. npm install
2. Set ADMIN_KEY and OWNER_GAME_ID in the environment.
3. npm start
4. Open http://localhost:3000
5. Create/login as user.
6. Open Multiplayer and create a room. For a file:// HTML launch, enter ws://localhost:3000.
7. Open http://localhost:3000/admin in another tab and use the Admin Key.

GOOGLE PLAY SUBSCRIPTIONS
For production, the intended flow is:
Google Play purchase -> purchase token -> backend verification -> ACTIVE entitlement -> Game ID Premium.
Do not manually mark a real customer as paid merely from a button click. Admin Grant is intended for promotions/testing; real purchases should be verified with Google Play on the backend.
