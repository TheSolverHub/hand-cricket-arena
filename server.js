const http=require('http'),fs=require('fs'),path=require('path');
const WebSocket=require('ws');
const PORT=process.env.PORT||3000,ROOT=__dirname;
const rooms=new Map(),alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const id=()=>Math.random().toString(36).slice(2,10);
const code=()=>{let c='';do{for(let i=0;i<6;i++)c+=alphabet[Math.floor(Math.random()*alphabet.length)]}while(rooms.has(c));return c};
const teamPlayers=(r,t)=>r.players.filter(p=>p.team===t);
const safeText=(v,n)=>String(v||'').replace(/[<>]/g,'').slice(0,n);
const hostOf=r=>r.players[0];
function assignCaptains(r){ for(const t of ['A','B']){ if(!r.players.some(p=>p.id===r.captains?.[t])){ const q=r.players.find(p=>p.team===t); if(q) r.captains[t]=q.id; } } }
function isCaptain(r,p){assignCaptains(r);return !!p && (r.captains.A===p.id||r.captains.B===p.id)}
const maxWickets=r=>Math.max(1,Math.min(10,teamPlayers(r,r.battingTeam).length-1));
function publicState(r,viewer){
 const bat=teamPlayers(r,r.battingTeam), bowl=teamPlayers(r,r.bowlingTeam);
 const activeBat=bat[r.batterPos%Math.max(1,bat.length)],activeBowl=bowl[r.bowlerPos%Math.max(1,bowl.length)];
 return {room:r.code,names:r.players.map(p=>p.name),players:r.players.map(p=>({id:p.id,name:p.name,team:p.team,ready:p.ready,online:true,captain:r.captains?.[p.team]===p.id})),innings:r.innings,score:r.score,wickets:r.wickets,balls:r.balls,target:r.target,gameOver:r.gameOver,commentary:r.commentary,submitted:r.choices.has(viewer),lockedUntil:r.lockedUntil||0,phase:r.phase,turnPlayers:[activeBat?.id,activeBowl?.id].filter(Boolean),activeBatter:activeBat?.name||'',activeBowler:activeBowl?.name||'',activeBatterId:activeBat?.id||null,activeBowlerId:activeBowl?.id||null,battingTeam:r.battingTeam,bowlingTeam:r.bowlingTeam,firstInnings:r.firstInnings,toss:r.toss,tossWinner:r.tossWinner,decision:r.decision};
}
function send(ws,o){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(o))}
function broadcast(r,o){r.players.forEach(p=>send(p.ws,o))}
function broadcastState(r){r.players.forEach(p=>send(p.ws,{type:'state',state:publicState(r,p.id)}))}
function roomInfo(r){assignCaptains(r);return {type:'room',room:r.code,playerId:null,host:r.players[0]?.id,players:r.players.length,readyCount:r.players.filter(p=>p.ready).length,names:r.players.map(p=>p.name),playerList:r.players.map(p=>({id:p.id,name:p.name,team:p.team,ready:p.ready,captain:r.captains?.[p.team]===p.id})),teams:{A:r.players.filter(p=>p.team==='A').length,B:r.players.filter(p=>p.team==='B').length}}}
function sendRoom(r){r.players.forEach(p=>send(p.ws,{...roomInfo(r),playerId:p.id,team:p.team}))}
function resetMatch(r){r.started=true;r.phase='toss';r.innings=1;r.score=0;r.wickets=0;r.balls=0;r.target=0;r.gameOver=false;r.choices=new Map();r.lockedUntil=0;r.firstInnings=null;r.toss=null;r.tossWinner=null;r.decision=null;r.batterPos=0;r.bowlerPos=0;r.battingTeam=null;r.bowlingTeam=null;r.commentary=`🪙 Toss time — ${r.players[0].name} calls the coin.`;broadcast(r,{type:'started'});broadcastState(r)}
function start(r){if(r.started||r.players.length<4||!r.players.some(p=>p.team==='A')||!r.players.some(p=>p.team==='B')||r.players.some(p=>!p.ready))return;resetMatch(r)}
function finishInnings(r){
 if(r.innings===1){r.firstInnings={team:r.battingTeam,score:r.score};r.innings=2;r.phase='playing';r.score=0;r.wickets=0;r.balls=0;r.target=r.firstInnings.score+1;[r.battingTeam,r.bowlingTeam]=[r.bowlingTeam,r.battingTeam];r.batterPos=0;r.bowlerPos=0;r.choices=new Map();r.commentary=`🏏 Innings break. ${r.battingTeam} need ${r.target} runs to win.`;r.lockedUntil=Date.now()+2000;broadcastState(r);broadcast(r,{type:'ball',event:'innings',state:publicState(r,r.players[0].id)})
 }else{const chaseWon=r.score>=r.target;const winner=chaseWon?r.battingTeam:r.bowlingTeam;r.gameOver=true;r.phase='finished';r.commentary=chaseWon?`🏆 Team ${winner} wins by ${maxWickets(r)-r.wickets} wickets!`:`🏆 Team ${winner} wins by ${r.target-1-r.score} runs!`;r.lockedUntil=0;broadcastState(r);broadcast(r,{type:'finished',message:r.commentary,state:publicState(r,r.players[0].id)})}
}
function resolve(r){
 const bat=teamPlayers(r,r.battingTeam),bowl=teamPlayers(r,r.bowlingTeam),activeBat=bat[r.batterPos%bat.length],activeBowl=bowl[r.bowlerPos%bowl.length];
 if(!activeBat||!activeBowl)return;
 const a=r.choices.get(activeBat.id),b=r.choices.get(activeBowl.id);if(a===undefined||b===undefined||r.gameOver)return;
 r.choices=new Map();r.balls++;const out=a===b;let runs=0,event='run';
 if(out){r.wickets++;event='out';r.commentary=`☝️ WICKET! ${activeBat.name} and ${activeBowl.name} both chose ${a}.`;r.batterPos++}else{runs=a;r.score+=runs;event=runs===4?'four':runs===6?'six':'run';r.commentary=runs===0?'Dot ball.':`${runs} run${runs===1?'':'s'} added.`}
 r.bowlerPos++;
 const inningsEnd=r.wickets>=maxWickets(r)||r.balls>=300||(r.innings===2&&r.score>=r.target);
 r.lockedUntil=Date.now()+1500;broadcast(r,{type:'ball',event,state:publicState(r,r.players[0].id)});
 if(inningsEnd)return setTimeout(()=>finishInnings(r),1500);
 broadcastState(r)
}
const server=http.createServer((req,res)=>{let u=(req.url||'/').split('?')[0];if(u==='/health'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({ok:true,rooms:rooms.size}));}if(u==='/')u='/Hand_Cricket_Arena.html';const f=path.join(ROOT,path.normalize(u));if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end('Not found')}const ext=path.extname(f),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.mp3':'audio/mpeg','.txt':'text/plain'};res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(f).pipe(res)});
const wss=new WebSocket.Server({server});
wss.on('connection',ws=>{ws.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch{return send(ws,{type:'error',message:'Invalid message'})}const name=String(m.name||'Player').slice(0,20);
 if(m.type==='create'){const pass=safeText(m.password,40);const r={code:code(),password:pass,banList:new Set(),captains:{A:null,B:null},players:[],started:false,phase:'lobby',innings:1,score:0,wickets:0,balls:0,target:0,battingTeam:null,bowlingTeam:null,batterPos:0,bowlerPos:0,choices:new Map(),lockedUntil:0,gameOver:false,commentary:'Waiting for players...',firstInnings:null,toss:null,tossWinner:null,decision:null};const p={id:id(),name,ws,ready:false,team:'A'};r.players.push(p);r.captains.A=p.id;rooms.set(r.code,r);sendRoom(r);return}
 let r=rooms.get(String(m.room||'').toUpperCase());
 if(m.type==='join'){if(!r)return send(ws,{type:'error',message:'Room not found.'});if(r.started)return send(ws,{type:'error',message:'Match already started.'});if(r.password!==safeText(m.password,40))return send(ws,{type:'error',message:'Wrong room password.'});if(r.banList.has(name.toLowerCase()))return send(ws,{type:'error',message:'You are banned from this room.'});const p={id:id(),name,ws,ready:false,team:'B'};r.players.push(p);assignCaptains(r);sendRoom(r);return}
 if(!r)return send(ws,{type:'error',message:'Join or create a room first.'});const me=r.players.find(p=>p.ws===ws);if(!me)return send(ws,{type:'error',message:'Player not in room.'});
 if(m.type==='team'){if(r.started)return;const t=String(m.team||'').toUpperCase();if(t!=='A'&&t!=='B')return;me.team=t;me.ready=false;assignCaptains(r);sendRoom(r);return}
 if(m.type==='chat'){const text=safeText(m.text,240);if(!text)return;broadcast(r,{type:'chat',name:me.name,team:me.team,text,at:Date.now()});return}
 if(m.type==='captain'){if(r.started||me.id!==hostOf(r)?.id)return;const pid=String(m.playerId||'');const target=r.players.find(p=>p.id===pid);if(!target)return;assignCaptains(r);r.captains[target.team]=target.id;sendRoom(r);return}
 if(m.type==='kick'||m.type==='ban'){if(r.started||me.id!==hostOf(r)?.id)return;const pid=String(m.playerId||'');const target=r.players.find(p=>p.id===pid);if(!target||target.id===me.id)return;if(m.type==='ban')r.banList.add(target.name.toLowerCase());send(target.ws,{type:'kicked',message:m.type==='ban'?'You were banned from this room.':'You were kicked from this room.'});try{target.ws.close()}catch(_){};r.players=r.players.filter(p=>p.id!==target.id);assignCaptains(r);sendRoom(r);return}
 if(m.type==='ready'){me.ready=!me.ready;sendRoom(r);start(r);return}
 if(m.type==='tossCall'){if(!r.started||r.phase!=='toss'||me!==r.players[0])return;const call=String(m.call||'').toLowerCase();if(call!=='heads'&&call!=='tails')return send(ws,{type:'error',message:'Choose Heads or Tails.'});r.toss=Math.random()<.5?'heads':'tails';r.tossWinner=(call===r.toss)?r.players[0].id:r.players.find(p=>p.id!==r.players[0].id)?.id;r.commentary=`🪙 Coin landed on ${r.toss.toUpperCase()}. ${r.players.find(p=>p.id===r.tossWinner).name} won the toss.`;r.phase='decision';broadcastState(r);return}
 if(m.type==='decision'){if(!r.started||r.phase!=='decision'||me.id!==r.tossWinner)return;const d=String(m.decision||'').toLowerCase();if(d!=='bat'&&d!=='bowl')return;const winner=r.players.find(p=>p.id===r.tossWinner);r.battingTeam=d==='bat'?winner.team:(winner.team==='A'?'B':'A');r.bowlingTeam=r.battingTeam==='A'?'B':'A';r.decision=d;r.phase='playing';r.commentary=`🏏 Team ${r.battingTeam} bats first. Active players will rotate ball-by-ball.`;broadcastState(r);return}
 if(m.type==='choice'){if(!r.started||r.phase!=='playing'||r.gameOver)return;if(Date.now()<r.lockedUntil)return send(ws,{type:'error',message:'Wait for the next ball.'});const bat=teamPlayers(r,r.battingTeam),bowl=teamPlayers(r,r.bowlingTeam),activeBat=bat[r.batterPos%bat.length],activeBowl=bowl[r.bowlerPos%bowl.length];if(me.id!==activeBat?.id&&me.id!==activeBowl?.id)return send(ws,{type:'error',message:'You are spectating. Wait for your turn.'});if(!Number.isInteger(m.choice)||m.choice<0||m.choice>6)return send(ws,{type:'error',message:'Choice must be 0-6.'});if(r.choices.has(me.id))return; r.choices.set(me.id,m.choice);broadcastState(r);resolve(r);return}
 if(m.type==='leave'){r.players=r.players.filter(p=>p.ws!==ws);if(!r.players.length)rooms.delete(r.code);else{r.started=false;r.phase='lobby';r.players.forEach(p=>p.ready=false);r.commentary='A player left. Match reset to lobby.';sendRoom(r);broadcastState(r)}return}
 });ws.on('close',()=>{for(const [c,r] of rooms){const before=r.players.length;r.players=r.players.filter(p=>p.ws!==ws);if(r.players.length!==before){if(!r.players.length)rooms.delete(c);else{r.started=false;r.phase='lobby';r.players.forEach(p=>p.ready=false);r.commentary='A player disconnected. Match reset to lobby.';sendRoom(r);broadcastState(r)}}}})})
server.listen(PORT,()=>console.log(`Hand Cricket Arena multiplayer server running on port ${PORT}`));
