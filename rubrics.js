// Rubrics as data: kind 'rubric' records, versioned per stage. The active (highest active version) overrides the built-in STAGES.
const BUILTIN=JSON.parse(JSON.stringify(STAGES));
function applyRubrics(){
  Object.keys(BUILTIN).forEach(k=>{STAGES[k]=JSON.parse(JSON.stringify(BUILTIN[k]))});
  Object.keys(STAGES).forEach(st=>{const a=(DB.rubric||[]).filter(r=>r.stage===st&&r.active).sort((x,y)=>y.version-x.version)[0];
    if(a){STAGES[st].g=a.groups.map(g=>[g.name,+g.max,g.criteria]);STAGES[st].w=a.groups.reduce((s,g)=>s+(+g.max),0);STAGES[st].ver=a.version}});
}
function rubricToText(S){return S.g.map(g=>'# '+g[0]+' | '+g[1]+'\n'+g[2].map(c=>'- '+c).join('\n')).join('\n\n')}
function parseRubricText(t){const groups=[];let cur=null;
  String(t||'').split('\n').map(s=>s.trim()).filter(Boolean).forEach(l=>{
    if(l[0]==='#'){const p=l.slice(1).split('|');cur={name:p[0].trim(),max:parseFloat(p[1])||0,criteria:[]};groups.push(cur)}
    else if(/^[-*\u2022]/.test(l)){if(!cur){cur={name:'Criteria',max:0,criteria:[]};groups.push(cur)}cur.criteria.push(l.replace(/^[-*\u2022]\s*/,''))}});
  return groups.filter(g=>g.criteria.length)}
function csvToRubricText(t){const rows=String(t).split(/\r?\n/).filter(Boolean).map(r=>r.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(c=>c.trim().replace(/^"|"$/g,'')));
  if(rows.length&&/group|section|category/i.test(rows[0][0]))rows.shift();
  const by={};rows.forEach(r=>{const g=r[0]||'Criteria';(by[g]=by[g]||{max:parseFloat(r[1])||0,c:[]}).c.push(r[2]||r[0])});
  return Object.keys(by).map(g=>'# '+g+' | '+by[g].max+'\n'+by[g].c.map(c=>'- '+c).join('\n')).join('\n\n')}
function guessRubricFromText(t){ // heuristic: lines that look like criteria; the evaluator must confirm
  const L=String(t).split('\n').map(s=>s.trim()).filter(s=>s.length>3&&s.length<140);
  return '# Imported group (edit name and max marks) | 0\n'+L.map(l=>'- '+l.replace(/^[\d.)\-\u2022*\s]+/,'')).join('\n')}
