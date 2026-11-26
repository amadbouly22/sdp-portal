const BANDS=n=>n>=9?'Exemplary (9-10)':n>=7?'Satisfactory (7-8)':n>=5?'Developing (5-6)':n>=2?'Unsatisfactory (2-4)':'Unacceptable (0-1)';
// groups: [name, weight, [criteria]]
const STAGES={
 A:{name:'A - Identifying the Problem and Design Requirements',w:5,g:[['Report and presentation',5,['Background','Problem statement','Objectives: higher-level','Objectives: lower-level','Design specifications','Constraints','Engineering standards','Assumptions','Deliverables']]]},
 B:{name:'B - Conceptual Designs',w:8,g:[['Conceptual designs',8,['Literature review','Alternative designs (at least 3, different approaches)','Baseline design selection and justification']]]},
 C:{name:'C - Term 1 Report and Presentation',w:27,g:[['EE499 F26 Term 1 Conceptual Design (official form)',15,['Lower Level Objectives','Design Specifications','Constraints and Engineering Standards','Literature Review','Alternative Designs','Baseline Design']],['Advisor evaluation',12,['Advisor: teamwork and meetings','Advisor: progress and initiative']]]},
 D:{name:'D - Progress Update (Term 2)',w:5,g:[['Progress update',5,['A. Implementation: design calculations, justified baseline changes','B. Validation experiments: major parts and product, linked to specs','C. Work plan: achievable plan for remaining tasks']]]},
 E:{name:'E - Final Report and Presentation',w:55,g:[['Final report',22,['Implementation','Validation experiments','Discussion and conclusion']],['Presentation and prototype demo',15,['Presentation','Prototype demonstration']],['Advisor evaluation (Term 2)',18,['Advisor: work, initiative, teamwork']]]}
};
function stagePoints(ev,st){ // returns {pts,max}
  const S=STAGES[st];let pts=0;S.g.forEach((g,gi)=>{const sc=(ev.scores||{})[gi]||[];const arr=g[2].map((_,i)=>+(sc[i]==null?0:sc[i]));pts+=arr.reduce((a,b)=>a+b,0)/arr.length/10*g[1]});return {pts,max:S.w}}
