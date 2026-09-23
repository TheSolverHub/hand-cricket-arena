HAND CRICKET ARENA — UNLIMITED MULTIPLAYER PRO V26

V26 adds a real Forgot Password / password-recovery workflow to the V25 Owner SHIVAM123 build.

LOGIN
- Login now shows the exact authentication error without incorrectly appending “server चलाकर try करें” to normal 401 credential errors.
- A network/server failure is reported separately.

FORGOT PASSWORD FLOW
1. On the Login tab, press “Forgot Password?”.
2. Enter the registered email/phone and Game ID.
3. A password-reset request is created for the Admin Team.
4. The Admin verifies the player and approves the request.
5. Admin receives a one-time 6-digit reset code valid for 15 minutes.
6. Admin securely gives that code to the player.
7. Player enters the code and a new password in the Forgot Password panel.
8. After successful reset, the player can log in with the new password.

SECURITY
- Passwords remain stored as SHA-256 hashes, not plain text.
- Reset codes are stored as hashes and expire after 15 minutes.
- A used reset request cannot be reused.
- Existing login sessions for the reset account are invalidated after a successful reset.
- The reset request file is blocked from direct web access.
- No email/SMS provider is required for this V26 flow; the Admin Team verifies the player and securely provides the temporary reset code.

ADMIN
- Open /admin while signed into a normal approved admin account.
- The Admin Control Center now includes “Password Reset Requests”.
- Verify the player before approving.
- Approving generates the one-time code; share it securely with the player.
- Reject requests that cannot be verified.

OWNER
- Owner Game ID remains SHIVAM123 in admin_team.json.

RUN LOCALLY
1. npm install
2. npm start
3. Open http://localhost:3000

PRODUCTION
- Deploy the server to Render (or another Node.js host).
- Keep the same server-side account database and reset-request storage.
- No CMD/npm commands are required for normal players after deployment; they use the online game URL.
