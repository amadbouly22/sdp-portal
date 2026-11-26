// generic form builder
function fieldHtml(f,v){
  v=v==null?'':v;const id='f_'+f.k;
  let inp;
  if(f.t==='area')inp=`<textarea id="${id}" style="min-height:${f.h||74}px" placeholder="${esc(f.ph||'')}">${esc(v)}</textarea>`;
  else if(f.t==='select')inp=`<select id="${id}">${f.o.map(o=>{const [val,lab]=Array.isArray(o)?o:[o,o];return `<option value="${esc(val)}" ${val==v?'selected':''}>${esc(lab)}</option>`}).join('')}</select>`;
  else inp=`<input type="${f.t||'text'}" id="${id}" value="${esc(v)}" placeholder="${esc(f.ph||'')}">`;
  return `<label>${esc(f.l)}</label>${inp}${f.hint?`<div class="hint">${esc(f.hint)}</div>`:''}`;
}
function readForm(fields){const o={};fields.forEach(f=>o[f.k]=document.getElementById('f_'+f.k).value);return o}
function teamDefaults(tid,fromReq){const t=DB.team.find(x=>x.id===tid);if(!t)return {};const d={};if(t.role==='Supervisor (own team)'||t.role==='External evaluator')d.role=t.role;if(t.pdf_stage&&typeof STAGES!=='undefined'&&STAGES[t.pdf_stage])d.stage=t.pdf_stage;if(t.term==='Term 1'||t.term==='Term 2')d.term=t.term;
  if(fromReq&&typeof MODES!=='undefined'){const rq=(DB.evalreq||[]).filter(r=>r.team===tid&&r.status!=='cancelled'&&(r.mode===MODES[0]||r.mode===MODES[1])).sort((a,b)=>String(a.created||'').localeCompare(String(b.created||''))).pop();if(rq){d.role=rq.mode===MODES[0]?'Supervisor (own team)':'External evaluator';if(rq.stage&&typeof STAGES!=='undefined'&&STAGES[rq.stage])d.stage=rq.stage;d.fromReq=rq.id}}
  return d}
function editRecord(kind,fields,title,id,after){
  const rec=id?DB[kind].find(x=>x.id===id):{};
  openModal(`<h3>${esc(title)}</h3>${fields.map(f=>fieldHtml(f,rec[f.k])).join('')}
  <div style="margin-top:16px;text-align:right"><button class="btn ghost" onclick="closeModal()">Cancel</button> <button class="btn" id="savebtn">Save</button></div>`);
  $('#savebtn').onclick=async()=>{const o={...(id?rec:{}),...readForm(fields)};if(id)o.id=id;if(after)after(o);if(await save(kind,o)){closeModal();route()}};
  if(kind==='meeting'&&$('#f_team')&&$('#f_term')){const sync=()=>{const d=teamDefaults($('#f_team').value);if(d.term)$('#f_term').value=d.term};if(!id)sync();$('#f_team').onchange=()=>{if(!id)sync()}}
}
function head(t,s,btn){return `<h1>${t}</h1><div class="sub">${s}</div>${btn?`<div class="toolbar">${btn}</div>`:''}`}
function empty(n){return n?'':'<div class="hint" style="padding:14px">Nothing yet. Use the button above to add the first one.</div>'}

// ---- IDEAS
const IDEA_F=[{k:'title',l:'Project title'},{k:'domain',l:'Domain',t:'select',o:['Embedded systems','Power & energy','Communications','Software & AI','Instrumentation','Control','Signal processing','Other']},
 {k:'by',l:'Proposed as',t:'select',o:['Customer','Supervisor','Customer + Supervisor']},{k:'status',l:'Status',t:'select',o:['Draft','Proposed','Approved','Assigned']},
 {k:'feas',l:'Feasibility (2 terms, 2-3 students)',t:'select',o:['High','Medium','Low']},{k:'team',l:'Assigned team (if any)',ph:'e.g. Team 4'},
 {k:'notes',l:'Notes: need, problem, approach ideas',t:'area',h:110}];
