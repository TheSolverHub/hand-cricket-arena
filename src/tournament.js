const IST_OFFSET = 5.5 * 3600 * 1000;
const PLAYING = 7;
const RESERVE = 2;
const TEAM_SIZE = PLAYING + RESERVE;
const MIN_TEAMS = 4;
const MAX_TEAMS = 64;
const MATCH = { overs: 12, wickets: 10, timerSeconds: 30 };

const TEAM_PRIZES = { winner: 25000, runnerUp: 15000, semi: 10000, participant: 4000 };
const CAT_PRIZES = { 1: 2500, 2: 2000, 3: 1500, default: 1000 };

function istNow(ts = Date.now()) {
  return new Date(ts + IST_OFFSET);
}

export function weekKey(ts = Date.now()) {
  const d = istNow(ts);
  const day = d.getUTCDay();
  const diff = (day + 6) % 7;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diff));
  const y = monday.getUTCFullYear();
  const m = String(monday.getUTCMonth() + 1).padStart(2, '0');
  const da = String(monday.getUTCDate()).padStart(2, '0');
  return `${y}-W${m}${da}`;
}

export function weekendWindow(ts = Date.now()) {
  const d = istNow(ts);
  const day = d.getUTCDay();
  const diffToSat = (6 - day + 7) % 7;
  const sat = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diffToSat, 13, 30, 0));
  const start = sat.getTime();
  const end = start + (1 * 24 * 3600 * 1000) + (3 * 3600 * 1000);
  return { start, end };
}

export function tournamentStatus(ts = Date.now()) {
  const { start, end } = weekendWindow(ts);
  if (ts < start) return 'registration';
  if (ts <= end) return 'live';
  return 'closed';
}

function catPrize(rank) {
  if (rank === 1) return CAT_PRIZES[1];
  if (rank === 2) return CAT_PRIZES[2];
  if (rank === 3) return CAT_PRIZES[3];
  if (rank >= 4 && rank <= 10) return CAT_PRIZES.default;
  return 0;
}

export function parseTimer(raw) {
  const s = String(raw ?? '30').trim().toLowerCase();
  const plus = s.match(/^(\d+)\s*\+\s*(\d+)s?$/);
  if (plus) {
    const base = Number(plus[1]);
    const grace = Number(plus[2]);
    const allowed = [20, 25, 30, 35, 40, 45];
    return { base: allowed.includes(base) ? base : 30, grace: grace === 5 ? 5 : 0, label: `${base}+${grace}s` };
  }
  const n = Number(s.replace(/s$/, ''));
  const allowed = [20, 25, 30, 35, 40, 45];
  const base = allowed.includes(n) ? n : 30;
  return { base, grace: 0, label: `${base}s` };
}

