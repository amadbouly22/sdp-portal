// Word / Excel / CSV export of an evaluation report (client-side, free libraries loaded on demand)
const DOCX_URL='https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js';
const EXCEL_URL='https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
function dlBlob(name,blob){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500)}
// ---- turn a draft (plain text) into a structured report
function parseReport(r,draft){
  const stage=r.stage,S=STAGES[stage];
  const lines=String(draft||'').split(/\r?\n/);
  const heads=['OVERALL IMPRESSION','SECTION TABLE','FATAL FLAWS','PRIORITIZED ACTIONS','SUGGESTED REWRITES','NOT CHECKED'];
  const out={intro:[],blocks:{},table:[],scores:[],summary:''};let cur='intro';
  lines.forEach(l=>{
    const t=l.trim();
    if(/^SCORE\s*\|/i.test(t)){const p=t.split('|').map(x=>x.trim());if(p.length>=4)out.scores.push({criterion:p[1],score:p[2].toLowerCase()==='n/a'?null:+p[2],comment:p.slice(3).join(' | ')});return}
    if(/^SUMMARY\s*\|/i.test(t)){out.summary=t.replace(/^SUMMARY\s*\|\s*/i,'');return}
    if(/^FORM SCORES/i.test(t)){cur='skip';return}
    const h=heads.find(x=>t===x||t.startsWith(x+' ')&&t.toUpperCase()===t);
    if(h){cur=h;out.blocks[cur]=[];return}
    if(cur==='SECTION TABLE'){const p=t.split(' | ');if(p.length===5&&!/^Section$/i.test(p[0])){out.table.push(p)}else if(t&&!/^Section \|/.test(t)&&out.table.length){out.table[out.table.length-1][4]+=' '+t}return}
    if(cur==='intro'){if(t)out.intro.push(t);return}
    if(cur==='skip')return;
    out.blocks[cur].push(l);
  });
  Object.keys(out.blocks).forEach(k=>{out.blocks[k]=out.blocks[k].join('\n').trim()});
  // criteria rows from the form rubric
  out.criteria=[];
  if(S&&r.team){S.g.forEach(g=>g[2].forEach(c=>{const s=out.scores.find(x=>x.criterion.toLowerCase()===c.toLowerCase());out.criteria.push({group:g[0],max:g[1],n:g[2].length,criterion:c,score:s?s.score:null,comment:s?s.comment:''})}))}
  return out;
}
function weighted(c){return c.score==null?null:+(c.score/10*c.max/c.n).toFixed(2)}
function reportMeta(r){return {team:r.team?teamName(r.team):(r.title||'-'),stage:r.stage&&r.stage!=='-'?(STAGES[r.stage]?STAGES[r.stage].name:r.stage):'-',mode:r.mode,status:r.status,date:new Date().toISOString().slice(0,10),file:r.file||''}}
function fname(r,ext){return 'evaluation-'+(r.team?(DB.team.find(t=>t.id===r.team)||{no:'x'}).no:'report')+'-stage'+(r.stage||'')+'.'+ext}
// ---- Word
async function exportDocx(r,draft){
  await loadScript(DOCX_URL);const D=window.docx;const P=parseReport(r,draft),M=reportMeta(r);
  const para=(t,o={})=>new D.Paragraph(Object.assign({children:[new D.TextRun({text:t,bold:o.bold,size:o.size||21,color:o.color})],spacing:{after:o.after==null?100:o.after}},o.p||{}));
  const textBlock=t=>t.split('\n').filter(x=>x.trim()).map(x=>para(x.trim()));
  const border={style:D.BorderStyle.SINGLE,size:4,color:'999999'};const borders={top:border,bottom:border,left:border,right:border};
  const cell=(t,w,hd)=>new D.TableCell({width:{size:w,type:D.WidthType.DXA},borders,margins:{top:60,bottom:60,left:90,right:90},shading:hd?{fill:'0B4D3A',type:D.ShadingType.CLEAR,color:'auto'}:undefined,children:String(t==null?'':t).split('\n').map(x=>new D.Paragraph({children:[new D.TextRun({text:x,bold:hd,size:hd?20:18,color:hd?'FFFFFF':undefined})]}))});
  const table=(heads,rows,widths)=>new D.Table({width:{size:widths.reduce((a,b)=>a+b,0),type:D.WidthType.DXA},columnWidths:widths,rows:[new D.TableRow({tableHeader:true,children:heads.map((h,i)=>cell(h,widths[i],true))})].concat(rows.map(rw=>new D.TableRow({cantSplit:false,children:rw.map((c,i)=>cell(c,widths[i]))})))});
  const kids=[];
  kids.push(new D.Paragraph({heading:D.HeadingLevel.TITLE,children:[new D.TextRun({text:'Evaluation report',bold:true,color:'0B4D3A'})]}));
  kids.push(table(['Field','Value'],[['Team',M.team],['Stage',M.stage],['Mode',M.mode],['Draft status',M.status+''],['Source file',M.file||'-'],['Exported',M.date]],[2400,10000]));
  kids.push(para('',{after:120}));
  if(P.intro.length){P.intro.forEach(t=>kids.push(para(t,{size:19,color:'555555'})))}
  const H=t=>new D.Paragraph({heading:D.HeadingLevel.HEADING_1,spacing:{before:260,after:100},children:[new D.TextRun({text:t,bold:true,color:'0B4D3A'})]});
  if(P.blocks['OVERALL IMPRESSION']){kids.push(H('Overall impression'));kids.push(...textBlock(P.blocks['OVERALL IMPRESSION']))}
  if(P.criteria.length){kids.push(H('Scores against the stage rubric'));
    kids.push(table(['Group','Criterion','Group marks','Score (0-10)','Marks','Evidence and comment'],P.criteria.map(c=>[c.group,c.criterion,c.max,c.score==null?'not scored':c.score,weighted(c)==null?'-':weighted(c),c.comment]),[1900,2200,900,1000,800,5600]));
    const tot=P.criteria.reduce((s,c)=>s+(weighted(c)||0),0);kids.push(para('Marks from the scored criteria only: '+tot.toFixed(2)+'. Unscored criteria are not counted. This is a suggestion, not a mark.',{size:18,color:'555555'}))}
  if(P.summary){kids.push(H('Comments (summary for the official form)'));kids.push(para(P.summary))}
  if(P.table.length){kids.push(H('Section table'));kids.push(table(['Section','Rating (0-10)','Strengths','Weaknesses','Recommendation'],P.table,[1700,900,3300,3800,2700]))}
  [['FATAL FLAWS','Fatal flaws'],['PRIORITIZED ACTIONS','Prioritized actions'],['SUGGESTED REWRITES','Suggested rewrites'],['NOT CHECKED','Not checked']].forEach(([k,t])=>{if(P.blocks[k]){kids.push(H(t));kids.push(...textBlock(P.blocks[k]))}});
  if(!P.table.length&&!P.criteria.length&&!P.blocks['OVERALL IMPRESSION']){kids.push(H('Draft'));kids.push(...textBlock(draft))}
  const doc=new D.Document({creator:'SDP Portal',title:'Evaluation report',styles:{default:{document:{run:{font:'Calibri',size:21}}}},sections:[{properties:{page:{size:{orientation:D.PageOrientation.LANDSCAPE,width:12240,height:15840},margin:{top:900,bottom:900,left:900,right:900}}},footers:{default:new D.Footer({children:[new D.Paragraph({children:[new D.TextRun({text:'SDP Portal | '+M.team+' | '+M.stage,size:16,color:'888888'})]})]})},children:kids}]});
  const blob=await D.Packer.toBlob(doc);return {blob,name:fname(r,'docx')};
}
// ---- Excel
async function exportXlsx(r,draft){
  await loadScript(EXCEL_URL);const P=parseReport(r,draft),M=reportMeta(r);const wb=new ExcelJS.Workbook();wb.creator='SDP Portal';
  const hdr=row=>{row.font={bold:true,color:{argb:'FFFFFFFF'}};row.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0B4D3A'}};row.alignment={vertical:'middle',wrapText:true}};
  const s1=wb.addWorksheet('Summary');s1.columns=[{width:40},{width:110}];
  [['Team',M.team],['Stage',M.stage],['Mode',M.mode],['Draft status',M.status],['Source file',M.file||'-'],['Exported',M.date],['Note','Draft. Scores are suggestions; the evaluator decides.']].forEach(x=>s1.addRow(x));
  s1.getColumn(1).font={bold:true};
  if(P.criteria.length){const tot=P.criteria.reduce((s,c)=>s+(weighted(c)||0),0),S=STAGES[r.stage];s1.addRow(['Suggested marks (scored criteria only)',tot.toFixed(2)+' of '+S.w]);s1.addRow(['Unscored criteria',P.criteria.filter(c=>c.score==null).map(c=>c.criterion).join('; ')||'none'])}
  const ov=P.blocks['OVERALL IMPRESSION'];if(ov)s1.addRow(['Overall impression',ov]);if(P.summary)s1.addRow(['Comments (official form)',P.summary]);
  [['FATAL FLAWS','Fatal flaws'],['PRIORITIZED ACTIONS','Prioritized actions'],['SUGGESTED REWRITES','Suggested rewrites'],['NOT CHECKED','Not checked']].forEach(([k,t])=>{if(P.blocks[k])s1.addRow([t,P.blocks[k]])});
  s1.eachRow(rw=>{rw.alignment={vertical:'top',wrapText:true}});s1.getColumn(1).font={bold:true};
  if(P.criteria.length){const s2=wb.addWorksheet('Criteria');s2.columns=[{header:'Group',width:34},{header:'Criterion',width:34},{header:'Group marks',width:12},{header:'Criteria in group',width:12},{header:'Score (0-10)',width:12},{header:'Marks',width:10},{header:'Evidence and comment',width:110}];hdr(s2.getRow(1));
    P.criteria.forEach((c,i)=>{const row=s2.addRow([c.group,c.criterion,c.max,c.n,c.score==null?null:c.score,null,c.comment]);const n=i+2;row.getCell(6).value=c.score==null?null:{formula:`E${n}/10*C${n}/D${n}`,result:weighted(c)};row.getCell(6).numFmt='0.00';row.alignment={vertical:'top',wrapText:true}});
    const n=P.criteria.length+2;s2.addRow(['Total (scored criteria)','','','','',{formula:`SUM(F2:F${n-1})`}]).font={bold:true};s2.getCell('F'+n).numFmt='0.00';s2.views=[{state:'frozen',ySplit:1}]}
  if(P.table.length){const s3=wb.addWorksheet('Sections');s3.columns=[{header:'Section',width:28},{header:'Rating (0-10)',width:12},{header:'Strengths',width:60},{header:'Weaknesses',width:70},{header:'Recommendation',width:50}];hdr(s3.getRow(1));P.table.forEach(p=>{const row=s3.addRow([p[0],isNaN(+p[1])?p[1]:+p[1],p[2],p[3],p[4]]);row.alignment={vertical:'top',wrapText:true}});s3.views=[{state:'frozen',ySplit:1}]}
  if(wb.worksheets.length===1){const s=wb.addWorksheet('Draft');s.columns=[{width:140}];String(draft).split('\n').forEach(l=>s.addRow([l]))}
  wb.worksheets.forEach(w=>{w.eachRow((row,rn)=>{let mx=1;row.eachCell({includeEmpty:false},(cell,ci)=>{const v=cell.value;const t=typeof v==='object'&&v!==null?'':String(v==null?'':v);const wd=(w.getColumn(ci).width||10)*1.05;const ln=t.split('\n').reduce((a,p)=>a+Math.max(1,Math.ceil(p.length/wd)),0);if(ln>mx)mx=ln});row.height=Math.min(409,Math.max(15,mx*14+4))});w.pageSetup={orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});const buf=await wb.xlsx.writeBuffer();return {blob:new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),name:fname(r,'xlsx')};
}
function exportCsvReport(r,draft){const P=parseReport(r,draft),M=reportMeta(r);
  const rows=P.criteria.length?P.criteria.map(c=>({Team:M.team,Stage:M.stage,Mode:M.mode,Group:c.group,'Group marks':c.max,Criterion:c.criterion,'Score (0-10)':c.score==null?'':c.score,Marks:weighted(c)==null?'':weighted(c),Comment:c.comment})):P.table.map(p=>({Team:M.team,Stage:M.stage,Mode:M.mode,Section:p[0],'Rating (0-10)':p[1],Strengths:p[2],Weaknesses:p[3],Recommendation:p[4]}));
  if(!rows.length)rows.push({Team:M.team,Stage:M.stage,Mode:M.mode,Draft:draft});
  return {blob:new Blob(['\ufeff'+csvOf(rows)],{type:'text/csv;charset=utf-8'}),name:fname(r,'csv')}}
async function doExport(id,kind){const r=DB.evalreq.find(x=>x.id===id);const d=$('#r_draft')?$('#r_draft').value:r.draft;const msg=$('#ex_msg');
  try{if(msg)msg.textContent='Preparing...';const o=kind==='docx'?await exportDocx(r,d):kind==='xlsx'?await exportXlsx(r,d):exportCsvReport(r,d);window.__lastExport={name:o.name,size:o.blob.size,blob:o.blob};dlBlob(o.name,o.blob);if(msg)msg.textContent='Saved '+o.name}catch(e){if(msg)msg.textContent='Export failed: '+e.message}}
(function(){const orig=openReq;openReq=function(id){orig(id);const r=DB.evalreq.find(x=>x.id===id);if(!r||!r.draft)return;const tb=document.querySelector('#mbox .toolbar');if(!tb)return;
  const old=[...tb.querySelectorAll('button')].find(b=>b.textContent.trim()==='Export');if(old)old.textContent='Text (.txt)';
  const box=document.createElement('div');box.className='toolbar';box.innerHTML=`<b>Export report as:</b> <button class="btn" data-x="docx">Word (.docx)</button> <button class="btn" data-x="xlsx">Excel (.xlsx)</button> <button class="btn ghost" data-x="csv">CSV</button> <span class="hint" id="ex_msg"></span>`;
  tb.parentNode.insertBefore(box,tb);box.querySelectorAll('[data-x]').forEach(b=>b.onclick=()=>doExport(id,b.dataset.x))}})();
