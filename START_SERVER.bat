@echo off
cd /d "%~dp0"
set "OWNER_GAME_ID="
set "ADMIN_TEAM_IDS="
set "ADMIN_PIN=1234"
echo Starting Hand Cricket Arena V21...
echo Admin: Game ID + short Team PIN (Admin Team only)
npm start
pause
