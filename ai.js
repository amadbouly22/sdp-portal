// AI evaluation requests + rule-based pre-checks. All LLM output is a DRAFT written by the assistant agents, accepted/edited by the evaluator.
const PDFJS='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',PDFW='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',MAMMOTH='https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js';
function loadScript(u){return new Promise((r,j)=>{if(document.querySelector('script[src="'+u+'"]'))return r();const s=document.createElement('script');s.src=u;s.onload=r;s.onerror=()=>j(new Error('load '+u));document.head.appendChild(s)})}
async function extractText(file){
  const n=file.name.toLowerCase();
  if(n.endsWith('.pdf')){await loadScript(PDFJS);pdfjsLib.GlobalWorkerOptions.workerSrc=PDFW;const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;let t='';
    for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i);const c=await p.getTextContent();t+=c.items.map(x=>x.str+(x.hasEOL?'\n':' ')).join('')+'\n\n'}return t}
  if(n.endsWith('.docx')){await loadScript(MAMMOTH);const r=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});return r.value}
  return await file.text();
}
const ESC=/\b(if|when|usually|typically|generally|etc\.?|and so on|as needed|approximately|fast|quickly|easy|user[- ]friendly|reliable|good|robust)\b/i;
const UNIT=/\d+(\.\d+)?\s*(%|ms|s|sec|min|h|hours?|days?|months?|years?|hz|khz|mhz|ghz|v|mv|a|ma|w|mw|kw|wh|mah|m|cm|mm|km|kg|g|db|dbm|bps|kbps|mbps|gbps|sar|\$|usd|°c|c|lux|mb|gb|kb)\b/i;
function preChecks(txt){
  const L=String(txt||'').split('\n').map(s=>s.trim()).filter(Boolean),res=[];
  const add=(name,status,detail,ev)=>res.push({name,status,detail,evidence:ev||[]});
  const words=txt.split(/\s+/).filter(Boolean).length;
  add('Length',words>150?'ok':'warn',words+' words extracted'+(words<150?' (very short or scanned PDF without text)':''));
  const heads=[['Background',/background/i],['Problem statement',/problem\s+statement/i],['Objectives',/objectives?/i],['Design specifications',/(design\s+)?specifications?|requirements/i],['Constraints',/constraints?/i],['Engineering standards',/standards?/i],['Assumptions',/assumptions?/i],['Deliverables',/deliverables?/i],['Literature review',/literature\s+review/i],['Alternative designs',/alternative\s+design|conceptual\s+design/i],['Baseline design',/baseline/i],['Implementation',/implementation/i],['Validation',/validation|verification\s+experiments?/i],['Work plan',/work\s+plan|gantt|schedule/i],['References',/references|bibliography/i]];
  heads.forEach(([n,re])=>{const hit=L.find(l=>l.length<90&&re.test(l));add('Section: '+n,hit?'ok':'missing',hit?'heading found':'no heading found',hit?[hit]:[])});
  const si=L.findIndex(l=>l.length<60&&/(design\s+)?specifications?|requirements/i.test(l));
  const specs=si<0?[]:(()=>{const rest=L.slice(si+1,si+60);const e=rest.findIndex(l=>/^\d+\.\s+[A-Z][A-Za-z ]{2,40}$/.test(l));return e<0?rest:rest.slice(0,e)})().filter(l=>/\b(shall|should|must|will)\b|^\d+(\.\d+)*[ .)]/i.test(l)&&l.length<260);
  const noNum=specs.filter(l=>!UNIT.test(l)),esc=specs.filter(l=>ESC.test(l));
  add('Specs measurable (number + unit)',specs.length?(noNum.length?'flag':'ok'):'warn',specs.length?(specs.length-noNum.length)+' of '+specs.length+' spec lines have a number and unit':'no spec lines found',noNum.slice(0,6));
  add('Escape / vague words in specs',esc.length?'flag':'ok',esc.length+' spec lines with escape or vague words',esc.slice(0,6));
  const stds=[...new Set((txt.match(/\b(IEEE|IEC|ISO|IPC|ANSI|UL|ASTM|SASO|GSO)[\s\/-]*[A-Z0-9][A-Za-z0-9.\-:\/ ]{1,18}/g)||[]).map(s=>s.trim()))];
  add('Standards cited',stds.length?'ok':'flag',stds.length?stds.length+' found: '+stds.slice(0,8).join('; '):'no standard numbers found (every ECE project has applicable standards)',[]);
  const cites=(txt.match(/\[\d+(?:[,\u2013-]\s*\d+)*\]/g)||[]).length;
  add('Citations',cites>=5?'ok':'flag',cites+' bracket citations like [1] found');
  const alt=(txt.match(/\b(alternative|concept|option|design)\s*(#|no\.?)?\s*[1-9]\b/gi)||[]);
  add('Alternative designs mentioned',[...new Set(alt.map(s=>s.toLowerCase()))].length>=3?'ok':'warn',[...new Set(alt.map(s=>s.toLowerCase()))].length+' distinct numbered alternatives found (target 3 or more)');
  const ps=L.findIndex(l=>l.length<60&&/problem\s+statement/i.test(l));
  if(ps>=0){const p=L.slice(ps+1,ps+3).join(' ');const sol=/\b(using|by using|with a|through a|via)\b[^.]{0,60}\b(system|app|sensor|device|platform|algorithm|model|network)/i.test(p);add('Problem statement embeds a solution?',sol?'flag':'ok',sol?'wording suggests a solution is embedded':'no obvious embedded solution',[p.slice(0,260)])}
  return res;
}
const PCOL={ok:'#157347',warn:'#b26a00',flag:'#b42318',missing:'#b42318'};
function checksHtml(c){return '<table><tr><th>Check</th><th>Result</th><th>Detail / evidence (quoted from report)</th></tr>'+c.map(x=>`<tr><td>${esc(x.name)}</td><td style="color:${PCOL[x.status]};font-weight:600">${esc(x.status.toUpperCase())}</td><td>${esc(x.detail)}${x.evidence.map(e=>`<div class="hint">"${esc(e)}"</div>`).join('')}</td></tr>`).join('')+'</table>'}
function rubricSnapshot(st){const S=STAGES[st];return {stage:st,name:S.name,weight:S.w,groups:S.g.map(g=>({name:g[0],max:g[1],criteria:g[2]}))}}
const MODES=['Supervisor evaluation (own team)','External evaluation (another team)','Project proposal'];
let AI_TXT='',AI_FILE='';
function view_aieval(m){
  const reqs=(DB.evalreq||[]).slice().reverse();
  m.innerHTML=head('AI Evaluation','Upload a team report, see rule-based pre-checks, then request a skill-format draft evaluation. Nothing is scored automatically: every draft is yours to accept or edit.')+
  `<div class="panel"><h2>New request</h2><div class="grid2">
  <div><label>Team</label><select id="a_team">${DB.team.map(t=>`<option value="${t.id}">Team ${esc(t.no)} - ${esc(t.title)}</option>`).join('')}</select></div>
  <div><label>Stage</label><select id="a_stage">${Object.keys(STAGES).map(k=>`<option value="${k}">${esc(STAGES[k].name)}</option>`).join('')}</select></div>
  <div><label>Mode</label><select id="a_mode">${MODES.map(x=>`<option>${esc(x)}</option>`).join('')}</select></div>
  <div><label>Report file (PDF, DOCX or TXT)</label><input type="file" id="a_file" accept=".pdf,.docx,.txt,.md"></div></div>
  <label>Extracted text (edit if the extraction missed something)</label><textarea id="a_txt" rows="8" style="width:100%"></textarea>
  <div class="toolbar"><button class="btn" id="a_chk">Run pre-checks</button> <button class="btn" id="a_req">Request AI evaluation</button></div>
  <div id="a_out"></div></div>
  <div class="panel"><h2>Requests</h2>${reqs.length?`<table><tr><th>Date</th><th>Team</th><th>Stage</th><th>Mode</th><th>Status</th><th></th></tr>${reqs.map(r=>`<tr><td>${esc((r.created||'').slice(0,10))}</td><td>${esc(teamName(r.team))}</td><td>${esc(r.stage)}</td><td>${esc(r.mode)}</td><td><span class="chip">${esc(r.status)}</span></td><td><button class="btn sm" onclick="openReq('${r.id}')">Open</button></td></tr>`).join('')}</table>`:'<div class="hint">No requests yet.</div>'}</div>`;
  $('#a_file').onchange=async e=>{const f=e.target.files[0];if(!f)return;AI_FILE=f.name;$('#a_out').innerHTML='Extracting text...';try{AI_TXT=await extractText(f);$('#a_txt').value=AI_TXT;$('#a_out').innerHTML='Extracted '+AI_TXT.split(/\s+/).length+' words.'}catch(x){$('#a_out').innerHTML='<span style="color:#b42318">Could not read the file: '+esc(x.message)+'</span>'}};
  $('#a_chk').onclick=()=>{$('#a_out').innerHTML=checksHtml(preChecks($('#a_txt').value))};
  $('#a_req').onclick=async()=>{const txt=$('#a_txt').value.trim();if(!DB.team.length||txt.length<200){$('#a_out').innerHTML='<span style="color:#b42318">Select a team and provide the report text (at least 200 characters).</span>';return}
    const st=$('#a_stage').value;const ok=await save('evalreq',{team:$('#a_team').value,stage:st,mode:$('#a_mode').value,file:AI_FILE,status:'pending',report_text:txt,rubric:rubricSnapshot(st),prechecks:preChecks(txt),draft:'',notes:''});
    if(ok){route();const o=document.querySelector('#a_out');if(o)o.innerHTML='<b style="color:#157347">Request saved as PENDING.</b> The draft evaluation will appear in the Requests list below.'}};
}
function openReq(id){const r=DB.evalreq.find(x=>x.id===id);if(!r)return;
  openModal(`<h2>${esc(teamName(r.team))} - Stage ${esc(r.stage)} - ${esc(r.mode)}</h2><div class="hint">Status: <b>${esc(r.status)}</b>${r.file?' | file: '+esc(r.file):''}</div>
  <h3>Rule-based pre-checks</h3>${checksHtml(r.prechecks||[])}
  <h3>Draft evaluation ${r.draft?'(DRAFT written by the assistant; edit freely)':''}</h3>
  ${r.draft?`<textarea id="r_draft" rows="16" style="width:100%;font-family:monospace;font-size:12px">${esc(r.draft)}</textarea><label>Your notes / final marks</label><textarea id="r_notes" rows="3" style="width:100%">${esc(r.notes||'')}</textarea>`:'<div class="hint">Waiting for the assistant to write the draft.</div>'}
  <div class="toolbar">${r.draft?`<button class="btn" onclick="reqSave('${id}','accepted')">Save as accepted</button> <button class="btn" onclick="reqSave('${id}','draft')">Save edits</button> <button class="btn" onclick="reqDl('${id}')">Export</button> `:''}<button class="btn" onclick="closeModal()">Close</button></div>`)}
async function reqSave(id,status){const r=DB.evalreq.find(x=>x.id===id);const ok=await save('evalreq',{...r,id,draft:$('#r_draft').value,notes:$('#r_notes').value,status:status==='accepted'?'accepted':(r.status==='accepted'?'accepted':'draft-edited')});if(ok){closeModal();route()}}
function reqDl(id){const r=DB.evalreq.find(x=>x.id===id);dl('evaluation-'+teamName(r.team).replace(/\W+/g,'_')+'-stage'+r.stage+'.txt',`${teamName(r.team)}\nStage ${r.stage} - ${r.mode}\nStatus: ${r.status}\n\n${$('#r_draft')?$('#r_draft').value:r.draft}\n\nEvaluator notes:\n${$('#r_notes')?$('#r_notes').value:(r.notes||'')}\n`,'text/plain')}
