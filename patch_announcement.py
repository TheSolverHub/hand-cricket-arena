from pathlib import Path
root=Path('/mnt/data/v20work')
# server
p=root/'server.js';s=p.read_text(encoding='utf-8')
if 'ANNOUNCEMENT_FILE' not in s:
    marker="const DB_FILE=path.join(ROOT,'players.json');"
    ins="""const DB_FILE=path.join(ROOT,'players.json');const ANNOUNCEMENT_FILE=path.join(ROOT,'announcement.json');\nlet announcement={enabled:false,text:'',updatedAt:null};\ntry{announcement=Object.assign(announcement,JSON.parse(fs.readFileSync(ANNOUNCEMENT_FILE,'utf8')||'{}'))}catch{}\nfunction saveAnnouncement(){try{fs.writeFileSync(ANNOUNCEMENT_FILE,JSON.stringify(announcement,null,2))}catch{}}\n"""
    s=s.replace(marker,ins,1)
if "u==='/api/announcement'" not in s:
    marker="if(u==='/api/admin/players'){"
    api="""if(u==='/api/announcement'){return json(res,200,{ok:true,enabled:!!announcement.enabled,text:announcement.enabled?announcement.text:'',updatedAt:announcement.updatedAt||null});}\nif(req.method==='POST'&&u==='/api/admin/announcement'){if(!requireAdmin(req))return json(res,401,{ok:false,error:'Unauthorized'});let body='';req.on('data',c=>body+=c);req.on('end',()=>{try{const m=JSON.parse(body||'{}');const text=safeText(m.text||'',1000).trim();if(!text)return json(res,400,{ok:false,error:'Announcement text is required.'});announcement={enabled:true,text,updatedAt:Date.now()};saveAnnouncement();if(typeof wss!=='undefined')wss.clients.forEach(ws=>send(ws,{type:'announcement',announcement}));return json(res,200,{ok:true,announcement})}catch(e){return json(res,400,{ok:false,error:'Invalid request.'})}});return;}\nif(req.method==='DELETE'&&u==='/api/admin/announcement'){if(!requireAdmin(req))return json(res,401,{ok:false,error:'Unauthorized'});announcement={enabled:false,text:'',updatedAt:Date.now()};saveAnnouncement();if(typeof wss!=='undefined')wss.clients.forEach(ws=>send(ws,{type:'announcement',announcement}));return json(res,200,{ok:true,announcement});}\n"""
    if marker not in s: raise SystemExit('server admin players marker missing')
    s=s.replace(marker,api+marker,1)
p.write_text(s,encoding='utf-8')
# admin
p=root/'admin.html';s=p.read_text(encoding='utf-8')
if 'api/admin/announcement' not in s:
    old="function saveNotice(){const v=document.getElementById('noticeText').value.trim();if(v)localStorage.setItem('hcaAdminNotice',v);alert('Announcement saved on this admin browser. For all users, connect this field to a server/database announcement API.')}"
    new="""async function saveNotice(){const v=document.getElementById('noticeText').value.trim();if(!v){alert('Please enter an announcement.');return}try{const r=await api('/api/admin/announcement',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:v})});document.getElementById('noticeText').value=r.announcement.text||v;alert('Announcement saved for all users.')}catch(e){alert(e.message)}}\nasync function disableNotice(){if(!confirm('Disable the current announcement for all users?'))return;try{await api('/api/admin/announcement',{method:'DELETE'});document.getElementById('noticeText').value='';alert('Announcement disabled.')}catch(e){alert(e.message)}}\nasync function loadNotice(){try{const r=await fetch('/api/announcement',{cache:'no-store'}),j=await r.json();if(j.enabled)document.getElementById('noticeText').value=j.text||''}catch(e){}}"""
    s=s.replace(old,new,1)
    s=s.replace('<button class="btn" onclick="saveNotice()">Save Announcement</button>','<div class="row"><button class="btn" onclick="saveNotice()">Save Announcement</button><button class="btn danger" onclick="disableNotice()">Disable Announcement</button></div>',1)
    s=s.replace('load();','load();loadNotice();',1)
p.write_text(s,encoding='utf-8')
# player announcement
p=root/'Hand_Cricket_Arena.html';s=p.read_text(encoding='utf-8')
if 'id="hcaServerAnnouncement"' not in s:
    marker='            <div class="hca-panel" style="margin-top:10px">\n              <div style="font-size:13px;font-weight:900;text-align:left;margin-bottom:7px">PLAY</div>'
    ins='''            <div id="hcaServerAnnouncement" class="hca-panel" style="display:none;margin-top:10px;border-color:rgba(216,180,254,.25)">\n              <div style="font-size:13px;font-weight:900;text-align:left;margin-bottom:6px">📢 ANNOUNCEMENT</div>\n              <div id="hcaServerAnnouncementText" class="hca-help" style="font-size:13px;line-height:1.55"></div>\n            </div>\n'''
    if marker in s:s=s.replace(marker,ins+marker,1)
    script="""<script>async function hcaLoadServerAnnouncement(){try{const r=await fetch('/api/announcement',{cache:'no-store'});if(!r.ok)return;const d=await r.json(),b=document.getElementById('hcaServerAnnouncement'),t=document.getElementById('hcaServerAnnouncementText');if(!b||!t)return;if(d.enabled&&d.text){t.textContent=d.text;b.style.display='block'}else{t.textContent='';b.style.display='none'}}catch(e){}}window.addEventListener('load',hcaLoadServerAnnouncement);</script>"""
    s=s.replace('</head>',script+'</head>',1)
p.write_text(s,encoding='utf-8')
print('Announcement server/admin/player patch applied')
