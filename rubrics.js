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
