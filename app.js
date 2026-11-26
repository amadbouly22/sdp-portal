const SB_URL='https://zndgoxfelkvsycnkwvxk.supabase.co';
const SB_KEY='sb_publishable_wqNkYrd-cvp_v8q1yuZKAg_ufPtLKZC';
const sb=supabase.createClient(SB_URL,SB_KEY);
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let DB={idea:[],proposal:[],team:[],meeting:[],evaluation:[],document:[],evalreq:[],rubric:[]};
const VIEWS=[['dashboard','Dashboard','\u25A3'],['ideas','Idea Bank','\u270E'],['proposals','Proposals','\uD83D\uDCC4'],['teams','Teams','\uD83D\uDC65'],['meetings','Meeting Minutes','\uD83D\uDCC5'],['evals','Evaluations','\u2713'],['docs','Reports & Files','\uD83D\uDCC1'],['aieval','Evaluation Drafts','\u2728'],['rubrics','Rubrics','\u2630'],['export','Export','\u21E9']];
async function loadAll(){
  const {data,error}=await sb.from('records').select('*').order('created_at');
  if(error){alert('Load error: '+error.message);return}
  DB={idea:[],proposal:[],team:[],meeting:[],evaluation:[],document:[],evalreq:[],rubric:[]};
  data.forEach(r=>{if(DB[r.kind])DB[r.kind].push({id:r.id,created:r.created_at,...r.data})});if(window.applyRubrics)applyRubrics();
}
async function save(kind,obj){
  const {id,created,...data}=obj;
  let res;
  if(id) res=await sb.from('records').update({data}).eq('id',id);
  else res=await sb.from('records').insert({kind,data});
  if(res.error){alert('Save error: '+res.error.message);return false}
  await loadAll();return true;
}
async function del(id){if(!confirm('Delete this record?'))return;const r=await sb.from('records').delete().eq('id',id);if(r.error)alert(r.error.message);await loadAll();route()}
function openModal(html){$('#mbox').innerHTML=html;$('#modal').classList.add('on')}
function closeModal(){$('#modal').classList.remove('on')}
function teamName(id){const t=DB.team.find(x=>x.id===id);return t?('Team '+t.no+' - '+t.title):'-'}
function route(){const v=(location.hash.slice(1)||'dashboard').split(':')[0];
  $('#nav').innerHTML=VIEWS.map(x=>`<a href="#${x[0]}" class="${x[0]===v?'on':''}"><i>${x[2]}</i>${x[1]}</a>`).join('');
  const f=window['view_'+v];$('#main').innerHTML='';if(f)f($('#main'));}
window.addEventListener('hashchange',route);
async function boot(){
  const {data:{session}}=await sb.auth.getSession();
  if(!session){$('#login').classList.remove('hide');$('#side').classList.add('hide');$('#main').classList.add('hide');return}
  $('#login').classList.add('hide');$('#side').classList.remove('hide');$('#main').classList.remove('hide');
  await loadAll();route();
}
$('#lbtn').onclick=async()=>{const {error}=await sb.auth.signInWithPassword({email:$('#lemail').value.trim(),password:$('#lpass').value});
  if(error){$('#lerr').textContent=error.message}else{$('#lpass').value='';boot()}};
$('#lpass').addEventListener('keydown',e=>{if(e.key==='Enter')$('#lbtn').click()});
$('#logout').onclick=async e=>{e.preventDefault();await sb.auth.signOut();boot()};
$('#modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});
boot();
