// src/room.js — Multiplayer Room (Durable Object) — V20
export class Room {
  constructor(state, env){this.state=state;this.env=env;this.sessions=new Map();this.room=null;this.ballTimer=null;this.nextBallTimer=null;this.processing=false;}

   async fetch(request){
    const url=new URL(request.url);
    const roomId=(url.searchParams.get('room')||request.headers.get('X-HCA-ROOM')||'DEFAULT').toUpperCase();
    const uid=request.headers.get('X-HCA-UID');
    if(request.method==='DELETE'||url.searchParams.get('action')==='delete'||url.searchParams.get('action')==='admin-delete'){
      if(!uid)return new Response(JSON.stringify({error:'Unauthorized'}),{status:401,headers:{'Content-Type':'application/json'}});
      await this.loadRoom(roomId);
      if(!this.room)return new Response(JSON.stringify({ok:true}),{status:200,headers:{'Content-Type':'application/json'}});
      const adminForce=url.searchParams.get('action')==='admin-delete'||request.headers.get('X-HCA-ADMIN')==='1';
      const host=this.room.players.find(p=>p.id===this.room.hostId);
      if(!adminForce&&this.room.players.length&&(!host||host.userId!==uid))return new Response(JSON.stringify({error:'Only the room creator can delete this room.'}),{status:403,headers:{'Content-Type':'application/json'}});
      await this.destroyRoom(adminForce?'Room closed by admin.':'Room deleted by creator.');
      return new Response(JSON.stringify({ok:true}),{status:200,headers:{'Content-Type':'application/json'}});
    }
    if(request.headers.get('Upgrade')!=='websocket')return new Response('WebSocket endpoint. Use ?room=CODE',{status:426});
    if(!uid)return new Response('Unauthorized',{status:401});
    await this.loadRoom(roomId);
    if(!this.room)return new Response(JSON.stringify({error:'Room not found or expired.'}),{status:410,headers:{'Content-Type':'application/json'}});
    const pair=new WebSocketPair(),[client,server]=Object.values(pair);server.accept();server.addEventListener('message',e=>this.webSocketMessage(server,e.data));server.addEventListener('close',()=>this.webSocketClose(server));server.addEventListener('error',()=>this.webSocketClose(server));
    await this.handleConnection(server,roomId,uid,request);
    return new Response(null,{status:101,webSocket:client});
  }