export function validateMatchSettings({ matchType, overs, wickets, timerSeconds, maxPlayers }) {
  const type = matchType === 'test' ? 'test' : 'limited';
  const wk = Math.max(1, Math.min(10, Number(wickets) || 3));
  const timer = parseTimer(timerSeconds);
  const mp = [2, 4, 6, 8].includes(Number(maxPlayers)) ? Number(maxPlayers) : 4;
  const ov = Math.floor(Number(overs));
  if (type === 'test') {
    if (!Number.isFinite(ov) || ov < 20) return { error: 'Test Match requires at least 20 overs.' };
    return { matchType: type, overs: Math.min(90, ov), wickets: wk, timerSeconds: timer.base, graceSeconds: timer.grace, maxPlayers: mp, timerLabel: timer.label };
  }
  if (!Number.isFinite(ov) || ov < 1) return { error: 'Overs must be at least 1.' };
  return { matchType: type, overs: Math.min(10, ov), wickets: wk, timerSeconds: timer.base, graceSeconds: timer.grace, maxPlayers: mp, timerLabel: timer.label };
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickCaptains(players) {
  const ranked = players.slice().sort((a, b) => {
    const sa = (a.stats_runs || 0) + (a.stats_wickets || 0) * 12 + (a.stats_wins || 0) * 8;
    const sb = (b.stats_runs || 0) + (b.stats_wickets || 0) * 12 + (b.stats_wins || 0) * 8;
    return sb - sa;
  });
  return ranked;
}

export function buildTeams(players) {
  const ranked = pickCaptains(players);
  const teamCount = Math.min(MAX_TEAMS, Math.max(MIN_TEAMS, Math.floor(ranked.length / TEAM_SIZE)));
  if (teamCount < MIN_TEAMS) return { error: `Need at least ${MIN_TEAMS * TEAM_SIZE} registered players for ${MIN_TEAMS} teams.`, teams: [] };
  const captains = ranked.slice(0, teamCount);
  const pool = shuffle(ranked.slice(teamCount));
  const teams = captains.map((c, i) => ({
    id: `T${i + 1}`,
    name: `${(c.name || 'Captain').slice(0, 12)} XI`,
    captainUid: c.uid,
    captainName: c.name,
    players: [{ uid: c.uid, name: c.name, gameId: c.game_id, role: 'captain', playing: true }],
    playing: 1,
    reserve: 0,
  }));
  let i = 0;
  for (const p of pool) {
    const t = teams[i % teams.length];
    if (t.players.length >= TEAM_SIZE) { i++; continue; }
    const playing = t.playing < PLAYING;
    t.players.push({ uid: p.uid, name: p.name, gameId: p.game_id, role: playing ? 'playing' : 'reserve', playing });
    if (playing) t.playing++; else t.reserve++;
    i++;
    if (teams.every(x => x.players.length >= TEAM_SIZE)) break;
  }
  return { teams: teams.filter(t => t.players.length >= PLAYING), captains };
}

export function buildBracket(teams) {
  const n = teams.length;
  let size = 1;
  while (size < n) size *= 2;
  const seeded = teams.slice();
  while (seeded.length < size) seeded.push(null);
  const rounds = [];
  let current = [];
  for (let i = 0; i < size; i += 2) {
    current.push({
      id: `R1-M${i / 2 + 1}`,
      round: 1,
      a: seeded[i]?.id || null,
      b: seeded[i + 1]?.id || null,
      winner: seeded[i] && !seeded[i + 1] ? seeded[i].id : (seeded[i + 1] && !seeded[i] ? seeded[i + 1].id : null),
      status: (seeded[i] && seeded[i + 1]) ? 'pending' : 'bye',
    });
  }
  rounds.push(current);
  let r = 2;
  while (current.length > 1) {
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      next.push({ id: `R${r}-M${i / 2 + 1}`, round: r, a: null, b: null, winner: null, status: 'pending', from: [current[i].id, current[i + 1].id] });
    }
    rounds.push(next);
    current = next;
    r++;
  }
  return rounds.flat();
}

export function prizePlan(teams, categoryLeaders) {
  const plan = { team: [], batting: [], bowling: [], allrounder: [] };
  const byPlace = (place) => {
    if (place === 1) return TEAM_PRIZES.winner;
    if (place === 2) return TEAM_PRIZES.runnerUp;
    if (place === 3 || place === 4) return TEAM_PRIZES.semi;
    return TEAM_PRIZES.participant;
  };
  for (const t of teams) {
    const coins = byPlace(t.place || 99);
    for (const p of t.players || []) plan.team.push({ uid: p.uid, name: p.name, coins, reason: `Team place ${t.place || 'participant'}` });
  }
  const cats = [
    ['batting', categoryLeaders.batting || []],
    ['bowling', categoryLeaders.bowling || []],
    ['allrounder', categoryLeaders.allrounder || []],
  ];
  for (const [key, list] of cats) {
    list.slice(0, 10).forEach((p, i) => {
      const rank = i + 1;
      plan[key].push({ uid: p.uid, name: p.name, rank, coins: catPrize(rank) });
    });
  }
  return plan;
}

export const TOURNEY_MATCH = MATCH;
export const TOURNEY_RULES = {
  minTeams: MIN_TEAMS,
  maxTeams: MAX_TEAMS,
  playing: PLAYING,
  reserve: RESERVE,
  teamSize: TEAM_SIZE,
  startLabel: 'Saturday 07:00 PM IST',
  endLabel: 'Sunday 10:00 PM IST',
  prizes: { team: TEAM_PRIZES, categories: { rank1: 2500, rank2: 2000, rank3: 1500, rank4to10: 1000 } },
};

export async function getCurrentTournament(db) {
  const key = weekKey();
  let row = await db.prepare('SELECT * FROM weekend_tournaments WHERE week_key=?').bind(key).first();
  const win = weekendWindow();
  if (!row) {
    const id = 'WT-' + key;
    await db.prepare(
      `INSERT INTO weekend_tournaments(id,week_key,name,start_time,status,players,teams,created_at)
       VALUES(?,?,?,?,?,?,?,?)`
    ).bind(id, key, 'Weekly Championship', win.start, tournamentStatus(), '[]', '[]', Date.now()).run();
    row = await db.prepare('SELECT * FROM weekend_tournaments WHERE week_key=?').bind(key).first();
  }
  const players = JSON.parse(row.players || '[]');
  const teams = JSON.parse(row.teams || '[]');
  const status = tournamentStatus();
  if (row.status !== status) {
    await db.prepare('UPDATE weekend_tournaments SET status=? WHERE id=?').bind(status, row.id).run();
    row.status = status;
  }
  return { ...row, players, teams, status, window: win, rules: TOURNEY_RULES, match: MATCH };
}