function view_ideas(m){
  m.innerHTML=head('Idea Bank','Capture project ideas. Status: Draft, Proposed, Approved, Assigned.','<button class="btn" id="add">+ New idea</button>')+
  `<div class="panel"><table><tr><th>Title</th><th>Domain</th><th>As</th><th>Feasibility</th><th>Status</th><th></th></tr>${DB.idea.map(r=>`<tr><td><b>${esc(r.title)}</b></td><td>${esc(r.domain)}</td><td>${esc(r.by)}</td><td>${esc(r.feas)}</td><td><span class="badge b-b">${esc(r.status)}${r.team?' - '+esc(r.team):''}</span></td><td><button class="btn sm ghost" data-e="${r.id}">Edit</button><button class="btn sm ghost" data-p="${r.id}">To proposal</button><button class="btn sm ghost" data-d="${r.id}">Delete</button></td></tr>`).join('')}</table>${empty(DB.idea.length)}</div>`;
  $('#add').onclick=()=>editRecord('idea',IDEA_F,'New idea');
  m.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>editRecord('idea',IDEA_F,'Edit idea',b.dataset.e));
  m.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>del(b.dataset.d));
  m.querySelectorAll('[data-p]').forEach(b=>b.onclick=async()=>{const r=DB.idea.find(x=>x.id===b.dataset.p);if(await save('proposal',{title:r.title,as:r.by,description:r.notes||'',status:'Draft',idea:r.id})){location.hash='proposals'}});
}
// ---- PROPOSALS (official format)
const PROP_F=[{k:'title',l:'Project title'},{k:'as',l:'Writing as',t:'select',o:['Customer','Supervisor','Customer + Supervisor']},{k:'intake',l:'Intake',ph:'e.g. Spring 2026'},{k:'status',l:'Status',t:'select',o:['Draft','Submitted to SDP Committee','Approved']},
 {k:'description',l:'Project description',t:'area',h:150,hint:'Paragraph 1: the problem and need. Paragraph 2: open-ended complexity. State the need, not the method.'},
 {k:'requirements',l:'Technical requirements (one per line)',t:'area',h:150,hint:'Measurable, with numbers and units. Needs only, no methods or tools. No escape words (if, when, usually, typically).'},
 {k:'product',l:'Final product',t:'area'},{k:'courses',l:'Recommended courses (course: why)',t:'area',h:90},{k:'skills',l:'Recommended skills',t:'area'},{k:'details',l:'Additional details',t:'area'}];
function checkReq(txt){const out=[];String(txt||'').split('\n').map(s=>s.trim()).filter(Boolean).forEach((l,i)=>{
 if(!/\d/.test(l))out.push(`Line ${i+1}: no number or unit, may not be measurable`);
 if(/\b(if|when|usually|typically|generally|often|normally|unless|except)\b/i.test(l))out.push(`Line ${i+1}: escape word`)});return out}
function propDoc(r){return `${r.title}\n\nProject Description\n${r.description}\n\nTechnical Requirements\n${String(r.requirements||'').split('\n').filter(Boolean).map(x=>'- '+x).join('\n')}\n\nFinal Product\n${r.product}\n\nRecommended Courses and Skills\nCourses:\n${r.courses}\nSkills:\n${r.skills}\n\nAdditional Details\n${r.details}\n`}
function view_proposals(m){
  m.innerHTML=head('Proposals','Official proposal format: title, description, technical requirements, final product, courses and skills, additional details.','<button class="btn" id="add">+ New proposal</button>')+
  `<div class="panel"><table><tr><th>Title</th><th>As</th><th>Status</th><th>Checks</th><th></th></tr>${DB.proposal.map(r=>{const w=checkReq(r.requirements);return `<tr><td><b>${esc(r.title)}</b></td><td>${esc(r.as)}</td><td>${esc(r.status)}</td><td>${w.length?`<span class="badge b-a">${w.length} to fix</span>`:'<span class="badge b-g">OK</span>'}</td><td><button class="btn sm ghost" data-e="${r.id}">Edit</button><button class="btn sm ghost" data-x="${r.id}">Download text</button><button class="btn sm ghost" data-d="${r.id}">Delete</button></td></tr>`}).join('')}</table>${empty(DB.proposal.length)}</div>`;
  $('#add').onclick=()=>editProp();
  m.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>editProp(b.dataset.e));
  m.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>del(b.dataset.d));
  m.querySelectorAll('[data-x]').forEach(b=>b.onclick=()=>{const r=DB.proposal.find(x=>x.id===b.dataset.x);dl(r.title.replace(/\W+/g,'_')+'.txt',propDoc(r),'text/plain')});
}
function editProp(id){editRecord('proposal',PROP_F,id?'Edit proposal':'New proposal',id);
  const t=document.getElementById('f_requirements');const h=document.createElement('div');h.className='warn';h.style.display='block';t.after(h);
  const upd=()=>{h.innerHTML=checkReq(t.value).map(esc).join('<br>')};t.oninput=upd;upd();}
