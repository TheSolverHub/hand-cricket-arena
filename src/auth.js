// src/auth.js — Firebase / Google token verification
import { jwtVerify, createRemoteJWKSet } from 'jose';

const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));

export async function verifyFirebaseToken(idToken, projectId) {
  if (!idToken || typeof idToken !== 'string') throw new Error('Missing ID token');
  if (!projectId) throw new Error('Firebase project is not configured');
  try {
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    if (!payload.sub) throw new Error('Invalid token: no subject');
    return {
      uid: String(payload.sub),
      email: String(payload.email || '').toLowerCase(),
      name: String(payload.name || payload.email?.split('@')[0] || 'Player').slice(0, 50),
      picture: String(payload.picture || '').slice(0, 500),
    };
  } catch (e) {
    console.error('Firebase token verification failed:', e?.message || e);
    throw new Error('Invalid or expired token');
  }
}

export function getSessionToken(request) {
  return String(request.headers.get('X-Session-Token') || '').trim();
}

export function validGameId(gid) {
  return /^[A-Za-z0-9_]{3,20}$/.test(String(gid || '').trim());
}

export function safeText(v, maxLen = 200) {
  return String(v ?? '').replace(/[<>]/g, '').slice(0, maxLen).trim();
}

export function jsonBody(request) {
  return request.json().catch(() => ({}));
}
