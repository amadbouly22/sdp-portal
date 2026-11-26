// AI evaluation requests + rule-based pre-checks. All LLM output is a DRAFT written by the assistant agents, accepted/edited by the evaluator.
const PDFJS='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',PDFW='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',MAMMOTH='https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js';
function loadScript(u){return new Promise((r,j)=>{if(document.querySelector('script[src="'+u+'"]'))return r();const s=document.createElement('script');s.src=u;s.onload=r;s.onerror=()=>j(new Error('load '+u));document.head.appendChild(s)})}
async function extractText(file){
  const n=file.name.toLowerCase();return normText(await extractRaw(file,n));}
async function extractRaw(file,n){
  if(n.endsWith('.pdf')){await loadScript(PDFJS);pdfjsLib.GlobalWorkerOptions.workerSrc=PDFW;const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;let t='';
    for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i);const c=await p.getTextContent();t+=c.items.map(x=>x.str+(x.hasEOL?'\n':' ')).join('')+'\n\n'}return t}
  if(n.endsWith('.docx')){await loadScript(MAMMOTH);const r=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});return r.value}
  return new TextDecoder().decode(await file.arrayBuffer());
}
const ESC=/\b(if|when|usually|typically|generally|etc\.?|and so on|as needed|approximately|fast|quickly|easy|user[- ]friendly|reliable|good|robust)\b/i;
const UNIT=/\d+(\.\d+)?\s*(%|ms|s|sec|min|h|hours?|days?|months?|years?|hz|khz|mhz|ghz|v|mv|a|ma|w|mw|kw|wh|mah|m|cm|mm|km|kg|g|db|dbm|bps|kbps|mbps|gbps|sar|\$|usd|°c|c|lux|mb|gb|kb)\b/i;
const STAGE_SECS={A:['Background','Problem statement','Objectives','Design specifications','Constraints','Engineering standards','Assumptions','Deliverables'],B:['Literature review','Alternative designs','Baseline design','References'],C:['Background','Problem statement','Objectives','Design specifications','Constraints','Engineering standards','Assumptions','Deliverables','Literature review','Alternative designs','Baseline design','References'],D:['Implementation','Validation','Work plan','References'],E:['Implementation','Validation','Results','Conclusion','References']};
function preChecks(txt,stage){
  const L=String(txt||'').split('\n').map(s=>s.trim()).filter(Boolean),res=[];
  const add=(name,status,detail,ev)=>res.push({name,status,detail,evidence:ev||[]});
  const words=txt.split(/\s+/).filter(Boolean).length;
  add('Length',words>150?'ok':'warn',words+' words extracted'+(words<150?' (very short or scanned PDF without text)':''));
  const heads=[['Background',/background/i],['Problem statement',/problem\s+statement/i],['Objectives',/objectives?/i],['Design specifications',/(design\s+)?specifications?|requirements/i],['Constraints',/constraints?/i],['Engineering standards',/standards?/i],['Assumptions',/assumptions?/i],['Deliverables',/deliverables?/i],['Literature review',/literature\s+review/i],['Alternative designs',/alternative\s+design|conceptual\s+design/i],['Baseline design',/baseline/i],['Implementation',/implementation/i],['Validation',/validation|verification\s+experiments?/i],['Work plan',/work\s+plan|gantt|schedule/i],['Results',/results?|findings/i],['Conclusion',/conclusions?|discussion/i],['References',/references|bibliography/i]];
  const want=stage&&STAGE_SECS[stage]===undefined?null:(stage?STAGE_SECS[stage]:null);
  const chs=chaptersOf(txt);add('Chapters detected',Object.keys(chs).length?'ok':'warn',Object.keys(chs).length?Object.keys(chs).map(k=>k+' '+chs[k]).join('; '):'no "Chapter N" headings found');
  heads.filter(([n])=>!want||want.includes(n)).forEach(([n,re])=>{const hit=L.find(l=>l.length<90&&re.test(l));add('Section: '+n,hit?'ok':'missing',hit?'heading found':'no heading found',hit?[hit]:[])});
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
const MODES=['Supervisor evaluation (own team)','External evaluation (another team)','Project proposal','Write full proposal'];
let AI_TXT='',AI_FILE='';
function view_aieval(m){
  const reqs=(DB.evalreq||[]).slice().reverse();
  m.innerHTML=head('AI Evaluation','Upload a team report, see rule-based pre-checks, then request a skill-format draft evaluation. Nothing is scored automatically: every draft is yours to accept or edit.')+
  `<div class="panel"><h2>New request</h2><div class="grid2">
  <div><label>Team</label><select id="a_team">${DB.team.map(t=>`<option value="${t.id}">Team ${esc(t.no)} - ${esc(t.title)}</option>`).join('')}</select></div>
  <div><label>Stage</label><select id="a_stage">${Object.keys(STAGES).map(k=>`<option value="${k}" ${k==='C'?'selected':''}>${esc(STAGES[k].name)}</option>`).join('')}</select></div>
  <div><label>Mode</label><select id="a_mode">${MODES.slice(0,3).map(x=>`<option>${esc(x)}</option>`).join('')}</select></div>
  <div id="a_scale" class="hint" style="grid-column:1/-1"></div><div id="a_filebox"><label>Report file (PDF, DOCX or TXT)</label><input type="file" id="a_file" accept=".pdf,.docx,.txt,.md"></div></div>
  <label>Extracted text (edit if the extraction missed something)</label><textarea id="a_txt" rows="8" style="width:100%"></textarea>
  <div class="toolbar"><button class="btn" id="a_chk">Run pre-checks</button> <button class="btn" id="a_req">Request AI evaluation</button></div>
  <div id="a_out"></div></div>
  <div class="panel"><h2>Requests</h2>${reqs.length?`<table><tr><th>Date</th><th>Team</th><th>Stage</th><th>Mode</th><th>Status</th><th></th></tr>${reqs.map(r=>`<tr><td>${esc((r.created||'').slice(0,10))}</td><td>${esc(r.team?teamName(r.team):(r.title||'-'))}</td><td>${esc(r.stage)}</td><td>${esc(r.mode)}</td><td><span class="chip">${esc(r.status)}</span></td><td><button class="btn sm" onclick="openReq('${r.id}')">Open</button></td></tr>`).join('')}</table>`:'<div class="hint">No requests yet.</div>'}</div>`;
  $('#a_file').onchange=async e=>{const f=e.target.files[0];if(!f)return;AI_FILE=f.name;$('#a_out').innerHTML='Extracting text...';try{AI_TXT=await extractText(f);$('#a_txt').value=AI_TXT;$('#a_out').innerHTML='Extracted '+AI_TXT.split(/\s+/).length+' words.'}catch(x){$('#a_out').innerHTML='<span style="color:#b42318">Could not read the file: '+esc(x.message)+'</span>'}};
  const modeUi=()=>{const mo=$('#a_mode').value,pr=mo===MODES[2];$('#a_filebox').style.display=pr?'none':'';$('#a_stage').disabled=pr;$('#a_chk').style.display=pr?'none':'';$('#a_scale').innerHTML=pr?'Proposal mode: describe the topic, area, student level and any constraints below. The assistant drafts 3 to 5 proposals in the skill template (no report needed).':'Rating scale: 9-10 Exemplary, 7-8 Satisfactory, 5-6 Developing, 2-4 Unsatisfactory, 0-1 Unacceptable. '+(mo===MODES[1]?'External mode: objective examiner tone, numeric rating per section.':'Supervisor mode: formative feedback, firm and constructive.')};
  $('#a_mode').onchange=modeUi;modeUi();
  $('#a_chk').onclick=()=>{$('#a_out').innerHTML=checksHtml(preChecks($('#a_txt').value,$('#a_stage').value))};
  $('#a_req').onclick=async()=>{const txt=$('#a_txt').value.trim();const prop=$('#a_mode').value===MODES[2];if(!prop&&(!DB.team.length||txt.length<200)||prop&&txt.length<20){$('#a_out').innerHTML='<span style="color:#b42318">Select a team and provide the report text (at least 200 characters; for proposals describe the topic).</span>';return}
    const st=prop?'-':$('#a_stage').value;const ok=await save('evalreq',{team:prop?'':$('#a_team').value,stage:st,mode:$('#a_mode').value,file:AI_FILE,status:'pending',report_text:txt,rubric:prop?null:rubricSnapshot(st),prechecks:prop?[]:preChecks(txt,st),draft:'',notes:''});
    if(ok){route();const o=document.querySelector('#a_out');if(o)o.innerHTML='<b style="color:#157347">Request saved as PENDING.</b> The draft evaluation will appear in the Requests list below.'}};
}
function openReq(id){const r=DB.evalreq.find(x=>x.id===id);if(!r)return;
  openModal(`<h2>${esc(r.team?teamName(r.team):(r.title||'Idea request'))} - ${r.team?'Stage '+esc(r.stage)+' - ':''}${esc(r.mode)}</h2>${r.brief?'<div class="hint">Brief: '+esc(r.brief)+(r.count?' | ideas: '+esc(r.count):'')+(r.constraints?' | constraints: '+esc(r.constraints):'')+'</div>':''}<div class="hint">Status: <b>${esc(r.status)}</b>${r.file?' | file: '+esc(r.file):''}</div>
  ${r.team?'<h3>Rule-based pre-checks</h3>'+checksHtml(r.prechecks||[]):''}
  <h3>Draft evaluation ${r.draft?'(DRAFT written by the assistant; edit freely)':''}</h3>
  ${r.draft?`<textarea id="r_draft" rows="16" style="width:100%;font-family:monospace;font-size:12px">${esc(r.draft)}</textarea><label>Your notes / final marks</label><textarea id="r_notes" rows="3" style="width:100%">${esc(r.notes||'')}</textarea>`:'<div class="hint">Waiting for the assistant to write the draft.</div>'}
  <div class="toolbar">${r.draft?`<button class="btn" onclick="reqSave('${id}','accepted')">Save as accepted</button> <button class="btn" onclick="reqSave('${id}','draft')">Save edits</button> <button class="btn" onclick="reqDl('${id}')">Export</button> ${r.mode===MODES[3]?`<button class="btn" onclick="propFromDraft('${id}')">Create proposal from draft</button> `:''}`:''}<button class="btn" onclick="closeModal()">Close</button></div>`)}
async function reqSave(id,status){const r=DB.evalreq.find(x=>x.id===id);const ok=await save('evalreq',{...r,id,draft:$('#r_draft').value,notes:$('#r_notes').value,status:status==='accepted'?'accepted':(r.status==='accepted'?'accepted':'draft-edited')});if(ok){closeModal();route()}}
function reqDl(id){const r=DB.evalreq.find(x=>x.id===id);dl('evaluation-'+teamName(r.team).replace(/\W+/g,'_')+'-stage'+r.stage+'.txt',`${teamName(r.team)}\nStage ${r.stage} - ${r.mode}\nStatus: ${r.status}\n\n${$('#r_draft')?$('#r_draft').value:r.draft}\n\nEvaluator notes:\n${$('#r_notes')?$('#r_notes').value:(r.notes||'')}\n`,'text/plain')}

// ---- Team import from a report title page (rule-based; the evaluator confirms every field)
function normText(t){return String(t||'').replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\b([A-Z]) (?=[A-Z]{2,}\b)/g,'$1')}
function chaptersOf(txt){const seen={};normText(txt).split('\n').forEach(l=>{const m=l.trim().match(/^chapter\s+(\d{1,2})\s*[:.\-]?\s+([A-Za-z][^\n.]{2,70}?)\s*(?:\.{2,}.*|\s+\d{1,3})?$/i);if(m&&!seen[m[1]])seen[m[1]]=m[2].replace(/\s*\.+\s*$/,'').trim()});return seen}
function detectStage(txt){const low=normText(txt).slice(0,5000).toLowerCase();const ch=chaptersOf(txt),nums=Object.keys(ch).map(Number),mx=nums.length?Math.max(...nums):0,titles=Object.values(ch).join(' ').toLowerCase();
  if(/final (project )?report/.test(low))return 'E';
  if(/progress (update|report)/.test(low))return 'D';
  if(mx>=4)return /conclusion|discussion|results?|impact/.test(titles)?'E':'D';
  if(/conceptual design/.test(low.slice(0,1500))&&mx<3)return 'B';
  if(mx&&mx<=3||/chapter/.test(low))return 'C';
  return /problem (definition|statement)|design requirements/.test(low.slice(0,1500))?'A':'C'}
