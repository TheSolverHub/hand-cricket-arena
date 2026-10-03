// src/index.js — HCA Worker API + authenticated Durable Object WebSocket gateway
import { verifyFirebaseToken, getSessionToken, safeText, jsonBody } from './auth.js';
import * as DB from './db.js';
import { Room } from './room.js';
import * as Tourney from './tournament.js';

export { Room };

const cors = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,X-Session-Token,X-Admin-Session' };
const json = (data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json',...cors}});
const now=()=>Date.now();
const ROOM_TTL_MS=20*60*1000;
const ROOM_CHARS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function isLiveRoomCode(code){return /^[A-Z0-9]{6}$/.test(String(code||''));}
async function purgeStaleRooms(db){
  if(!db)return;
  const cutoff=now()-ROOM_TTL_MS;
  try{await db.prepare('DELETE FROM rooms WHERE COALESCE(updated_at,created_at)<? OR length(code)!=6').bind(cutoff).run();}catch{}
}
async function allocRoomCode(db){
  for(let i=0;i<24;i++){
    const bytes=new Uint8Array(6);crypto.getRandomValues(bytes);
    let code='';for(const b of bytes)code+=ROOM_CHARS[b%ROOM_CHARS.length];
    const exists=await db.prepare('SELECT code FROM rooms WHERE code=?').bind(code).first();
    if(!exists)return code;
  }
  throw new Error('Could not allocate a room code.');
}
function publicRoomRow(x){return {code:x.code,access:x.access,matchType:x.match_type,players:x.players_count,A:x.team_a_count,B:x.team_b_count,status:x.status};}

function isAdminEmail(email){const local=String(email||'').toLowerCase().split('@')[0];return local==='yaduvanshiboysyt'||local==='mrshiv99536';}
function isAdminUser(u,env){if(!u)return false;return u.role==='OWNER'||u.role==='ADMIN'||u.role==='MODERATOR'||u.role==='SUPPORT'||u.game_id===env.OWNER_GAME_ID||isAdminEmail(u.email);}
function sessionSecret(env){return env.SESSION_SECRET||'hca-local-preview-secret';}
async function sessionUser(request,env){
  const uid=await DB.verifySessionToken(getSessionToken(request),sessionSecret(env));
  if(!uid)return null;
  return DB.getUserById(env.DB,uid);
}
function payload(u){return u?{uid:u.uid,playerId:u.uid,gameId:u.game_id,name:u.name,email:u.email,photoURL:u.photo_url||'',role:u.role||'USER',isAdmin:['OWNER','ADMIN','MODERATOR','SUPPORT'].includes(u.role)||u.game_id==='SHIVAM123'||isAdminEmail(u.email),membership:{premium:u.membership_status==='PREMIUM'&&(!u.membership_expires||u.membership_expires>now()),status:u.membership_status||'NONE',expires:u.membership_expires||null},stats:{matches:u.stats_matches||0,wins:u.stats_wins||0,runs:u.stats_runs||0,wickets:u.stats_wickets||0,highest:u.stats_highest||0},country:u.country||null}:null;}

async function adminIdentity(request,env){
  const s=await sessionUser(request,env);
  if(s && isAdminUser(s,env)) return {uid:s.uid,user:s,owner:s.role==='OWNER'||s.game_id===env.OWNER_GAME_ID||isAdminEmail(s.email)};
  const token=String(request.headers.get('X-Admin-Session')||'');
  if(token){const h=await sha256(token);const row=await env.DB.prepare('SELECT * FROM admin_sessions WHERE token_hash=? AND expires_at>?').bind(h,now()).first();if(row){const u=await DB.getUserById(env.DB,row.uid);if(u&&isAdminUser(u,env))return{uid:u.uid,user:u,owner:u.role==='OWNER'||u.game_id===env.OWNER_GAME_ID||isAdminEmail(u.email)};}}
  return null;
}
async function sha256(v){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');}
function randCode(n=32){const a=new Uint8Array(n);crypto.getRandomValues(a);return btoa(String.fromCharCode(...a)).replace(/[^A-Za-z0-9]/g,'').slice(0,n);}

async function handleFirebaseConfig(env){return json({ok:true,config:{apiKey:'AIzaSyBu1sT2BI7q6uumt3RRlHncw_pNQbsc1J4',authDomain:'hand-cricket-arena-a040d.firebaseapp.com',databaseURL:'https://hand-cricket-arena-a040d-default-rtdb.asia-southeast1.firebasedatabase.app',projectId:'hand-cricket-arena-a040d',storageBucket:'hand-cricket-arena-a040d.firebasestorage.app',messagingSenderId:'646058356387',appId:'1:646058356387:web:34b2f1665ca2a07dc49916',measurementId:'G-NL06TMM27J'}});}
async function googleRegister(request,env){const b=await jsonBody(request),f=await verifyFirebaseToken(b.idToken,env.FIREBASE_PROJECT_ID);let u=await DB.getUserById(env.DB,f.uid);if(!u){if(!b.gameId)return json({error:'Game ID is required for first registration.'},400);u=await DB.createUser(env.DB,{uid:f.uid,gameId:b.gameId,name:b.name||f.name,email:f.email,photoUrl:f.picture});const pos=await DB.incrementLaunchCount(env.DB);const tier=DB.getLaunchTier(pos);await env.DB.prepare('UPDATE users SET launch_position=?,launch_discount=?,launch_claimed=1,membership_status=?,membership_expires=? WHERE uid=?').bind(pos,tier?.discount||0,tier?.discount===100?'PREMIUM':'NONE',tier?.discount===100?now()+365*86400000:null,f.uid).run();u=await DB.getUserById(env.DB,f.uid);}else await DB.updateLastLogin(env.DB,f.uid);const token=await DB.createSessionToken(f.uid,sessionSecret(env));return json({ok:true,token,user:payload(u)});}
async function googleLogin(request,env){const b=await jsonBody(request),f=await verifyFirebaseToken(b.idToken,env.FIREBASE_PROJECT_ID);let u=await DB.getUserById(env.DB,f.uid);if(!u){u=await DB.getUserByEmail(env.DB,f.email);if(u && u.uid!==f.uid)return json({error:'This email is linked to another account.'},409);if(!u)return json({ok:true,newUser:true,googleUser:{uid:f.uid,email:f.email,name:f.name,photoURL:f.picture}});}await DB.updateLastLogin(env.DB,f.uid);u=await DB.getUserById(env.DB,f.uid);return json({ok:true,token:await DB.createSessionToken(f.uid,sessionSecret(env)),user:payload(u)});}

async function requireUser(request,env){const u=await sessionUser(request,env);if(!u)throw new Response(JSON.stringify({error:'Login required'}),{status:401,headers:{'Content-Type':'application/json',...cors}});return u;}
async function guildCreate(request,env,u){const b=await jsonBody(request),name=safeText(b.name,40),tag=safeText(b.tag,8).toUpperCase();if(!name||!tag)return json({error:'Guild name and tag are required.'},400);const id='G-'+randCode(10).toUpperCase();try{await env.DB.prepare('INSERT INTO guilds(id,name,tag,owner_uid,created_at) VALUES(?,?,?,?,?)').bind(id,name,tag,u.uid,now()).run();await env.DB.prepare('INSERT INTO guild_members(guild_id,user_id,role,joined_at) VALUES(?,?,?,?)').bind(id,u.uid,'OWNER',now()).run();return json({ok:true,guild:{id,name,tag,role:'OWNER'}});}catch(e){return json({error:'Guild name or tag already exists.'},409);}}
async function guildJoin(request,env,u){const b=await jsonBody(request),g=await env.DB.prepare('SELECT * FROM guilds WHERE id=? OR tag=? OR name=?').bind(String(b.guildId||''),String(b.guildId||'').toUpperCase(),String(b.guildId||'')).first();if(!g)return json({error:'Guild not found.'},404);const c=await env.DB.prepare('SELECT COUNT(*) c FROM guild_members WHERE guild_id=?').bind(g.id).first();if(Number(c?.c||0)>=20)return json({error:'Guild is full (20 members).'},409);try{await env.DB.prepare('INSERT INTO guild_members(guild_id,user_id,role,joined_at) VALUES(?,?,?,?)').bind(g.id,u.uid,'MEMBER',now()).run();return json({ok:true,message:'Joined guild.'});}catch{return json({error:'Already a guild member.'},409);}}

async function rankings(request,env,type){const url=new URL(request.url),limit=Math.min(100,Math.max(1,Number(url.searchParams.get('limit')||50)));let rows;if(type==='guilds'){rows=(await env.DB.prepare('SELECT id,name,tag,level,xp,matches,wins,losses,points FROM guilds ORDER BY points DESC,wins DESC,xp DESC LIMIT ?').bind(limit).all()).results||[];}else{const order=type==='bowler'?'stats_wickets DESC, stats_matches DESC':type==='allrounder'?'(stats_runs+stats_wickets) DESC, stats_matches DESC':'stats_runs DESC, stats_matches DESC';rows=(await env.DB.prepare(`SELECT game_id,name,stats_matches,stats_wins,stats_runs,stats_wickets,stats_highest FROM users ORDER BY ${order} LIMIT ?`).bind(limit).all()).results||[];}return json({type,rankings:rows});}

async function adminRoute(request,env,path){const id=await adminIdentity(request,env);if(!id)return json({error:'Unauthorized'},401);if(path==='/api/admin/overview'){await purgeStaleRooms(env.DB);const cutoff=now()-ROOM_TTL_MS;const [p,o,m,g,t,r]=await Promise.all([env.DB.prepare('SELECT COUNT(*) c FROM users').first(),env.DB.prepare("SELECT COUNT(*) c FROM users WHERE membership_status='PREMIUM' AND (membership_expires IS NULL OR membership_expires>?)").bind(now()).first(),env.DB.prepare('SELECT COUNT(*) c FROM matches').first(),env.DB.prepare('SELECT COUNT(*) c FROM guilds').first(),env.DB.prepare("SELECT COUNT(*) c FROM support_tickets WHERE status!='RESOLVED'").first(),env.DB.prepare("SELECT COUNT(*) c FROM rooms WHERE status!='finished' AND length(code)=6 AND COALESCE(updated_at,created_at)>=?").bind(cutoff).first()]);return json({registeredPlayers:p?.c||0,freePlayers:Math.max(0,(p?.c||0)-(o?.c||0)),activeSubscribers:o?.c||0,openRooms:r?.c||0,onlineConnections:0,visits:0,uniqueVisitors:0,todayVisits:0,matches:m?.c||0,guilds:g?.c||0,tickets:t?.c||0,rooms:r?.c||0,me:{gameId:id.user.game_id,name:id.user.name,role:id.user.role,email:id.user.email,owner:!!id.owner},serverTime:new Date().toISOString()});}
if(path==='/api/admin/players'){const r=await env.DB.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT 500').all();return json({players:(r.results||[]).map(x=>({playerId:x.uid,gameId:x.game_id,name:x.name,identifier:x.email||'',role:x.role,subscription:{status:x.membership_status,premium:x.membership_status==='PREMIUM'&&(!x.membership_expires||x.membership_expires>now()),expires:x.membership_expires},stats:{matches:x.stats_matches,wins:x.stats_wins,runs:x.stats_runs,wickets:x.stats_wickets}}))});}
if(path==='/api/admin/status'){const u=await sessionUser(request,env);const allowed=isAdminUser(u,env);const cfg=await env.DB.prepare('SELECT password_hash FROM admin_config WHERE id=1').first();return json({allowed,passwordConfigured:!!cfg?.password_hash,gameId:u?.game_id||null,role:u?.role||null});}
if(path==='/api/admin/rooms'){
  await purgeStaleRooms(env.DB);
  if(request.method==='GET'){
    const cutoff=now()-ROOM_TTL_MS;
    const r=await env.DB.prepare("SELECT code,access,match_type,status,players_count,team_a_count,team_b_count,updated_at,created_at FROM rooms WHERE length(code)=6 AND COALESCE(updated_at,created_at)>=? ORDER BY updated_at DESC LIMIT 100").bind(cutoff).all();
    return json({rooms:(r.results||[]).map(x=>({code:x.code,access:x.access,matchType:x.match_type,status:x.status,players:x.players_count,A:x.team_a_count,B:x.team_b_count,updatedAt:x.updated_at,createdAt:x.created_at}))});
  }
  const b=await jsonBody(request);
  const code=String(b.code||'').toUpperCase();
  if(!isLiveRoomCode(code))return json({error:'Invalid room code'},400);
  const stub=env.ROOMS.get(env.ROOMS.idFromName(code));
  const origin=new URL(request.url).origin;
  const h=new Headers();h.set('X-HCA-UID',id.uid);h.set('X-HCA-ROOM',code);h.set('X-HCA-ADMIN','1');
  const r=await stub.fetch(new Request(origin+'/?room='+encodeURIComponent(code)+'&action=admin-delete',{method:'DELETE',headers:h}));
  const body=await r.text();
  return new Response(body,{status:r.status,headers:{'Content-Type':'application/json',...cors}});
}
if(path==='/api/admin/team'){if(request.method==='GET'){const a=await env.DB.prepare("SELECT game_id FROM users WHERE role IN ('ADMIN','OWNER') ORDER BY game_id").all();return json({ownerGameId:env.OWNER_GAME_ID,teamIds:(a.results||[]).map(x=>x.game_id)});}if(!id.owner)return json({error:'Owner only'},403);const b=await jsonBody(request),u=await DB.getUserByGameId(env.DB,b.gameId);if(!u)return json({error:'Player not found'},404);await env.DB.prepare('UPDATE users SET role=? WHERE uid=?').bind(b.action==='add'?'ADMIN':'USER',u.uid).run();return json({ok:true});}
if(path==='/api/admin/announcement'){if(request.method==='GET')return json(await env.DB.prepare('SELECT text,enabled,updated_at FROM announcements WHERE id=1').first()||{text:'',enabled:0});const b=await jsonBody(request);if(!id.owner&&id.user.role!=='ADMIN')return json({error:'Admin only'},403);if(request.method==='DELETE'){await env.DB.prepare('UPDATE announcements SET text=\'\',enabled=0,updated_at=?,updated_by=? WHERE id=1').bind(now(),id.uid).run();return json({ok:true});}await env.DB.prepare('UPDATE announcements SET text=?,enabled=?,updated_at=?,updated_by=? WHERE id=1').bind(safeText(b.text,1000),b.text?1:0,now(),id.uid).run();return json({ok:true});}
if(path==='/api/admin/subscription'&&request.method==='POST'){const b=await jsonBody(request),u=await DB.getUserById(env.DB,b.playerId)||await DB.getUserByGameId(env.DB,b.playerId);if(!u)return json({error:'Player not found'},404);if(b.action==='grant'){const days=Math.min(3650,Math.max(1,Number(b.days)||30));await env.DB.prepare("UPDATE users SET membership_status='PREMIUM',membership_expires=?,membership_source='ADMIN' WHERE uid=?").bind(now()+days*86400000,u.uid).run();}else await env.DB.prepare("UPDATE users SET membership_status='NONE',membership_expires=NULL WHERE uid=?").bind(u.uid).run();return json({ok:true});}
if(path==='/api/admin/role'&&request.method==='POST'){if(!id.owner)return json({error:'Owner only'},403);const b=await jsonBody(request),u=await DB.getUserById(env.DB,b.playerId)||await DB.getUserByGameId(env.DB,b.playerId);if(!u)return json({error:'Player not found'},404);const role=['USER','ADMIN','OWNER','MODERATOR','SUPPORT'].includes(b.role)?b.role:'USER';await env.DB.prepare('UPDATE users SET role=? WHERE uid=?').bind(role,u.uid).run();return json({ok:true});}
if(path==='/api/admin/reset-arena'&&request.method==='POST'){
  if(!id.owner&&id.user.role!=='ADMIN')return json({error:'Admin only'},403);
  await env.DB.prepare('DELETE FROM rooms').run();
  await env.DB.prepare('DELETE FROM matches').run();
  await env.DB.prepare('DELETE FROM match_players').run();
  await env.DB.prepare('DELETE FROM matches_history').run();
  await env.DB.prepare("UPDATE weekend_tournaments SET players='[]',teams='[]',status='registration',winner=NULL").run();
  await env.DB.prepare('UPDATE users SET stats_matches=0,stats_wins=0,stats_runs=0,stats_wickets=0,stats_highest=0').run();
  await env.DB.prepare('UPDATE guilds SET matches=0,wins=0,losses=0,points=0,xp=0').run();
  return json({ok:true,message:'Rooms, rankings and weekend registrations reset.'});
}
if(path==='/api/admin/support'){if(request.method==='GET'){const r=await env.DB.prepare('SELECT * FROM support_tickets ORDER BY created_at DESC LIMIT 200').all();return json({tickets:(r.results||[]).map(x=>({...x,adminResponse:x.admin_response}))});}const b=await jsonBody(request);await env.DB.prepare('UPDATE support_tickets SET status=?,admin_response=?,updated_at=? WHERE id=?').bind(b.status||'OPEN',safeText(b.adminResponse,2000),now(),b.ticketId).run();return json({ok:true});}
if(path==='/api/admin/password-reset'){if(request.method==='GET'){const r=await env.DB.prepare('SELECT * FROM password_reset_requests ORDER BY created_at DESC').all();return json({requests:r.results||[]});}const b=await jsonBody(request);if(b.action==='approve'){const code=String(Math.floor(100000+Math.random()*900000));await env.DB.prepare('UPDATE password_reset_requests SET status=\'APPROVED\',reset_code=?,updated_at=? WHERE id=?').bind(code,now(),b.requestId).run();return json({ok:true,resetCode:code});}await env.DB.prepare('UPDATE password_reset_requests SET status=\'REJECTED\',updated_at=? WHERE id=?').bind(now(),b.requestId).run();return json({ok:true});}
return json({error:'Admin endpoint not found'},404);}

export default {async fetch(request,env){
  if(request.method==='OPTIONS')return new Response(null,{headers:cors});
  const url=new URL(request.url),path=url.pathname;
  try{
    if(path==='/health')return json({ok:true,service:'hand-cricket-arena',time:new Date().toISOString()});
    if(path==='/api/firebase-config')return handleFirebaseConfig(env);
    if(path==='/api/google-register'&&request.method==='POST')return googleRegister(request,env);
    if(path==='/api/google-login'&&request.method==='POST')return googleLogin(request,env);
    if(path==='/api/google-session'&&request.method==='POST')return googleLogin(request,env);
    if(path==='/api/google-session'&&request.method==='GET')return (async()=>{const u=await sessionUser(request,env);return json({ok:!!u,user:payload(u)});})();
    if(path==='/api/preview-session'&&request.method==='POST'){
      const host=String(request.headers.get('Host')||'');
      const origin=String(request.headers.get('Origin')||'');
      const allowed=/(^localhost(:\d+)?$)|(^127\.0\.0\.1(:\d+)?$)|(\.monkeycode-ai\.live$)/i.test(host)||/\.monkeycode-ai\.live/i.test(origin)||/localhost|127\.0\.0\.1/i.test(origin);
      if(!allowed)return json({error:'Preview login is only available on local/preview hosts.'},403);
      const b=await jsonBody(request);
      const gameId=String(b.gameId||'').trim().toUpperCase();
      if(!/^[A-Z0-9_]{3,20}$/.test(gameId))return json({error:'Game ID must be 3-20 characters: A-Z, 0-9, _'},400);
      let u=await DB.getUserByGameId(env.DB,gameId);
      if(!u){
        const uid='preview-'+gameId.toLowerCase();
        u=await DB.createUser(env.DB,{uid,gameId,name:b.name||gameId,email:gameId.toLowerCase()+'@preview.local',photoUrl:''});
        const pos=await DB.incrementLaunchCount(env.DB);
        const tier=DB.getLaunchTier(pos);
        await env.DB.prepare('UPDATE users SET launch_position=?,launch_discount=?,launch_claimed=1,membership_status=?,membership_expires=? WHERE uid=?').bind(pos,tier?.discount||0,tier?.discount===100?'PREMIUM':'NONE',tier?.discount===100?now()+365*86400000:null,uid).run();
        u=await DB.getUserById(env.DB,uid);
      }else await DB.updateLastLogin(env.DB,u.uid);
      const secret=env.SESSION_SECRET||'hca-local-preview-secret';
      return json({ok:true,token:await DB.createSessionToken(u.uid,secret),user:payload(u),preview:true});
    }
    if(path==='/api/me')return (async()=>{const u=await requireUser(request,env);return json(payload(u));})();
    if(path==='/api/check-game-id'){const taken=!!(await DB.getUserByGameId(env.DB,url.searchParams.get('gameId')||''));return json({taken,available:!taken});}
    if(path==='/api/announcement')return json(await env.DB.prepare('SELECT text,enabled,updated_at FROM announcements WHERE id=1').first()||{text:'',enabled:0});
    if(path==='/api/admin/check'&&request.method==='POST'){const u=await sessionUser(request,env);if(!u)return json({ok:false,error:'Login required'},401);if(u.game_id===env.OWNER_GAME_ID||u.role==='OWNER')return json({ok:true,status:'OWNER',gameId:u.game_id});const a=await DB.getAdminRequest(env.DB,u.uid);if(a?.status==='ACTIVE')return json({ok:true,status:'ADMIN',role:a.role||u.role,gameId:u.game_id});if(a?.status==='PENDING')return json({ok:true,status:'PENDING',gameId:u.game_id});return json({ok:true,status:'NONE',gameId:u.game_id});}
    if(path==='/api/admin/request-access'&&request.method==='POST'){const b=await jsonBody(request),f=await verifyFirebaseToken(b.idToken,env.FIREBASE_PROJECT_ID),u=await DB.getUserById(env.DB,f.uid);if(!u)return json({error:'Register first'},404);await DB.createAdminRequest(env.DB,{uid:f.uid,gameId:u.game_id,name:f.name,email:f.email,photoUrl:f.picture,message:b.message||''});return json({ok:true,status:'PENDING'});}
    if(path==='/api/admin/list-requests'&&request.method==='GET'){const u=await sessionUser(request,env);if(!u||u.game_id!==env.OWNER_GAME_ID)return json({error:'Owner only'},403);return json({ok:true,pending:await DB.getPendingAdminRequests(env.DB),admins:await DB.getApprovedAdmins(env.DB)});}
    if(path==='/api/admin/approve'&&request.method==='POST'){const u=await sessionUser(request,env);if(!u||u.game_id!==env.OWNER_GAME_ID)return json({error:'Owner only'},403);const b=await jsonBody(request);await DB.approveAdminRequest(env.DB,b.uid,u.game_id,b.role||'ADMIN');return json({ok:true});}
    if(path==='/api/admin/reject'&&request.method==='POST'){const u=await sessionUser(request,env);if(!u||u.game_id!==env.OWNER_GAME_ID)return json({error:'Owner only'},403);const b=await jsonBody(request);await DB.rejectAdminRequest(env.DB,b.uid,b.reason||'');return json({ok:true});}
    if(path.startsWith('/api/admin/')){
      if(path==='/api/admin/login'&&request.method==='POST'){
        const b=await jsonBody(request),u=await DB.getUserByGameId(env.DB,b.gameId);if(!u||!isAdminUser(u,env))return json({error:'Unauthorized'},401);
        const cfg=await env.DB.prepare('SELECT password_hash,password_salt FROM admin_config WHERE id=1').first();if(!cfg?.password_hash)return json({error:'Admin password is not configured. Use Google session setup first.'},400);
        const salt=cfg.password_salt;const h=await sha256(`${salt}:${b.pin||''}`);if(h!==cfg.password_hash)return json({error:'Invalid admin PIN'},401);const tok=randCode(48);await env.DB.prepare('INSERT INTO admin_sessions(token_hash,uid,role,expires_at,created_at) VALUES(?,?,?,?,?)').bind(await sha256(tok),u.uid,u.role,now()+86400000,now()).run();return json({token:tok});
      }
      if(path==='/api/admin/session-login'&&request.method==='POST'){
        const u=await sessionUser(request,env);if(!u)return json({error:'Login required'},401);if(!isAdminUser(u,env))return json({error:'This account is not authorized for Admin.'},403);const tok=randCode(48);await env.DB.prepare('INSERT INTO admin_sessions(token_hash,uid,role,expires_at,created_at) VALUES(?,?,?,?,?)').bind(await sha256(tok),u.uid,u.role,now()+86400000,now()).run();return json({token:tok,user:{gameId:u.game_id,name:u.name,role:u.role}});
      }
      if(path==='/api/admin/setup-password'&&request.method==='POST'){const u=await sessionUser(request,env);if(!u||!(u.role==='OWNER'||u.game_id===env.OWNER_GAME_ID||isAdminEmail(u.email)))return json({error:'Owner only'},403);const b=await jsonBody(request);if(String(b.newPassword||'').length<8)return json({error:'Password must be 8+ characters'},400);const salt=randCode(24),hash=await sha256(`${salt}:${b.newPassword}`);await env.DB.prepare('UPDATE admin_config SET password_hash=?,password_salt=?,updated_at=? WHERE id=1').bind(hash,salt,now()).run();return json({ok:true});}
      if(path==='/api/admin/logout'&&request.method==='POST'){const t=String(request.headers.get('X-Admin-Session')||'');if(t)await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(await sha256(t)).run();return json({ok:true});}
      return adminRoute(request,env,path);
    }
    if(path==='/api/support/ticket'&&request.method==='POST'){const u=await requireUser(request,env),b=await jsonBody(request),id='T-'+randCode(10);await env.DB.prepare('INSERT INTO support_tickets(id,uid,game_id,name,category,message,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,u.uid,u.game_id,u.name,safeText(b.category,40),safeText(b.message,2000),now(),now()).run();return json({ok:true,ticket:{id}});}
     if(/^\/api\/rooms\/[A-Za-z0-9]{6}$/.test(path)&&request.method==='DELETE'){
       const u=await requireUser(request,env);
       const code=path.slice('/api/rooms/'.length).toUpperCase();
       const stub=env.ROOMS.get(env.ROOMS.idFromName(code));
       const h=new Headers();h.set('X-HCA-UID',u.uid);h.set('X-HCA-ROOM',code);
       const r=await stub.fetch(new Request(url.origin+'/?room='+encodeURIComponent(code)+'&action=delete',{method:'DELETE',headers:h}));
       const body=await r.text();
       return new Response(body,{status:r.status,headers:{'Content-Type':'application/json',...cors}});
     }
     if(path==='/api/rooms'){
       const u=await requireUser(request,env);
       await purgeStaleRooms(env.DB);
      if(request.method==='POST'){
        const b=await jsonBody(request);
        const settings=Tourney.validateMatchSettings(b);
        if(settings.error)return json({error:settings.error},400);
        const access=b.access==='premium'?'premium':'free';
        const premium=u.membership_status==='PREMIUM'&&(!u.membership_expires||u.membership_expires>now());
        if(access==='premium'&&!premium)return json({error:'Active Premium subscription is required to create a Premium room.'},403);
        const code=await allocRoomCode(env.DB);
        const t=now();
        await env.DB.prepare('INSERT INTO rooms(id,code,access,match_type,status,players_count,team_a_count,team_b_count,updated_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(code,code,access,settings.matchType,'lobby',1,0,0,t,t).run();
        return json({ok:true,code,access,...settings});
      }
      const cutoff=now()-ROOM_TTL_MS;
      const r=await env.DB.prepare("SELECT code,access,match_type,players_count,team_a_count,team_b_count,status FROM rooms WHERE status!='finished' AND length(code)=6 AND COALESCE(updated_at,created_at)>=? ORDER BY updated_at DESC LIMIT 50").bind(cutoff).all();
      return json({rooms:(r.results||[]).filter(x=>isLiveRoomCode(x.code)).map(publicRoomRow)});
    }
    if(path==='/api/rankings/players'||path==='/api/rankings/batsmen')return rankings(request,env,'batsman');
    if(path==='/api/rankings/bowlers')return rankings(request,env,'bowler');
    if(path==='/api/rankings/allrounders')return rankings(request,env,'allrounder');
    if(path==='/api/rankings/guilds')return rankings(request,env,'guilds');
    if(path==='/api/guild/create'&&request.method==='POST'){const u=await requireUser(request,env);return guildCreate(request,env,u);}
    if(path==='/api/guild/join'&&request.method==='POST'){const u=await requireUser(request,env);return guildJoin(request,env,u);}
    if(path==='/api/guilds'){const r=await env.DB.prepare('SELECT id,name,tag,level,xp,matches,wins,losses,points FROM guilds ORDER BY points DESC LIMIT 100').all();return json({guilds:r.results||[]});}
    if(path==='/api/weekend/current'||path==='/api/weekend/status'){
      const t=await Tourney.seedIfLive(env.DB);
      return json({ok:true,tournament:Tourney.publicView(t)});
    }
    if(path==='/api/weekend/register'&&request.method==='POST'){
      const u=await requireUser(request,env);
      const r=await Tourney.registerPlayer(env.DB,u);
      if(r.error)return json({error:r.error},400);
      return json(r);
    }
    if(path==='/api/weekend/prizes'){
      const t=await Tourney.getCurrentTournament(env.DB);
      const leaders=await Tourney.categoryLeaders(env.DB);
      return json({ok:true,prizes:Tourney.TOURNEY_RULES.prizes,leaders,match:Tourney.TOURNEY_MATCH,rules:Tourney.TOURNEY_RULES,tournament:Tourney.publicView(t)});
    }
    if(path==='/api/weekend/seed'&&request.method==='POST'){
      const id=await adminIdentity(request,env);
      if(!id)return json({error:'Unauthorized'},401);
      const t=await Tourney.seedIfLive(env.DB);
      return json({ok:true,tournament:Tourney.publicView(t)});
    }
    if(path==='/api/weekend/payout'&&request.method==='POST'){
      const id=await adminIdentity(request,env);
      if(!id)return json({error:'Unauthorized'},401);
      const t=await Tourney.getCurrentTournament(env.DB);
      const leaders=await Tourney.categoryLeaders(env.DB);
      const out=await Tourney.distributePrizes(env.DB,t,leaders);
      return json({ok:true,...out});
    }
    // Authenticated WS gateway. Browser sends session token as query param because WebSocket cannot set custom headers.
    if(request.headers.get('Upgrade')==='websocket'){
      const token=String(url.searchParams.get('session')||url.searchParams.get('token')||'');
      const uid=await DB.verifySessionToken(token,sessionSecret(env));
      if(!uid)return new Response('Unauthorized',{status:401,headers:cors});
      const rawRoom=(url.searchParams.get('room')||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
      const roomCode=isLiveRoomCode(rawRoom)?rawRoom:'DEFAULT';
      const roomId=env.ROOMS.idFromName(roomCode),stub=env.ROOMS.get(roomId);
      const h=new Headers(request.headers);h.set('X-HCA-UID',uid);h.set('X-HCA-ROOM',roomCode);
      return stub.fetch(new Request(request,{headers:h}));
    }
    return json({error:'Not found'},404);
  }catch(e){console.error(e);if(e instanceof Response)return e;return json({error:e?.message||'Server error'},500);}
}};