function dl(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+text],{type:type+';charset=utf-8'}));a.download=name;a.click()}
// ---- TEAMS
const TEAM_F=[{k:'no',l:'Team no.'},{k:'title',l:'Project title'},{k:'members',l:'Members (name, university ID, specialty; one per line)',t:'area',h:90},
 {k:'advisor',l:'Advisor'},{k:'coadvisor',l:'Co-advisor'},{k:'customer',l:'Customer'},{k:'term',l:'Current term',t:'select',o:['Term 1','Term 2']},
 {k:'intake',l:'Intake',ph:'e.g. Fall 2025'},{k:'reg',l:'Registration',t:'select',o:['Pending','Formation form submitted','Approved by committee']},{k:'role',l:'My role',t:'select',o:['Supervisor (own team)','External evaluator']}];
function view_teams(m){
  m.innerHTML=head('Teams','Teams you supervise or evaluate.','<button class="btn" id="add">+ New team</button>')+
  `<div class="panel"><table><tr><th>Team</th><th>Project</th><th>Members</th><th>Term</th><th>Registration</th><th>My role</th><th>Report PDF</th><th></th></tr>${DB.team.map(r=>`<tr><td><b>${esc(r.no)}</b></td><td>${esc(r.title)}</td><td style="white-space:pre-line">${esc(r.members)}</td><td>${esc(r.term)}</td><td>${esc(r.reg)}</td><td>${esc(r.role)}</td><td>${pdfBar(r.id)}</td><td><button class="btn sm ghost" data-e="${r.id}">Edit</button><button class="btn sm ghost" data-d="${r.id}">Delete</button></td></tr>`).join('')}</table>${empty(DB.team.length)}</div>`;
  $('#add').onclick=()=>editRecord('team',TEAM_F,'New team');
  m.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>editRecord('team',TEAM_F,'Edit team',b.dataset.e));
  m.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>del(b.dataset.d));
}
// ---- MEETINGS
function meetF(){return [{k:'team',l:'Team',t:'select',o:DB.team.map(t=>[t.id,'Team '+t.no+' - '+t.title])},{k:'term',l:'Term',t:'select',o:['Term 1','Term 2']},{k:'date',l:'Date',t:'date'},
 {k:'attendees',l:'Attendees (members, advisor, customer)'},{k:'agenda',l:'Agenda',t:'area'},{k:'discussion',l:'Discussion points',t:'area'},{k:'followup',l:'Follow-up of the last meeting',t:'area'},{k:'decisions',l:'Decisions taken',t:'area'},{k:'actions',l:'Actions to do before next meeting',t:'area'}]}
