// Ideas and proposals live on #ideas and #proposals only. Requests for them are kept out of #aieval.
const IP_MODES=()=>[MODES[2],MODES[3]];
const isIP=r=>IP_MODES().includes(r.mode);
const _va=view_aieval;
view_aieval=function(m){const all=DB.evalreq;DB.evalreq=all.filter(r=>!isIP(r));try{_va(m)}finally{DB.evalreq=all}
  m.querySelectorAll('#a_mode option').forEach(o=>{if(o.value===MODES[2])o.remove()});
  const n=all.filter(isIP).length;const h=m.querySelector('.sub');if(h&&n)h.insertAdjacentHTML('afterend','<div class="hint" style="margin:6px 0">Idea and proposal requests are on the <a href="#ideas">Idea Bank</a> and <a href="#proposals">Proposals</a> pages.</div>')};
const _oq=openReq;openReq=function(id){_oq(id);const r=DB.evalreq.find(x=>x.id===id);if(r&&isIP(r)){document.querySelectorAll('.modal h3,#modal h3').forEach(h=>{if(/^Draft evaluation/.test(h.textContent))h.textContent=h.textContent.replace('Draft evaluation',r.mode===MODES[3]?'Draft proposal':'Draft ideas')})}};
// ---- PDF
let _jsp=null;function loadJsPdf(){return _jsp||(_jsp=new Promise((ok,no)=>{if(window.jspdf)return ok();const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';s.onload=ok;s.onerror=()=>no(new Error('PDF library did not load'));document.head.appendChild(s)}))}
const pclean=s=>String(s||'').replace(/[\u2013\u2014]/g,'-').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/\*\*/g,'').replace(/^#{1,4}\s*/gm,'').replace(/^(\s*)[-*]\s+/gm,'$1\u2022 ').replace(/[^\x09\x0a\x20-\x7e\xa0-\xff\u2022]/g,'?');
async function makePdf(title,sub,body){await loadJsPdf();const D=new window.jspdf.jsPDF({unit:'pt',format:'a4'});const W=D.internal.pageSize.getWidth(),H=D.internal.pageSize.getHeight(),M=54;let y=M;
  const line=(t,sz,b)=>{D.setFont('helvetica',b?'bold':'normal');D.setFontSize(sz);D.splitTextToSize(t,W-2*M).forEach(l=>{if(y>H-M){D.addPage();y=M}D.text(l,M,y);y+=sz*1.4})};
  line(pclean(title),16,true);y+=2;if(sub)line(pclean(sub),9,false);y+=8;
  pclean(body).split('\n').forEach(l=>{const t=l.trim();if(!t){y+=5;return}const hd=/^(Project Description|Technical Requirements|Final Product|Recommended Courses and Skills|Additional Details|Background & Motivation|Problem Statement|Higher-Level Objectives|Lower-Level Objectives|Proposed Methodology \/ Approach|Key Technologies|Expected Deliverables|Relevant Engineering Standards|Feasibility Assessment)\s*:?$/.test(t)||/^(Background & Motivation|Problem Statement|Higher-Level Objectives|Lower-Level Objectives|Proposed Methodology \/ Approach|Key Technologies|Expected Deliverables|Relevant Engineering Standards|Feasibility Assessment):/.test(t);
    if(hd&&t.includes(':')){const i=t.indexOf(':');line(t.slice(0,i+1),10.5,true);if(t.slice(i+1).trim())line(t.slice(i+1).trim(),10.5,false)}else line(l,10.5,hd)});
  return D.output('blob')}
async function putPdf(path,blob){const x=await sb.storage.from('reports').upload(path,blob,{contentType:'application/pdf'});if(x.error){alert('PDF upload failed: '+x.error.message);return false}return true}
const stamp=()=>new Date().toISOString().slice(0,10);
// split an ideas draft into ideas
function splitIdeas(d){const parts=String(d||'').split(/^###\s*Project Title:\s*/m).slice(1);return parts.map(p=>{const nl=p.indexOf('\n');let title=(nl<0?p:p.slice(0,nl)).trim();let body=nl<0?'':p.slice(nl+1);body=body.replace(/\n###\s*Notes for the evaluator[\s\S]*$/i,'').trim();
  const f=(body.match(/Technical:\s*(High|Medium|Low)/i)||[])[1];return {title,body,feas:f?f[0].toUpperCase()+f.slice(1).toLowerCase():''}})}
async function reqPdf(id){const r=DB.evalreq.find(x=>x.id===id);if(!r||!r.draft){alert('No draft yet.');return}
  const blob=await makePdf(r.title.replace(/^(Ideas|Proposal):\s*/,'')+(r.mode===MODES[3]?' - project proposal':' - project ideas'),'Draft for review, '+stamp()+'. Not verified by the department.',r.draft.replace(/^DRAFT[^\n]*\n/,''));
  const path='proposals/req-'+id.slice(0,8)+'-'+Date.now()+'.pdf';if(!(await putPdf(path,blob)))return;
  if(await save('evalreq',{...r,id,prop_pdf_path:path,prop_pdf_name:r.title.replace(/\W+/g,'_')+'.pdf',prop_pdf_at:new Date().toISOString()})){route()}}
async function ideaPdf(id){const r=DB.idea.find(x=>x.id===id);if(!r)return;
  const blob=await makePdf(r.title,'Project idea | '+(r.by||'')+' | Feasibility: '+(r.feas||'-')+' | '+stamp(),r.notes||'');
  const path='proposals/idea-'+id.slice(0,8)+'-'+Date.now()+'.pdf';if(!(await putPdf(path,blob)))return;
  if(await save('idea',{...r,id,pdf_path:path,pdf_name:r.title.replace(/\W+/g,'_')+'.pdf',pdf_at:new Date().toISOString()}))route()}
async function propPdf(id){const r=DB.proposal.find(x=>x.id===id);if(!r)return;
  const blob=await makePdf(r.title,'Project proposal | '+(r.as||'')+' | '+(r.status||'')+' | '+stamp(),propDoc(r).split('\n').slice(2).join('\n'));
  const path='proposals/prop-'+id.slice(0,8)+'-'+Date.now()+'.pdf';if(!(await putPdf(path,blob)))return;
  if(await save('proposal',{...r,id,pdf_path:path,pdf_name:r.title.replace(/\W+/g,'_')+'.pdf',pdf_at:new Date().toISOString()}))route()}
async function ipDownload(path){const r=await sb.storage.from('reports').createSignedUrl(path,600,{download:true});if(r.error){alert(r.error.message);return}window.open(r.data.signedUrl,'_blank')}
function ipBar(path,fn,id){return (path?`<span class="chip">PDF stored</span> <button class="btn sm ghost" onclick="viewPdf('${path}')">View PDF</button> <button class="btn sm ghost" onclick="ipDownload('${path}')">Download</button> <button class="btn sm ghost" onclick="${fn}('${id}')">Regenerate</button>`:`<button class="btn sm" onclick="${fn}('${id}')">Create PDF</button>`)}
async function ideasFromReq(id){const r=DB.evalreq.find(x=>x.id===id);const ids=splitIdeas(r&&r.draft);if(!ids.length){alert('No ideas found in the draft.');return}
  let n=0;for(const i of ids){if(DB.idea.some(x=>x.req===id&&x.title===i.title))continue;
    const ok=await sb.from('records').insert({kind:'idea',data:{title:i.title,domain:'Other',by:r.by||'Supervisor',status:'Draft',feas:i.feas||'Medium',team:'',notes:i.body,req:id,source:'Suggested from request '+id.slice(0,8)}});if(ok.error){alert(ok.error.message);return}n++}
  await loadAll();route();return n}
function reqPanel(){const rs=(DB.evalreq||[]).filter(isIP).slice().reverse();
  const row=r=>{const ni=DB.idea.filter(x=>x.req===r.id).length;const ready=!!r.draft;
    return `<tr><td>${esc((r.created||'').slice(0,10))}</td><td><b>${esc(r.title||'-')}</b><div class="hint">${esc(r.mode===MODES[3]?'Full proposal':'Idea suggestions')}${r.brief?' | '+esc(String(r.brief).slice(0,60)):''}</div></td><td><span class="badge ${ready?'b-g':'b-a'}">${esc(r.status)}</span></td><td>${ready?ipBar(r.prop_pdf_path,'reqPdf',r.id):'<span class="hint">waiting for draft</span>'}</td><td><button class="btn sm ghost" onclick="openReq('${r.id}')">${ready?'Open draft':'Open'}</button>${ready&&r.mode===MODES[2]?` <button class="btn sm ghost" onclick="ideasFromReq('${r.id}')">${ni?'Add missing ideas to Idea Bank':'Add ideas to Idea Bank'}</button>`:''}${ni?` <span class="hint">${ni} in Idea Bank</span>`:''}</td></tr>`};
  return `<div class="panel"><h2>Requests for ideas and proposals</h2><div class="hint">Requests and their drafts and PDFs are kept here, not on Evaluation Drafts.</div>${rs.length?`<table><tr><th>Date</th><th>Request</th><th>Status</th><th>PDF</th><th></th></tr>${rs.map(row).join('')}</table>`:'<div class="hint">No requests yet.</div>'}</div>`}
const _vi2=view_ideas;view_ideas=function(m){_vi2(m);const t=m.querySelector('table');if(t){const hr=t.rows[0];hr.insertAdjacentHTML('beforeend','<th>PDF</th>');DB.idea.forEach((r,i)=>{const row=t.rows[i+1];if(row)row.insertAdjacentHTML('beforeend',`<td>${ipBar(r.pdf_path,'ideaPdf',r.id)}</td>`)})}
  m.insertAdjacentHTML('beforeend',reqPanel())};
const _vp2=view_proposals;view_proposals=function(m){_vp2(m);m.insertAdjacentHTML('beforeend',reqPanel());const t=m.querySelector('table');if(t){t.rows[0].insertAdjacentHTML('beforeend','<th>PDF</th>');DB.proposal.forEach((r,i)=>{const row=t.rows[i+1];if(row)row.insertAdjacentHTML('beforeend',`<td>${ipBar(r.pdf_path,'propPdf',r.id)}</td>`)})}
  const ip=DB.idea.filter(x=>x.pdf_path);if(ip.length)m.insertAdjacentHTML('beforeend',`<div class="panel"><h2>Idea PDFs</h2><table><tr><th>Idea</th><th>PDF</th></tr>${ip.map(r=>`<tr><td><b>${esc(r.title)}</b></td><td>${ipBar(r.pdf_path,'ideaPdf',r.id)}</td></tr>`).join('')}</table></div>`)};
// ---- "Write full proposal": create the request and stay on the Proposals page
proposalReq=async function(id){const r=DB.idea.find(x=>x.id===id);if(!r)return;
  const ex=(DB.evalreq||[]).find(q=>q.mode===MODES[3]&&q.idea===id&&['pending','in-progress'].includes(q.status));
  if(ex){alert('A full proposal for this idea is already requested and waiting for its draft.');location.hash='#proposals';return}
  const ok=await save('evalreq',{team:'',stage:'-',mode:MODES[3],title:'Proposal: '+r.title,brief:r.title+(r.notes?'\n'+r.notes:''),idea:id,by:r.by,status:'pending',report_text:'',draft:'',notes:'',prechecks:[]});
  if(ok){alert('Full proposal requested. It will appear in "Requests for ideas and proposals" on the Proposals page, with its PDF, once the draft is written.');if(location.hash==='#proposals')route();else location.hash='#proposals'}};
async function propFromReq(id){const r=DB.evalreq.find(x=>x.id===id);if(!r||!r.draft)return false;if(DB.proposal.some(p=>p.req===id))return true;
  const t=r.draft;const sec=(a,b)=>{const m=t.match(new RegExp('(?:^|\\n)\\s*(?:#+\\s*)?(?:\\*\\*)?'+a+'(?:\\*\\*)?\\s*\\n([\\s\\S]*?)(?=\\n\\s*(?:#+\\s*)?(?:\\*\\*)?(?:'+b+')(?:\\*\\*)?\\s*\\n|$)','i'));return m?m[1].trim():''};
  const H='Project Description|Technical Requirements|Final Product|Recommended Courses and Skills|Additional Details';
  const idea=DB.idea.find(x=>x.id===r.idea);const cs=sec('Recommended Courses and Skills','Additional Details');const ci=cs.search(/skills\s*:/i);
  const d={title:idea?idea.title:(r.title||'').replace(/^Proposal:\s*/,''),as:r.by||'Supervisor',intake:'',status:'Draft',idea:r.idea||'',req:id,description:sec('Project Description','Technical Requirements|Final Product'),requirements:sec('Technical Requirements','Final Product|Recommended Courses and Skills').replace(/^[-*\u2022]\s*/gm,''),product:sec('Final Product','Recommended Courses and Skills|Additional Details'),courses:ci<0?cs:cs.slice(0,ci).replace(/^courses\s*:/i,'').trim(),skills:ci<0?'':cs.slice(ci).replace(/^skills\s*:/i,'').trim(),details:sec('Additional Details','$^')};
  const x=await sb.from('records').insert({kind:'proposal',data:d}).select();if(x.error){alert(x.error.message);return false}await loadAll();return x.data[0].id}
const _rp=reqPanel;reqPanel=function(){let h=_rp();(DB.evalreq||[]).filter(r=>r.mode===MODES[3]&&r.draft&&!DB.proposal.some(p=>p.req===r.id)).forEach(r=>{h=h.replace(`onclick="openReq('${r.id}')">Open draft</button>`,`onclick="openReq('${r.id}')">Open draft</button> <button class="btn sm ghost" onclick="propFromReq('${r.id}').then(()=>route())">Add to Proposals table</button>`)});return h};
