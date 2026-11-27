// ---- MEETING MINUTES: upload a Word (.docx) file, parse the official template, review, then save
const MIN_LABELS=[['date',/^date\s*:/i],['team',/^team(?:\s*(?:no\.?|number))?\s*:/i],['title',/^project\s*title\s*:/i],['attendees',/^attendees\s*:/i],['agenda',/^agenda\s*:/i],['discussion',/^discussion\s*points?\s*:/i],['followup',/^follow[\s-]*up(?:\s+of\s+the\s+last\s+meeting)?\s*:/i],['decisions',/^decisions?\s*taken\s*:/i],['actions',/^actions?\s*(?:to\s*do)?(?:\s*before\s*(?:the\s*)?next\s*meeting)?\s*:/i]];
const MIN_PLACE=/^(click or tap.*|choose an item\.?|enter text.*|click here.*)$/i;
const MIN_MONTHS={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
function minParseDate(raw){
  const s=String(raw||'').trim();if(!s||MIN_PLACE.test(s))return {iso:'',raw:s,note:''};
  let m;const pad=n=>String(n).padStart(2,'0');const ok=(y,mo,d)=>y>=2000&&y<=2100&&mo>=1&&mo<=12&&d>=1&&d<=31;
  if(m=s.match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/)){if(ok(+m[1],+m[2],+m[3]))return {iso:m[1]+'-'+pad(m[2])+'-'+pad(m[3]),raw:s,note:''}}
  if(m=s.match(/(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/)){const a=+m[1],b=+m[2],y=+m[3];
    if(a>12&&ok(y,b,a))return {iso:y+'-'+pad(b)+'-'+pad(a),raw:s,note:''};
    if(b>12&&ok(y,a,b))return {iso:y+'-'+pad(a)+'-'+pad(b),raw:s,note:''};
    if(ok(y,b,a))return {iso:y+'-'+pad(b)+'-'+pad(a),raw:s,note:'Day and month are both 12 or less. I read it as day/month/year. Check it.'}}
  if(m=s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/)){const mo=MIN_MONTHS[m[2].slice(0,3).toLowerCase()];if(mo&&ok(+m[3],mo,+m[1]))return {iso:m[3]+'-'+pad(mo)+'-'+pad(m[1]),raw:s,note:''}}
  if(m=s.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/)){const mo=MIN_MONTHS[m[1].slice(0,3).toLowerCase()];if(mo&&ok(+m[3],mo,+m[2]))return {iso:m[3]+'-'+pad(mo)+'-'+pad(m[2]),raw:s,note:''}}
  return {iso:'',raw:s,note:'The date text could not be read as a date.'};
}
function minParse(text){
  const lines=String(text||'').replace(/\r/g,'').split('\n').map(x=>x.replace(/\u00a0/g,' ').trim());
  const isSig=l=>/^signature\s*:?\s*$/i.test(l);
  const personRe=/^(member\s*\d*|advisor|co-?\s*advisor|customer)\s*:\s*(.*)$/i;
  const secs={};let cur=null,li=-1;const order=[];
  // find labels in the expected order (each label only after the previous one)
  const hits=[];let from=0;
  for(const [k,re] of MIN_LABELS){let found=-1;for(let i=from;i<lines.length;i++){if(re.test(lines[i])){found=i;break}}if(found>=0){hits.push([k,found]);from=found+1}}
  const out={date:'',team:'',title:'',attendees:[],agenda:'',discussion:'',followup:'',decisions:'',actions:''};const notes=[];
  hits.forEach(([k,i],n)=>{
    const end=n+1<hits.length?hits[n+1][1]:lines.length;const re=MIN_LABELS.find(x=>x[0]===k)[1];
    const first=lines[i].replace(re,'').trim();let body=[first].concat(lines.slice(i+1,end)).map(x=>x.trim()).filter(x=>x&&!MIN_PLACE.test(x)&&!isSig(x));
    if(k==='attendees'){
      const ppl=[];for(let j=0;j<body.length;j++){const m=body[j].match(personRe);if(!m)continue;let role=m[1].replace(/\s+/g,' '),val=m[2].replace(/\s*signature\s*:.*$/i,'').trim();
        if(!val){const nx=body[j+1];if(nx&&!personRe.test(nx)&&!/^signature/i.test(nx))val=nx.replace(/\s*signature\s*:.*$/i,'').trim()}
        if(val&&!MIN_PLACE.test(val))ppl.push({role:role.replace(/^\w/,c=>c.toUpperCase()),name:val})}
      out.attendees=ppl;if(!ppl.length&&body.length)notes.push('Attendees section found but no "Member / Advisor / Customer" lines had names.')}
    else if(k==='date'||k==='team'||k==='title')out[k]=body.join(' ').trim();
    else out[k]=body.join('\n').trim();
  });
  MIN_LABELS.forEach(([k])=>{if(!hits.some(h=>h[0]===k))notes.push('Label not found in the file: '+k)});
  return {f:out,notes};
}
function minNorm(s){return String(s||'').toLowerCase().replace(/[^a-z0-9\u0600-\u06ff ]/g,' ').replace(/\s+/g,' ').trim()}
function minMatchTeam(teamTxt,titleTxt){
  const cand=new Map();const add=(t,why)=>{const e=cand.get(t.id)||{t,why:[]};e.why.push(why);cand.set(t.id,e)};
  const num=(String(teamTxt).match(/\b0*(\d{1,3})\b/)||[])[1];
  if(num)DB.team.forEach(t=>{if(String(t.no).replace(/^0+/,'')===num)add(t,'team number '+num)});
  const nt=minNorm(titleTxt||teamTxt);
  if(nt.length>6)DB.team.forEach(t=>{const tt=minNorm(t.title);if(!tt)return;if(tt.includes(nt)||nt.includes(tt)){add(t,'project title');return}
    const a=new Set(nt.split(' ').filter(w=>w.length>3)),b=new Set(tt.split(' ').filter(w=>w.length>3));if(!a.size||!b.size)return;let c=0;a.forEach(w=>{if(b.has(w))c++});if(c/Math.min(a.size,b.size)>=0.7)add(t,'project title words')});
  return [...cand.values()];
}
function minTeamMergePlan(t,att){
  const g=r=>att.filter(a=>r.test(a.role)).map(a=>a.name);
  const members=g(/^member/i),adv=g(/^advisor/i),cust=g(/^customer/i);const plan=[];
  const chk=(field,val,label)=>{if(!val)return;const cur=String(t[field]||'').trim();if(!cur)plan.push({field,val,label,kind:'fill'});else if(minNorm(cur)!==minNorm(val)&&!minNorm(cur).includes(minNorm(val)))plan.push({field,val,label,kind:'differs',cur})};
  chk('members',members.join('\n'),'Members');chk('advisor',adv[0],'Advisor');chk('customer',cust[0],'Customer');return plan;
}
const MIN_FIELDS=[['agenda','Agenda'],['discussion','Discussion points'],['followup','Follow-up of the last meeting'],['decisions','Decisions taken'],['actions','Actions to do before next meeting']];
let MIN_ITEMS=[];
async function minRead(file){await loadScript(MAMMOTH);const r=await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});return r.value}
function minAttStr(att){return att.map(a=>a.role+': '+a.name).join('; ')}
function minOpen(){
  openModal(`<h3>Upload meeting minutes (Word)</h3><div class="hint">Choose one or more .docx files made from the official Meeting Minutes template. The file is read in your browser, nothing is saved until you check the fields and press Save. Existing records are never overwritten.</div>
  <input type="file" id="mn_file" accept=".docx" multiple><div id="mn_msg" class="hint"></div><div id="mn_list"></div>
  <div style="margin-top:16px;text-align:right"><button class="btn ghost" onclick="closeModal()">Cancel</button> <button class="btn" id="mn_save" style="display:none">Save checked files</button></div>`);
  $('#mn_file').onchange=async e=>{const files=[...e.target.files];if(!files.length)return;$('#mn_msg').textContent='Reading '+files.length+' file(s)...';MIN_ITEMS=[];
    for(const f of files){const it={file:f,err:'',sha:''};try{it.sha=await sha256(f);const txt=await minRead(f);it.text=txt;it.p=minParse(txt);}catch(x){it.err=String(x.message||x)}MIN_ITEMS.push(it)}
    $('#mn_msg').textContent='';minRender()};
}
function minRender(){
  const same=sha=>DB.meeting.find(x=>x.file_sha&&x.file_sha===sha);
  $('#mn_list').innerHTML=MIN_ITEMS.map((it,i)=>{
    if(it.err)return `<div class="panel"><b>${esc(it.file.name)}</b><div class="flag bad">Could not read this file: ${esc(it.err)}</div></div>`;
    const f=it.p.f,d=minParseDate(f.date),cands=minMatchTeam(f.team,f.title);it.d=d;it.cands=cands;
    const warn=[];if(d.note)warn.push(d.note);if(!d.iso&&!d.note)warn.push('No date found in the file. Pick the date.');
    if(!cands.length)warn.push('No team could be matched from "'+f.team+'" / "'+f.title+'". Pick the team.');else if(cands.length>1)warn.push('More than one team matches. Pick the right one.');
    else if(cands[0].why.length<2&&f.team&&f.title&&cands[0].why[0].startsWith('team number'))warn.push('Matched by team number only; the project title in the file did not match this team. Check it.');
    warn.push(...it.p.notes);
    const dup=same(it.sha);if(dup)warn.push('This exact file was already imported (Team '+esc((DB.team.find(t=>t.id===dup.team)||{}).no||'?')+', '+esc(dup.date)+'). It is unchecked.');
    const selTeam=cands.length===1?cands[0].t.id:'';
    return `<div class="panel" data-i="${i}"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" class="mn_inc" ${dup?'':'checked'}> <b>${esc(it.file.name)}</b></label>
    ${warn.map(w=>`<div class="flag sug">${esc(w)}</div>`).join('')}
    <div class="row"><div><label>Team</label><select class="mn_team"><option value="">- choose -</option>${DB.team.map(t=>`<option value="${t.id}" ${t.id===selTeam?'selected':''}>Team ${esc(t.no)} - ${esc(t.title)}</option>`).join('')}</select><div class="hint">File says: "${esc(f.team)}"${f.title?' / "'+esc(f.title)+'"':''}</div></div>
    <div><label>Date</label><input type="date" class="mn_date" value="${esc(d.iso)}"><div class="hint">File says: "${esc(d.raw)}"</div></div>
    <div><label>Term</label><select class="mn_term"><option>Term 1</option><option>Term 2</option></select></div></div>
    <label>Attendees (from Member / Advisor / Customer lines; signatures are not read)</label><textarea class="mn_att" style="min-height:44px">${esc(minAttStr(f.attendees))}</textarea>
    ${MIN_FIELDS.map(([k,l])=>`<label>${l}</label><textarea class="mn_f" data-k="${k}" style="min-height:54px">${esc(f[k])}</textarea>`).join('')}
    <div class="mn_plan hint"></div></div>`}).join('');
  $('#mn_save').style.display=MIN_ITEMS.some(x=>!x.err)?'':'none';
  document.querySelectorAll('#mn_list .panel[data-i]').forEach(box=>{
    const i=+box.dataset.i,it=MIN_ITEMS[i];const upd=()=>{const tid=box.querySelector('.mn_team').value,dt=box.querySelector('.mn_date').value,pl=box.querySelector('.mn_plan');
      if(tid){const t=DB.team.find(x=>x.id===tid);const dd=teamDefaults(tid);if(dd.term&&!box.dataset.termSet){box.querySelector('.mn_term').value=dd.term}}
      const ex=tid&&dt?DB.meeting.find(x=>x.team===tid&&x.date===dt):null;let h='';
      if(ex)h+='<div class="flag sug">A meeting for this team and date is already saved. Saving will fill only its empty fields. Where the saved text differs, tick "append" below to add the file text after it. Saved text is never replaced.</div>';
      if(ex){const diffs=MIN_FIELDS.filter(([k])=>{const nv=(box.querySelector('.mn_f[data-k="'+k+'"]').value||'').trim();return nv&&String(ex[k]||'').trim()&&minNorm(ex[k])!==minNorm(nv)});
        h+=diffs.map(([k,l])=>`<label><input type="checkbox" class="mn_app" data-k="${k}"> Append file text to saved "${l}"</label>`).join('')}
      if(tid){const t=DB.team.find(x=>x.id===tid);const att=(box.querySelector('.mn_att').value||'').split(/;\s*/).map(s=>{const m=s.match(/^([^:]+):\s*(.+)$/);return m?{role:m[1].trim(),name:m[2].trim()}:null}).filter(Boolean);const pl=minTeamMergePlan(t,att);it.plan=pl;
        h+=pl.map((p,j)=>p.kind==='fill'?`<label><input type="checkbox" class="mn_tf" data-j="${j}" checked> Fill empty team field "${p.label}" with: ${esc(p.val.replace(/\n/g,', '))}</label>`:`<div class="hint">Team ${p.label} is saved as "${esc(String(p.cur).replace(/\n/g,', '))}"; the file has "${esc(p.val.replace(/\n/g,', '))}". Not changed.</div>`).join('')}
      pl.innerHTML=h};
    box.querySelector('.mn_team').onchange=upd;box.querySelector('.mn_date').onchange=upd;box.querySelector('.mn_att').onchange=upd;box.querySelector('.mn_term').onchange=()=>{box.dataset.termSet=1};upd()});
  $('#mn_save').onclick=minSave;
}
async function minSave(){
  const boxes=[...document.querySelectorAll('#mn_list .panel[data-i]')].filter(b=>b.querySelector('.mn_inc')&&b.querySelector('.mn_inc').checked);
  if(!boxes.length){alert('Nothing is checked.');return}
  for(const b of boxes){const it=MIN_ITEMS[+b.dataset.i];if(!b.querySelector('.mn_team').value||!b.querySelector('.mn_date').value){alert('Choose a team and a date for "'+it.file.name+'" first.');return}}
  const msg=$('#mn_msg');const done=[];
  for(const b of boxes){const it=MIN_ITEMS[+b.dataset.i];const tid=b.querySelector('.mn_team').value,dt=b.querySelector('.mn_date').value,term=b.querySelector('.mn_term').value;
    msg.textContent='Storing '+it.file.name+'...';
    const path='minutes/'+Date.now()+'-'+it.file.name.replace(/[^\w.-]/g,'_');
    const up=await sb.storage.from('reports').upload(path,it.file,{contentType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
    let fp=up.error?'':path;if(up.error&&!confirm('The Word file could not be stored ('+up.error.message+'). Save the minutes text without the file?'))return;
    const vals={};b.querySelectorAll('.mn_f').forEach(x=>vals[x.dataset.k]=x.value.trim());const att=b.querySelector('.mn_att').value.trim();
    const ex=DB.meeting.find(x=>x.team===tid&&x.date===dt);const o=ex?{...ex}:{team:tid,term,date:dt,attendees:'',agenda:'',discussion:'',followup:'',decisions:'',actions:''};
    const changed=[];
    if(ex){const prev={};
      const app=k=>b.querySelector('.mn_app[data-k="'+k+'"]')&&b.querySelector('.mn_app[data-k="'+k+'"]').checked;
      MIN_FIELDS.forEach(([k])=>{const nv=vals[k];if(!nv)return;const cur=String(ex[k]||'').trim();if(!cur){o[k]=nv;changed.push(k)}else if(app(k)&&minNorm(cur)!==minNorm(nv)){prev[k]=ex[k];o[k]=cur+'\n\n[From '+it.file.name+'] '+nv;changed.push(k+' (appended)')}});
      if(!String(ex.attendees||'').trim()&&att){o.attendees=att;changed.push('attendees')}
      if(Object.keys(prev).length)o.fields_prev={...(ex.fields_prev||{}),...prev};
      if(!ex.file_path&&fp){o.file_path=fp;o.file_name=it.file.name;o.file_sha=it.sha}else if(ex.file_path&&fp){o.files_extra=(ex.files_extra||[]).concat([{path:fp,name:it.file.name,sha:it.sha}])}
    }else{Object.assign(o,vals);o.attendees=att;o.file_path=fp;o.file_name=it.file.name;o.file_sha=it.sha;MIN_FIELDS.forEach(([k])=>{if(vals[k])changed.push(k)});if(att)changed.push('attendees')}
    o.imported_at=new Date().toISOString();o.imported_from=it.file.name;
    const ok=await save('meeting',o);if(!ok)return;
    const t=DB.team.find(x=>x.id===tid);const picks=[...b.querySelectorAll('.mn_tf')].filter(x=>x.checked).map(x=>(it.plan||[])[+x.dataset.j]).filter(Boolean);
    if(picks.length){const nt={...t};picks.forEach(p=>{if(!String(t[p.field]||'').trim())nt[p.field]=p.val});await save('team',nt);}
    done.push('Team '+t.no+' '+dt+(ex?' (merged into the saved meeting: '+(changed.join(', ')||'nothing new')+')':' (new meeting)')+(picks.length?'; team fields filled: '+picks.map(p=>p.label).join(', '):''));
  }
  closeModal();alert('Saved:\n'+done.join('\n'));route();
}
async function minOpenFile(path,dl){const r=await sb.storage.from('reports').createSignedUrl(path,600,dl?{download:true}:undefined);if(r.error){alert(r.error.message);return}window.open(r.data.signedUrl,'_blank')}
function view_meetings(m){
  if(!DB.team.length){m.innerHTML=head('Meeting Minutes','Add a team first.')+'<div class="panel">Go to Teams and add a team.</div>';return}
  const cnt=(t,term)=>DB.meeting.filter(x=>x.team===t&&x.term===term).length;
  m.innerHTML=head('Meeting Minutes','Minimum 6 documented meetings per team per term (official template fields). Upload the filled Word template and the fields are read for you to check.','<button class="btn" id="upl">Upload Word minutes (.docx)</button> <button class="btn ghost" id="add">+ Log meeting by hand</button>')+
  `<div class="cards">${DB.team.map(t=>`<div class="card"><div class="n">Team ${esc(t.no)}</div><div class="l">${esc(t.title)}</div><div class="d">Term 1: <b>${cnt(t.id,'Term 1')}/6</b> &middot; Term 2: <b>${cnt(t.id,'Term 2')}/6</b></div></div>`).join('')}</div>
  <div class="panel"><table><tr><th>Date</th><th>Team</th><th>Term</th><th>Attendees</th><th>Decisions</th><th>Actions</th><th>Word file</th><th></th></tr>${DB.meeting.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(teamName(r.team))}</td><td>${esc(r.term)}</td><td>${esc(r.attendees)}</td><td style="white-space:pre-line">${esc(r.decisions)}</td><td style="white-space:pre-line">${esc(r.actions)}</td><td>${r.file_path?`<span class="chip" title="${esc(r.file_name||'')}">stored</span> <button class="btn sm ghost" onclick="minOpenFile('${r.file_path}',true)">Download</button>`:''}</td><td><button class="btn sm ghost" data-e="${r.id}">Edit</button><button class="btn sm ghost" data-d="${r.id}">Delete</button></td></tr>`).join('')}</table>${empty(DB.meeting.length)}</div>`;
  $('#upl').onclick=minOpen;
  $('#add').onclick=()=>editRecord('meeting',meetF(),'Log meeting minutes');
  m.querySelectorAll('[data-e]').forEach(b=>b.onclick=()=>editRecord('meeting',meetF(),'Edit minutes',b.dataset.e));
  m.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>del(b.dataset.d));
}