function view_meetings(m){
  if(!DB.team.length){m.innerHTML=head('Meeting Minutes','Add a team first.')+'<div class="panel">Go to Teams and add a team.</div>';return}
  const cnt=(t,term)=>DB.meeting.filter(x=>x.team===t&&x.term===term).length;
  m.innerHTML=head('Meeting Minutes','Minimum 6 documented meetings per team per term (official template fields).','<button class="btn" id="add">+ Log meeting</button>')+
  `<div class="cards">${DB.team.map(t=>`<div class="card"><div class="n">Team ${esc(t.no)}</div><div class="l">${esc(t.title)}</div><div class="d">Term 1: <b>${cnt(t.id,'Term 1')}/6</b> &middot; Term 2: <b>${cnt(t.id,'Term 2')}/6</b></div></div>`).join('')}</div>
  <div class="panel"><table><tr><th>Date</th><th>Team</th><th>Term</th><th>Decisions</th><th>Actions</th><th></th></tr>${DB.meeting.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(teamName(r.team))}</td><td>${esc(r.term)}</td><td>${esc(r.decisions)}</td><td>${esc(r.actions)}</td><td><button class="btn sm ghost" data-e="${r.id}">Edit</button><button class="btn sm ghost" data-d="${r.id}">Delete</button></td></tr>`).join('')}</table>${empty(DB.meeting.length)}</div>`;
  $('#add').onclick=()=>editRecord('meeting',meetF(),'Log meeting minutes');
  m.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>editRecord('meeting',meetF(),'Edit minutes',b.dataset.e));
  m.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>del(b.dataset.d));
}
// ---- DOCS
function docF(){return [{k:'team',l:'Team',t:'select',o:DB.team.map(t=>[t.id,'Team '+t.no+' - '+t.title])},{k:'stage',l:'Stage',t:'select',o:['A Problem & Requirements','B Conceptual Designs','C Term 1 Report','D Progress Update','E Final Report','Meeting minutes','Other']},{k:'name',l:'File name or title'},{k:'url',l:'Link (Blackboard, Drive, etc.)'},{k:'date',l:'Date submitted',t:'date'},{k:'note',l:'Template check / notes',t:'area'}]}
function view_docs(m){
  if(!DB.team.length){m.innerHTML=head('Reports & Files','Add a team first.')+'<div class="panel">Go to Teams and add a team.</div>';return}
  const pdfs=[];const seen={};DB.team.forEach(t=>{if(t.pdf_path&&!seen[t.pdf_path]){seen[t.pdf_path]=1;pdfs.push({t:t.id,st:t.pdf_stage||'',n:t.pdf_name,p:t.pdf_path})}});(DB.evalreq||[]).forEach(r=>{if(r.team&&r.pdf_path&&!seen[r.pdf_path]){seen[r.pdf_path]=1;pdfs.push({t:r.team,st:r.stage,n:r.pdf_name||r.file,p:r.pdf_path})}});
  const pdate=p=>{const n=+((p.match(/\/(\d{12,14})-/)||[])[1]);return n?new Date(n).toISOString().slice(0,10):''};
  const stn=k=>k&&STAGES[k]?k+' - '+STAGES[k].name:(k||'');
  const nopdf=DB.team.filter(t=>!pdfs.some(x=>x.t===t.id));
  const pdfPanel=`<div class="panel"><h2>Stored report PDFs</h2><div class="hint">Every report PDF uploaded from any page is kept here, privately, and linked to its team.</div><table><tr><th>Team</th><th>Stage</th><th>File</th><th>Uploaded</th><th></th></tr>${pdfs.map(x=>`<tr><td>${esc(teamName(x.t))}</td><td>${esc(stn(x.st))}</td><td>${esc(x.n||'')}</td><td>${pdate(x.p)}</td><td><button class="btn sm ghost" onclick="viewPdf('${x.p}')">View</button> <button class="btn sm ghost" onclick="teamAttach('${x.t}')">Replace</button></td></tr>`).join('')}${nopdf.map(t=>`<tr><td>${esc(teamName(t.id))}</td><td></td><td><span class="chip" style="background:#fde8e8;color:#b42318">no PDF</span></td><td></td><td><button class="btn sm" onclick="teamAttach('${t.id}')">Attach PDF</button></td></tr>`).join('')}</table></div>`;
  m.innerHTML=head('Reports & Files','Stored report PDFs per team, and links to other submissions.','<button class="btn" id="add">+ Add link</button>')+pdfPanel+
  `<div class="panel"><h2>Links</h2><table><tr><th>Team</th><th>Stage</th><th>Title</th><th>Date</th><th>Notes</th><th></th></tr>${DB.document.map(r=>`<tr><td>${esc(teamName(r.team))}</td><td>${esc(r.stage)}</td><td>${r.url?`<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a>`:esc(r.name)}</td><td>${esc(r.date)}</td><td>${esc(r.note)}</td><td><button class="btn sm ghost" data-e="${r.id}">Edit</button><button class="btn sm ghost" data-d="${r.id}">Delete</button></td></tr>`).join('')}</table>${empty(DB.document.length)}</div>
  <div class="panel checks"><h2>Final report template chapters</h2>${['Ch.1 Introduction: background, problem statement, objectives, design requirements','Ch.2 Literature review with cited sources','Ch.3 At least 3 alternative designs, baseline design, cost estimate','Ch.4 Implementation: trials, calculations, changes justified, assembly photos','Ch.5 Validation experiments: objectives, plan, tools, data, analysis','Ch.6 Discussion: evaluation, impact, future work, conclusion','Appendices A-D: evaluation comments, team interactions, project management, ethics'].map(x=>`<label><input type="checkbox"> ${x}</label>`).join('')}</div>`;
  $('#add').onclick=()=>editRecord('document',docF(),'Add link');
  m.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>editRecord('document',docF(),'Edit',b.dataset.e));
  m.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>del(b.dataset.d));
}