export async function registerPlayer(db, user) {
  const t = await getCurrentTournament(db);
  if (t.status === 'closed') return { error: 'This week\'s tournament is closed.' };
  const list = Array.isArray(t.players) ? t.players : [];
  if (list.some(p => p.uid === user.uid)) return { ok: true, message: 'Already registered.', tournament: publicView(t) };
  if (list.length >= MAX_TEAMS * TEAM_SIZE) return { error: 'Tournament is full (64 teams).' };
  list.push({ uid: user.uid, gameId: user.game_id, name: user.name, email: user.email, at: Date.now() });
  await db.prepare('UPDATE weekend_tournaments SET players=? WHERE id=?').bind(JSON.stringify(list), t.id).run();
  t.players = list;
  return { ok: true, message: 'Registered for Weekly Championship', tournament: publicView(t) };
}

export async function seedIfLive(db) {
  const t = await getCurrentTournament(db);
  if (t.status === 'registration') return t;
  if (Array.isArray(t.teams) && t.teams.length >= MIN_TEAMS) return t;
  const uids = (t.players || []).map(p => p.uid);
  if (!uids.length) return t;
  const rows = [];
  for (const uid of uids) {
    const u = await db.prepare('SELECT uid,game_id,name,stats_runs,stats_wickets,stats_wins,stats_matches FROM users WHERE uid=?').bind(uid).first();
    if (u) rows.push(u);
  }
  const built = buildTeams(rows);
  if (built.error) return t;
  const fixtures = buildBracket(built.teams);
  await db.prepare('UPDATE weekend_tournaments SET teams=?,status=? WHERE id=?').bind(
    JSON.stringify({ list: built.teams, fixtures, captains: built.captains.map(c => c.uid) }),
    t.status,
    t.id
  ).run();
  t.teams = { list: built.teams, fixtures };
  return t;
}

export function publicView(t) {
  const players = Array.isArray(t.players) ? t.players : [];
  const teamsObj = t.teams && !Array.isArray(t.teams) ? t.teams : { list: Array.isArray(t.teams) ? t.teams : [], fixtures: [] };
  const list = teamsObj.list || [];
  return {
    id: t.id,
    name: t.name || 'Weekly Championship',
    status: t.status,
    weekKey: t.week_key,
    startTime: t.window?.start || t.start_time,
    endTime: t.window?.end,
    players: players.length,
    maxPlayers: MAX_TEAMS * TEAM_SIZE,
    teams: list.length,
    maxTeams: MAX_TEAMS,
    minTeams: MIN_TEAMS,
    teamSize: TEAM_SIZE,
    playing: PLAYING,
    reserve: RESERVE,
    config: { OVERS: MATCH.overs, WICKETS: MATCH.wickets, TIMER: MATCH.timerSeconds, PRIZE_COINS: TEAM_PRIZES.winner },
    rules: TOURNEY_RULES,
    prizes: TOURNEY_RULES.prizes,
    captains: list.map(x => ({ team: x.name, captain: x.captainName })),
    schedule: { start: 'Saturday 07:00 PM IST', end: 'Sunday 10:00 PM IST' },
  };
}

export async function categoryLeaders(db) {
  const bats = (await db.prepare('SELECT uid,game_id,name,stats_runs,stats_wickets,stats_matches FROM users ORDER BY stats_runs DESC LIMIT 10').all()).results || [];
  const bowls = (await db.prepare('SELECT uid,game_id,name,stats_runs,stats_wickets,stats_matches FROM users ORDER BY stats_wickets DESC LIMIT 10').all()).results || [];
  const allr = (await db.prepare('SELECT uid,game_id,name,stats_runs,stats_wickets,stats_matches FROM users ORDER BY (stats_runs+stats_wickets*12) DESC LIMIT 10').all()).results || [];
  return { batting: bats, bowling: bowls, allrounder: allr };
}

export async function distributePrizes(db, t, leaders) {
  const teams = (t.teams && t.teams.list) || [];
  const plan = prizePlan(teams, leaders);
  const awarded = [];
  for (const row of plan.team) {
    if (!row.uid || !row.coins) continue;
    await db.prepare('UPDATE users SET coins = MAX(0, coins + ?) WHERE uid=?').bind(row.coins, row.uid).run();
    awarded.push(row);
  }
  for (const key of ['batting', 'bowling', 'allrounder']) {
    for (const row of plan[key]) {
      if (!row.uid || !row.coins) continue;
      await db.prepare('UPDATE users SET coins = MAX(0, coins + ?) WHERE uid=?').bind(row.coins, row.uid).run();
      awarded.push({ ...row, category: key });
    }
  }
  return { awarded, plan };
}