function teamTotals(tid){
  const out={};let t1=0,t2=0;
  Object.keys(STAGES).forEach(st=>{const ev=DB.evaluation.find(e=>e.team===tid&&e.stage===st&&e.role!=='External evaluator');if(ev){const p=stagePoints(ev,st);out[st]=p.pts;if('ABC'.includes(st))t1+=p.pts;else t2+=p.pts}});
  return {out,t1,t2,all:t1+t2};
}
function flags(tid){const tt=teamTotals(tid);return [['good','Marks so far: Term 1 '+tt.t1.toFixed(1)+' / 40, running total '+tt.all.toFixed(1)+' / 100.']]}
// ---- DASHBOARD
function view_dashboard(m){
  const cnt=(t,term)=>DB.meeting.filter(x=>x.team===t&&x.term===term).length;
  m.innerHTML=head('Dashboard','Overview of teams, minutes and evaluations.')+
  `<div class="cards"><div class="card"><div class="n">${DB.team.length}</div><div class="l">Teams</div></div><div class="card"><div class="n">${DB.idea.length}</div><div class="l">Ideas in bank</div></div><div class="card"><div class="n">${DB.proposal.length}</div><div class="l">Proposals</div></div><div class="card"><div class="n">${DB.meeting.length}</div><div class="l">Meeting minutes logged</div></div><div class="card"><div class="n">${DB.evaluation.length}</div><div class="l">Evaluations saved</div></div></div>
  <div class="panel"><h2>Teams</h2><table><tr><th>Team</th><th>Project</th><th>Term</th><th>Minutes (this term)</th><th>Term 1 pts</th><th>Total pts</th><th>Report PDF</th><th>Alerts</th></tr>${DB.team.map(t=>{const tt=teamTotals(t.id),c=cnt(t.id,t.term),fl=flags(t.id);return `<tr><td><b>${esc(t.no)}</b></td><td>${esc(t.title)}</td><td>${esc(t.term)}</td><td>${c}/6${c<6?' <span class="badge b-a">below 6</span>':''}<div class="prog"><i style="width:${Math.min(100,c/6*100)}%"></i></div></td><td>${tt.t1.toFixed(1)} / 40</td><td>${tt.all.toFixed(1)} / 100</td><td>${pdfBar(t.id)}</td><td>${fl.map(x=>`<div class="flag ${x[0]}">${esc(x[1])}</div>`).join('')}</td></tr>`}).join('')}</table>${empty(DB.team.length)}</div>
  <div class="panel"><h2>Stages and weights</h2>${Object.keys(STAGES).map(k=>`<div class="kpi"><span>${STAGES[k].name}</span><b>${STAGES[k].w}%</b></div>`).join('')}<div class="hint" style="margin-top:8px">Fail rules: below 25% at end of Term 1, below 50% at end of Term 2, or an adverse report. IC grade at 50% or more with a failed major component. No late submissions (50% deduction exception via advisor and committee).</div></div>`;
}
// ---- EVALUATIONS
let EV={team:'',stage:'C',role:'Supervisor (own team)'};
function view_evals(m){
  if(!DB.team.length){m.innerHTML=head('Evaluations','Add a team first.')+'<div class="panel">Go to Teams and add a team.</div>';return}
  if(!EV.team||!DB.team.find(t=>t.id===EV.team))EV.team=DB.team[0].id;
  const S=STAGES[EV.stage];
  const ex=DB.evaluation.find(e=>e.team===EV.team&&e.stage===EV.stage&&e.role===EV.role)||{scores:{},comments:{},summary:''};
  const tt=teamTotals(EV.team);
  m.innerHTML=head('Evaluations','One evaluation per team per stage. Scores 0-10 per criterion, converted to the stage weight.')+
  `<div class="panel"><div class="row"><div><label>Team</label><select id="et">${DB.team.map(t=>`<option value="${t.id}" ${t.id===EV.team?'selected':''}>Team ${esc(t.no)} - ${esc(t.title)}</option>`).join('')}</select></div>
  <div><label>Stage</label><select id="es">${Object.keys(STAGES).map(k=>`<option value="${k}" ${k===EV.stage?'selected':''}>${STAGES[k].name} (${STAGES[k].w}%)</option>`).join('')}</select></div>
  <div><label>Evaluating as</label><select id="er">${['Supervisor (own team)','External evaluator'].map(r=>`<option ${r===EV.role?'selected':''}>${r}</option>`).join('')}</select></div></div></div>
  <div class="row"><div class="panel" style="flex:2"><h2>${esc(S.name)}</h2>${S.g.map((g,gi)=>`<div class="scorebox"><b>${esc(g[0])}</b> <span class="chip">${g[1]} pts</span>${g[2].map((c,ci)=>{const v=((ex.scores||{})[gi]||[])[ci];const val=v==null?7:v;return `<label>${esc(c)}</label><div class="range-wrap"><input type="range" min="0" max="10" value="${val}" data-g="${gi}" data-c="${ci}" class="rng"><span class="score-out">${val}</span></div><div class="band">${BANDS(val)}</div><textarea style="min-height:44px" data-cg="${gi}" data-cc="${ci}" placeholder="Strengths, weaknesses, recommendation">${esc(((ex.comments||{})[gi]||[])[ci]||'')}</textarea>`}).join('')}</div>`).join('')}
  <label>Overall comments to the team</label><textarea id="sum" style="min-height:90px">${esc(ex.summary||'')}</textarea>
  <div style="margin-top:14px;text-align:right"><span id="live" class="ok"></span> <button class="btn" id="saveev">Save evaluation</button> <button class="btn ghost" id="copyev">Copy for official form</button></div></div>
  <div class="panel"><h2>Weighted total (supervisor evaluations)</h2>${Object.keys(STAGES).map(k=>`<div class="kpi"><span>${k}. ${STAGES[k].name.split(' - ')[1]} (${STAGES[k].w}%)</span><b>${tt.out[k]!=null?tt.out[k].toFixed(1):'-'} / ${STAGES[k].w}</b></div>`).join('')}<div class="kpi total"><span>Running total</span><b>${tt.all.toFixed(1)} / 100</b></div>${flags(EV.team).map(x=>`<div class="flag ${x[0]}">${esc(x[1])}</div>`).join('')}<div class="hint" style="margin-top:8px">25% rule: percent of Term 1 points (40). 50% rule: percent of all 100 points.</div></div></div>`;
  const recalc=()=>{let pts=0;S.g.forEach((g,gi)=>{const a=[...m.querySelectorAll(`.rng[data-g="${gi}"]`)].map(x=>+x.value);pts+=a.reduce((x,y)=>x+y,0)/a.length/10*g[1]});$('#live').textContent='This evaluation: '+pts.toFixed(1)+' / '+S.w};
  m.querySelectorAll('.rng').forEach(r=>r.oninput=()=>{r.nextSibling.textContent=r.value;r.parentNode.nextSibling.textContent=BANDS(+r.value);recalc()});recalc();
  $('#et').onchange=e=>{EV.team=e.target.value;route()};$('#es').onchange=e=>{EV.stage=e.target.value;route()};$('#er').onchange=e=>{EV.role=e.target.value;route()};
  const collect=()=>{const scores={},comments={};S.g.forEach((g,gi)=>{scores[gi]=[...m.querySelectorAll(`.rng[data-g="${gi}"]`)].map(x=>+x.value);comments[gi]=g[2].map((_,ci)=>m.querySelector(`[data-cg="${gi}"][data-cc="${ci}"]`).value)});return {team:EV.team,stage:EV.stage,role:EV.role,scores,comments,summary:$('#sum').value,date:new Date().toISOString().slice(0,10)}};
  $('#saveev').onclick=async()=>{const o=collect();if(ex.id)o.id=ex.id;if(await save('evaluation',o))route()};
  $('#copyev').onclick=()=>{const o=collect();let t=`${teamName(o.team)}\nStage ${S.name}\n`;S.g.forEach((g,gi)=>g[2].forEach((c,ci)=>t+=`${c}: ${o.scores[gi][ci]}/10 - ${o.comments[gi][ci]}\n`));t+='\nOverall: '+o.summary;navigator.clipboard.writeText(t);$('#live').textContent='Copied'};
}
// ---- EXPORT
function csvOf(rows){const cols=[...new Set(rows.flatMap(r=>Object.keys(r)))];const q=v=>'"'+String(typeof v==='object'?JSON.stringify(v):(v==null?'':v)).replace(/"/g,'""')+'"';return [cols.map(q).join(',')].concat(rows.map(r=>cols.map(c=>q(r[c])).join(','))).join('\r\n')}
function view_export(m){
  m.innerHTML=head('Export','Download your data as CSV files that open in Excel. Your data lives in your own Supabase project.')+
  `<div class="panel">${Object.keys(DB).map(k=>`<div class="kpi"><span>${k} (${DB[k].length} records)</span><button class="btn sm ghost" data-k="${k}">Download CSV</button></div>`).join('')}<div style="margin-top:14px"><button class="btn" id="all">Download everything (JSON backup)</button></div></div>`;
  m.querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{const k=b.dataset.k;const rows=DB[k].map(r=>{const o={...r};if(o.team)o.team_label=teamName(o.team);return o});dl(k+'.csv',csvOf(rows),'text/csv')});
  $('#all').onclick=()=>dl('sdp_backup.json',JSON.stringify(DB,null,1),'application/json');
}
