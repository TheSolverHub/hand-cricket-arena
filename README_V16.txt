HAND CRICKET ARENA — V16 UI / MULTIPLAYER STRUCTURE

WHAT CHANGED
- Page 1 is account-only login/register entry.
- After login, Page 2 is a compact Player Dashboard with Game ID, runs, wickets, matches and wins.
- PLAY section has Quick Match (vs Computer) and Multiplayer.
- Quick Match opens Limited Overs / Test Match choices.
- Multiplayer is compact: Lobby + top-right + button for Create Room.
- Multiplayer rooms are separated into Non-Subscription and Subscription tabs.
- Premium rooms require an active Premium account to create/join.
- Room creation carries Limited Overs/Test selection.
- Multiplayer teams support up to 15 playing players per team.
- Existing lobby/team boxes, team-name editing, roles, chat, voice, emoji and active-player controls remain.
- Admin page bug fixed: /admin now opens the login page; X-Admin-Key is checked only by admin APIs.

ADMIN LOCAL START
Windows PowerShell:
  cd path\to\project
  npm install
  $env:ADMIN_KEY="HCA-ADMIN-CHANGE-THIS"
  npm start
Then open http://localhost:3000/admin and enter the same key.

IMPORTANT
- For production, use a strong ADMIN_KEY in the hosting provider's environment variables.
- Real Google account login and real phone OTP still require OAuth/Firebase provider configuration.
- Emoji currently have distinct spoken phrases through browser speech synthesis. For real human MP3 sounds, provide 20 audio files and they can be mapped one-to-one.