   roomTtlMs(){return 20*60*1000;}
   isExpired(){const t=Number(this.room?.createdAt||this.room?.updatedAt||0);return !t||(Date.now()-t)>this.roomTtlMs();}
   isHost(me){return !!me&&(me.id===this.room.hostId||me.id===this.room.roomAdminId);}
   async loadRoom(roomId){
    if(this.room){
      if(this.room.code!==roomId)this.room.code=roomId;
      if(this.isExpired())await this.destroyRoom('Room expired (20 minutes).');
      return;
    }
    const saved=await this.state.storage.get('room');
    if(saved){
      this.room=saved;this.normalizeRoom(roomId);
      if(this.isExpired()){await this.destroyRoom('Room expired (20 minutes).');return;}
      this.resumeTimer();return;
    }
    if(this.env.DB&&roomId&&roomId!=='DEFAULT'&&String(roomId).length===6){
      try{const row=await this.env.DB.prepare('SELECT code FROM rooms WHERE code=?').bind(roomId).first();if(!row){this.room=null;return;}}catch{this.room=null;return;}
    }
    this.room=this.newRoom(roomId);await this.saveRoom();
  }
   newRoom(code){const t=Date.now();return{code,hostId:null,status:'lobby',phase:'lobby',access:'free',overs:5,wickets:3,matchType:'limited',maxPlayers:4,players:[],teamNames:{A:'Team A',B:'Team B'},captains:{A:null,B:null},viceCaptains:{A:null,B:null},roomAdminId:null,refereeId:null,commentatorId:null,officialIds:[],streamUrl:'',innings:1,score:0,wickets_fallen:0,balls:0,target:0,battingTeam:null,bowlingTeam:null,firstInnings:null,ballHistory:[],choices:{},activeBatter:{A:null,B:null},activeBowler:{A:null,B:null},batterStats:{},bowlerStats:{},fow:[],extras:{b:0,lb:0,w:0,nb:0,total:0},inningsData:{1:null,2:null},toss:null,tossWinner:null,tossWinnerTeam:null,commentary:'Waiting for players…',timerSeconds:30,graceSeconds:0,timerLabel:'30s',resultDelaySeconds:5,ballTimerLeft:0,ballDeadline:0,superOver:0,superOverInnings:0,superOverTarget:0,gameOver:false,winner:null,result:null,potm:null,createdAt:t,updatedAt:t};}
   normalizeRoom(code){this.room.code=code;this.room.players ||= [];this.room.captains ||= {A:null,B:null};this.room.viceCaptains ||= {A:null,B:null};this.room.teamNames ||= {A:'Team A',B:'Team B'};this.room.streamUrl ||= '';this.room.ballHistory ||= [];this.room.batterStats ||= {};this.room.bowlerStats ||= {};this.room.fow ||= [];this.room.extras ||= {b:0,lb:0,w:0,nb:0,total:0};this.room.choices ||= {};this.room.activeBatter ||= {A:null,B:null};this.room.activeBowler ||= {A:null,B:null};this.room.timerSeconds ||= 30;this.room.graceSeconds ||= 0;this.room.timerLabel ||= (this.room.graceSeconds?this.room.timerSeconds+'+'+this.room.graceSeconds+'s':this.room.timerSeconds+'s');this.room.maxPlayers ||= 4;this.room.resultDelaySeconds ||= 5;}
   async saveRoom(){if(!this.room)return;this.room.updatedAt=Date.now();await this.state.storage.put('room',this.room);try{const exp=(Number(this.room.createdAt)||Date.now())+this.roomTtlMs();await this.state.storage.setAlarm(exp);}catch{}}
   async alarm(){const saved=await this.state.storage.get('room');if(!saved)return;this.room=saved;this.normalizeRoom(saved.code||this.room?.code||'DEFAULT');if(this.isExpired())await this.destroyRoom('Room expired (20 minutes).');}
  async updateRoomRegistry(){if(!this.env.DB||!this.room?.code||this.room.code==='DEFAULT'||String(this.room.code).length!==6)return;try{await this.env.DB.prepare('INSERT OR REPLACE INTO rooms(id,code,access,match_type,status,players_count,team_a_count,team_b_count,updated_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(this.room.code,this.room.code,this.room.access||'free',this.room.matchType||'limited',this.room.status||'lobby',this.room.players.filter(p=>p.online!==false).length,this.teamPlayers('A').length,this.teamPlayers('B').length,Date.now(),this.room.createdAt||Date.now()).run();}catch{}}

  async handleConnection(ws,roomId,uid,request){
    if(!this.room)return this.sendAndCloseUnauthorized(ws);
    const dbUser=await this.env.DB?.prepare('SELECT uid,game_id,name FROM users WHERE uid=?').bind(uid).first();
    if(!dbUser) return this.sendAndCloseUnauthorized(ws);
    let p=this.room.players.find(x=>x.userId===uid);
    if(!p){const id=crypto.randomUUID().slice(0,8);p={id,userId:uid,name:dbUser.name||'Player',gameId:dbUser.game_id||null,team:null,role:'player',guildId:null,guildRole:null,ready:false,online:true,outInnings:false,joinedAt:Date.now()};this.room.players.push(p);}else {p.online=true;p.name=dbUser.name||p.name;p.gameId=dbUser.game_id||p.gameId;}
    const old=[...this.sessions.entries()].find(([sock,info])=>info.userId===uid&&sock!==ws);if(old){try{old[0].close(4001,'Reconnected');}catch{}this.sessions.delete(old[0]);}
    const info={id:p.id,userId:uid,roomId,name:p.name,team:p.team,role:p.role,ready:p.ready,choice:null};this.sessions.set(ws,info);
    if(!this.room.hostId)this.room.hostId=p.id;if(!this.room.roomAdminId)this.room.roomAdminId=this.room.hostId;
    this.send(ws,{type:'welcome',playerId:p.id,roomId,message:'Connected to Hand Cricket Arena',authenticated:true});
    await this.saveRoom();await this.updateRoomRegistry();this.sendLobby(ws,p.id);this.broadcastState();
  }

  async webSocketMessage(ws,message){let d;try{d=typeof message==='string'?JSON.parse(message):JSON.parse(new TextDecoder().decode(message));}catch{return this.send(ws,{type:'error',message:'Invalid JSON'});}const me=this.sessions.get(ws);if(!me)return;
    try{switch(d.type){case'join':return this.handleJoin(ws,me,d);case'team':return this.handleTeam(ws,me,d);case'ready':return this.handleReady(ws,me);case'create':return this.handleCreate(ws,me,d);case'listRooms':return this.handleListRooms(ws);case'choice':return this.handleChoice(ws,me,d);case'tossCall':return this.handleTossCall(ws,me,d);case'decision':return this.handleDecision(ws,me,d);case'followOnDecision':return this.handleFollowOnDecision(ws,me,d);case'start':return this.handleStart(ws,me);case'chat':return this.handleChat(ws,me,d);case'emoji':return this.handleEmoji(ws,me,d);case'voice':return this.handleVoice(ws,me,d);case'question':case'publicQuestion':return this.handleQuestion(ws,me,d);case'leave':return this.handleLeave(ws,me);case'teamNames':return this.handleTeamNames(ws,me,d);case'captain':return this.handleCaptain(ws,me,d);case'viceCaptain':return this.handleViceCaptain(ws,me,d);case'role':return this.handleRole(ws,me,d);case'kick':return this.handleKick(ws,me,d,false);case'ban':return this.handleKick(ws,me,d,true);case'teamAdmin':return this.handleTeamAdmin(ws,me,d);case'assign':return this.handleAssign(ws,me,d);case'streamUrl':return this.handleStreamUrl(ws,me,d);case'deleteRoom':return this.handleDeleteRoom(ws,me);case'switchActive':return this.handleSwitchActive(ws,me,d);default:return this.send(ws,{type:'error',message:'Unknown action'});}}catch(e){console.error('Room action',e);this.send(ws,{type:'error',message:e?.message||'Action failed'});}}

   async webSocketClose(ws){const me=this.sessions.get(ws);if(me&&this.room){const p=this.room.players.find(x=>x.id===me.id);if(p)p.online=false;this.promoteCaptains();if(this.room.hostId===me.id)this.transferHost();await this.saveRoom();this.broadcastState();}this.sessions.delete(ws);}
   transferHost(){const next=this.room.players.find(p=>p.online!==false&&p.id!==this.room.hostId);if(next){this.room.hostId=next.id;this.room.roomAdminId=next.id;}}
   promoteCaptains(){for(const t of ['A','B']){const cap=this.player(this.room.captains[t]);if(cap&&cap.online!==false)continue;const vc=this.player(this.room.viceCaptains[t]);if(vc&&vc.online!==false&&vc.team===t&&vc.role==='player'){this.room.captains[t]=vc.id;this.room.viceCaptains[t]=null;this.room.commentary=`Captain offline. ${vc.name} is now captain of ${this.room.teamNames[t]}.`;}}}
   async destroyRoom(reason){this.clearBallTimer();const code=this.room?.code;this.broadcast({type:'roomDeleted',message:reason||'Room closed.'});for(const[sock] of this.sessions){try{sock.close(4004,reason||'Room closed');}catch{}}this.sessions.clear();if(this.env.DB&&code&&code!=='DEFAULT'&&String(code).length===6){try{await this.env.DB.prepare('DELETE FROM rooms WHERE code=?').bind(code).run();}catch{}}try{await this.state.storage.delete('room');}catch{}try{await this.state.storage.deleteAlarm();}catch{}this.room=null;}
   async handleDeleteRoom(ws,me){if(!this.isHost(me))return this.send(ws,{type:'error',message:'Only the room creator can delete this room.'});await this.destroyRoom('Room deleted by creator.');}
   clearLeadership(p){if(!p)return;for(const t of ['A','B']){if(this.room.captains[t]===p.id)this.room.captains[t]=null;if(this.room.viceCaptains[t]===p.id)this.room.viceCaptains[t]=null;}}
   allowedStream(url){try{const u=new URL(String(url||''));const h=u.hostname.replace(/^www\./,'').toLowerCase();return u.protocol==='https:'&&(h==='youtu.be'||h.endsWith('youtube.com')||h.endsWith('zoom.us')||h.endsWith('zoom.com'));}catch{return false;}}

  sendAndCloseUnauthorized(ws){try{ws.close(4001,'Login required');}catch{}}
  async handleJoin(ws,me,d){const p=this.player(me.id);if(!p)return;const name=String(d.name||p.name||'Player').replace(/[<>]/g,'').slice(0,20).trim();if(name)p.name=name;me.name=p.name;me.team=p.team;me.role=p.role;const gm=await this.getGuildMembership(me.userId);p.guildId=gm?.guild_id||null;p.guildRole=gm?.role||null;p.online=true;await this.saveRoom();await this.updateRoomRegistry();this.sendLobby(ws,me.id);this.broadcastState();}
  async getGuildMembership(uid){if(!this.env.DB)return null;return this.env.DB.prepare('SELECT guild_id,role FROM guild_members WHERE user_id=? LIMIT 1').bind(uid).first();}
  player(id){return this.room.players.find(p=>p.id===id)}
  teamPlayers(t){return this.room.players.filter(p=>p.team===t&&p.role==='player');}
  onlineTeamPlayers(t){return this.teamPlayers(t).filter(p=>p.online!==false);}
  activeBatter(){const t=this.room.battingTeam;if(!t)return null;let id=this.room.activeBatter[t];let p=this.player(id);if(!p||p.team!==t||p.outInnings||p.online===false){p=this.onlineTeamPlayers(t).find(x=>!x.outInnings)||this.onlineTeamPlayers(t)[0];this.room.activeBatter[t]=p?.id||null;}return p||null;}
  activeBowler(){const t=this.room.bowlingTeam;if(!t)return null;let id=this.room.activeBowler[t];let p=this.player(id);if(!p||p.team!==t||p.online===false){p=this.onlineTeamPlayers(t)[0];this.room.activeBowler[t]=p?.id||null;}return p||null;}
  getActivePlayers(){const a=this.activeBatter(),b=this.activeBowler();return [a,b].filter(Boolean);}

   handleTeam(ws,me,d){if(!this.isHost(me))return this.send(ws,{type:'error',message:'Wait for the room creator to assign your team.'});return this.handleAssign(ws,me,{playerId:me.id,team:d.team});}
  handleReady(ws,me){const p=this.player(me.id);if(p)p.ready=!p.ready;this.broadcastState();}
  parseTimerSetting(raw){const s=String(raw??'30').trim().toLowerCase();const plus=s.match(/^(\d+)\s*\+\s*(\d+)s?$/);const allowed=[20,25,30,35,40,45];if(plus){const base=Number(plus[1]),grace=Number(plus[2]);return{base:allowed.includes(base)?base:30,grace:grace===5?5:0,label:`${allowed.includes(base)?base:30}+${grace===5?5:0}s`};}const n=Number(String(s).replace(/s$/,''));const base=allowed.includes(n)?n:30;return{base,grace:0,label:`${base}s`};}
  async handleCreate(ws,me,d){if(this.room.hostId&&this.room.hostId!==me.id)return this.send(ws,{type:'error',message:'Only the host can set room options.'});if(!this.room.hostId)this.room.hostId=me.id;this.room.roomAdminId=this.room.roomAdminId||me.id;this.room.matchType=d.matchType==='test'?'test':'limited';const requestedOvers=Math.floor(Number(d.overs));if(!Number.isFinite(requestedOvers)||requestedOvers<1)return this.send(ws,{type:'error',message:'Overs must be at least 1.'});if(this.room.matchType==='test'){if(requestedOvers<20)return this.send(ws,{type:'error',message:'Test Match requires at least 20 overs.'});this.room.overs=Math.min(90,requestedOvers);}else{this.room.overs=Math.min(10,Math.max(1,requestedOvers));}this.room.wickets=Math.max(1,Math.min(10,Number(d.wickets)||3));this.room.access=d.access==='premium'?'premium':'free';const mp=[2,4,6,8].includes(Number(d.maxPlayers))?Number(d.maxPlayers):4;this.room.maxPlayers=mp;const timer=this.parseTimerSetting(d.timerLabel||d.timerSeconds);this.room.timerSeconds=timer.base;this.room.graceSeconds=timer.grace;this.room.timerLabel=timer.label;this.room.resultDelaySeconds=5;if(d.tournament===true){this.room.matchType='limited';this.room.overs=12;this.room.wickets=10;this.room.timerSeconds=30;this.room.graceSeconds=0;this.room.timerLabel='30s';this.room.maxPlayers=18;this.room.tournament=true;}this.room.teamNames.A=safe(d.teamA||this.room.teamNames.A,24);this.room.teamNames.B=safe(d.teamB||this.room.teamNames.B,24);const name=safe(d.name,20);const p=this.player(me.id);if(p&&name){p.name=name;me.name=name;}await this.saveRoom();await this.updateRoomRegistry();this.sendLobby(ws,me.id);this.broadcastState();}
  async handleListRooms(ws){if(this.env.DB){const cutoff=Date.now()-this.roomTtlMs();try{await this.env.DB.prepare('DELETE FROM rooms WHERE COALESCE(updated_at,created_at)<? OR length(code)!=6').bind(cutoff).run();}catch{}const r=await this.env.DB.prepare("SELECT code,access,match_type,players_count,team_a_count,team_b_count,status FROM rooms WHERE status!='finished' AND length(code)=6 AND COALESCE(updated_at,created_at)>=? ORDER BY updated_at DESC LIMIT 50").bind(cutoff).all();return this.send(ws,{type:'rooms',rooms:(r.results||[]).map(x=>({code:x.code,access:x.access,matchType:x.match_type,players:x.players_count,A:x.team_a_count,B:x.team_b_count,status:x.status}))});}const r=this.room;this.send(ws,{type:'rooms',rooms:[{code:r.code,access:r.access||'free',matchType:r.matchType,players:r.players.filter(p=>p.online!==false).length,A:this.teamPlayers('A').length,B:this.teamPlayers('B').length,status:r.status}]});}
   handleStart(ws,me){if(!this.isHost(me))return this.send(ws,{type:'error',message:'Only the room creator can start the match.'});const A=this.teamPlayers('A'),B=this.teamPlayers('B');if(!A.length||!B.length)return this.send(ws,{type:'error',message:'Both teams need at least 1 player.'});const capA=this.player(this.room.captains.A),capB=this.player(this.room.captains.B),vcA=this.player(this.room.viceCaptains.A),vcB=this.player(this.room.viceCaptains.B);if(!capA||capA.team!=='A'||capA.role!=='player')return this.send(ws,{type:'error',message:'Set Captain for Team A.'});if(!capB||capB.team!=='B'||capB.role!=='player')return this.send(ws,{type:'error',message:'Set Captain for Team B.'});if(!vcA||vcA.team!=='A'||vcA.role!=='player')return this.send(ws,{type:'error',message:'Set Vice-Captain for Team A.'});if(!vcB||vcB.team!=='B'||vcB.role!=='player')return this.send(ws,{type:'error',message:'Set Vice-Captain for Team B.'});if(capA.id===vcA.id||capB.id===vcB.id)return this.send(ws,{type:'error',message:'Captain and Vice-Captain must be different players.'});this.room.status='playing';this.room.phase='toss';this.room.toss=null;this.room.tossWinner=null;this.room.tossWinnerTeam=null;this.room.commentary='Toss time!';this.broadcastState();}
  handleTossCall(ws,me,d){if(this.room.phase!=='toss'||(this.room.hostId!==me.id&&this.room.roomAdminId!==me.id))return;const caller=this.player(me.id);const call=d.call==='heads'?'heads':'tails';const result=Math.random()<.5?'heads':'tails';this.room.toss=result;this.room.tossWinner=result===call?me.id:null;this.room.tossWinnerTeam=result===call?caller?.team:null;if(!this.room.tossWinner){const teams=['A','B'];this.room.tossWinnerTeam=caller?.team==='A'?'B':'A';const p=this.onlineTeamPlayers(this.room.tossWinnerTeam)[0];this.room.tossWinner=p?.id||null;}this.room.phase='decision';this.room.commentary=`🪙 ${result.toUpperCase()}! ${this.room.tossWinnerTeam?this.room.teamNames[this.room.tossWinnerTeam]:'Opponent'} won the toss.`;this.broadcastState();}
   handleDecision(ws,me,d){if(this.room.phase!=='decision'||this.room.tossWinner!==me.id)return;const dec=d.decision==='bat'?'bat':'bowl';const winTeam=this.room.tossWinnerTeam;this.room.battingTeam=dec==='bat'?winTeam:(winTeam==='A'?'B':'A');this.room.bowlingTeam=this.room.battingTeam==='A'?'B':'A';this.startInnings(1);this.room.phase='playing';this.room.status='playing';this.room.commentary=`🏏 ${this.room.teamNames[this.room.battingTeam]} bats first.`;this.startBallTimer();this.broadcastState();}

  handleFollowOnDecision(ws,me,d){if(this.room.phase!=='followOnDecision')return;const firstTeam=this.room.firstInnings?.team;if(this.room.captains[firstTeam]!==me.id&&this.room.roomAdminId!==me.id&&this.room.hostId!==me.id)return;const secondTeam=firstTeam==='A'?'B':'A';if(d.accept===true||d.decision==='followOn'){this.room.followOn=true;this.room.battingTeam=secondTeam;this.room.bowlingTeam=firstTeam;this.room.target=(this.room.firstInnings?.score||0)+1;this.startInnings(3);this.room.phase='playing';this.room.commentary=`🔁 Follow-on! ${this.room.teamNames[secondTeam]} bats again.`;this.startBallTimer();}else{this.room.followOn=false;this.room.battingTeam=firstTeam;this.room.bowlingTeam=secondTeam;this.startInnings(3);this.room.phase='playing';this.room.commentary=`🏏 ${this.room.teamNames[firstTeam]} takes its second innings.`;this.startBallTimer();}this.broadcastState();}

   startInnings(n){this.room.innings=n;this.room.phase='playing';this.room.status='playing';this.room.score=0;this.room.wickets_fallen=0;this.room.balls=0;this.room.choices={};this.room.fow=[];this.room.extras={b:0,lb:0,w:0,nb:0,total:0};for(const p of this.room.players){p.outInnings=false;p.battingStartedAt=null;}const bat=this.activeBatter(),bowl=this.activeBowler();if(bat){this.room.activeBatter[this.room.battingTeam]=bat.id;this.batterStats(bat.id).battingStartedAt=Date.now();}if(bowl)this.room.activeBowler[this.room.bowlingTeam]=bowl.id;}
  batterStats(id){return this.room.batterStats[id] ||= {runs:0,balls:0,fours:0,sixes:0,dismissed:false,dismissalCaughtBy:null,dismissalBowler:null,battingStartedAt:null};}
  bowlerStats(id){return this.room.bowlerStats[id] ||= {balls:0,maidens:0,runs:0,wickets:0};}

  handleChoice(ws,me,d){if(this.room.phase!=='playing')return;const bat=this.activeBatter(),bowl=this.activeBowler();if(!bat||!bowl)return;if(me.id!==bat.id&&me.id!==bowl.id)return this.send(ws,{type:'error',message:'It is not your active turn.'});if(Object.prototype.hasOwnProperty.call(this.room.choices,me.id))return;const n=Number(d.choice);if(!Number.isInteger(n)||n<0||n>6)return;this.room.choices[me.id]=n;this.broadcastState();if(this.room.choices[bat.id]!==undefined&&this.room.choices[bowl.id]!==undefined)this.resolveBall();}

  async resolveBall(){if(this.processing)return;this.processing=true;this.clearBallTimer();const bat=this.activeBatter(),bowl=this.activeBowler();if(!bat||!bowl){this.processing=false;return;}const bc=this.room.choices[bat.id]??0,oc=this.room.choices[bowl.id]??0,out=bc===oc,runs=out?0:bc;this.room.balls++;const bs=this.batterStats(bat.id),ws=this.bowlerStats(bowl.id);bs.balls++;bs.runs+=runs;ws.balls++;ws.runs+=runs;if(runs===4)bs.fours++;if(runs===6)bs.sixes++;if(out){this.room.wickets_fallen++;bs.dismissed=true;bs.dismissalCaughtBy=bowl.name||'Bowler';bs.dismissalBowler=bowl.name||'Bowler';bat.outInnings=true;ws.wickets++;this.room.fow.push({wicket:this.room.wickets_fallen,score:this.room.score,batterId:bat.id,batterName:bat.name,ball:this.room.balls});}else this.room.score+=runs;this.room.ballHistory.push({innings:this.room.innings,ball:this.room.balls,batterId:bat.id,bowlerId:bowl.id,batChoice:bc,bowlChoice:oc,runs,out,score:this.room.score,wickets:this.room.wickets_fallen,at:Date.now()});this.room.choices={};this.room.commentary=out?`☝️ WICKET! ${bat.name} is out.`:runs===6?'🔥 SIX! SIX RUNS':runs===4?'🚀 FOUR! FOUR RUNS':runs===0?'Dot ball.':`${runs} run${runs===1?'':'s'}.`;await this.saveRoom();if(this.env.DB)await this.env.DB.prepare('UPDATE rooms SET status=?,players_count=?,team_a_count=?,team_b_count=?,updated_at=? WHERE code=?').bind('playing',this.room.players.filter(p=>p.online!==false).length,this.teamPlayers('A').length,this.teamPlayers('B').length,Date.now(),this.room.code).run();this.broadcastState();await this.delay(5000);this.processing=false;if(this.room.phase!=='playing')return;if(out){const next=this.onlineTeamPlayers(this.room.battingTeam).find(p=>!p.outInnings);this.room.activeBatter[this.room.battingTeam]=next?.id||null;}this.rotateBowler();if(this.checkPhaseEnd())return;await this.saveRoom();this.startBallTimer();this.broadcastState();}
  rotateBowler(){const t=this.room.bowlingTeam,arr=this.onlineTeamPlayers(t);if(arr.length<2)return;const cur=this.room.activeBowler[t],i=arr.findIndex(x=>x.id===cur);this.room.activeBowler[t]=arr[(i+1)%arr.length].id;}
  checkPhaseEnd(){const maxBalls=this.room.superOver?6:this.room.overs*6;const maxWk=this.room.superOver?2:this.room.wickets;const allOut=this.onlineTeamPlayers(this.room.battingTeam).length>0&&this.onlineTeamPlayers(this.room.battingTeam).every(p=>p.outInnings);if(this.room.balls>=maxBalls||this.room.wickets_fallen>=maxWk||allOut||(this.room.innings===2&&this.room.score>=this.room.target)){this.endInnings();return true;}return false;}

  async endInnings(){
    this.clearBallTimer();
    if(this.room.superOver){
      if(this.room.superOverInnings===1){
        this.room.superOverTarget=this.room.score+1;this.room.superOverInnings=2;
        const t=this.room.battingTeam;this.room.battingTeam=this.room.bowlingTeam;this.room.bowlingTeam=t;
        this.startInnings(2);this.room.commentary=`🎯 Super Over target: ${this.room.superOverTarget}`;this.startBallTimer();this.broadcastState();return;
      }
      if(this.room.score===this.room.superOverTarget-1){this.startSuperOver();return;}
      const winner=this.room.score>=this.room.superOverTarget?this.room.battingTeam:this.room.bowlingTeam;await this.finishMatch(winner);return;
    }

    if(this.room.innings===1){
      this.room.firstInnings={team:this.room.battingTeam,score:this.room.score};
      this.room.inningsData[1]={team:this.room.battingTeam,score:this.room.score,balls:this.room.balls};
      const t=this.room.battingTeam;this.room.battingTeam=this.room.bowlingTeam;this.room.bowlingTeam=t;
      this.room.target=this.room.firstInnings.score+1;this.startInnings(2);
      this.room.commentary=`🏏 Innings break. Target: ${this.room.target}`;this.startBallTimer();this.broadcastState();return;
    }

    if(this.room.innings===2){
      const first=this.room.firstInnings?.score||0;
      const second=this.room.score||0;
      this.room.inningsData[2]={team:this.room.battingTeam,score:second,balls:this.room.balls};
      if(this.room.matchType==='test' && first-second>=200){
        this.room.phase='followOnDecision';
        this.room.commentary=`🔁 Follow-on available: ${this.room.teamNames[this.room.firstInnings.team]} leads by ${first-second}. Captain may enforce follow-on.`;
        this.broadcastState();return;
      }
      if(this.room.matchType==='test'){
        const firstTeam=this.room.firstInnings.team,secondTeam=firstTeam==='A'?'B':'A';
        this.room.battingTeam=firstTeam;this.room.bowlingTeam=secondTeam;this.startInnings(3);
        this.room.commentary=`🏏 ${this.room.teamNames[firstTeam]} starts its second innings.`;this.startBallTimer();this.broadcastState();return;
      }
      if(second===first){this.startSuperOver();return;}
      const winner=second>=this.room.target?this.room.battingTeam:this.room.bowlingTeam;await this.finishMatch(winner);return;
    }

    if(this.room.innings===3 && this.room.matchType==='test'){
      const firstTeam=this.room.firstInnings.team, secondTeam=firstTeam==='A'?'B':'A';
      const thirdScore=this.room.score||0;this.room.inningsData[3]={team:this.room.battingTeam,score:thirdScore,balls:this.room.balls};
      if(this.room.followOn===true){
        const winner=thirdScore>=((this.room.firstInnings?.score||0)+1)?secondTeam:firstTeam;await this.finishMatch(winner);return;
      }
      this.room.aggregateAfterThird=(this.room.firstInnings?.score||0)+thirdScore;
      this.room.battingTeam=secondTeam;this.room.bowlingTeam=firstTeam;this.room.target=this.room.aggregateAfterThird+1;this.startInnings(4);
      this.room.commentary=`🏏 Final innings. Target: ${this.room.target}`;this.startBallTimer();this.broadcastState();return;
    }

    if(this.room.innings===4 && this.room.matchType==='test'){
      const winner=this.room.score>=this.room.target?this.room.battingTeam:this.room.bowlingTeam;await this.finishMatch(winner);return;
    }

    const first=this.room.firstInnings?.score||0;if(this.room.score===first){this.startSuperOver();return;}
    const winner=this.room.score>=this.room.target?this.room.battingTeam:this.room.bowlingTeam;await this.finishMatch(winner);
  }
  startSuperOver(){this.room.superOver=(this.room.superOver||0)+1;this.room.superOverInnings=1;this.room.superOverTarget=0;this.room.battingTeam=this.room.firstInnings?.team||this.room.battingTeam;this.room.bowlingTeam=this.room.battingTeam==='A'?'B':'A';this.startInnings(1);this.room.commentary=`🎯 SUPER OVER ${this.room.superOver}!`;this.startBallTimer();this.broadcastState();}

  startBallTimer(){this.clearBallTimer();if(this.room.phase!=='playing')return;const base=Math.max(5,Number(this.room.timerSeconds)||30);const grace=Math.max(0,Number(this.room.graceSeconds)||0);const sec=base+grace;this.room.ballTimerLeft=sec;this.room.ballDeadline=Date.now()+sec*1000;this.room.timerPhase='green';this.ballTimer=setInterval(()=>{const left=Math.max(0,Math.ceil((this.room.ballDeadline-Date.now())/1000));this.room.ballTimerLeft=left;const ratio=sec?left/sec:0;this.room.timerPhase=ratio>0.5?'green':ratio>0.25?'orange':'red';if(left<=0){this.clearBallTimer();this.autoTimeout();}else this.broadcastState();},250);}
  async autoTimeout(){if(this.room.phase!=='playing')return;const bat=this.activeBatter(),bowl=this.activeBowler();if(!bat||!bowl)return;if(this.room.choices[bat.id]===undefined)this.room.choices[bat.id]=1+Math.floor(Math.random()*6);if(this.room.choices[bowl.id]===undefined)this.room.choices[bowl.id]=1+Math.floor(Math.random()*6);this.room.commentary='Time up. Auto random pick applied.';await this.resolveBall();}
  clearBallTimer(){if(this.ballTimer){clearInterval(this.ballTimer);this.ballTimer=null;}this.room&&(this.room.ballTimerLeft=0,this.room.ballDeadline=0);}
  resumeTimer(){if(this.room?.phase==='playing'&&this.room.ballDeadline){if(this.room.ballDeadline>Date.now())this.startBallTimer();else this.autoTimeout();}}
  delay(ms){return new Promise(r=>setTimeout(r,ms));}

  async finishMatch(winner){this.clearBallTimer();this.room.status='finished';this.room.phase='finished';this.room.gameOver=true;this.room.winner=winner;this.room.commentary=`🏆 ${this.room.teamNames[winner]||'Team '+winner} wins!`;if(this.env.DB)await this.env.DB.prepare("UPDATE rooms SET status='finished',updated_at=? WHERE code=?").bind(Date.now(),this.room.code).run();this.room.result={winner,scoreA:this.scoreForTeam('A'),scoreB:this.scoreForTeam('B')};this.room.potm=this.calculatePOTM();await this.saveRoom();await this.saveMatchToD1();this.broadcastState();}
  scoreForTeam(t){if(this.room.firstInnings?.team===t)return this.room.firstInnings.score||0;return this.room.score||0;}
  calculatePOTM(){const rows=this.teamPlayers('A').concat(this.teamPlayers('B')).map(p=>({p,s:this.batterStats(p.id).runs+this.bowlerStats(p.id).wickets*10})).sort((a,b)=>b.s-a.s);return rows[0]?.p?{userId:rows[0].p.userId,gameId:rows[0].p.gameId,name:rows[0].p.name}:null;}
  async saveMatchToD1(){if(!this.env.DB)return;const matchId='M-'+crypto.randomUUID();const created=this.room.createdAt||Date.now();await this.env.DB.prepare('INSERT INTO matches(id,room_id,match_type,team_a,team_b,winner_team,innings1_team,innings1_score,innings2_team,innings2_score,created_at,finished_at,potm_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(matchId,this.room.code,this.room.matchType,this.room.teamNames.A,this.room.teamNames.B,this.room.winner,this.room.firstInnings?.team||null,this.room.firstInnings?.score||0,this.room.firstInnings?.team==='A'?'B':'A',this.room.score||0,created,Date.now(),this.room.potm?.userId||null).run();for(const p of this.room.players){const bs=this.batterStats(p.id),bw=this.bowlerStats(p.id);const result=p.team===this.room.winner?'WIN':'LOSS';await this.env.DB.prepare('INSERT OR REPLACE INTO match_players(match_id,user_id,guild_id,team,runs,balls,wickets,result,highest_score) VALUES(?,?,?,?,?,?,?,?,?)').bind(matchId,p.userId,p.guildId,p.team,bs.runs,bs.balls,bw.wickets,result,bs.runs).run();await this.env.DB.prepare('UPDATE users SET stats_matches=stats_matches+1,stats_wins=stats_wins+?,stats_runs=stats_runs+?,stats_wickets=stats_wickets+?,stats_highest=MAX(stats_highest,?) WHERE uid=?').bind(p.team===this.room.winner?1:0,bs.runs,bw.wickets,bs.runs,p.userId).run();}await this.env.DB.prepare('INSERT OR REPLACE INTO matches_history(match_id,room_id,winner_team,created_at) VALUES(?,?,?,?)').bind(matchId,this.room.code,this.room.winner,Date.now()).run();const guilds=new Map();for(const p of this.room.players){if(p.guildId&&!guilds.has(p.guildId))guilds.set(p.guildId,p.team===this.room.winner?'WIN':'LOSS');}for(const[g,res]of guilds){await this.env.DB.prepare('UPDATE guilds SET matches=matches+1,wins=wins+?,losses=losses+?,points=points+? WHERE id=?').bind(res==='WIN'?1:0,res==='LOSS'?1:0,res==='WIN'?3:0,g).run();}}

  syncSession(me){const p=this.player(me.id);if(!p)return;me.team=p.team;me.role=p.role;me.name=p.name;}
  canPublicComms(me){const p=this.player(me.id);if(!p)return false;if(this.isHost(me))return true;if(['official','referee','commentator'].includes(p.role))return true;if(this.room.captains?.A===p.id||this.room.captains?.B===p.id)return true;if(this.room.viceCaptains?.A===p.id||this.room.viceCaptains?.B===p.id)return true;return false;}
  sendScoped(me,scope,payload){this.sessions.forEach((info,sock)=>{if(scope==='team'&&(!me.team||info.team!==me.team))return;this.send(sock,payload);});}
  handleChat(ws,me,d){this.syncSession(me);const text=safe(d.text,240);if(!text)return;const scope=d.scope==='team'?'team':'public';if(scope==='public'&&!this.canPublicComms(me))return this.send(ws,{type:'error',message:'Only captain, vice-captain or official can send public messages.'});if(scope==='team'&&!me.team)return this.send(ws,{type:'error',message:'Join a team to send private team messages.'});this.sendScoped(me,scope,{type:'chat',name:me.name,gameId:this.player(me.id)?.gameId||'',team:me.team,text,scope,at:Date.now()});}
  handleEmoji(ws,me,d){this.syncSession(me);const emoji=String(d.emoji||'').slice(0,12),phrase=safe(d.phrase,40),sound=safe(d.sound,20);if(!emoji)return;const scope=d.scope==='team'?'team':'public';if(scope==='public'&&!this.canPublicComms(me))return this.send(ws,{type:'error',message:'Only captain, vice-captain or official can send public emoji.'});if(scope==='team'&&!me.team)return this.send(ws,{type:'error',message:'Join a team to send private emoji.'});const p=this.player(me.id);this.sendScoped(me,scope,{type:'emoji',name:me.name,gameId:p?.gameId||'',team:me.team,emoji,phrase,sound,scope,at:Date.now()});}
  handleVoice(ws,me,d){this.syncSession(me);const data=String(d.data||'');if(!data.startsWith('data:audio')||data.length>900000)return this.send(ws,{type:'error',message:'Voice message is too large.'});const scope=d.scope==='team'?'team':'public';if(scope==='public'&&!this.canPublicComms(me))return this.send(ws,{type:'error',message:'Only captain, vice-captain or official can send public voice.'});if(scope==='team'&&!me.team)return this.send(ws,{type:'error',message:'Join a team to send private voice.'});const p=this.player(me.id);this.sendScoped(me,scope,{type:'voice',name:me.name,gameId:p?.gameId||'',team:me.team,scope,data,at:Date.now()});}
  handleQuestion(ws,me,d){this.syncSession(me);if(!this.canPublicComms(me))return this.send(ws,{type:'error',message:'Only captain, vice-captain or official can ask publicly.'});const text=safe(d.text,220);if(!text)return;const p=this.player(me.id);this.broadcast({type:'question',name:me.name,gameId:p?.gameId||'',team:me.team,text,scope:'public',at:Date.now()});}
   handleLeave(ws,me){const p=this.player(me.id);if(p)p.online=false;this.promoteCaptains();this.sessions.delete(ws);if(this.room.hostId===me.id)this.transferHost();this.broadcastState();}
   handleTeamNames(ws,me,d){if(!this.isHost(me))return;this.room.teamNames.A=safe(d.A||'Team A',24)||'Team A';this.room.teamNames.B=safe(d.B||'Team B',24)||'Team B';this.broadcastState();}
   handleCaptain(ws,me,d){if(!this.isHost(me))return this.send(ws,{type:'error',message:'Only the room creator can set captains.'});if(this.room.phase!=='lobby')return;const p=this.player(d.playerId);if(!p||!['A','B'].includes(p.team)||p.role!=='player')return this.send(ws,{type:'error',message:'Assign the player to a team first.'});if(this.room.viceCaptains[p.team]===p.id)this.room.viceCaptains[p.team]=null;this.room.captains[p.team]=p.id;this.broadcastState();}
   handleViceCaptain(ws,me,d){if(!this.isHost(me))return this.send(ws,{type:'error',message:'Only the room creator can set vice-captains.'});if(this.room.phase!=='lobby')return;const p=this.player(d.playerId);if(!p||!['A','B'].includes(p.team)||p.role!=='player')return this.send(ws,{type:'error',message:'Assign the player to a team first.'});if(this.room.captains[p.team]===p.id)return this.send(ws,{type:'error',message:'Captain and Vice-Captain must be different players.'});this.room.viceCaptains[p.team]=p.id;this.broadcastState();}
   handleRole(ws,me,d){if(!this.isHost(me))return;const p=this.player(d.playerId);if(!p)return;const role=d.role==='spectator'?'audience':d.role;const allowed=['player','audience','spectator','referee','commentator','official'];if(!allowed.includes(role))return;    if(role==='audience'){this.clearLeadership(p);p.team=null;p.role='audience';}else p.role=role;this.sessions.forEach(info=>{if(info.id===p.id){info.team=p.team;info.role=p.role;}});this.broadcastState();}
   handleKick(ws,me,d,ban){if(!this.isHost(me))return;const p=this.player(d.playerId);if(!p||p.id===me.id)return;this.clearLeadership(p);for(const[sock,info]of this.sessions){if(info.id===p.id){try{sock.close(4003,ban?'Banned':'Kicked');}catch{}this.sessions.delete(sock);}}if(ban)p.banned=true;p.online=false;this.promoteCaptains();this.broadcastState();}
   handleTeamAdmin(ws,me,d){return this.handleAssign(ws,me,d);}
   handleAssign(ws,me,d){
     if(!this.isHost(me))return this.send(ws,{type:'error',message:'Only the room creator can assign players.'});
     if(this.room.phase!=='lobby')return this.send(ws,{type:'error',message:'Assignments are locked after match start.'});
     const p=this.player(d.playerId);if(!p)return;
     const dest=String(d.team||d.slot||d.role||'').toUpperCase();
     if(dest==='AUD'||dest==='AUDIENCE'||dest==='SPECTATOR'){
        this.clearLeadership(p);p.team=null;p.role='audience';this.sessions.forEach(info=>{if(info.id===p.id){info.team=null;info.role='audience';}});
     }else if(dest==='A'||dest==='B'){
       const playing=this.room.players.filter(x=>x.role==='player'&&(x.team==='A'||x.team==='B')&&x.id!==p.id).length;
       if(!(p.role==='player'&&(p.team==='A'||p.team==='B'))&&playing>=(this.room.maxPlayers||4))return this.send(ws,{type:'error',message:'Room is full.'});
       if(p.team&&p.team!==dest)this.clearLeadership(p);
        p.team=dest;p.role='player';this.sessions.forEach(info=>{if(info.id===p.id){info.team=dest;info.role='player';}});
     }else return;
     this.updateRoomRegistry();this.broadcastState();
   }
   handleStreamUrl(ws,me,d){if(!this.isHost(me))return this.send(ws,{type:'error',message:'Only the room creator can set the audience stream link.'});const raw=String(d.url||d.streamUrl||'').trim();if(!raw){this.room.streamUrl='';this.broadcastState();return;}if(!this.allowedStream(raw))return this.send(ws,{type:'error',message:'Use a Zoom or YouTube https link.'});this.room.streamUrl=raw.slice(0,500);this.broadcastState();}
   handleSwitchActive(ws,me,d){const p=this.player(d.playerId);if(!p||p.team!==d.team)return;const allowed=me.id===this.room.captains[d.team]||me.id===this.room.viceCaptains[d.team]||me.id===this.room.roomAdminId||me.id===this.room.hostId||me.id===p.id;if(!allowed)return;if(d.kind==='batter'&&!p.outInnings)this.room.activeBatter[d.team]=p.id;if(d.kind==='bowler')this.room.activeBowler[d.team]=p.id;this.broadcastState();}

      getPublicState(){const safePlayers=this.room.players.map(p=>({id:p.id,userId:undefined,name:p.name,gameId:p.gameId,playerId:p.gameId,team:p.team,role:p.role,ready:p.ready,online:p.online!==false,outInnings:!!p.outInnings,guildId:p.guildId,guildRole:p.guildRole,captain:this.room.captains?.[p.team]===p.id,viceCaptain:this.room.viceCaptains?.[p.team]===p.id}));return{room:this.room.code,hostId:this.room.hostId,roomAdminId:this.room.roomAdminId,status:this.room.status,phase:this.room.phase,matchType:this.room.matchType,access:this.room.access,overs:this.room.overs,wickets:this.room.wickets,maxPlayers:this.room.maxPlayers||4,players:safePlayers,captains:this.room.captains,viceCaptains:this.room.viceCaptains,teamNames:this.room.teamNames,streamUrl:this.room.streamUrl||'',innings:this.room.innings,score:this.room.score,wickets_fallen:this.room.wickets_fallen,balls:this.room.balls,target:this.room.target,battingTeam:this.room.battingTeam,bowlingTeam:this.room.bowlingTeam,commentary:this.room.commentary,timerSeconds:this.room.timerSeconds||30,graceSeconds:this.room.graceSeconds||0,timerLabel:this.room.timerLabel||'30s',timerPhase:this.room.timerPhase||'green',resultDelaySeconds:this.room.resultDelaySeconds||5,ballTimerLeft:this.room.ballTimerLeft||0,ballHistory:(this.room.ballHistory||[]).slice(-30),superOver:this.room.superOver,superOverInnings:this.room.superOverInnings,toss:this.room.toss,tossWinner:this.room.tossWinner,tossWinnerTeam:this.room.tossWinnerTeam,activeBatter:this.activeBatter()?.name||null,activeBowler:this.activeBowler()?.name||null,activeBatterId:this.room.activeBatter[this.room.battingTeam]||null,activeBowlerId:this.room.activeBowler[this.room.bowlingTeam]||null,roomCreatorId:this.room.hostId,roles:{refereeId:this.room.refereeId,commentatorId:this.room.commentatorId,officialIds:this.room.officialIds||[]},batterScorecard:this.batterScorecard(),bowlerScorecard:this.bowlerScorecard(),fow:this.room.fow,extras:this.room.extras,potm:this.room.potm,winner:this.room.winner,result:this.room.result,teamA:this.room.teamNames.A,teamB:this.room.teamNames.B};}
  batterScorecard(){return this.room.players.filter(p=>p.role==='player').map(p=>{const s=this.batterStats(p.id),mins=s.battingStartedAt?Math.floor((Date.now()-s.battingStartedAt)/60000):0;return{playerId:p.id,gameId:p.gameId,name:p.name,captain:this.room.captains[p.team]===p.id,team:p.team,runs:s.runs,mins,balls:s.balls,fours:s.fours,sixes:s.sixes,dismissed:s.dismissed,c:s.dismissed?(s.dismissalCaughtBy||'-'):'not out',b:s.dismissed?(s.dismissalBowler||'-'):'-'};});}
  bowlerScorecard(){return this.room.players.filter(p=>p.role==='player').map(p=>{const s=this.bowlerStats(p.id),overs=`${Math.floor(s.balls/6)}.${s.balls%6}`,eco=s.balls?Number((s.runs/(s.balls/6)).toFixed(2)):0;return{playerId:p.id,gameId:p.gameId,name:p.name,team:p.team,overs,maidens:s.maidens,runs:s.runs,wickets:s.wickets,economy:eco};});}
  getPlayerView(id,state){return{...state,myId:id,activeTurn:this.getActivePlayers().map(p=>p.id),myActive:this.getActivePlayers().some(p=>p.id===id)};}
   sendLobby(ws,playerId){const s=this.getPublicState();this.send(ws,{type:'room',room:this.room.code,playerId,host:this.room.hostId,hostId:this.room.hostId,roomAdminId:this.room.roomAdminId,roomCreatorId:this.room.hostId,matchType:this.room.matchType,access:this.room.access,overs:this.room.overs,wickets:this.room.wickets,maxPlayers:this.room.maxPlayers,teamNames:this.room.teamNames,captains:s.captains,viceCaptains:s.viceCaptains,streamUrl:s.streamUrl,playerList:s.players,players:s.players,status:this.room.status,phase:this.room.phase});}
   broadcastState(){if(!this.room)return;const s=this.getPublicState();this.sessions.forEach((info,ws)=>{this.send(ws,{type:'state',state:this.getPlayerView(info.id,s)});if(this.room.status==='lobby')this.sendLobby(ws,info.id);});}
  broadcast(o){this.sessions.forEach((_,ws)=>this.send(ws,o));}
  send(ws,o){try{if(ws.readyState===1)ws.send(JSON.stringify(o));}catch{}}
}
function safe(v,n=200){return String(v??'').replace(/[<>]/g,'').slice(0,n).trim();}
