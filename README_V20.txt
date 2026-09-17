HAND CRICKET ARENA V20

V20 updates:
- Cricket-style Multiplayer Ball-by-Ball Live panel.
- Current over displays exactly 6 balls: Ball 1 through Ball 6.
- Each ball shows result: 0-6 or W (wicket).
- Over history is grouped by innings and over.
- Batter and bowler are shown with the over.
- Live feed uses the existing server ballHistory and WebSocket state.
- 0-6 multiplayer buttons are forced into ONE horizontal row on mobile and desktop.
- 0-6 local Quick Match buttons are also forced into ONE horizontal row.
- Server-based Admin Announcement API persists to announcement.json.
- Admin can Save Announcement / Disable Announcement.
- Player dashboard loads the server announcement.
- START_SERVER.bat provides one-click local server start with the default development ADMIN_KEY.

APP UPDATE ARCHITECTURE:
- Recommended Android approach: build a thin Android WebView app that loads the Render HTTPS URL.
- If game HTML/JS/UI is hosted on Render, web game updates can be deployed to Render without publishing a new Play Store binary for every UI/game-code change.
- Native Android changes (permissions, WebView wrapper, billing integration, native notifications, etc.) require a new Android App Bundle release.
- Google Play updates are delivered using the same application ID/signing identity and a higher version code.