function parseTitlePage(txt){
  const L=normText(txt).split('\n').map(s=>s.replace(/\s+/g,' ').trim()).filter(Boolean).slice(0,70);
  const clean=s=>s.replace(/_+/g,'').replace(/\s*[-\u2013]\s*/g,' - ').replace(/\s+/g,' ').trim();
  const isPh=s=>/_{3,}/.test(s)&&clean(s).replace(/[:\-\s]|name|signature|date/gi,'').length<2;
  const HEAD=/^(project\s+)?(advisor|supervisor|customer|co-?\s*advisor|co-?\s*supervisor)\s*:?$/i;
  const GEN=/project description|technical requirements|university|faculty|department|college|kingdom|ministry|senior design|ee\s*-?\s*499|course|semester|intake|report\b|submitted|prepared|supervis|advisor|customer|team\s*no|student|date|table of contents|abstract|fall|spring|summer|\b\d{4}\b|jeddah|saudi/i;
  // title: lines before "By", else first plausible line
  let title='';const byI=L.findIndex(l=>/^by:?$/i.test(l));
  const ti=L.findIndex(l=>/^(project\s+title|title)\s*[:\-]/i.test(l));
  if(ti>=0)title=L[ti].replace(/^[^:\-]*[:\-]\s*/,'').trim()||L[ti+1]||'';
  else if(byI>0&&byI<=5){const parts=L.slice(0,byI).filter(l=>!GEN.test(l));title=parts.join(' ')}
  if(!title){const i=L.findIndex(l=>l.length>=15&&l.length<150&&!GEN.test(l));if(i>=0){title=L[i];const n=L[i+1];if(n&&n.length<100&&!GEN.test(n)&&!/^\d/.test(n)&&/^[a-z(]|^(for|in|of|and|with|using|based)\b/i.test(n))title+=' '+n}}
  // members: name + 6-9 digit ID + optional specialty, after "By" / "Prepared by" / "Team members"
  const mem=[];const stop=/team\s*no|advisor|supervisor|customer|university|faculty|department|intake|^a senior design/i;
  let bi=byI>=0?byI:L.findIndex(l=>/^(prepared by|submitted by|team members?|students?|group members?)\s*:?/i.test(l));
  const rowRe=/^(.+?)\s*[,|\-\u2013:]?\s*(\d{6,9})\s*[,|\-\u2013:]?\s*([A-Za-z]{2,6})?\s*$/;
  if(bi>=0){const first=L[bi].replace(/^[^:]*:\s*/,'');const cand=(first&&first!==L[bi]?[first]:[]).concat(L.slice(bi+1,bi+8));
    for(const l of cand){if(stop.test(l))break;const m=l.match(rowRe);if(m){const nm=clean(m[1]);if(nm.length>2)mem.push(nm+', '+m[2]+(m[3]?', '+m[3].toUpperCase():''))}else if(/^[A-Za-z][A-Za-z.'\- ]{4,45}$/.test(l)&&l.split(' ').length>=2&&!HEAD.test(l))mem.push(clean(l))}}
  if(!mem.length)L.forEach(l=>{const m=l.match(rowRe);if(m&&clean(m[1]).split(' ').length>=2)mem.push(clean(m[1])+', '+m[2]+(m[3]?', '+m[3].toUpperCase():''))});
  // role lines: heading on its own line, value on the next line; or inline "Role: value"
  const role=(re)=>{for(let i=0;i<L.length;i++){const l=L[i];let m=l.match(new RegExp('^(?:project\\s+)?'+re+'\\s*(?:name)?\\s*:\\s*(.+)$','i'));if(m&&!isPh(m[1])){const v=clean(m[1]);if(v.length>2)return v}
      if(new RegExp('^(?:project\\s+)?'+re+'\\s*:?$','i').test(l)){const n=L[i+1];if(n&&!HEAD.test(n)&&!isPh(n)&&!/^(signature|date)/i.test(n)&&clean(n).length>2)return clean(n)}}return ''};
  const co=role('co-?\\s*(?:advisor|supervisor)');
  let adv=role('(?:advisor|supervisor)');if(adv===co)adv='';
  const cust=role('customer');
  const no=((L.join('\n').match(/team\s*(?:no\.?|number|#)?\s*[:\-.]*\s*_*\s*([A-Za-z]?\d{1,3})(?!\d)/i)||[])[1]||'');
  const im=L.join(' ').match(/\b(fall|spring|summer)\s*(\d{4})\s*(?:intake)?/i);const intake=im?(im[1][0].toUpperCase()+im[1].slice(1).toLowerCase()+' '+im[2]):'';
  const low=normText(txt).slice(0,4000).toLowerCase();
  const stage=detectStage(txt);
  return {title:clean(title),members:mem.join('\n'),advisor:adv,coadvisor:co,customer:cust,no,intake,stage,term:'ED'.includes(stage)?'Term 2':'Term 1'};
}
function sourceLines(txt,p){const L=normText(txt).split('\n').map(s=>s.replace(/\s+/g,' ').trim()).filter(Boolean).slice(0,80);const U=s=>String(s).toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
  const find=v=>{const k=U(v).slice(0,22);if(!k)return -1;return L.findIndex(l=>U(l).includes(k))};
  const q=i=>i<0?'not found on the title page':'"'+L[i]+'"';const s={};
  s.title=q(find(p.title.split(' ')[0]+' '+(p.title.split(' ')[1]||'')));
  s.members=p.members.split('\n').filter(Boolean).map(m=>{const id=(m.match(/\d{6,9}/)||[''])[0];const i=id?L.findIndex(l=>l.includes(id)):find(m);return q(i)}).join(' ; ')||'none found';
  const role=(v,re)=>{const k=U(v).slice(0,22);let i=L.findIndex((l,x)=>U(l).includes(k)&&x>0&&re.test(L[x-1]));if(i<0)i=find(v);if(i<0)return 'not found';return (i>0&&re.test(L[i-1])?'"'+L[i-1]+'" then ':'')+'"'+L[i]+'"'};
  s.advisor=p.advisor?role(p.advisor,/advisor|supervisor/i):'no advisor name found (blank signature line ignored)';
  s.coadvisor=p.coadvisor?role(p.coadvisor,/co-?\s*(advisor|supervisor)/i):'none found';
  s.customer=p.customer?role(p.customer,/customer/i):'none found';
  const ni=L.findIndex(l=>/team\s*(no|number|#)/i.test(l));s.no=p.no?q(ni):'no team number found';
  const ii=L.findIndex(l=>/intake|\b(fall|spring|summer)\s*\d{4}/i.test(l));s.intake=p.intake?q(ii):'none found';
  const ch=chaptersOf(txt),ks=Object.keys(ch);s.stage='chapters found: '+(ks.length?ks.map(k=>k+' '+ch[k]).join('; '):'none')+'; title page wording "progress"/"final" checked. The file name is not used.';
  return s}
let IMP_TXT='',IMP_FILE='';
function importTeamModal(){
  openModal(`<h2>Import team from a report</h2><div class="hint">Upload the report (PDF/DOCX). The title page is read in your browser; check every field before saving.</div>
  <input type="file" id="i_file" accept=".pdf,.docx,.txt"><div id="i_msg" class="hint"></div><div id="i_form" style="display:none">
  <label>Team no.</label><input id="i_no"><div class="hint" id="s_no"></div><label>Project title</label><input id="i_title"><div class="hint" id="s_title"></div><label>Members (one per line)</label><textarea id="i_mem" rows="4"></textarea><div class="hint" id="s_members"></div>
  <label>Advisor</label><input id="i_adv"><div class="hint" id="s_advisor"></div><label>Co-advisor</label><input id="i_co"><div class="hint" id="s_coadvisor"></div><label>Customer</label><input id="i_cust"><div class="hint" id="s_customer"></div><label>Intake</label><input id="i_intake"><div class="hint" id="s_intake"></div><label>Report stage</label><select id="i_stage">${Object.keys(STAGES).map(k=>`<option value="${k}" ${k==='C'?'selected':''}>${esc(STAGES[k].name)}</option>`).join('')}</select><div class="hint" id="s_stage"></div>
  <label>Current term</label><select id="i_term"><option>Term 1</option><option>Term 2</option></select>
  <label><input type="checkbox" id="i_q" checked> Also queue an AI evaluation request for this report (supervisor mode)</label>
  <div class="toolbar"><button class="btn" id="i_save">Confirm and add team</button> <button class="btn" onclick="closeModal()">Cancel</button></div></div>`);
  $('#i_file').onchange=async e=>{const f=e.target.files[0];if(!f)return;IMP_FILE=f.name;$('#i_msg').textContent='Reading...';
    try{IMP_TXT=await extractText(f);const p=parseTitlePage(IMP_TXT);$('#i_no').value=p.no;$('#i_title').value=p.title;$('#i_mem').value=p.members;$('#i_adv').value=p.advisor;$('#i_co').value=p.coadvisor;$('#i_cust').value=p.customer;$('#i_intake').value=p.intake;$('#i_stage').value=p.stage;$('#i_term').value=p.term;$('#i_form').style.display='';const sl=sourceLines(IMP_TXT,p);Object.keys(sl).forEach(k=>{const e=$('#s_'+k);if(e)e.textContent='Source: '+sl[k]});const ch=chaptersOf(IMP_TXT);$('#i_msg').textContent='Extracted '+IMP_TXT.split(/\s+/).length+' words. Chapters found: '+(Object.keys(ch).length?Object.keys(ch).map(k=>k+' '+ch[k]).join('; '):'none')+'. Stage guessed from the chapters (1-3 = Term 1 report; 4 or more = progress update or final). Fields are guesses: check them.'}catch(x){$('#i_msg').textContent='Could not read: '+x.message}};
  $('#i_save').onclick=async()=>{const t={no:$('#i_no').value,title:$('#i_title').value,members:$('#i_mem').value,advisor:$('#i_adv').value,coadvisor:$('#i_co').value,customer:$('#i_cust').value,term:$('#i_term').value,intake:$('#i_intake').value,reg:'Pending',role:'Supervisor (own team)'};
    if(!t.title){$('#i_msg').textContent='Project title is required.';return}
    const before=DB.team.map(x=>x.id);if(!(await save('team',t)))return;const nt=DB.team.find(x=>!before.includes(x.id));const st=$('#i_stage').value;
    if($('#i_q').checked&&nt&&IMP_TXT.length>=200)await save('evalreq',{team:nt.id,stage:st,mode:MODES[0],file:IMP_FILE,status:'pending',report_text:IMP_TXT,rubric:rubricSnapshot(st),prechecks:preChecks(IMP_TXT,st),draft:'',notes:''});
    closeModal();route()};
}
const _vt=view_teams;view_teams=function(m){_vt(m);const tb=m.querySelector('.toolbar');if(tb){const b=document.createElement('button');b.className='btn';b.style.marginLeft='8px';b.textContent='Import from report';b.onclick=importTeamModal;tb.appendChild(b)}};

// ---- Idea Bank requests (skill Mode 1) and proposal writing
function ideaReqModal(){openModal(`<h2>Request new project ideas</h2><div class="hint">The assistant drafts ideas in the skill template (background, problem statement, objectives, methodology, technologies, deliverables, standards, feasibility). You choose which to keep.</div>
  <label>Topic or area</label><input id="q_topic" placeholder="e.g. embedded systems for healthcare"><label>Number of ideas</label><select id="q_n"><option>3</option><option>4</option><option>5</option></select>
  <label>Constraints (budget, tools, student level, customer)</label><textarea id="q_con" rows="3"></textarea><label>Proposed as</label><select id="q_by"><option>Supervisor</option><option>Customer</option><option>Customer + Supervisor</option></select>
  <div class="toolbar"><button class="btn" id="q_go">Request ideas</button> <button class="btn" onclick="closeModal()">Cancel</button></div><div id="q_msg" class="hint"></div>`);
  $('#q_go').onclick=async()=>{const t=$('#q_topic').value.trim();if(!t){$('#q_msg').textContent='Enter a topic or area.';return}
    if(await save('evalreq',{team:'',stage:'-',mode:MODES[2],title:'Ideas: '+t,brief:t,count:$('#q_n').value,constraints:$('#q_con').value,by:$('#q_by').value,status:'pending',report_text:'',draft:'',notes:'',prechecks:[]})){closeModal();location.hash='#aieval'}}}
async function proposalReq(id){const r=DB.idea.find(x=>x.id===id);if(!r)return;
  if(await save('evalreq',{team:'',stage:'-',mode:MODES[3],title:'Proposal: '+r.title,brief:r.title+(r.notes?'\n'+r.notes:''),idea:id,by:r.by,status:'pending',report_text:'',draft:'',notes:'',prechecks:[]})){location.hash='#aieval'}}
function propFromDraft(id){const r=DB.evalreq.find(x=>x.id===id);const t=($('#r_draft')?$('#r_draft').value:r.draft)||'';
  const sec=(a,b)=>{const m=t.match(new RegExp(a+'\\s*\\n([\\s\\S]*?)(?=\\n\\s*(?:'+b+')\\s*\\n|$)','i'));return m?m[1].trim():''};
  const H='Project Description|Technical Requirements|Final Product|Recommended Courses and Skills|Additional Details';
  const idea=DB.idea.find(x=>x.id===r.idea);
  const cs=sec('Recommended Courses and Skills','Additional Details');const ci=cs.search(/skills\s*:/i);
  save('proposal',{title:idea?idea.title:(r.title||'').replace(/^Proposal:\s*/,''),as:r.by||'Supervisor',intake:'',status:'Draft',description:sec('Project Description','Technical Requirements'),requirements:sec('Technical Requirements','Final Product').replace(/^[-*\u2022]\s*/gm,''),product:sec('Final Product','Recommended Courses and Skills'),courses:ci<0?cs:cs.slice(0,ci).replace(/^courses\s*:/i,'').trim(),skills:ci<0?'':cs.slice(ci).replace(/^skills\s*:/i,'').trim(),details:sec('Additional Details','$^')}).then(ok=>{if(ok){closeModal();location.hash='#proposals'}})}
const _vi=view_ideas;view_ideas=function(m){_vi(m);const tb=m.querySelector('.toolbar');if(tb){const b=document.createElement('button');b.className='btn';b.style.marginLeft='8px';b.textContent='Request ideas';b.onclick=ideaReqModal;tb.appendChild(b)}
  m.querySelectorAll('[data-p]').forEach(p=>{const b=document.createElement('button');b.className='btn sm ghost';b.textContent='Write full proposal';b.onclick=()=>proposalReq(p.dataset.p);p.parentNode.insertBefore(b,p)})};