function view_rubrics(m){
  const st=location.hash.split(':')[1]||'A';
  const hist=(DB.rubric||[]).filter(r=>r.stage===st).sort((a,b)=>b.version-a.version);
  const S=STAGES[st];
  m.innerHTML=head('Rubrics','Criteria and marks per stage. Saving creates a new version; older versions are kept. The active version is used for marking and for AI evaluation requests.')+
  `<div class="panel"><div class="toolbar">${Object.keys(STAGES).map(k=>`<a class="btn sm" style="${k===st?'':'opacity:.55'}" href="#rubrics:${k}">Stage ${k}</a>`).join(' ')}</div>
  <h2>${esc(S.name)} - ${S.w} marks ${S.ver?'(version '+S.ver+')':'(built-in default)'}</h2>
  <div class="hint">Format: a line starting with # gives the group name and its maximum marks ("# Report | 15"); lines starting with - are criteria, each rated 0-10 and averaged within the group.</div>
  <textarea id="r_text" rows="14" style="width:100%;font-family:monospace;font-size:12px">${esc(rubricToText(S))}</textarea>
  <div class="grid2"><div><label>Upload a rubric (CSV: group,max,criterion | DOCX | PDF | TXT)</label><input type="file" id="r_file" accept=".csv,.docx,.pdf,.txt"></div><div><label>Version note</label><input id="r_note" placeholder="e.g. 2026 revision"></div></div>
  <div class="hint" id="r_msg">CSV loads exactly. DOCX/PDF are read as plain text and turned into a draft criteria list: check names and marks before saving.</div>
  <div class="toolbar"><button class="btn" id="r_save">Save as new version</button> ${hist.length?'<button class="btn" id="r_reset">Back to built-in default</button>':''}</div>
  ${hist.length?`<h3>Versions</h3><table><tr><th>Version</th><th>Date</th><th>Note</th><th>Marks</th><th>Active</th></tr>${hist.map(h=>`<tr><td>v${h.version}</td><td>${esc((h.created||'').slice(0,10))}</td><td>${esc(h.note||'')}</td><td>${h.groups.reduce((s,g)=>s+(+g.max),0)}</td><td>${h.active?'yes':''}</td></tr>`).join('')}</table>`:''}</div>`;
  $('#r_file').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const t=await extractText(f);$('#r_text').value=/\.csv$/i.test(f.name)?csvToRubricText(t):guessRubricFromText(t);$('#r_msg').textContent='Loaded '+f.name+'. Review the text, then save.'}catch(x){$('#r_msg').textContent='Could not read: '+x.message}};
  $('#r_save').onclick=async()=>{const g=parseRubricText($('#r_text').value);if(!g.length){$('#r_msg').textContent='No criteria found. Use "# Group | max" then "- criterion" lines.';return}
    if(g.some(x=>!x.max)){$('#r_msg').textContent='Every group needs maximum marks, e.g. "# Report | 15".';return}
    const ver=(hist[0]?hist[0].version:0)+1;
    for(const h of hist.filter(h=>h.active)){await save('rubric',{...h,active:false})}
    const ok=await save('rubric',{stage:st,version:ver,active:true,note:$('#r_note').value,groups:g});if(ok){applyRubrics();route()}};
  const rs=$('#r_reset');if(rs)rs.onclick=async()=>{for(const h of hist.filter(h=>h.active)){await save('rubric',{...h,active:false})}applyRubrics();route()};
}
// ---- Import rubric from a link (request queue: the assistant reads the link and writes a draft rubric back)
const RUB_LINK_MODE='Rubric from link';
(function(){
  const orig=view_rubrics;
  view_rubrics=function(m){
    orig(m);
    const st=location.hash.split(':')[1]||'A';
    const reqs=(DB.evalreq||[]).filter(r=>r.mode===RUB_LINK_MODE).slice().reverse();
    const stat=r=>!r.draft?'Waiting for the assistant to read the link':(/^RESTRICTED/i.test(r.draft)?'Needs your input':(r.status==='accepted'?'Loaded':'Draft ready'));
    const p=document.createElement('div');p.className='panel';
    p.innerHTML=`<h2>Import rubric from a link</h2><div class="hint">Paste the link to the evaluation form or rubric and choose the stage. A browser page cannot open Google Forms or sign-in pages itself, so this queues a request. The assistant reads the link and writes the criteria back as a DRAFT rubric for you to check. If the link is restricted, the reply here will ask you to paste the text or upload a PDF or screenshot. The paste box and the file upload above still work.</div>
    <div class="grid2"><div><label>Link (URL)</label><input id="rl_url" placeholder="https://..."></div><div><label>Stage</label><select id="rl_stage">${Object.keys(STAGES).map(k=>`<option ${k===st?'selected':''}>${k}</option>`).join('')}</select></div></div>
    <div class="toolbar"><button class="btn" id="rl_go">Queue import request</button> <span id="rl_msg" class="hint"></span></div>
    ${reqs.length?`<table><tr><th>Date</th><th>Stage</th><th>Link</th><th>Status</th><th></th></tr>${reqs.map(r=>`<tr><td>${esc((r.created||'').slice(0,10))}</td><td>${esc(r.stage)}</td><td style="max-width:240px;overflow:hidden;text-overflow:ellipsis"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.url)}</a></td><td>${esc(stat(r))}</td><td>${r.draft&&!/^RESTRICTED/i.test(r.draft)?`<button class="btn sm" data-rl="${r.id}">Load draft into editor</button>`:''}</td></tr>${r.draft&&/^RESTRICTED/i.test(r.draft)?`<tr><td colspan="5"><div class="flag sug">${esc(r.draft)}</div></td></tr>`:''}`).join('')}</table>`:''}`;
    m.appendChild(p);
    p.querySelector('#rl_go').onclick=async()=>{const u=p.querySelector('#rl_url').value.trim();const s=p.querySelector('#rl_stage').value;
      if(!/^https?:\/\//i.test(u)){p.querySelector('#rl_msg').textContent='Enter a full link starting with https://';return}
      if(await save('evalreq',{team:'',stage:s,mode:RUB_LINK_MODE,title:'Rubric import, stage '+s,url:u,status:'pending',report_text:'',draft:'',notes:'',prechecks:[]}))route()};
    p.querySelectorAll('[data-rl]').forEach(b=>b.onclick=()=>{const r=DB.evalreq.find(x=>x.id===b.dataset.rl);
      if(r.stage!==st){location.hash='#rubrics:'+r.stage;setTimeout(()=>{const t=document.querySelector('#r_text');if(t){t.value=r.draft;document.querySelector('#r_msg').textContent='Draft rubric loaded from the link request. Check names and marks, then save.'}},200);return}
      $('#r_text').value=r.draft;$('#r_msg').textContent='Draft rubric loaded from the link request. Check names and marks, then save.';window.scrollTo(0,0)});
  };
})();
