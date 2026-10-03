-- Hand Cricket Arena V20 D1 schema
CREATE TABLE IF NOT EXISTS users (
 uid TEXT PRIMARY KEY, game_id TEXT UNIQUE NOT NULL, name TEXT, email TEXT, photo_url TEXT,
 coins INTEGER DEFAULT 0, role TEXT DEFAULT 'USER', membership_status TEXT DEFAULT 'NONE',
 membership_expires INTEGER, membership_source TEXT, name_verified INTEGER DEFAULT 0,
 launch_position INTEGER, launch_discount INTEGER DEFAULT 0, launch_claimed INTEGER DEFAULT 0,
 stats_matches INTEGER DEFAULT 0, stats_wins INTEGER DEFAULT 0, stats_runs INTEGER DEFAULT 0,
 stats_wickets INTEGER DEFAULT 0, stats_highest INTEGER DEFAULT 0, created_at INTEGER, last_login INTEGER
);
CREATE INDEX IF NOT EXISTS idx_users_game_id ON users(game_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_runs ON users(stats_runs DESC);
CREATE INDEX IF NOT EXISTS idx_users_wickets ON users(stats_wickets DESC);

CREATE TABLE IF NOT EXISTS admin_requests(uid TEXT PRIMARY KEY,game_id TEXT,name TEXT,email TEXT,photo_url TEXT,message TEXT,status TEXT DEFAULT 'PENDING',requested_at INTEGER,approved_at INTEGER,approved_by TEXT,rejected_at INTEGER,reason TEXT);
CREATE TABLE IF NOT EXISTS admin_config(id INTEGER PRIMARY KEY CHECK(id=1),password_hash TEXT,password_salt TEXT,updated_at INTEGER);
INSERT OR IGNORE INTO admin_config(id) VALUES(1);
CREATE TABLE IF NOT EXISTS admin_sessions(token_hash TEXT PRIMARY KEY,uid TEXT,role TEXT,expires_at INTEGER,created_at INTEGER);
CREATE TABLE IF NOT EXISTS admin_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,uid TEXT,action TEXT,target TEXT,details TEXT,created_at INTEGER);
CREATE TABLE IF NOT EXISTS announcements(id INTEGER PRIMARY KEY CHECK(id=1),text TEXT,enabled INTEGER DEFAULT 1,updated_at INTEGER,updated_by TEXT);
INSERT OR IGNORE INTO announcements(id,text,enabled) VALUES(1,'',0);

CREATE TABLE IF NOT EXISTS matches(id TEXT PRIMARY KEY,room_id TEXT,match_type TEXT,team_a TEXT,team_b TEXT,winner_team TEXT,innings1_team TEXT,innings1_score INTEGER DEFAULT 0,innings2_team TEXT,innings2_score INTEGER DEFAULT 0,created_at INTEGER,finished_at INTEGER,potm_user_id TEXT);
CREATE INDEX IF NOT EXISTS idx_matches_created ON matches(created_at DESC);
CREATE TABLE IF NOT EXISTS match_players(match_id TEXT NOT NULL,user_id TEXT NOT NULL,guild_id TEXT,team TEXT,runs INTEGER DEFAULT 0,balls INTEGER DEFAULT 0,wickets INTEGER DEFAULT 0,result TEXT,highest_score INTEGER DEFAULT 0,PRIMARY KEY(match_id,user_id));
CREATE INDEX IF NOT EXISTS idx_match_players_user ON match_players(user_id);
CREATE TABLE IF NOT EXISTS matches_history(match_id TEXT PRIMARY KEY,room_id TEXT,winner_team TEXT,created_at INTEGER);

CREATE TABLE IF NOT EXISTS guilds(id TEXT PRIMARY KEY,name TEXT NOT NULL,tag TEXT NOT NULL,logo_url TEXT,description TEXT,owner_uid TEXT NOT NULL,level INTEGER DEFAULT 1,xp INTEGER DEFAULT 0,matches INTEGER DEFAULT 0,wins INTEGER DEFAULT 0,losses INTEGER DEFAULT 0,points INTEGER DEFAULT 0,created_at INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_guild_name ON guilds(name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_guild_tag ON guilds(tag);
CREATE TABLE IF NOT EXISTS guild_members(guild_id TEXT NOT NULL,user_id TEXT NOT NULL,role TEXT DEFAULT 'MEMBER',joined_at INTEGER NOT NULL,PRIMARY KEY(guild_id,user_id));
CREATE INDEX IF NOT EXISTS idx_guild_members_user ON guild_members(user_id);

CREATE TABLE IF NOT EXISTS rooms(id TEXT PRIMARY KEY,code TEXT UNIQUE,access TEXT DEFAULT 'free',match_type TEXT DEFAULT 'limited',status TEXT DEFAULT 'lobby',players_count INTEGER DEFAULT 0,team_a_count INTEGER DEFAULT 0,team_b_count INTEGER DEFAULT 0,updated_at INTEGER,created_at INTEGER);
CREATE INDEX IF NOT EXISTS idx_rooms_open ON rooms(status,updated_at DESC);

CREATE TABLE IF NOT EXISTS support_tickets(id TEXT PRIMARY KEY,uid TEXT,game_id TEXT,name TEXT,category TEXT,message TEXT,status TEXT DEFAULT 'OPEN',admin_response TEXT,created_at INTEGER,updated_at INTEGER);
CREATE INDEX IF NOT EXISTS idx_support_status ON support_tickets(status,created_at DESC);
CREATE TABLE IF NOT EXISTS password_reset_requests(id TEXT PRIMARY KEY,uid TEXT,game_id TEXT,status TEXT DEFAULT 'PENDING',reset_code TEXT,created_at INTEGER,updated_at INTEGER);
CREATE TABLE IF NOT EXISTS weekend_tournaments(id TEXT PRIMARY KEY,week_key TEXT UNIQUE,name TEXT,start_time INTEGER,status TEXT DEFAULT 'registration',players TEXT DEFAULT '[]',teams TEXT DEFAULT '[]',winner TEXT,created_at INTEGER);
CREATE INDEX IF NOT EXISTS idx_weekend_week_key ON weekend_tournaments(week_key);
CREATE TABLE IF NOT EXISTS tourney_state(id TEXT PRIMARY KEY,data TEXT);
CREATE TABLE IF NOT EXISTS launch_counter(id INTEGER PRIMARY KEY CHECK(id=1),count INTEGER DEFAULT 0);
INSERT OR IGNORE INTO launch_counter(id,count) VALUES(1,0);
