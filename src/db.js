// ═══════════════════════════════════════════════════
// src/db.js — Database Helpers (D1)
// ═══════════════════════════════════════════════════

import { validGameId, safeText } from './auth.js';

// ─── USERS ─────────────────────────────────────────

export async function getUserById(db, uid) {
  return await db.prepare('SELECT * FROM users WHERE uid = ?').bind(uid).first();
}

export async function getUserByGameId(db, gameId) {
  return await db.prepare('SELECT * FROM users WHERE game_id = ?').bind(gameId).first();
}

export async function getUserByEmail(db, email) {
  return await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
}

export async function isGameIdTaken(db, gameId) {
  const row = await db.prepare('SELECT uid FROM users WHERE game_id = ?').bind(gameId).first();
  return !!row;
}

export async function createUser(db, { uid, gameId, name, email, photoUrl }) {
  if (!validGameId(gameId)) throw new Error('Invalid Game ID');
  
  const taken = await isGameIdTaken(db, gameId);
  if (taken) throw new Error('Game ID already taken');

  const now = Date.now();
  await db.prepare(`
    INSERT INTO users (uid, game_id, name, email, photo_url, created_at, last_login)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    uid,
    gameId.toUpperCase(),
    safeText(name, 50) || 'Player',
    email,
    photoUrl || '',
    now,
    now
  ).run();

  return await getUserById(db, uid);
}

export async function updateLastLogin(db, uid) {
  await db.prepare('UPDATE users SET last_login = ? WHERE uid = ?').bind(Date.now(), uid).run();
}

export async function updateUserCoins(db, uid, delta) {
  await db.prepare('UPDATE users SET coins = MAX(0, coins + ?) WHERE uid = ?').bind(delta, uid).run();
}

// ─── SESSION TOKENS (in-memory for Worker instance) ───
// Cloudflare Workers are stateless, so we use signed tokens instead.
// For simplicity, we use uid + HMAC sign here.

export async function createSessionToken(uid, sessionSecret) {
  const SESSION_SECRET = String(sessionSecret || '');
  if (!SESSION_SECRET) throw new Error('SESSION_SECRET is not configured');
  const payload = JSON.stringify({ uid, iat: Date.now() });
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const sigHex = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
  const b64 = btoa(payload);
  return `${b64}.${sigHex}`;
}

export async function verifySessionToken(token, sessionSecret) {
  const SESSION_SECRET = String(sessionSecret || '');
  if (!SESSION_SECRET) return null;
  if (!token || !token.includes('.')) return null;
  const [b64, sigHex] = token.split('.');
  try {
    const payload = atob(b64);
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(SESSION_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const sigBytes = new Uint8Array(sigHex.match(/.{2}/g).map(h => parseInt(h, 16)));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(payload));
    if (!valid) return null;
    const data = JSON.parse(payload);
    // 30-day expiry
    if (Date.now() - data.iat > 30 * 24 * 60 * 60 * 1000) return null;
    return data.uid;
  } catch {
    return null;
  }
}

// ─── ADMIN REQUESTS ─────────────────────────────────

export async function getAdminRequest(db, uid) {
  return await db.prepare('SELECT * FROM admin_requests WHERE uid = ?').bind(uid).first();
}

export async function getPendingAdminRequests(db) {
  return (await db.prepare("SELECT * FROM admin_requests WHERE status = 'PENDING' ORDER BY requested_at DESC").all()).results || [];
}

export async function getApprovedAdmins(db) {
  return (await db.prepare("SELECT * FROM admin_requests WHERE status = 'ACTIVE'").all()).results || [];
}

export async function createAdminRequest(db, { uid, gameId, name, email, photoUrl, message }) {
  const now = Date.now();
  await db.prepare(`
    INSERT INTO admin_requests (uid, game_id, name, email, photo_url, message, status, requested_at)
    VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)
    ON CONFLICT(uid) DO UPDATE SET
      message = excluded.message,
      status = CASE WHEN admin_requests.status = 'ACTIVE' THEN 'ACTIVE' ELSE 'PENDING' END,
      requested_at = excluded.requested_at
  `).bind(uid, gameId, name, email, photoUrl || '', safeText(message, 500), now).run();
}

export async function approveAdminRequest(db, uid, approvedBy, role = 'ADMIN') {
  await db.prepare(`
    UPDATE admin_requests
    SET status = 'ACTIVE', approved_at = ?, approved_by = ?
    WHERE uid = ?
  `).bind(Date.now(), approvedBy, uid).run();
}

export async function rejectAdminRequest(db, uid, reason, rejectedBy) {
  await db.prepare(`
    UPDATE admin_requests
    SET status = 'REJECTED', rejected_at = ?, reason = ?
    WHERE uid = ?
  `).bind(Date.now(), safeText(reason, 200), uid).run();
}

export async function removeAdmin(db, uid) {
  await db.prepare("DELETE FROM admin_requests WHERE uid = ? AND status = 'ACTIVE'").bind(uid).run();
}

// ─── LAUNCH COUNTER ────────────────────────────────

export async function getLaunchCount(db) {
  const row = await db.prepare('SELECT count FROM launch_counter WHERE id = 1').first();
  return row?.count || 0;
}

export async function incrementLaunchCount(db) {
  await db.prepare('UPDATE launch_counter SET count = count + 1 WHERE id = 1').run();
  return await getLaunchCount(db);
}

export function getLaunchTier(position) {
  if (position >= 1 && position <= 50) return { discount: 100, label: 'First 50 — FREE for 1 year' };
  if (position >= 51 && position <= 100) return { discount: 70, label: 'Next 50 — 70% OFF (₹30/year)' };
  if (position >= 101 && position <= 150) return { discount: 40, label: 'Next 50 — 40% OFF (₹60/year)' };
  if (position >= 151 && position <= 200) return { discount: 15, label: 'Next 50 — 15% OFF (₹85/year)' };
  return null;
}

// ─── WEEKEND TOURNAMENTS ────────────────────────────

export async function getOrCreateWeekendTournament(db, weekKey, startTime) {
  let row = await db.prepare('SELECT * FROM weekend_tournaments WHERE week_key = ?').bind(weekKey).first();
  if (row) {
    return {
      ...row,
      players: JSON.parse(row.players || '[]'),
      teams: JSON.parse(row.teams || '[]'),
    };
  }
  
  const id = `WT-${weekKey}`;
  const name = `Weekend Championship`;
  const now = Date.now();
  
  await db.prepare(`
    INSERT INTO weekend_tournaments (id, week_key, name, start_time, status, players, teams, created_at)
    VALUES (?, ?, ?, ?, 'registration', '[]', '[]', ?)
  `).bind(id, weekKey, name, startTime, now).run();

  return {
    id, week_key: weekKey, name, start_time: startTime,
    status: 'registration', players: [], teams: [], winner: null,
    created_at: now,
  };
}

export async function updateWeekendTournament(db, id, updates) {
  const fields = [];
  const values = [];
  
  if (updates.players) { fields.push('players = ?'); values.push(JSON.stringify(updates.players)); }
  if (updates.teams) { fields.push('teams = ?'); values.push(JSON.stringify(updates.teams)); }
  if (updates.status) { fields.push('status = ?'); values.push(updates.status); }
  if (updates.winner !== undefined) { fields.push('winner = ?'); values.push(updates.winner); }
  
  if (fields.length === 0) return;
  
  values.push(id);
  await db.prepare(`UPDATE weekend_tournaments SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
}