// Suggested evaluation: pre-fills the Evaluations form from the AI evaluation draft (never saved until the user commits)
const SUG_MODE={'Supervisor (own team)':'Supervisor evaluation (own team)','External evaluator':'External evaluation (another team)'};
function sugParse(draft,stage){
  const S=STAGES[stage],out={scores:{},comments:{},summary:'',n:0};
  S.g.forEach((g,gi)=>{out.scores[gi]=g[2].map(()=>null);out.comments[gi]=g[2].map(()=>'')});
  (draft||'').split(/\r?\n/).forEach(line=>{
    let m=line.match(/^SCORE\s*\|\s*(.+?)\s*\|\s*(\d+(?:\.\d+)?|n\/a)\s*\|\s*(.*)$/i);
    if(m){S.g.forEach((g,gi)=>g[2].forEach((c,ci)=>{if(c.toLowerCase()===m[1].toLowerCase()){const v=m[2].toLowerCase()==='n/a'?null:Math.max(0,Math.min(10,Math.round(+m[2])));out.scores[gi][ci]=v;out.comments[gi][ci]=m[3];if(v!=null)out.n++}}));return}
    m=line.match(/^SUMMARY\s*\|\s*(.*)$/i);if(m)out.summary=m[1];
  });
  // comments for n/a rows still come through
  return out;
}
function sugFind(team,stage,role){
  const mode=SUG_MODE[role];
  const rs=(DB.evalreq||[]).filter(r=>r.team===team&&r.stage===stage&&r.mode===mode);
  const ready=rs.filter(r=>r.draft&&/^SCORE\s*\|/im.test(r.draft)).pop();
  if(ready)return {state:'ready',req:ready,form:sugParse(ready.draft,stage)};
  const pend=rs.filter(r=>!r.draft).pop();
  if(pend)return {state:'pending',req:pend};
  const nos=rs.filter(r=>r.draft).pop();
  if(nos)return {state:'noscores',req:nos};
  return {state:'none'};
}
function sugSource(team,stage){ // report text available for this team and stage
  return (DB.evalreq||[]).filter(r=>r.team===team&&r.stage===stage&&r.report_text&&r.report_text.length>=200).pop();
}
function descOf(st,c){const d=(window.FORM_DESC||{})[st];if(!d||!d[c])return '';return '<details class="fdesc"><summary>Official form descriptors</summary>'+d[c].map((t,i)=>'<div><b>'+FORM_BANDS[i]+'</b>: '+esc(t)+'</div>').join('')+'</details>'}
function view_evals(m){
  if(!DB.team.length){m.innerHTML=head('Evaluations','Add a team first.')+'<div class="panel">Go to Teams and add a team.</div>';return}
  if(!EV.team||!DB.team.find(t=>t.id===EV.team))EV.team=DB.team[0].id;
  const S=STAGES[EV.stage];
  const saved=DB.evaluation.find(e=>e.team===EV.team&&e.stage===EV.stage&&e.role===EV.role);
  const sg=sugFind(EV.team,EV.stage,EV.role);
  const useSug=sg.state==='ready'&&(!saved||window.__loadSug);
  const src=useSug?{scores:sg.form.scores,comments:sg.form.comments,summary:sg.form.summary}:(saved||{scores:{},comments:{},summary:''});
  window.__loadSug=false;
  const tt=teamTotals(EV.team);
  const dt=sg.req?(sg.req.created||'').slice(0,10):'';
  let status='';
  if(saved)status=`<div class="flag good">Committed evaluation saved${saved.date?' on '+esc(saved.date):''}.${sg.state==='ready'?' A suggestion from the AI draft also exists (not applied).':''}</div>`;
  else if(sg.state==='ready')status=`<div class="flag sug">SUGGESTED by the AI evaluator (draft requested ${esc(dt)}). These scores and comments are not your decision until you review, edit and press Commit. Criteria marked "not scored" need your own judgment.</div>`;
  else if(sg.state==='pending')status=`<div class="flag sug">Suggestion requested ${esc(dt)}, waiting for the AI evaluator to write the draft. Sliders stay unset until then.</div>`;
  else if(sg.state==='noscores')status=`<div class="flag sug">An AI draft exists for this team, stage and mode, but it has no per-criterion scores. Open it under AI Evaluation, or request a new suggestion.</div>`;
  else status=`<div class="flag sug">No suggestion yet for this team, stage and mode. Sliders are unset (no default score).</div>`;
  const canReq=!saved&&(sg.state==='none'||sg.state==='noscores');
  const loadBtn=saved&&sg.state==='ready'?' <button class="btn ghost" id="loadsug">Load suggestion into form</button>':'';
  m.innerHTML=head('Evaluations','One evaluation per team per stage. Scores 0-10 per criterion, converted to the stage weight.')+
  `<div class="panel"><div class="row"><div><label>Team</label><select id="et">${DB.team.map(t=>`<option value="${t.id}" ${t.id===EV.team?'selected':''}>Team ${esc(t.no)} - ${esc(t.title)}</option>`).join('')}</select></div>
  <div><label>Stage</label><select id="es">${Object.keys(STAGES).map(k=>`<option value="${k}" ${k===EV.stage?'selected':''}>${STAGES[k].name} (${STAGES[k].w}%)</option>`).join('')}</select></div>
  <div><label>Evaluating as</label><select id="er">${['Supervisor (own team)','External evaluator'].map(r=>`<option ${r===EV.role?'selected':''}>${r}</option>`).join('')}</select></div></div>
  ${status}<div style="margin-top:8px">${canReq?'<button class="btn" id="reqsug">Suggest evaluation</button>':''}${loadBtn}<span id="sugmsg" class="hint"></span></div></div>
  <div class="row"><div class="panel" style="flex:2"><h2>${esc(S.name)}</h2>${S.g.map((g,gi)=>`<div class="scorebox"><b>${esc(g[0])}</b> <span class="chip">${g[1]} pts</span>${g[2].map((c,ci)=>{const v=((src.scores||{})[gi]||[])[ci];const unset=v==null;const cm=((src.comments||{})[gi]||[])[ci]||'';const tag=useSug?(unset?'<span class="chip">not scored by AI</span>':'<span class="badge sugb">SUGGESTED</span>'):'';return `<label>${esc(c)} ${tag}</label>${descOf(EV.stage,c)}<div class="range-wrap"><input type="range" min="0" max="10" value="${unset?0:v}" data-unset="${unset?1:0}" data-g="${gi}" data-c="${ci}" class="rng ${unset?'unset':''}"><span class="score-out">${unset?'-':v}</span></div><div class="band">${unset?'Not scored yet':BANDS(v)}</div><textarea style="min-height:${useSug&&cm?110:44}px" data-cg="${gi}" data-cc="${ci}" placeholder="Strengths, weaknesses, recommendation">${esc(cm)}</textarea>`}).join('')}</div>`).join('')}
  <label>Overall comments to the team ${useSug&&src.summary?'<span class="badge sugb">SUGGESTED</span>':''}</label><textarea id="sum" style="min-height:90px">${esc(src.summary||'')}</textarea>
  <div style="margin-top:14px;text-align:right"><span id="live" class="ok"></span> <button class="btn" id="saveev">${useSug?'Commit as my final evaluation':'Save evaluation'}</button></div>
  <div class="hint" style="margin-top:10px">Export for the official form (official form link not yet added): <button class="btn sm ghost" id="copyev">Copy</button> <button class="btn sm ghost" id="csvev">Download CSV</button> <button class="btn sm ghost" id="prtev">Print layout</button></div></div>
  <div class="panel"><h2>Weighted total (supervisor evaluations)</h2>${Object.keys(STAGES).map(k=>`<div class="kpi"><span>${k}. ${STAGES[k].name.split(' - ')[1]} (${STAGES[k].w}%)</span><b>${tt.out[k]!=null?tt.out[k].toFixed(1):'-'} / ${STAGES[k].w}</b></div>`).join('')}<div class="kpi total"><span>Running total</span><b>${tt.all.toFixed(1)} / 100</b></div>${flags(EV.team).map(x=>`<div class="flag ${x[0]}">${esc(x[1])}</div>`).join('')}<div class="hint" style="margin-top:8px">Only committed evaluations count here. Suggestions are never counted.</div></div></div>`;
  const recalc=()=>{let pts=0,miss=0;S.g.forEach((g,gi)=>{const a=[...m.querySelectorAll(`.rng[data-g="${gi}"]`)];a.forEach(x=>{if(x.dataset.unset==='1')miss++});pts+=a.map(x=>x.dataset.unset==='1'?0:+x.value).reduce((x,y)=>x+y,0)/a.length/10*g[1]});$('#live').textContent='This evaluation: '+pts.toFixed(1)+' / '+S.w+(miss?' ('+miss+' criteria not scored, counted as 0)':'')};
  m.querySelectorAll('.rng').forEach(r=>r.oninput=()=>{r.dataset.unset='0';r.classList.remove('unset');r.nextSibling.textContent=r.value;r.parentNode.nextSibling.textContent=BANDS(+r.value);const b=r.parentNode.previousSibling;if(b&&b.querySelector){const t=b.querySelector('.sugb');if(t){t.textContent='EDITED';t.classList.add('ed')}}recalc()});
  m.querySelectorAll('textarea[data-cg]').forEach(t=>t.addEventListener('input',()=>{const l=t.previousSibling&&t.previousSibling.previousSibling&&t.previousSibling.previousSibling.previousSibling;const b=l&&l.querySelector&&l.querySelector('.sugb');if(b){b.textContent='EDITED';b.classList.add('ed')}}));
  recalc();
  $('#et').onchange=e=>{EV.team=e.target.value;route()};$('#es').onchange=e=>{EV.stage=e.target.value;route()};$('#er').onchange=e=>{EV.role=e.target.value;route()};
  const collect=()=>{const scores={},comments={};S.g.forEach((g,gi)=>{scores[gi]=[...m.querySelectorAll(`.rng[data-g="${gi}"]`)].map(x=>x.dataset.unset==='1'?null:+x.value);comments[gi]=g[2].map((_,ci)=>m.querySelector(`[data-cg="${gi}"][data-cc="${ci}"]`).value)});return {team:EV.team,stage:EV.stage,role:EV.role,scores,comments,summary:$('#sum').value,date:new Date().toISOString().slice(0,10)}};
  $('#saveev').onclick=async()=>{const o=collect();if(o.scores&&Object.values(o.scores).flat().some(x=>x==null)&&!confirm('Some criteria are not scored. They count as 0 in the total. Commit anyway?'))return;if(saved&&saved.id)o.id=saved.id;if(useSug){o.committed=true;o.from_suggestion=sg.req.id}if(await save('evaluation',o))route()};
  if($('#reqsug'))$('#reqsug').onclick=async()=>{const s=sugSource(EV.team,EV.stage);const msg=$('#sugmsg');
    if(!s){msg.innerHTML=' <b style="color:#b42318">No report text for this team and stage is stored. Upload the report under AI Evaluation first.</b>';return}
    const ok=await save('evalreq',{team:EV.team,stage:EV.stage,mode:SUG_MODE[EV.role],file:s.file,status:'pending',report_text:s.report_text,rubric:rubricSnapshot(EV.stage),prechecks:preChecks(s.report_text,EV.stage),draft:'',notes:'',wants:'per-criterion SCORE lines for the Evaluations form'});
    if(ok)route()};
  if($('#loadsug'))$('#loadsug').onclick=()=>{if(confirm('Replace the form values with the AI suggestion? Your saved evaluation is not changed until you commit.')){window.__loadSug=true;window.__forceSug=true;route()}};
  const table=()=>{const o=collect();return S.g.flatMap((g,gi)=>g[2].map((c,ci)=>({group:g[0],weight:g[1],criterion:c,score:o.scores[gi][ci]==null?'':o.scores[gi][ci],comment:o.comments[gi][ci]})))};
  const OFF=!!(window.FORM_DESC&&FORM_DESC[EV.stage]);
  const offText=o=>{let t=FORM_TITLE+'\nEmail: amadbouly@kau.edu.sa\nEvaluator: Ayman I. Madbouly\nTeam: '+teamName(o.team)+'\n\n';let n=0;S.g.forEach((g,gi)=>{if(gi!==FORM_GROUP[EV.stage])return;g[2].forEach((c,ci)=>{t+=c+': '+(o.scores[gi][ci]==null?'(not scored)':o.scores[gi][ci])+'\n'})});const cm=[];S.g.forEach((g,gi)=>g[2].forEach((c,ci)=>{if(o.comments[gi][ci])cm.push(c+': '+o.comments[gi][ci])}));t+='\nComments:\n'+[o.summary].concat(cm).filter(Boolean).join('\n\n');return t};
  $('#copyev').onclick=()=>{const o=collect();if(OFF){navigator.clipboard.writeText(offText(o));$('#live').textContent='Copied (official form layout)';return}let t=`${teamName(o.team)}\nStage ${S.name}\nEvaluator role: ${o.role}\n`;table().forEach(r=>t+=`${r.criterion}: ${r.score===''?'not scored':r.score+'/10'} - ${r.comment}\n`);t+='\nOverall: '+o.summary;navigator.clipboard.writeText(t);$('#live').textContent='Copied'};
  $('#csvev').onclick=()=>{if(OFF){const o=collect();const r=[{Field:'Email',Value:'amadbouly@kau.edu.sa'},{Field:'Evaluator',Value:'Ayman I. Madbouly'},{Field:'Team',Value:teamName(o.team)}].concat(table().filter(x=>x.group===S.g[FORM_GROUP[EV.stage]][0]).map(x=>({Field:x.criterion,Value:x.score}))).concat([{Field:'Comments',Value:offText(o).split('Comments:\n')[1]||''}]);dl('official-form-team'+(DB.team.find(t=>t.id===EV.team)||{}).no+'-stage'+EV.stage+'.csv',csvOf(r),'text/csv');return}dl('evaluation-team'+(DB.team.find(t=>t.id===EV.team)||{}).no+'-stage'+EV.stage+'.csv',csvOf(table().map(r=>({Team:teamName(EV.team),Stage:S.name,Role:EV.role,Group:r.group,'Group weight':r.weight,Criterion:r.criterion,'Score (0-10)':r.score,Comment:r.comment}))),'text/csv')}
  $('#prtev').onclick=()=>{const o=collect();const w=window.open('','_blank');if(!w)return;w.document.write(`<title>Evaluation</title><body style="font-family:Arial;max-width:800px;margin:20px"><h2>${esc(teamName(o.team))}</h2><div>${esc(S.name)} | ${esc(o.role)} | ${esc(o.date)}</div>${S.g.map((g,gi)=>`<h3>${esc(g[0])} (${g[1]} pts)</h3><table border=1 cellpadding=6 style="border-collapse:collapse;width:100%"><tr><th>Criterion</th><th>Score /10</th><th>Comments</th></tr>${g[2].map((c,ci)=>`<tr><td>${esc(c)}</td><td align=center>${o.scores[gi][ci]==null?'-':o.scores[gi][ci]}</td><td>${esc(o.comments[gi][ci]).replace(/\n/g,'<br>')}</td></tr>`).join('')}</table>`).join('')}<h3>Overall</h3><p>${esc(o.summary).replace(/\n/g,'<br>')}</p><script>setTimeout(()=>print(),300)<\/script>`);w.document.close()};
}
