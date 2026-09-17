from pathlib import Path
p=Path('/mnt/data/v20work/Hand_Cricket_Arena.html')
s=p.read_text(encoding='utf-8')
# Insert multiplayer ball-by-ball panel
marker='    <div id="mpCommentary" class="mp-status">Match starting...</div>\n'
panel='''    <div id="mpCommentary" class="mp-status">Match starting...</div>\n    <div id="mpBallByBall" class="hca-panel" style="margin-top:10px;padding:9px;text-align:left;">\n      <b>🏏 Ball-by-Ball (Live)</b>\n      <div id="mpCurrentOver" class="mp-over-grid" style="margin-top:8px;"></div>\n      <div id="mpBallHistory" class="mp-ball-history" style="margin-top:8px;max-height:230px;overflow:auto;"></div>\n    </div>\n'''
if 'id="mpBallByBall"' not in s:
    if marker not in s: raise SystemExit('mp commentary marker not found')
    s=s.replace(marker,panel,1)
# Replace old multiplayer CSS overrides with guaranteed 7 columns
css_marker='@media(max-width:650px){#mpGame{padding:8px 6px!important}'
css_extra='''\n/* V20: 0-6 must stay on one horizontal line on every mobile width */\n#mpChoices.mp-choice-grid{grid-template-columns:repeat(7,minmax(0,1fr))!important;gap:4px!important;width:100%;box-sizing:border-box;}\n#mpChoices .mp-choice{min-width:0!important;width:100%;padding:9px 0!important;font-size:15px!important;min-height:40px!important;box-sizing:border-box;}\n.mp-over-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:5px;}\n.mp-ball-cell{min-width:0;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.10);border-radius:9px;padding:6px 3px;text-align:center;}\n.mp-ball-cell .ball-no{font-size:9px;color:var(--text-muted);display:block;}\n.mp-ball-cell .ball-result{font-size:14px;font-weight:900;display:block;margin-top:2px;}\n.mp-ball-cell.empty{opacity:.45;}\n.mp-over-title{font-size:11px;font-weight:900;margin-bottom:5px;}\n.mp-ball-history .mp-over-row{padding:7px 5px;border-bottom:1px solid rgba(255,255,255,.06);font-size:11px;}\n.mp-ball-history .mp-over-row b{color:var(--accent-neon);}\n@media(max-width:380px){#mpChoices.mp-choice-grid{gap:3px!important}.mp-over-grid{gap:3px}.mp-ball-cell{padding:5px 1px}.mp-ball-cell .ball-result{font-size:13px}}\n'''
if 'V20: 0-6 must stay on one horizontal line' not in s:
    s=s.replace('</style>',css_extra+'\n</style>',1)
# Add rendering helper before mpRenderState
fn='''function mpRenderBallByBall(s){\n const current=mpEl('mpCurrentOver'),history=mpEl('mpBallHistory');\n if(!current||!history)return;\n const balls=Array.isArray(s?.ballHistory)?s.ballHistory:[];\n if(!balls.length){current.innerHTML='<div class="mp-status" style="grid-column:1/-1">No balls yet.</div>';history.innerHTML='';return}\n const innings=Number(s.innings)||1;\n const innBalls=balls.filter(x=>Number(x.innings)===innings);\n const last=innBalls[innBalls.length-1];\n const overNo=last?Math.floor((Number(last.ball)-1)/6)+1:1;\n const overBalls=innBalls.filter(x=>Math.floor((Number(x.ball)-1)/6)+1===overNo);\n const team=String(s.teamNames?.[s.battingTeam]||('Team '+(s.battingTeam||'')));\n current.innerHTML=`<div style="grid-column:1/-1" class="mp-over-title">Over ${overNo} • ${mpEscape(team)} • ${overBalls[0]?mpEscape(overBalls[0].batter):'—'} vs ${overBalls[0]?mpEscape(overBalls[0].bowler):'—'}</div>`+Array.from({length:6},(_,i)=>{const b=overBalls.find(x=>((Number(x.ball)-1)%6)+1===i+1);const result=b?(b.out?'W':String(b.runs)):'—';return `<div class="mp-ball-cell ${b?'':'empty'}"><span class="ball-no">Ball ${i+1}</span><span class="ball-result">${result}</span></div>`}).join('');\n const groups={};\n balls.slice().reverse().forEach(b=>{const inn=Number(b.innings)||1;const ov=Math.floor((Number(b.ball)-1)/6)+1;const key=inn+'.'+ov;(groups[key]??=[]).push(b)});\n history.innerHTML=Object.entries(groups).map(([key,arr])=>{arr.reverse();const parts=arr.map(b=>{const n=((Number(b.ball)-1)%6)+1;const r=b.out?'W':String(b.runs);return `Ball ${n}: <b>${r}</b>`}).join(' • ');const first=arr[0];return `<div class="mp-over-row"><b>Inn ${key.split('.')[0]} • Over ${key.split('.')[1]}</b> — ${parts}<br><span class="mp-mini">${mpEscape(first?.batter||'')} vs ${mpEscape(first?.bowler||'')}</span></div>`}).join('');\n}\n'''
if 'function mpRenderBallByBall(s)' not in s:
    target='function mpRenderState(s){'
    if target not in s: raise SystemExit('mpRenderState marker not found')
    s=s.replace(target,fn+target,1)
# call helper after active line in mpRenderState
needle="mpEl('mpActive').innerText=`🏏 Active Batter: ${s.activeBatter||'—'}  |  ⚾ Active Bowler: ${s.activeBowler||'—'}`;"
if 'mpRenderBallByBall(s);' not in s:
    if needle not in s: raise SystemExit('mpActive line not found')
    s=s.replace(needle,needle+' mpRenderBallByBall(s);',1)
p.write_text(s,encoding='utf-8')
print('V20 player ball-by-ball + 0-6 patch applied')
