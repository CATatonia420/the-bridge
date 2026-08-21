import './styles.css'
import {supabase,configured} from './supabase'

const app=document.querySelector('#app')
let session=null,household=null,profile=null,active='bridge',agendaView='today',channel=null
const E=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))
const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)]

function parseRoute(){
  const raw=(location.hash||'#/bridge').replace(/^#\/?/,'')
  const parts=raw.split('/').filter(Boolean)
  active=parts[0]||'bridge'
  if(active==='notes'&&parts[1])notesTab=parts[1]
  if(active==='treasury'&&parts[1])treasuryTab=parts[1]
  if(active==='agenda'&&parts[1])agendaView=parts[1]
  const valid=['bridge','agenda','notes','more','shopping','treasury','trophy','log','crew']
  if(!valid.includes(active))active='bridge'
}
function routeHash(route=active){
  if(route==='notes')return `#/notes/${notesTab||'active'}`
  if(route==='treasury')return `#/treasury/${treasuryTab||'bills'}`
  if(route==='agenda')return `#/agenda/${agendaView||'today'}`
  return `#/${route}`
}
function go(route,{replace=false}={}){
  active=route
  const h=routeHash(route)
  if(replace)history.replaceState({bridge:true,route},'',h)
  else if(location.hash!==h)history.pushState({bridge:true,route},'',h)
  render()
}
function syncRoute({replace=false}={}){
  const h=routeHash(active)
  if(replace)history.replaceState({bridge:true,route:active},'',h)
  else history.pushState({bridge:true,route:active},'',h)
}
function applyTheme(){
  const theme=(profile?.ui_theme==='J'?'J':'C')
  document.documentElement.dataset.bridgeTheme=theme
  localStorage.setItem('bridge_theme',theme)
}
async function setTheme(theme){
  theme=theme==='J'?'J':'C'
  const r=await supabase.from('profiles').update({ui_theme:theme}).eq('user_id',session.user.id)
  if(r.error)return toast('Theme transporter malfunction.')
  profile={...profile,ui_theme:theme};applyTheme();toast(`Theme ${theme} engaged.`);if(active==='more')more()
}

const nav=()=>`<nav class="nav hubNav">
  ${[
    ['bridge','⌂','Bridge'],
    ['agenda','◷','Agenda'],
    ['notes','✦','Comms'],
    ['shopping','▣','Cargo'],
    ['more','•••','More']
  ].map(([x,icon,label])=>`<button data-tab="${x}" class="${(active===x||(['treasury','trophy','log'].includes(active)&&x==='more'))?'active':''}" aria-label="${label}">
    <span class="navIcon">${icon}</span><span class="navLabel">${label}</span>
  </button>`).join('')}
</nav>`
const notifIconSvg='<svg class="notifIconSvg" viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M8.3 15.4 a4.6 4.6 0 0 1 7.4 0"/><path d="M5.1 11.2 a8.9 8.9 0 0 1 13.8 0"/><path d="M1.9 7.1 a13.2 13.2 0 0 1 20.2 0"/></g><circle cx="12" cy="19.4" r="1.7" fill="currentColor"><animate attributeName="opacity" values="1;.3;1" dur="2.4s" repeatCount="indefinite"/></circle></svg>'
const top=t=>`<header class="top"><div><div class="brand">${E(t||'The Bridge')}</div><div class="muted">${E(household?.name||'')}</div></div><div class="topRight"><div class="notifWrap"><button id="notifBell" class="notifBell" aria-label="Notifications" aria-expanded="false">${notifIconSvg}<span id="notifBadge" class="notifBadge" hidden>0</span></button><div id="notifPanel" class="notifPanel" hidden><div class="notifHead"><b>TRANSMISSIONS</b><button id="notifMarkAll" type="button">MARK ALL READ</button></div><div id="notifFeed" class="notifFeed">Scanning…</div><div class="notifFoot"><button id="notifPrefs" type="button">what pings you</button></div></div></div><button id="logout" class="ghost">Log out</button></div></header>`
function wire(){
 q('#logout')?.addEventListener('click',()=>supabase.auth.signOut())
 qa('[data-tab]').forEach(b=>b.onclick=()=>go(b.dataset.tab))
 const bell=q('#notifBell');if(bell)bell.onclick=e=>{e.stopPropagation();openNotifPanel()}
 q('#notifMarkAll')?.addEventListener('click',markAllNotifsRead)
 q('#notifPrefs')?.addEventListener('click',openNotifPrefs)
 if(!notifGlobalWired){notifGlobalWired=true;document.addEventListener('click',e=>{const panel=q('#notifPanel');if(panel&&!panel.hidden&&!e.target.closest('.notifWrap'))panel.hidden=true})}
 refreshNotifBadge()
}
async function userData(){const u=session.user.id;profile=(await supabase.from('profiles').select('*').eq('user_id',u).maybeSingle()).data;applyTheme();const m=(await supabase.from('household_members').select('household_id').eq('user_id',u).limit(1).maybeSingle()).data;household=m?(await supabase.from('households').select('*').eq('id',m.household_id).single()).data:null}

function auth(){
 app.innerHTML=`<main class="shell"><section class="panel auth"><div class="brand">The Bridge</div><h1>Permission to come aboard?</h1><div class="tabs"><button id="li" class="active">Log in</button><button id="su">Sign up</button></div><form id="af"><div class="field"><label>Email</label><input id="em" type="email" required></div><div class="field"><label>Password</label><input id="pw" type="password" minlength="6" required></div><button class="primary">ENTER THE BRIDGE</button><p id="err" class="error"></p></form></section></main>`
 let mode='login';q('#li').onclick=()=>{mode='login';q('#li').className='active';q('#su').className=''};q('#su').onclick=()=>{mode='signup';q('#su').className='active';q('#li').className=''}
 q('#af').onsubmit=async e=>{e.preventDefault();const r=mode==='signup'?await supabase.auth.signUp({email:q('#em').value,password:q('#pw').value}):await supabase.auth.signInWithPassword({email:q('#em').value,password:q('#pw').value});if(r.error)q('#err').textContent=r.error.message}
}
function onboard(){
 app.innerHTML=`<main class="shell"><section class="panel setup"><div class="brand">Crew Registration</div>${!profile?`<h1>Create your profile</h1><form id="pf"><div class="field"><label>Name</label><input id="dn" required></div><div class="field"><label>Nickname</label><input id="nn"></div><button class="primary">SAVE PROFILE</button></form>`:`<h1>Join your ship</h1><div class="tabs"><button id="create" class="primary">Create household</button><button id="join">Join with code</button></div><div id="ja"></div>`}<p id="msg" class="error"></p></section></main>`
 if(!profile)q('#pf').onsubmit=async e=>{e.preventDefault();const r=await supabase.from('profiles').insert({user_id:session.user.id,display_name:q('#dn').value,nickname:q('#nn').value});if(r.error)return q('#msg').textContent=r.error.message;await userData();onboard()}
 else{q('#create').onclick=async()=>{const r=await supabase.rpc('create_household',{household_name:'The Bridge'});if(r.error)return q('#msg').textContent=r.error.message;await userData();await seedCats();await ensureCategories();await ensureShoppingLists();subscribe();active='crew';render()};q('#join').onclick=()=>{q('#ja').innerHTML=`<form id="jf"><div class="field"><label>Invite code</label><input id="ic" required></div><button class="primary">COME ABOARD</button></form>`;q('#jf').onsubmit=async e=>{e.preventDefault();const r=await supabase.rpc('join_household',{code:q('#ic').value});if(r.error)return q('#msg').textContent=r.error.message;await userData();await ensureCategories();await ensureShoppingLists();subscribe();active='crew';render()}}}
}
async function seedCats(){const old=(await supabase.from('cats').select('id').eq('household_id',household.id).limit(1)).data;if(old?.length)return;const cats=(await supabase.from('cats').insert([{household_id:household.id,name:'Pukha',breed:'British Longhair',job_title:'Senior Household Supervisor'},{household_id:household.id,name:'Pluto',breed:'Domestic shorthair',job_title:'Head of Ruling From High Places'}]).select()).data;for(const c of cats||[])await supabase.from('cat_feeding_schedules').insert(['05:00','13:00','21:00'].map(t=>({cat_id:c.id,feeding_time:t})))}

const defaults=[['Cats','#d95b83'],['House','#9b7bb5'],['Laundry','#8d87d8'],['Cleaning','#6a9d98'],['Shopping','#b48a59'],['Money','#a97070'],['Car','#647d8b'],['Plans','#6d8f6f'],['Admin','#777c86'],['Fun','#c6759d'],['Other','#66686e']]
async function ensureCategories(){const x=(await supabase.from('task_categories').select('id').eq('household_id',household.id).limit(1)).data;if(x?.length)return;await supabase.from('task_categories').insert(defaults.map((a,i)=>({household_id:household.id,name:a[0],color:a[1],sort_order:i,created_by:session.user.id})))}
const dateKey=d=>{const x=new Date(d);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`}
const dateText=x=>x?new Date(x).toLocaleDateString('en-IE',{day:'numeric',month:'short',year:'numeric'}):''
const timeText=x=>x?new Date(x).toLocaleTimeString('en-IE',{hour:'2-digit',minute:'2-digit'}):''
function overdue(t){if(!t.due_at||t.status==='done')return'';const h=(Date.now()-new Date(t.due_at))/36e5;if(h<=0)return'';if(h<6)return'<div class="over1">Temporal hiccup detected.</div>';if(h<24)return'<div class="over2">This has become mildly embarrassing.</div>';if(h<72)return'<div class="over3">TEMPORAL ANOMALY DETECTED.</div>';return'<div class="over4">WE HAVE ABANDONED THE TIMELINE.</div>'}

/* ===== v0.8 Sick Bay ===== */
const sbAccent=()=>document.documentElement.dataset.bridgeTheme==='J'?'#5f9a75':'#ef466f'
const sbHM=s=>{const[h,m]=s.split(':').map(Number);return h*60+m}
let sbRerender=null
function avatarSVG(id,pct,color,accent){
 const f=n=>Number(n).toFixed(1)
 function cap(x1,y1,x2,y2,w1,w2){const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len,px=-uy,py=ux,h1=w1/2,h2=w2/2,a1=[x1+px*h1,y1+py*h1],a2=[x1-px*h1,y1-py*h1],b1=[x2+px*h2,y2+py*h2],b2=[x2-px*h2,y2-py*h2];return`M${f(a1[0])} ${f(a1[1])} L${f(b1[0])} ${f(b1[1])} A${f(h2)} ${f(h2)} 0 0 0 ${f(b2[0])} ${f(b2[1])} L${f(a2[0])} ${f(a2[1])} A${f(h1)} ${f(h1)} 0 0 1 ${f(a1[0])} ${f(a1[1])} Z`}
 const head=`<ellipse cx="60" cy="20" rx="12.5" ry="14"/>`,neck=cap(60,33,60,41,8.5,8.5),torso='M43 44 Q42 64 48 86 L72 86 Q78 64 77 44 Q60 40 43 44 Z'
 const armL=cap(45,47,35,90,13,8),armR=cap(75,47,85,90,13,8),legL=cap(51,88,52,142,15,8.5),legR=cap(69,88,68,142,15,8.5),footL=cap(53,143,58,150,9,9),footR=cap(67,143,62,150,9,9)
 const fillY=(150-130*pct).toFixed(1)
 return `<svg class="ava" viewBox="0 0 120 160" role="img" aria-label="${Math.round(pct*100)}% health fill">
 <defs>
  <radialGradient id="${id}-bg" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="${accent}" stop-opacity="0.30"/><stop offset="100%" stop-color="${accent}" stop-opacity="0"/></radialGradient>
  <linearGradient id="${id}-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${accent}" stop-opacity="0.16"/><stop offset="70%" stop-color="${accent}" stop-opacity="0.06"/><stop offset="100%" stop-color="${accent}" stop-opacity="0.03"/></linearGradient>
  <linearGradient id="${id}-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity="0.5"/><stop offset="100%" stop-color="${color}" stop-opacity="0.9"/></linearGradient>
  <filter id="${id}-glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <clipPath id="${id}-clip">${head}<path d="${neck}"/><path d="${torso}"/><path d="${armL}"/><path d="${armR}"/><path d="${legL}"/><path d="${legR}"/><path d="${footL}"/><path d="${footR}"/></clipPath>
 </defs>
 <circle cx="60" cy="80" r="54" fill="url(#${id}-bg)"/>
 <g opacity="0.3" fill="none" stroke="${accent}" stroke-width="0.8" stroke-dasharray="3 7"><ellipse cx="60" cy="80" rx="46" ry="62"><animateTransform attributeName="transform" attributeType="XML" type="rotate" from="0 60 80" to="360 60 80" dur="40s" repeatCount="indefinite"/></ellipse></g>
 <ellipse cx="60" cy="150" rx="27" ry="4.5" fill="${accent}" opacity="0.06" stroke="${accent}" stroke-width="0.8" opacity="0.5"/><ellipse cx="60" cy="150" rx="17" ry="2.8" fill="none" stroke="${accent}" stroke-width="0.9" opacity="0.7"/>
 <g clip-path="url(#${id}-clip)"><rect x="0" y="${fillY}" width="120" height="${160-fillY}" fill="url(#${id}-fill)"/><line x1="18" y1="${fillY}" x2="102" y2="${fillY}" stroke="#ffffff" stroke-width="2" opacity="0.95" filter="url(#${id}-glow)"/></g>
 <g fill="url(#${id}-body)" stroke="${accent}" stroke-width="1.3" stroke-linejoin="round"><path d="${legL}"/><path d="${legR}"/><path d="${footL}"/><path d="${footR}"/><path d="${armL}"/><path d="${armR}"/><path d="${torso}"/><path d="${neck}"/>${head}</g>
 <g fill="none" stroke="${accent}" stroke-linecap="round" filter="url(#${id}-glow)">
  <path d="M51 18 L56 19" stroke-width="2.4"><animate attributeName="opacity" values="1;.5;1" dur="2.6s" repeatCount="indefinite"/></path>
  <path d="M69 18 L64 19" stroke-width="2.4"><animate attributeName="opacity" values="1;.5;1" dur="2.6s" repeatCount="indefinite"/></path>
  <path d="M57 26 Q60 28.5 63 26" stroke-width="1.8" opacity="0.85"/>
 </g>
 <line x1="24" y1="18" x2="96" y2="18" stroke="${accent}" stroke-width="1" opacity="0.4"><animate attributeName="y1" values="16;148;16" dur="4.5s" repeatCount="indefinite"/><animate attributeName="y2" values="16;148;16" dur="4.5s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.05;0.4;0.05" dur="4.5s" repeatCount="indefinite"/></line>
 <g fill="${accent}">
  <circle cx="40" cy="46" r="1"><animate attributeName="cy" values="46;32;46" dur="4s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.8;0.1;0.8" dur="4s" repeatCount="indefinite"/></circle>
  <circle cx="82" cy="66" r="1.1"><animate attributeName="cy" values="66;50;66" dur="5s" begin="1.2s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.8;0.1;0.8" dur="5s" begin="1.2s" repeatCount="indefinite"/></circle>
  <circle cx="46" cy="92" r="1"><animate attributeName="cy" values="92;78;92" dur="4.6s" begin="2.1s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.7;0.1;0.7" dur="4.6s" begin="2.1s" repeatCount="indefinite"/></circle>
  <circle cx="76" cy="114" r="1.1"><animate attributeName="cy" values="114;100;114" dur="5.4s" begin="0.7s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.7;0.1;0.7" dur="5.4s" begin="0.7s" repeatCount="indefinite"/></circle>
 </g>
 <g stroke="${accent}" stroke-width="1.6" opacity="0.9"><line x1="4" y1="6" x2="4" y2="18"/><line x1="4" y1="6" x2="16" y2="6"/><line x1="116" y1="6" x2="116" y2="18"/><line x1="116" y1="6" x2="104" y2="6"/><line x1="4" y1="154" x2="4" y2="142"/><line x1="4" y1="154" x2="16" y2="154"/><line x1="116" y1="154" x2="116" y2="142"/><line x1="116" y1="154" x2="104" y2="154"/></g>
 </svg>`
}
function medDay(meds,logs,now){
 const today=dateKey(now),mins=now.getHours()*60+now.getMinutes()
 let expected=0,taken=0,overdue=0,lateTaken=0;const slots=[]
 for(const m of meds){
  if(m.med_type==='as_needed')continue
  if(m.med_type==='course'){
   if(m.prescribed_since&&today<m.prescribed_since)continue
   if(m.course_ends_at&&today>m.course_ends_at)continue
  }
  const sch=(m.medication_schedules||[]).slice().sort((a,b)=>(a.sort_order??0)-(b.sort_order??0))
  const list=sch.length?sch:[{id:null,dose_time:null}]
  for(const s of list){
   expected++
   const lg=logs.find(l=>l.medication_id===m.id&&l.schedule_id===s.id)
   let state
   if(lg)state=s.dose_time&&(new Date(lg.taken_at).getHours()*60+new Date(lg.taken_at).getMinutes())>sbHM(s.dose_time)+15?'late':'taken'
   else state=s.dose_time&&mins>sbHM(s.dose_time)+15?'overdue':'due'
   if(state==='taken')taken++
   else if(state==='late'){taken++;lateTaken++}
   else if(state==='overdue')overdue++
   slots.push({med:m,schedule:s,log:lg,state})
  }
 }
 let status
 if(overdue>0||lateTaken>0)status={cls:'sbCritical',label:'CRITICAL',color:'#ff3b5c'}
 else if(expected>0&&taken===expected)status={cls:'sbOptimal',label:'OPTIMAL',color:'#3fe58b'}
 else if(expected===0)status={cls:'sbNone',label:'NO DAILY MEDS',color:'#6d7680'}
 else status={cls:'sbOntrack',label:'ON TRACK',color:'#ffb020'}
 return{expected,taken,overdue,lateTaken,status,pct:expected?taken/expected:0,slots}
}
async function loadSickBay(){
 const box=q('#sickBay');if(!box)return
 try{
  const today=dateKey(new Date())
  const [mr,lr,membersR]=await Promise.all([
   supabase.from('medications').select('*,medication_schedules(*)').eq('household_id',household.id).order('sort_order'),
   supabase.from('medication_logs').select('*').eq('household_id',household.id).eq('log_date',today),
   supabase.from('household_members').select('user_id').eq('household_id',household.id)
  ])
  if(mr.error)throw mr.error
  const ids=(membersR.data||[]).map(x=>x.user_id)
  const profs=ids.length?(await supabase.from('profiles').select('user_id,display_name,nickname').in('user_id',ids)).data||[]:[]
  const meds=mr.data||[],logs=lr.data||[]
  box.innerHTML='<div class="crewRow">'+profs.map(p=>{
   const mine=meds.filter(m=>m.user_id===p.user_id),day=medDay(mine,logs,new Date()),name=p.nickname||p.display_name||'Crew'
   let sub
   if(day.status.cls==='sbCritical')sub=`${day.overdue} late${day.lateTaken?` · ${day.lateTaken} taken late`:''}`
   else if(day.status.cls==='sbOptimal')sub=`${day.taken}/${day.expected} · all clear`
   else if(day.status.cls==='sbOntrack')sub=`${day.taken}/${day.expected} · ${day.expected-day.taken} still ahead`
   else sub='no daily meds logged'
   return `<button class="crewCard" data-sbuser="${p.user_id}" type="button" aria-label="Open ${E(name)}'s health overview"><div class="avaFrame ${day.status.cls==='sbCritical'?'critical':''}">${avatarSVG('sb'+p.user_id,day.pct,day.status.color,sbAccent())}</div><div class="crewMeta"><div class="crewName">${E(name)}</div><span class="chip ${day.status.cls}">${day.status.label}</span><div class="crewSub">${E(sub)}</div></div></button>`
  }).join('')+'</div>'
  qa('[data-sbuser]').forEach(b=>b.onclick=()=>openHealthOverview(b.dataset.sbuser))
 }catch(e){box.innerHTML=`<div class="error">SICK BAY MALFUNCTION: ${E(e.message)}</div>`}
}
async function takeDose(medId,scheduleId){
 const r=await supabase.from('medication_logs').insert({household_id:household.id,medication_id:medId,schedule_id:scheduleId||null,log_date:dateKey(new Date()),taken_by:session.user.id})
 if(r.error)return toast('Sick Bay error.')
 toast('Dose logged ✓');if(active==='bridge')loadSickBay();sbRerender?.()
}
async function undoTaken(medId,scheduleId){
 if(!confirm('Undo this dose?'))return
 const r=await supabase.from('medication_logs').delete().eq('medication_id',medId).eq('schedule_id',scheduleId||null).eq('log_date',dateKey(new Date()))
 if(r.error)return toast('Sick Bay error.')
 toast('Dose undone.');if(active==='bridge')loadSickBay();sbRerender?.()
}
async function openHealthOverview(userId){
 const w=document.createElement('div');w.className='modalWrap'
 w.innerHTML=`<section class="panel modal sickBayModal"><div id="sbBody"><div class="muted">Loading vitals…</div></div></section>`
 document.body.appendChild(w)
 const close=()=>{sbRerender=null;w.remove()}
 w.addEventListener('click',e=>{if(e.target===w)close()})
 async function render(){
  try{
   const today=dateKey(new Date())
   const [mr,lr,or,membersR]=await Promise.all([
    supabase.from('medications').select('*,medication_schedules(*)').eq('household_id',household.id).eq('user_id',userId).order('sort_order'),
    supabase.from('medication_logs').select('*').eq('household_id',household.id).eq('log_date',today),
    supabase.from('health_observations').select('*').eq('household_id',household.id).eq('subject_user_id',userId).order('created_at',{ascending:false}),
    supabase.from('household_members').select('user_id').eq('household_id',household.id)
   ])
   if(mr.error)throw mr.error
   const meds=mr.data||[],logs=lr.data||[],obs=or.data||[]
   const ids=(membersR.data||[]).map(x=>x.user_id)
   const profs=ids.length?(await supabase.from('profiles').select('user_id,display_name,nickname').in('user_id',ids)).data||[]:[]
   const nameOf=id=>{const p=profs.find(x=>x.user_id===id);return p?(p.nickname||p.display_name||'Crew'):'Crew'}
   const me=profs.find(x=>x.user_id===userId),name=me?(me.nickname||me.display_name||'Crew'):'Crew'
   const day=medDay(meds,logs,new Date())
   const asNeeded=[]
   for(const m of meds.filter(x=>x.med_type==='as_needed')){
    const last=await supabase.from('medication_logs').select('*').eq('medication_id',m.id).order('taken_at',{ascending:false}).limit(1)
    asNeeded.push({m,last:last.data?.[0]||null})
   }
   const doseHTML=day.slots.map(s=>{
    const label=s.schedule?.dose_time?`<span class="doseTime">${E(s.schedule.dose_time)}</span>`:`<span class="anytime">any time today</span>`
    const right=s.state==='taken'?`<span class="stamp ok">✓ ${E(nameOf(s.log.taken_by))} · ${timeText(s.log.taken_at)}</span><button class="takeBtn undoBtn" data-undo="${s.med.id}" data-sched="${s.schedule?.id||''}" type="button">UNDO</button>`
     :s.state==='late'?`<span class="stamp bad">TAKEN LATE · ${timeText(s.log.taken_at)}</span>`
     :s.state==='overdue'?`<span class="stamp bad">OVERDUE · was due ${E(s.schedule?.dose_time||'')}</span><button class="takeBtn" data-take="${s.med.id}" data-sched="${s.schedule?.id||''}" type="button">TAKE</button>`
     :`<span class="stamp warn">due ${E(s.schedule?.dose_time||'today')}</span><button class="takeBtn" data-take="${s.med.id}" data-sched="${s.schedule?.id||''}" type="button">TAKE</button>`
    return `<div class="doseRow ${s.state}"><span class="doseDot"></span><div class="doseInfo"><b>${E(s.med.name)}</b>${label}</div><div class="doseRight">${right}</div></div>`
   }).join('')
   const prnHTML=asNeeded.map(({m,last})=>`<div class="doseRow"><span class="doseDot" style="background:#8a7bb5;box-shadow:0 0 9px #8a7bb5"></span><div class="doseInfo"><b>${E(m.name)}</b><span class="doseTime">${E(m.what_for||'')}</span></div><div class="doseRight"><span class="stamp" style="color:#d9cdf5">${last?`last ${dateText(last.taken_at)}`:'never taken'}</span><button class="takeBtn" data-take="${m.id}" data-sched="" type="button">TAKE NOW</button></div></div>`).join('')
   const medHTML=meds.map(m=>{
    const sch=m.medication_schedules||[],times=sch.filter(s=>s.dose_time).map(s=>s.dose_time)
    const schedText=m.med_type==='as_needed'?'as needed · no deadline':times.length?`set time${times.length>1?'s':''} · ${times.join(' & ')}`:'any time today'
    return `<details class="medCard"><summary><div class="medSummary"><b>${E(m.name)}</b><span class="chip ${m.med_type==='regular'?'reg':m.med_type==='course'?'course':'prn'}">${E(m.med_type.toUpperCase().replace('_',' '))}</span><div class="medSub">${E(m.what_for||'')}${m.prescribed_since?` · since ${E(m.prescribed_since)}`:''}${m.course_ends_at?` · ends ${E(m.course_ends_at)}`:''}</div></div></summary><div class="medDetail">
     <div class="kv"><span>SCHEDULE</span>${E(schedText)}</div>
     ${m.brand?`<div class="kv"><span>BRAND</span>${E(m.brand)}</div>`:''}
     ${m.packaging?`<div class="kv"><span>PACKAGING</span>${E(m.packaging)}</div>`:''}
     ${m.side_effects?`<div class="kv"><span>SIDE EFFECTS</span>${E(m.side_effects)}</div>`:''}
     ${m.cost?`<div class="kv"><span>COST</span>${E(m.cost)}</div>`:''}
     ${m.notes?`<div class="kv"><span>NOTES</span>${E(m.notes)}</div>`:''}
     ${m.reminder_minutes?`<div class="kv"><span>REMINDER</span>${E(m.reminder_minutes)} min before (in-app now, push later)</div>`:''}
     <div class="medActions"><button class="tiny" data-editmed="${m.id}" type="button">EDIT</button><button class="tiny" data-delmed="${m.id}" type="button">×</button></div>
    </div></details>`
   }).join('')
   const obsHTML=obs.length?obs.map(o=>`<div class="obsItem"><div>${E(o.body)}</div><div class="obsMeta">${E(nameOf(o.author_user_id))} · ${dateText(o.created_at)} ${timeText(o.created_at)}</div></div>`).join(''):'<div class="muted">No observations yet. How are they, actually?</div>'
   w.querySelector('#sbBody').innerHTML=`<div class="sbOvHead"><div class="avaFrame ${day.status.cls==='sbCritical'?'critical':''}">${avatarSVG('sbov'+userId,day.pct,day.status.color,sbAccent())}</div><div><div class="sbOvTitle">${E(name)}</div><div class="sbOvSub">Health overview · <span class="chip ${day.status.cls}">${day.status.label}</span></div></div><button class="sbClose" type="button" aria-label="Close">×</button></div>
    <div class="section-title">Today's doses</div>${doseHTML||'<div class="muted">Nothing due today.</div>'}
    ${prnHTML?`<div class="section-title">As needed</div>${prnHTML}`:''}
    <div class="section-title">Medications</div>${medHTML||'<div class="muted">No medications on record.</div>'}<button class="plusMed" type="button" style="margin-top:8px">+ ADD MEDICATION</button>
    <div class="section-title">Observations</div>${obsHTML}<div class="obsAdd"><input id="obsInput" placeholder="bad sleep, good mood, ate too much cheese, got a bruise…"><button id="obsAdd" type="button">LOG</button></div>`
   w.querySelector('.sbClose').onclick=close
   w.querySelector('.plusMed').onclick=()=>medModal()
   w.querySelector('#obsAdd').onclick=async()=>{
    const v=w.querySelector('#obsInput').value.trim();if(!v)return
    const r=await supabase.from('health_observations').insert({household_id:household.id,subject_user_id:userId,author_user_id:session.user.id,body:v})
    if(r.error)return toast('Sick Bay error.')
    toast('Observation logged ✓');render()
   }
   w.querySelectorAll('[data-take]').forEach(b=>b.onclick=()=>takeDose(b.dataset.take,b.dataset.sched))
   w.querySelectorAll('[data-undo]').forEach(b=>b.onclick=()=>undoTaken(b.dataset.undo,b.dataset.sched))
   w.querySelectorAll('[data-editmed]').forEach(b=>b.onclick=()=>medModal(b.dataset.editmed))
   w.querySelectorAll('[data-delmed]').forEach(b=>b.onclick=async()=>{if(!confirm('Remove this medication from the Sick Bay?'))return;const r=await supabase.from('medications').delete().eq('id',b.dataset.delmed);if(r.error)return toast('Sick Bay error.');toast('Removed.');render();loadSickBay()})
  }catch(e){w.querySelector('#sbBody').innerHTML=`<div class="error">${E(e.message)}</div>`}
 }
 sbRerender=render
 await render()
}
async function medModal(id=null){
 const members=(await supabase.from('household_members').select('user_id').eq('household_id',household.id)).data||[]
 const ids=members.map(x=>x.user_id)
 const profs=ids.length?(await supabase.from('profiles').select('user_id,display_name,nickname').in('user_id',ids)).data||[]:[]
 const m=id?(await supabase.from('medications').select('*,medication_schedules(*)').eq('id',id).single()).data:null
 const times=(m?.medication_schedules||[]).filter(s=>s.dose_time).map(s=>s.dose_time).join(', ')
 const w=document.createElement('div');w.className='modalWrap'
 w.innerHTML=`<section class="panel modal sickBayModal"><div class="section-title">${m?'Edit medication':'Add medication'}</div><form id="medf" class="formGrid">
  <div class="field full"><label>Medication</label><input id="mName" required value="${E(m?.name||'')}"></div>
  <div class="field"><label>Who takes it</label><select id="mWho">${profs.map(p=>`<option value="${p.user_id}" ${m?.user_id===p.user_id?'selected':''}>${E(p.nickname||p.display_name||'Crew')}</option>`).join('')}</select></div>
  <div class="field"><label>Type</label><select id="mType"><option value="regular" ${(!m||m.med_type==='regular')?'selected':''}>Regular</option><option value="as_needed" ${m?.med_type==='as_needed'?'selected':''}>As needed</option><option value="course" ${m?.med_type==='course'?'selected':''}>Course</option></select></div>
  <div class="field full"><label>What it's for</label><input id="mFor" value="${E(m?.what_for||'')}"></div>
  <div class="field"><label>Prescribed since</label><input id="mSince" type="date" value="${E(m?.prescribed_since||'')}"></div>
  <div class="field" id="mEndsWrap"><label>Course ends</label><input id="mEnds" type="date" value="${E(m?.course_ends_at||'')}"></div>
  <div class="field full" id="mTimesWrap"><label>Dose times (24h, comma separated)</label><input id="mTimes" placeholder="08:00, 21:00 — leave blank for any time today" value="${E(times)}"></div>
  <div class="field"><label>Brand</label><input id="mBrand" value="${E(m?.brand||'')}"></div>
  <div class="field"><label>Packaging</label><input id="mPack" value="${E(m?.packaging||'')}"></div>
  <div class="field full"><label>Side effects</label><textarea id="mSide">${E(m?.side_effects||'')}</textarea></div>
  <div class="field full"><label>Notes</label><textarea id="mNotes">${E(m?.notes||'')}</textarea></div>
  <div class="field"><label>Cost</label><input id="mCost" placeholder="€9.20 / month" value="${E(m?.cost||'')}"></div>
  <div class="field"><label>Remind (minutes before)</label><input id="mRemind" type="number" min="0" value="${m?.reminder_minutes??''}"></div>
  <div class="full"><button class="primary">${m?'SAVE CHANGES':'ADD TO CABINET'}</button> <button id="medCancel" type="button" class="ghost">Cancel</button></div><p id="medErr" class="error full"></p></form></section>`
 document.body.appendChild(w)
 w.querySelector('#medCancel').onclick=()=>w.remove()
 const typeSel=w.querySelector('#mType')
 const syncType=()=>{const t=typeSel.value;w.querySelector('#mTimesWrap').style.display=t==='as_needed'?'none':'';w.querySelector('#mEndsWrap').style.display=t==='course'?'':'none'}
 typeSel.onchange=syncType;syncType()
 w.querySelector('#medf').onsubmit=async e=>{
  e.preventDefault()
  const name=w.querySelector('#mName').value.trim(),who=w.querySelector('#mWho').value,type=typeSel.value
  if(!name)return
  let schedTimes=[]
  if(type!=='as_needed'){
   const raw=w.querySelector('#mTimes').value.trim()
   if(raw){schedTimes=raw.split(/[\s,]+/).filter(Boolean);for(const t of schedTimes)if(!/^([01]?\d|2[0-3]):[0-5]\d$/.test(t))return w.querySelector('#medErr').textContent=`"${E(t)}" is not a valid time. Use HH:MM like 08:00.`;schedTimes.sort()}
  }
  const payload={household_id:household.id,user_id:who,name,what_for:w.querySelector('#mFor').value.trim()||null,med_type:type,prescribed_since:w.querySelector('#mSince').value||null,course_ends_at:type==='course'?(w.querySelector('#mEnds').value||null):null,brand:w.querySelector('#mBrand').value.trim()||null,packaging:w.querySelector('#mPack').value.trim()||null,side_effects:w.querySelector('#mSide').value.trim()||null,notes:w.querySelector('#mNotes').value.trim()||null,cost:w.querySelector('#mCost').value.trim()||null,reminder_minutes:w.querySelector('#mRemind').value===''?null:Number(w.querySelector('#mRemind').value)}
  try{
   let medId=id
   if(id){const r=await supabase.from('medications').update(payload).eq('id',id);if(r.error)throw r.error;await supabase.from('medication_schedules').delete().eq('medication_id',id)}
   else{payload.sort_order=(await supabase.from('medications').select('id').eq('household_id',household.id)).data?.length||0;payload.created_by=session.user.id;const r=await supabase.from('medications').insert(payload).select().single();if(r.error)throw r.error;medId=r.data.id}
   const slots=type==='as_needed'?[]:(schedTimes.length?schedTimes:[null]).map((t,i)=>({household_id:household.id,medication_id:medId,dose_time:t,sort_order:i}))
   if(slots.length){const r=await supabase.from('medication_schedules').insert(slots);if(r.error)throw r.error}
   w.remove();toast(id?'Medication updated.':'Added to the Sick Bay.');if(active==='bridge')loadSickBay();sbRerender?.()
  }catch(err){w.querySelector('#medErr').textContent=err.message}
 }
}

/* ===== v0.9 Notifications ===== */
let notifReads=new Set(),notifItems=[],notifGlobalWired=false
const notifPrefs=()=>{try{return JSON.parse(localStorage.getItem('bridge_notify_prefs')||'{}')}catch(e){return {}}}
const notifOn=cat=>notifPrefs()[cat]!==false
async function computeNotifications(){
 const me=session.user.id,today=dateKey(new Date()),items=[]
 const now=new Date(),mins=now.getHours()*60+now.getMinutes()
 const [medsR,logsR,catsR,feedR,tasksR,billsR,notesR,cargoR]=await Promise.all([
  supabase.from('medications').select('id,name,user_id,med_type,prescribed_since,course_ends_at,medication_schedules(*)').eq('household_id',household.id),
  supabase.from('medication_logs').select('*').eq('household_id',household.id).eq('log_date',today),
  supabase.from('cats').select('*,cat_feeding_schedules(*)').eq('household_id',household.id),
  supabase.from('cat_feedings').select('*').eq('household_id',household.id).eq('feeding_date',today),
  supabase.from('tasks').select('id,title,due_at,status').eq('household_id',household.id).eq('status','needs_doing'),
  supabase.from('bills').select('id,name,amount,due_at,reminder_days').eq('household_id',household.id).eq('active',true),
  supabase.from('notes').select('id,note_type,recipient_user_id,opened_at,deleted_at,author_name_snapshot').eq('household_id',household.id).is('deleted_at',null),
  supabase.from('shopping_items').select('id,name,created_by,created_at,archived').eq('household_id',household.id).eq('archived',false)
 ])
 if(notifOn('meds')){const meds=medsR.data||[],logs=logsR.data||[];for(const m of meds){if(m.med_type==='as_needed')continue;if(m.med_type==='course'){if(m.prescribed_since&&today<m.prescribed_since)continue;if(m.course_ends_at&&today>m.course_ends_at)continue}for(const s of(m.medication_schedules||[]).filter(s=>s.dose_time)){const lg=logs.find(l=>l.medication_id===m.id&&l.schedule_id===s.id),due=sbHM(s.dose_time);if(lg){const t=new Date(lg.taken_at).getHours()*60+new Date(lg.taken_at).getMinutes();if(t>due+15)items.push({key:`med:${m.id}:${s.id}:${today}`,icon:'💊',cls:'icCrit',title:`${m.name} taken late`,txt:`Recorded ${timeText(lg.taken_at)} · was due ${s.dose_time}.`,time:'today',to:'bridge'})}else if(mins>due+15)items.push({key:`med:${m.id}:${s.id}:${today}`,icon:'💊',cls:'icCrit',title:`${m.name} is overdue`,txt:`Was due ${s.dose_time} · not logged.`,time:'today',to:'bridge'})}}}
 if(notifOn('cats')){const cats=catsR.data||[],feeds=feedR.data||[];for(const c of cats)for(const s of(c.cat_feeding_schedules||[])){const[h,mm]=s.feeding_time.split(':').map(Number),f=feeds.find(x=>x.cat_id===c.id&&x.schedule_id===s.id);if(!f&&mins>h*60+mm+60)items.push({key:`cat:${c.id}:${s.id}:${today}`,icon:'🐾',cls:'icWarn',title:`${c.name} hasn't been fed`,txt:`${s.feeding_time} feeding not recorded.`,time:'today',to:'bridge'})}}
 if(notifOn('bills')){for(const b of(billsR.data||[])){const d=daysFromNow(b.due_at);if(d<=Math.max(0,Number(b.reminder_days??1))){const cls=d<0?'icCrit':'icWarn';items.push({key:`bill:${b.id}:${dateKey(b.due_at)}`,icon:'💸',cls,title:`${b.name} ${d<0?`is ${-d}d overdue`:'wants money soon'}`,txt:`${eur(b.amount)} · ${d<0?'the vultures circle':d===0?'due today':d===1?'due tomorrow':`due in ${d} days`}.`,time:dateText(b.due_at),to:'treasury'})}}}
 if(notifOn('tasks')){for(const t of(tasksR.data||[])){if(!t.due_at)continue;const d=daysFromNow(t.due_at);if(d<=0)items.push({key:`task:${t.id}`,icon:'◷',cls:'icWarn',title:t.title,txt:d<0?`Overdue · was due ${dateText(t.due_at)}.`:'Due today.',time:dateText(t.due_at),to:'agenda'})}}
 if(notifOn('notes')){for(const n of(notesR.data||[])){if(n.note_type==='for_you'&&n.recipient_user_id===me&&!n.opened_at)items.push({key:`note:${n.id}`,icon:'✦',cls:'icNote',title:'New FOR YOU transmission',txt:`${n.author_name_snapshot||'Someone'} left you something sealed.`,time:'sealed',to:'notes'})}}
 if(notifOn('cargo')){const day=24*36e5;for(const it of(cargoR.data||[])){if(it.created_by!==me&&(Date.now()-new Date(it.created_at))<day)items.push({key:`cargo:${it.id}`,icon:'▣',cls:'icCargo',title:'New cargo request',txt:it.name,time:'recently',to:'shopping'})}}
 notifItems=items
 return items
}
async function refreshNotifBadge(){
 const badge=q('#notifBadge');if(!badge||!household)return
 try{
  const items=await computeNotifications();notifReads=new Set()
  const keys=items.map(i=>i.key)
  if(keys.length){const{data}=await supabase.from('notification_reads').select('event_key').eq('user_id',session.user.id).in('event_key',keys);for(const r of(data||[]))notifReads.add(r.event_key)}
  const unread=items.filter(i=>!notifReads.has(i.key)).length
  badge.textContent=unread;badge.hidden=unread===0
 }catch(e){badge.hidden=true}
}
function renderNotifFeed(){
 const feed=q('#notifFeed');if(!feed)return
 feed.innerHTML=notifItems.length?notifItems.map(n=>`<button class="notifRow ${notifReads.has(n.key)?'':'unread'}" data-nkey="${E(n.key)}" data-to="${n.to}" type="button"><span class="notifIcon ${n.cls}">${n.icon}</span><span class="notifBody"><b>${E(n.title)}</b><span class="txt">${E(n.txt)}</span><span class="time">${E(n.time)}</span></span></button>`).join(''):'<div class="empty">No transmissions. Suspiciously quiet.</div>'
 qa('.notifRow').forEach(b=>b.onclick=()=>{markNotifRead(b.dataset.nkey);if(b.dataset.to)go(b.dataset.to)})
}
async function markNotifRead(key){
 await supabase.from('notification_reads').insert({user_id:session.user.id,event_key:key,read_at:new Date().toISOString()},{onConflict:'user_id,event_key',ignoreDuplicates:true})
 notifReads.add(key)
 const unread=notifItems.filter(i=>!notifReads.has(i.key)).length,badge=q('#notifBadge');if(badge){badge.textContent=unread;badge.hidden=unread===0}
 const row=qa('.notifRow').find(b=>b.dataset.nkey===key);if(row)row.classList.remove('unread')
}
async function markAllNotifsRead(){
 for(const i of notifItems)await supabase.from('notification_reads').insert({user_id:session.user.id,event_key:i.key,read_at:new Date().toISOString()},{onConflict:'user_id,event_key',ignoreDuplicates:true})
 notifReads=new Set(notifItems.map(i=>i.key));refreshNotifBadge();renderNotifFeed()
}
async function openNotifPanel(){
 const panel=q('#notifPanel');if(!panel)return
 if(!panel.hidden){panel.hidden=true;return}
 await refreshNotifBadge();renderNotifFeed();panel.hidden=false
}
function openNotifPrefs(){
 const cats=[['meds','Medications'],['cats','Cat feeding'],['tasks','Tasks'],['bills','Bills'],['notes','For You notes'],['cargo','Cargo']]
 const p=notifPrefs()
 const w=document.createElement('div');w.className='modalWrap'
 w.innerHTML=`<section class="panel modal"><div class="section-title">What pings you</div><div class="notifPrefs">${cats.map(([k,l])=>`<label class="toggleLine"><input type="checkbox" data-pcat="${k}" ${p[k]!==false?'checked':''}> ${l}</label>`).join('')}</div><p class="muted">Per device for now.</p><button id="npDone" class="primary">DONE</button></section>`
 document.body.appendChild(w)
 w.querySelectorAll('[data-pcat]').forEach(c=>c.onchange=()=>{const pr=notifPrefs();pr[c.dataset.pcat]=c.checked;localStorage.setItem('bridge_notify_prefs',JSON.stringify(pr))})
 w.querySelector('#npDone').onclick=()=>{w.remove();refreshNotifBadge()}
}

async function bridge(){
 app.innerHTML=`<main class="shell hubShell">${top()}
 <section class="hubStatus panel">
   <div class="hubStatusTop"><div><span class="systemTag">HOUSEHOLD CONTROL HUB</span><h1>${E(profile?.nickname||profile?.display_name||'Crew')}</h1></div><div class="shipOnline"><span class="statusLamp"></span>ONLINE</div></div>
   <div id="miniWidget" class="miniWidget"><span>Scanning ship systems…</span></div>
 </section>
 <div id="hunger"></div>
 <section class="hubLayout">
   <section class="hubPanel sickBayConsole"><div class="hubPanelHead"><span>01</span><b>SICK BAY</b><small>MEDICAL LOG</small><button id="manageMeds" class="tiny sickBayManage" type="button">+ MED</button></div><div id="sickBay" class="sickBayBody"><span class="muted">Checking vitals…</span></div></section>
   <section class="hubPanel catConsole"><div class="hubPanelHead"><span>02</span><b>THE CHILDREN</b><small>FELINE LIFE SUPPORT</small></div><div id="cats" class="catrow compactCats">Scanning…</div></section>
   <section class="hubPanel todayConsole"><div class="hubPanelHead"><span>03</span><b>TODAY</b><small>ACTIVE TIMELINE</small></div><div id="todayTasks" class="timelineConsole muted">Consulting the timeline…</div></section>
   <section class="hubPanel commsConsole"><div class="hubPanelHead clickableHead" id="openCommsHub"><span>04</span><b>COMMS</b><small>NOTICE DECK</small></div><div id="bridgeNotes" class="bridgeNotes"><span class="muted">Checking the post-its…</span></div></section>
   <section class="hubPanel systemsConsole"><div class="hubPanelHead"><span>05</span><b>SYSTEMS</b><small>LOW-LEVEL NOISE</small></div>
      <div class="systemTiles">
        <button class="systemTile" id="openTreasuryHub" type="button"><span class="tileLamp"></span><b>TREASURY</b><small id="bridgeBills">Sweeping radar…</small></button>
        <button class="systemTile" id="openCargoHub" type="button"><span class="tileLamp"></span><b>CARGO</b><small>Shopping manifest</small></button>
      </div>
   </section>
 </section>
 </main><button id="plus" class="plus hubPlus">+</button><section id="menu" class="panel menu" hidden><button id="quickNote">NOTE</button><button id="quickTask">TASK</button><button id="quickStuff">STUFF</button><button id="quickMoney">MONEY</button></section>${nav()}`
 wire()
 q('#plus').onclick=()=>q('#menu').hidden=!q('#menu').hidden
 q('#quickTask').onclick=()=>taskModal();q('#quickStuff').onclick=()=>stuffModal();q('#quickMoney').onclick=()=>go('treasury');q('#quickNote').onclick=()=>noteTypeChooser()
 q('#openCommsHub').onclick=()=>go('notes');q('#openTreasuryHub').onclick=()=>go('treasury');q('#openCargoHub').onclick=()=>go('shopping')
 q('#manageMeds').onclick=()=>medModal()
 await Promise.all([loadCats(),bridgeTasks(),bridgeBills(),bridgeNotes(),loadHubWidget(),loadSickBay()])
}
async function loadHubWidget(){
  const box=q('#miniWidget');if(!box)return
  try{
    const today=dateKey(new Date())
    const [tr,nr,br]=await Promise.all([
      supabase.from('tasks').select('id,due_at,status').eq('household_id',household.id).eq('status','needs_doing'),
      supabase.from('notes').select('id,recipient_user_id,author_user_id,opened_at,note_type,deleted_at').eq('household_id',household.id).is('deleted_at',null),
      supabase.from('bills').select('id,due_at,active').eq('household_id',household.id).eq('active',true)
    ])
    const quests=(tr.data||[]).filter(t=>t.due_at&&dateKey(t.due_at)===today).length
    const transmissions=(nr.data||[]).filter(n=>n.note_type==='for_you'&&n.recipient_user_id===session.user.id&&!n.opened_at).length
    const due=(br.data||[]).filter(b=>daysFromNow(b.due_at)<=1).length
    const lines=['Ship mostly operational.','All systems nominal-ish.','No hull breaches reported.','Household remains questionably functional.']
    box.innerHTML=`<div class="widgetStat"><b>${quests}</b><span>quests today</span></div><div class="widgetStat"><b>${transmissions}</b><span>new transmissions</span></div><div class="widgetStat"><b>${due}</b><span>bills close</span></div><div class="widgetMessage">✦ ${E(pick(lines))}</div>`
  }catch(e){box.innerHTML='<span class="muted">Widget is pretending not to know anything.</span>'}
}
async function bridgeTasks(){const box=q('#todayTasks');if(!box)return;const today=dateKey(new Date()),{data}=await supabase.from('tasks').select('*').eq('household_id',household.id).eq('status','needs_doing').order('due_at');const list=(data||[]).filter(t=>t.due_at&&dateKey(t.due_at)===today);box.innerHTML=list.length?list.slice(0,5).map(t=>`<div class="row"><span>${E(t.title)}</span><span>${t.all_day?'TODAY':timeText(t.due_at)}</span></div>`).join(''):'No disasters currently detected. Probably.'}
async function loadCats(){
 const box=q('#cats'),hb=q('#hunger');if(!box)return
 try{
  const cr=await supabase.from('cats').select('*,cat_feeding_schedules(*)').eq('household_id',household.id)
  if(cr.error)throw cr.error
  const catsSorted=(cr.data||[]).slice().sort((a,b)=>{const order=['Pukha','Pluto'];const ia=order.indexOf(a.name),ib=order.indexOf(b.name);if(ia>-1||ib>-1){if(ia===-1)return 1;if(ib===-1)return -1;return ia-ib}return (a.name||'').localeCompare(b.name||'')})
  const fr=await supabase.from('cat_feedings').select('*').eq('household_id',household.id).eq('feeding_date',dateKey(new Date())).order('recorded_at',{ascending:false})
  if(fr.error)throw fr.error
  const fs=fr.data||[],users=[...new Set(fs.map(x=>x.recorded_by).filter(Boolean))],names={}
  if(users.length){
    for(const p of (await supabase.from('profiles').select('user_id,display_name').in('user_id',users)).data||[])names[p.user_id]=p.display_name
  }
  const now=new Date(),mins=now.getHours()*60+now.getMinutes();let lateAny=false
  box.innerHTML=catsSorted.map(c=>`<article class="cat"><div class="catname">${E(c.name)}${c.nickname?` <span class="catNick">“${E(c.nickname)}”</span>`:''}</div><div class="muted">${E(c.breed)}</div><div class="bowls">${(c.cat_feeding_schedules||[]).sort((a,b)=>a.feeding_time.localeCompare(b.feeding_time)).map(s=>{
    const f=fs.find(x=>x.cat_id===c.id&&x.schedule_id===s.id),[h,m]=s.feeding_time.split(':').map(Number),late=!f&&mins>h*60+m+60
    if(late)lateAny=true
    const noteFlag=f?.note?`<div class="stamp">NOTE: ${E(f.note.length>34?f.note.slice(0,34)+'…':f.note)}</div>`:''
    return `<button class="bowl ${f?f.status:late?'overdue':''}" data-cat="${c.id}" data-sch="${s.id}" data-time="${s.feeding_time.slice(0,5)}" data-feeding="${f?.id||''}">
      ${s.feeding_time.slice(0,5)}<br>${f?f.status.toUpperCase():late?'HUNGRY':'○'}
      ${f?`<div class="stamp">${E(names[f.recorded_by]||'Crew')} · ${timeText(f.recorded_at)}</div>${noteFlag}`:''}
    </button>`
  }).join('')}</div></article>`).join('')
  hb.innerHTML=lateAny?'<div class="alert">THE CHILDREN HUNGER. THIS IS NOT A DRILL.</div>':''
  qa('.bowl').forEach(b=>b.onclick=()=>feedModal(b.dataset.cat,b.dataset.sch,b.dataset.time,b.dataset.feeding||null))
 }catch(e){box.innerHTML=`<div class="error">FELINE SCANNER MALFUNCTION: ${E(e.message)}</div>`}
}
async function feedModal(cat,sch,time,feedingId=null){
  let existing=null
  if(feedingId){
    const r=await supabase.from('cat_feedings').select('*').eq('id',feedingId).single()
    if(r.error)return toast('The feeding record has wandered off.')
    existing=r.data
  }else{
    const r=await supabase.from('cat_feedings').select('*').eq('household_id',household.id).eq('cat_id',cat).eq('schedule_id',sch).eq('feeding_date',dateKey(new Date())).maybeSingle()
    if(!r.error&&r.data)existing=r.data
  }

  const w=document.createElement('div');w.className='modalWrap'
  w.innerHTML=`<section class="panel modal feedingEditor">
    <div class="section-title">${existing?'Edit feeding record':'Feeding report'} · ${E(time)}</div>
    ${existing?`<div class="muted">Already recorded. You can change the status or add/edit the note afterwards.</div>`:''}
    <div class="statusBtns feedingStatuses">
      ${['fed','partial','refused','other'].map(s=>`<button type="button" data-s="${s}" class="${existing?.status===s?'selected':''}">${s.toUpperCase()}</button>`).join('')}
    </div>
    <div class="field"><label>Note</label><textarea id="fn" rows="4" placeholder="Anything worth remembering?">${E(existing?.note||'')}</textarea></div>
    <div class="feedingFooter">
      <button id="saveFeeding" class="primary">${existing?'SAVE CHANGES':'RECORD IT'}</button>
      <button id="cancel" class="ghost">Cancel</button>
    </div>
    <p id="fe" class="error"></p>
  </section>`
  document.body.appendChild(w)

  let chosen=existing?.status||null
  const statusBtns=[...w.querySelectorAll('[data-s]')]
  statusBtns.forEach(b=>b.onclick=()=>{
    chosen=b.dataset.s
    statusBtns.forEach(x=>x.classList.toggle('selected',x===b))
  })

  w.querySelector('#cancel').onclick=()=>w.remove()
  w.querySelector('#saveFeeding').onclick=async()=>{
    const note=w.querySelector('#fn').value.trim()||null
    if(!chosen)return w.querySelector('#fe').textContent='Pick what actually happened first, captain.'
    let r
    if(existing){
      r=await supabase.from('cat_feedings').update({
        status:chosen,
        note,
        recorded_by:session.user.id,
        recorded_at:new Date().toISOString()
      }).eq('id',existing.id)
    }else{
      r=await supabase.from('cat_feedings').insert({
        household_id:household.id,
        cat_id:cat,
        schedule_id:sch,
        feeding_date:dateKey(new Date()),
        status:chosen,
        note,
        recorded_by:session.user.id
      })
    }
    if(r.error)return w.querySelector('#fe').textContent=r.error.message
    w.remove()
    toast(existing?(note?'Feeding record updated. The lore expands.':'Feeding record updated.'):'Feline tribute recorded.')
    loadCats()
  }
}
async function crew(){app.innerHTML=`<main class="shell">${top('Crew')}<section class="panel invite"><div class="section-title">Household invite code</div><div class="code">${E(household.invite_code)}</div></section><h1 class="pageTitle">Crew Manifest</h1><div id="cg" class="crewgrid"></div></main>${nav()}`;wire();const ms=(await supabase.from('household_members').select('user_id').eq('household_id',household.id)).data||[],ids=ms.map(x=>x.user_id),ps=ids.length?(await supabase.from('profiles').select('*').in('user_id',ids)).data||[]:[],cs=(await supabase.from('cats').select('*').eq('household_id',household.id)).data||[];q('#cg').innerHTML=[...ps.map(p=>`<article class="panel crewcard crewHuman" tabindex="0" data-crewuser="${p.user_id}" role="button" aria-label="Open ${E(p.display_name)}'s profile"><div class="crewhead"><div class="avatar">${E((p.display_name||'?')[0])}</div><div><div class="crewname">${E(p.display_name)}</div><div class="muted">${E(p.nickname||'Human')}</div></div></div></article>`),...cs.map(c=>`<article class="panel crewcard crewHuman" tabindex="0" data-crewcat="${c.id}" role="button" aria-label="Open ${E(c.name)}'s profile"><div class="crewhead"><div class="avatar">${E((c.name||'?')[0])}</div><div><div class="crewname">${E(c.name)}</div><div class="muted">${E(c.breed||'')}${c.nickname?` · “${E(c.nickname)}”`:''}</div></div></div></article>`)].join('');qa('.crewHuman').forEach(el=>{el.onclick=()=>el.dataset.crewuser?openCrewProfile(el.dataset.crewuser):openCatProfile(el.dataset.crewcat);el.onkeydown=e=>{if(e.key==='Enter')el.dataset.crewuser?openCrewProfile(el.dataset.crewuser):openCatProfile(el.dataset.crewcat)}})}
async function openCatProfile(catId){
 const w=document.createElement('div');w.className='modalWrap'
 w.innerHTML=`<section class="panel modal crewProfile"><div id="cpBody"><span class="muted">Reading the files…</span></div></section>`
 document.body.appendChild(w)
 w.addEventListener('click',e=>{if(e.target===w)w.remove()})
 async function load(){
  const c=(await supabase.from('cats').select('*').eq('id',catId).maybeSingle()).data
  if(!c){w.remove();return toast('That cat has wandered off.')}
  const ar=await supabase.from('cat_aliases').select('*').eq('cat_id',catId).order('retired_at',{ascending:false})
  const aliases=ar.data||[]
  w.querySelector('#cpBody').innerHTML=`<div class="cpHead"><div class="avatar">${E((c.name||'?')[0])}</div><div><div class="crewname">${E(c.name)}</div><div class="muted">${E(c.breed||'')}${c.nickname?` · “${E(c.nickname)}”`:''}</div></div><button id="cpClose" class="detailClose" type="button" aria-label="Close">×</button></div>
   <div class="section-title">Veteran callsigns</div>
   ${aliases.length?aliases.map(a=>`<div class="obsItem"><div>“${E(a.alias)}”</div><div class="obsMeta">retired ${dateText(a.retired_at)}</div></div>`).join(''):`<div class="muted">No retired nicknames. ${E(c.name)} is on their first name.</div>`}
   <button id="cpEdit" class="ghost" style="margin-top:12px" type="button">EDIT</button>
   <div id="cpEditForm" hidden style="margin-top:10px">
     <div class="field"><label>Name</label><input id="cpName" value="${E(c.name||'')}"></div>
     <div class="field"><label>Breed</label><input id="cpBreed" value="${E(c.breed||'')}"></div>
     <div class="field"><label>Nickname</label><input id="cpNick" value="${E(c.nickname||'')}"></div>
     <button id="cpSave" class="primary" type="button">SAVE</button>
   </div>`
  w.querySelector('#cpClose').onclick=()=>w.remove()
  w.querySelector('#cpEdit').onclick=()=>{const f=w.querySelector('#cpEditForm');f.hidden=!f.hidden}
  w.querySelector('#cpSave').onclick=async()=>{
   const nm=w.querySelector('#cpName').value.trim()||c.name,br=w.querySelector('#cpBreed').value.trim()||null,nn=w.querySelector('#cpNick').value.trim()||null
   const r=await supabase.from('cats').update({name:nm,breed:br,nickname:nn}).eq('id',catId)
   if(r.error)return toast('Cat edit failed.')
   if(c.nickname&&c.nickname!==nn)await supabase.from('cat_aliases').insert({household_id:household.id,cat_id:catId,alias:c.nickname,created_by:session.user.id})
   toast(c.nickname&&c.nickname!==nn?'Cat updated. Old callsign retired to the archive.':'Cat updated.')
   if(active==='crew')crew()
   load()
  }
 }
 await load()
}
async function openCrewProfile(userId){
 const w=document.createElement('div');w.className='modalWrap'
 w.innerHTML=`<section class="panel modal crewProfile"><div id="cpBody"><span class="muted">Reading the files…</span></div></section>`
 document.body.appendChild(w)
 w.addEventListener('click',e=>{if(e.target===w)w.remove()})
 async function load(){
  const p=(await supabase.from('profiles').select('*').eq('user_id',userId).maybeSingle()).data
  if(!p){w.remove();return toast('That crew member has wandered off.')}
  const ar=await supabase.from('profile_aliases').select('*').eq('user_id',userId).order('retired_at',{ascending:false})
  const aliases=ar.data||[]
  const nm=p.nickname||p.display_name||'Crew'
  w.querySelector('#cpBody').innerHTML=`<div class="cpHead"><div class="avatar">${E((p.display_name||'?')[0])}</div><div><div class="crewname">${E(p.display_name)}</div><div class="muted">${E(p.nickname||'No nickname')}</div></div><button id="cpClose" class="detailClose" type="button" aria-label="Close">×</button></div>
   <div class="section-title">Veteran callsigns</div>
   ${aliases.length?aliases.map(a=>`<div class="obsItem"><div>“${E(a.alias)}”</div><div class="obsMeta">retired ${dateText(a.retired_at)}</div></div>`).join(''):`<div class="muted">No retired callsigns. ${E(nm)} is on their first name.</div>`}
   <button id="cpEdit" class="ghost" style="margin-top:12px" type="button">EDIT</button>
   <div id="cpEditForm" hidden style="margin-top:10px">
     <div class="field"><label>Display name</label><input id="cpName" value="${E(p.display_name||'')}"></div>
     <div class="field"><label>Nickname</label><input id="cpNick" value="${E(p.nickname||'')}"></div>
     <button id="cpSave" class="primary" type="button">SAVE</button>
   </div>`
  w.querySelector('#cpClose').onclick=()=>w.remove()
  w.querySelector('#cpEdit').onclick=()=>{const f=w.querySelector('#cpEditForm');f.hidden=!f.hidden}
  w.querySelector('#cpSave').onclick=async()=>{
   const dn=w.querySelector('#cpName').value.trim()||p.display_name,nn=w.querySelector('#cpNick').value.trim()||null
   const r=await supabase.from('profiles').update({display_name:dn,nickname:nn}).eq('user_id',userId)
   if(r.error)return toast('Profile edit failed.')
   if(p.nickname&&p.nickname!==nn)await supabase.from('profile_aliases').insert({household_id:household.id,user_id:userId,alias:p.nickname,created_by:session.user.id})
   toast(p.nickname&&p.nickname!==nn?'Profile updated. Old callsign retired to the archive.':'Profile updated.')
   if(active==='crew')crew()
   load()
  }
 }
 await load()
}

async function agenda(){
 await ensureCategories()
 app.innerHTML=`<main class="shell">${top('Agenda')}<div class="agendaToolbar"><div><h1 class="pageTitle">Temporal Operations</h1><div class="muted">Try not to damage the timeline.</div></div><div><button id="newTask" class="primary">NEW TASK</button> <button id="categories" class="ghost">CATEGORIES</button></div></div><div class="viewSwitch"><button data-view="today" class="${agendaView==='today'?'active':''}">TODAY</button><button data-view="week" class="${agendaView==='week'?'active':''}">THIS WEEK</button><button data-view="month" class="${agendaView==='month'?'active':''}">MONTH</button></div><section id="agendaBills" class="panel card" style="margin-bottom:12px"><div class="muted">Financial radar sweeping…</div></section><section id="stage" class="panel card">Consulting the timeline…</section></main>${nav()}`
 wire();q('#newTask').onclick=()=>taskModal();q('#categories').onclick=()=>categoryModal();qa('[data-view]').forEach(b=>b.onclick=()=>{agendaView=b.dataset.view;syncRoute();agenda()});addSwipe(q('#stage'));await Promise.all([drawAgenda(),drawAgendaBills()])
}
function addSwipe(el){let x=null;el.addEventListener('touchstart',e=>x=e.touches[0].clientX,{passive:true});el.addEventListener('touchend',e=>{if(x===null)return;const dx=e.changedTouches[0].clientX-x;x=null;if(Math.abs(dx)<60)return;const v=['today','week','month'];let i=v.indexOf(agendaView)+(dx<0?1:-1);i=Math.max(0,Math.min(2,i));if(v[i]!==agendaView){agendaView=v[i];agenda()}},{passive:true})}
async function agendaData(){const [tr,cr,mr]=await Promise.all([supabase.from('tasks').select('*,task_subtasks(*)').eq('household_id',household.id).order('due_at',{ascending:true,nullsFirst:false}),supabase.from('task_categories').select('*').eq('household_id',household.id).order('sort_order'),supabase.from('household_members').select('user_id').eq('household_id',household.id)]);if(tr.error)throw tr.error;const ids=(mr.data||[]).map(x=>x.user_id),ps=ids.length?(await supabase.from('profiles').select('user_id,display_name').in('user_id',ids)).data||[]:[];return{tasks:tr.data||[],cats:cr.data||[],profiles:ps}}
const assName=(t,p)=>t.assignment_type==='either'?'Either':t.assignment_type==='both'?'Both':p.find(x=>x.user_id===t.assigned_user_id)?.display_name||'Someone'
function taskCard(t,cmap,profiles,done=false){const c=cmap[t.category_id]||{name:'Other',color:'#777'},subs=t.task_subtasks||[];return`<article class="taskItem"><div class="stripe" style="background:${E(c.color)}"></div><div class="taskMain"><div><div class="taskTitle">${E(t.title)}</div><div class="taskMeta"><span class="chip">${E(c.name)}</span><span class="chip">${E(assName(t,profiles))}</span><span class="chip">${t.due_at?`${dateText(t.due_at)}${t.all_day?'':` · ${timeText(t.due_at)}`}`:'No deadline'}</span>${t.recurrence_type!=='none'?`<span class="chip">↻ ${E(t.recurrence_type.replace('_',' '))}</span>`:''}${t.photo_path?'<span class="chip">Photo attached</span>':''}</div>${overdue(t)}</div><div>${!done?`<button class="tiny" data-done="${t.id}">DONE</button>`:''} <button class="tiny" data-edit="${t.id}">EDIT</button></div></div>${t.notes?`<div class="taskNotes">${E(t.notes)}</div>`:''}${subs.length?`<div class="subtasks">${subs.sort((a,b)=>a.sort_order-b.sort_order).map(s=>`<label><input type="checkbox" data-sub="${s.id}" ${s.is_done?'checked':''}> ${E(s.text)}</label>`).join('')}</div>`:''}${done&&t.completed_at?`<div class="muted">Completed ${dateText(t.completed_at)} · ${timeText(t.completed_at)}</div>`:''}</article>`}
async function drawAgenda(){const s=q('#stage');try{const{tasks,cats,profiles}=await agendaData(),cm=Object.fromEntries(cats.map(c=>[c.id,c])),open=tasks.filter(t=>t.status==='needs_doing'),done=tasks.filter(t=>t.status==='done');if(agendaView==='today'){const td=dateKey(new Date()),today=open.filter(t=>t.due_at&&dateKey(t.due_at)===td),floating=open.filter(t=>!t.due_at);s.innerHTML=`<div class="section-title">Today</div><div class="taskList">${today.length?today.map(t=>taskCard(t,cm,profiles)).join(''):'<div class="empty">Nothing scheduled today. The timeline is suspiciously calm.</div>'}</div>${floating.length?`<div class="section-title" style="margin-top:18px">Floating in the void</div><div class="taskList">${floating.map(t=>taskCard(t,cm,profiles)).join('')}</div>`:''}<button id="dungeonBtn" class="dungeonBtn">DESCEND INTO THE DUNGEONS OF COMPLETED QUESTS</button><div id="dungeon" class="dungeon">${done.length?done.map(t=>taskCard(t,cm,profiles,true)).join(''):'<div class="muted">The dungeon is empty.</div>'}</div>`;q('#dungeonBtn').onclick=()=>q('#dungeon').classList.toggle('open')}else if(agendaView==='week'){const now=new Date(),delta=(now.getDay()+6)%7,mon=new Date(now);mon.setHours(0,0,0,0);mon.setDate(now.getDate()-delta);let html='';for(let i=0;i<7;i++){const d=new Date(mon);d.setDate(mon.getDate()+i);const k=dateKey(d),its=open.filter(t=>t.due_at&&dateKey(t.due_at)===k);html+=`<div class="dayColumn"><div class="dayHead">${d.toLocaleDateString('en-IE',{weekday:'short',day:'numeric',month:'short'})}</div>${its.map(t=>`<div class="miniTask" style="border-color:${cm[t.category_id]?.color||'#777'}">${E(t.title)}</div>`).join('')||'<div class="muted">clear</div>'}</div>`}s.innerHTML=`<div class="weekGrid">${html}</div>`}else{const now=new Date(),y=now.getFullYear(),m=now.getMonth(),first=new Date(y,m,1),last=new Date(y,m+1,0),off=(first.getDay()+6)%7;let html=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=>`<div class="monthHead">${x}</div>`).join('');for(let i=0;i<off;i++)html+='<div></div>';for(let d=1;d<=last.getDate();d++){const dt=new Date(y,m,d),k=dateKey(dt),its=open.filter(t=>t.due_at&&dateKey(t.due_at)===k);html+=`<div class="monthDay"><div class="monthNum">${d}</div>${its.slice(0,4).map(t=>`<div class="monthTask" style="border-color:${cm[t.category_id]?.color||'#777'}">${E(t.title)}</div>`).join('')}</div>`}s.innerHTML=`<div class="section-title">${now.toLocaleDateString('en-IE',{month:'long',year:'numeric'})}</div><div class="monthGrid">${html}</div>`}wireTasks()}catch(e){s.innerHTML=`<div class="error">${E(e.message)}</div>`}}
function wireTasks(){qa('[data-done]').forEach(b=>b.onclick=()=>completeTask(b.dataset.done));qa('[data-edit]').forEach(b=>b.onclick=()=>taskModal(b.dataset.edit));qa('[data-sub]').forEach(c=>c.onchange=()=>supabase.from('task_subtasks').update({is_done:c.checked}).eq('id',c.dataset.sub))}
function nextDue(t){if(!t.due_at||t.recurrence_type==='none')return null;const d=new Date(t.due_at),n=t.recurrence_interval||1;if(t.recurrence_type==='daily'||t.recurrence_type==='custom_days')d.setDate(d.getDate()+n);if(t.recurrence_type==='weekly')d.setDate(d.getDate()+7*n);if(t.recurrence_type==='monthly')d.setMonth(d.getMonth()+n);return d.toISOString()}
async function completeTask(id){const t=(await supabase.from('tasks').select('*,task_subtasks(*)').eq('id',id).single()).data;if(!t)return;await supabase.from('tasks').update({status:'done',completed_by:session.user.id,completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',id);const nd=nextDue(t);if(nd){const r=await supabase.from('tasks').insert({household_id:household.id,title:t.title,notes:t.notes,category_id:t.category_id,assignment_type:t.assignment_type,assigned_user_id:t.assigned_user_id,due_at:nd,all_day:t.all_day,recurrence_type:t.recurrence_type,recurrence_interval:t.recurrence_interval,parent_recurring_task_id:t.parent_recurring_task_id||t.id,created_by:session.user.id}).select().single();if(r.data&&t.task_subtasks?.length)await supabase.from('task_subtasks').insert(t.task_subtasks.map((s,i)=>({task_id:r.data.id,text:s.text,sort_order:i})))}drawAgenda();bridgeTasks()}
async function uploadPhoto(file){if(!file)return null;const path=`${household.id}/${session.user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;const r=await supabase.storage.from('task-photos').upload(path,file);if(r.error)throw r.error;return path}
async function taskModal(id=null){const cats=(await supabase.from('task_categories').select('*').eq('household_id',household.id).order('sort_order')).data||[],ms=(await supabase.from('household_members').select('user_id').eq('household_id',household.id)).data||[],ids=ms.map(x=>x.user_id),ps=ids.length?(await supabase.from('profiles').select('user_id,display_name').in('user_id',ids)).data||[]:[],t=id?(await supabase.from('tasks').select('*,task_subtasks(*)').eq('id',id).single()).data:null,w=document.createElement('div');w.className='modalWrap';const due=t?.due_at?new Date(t.due_at).toISOString().slice(0,16):'';w.innerHTML=`<section class="panel modal"><div class="section-title">${t?'Edit temporal problem':'New temporal problem'}</div><form id="tf" class="formGrid"><div class="field full"><label>Task</label><input id="tt" required value="${E(t?.title||'')}"></div><div class="field"><label>Category</label><select id="tc">${cats.map(c=>`<option value="${c.id}" ${c.id===t?.category_id?'selected':''}>${E(c.name)}</option>`).join('')}</select></div><div class="field"><label>Assigned to</label><select id="ta"><option value="either">Either</option><option value="both" ${t?.assignment_type==='both'?'selected':''}>Both</option>${ps.map(p=>`<option value="user:${p.user_id}" ${t?.assigned_user_id===p.user_id?'selected':''}>${E(p.display_name)}</option>`).join('')}</select></div><div class="field"><label>Due date/time</label><input id="td" type="datetime-local" value="${due}"></div><div class="field"><label>All day</label><select id="al"><option value="false">No</option><option value="true" ${t?.all_day?'selected':''}>Yes</option></select></div><div class="field"><label>Repeat</label><select id="rt"><option value="none">No repeat</option><option value="daily" ${t?.recurrence_type==='daily'?'selected':''}>Daily</option><option value="weekly" ${t?.recurrence_type==='weekly'?'selected':''}>Weekly</option><option value="monthly" ${t?.recurrence_type==='monthly'?'selected':''}>Monthly</option><option value="custom_days" ${t?.recurrence_type==='custom_days'?'selected':''}>Every X days</option></select></div><div class="field"><label>Interval</label><input id="ri" type="number" min="1" value="${t?.recurrence_interval||1}"></div><div class="field full"><label>Notes</label><textarea id="tn">${E(t?.notes||'')}</textarea></div><div class="field full"><label>Subtasks, one per line</label><textarea id="ts">${E((t?.task_subtasks||[]).sort((a,b)=>a.sort_order-b.sort_order).map(s=>s.text).join('\n'))}</textarea></div><div class="field full"><label>Photo</label><input id="tp" type="file" accept="image/*"></div><div class="full"><button class="primary">${t?'SAVE CHANGES':'ADD TO TIMELINE'}</button> <button id="cancel" type="button" class="ghost">Cancel</button></div><p id="terr" class="error full"></p></form></section>`;document.body.appendChild(w);w.querySelector('#cancel').onclick=()=>w.remove();w.querySelector('#tf').onsubmit=async e=>{e.preventDefault();try{const av=w.querySelector('#ta').value,specific=av.startsWith('user:'),file=w.querySelector('#tp').files[0],photo=file?await uploadPhoto(file):t?.photo_path||null,p={household_id:household.id,title:w.querySelector('#tt').value.trim(),notes:w.querySelector('#tn').value.trim()||null,category_id:w.querySelector('#tc').value||null,assignment_type:specific?'specific':av,assigned_user_id:specific?av.slice(5):null,due_at:w.querySelector('#td').value?new Date(w.querySelector('#td').value).toISOString():null,all_day:w.querySelector('#al').value==='true',recurrence_type:w.querySelector('#rt').value,recurrence_interval:+w.querySelector('#ri').value||1,photo_path:photo,updated_at:new Date().toISOString()};let tid=id;if(id){const r=await supabase.from('tasks').update(p).eq('id',id);if(r.error)throw r.error;await supabase.from('task_subtasks').delete().eq('task_id',id)}else{p.created_by=session.user.id;const r=await supabase.from('tasks').insert(p).select().single();if(r.error)throw r.error;tid=r.data.id}const lines=w.querySelector('#ts').value.split('\n').map(x=>x.trim()).filter(Boolean);if(lines.length)await supabase.from('task_subtasks').insert(lines.map((text,i)=>({task_id:tid,text,sort_order:i})));w.remove();if(active==='agenda')drawAgenda();if(active==='bridge')bridgeTasks()}catch(err){w.querySelector('#terr').textContent=err.message}}}
async function categoryModal(){const cats=(await supabase.from('task_categories').select('*').eq('household_id',household.id).order('sort_order')).data||[],w=document.createElement('div');w.className='modalWrap';w.innerHTML=`<section class="panel modal"><div class="section-title">Shared categories</div><div>${cats.map(c=>`<div class="catEdit"><span class="colorDot" style="background:${c.color}"></span><input data-name="${c.id}" value="${E(c.name)}"><input data-color="${c.id}" type="color" value="${c.color}"><button class="tiny" data-del="${c.id}">×</button></div>`).join('')}</div><div class="field"><label>Add category</label><input id="cn"><input id="cc" type="color" value="#8a6ea8"></div><button id="add" class="primary">ADD CATEGORY</button> <button id="close" class="ghost">Done</button><p id="ce" class="error"></p></section>`;document.body.appendChild(w);w.querySelector('#close').onclick=()=>w.remove();w.querySelector('#add').onclick=async()=>{const n=w.querySelector('#cn').value.trim();if(!n)return;const r=await supabase.from('task_categories').insert({household_id:household.id,name:n,color:w.querySelector('#cc').value,created_by:session.user.id,sort_order:cats.length+1});if(r.error)return w.querySelector('#ce').textContent=r.error.message;w.remove();categoryModal()};w.querySelectorAll('[data-name]').forEach(i=>i.onchange=()=>supabase.from('task_categories').update({name:i.value}).eq('id',i.dataset.name));w.querySelectorAll('[data-color]').forEach(i=>i.onchange=()=>supabase.from('task_categories').update({color:i.value}).eq('id',i.dataset.color));w.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{if(confirm('Delete this category? Tasks stay, just uncategorised.')){await supabase.from('task_categories').delete().eq('id',b.dataset.del);w.remove();categoryModal()}})}

const defaultShoppingLists=[['Groceries','#9f6f83'],['Household','#777c86'],['Pharmacy','#6e8694'],['Other','#76627f']]
async function ensureShoppingLists(){
  if(!household)return
  const x=(await supabase.from('shopping_lists').select('id').eq('household_id',household.id).limit(1)).data
  if(x?.length)return
  await supabase.from('shopping_lists').insert(defaultShoppingLists.map((a,i)=>({household_id:household.id,name:a[0],color:a[1],sort_order:i,created_by:session.user.id})))
}
async function more(){
  app.innerHTML=`<main class="shell">${top('More')}<div class="moreHead"><span class="systemTag">SECONDARY SYSTEMS</span><h1 class="pageTitle">More</h1></div>
  <section class="panel card consoleCard">
    <div class="section-title">Your console</div>
    <div class="muted">${E(profile?.display_name||'Crew')}${profile?.nickname?` · “${E(profile.nickname)}”`:''}</div>
    <form id="profileForm" class="formGrid">
      <div class="field"><label>Display name</label><input id="pfName" value="${E(profile?.display_name||'')}" required></div>
      <div class="field"><label>Nickname</label><input id="pfNick" placeholder="what the crew calls you" value="${E(profile?.nickname||'')}"></div>
      <div class="full"><button class="primary">SAVE PROFILE</button></div>
      <p id="pfErr" class="error full"></p>
    </form>
    <div class="themeDeck"><div><div class="section-title">Theme</div><div class="muted">Theme follows your profile across devices.</div></div>
      <div class="themeChoices"><button id="themeC" class="themeChoice ${profile?.ui_theme!=='J'?'selected':''}" data-theme-choice="C"><span class="themeSwatch cSwatch"></span><b>C</b></button><button id="themeJ" class="themeChoice ${profile?.ui_theme==='J'?'selected':''}" data-theme-choice="J"><span class="themeSwatch jSwatch"></span><b>J</b></button></div>
    </div>
  </section>
  <div class="moreGrid" style="margin-top:12px">
    <section id="openTreasury" class="panel moduleCard"><div class="moduleGlyph">◈</div><div class="section-title">Treasury</div><h2>Bills & Debt</h2><p class="muted">Tribute and dwindling horrors.</p></section>
    <section id="openLog" class="panel moduleCard"><div class="moduleGlyph">⌁</div><div class="section-title">Archives</div><h2>Captain's Log</h2><p class="muted">Permanent household lore.</p></section>
    <section id="openCrew" class="panel moduleCard"><div class="moduleGlyph">⚑</div><div class="section-title">Crew</div><h2>Manifest</h2><p class="muted">Invite code, humans & cats, retired callsigns.</p></section>
    <section class="panel moduleCard"><div class="moduleGlyph">❄</div><div class="section-title">Cold Storage</div><h2>Freezer</h2><p class="muted">Coming next.</p></section>
  </div></main>${nav()}`
  wire();q('#openTreasury').onclick=()=>go('treasury');q('#openLog').onclick=()=>go('log');q('#openCrew').onclick=()=>go('crew');qa('[data-theme-choice]').forEach(b=>b.onclick=()=>setTheme(b.dataset.themeChoice))
  q('#profileForm').onsubmit=async e=>{
    e.preventDefault()
    const dn=q('#pfName').value.trim(),nn=q('#pfNick').value.trim()||null
    if(!dn)return q('#pfErr').textContent='You need a display name, captain.'
    const oldNick=profile?.nickname||null
    const r=await supabase.from('profiles').update({display_name:dn,nickname:nn}).eq('user_id',session.user.id)
    if(r.error)return q('#pfErr').textContent=r.error.message
    if(oldNick&&oldNick!==nn)await supabase.from('profile_aliases').insert({household_id:household.id,user_id:session.user.id,alias:oldNick,created_by:session.user.id})
    profile={...profile,display_name:dn,nickname:nn}
    toast(oldNick&&oldNick!==nn?'Profile updated. Old callsign retired to the archive.':'Profile updated.');more()
  }
}
async function shopping(){
  await ensureShoppingLists()
  const lists=(await supabase.from('shopping_lists').select('*').eq('household_id',household.id).order('sort_order')).data||[]
  app.innerHTML=`<main class="shell"><div class="shoppingTop">${top('Cargo')}<div class="secondaryControls"><button id="addItem" class="primary">ADD ITEM</button> <button id="shopMode" class="ghost">SHOPPING MODE</button> <button id="manageLists" class="ghost">LISTS</button></div></div>
  <div id="newCargoPing"></div>
  <div class="filterBar filterExtras"><select id="listFilter"><option value="all">All lists</option>${lists.map(l=>`<option value="${l.id}">${E(l.name)}</option>`).join('')}</select><select id="typeFilter"><option value="all">Needs + Wants</option><option value="need">Needs only</option><option value="want">Wants only</option></select><select id="shopFilter"><option value="all">All shops</option></select><button id="clearFilters">CLEAR</button></div>
  <section class="panel card"><div class="section-title">Frequent cargo</div><div id="favourites" class="frequentGrid"><span class="muted">Loading repeat offenders…</span></div></section>
  <section class="panel card" style="margin-top:12px"><div class="shoppingTop"><div><div class="section-title">Active manifest</div><div class="muted">Bought items fall to the bottom until you finish the shop.</div></div><button id="finishShop" class="finishShop">FINISH SHOP</button></div><div id="shoppingList" class="shopList" style="margin-top:12px"></div></section>
  </main><button id="plus" class="plus">+</button>${nav()}`
  wire()
  q('#addItem').onclick=()=>shoppingItemModal()
  q('#plus').onclick=()=>shoppingItemModal()
  q('#shopMode').onclick=()=>document.body.classList.toggle('shoppingMode')
  q('#manageLists').onclick=()=>shoppingListsModal()
  q('#clearFilters').onclick=()=>{q('#listFilter').value='all';q('#typeFilter').value='all';q('#shopFilter').value='all';drawShopping()}
  ;['#listFilter','#typeFilter','#shopFilter'].forEach(s=>q(s).onchange=drawShopping)
  q('#finishShop').onclick=finishShoppingTrip
  await drawShopping(true)
}
async function getShoppingData(){
  const [ir,lr]=await Promise.all([
    supabase.from('shopping_items').select('*').eq('household_id',household.id).eq('archived',false).order('is_bought').order('created_at'),
    supabase.from('shopping_lists').select('*').eq('household_id',household.id).order('sort_order')
  ])
  if(ir.error)throw ir.error
  return {items:ir.data||[],lists:lr.data||[]}
}
async function drawShopping(initial=false){
  const box=q('#shoppingList');if(!box)return
  try{
    const {items,lists}=await getShoppingData(),lm=Object.fromEntries(lists.map(l=>[l.id,l]))
    const shops=[...new Set(items.map(i=>i.shop).filter(Boolean))].sort()
    const sf=q('#shopFilter')
    const old=sf?.value||'all'
    if(sf){sf.innerHTML=`<option value="all">All shops</option>${shops.map(s=>`<option value="${E(s)}">${E(s)}</option>`).join('')}`;if([...sf.options].some(o=>o.value===old))sf.value=old}
    const lf=q('#listFilter')?.value||'all',tf=q('#typeFilter')?.value||'all',shf=q('#shopFilter')?.value||'all'
    const filtered=items.filter(i=>(lf==='all'||i.list_id===lf)&&(tf==='all'||i.priority_type===tf)&&(shf==='all'||i.shop===shf))
    const favs=items.filter(i=>i.is_favourite&&!i.is_bought)
    const fbox=q('#favourites')
    if(fbox)fbox.innerHTML=favs.length?favs.slice(0,12).map(i=>`<button class="frequentBtn" data-favadd="${i.id}">${E(i.name)}${i.quantity?` · ${E(i.quantity)}`:''}</button>`).join(''):'<span class="muted">Star repeat buys and they live here.</span>'
    box.innerHTML=filtered.length?filtered.sort((a,b)=>Number(a.is_bought)-Number(b.is_bought)||new Date(a.created_at)-new Date(b.created_at)).map(i=>{
      const l=lm[i.list_id]||{name:'Other',color:'#777'}
      return `<article class="shopItem ${i.is_bought?'bought':''}" data-item="${i.id}">
        <button class="shopCheck" data-buy="${i.id}">${i.is_bought?'✓':''}</button>
        <div><div class="shopName">${E(i.name)} ${i.is_favourite?'<span class="fav">★</span>':''}</div>
        <div class="shopMeta"><span class="chip" style="border-color:${l.color}">${E(l.name)}</span><span class="chip ${i.priority_type==='need'?'needChip':'wantChip'}">${i.priority_type.toUpperCase()}</span>${i.quantity?`<span class="chip">Qty: ${E(i.quantity)}</span>`:''}${i.shop?`<span class="chip">${E(i.shop)}</span>`:''}${i.photo_path?'<span class="photoBadge">photo</span>':''}</div>
        ${i.note?`<div class="shopNote">${E(i.note)}</div>`:''}</div>
        <div class="shopActions"><button class="tiny" data-star="${i.id}">${i.is_favourite?'UNSTAR':'STAR'}</button><button class="tiny" data-editshop="${i.id}">EDIT</button><button class="tiny" data-delshop="${i.id}">×</button></div>
      </article>`
    }).join(''):'<div class="empty">Cargo hold empty. Either you are brilliantly prepared or you forgot everything.</div>'
    qa('[data-buy]').forEach(b=>b.onclick=()=>toggleBought(b.dataset.buy))
    qa('[data-star]').forEach(b=>b.onclick=async()=>{const it=items.find(i=>i.id===b.dataset.star);await supabase.from('shopping_items').update({is_favourite:!it.is_favourite,updated_at:new Date().toISOString()}).eq('id',it.id);drawShopping()})
    qa('[data-editshop]').forEach(b=>b.onclick=()=>shoppingItemModal(b.dataset.editshop))
    qa('[data-delshop]').forEach(b=>b.onclick=async()=>{if(confirm('Remove this from the manifest?'))await supabase.from('shopping_items').delete().eq('id',b.dataset.delshop)})
    qa('[data-favadd]').forEach(b=>b.onclick=async()=>{const src=items.find(i=>i.id===b.dataset.favadd);if(!src)return;await supabase.from('shopping_items').insert({household_id:household.id,list_id:src.list_id,name:src.name,quantity:src.quantity,priority_type:src.priority_type,shop:src.shop,note:src.note,is_favourite:true,created_by:session.user.id})})
  }catch(e){box.innerHTML=`<div class="error">${E(e.message)}</div>`}
}
async function toggleBought(id){
  const i=(await supabase.from('shopping_items').select('*').eq('id',id).single()).data;if(!i)return
  await supabase.from('shopping_items').update({is_bought:!i.is_bought,bought_by:!i.is_bought?session.user.id:null,bought_at:!i.is_bought?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq('id',id)
}
async function finishShoppingTrip(){
  const bought=(await supabase.from('shopping_items').select('id').eq('household_id',household.id).eq('archived',false).eq('is_bought',true)).data||[]
  if(!bought.length)return alert('Nothing is crossed off yet. The cargo officers are confused.')
  if(!confirm(`Finish shop and clear ${bought.length} bought item${bought.length===1?'':'s'} from the active list?`))return
  await supabase.from('shopping_items').update({archived:true,archived_at:new Date().toISOString(),updated_at:new Date().toISOString()}).in('id',bought.map(x=>x.id))
}
async function uploadShoppingPhoto(file){
  if(!file)return null
  const path=`${household.id}/${session.user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`
  const r=await supabase.storage.from('shopping-photos').upload(path,file)
  if(r.error)throw r.error
  return path
}
async function shoppingItemModal(id=null){
  await ensureShoppingLists()
  const lists=(await supabase.from('shopping_lists').select('*').eq('household_id',household.id).order('sort_order')).data||[]
  const item=id?(await supabase.from('shopping_items').select('*').eq('id',id).single()).data:null
  const w=document.createElement('div');w.className='modalWrap'
  w.innerHTML=`<section class="panel modal"><div class="section-title">${item?'Edit cargo':'Add cargo'}</div><form id="sif" class="formGrid">
    <div class="field full"><label>Item</label><input id="sin" required value="${E(item?.name||'')}"></div>
    <div class="field"><label>List</label><select id="sil">${lists.map(l=>`<option value="${l.id}" ${l.id===item?.list_id?'selected':''}>${E(l.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Need or want?</label><select id="sip"><option value="need" ${item?.priority_type!=='want'?'selected':''}>Need</option><option value="want" ${item?.priority_type==='want'?'selected':''}>Want</option></select></div>
    <div class="field"><label>Quantity</label><input id="siq" placeholder="2, 500 g, N/A…" value="${E(item?.quantity||'')}"></div>
    <div class="field"><label>Shop (optional)</label><input id="sis" placeholder="Lidl, Aldi…" value="${E(item?.shop||'')}"></div>
    <div class="field full"><label>Note</label><textarea id="sinote">${E(item?.note||'')}</textarea></div>
    <div class="field full"><label>Photo</label><input id="siphoto" type="file" accept="image/*"></div>
    <div class="field full"><label><input id="sifav" type="checkbox" ${item?.is_favourite?'checked':''}> Save as a repeat buy</label></div>
    <div class="full"><button class="primary">${item?'SAVE':'ADD TO CARGO'}</button> <button id="sicancel" type="button" class="ghost">Cancel</button></div><p id="sierr" class="error full"></p>
  </form></section>`
  document.body.appendChild(w);w.querySelector('#sicancel').onclick=()=>w.remove()
  w.querySelector('#sif').onsubmit=async e=>{
    e.preventDefault()
    try{
      let photo=item?.photo_path||null
      const f=w.querySelector('#siphoto').files[0];if(f)photo=await uploadShoppingPhoto(f)
      const data={household_id:household.id,list_id:w.querySelector('#sil').value,name:w.querySelector('#sin').value.trim(),quantity:w.querySelector('#siq').value.trim()||null,priority_type:w.querySelector('#sip').value,shop:w.querySelector('#sis').value.trim()||null,note:w.querySelector('#sinote').value.trim()||null,photo_path:photo,is_favourite:w.querySelector('#sifav').checked,updated_at:new Date().toISOString()}
      let r
      if(id)r=await supabase.from('shopping_items').update(data).eq('id',id)
      else{data.created_by=session.user.id;r=await supabase.from('shopping_items').insert(data)}
      if(r.error)throw r.error
      w.remove();if(active==='shopping')drawShopping()
    }catch(e){w.querySelector('#sierr').textContent=e.message}
  }
}
async function shoppingListsModal(){
  const lists=(await supabase.from('shopping_lists').select('*').eq('household_id',household.id).order('sort_order')).data||[]
  const w=document.createElement('div');w.className='modalWrap'
  w.innerHTML=`<section class="panel modal"><div class="section-title">Cargo lists</div><div class="listManager">${lists.map(l=>`<div class="listEdit"><span class="colorDot" style="background:${l.color}"></span><input data-lname="${l.id}" value="${E(l.name)}"><input data-lcolor="${l.id}" type="color" value="${l.color}"><button class="tiny" data-ldel="${l.id}">×</button></div>`).join('')}</div><div class="field"><label>New list</label><input id="nln"><input id="nlc" type="color" value="#736787"></div><button id="nladd" class="primary">ADD LIST</button> <button id="nlclose" class="ghost">Done</button><p id="nlerr" class="error"></p></section>`
  document.body.appendChild(w);w.querySelector('#nlclose').onclick=()=>w.remove()
  w.querySelector('#nladd').onclick=async()=>{const name=w.querySelector('#nln').value.trim();if(!name)return;const r=await supabase.from('shopping_lists').insert({household_id:household.id,name,color:w.querySelector('#nlc').value,sort_order:lists.length+1,created_by:session.user.id});if(r.error)return w.querySelector('#nlerr').textContent=r.error.message;w.remove();shoppingListsModal()}
  w.querySelectorAll('[data-lname]').forEach(i=>i.onchange=()=>supabase.from('shopping_lists').update({name:i.value,updated_at:new Date().toISOString()}).eq('id',i.dataset.lname))
  w.querySelectorAll('[data-lcolor]').forEach(i=>i.onchange=()=>supabase.from('shopping_lists').update({color:i.value,updated_at:new Date().toISOString()}).eq('id',i.dataset.lcolor))
  w.querySelectorAll('[data-ldel]').forEach(b=>b.onclick=async()=>{if(confirm('Delete this list? Its items will remain under no list.')){await supabase.from('shopping_lists').delete().eq('id',b.dataset.ldel);w.remove();shoppingListsModal()}})
}




function contrastText(hex){
  const h=(hex||'#7d5266').replace('#','')
  if(h.length!==6)return '#ffffff'
  const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16)
  const lum=(0.2126*r+0.7152*g+0.0722*b)/255
  return lum>0.62?'#0a0a0c':'#ffffff'
}
async function signedNoteMedia(path){
  if(!path)return null
  try{
    const {data,error}=await supabase.storage.from('note-media').download(path)
    if(!error&&data)return URL.createObjectURL(data)
  }catch(e){console.warn(e)}
  const {data,error}=await supabase.storage.from('note-media').createSignedUrl(path,3600)
  if(error){console.error(error);return null}
  return data?.signedUrl||null
}
async function enrichNoteMedia(notes){
  return await Promise.all((notes||[]).map(async n=>({
    ...n,
    _photoUrl:await signedNoteMedia(n.photo_path),
    _doodleUrl:await signedNoteMedia(n.doodle_path)
  })))
}
function installLongPress(el,actions){
  let timer=null,moved=false
  const close=()=>{actions.classList.remove('open','floatingMenu');actions.style.left='';actions.style.top='';document.removeEventListener('pointerdown',outside,true)}
  const outside=e=>{if(!actions.contains(e.target)&&e.target!==el)close()}
  const open=()=>{
    const r=el.getBoundingClientRect()
    actions.classList.add('open','floatingMenu')
    const width=Math.min(300,window.innerWidth-24)
    actions.style.width=`${width}px`
    actions.style.left=`${Math.max(12,Math.min(window.innerWidth-width-12,r.left))}px`
    actions.style.top=`${Math.max(12,Math.min(window.innerHeight-actions.offsetHeight-12,r.top+34))}px`
    el.setAttribute('aria-expanded','true')
    setTimeout(()=>document.addEventListener('pointerdown',outside,true),0)
  }
  const start=()=>{moved=false;timer=setTimeout(()=>{if(!moved)open()},520)}
  const clear=()=>{if(timer){clearTimeout(timer);timer=null}}
  el.addEventListener('pointerdown',start);el.addEventListener('pointermove',()=>{moved=true;clear()});el.addEventListener('pointerup',clear);el.addEventListener('pointercancel',clear)
  el.addEventListener('contextmenu',e=>{e.preventDefault();open()})
  el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}})
}

const noteEmptyLines=['It’s giving... nothing.','Scanners detect: Fuck all.','This note is 0% note and 100% empty.','Bitch ate and left no crumbs and now wants to BRAG ABOUT IT','Have you got nothing to say to me?','Meow.','Meow-meow','Fucking stoners forgetting what a note is supposed to do...']
const selfForYou=['Self-obsessed much?','God complex incoming...','Self-Love is impurrtant too....','Noooo, share with the claaass']
const pinChaos=['The bridge has become a Post-it war crime.','Oh god, they’re swarming us!','We are surrounded by post-its.']
const sealedLines=[
 n=>`${n} left you something <3`,n=>`PRIVATE TRANSMISSION FROM ${n}`,n=>`You’ve got a thing!`,
 n=>`SPECIAL DELIVERY`,n=>`Psst... ${n} sent you something.`,n=>`OI. CLICK ME.`,
 n=>`Incoming affection... probably.`,n=>`TOP SECRET. FOR YOUR EYES ONLY.`,n=>`A wild love note appeared!`,n=>`You have mail! Like it’s 2003.`
]
const openedLines=['FOR YOU <3','SPECIAL DELIVERY','INCOMING TRANSMISSION','YOU’VE GOT LOVE','PSST...','A THING FOR YOU','PRIVATE TRANSMISSION','QUESTIONABLE INTENT DETECTED','OI. READ THIS.']
const expiryLines=['THIS NOTE IS APPROACHING THE EVENT HORIZON.','THE VOID HAS NOTICED THIS NOTE.','SEVEN DAYS UNTIL THE ARCHIVE GODS DEMAND A DECISION.','THE PAPER DECAY PROTOCOL HAS BEGUN.','IT HAS ONE DAY LEFT. CHOOSE ITS FATE.']
const logLines=['Entry recorded.','Added to the lore.','The record has been amended.','Captain’s log updated.','History has been burdened with this information.']
const noteErrorLines=['Something has gone tits up in Comms.','a fucky-wucky seems to have happened in the note tubes','ouch, that note did not go where notes go....','WRONG HOLE — Comms edition','The post-it transporter has malfunctioned.']
const reactionSet=['♥','HAHA','FUCK U','CAT','SUS','KISS']

async function currentDisplayName(){
  const {data}=await supabase.from('profiles').select('*').eq('user_id',session.user.id).maybeSingle()
  return data?.nickname||data?.display_name||session.user.email?.split('@')[0]||'Crew'
}
async function crewProfiles(){
  const {data:members}=await supabase.from('household_members').select('user_id').eq('household_id',household.id)
  const ids=(members||[]).map(m=>m.user_id).filter(Boolean)
  if(!ids.length)return []
  const {data}=await supabase.from('profiles').select('*').in('user_id',ids)
  return data||[]
}

async function reactionSummary(noteIds){
  if(!noteIds?.length)return {}
  const {data,error}=await supabase.from('note_reactions').select('*').in('note_id',noteIds)
  if(error){console.error(error);return {}}
  const out={}
  for(const r of data||[]){
    out[r.note_id] ||= {}
    out[r.note_id][r.reaction] ||= {count:0,mine:false}
    out[r.note_id][r.reaction].count++
    if(r.user_id===session.user.id)out[r.note_id][r.reaction].mine=true
  }
  return out
}
function reactionButton(noteId,reaction,summary,attr='data-breact'){
  const x=summary?.[noteId]?.[reaction]||{count:0,mine:false}
  return `<button class="reactionBtn ${x.mine?'reacted':''}" ${attr}="${noteId}" data-r="${E(reaction)}">${E(reaction)}${x.count?` <span class="reactionCount">${x.count}</span>`:''}</button>`
}

async function bridgeNotes(){
 const box=q('#bridgeNotes');if(!box)return
 try{
  const {data,error}=await supabase.from('notes').select('*').eq('household_id',household.id).is('deleted_at',null).is('dismissed_at',null).eq('pinned',true).order('created_at',{ascending:false})
  if(error)throw error
  let mine=(data||[]).filter(n=>!n.recipient_user_id||n.recipient_user_id===session.user.id||n.author_user_id===session.user.id)
  mine=await enrichNoteMedia(mine)
  const reactions=await reactionSummary(mine.map(n=>n.id))
  box.innerHTML=mine.length?`<div class="bridgeStickyGrid">${mine.slice(0,5).map(n=>bridgeNoteCard(n,reactions)).join('')}</div>${mine.length>5?`<button id="moreBridgeNotes" class="ghost notesMore">+${mine.length-5} MORE NOTES</button>`:''}`:'<span class="muted">Empy :(</span>'
  wireBridgeNotes(mine)
  if(q('#moreBridgeNotes'))q('#moreBridgeNotes').onclick=()=>{go('notes')}
 }catch(e){console.error(e);box.textContent='Comms are making a suspicious noise.'}
}
function bridgeNoteCard(n,reactions={}){
 const sealed=n.note_type==='for_you'&&n.recipient_user_id===session.user.id&&!n.opened_at
 const txt=contrastText(n.color)
 if(sealed)return `<article class="bridgePaper bridgeEnvelope" tabindex="0" data-bnote="${n.id}" data-sealed="1" style="--paper:${n.color};--paperText:${txt}"><div class="envelopeFlap"></div><div class="envelopeSeal">♥</div><b>${E(pick(sealedLines)(n.author_name_snapshot))}</b><small>from ${E(n.author_name_snapshot)}</small></article>`
 return `<article class="bridgePaper ${n.note_type==='doodle'?'bridgeDoodle':'bridgeSticky'}" tabindex="0" data-bnote="${n.id}" style="--paper:${n.color};--paperText:${txt}">
 <div class="bridgePaperTo">${n.recipient_name_snapshot?`TO ${E(n.recipient_name_snapshot)}`:'ON THE BRIDGE'}</div>
 ${n._doodleUrl?`<img src="${E(n._doodleUrl)}" alt="Doodle">`:n._photoUrl?`<img src="${E(n._photoUrl)}" alt="Photo attached to note">`:''}
 ${n.body?`<div class="bridgePaperBody">${E(n.body)}</div>`:''}
 <div class="bridgePaperFrom">— ${E(n.author_name_snapshot)}</div>
 <div class="bridgePaperReactions">${reactionSet.map(r=>reactionButton(n.id,r,reactions,'data-breact')).join('')}</div>
 <div class="bridgeNoteMenu" data-bmenu="${n.id}"></div></article>`
}
function wireBridgeNotes(ns){
 qa('[data-bnote]').forEach(card=>{
  const n=ns.find(x=>x.id===card.dataset.bnote);if(!n)return
  if(card.dataset.sealed){card.onclick=()=>openForYou(n.id);return}
  let timer,moved=false,longOpened=false
  const menu=()=>{longOpened=true;openBridgeMenu(card,n)}
  card.onpointerdown=()=>{moved=false;longOpened=false;timer=setTimeout(()=>{if(!moved)menu()},520)}
  card.onpointermove=()=>{moved=true;clearTimeout(timer)}
  card.onpointerup=e=>{clearTimeout(timer);if(!moved&&!longOpened&&!e.target.closest('button'))openNoteDetail(n)}
  card.onpointercancel=()=>clearTimeout(timer)
  card.oncontextmenu=e=>{e.preventDefault();menu()}
  card.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();openNoteDetail(n)}}
 })
 qa('[data-breact]').forEach(b=>b.onclick=e=>{e.stopPropagation();reactNote(b.dataset.breact,b.dataset.r,ns.find(n=>n.id===b.dataset.breact))})
}
function bridgeMenuHTML(n){
 const own=n.author_user_id===session.user.id
 return `${own?'<button data-act="edit">EDIT</button>':''}<button data-act="pin">${n.pinned?'UNPIN':'PIN THIS BABY'}</button>${n.recipient_user_id===session.user.id?'<button data-act="dismiss">TRANSMISSION RECEIVED</button>':''}<button data-act="hoard">HOARD THIS</button>${n.needs_action&&!n.action_completed_at?'<button data-act="quest">QUEST COMPLETED</button>':''}<button data-act="log">ADD TO CAPTAIN'S LOG</button><button data-act="comments">COMMENTS</button><button data-act="history">HISTORY</button><button data-act="destroy">DESTROY</button>`
}
function openBridgeMenu(card,n){
 qa('.bridgeNoteMenu.open').forEach(x=>x.classList.remove('open'))
 const m=card.querySelector('[data-bmenu]');if(!m)return
 m.innerHTML=bridgeMenuHTML(n);m.classList.add('open','floatingMenu')
 const r=card.getBoundingClientRect(),width=Math.min(300,window.innerWidth-24)
 m.style.width=`${width}px`;m.style.left=`${Math.max(12,Math.min(window.innerWidth-width-12,r.left))}px`;m.style.top=`${Math.max(12,Math.min(window.innerHeight-330,r.top+32))}px`
 m.onclick=async e=>{const a=e.target.dataset.act;if(!a)return;e.stopPropagation()
  if(a==='edit')return noteModal(null,n.id)
  if(a==='pin'){await supabase.from('notes').update({pinned:!n.pinned,updated_at:new Date().toISOString()}).eq('id',n.id);return bridgeNotes()}
  if(a==='dismiss'){await supabase.from('notes').update({dismissed_at:new Date().toISOString(),pinned:false}).eq('id',n.id);return bridgeNotes()}
  if(a==='hoard'){await supabase.from('notes').update({hoarded_at:new Date().toISOString(),pinned:false}).eq('id',n.id);toast('Added to Making loveNOTES <3');return bridgeNotes()}
  if(a==='quest'){await supabase.from('notes').update({action_completed_at:new Date().toISOString(),action_completed_by:session.user.id}).eq('id',n.id);toast('QUEST COMPLETED');return bridgeNotes()}
  if(a==='log')return saveNoteToLog(n.id)
  if(a==='comments')return noteThreadModal(n.id)
  if(a==='history')return noteHistoryModal(n.id)
  if(a==='destroy')return softDeleteNote(n.id)
 }
}
async function openNoteDetail(n){
 const w=document.createElement('div');w.className='modalWrap noteDetailWrap'
 const txt=contrastText(n.color)
 const rs=await reactionSummary([n.id])
 w.innerHTML=`<section class="panel modal noteDetail" style="--paper:${n.color};--paperText:${txt}"><button class="detailClose">×</button><div class="noteTo">${n.recipient_name_snapshot?`TO ${E(n.recipient_name_snapshot)}`:'ON THE BRIDGE'}</div>${n._doodleUrl?`<img class="noteMedia" src="${E(n._doodleUrl)}" alt="Doodle">`:n._photoUrl?`<img class="noteMedia" src="${E(n._photoUrl)}" alt="Photo">`:''}<div class="noteBody">${E(n.body||'')}</div><div class="noteMeta">from ${E(n.author_name_snapshot)} · ${dateText(n.created_at)} ${timeText(n.created_at)}</div><div class="reactionStrip">${reactionSet.map(r=>{const x=rs?.[n.id]?.[r]||{count:0,mine:false};return `<button class="reactionBtn ${x.mine?'reacted':''}" data-dr="${E(r)}">${E(r)}${x.count?` <span class="reactionCount">${x.count}</span>`:''}</button>`}).join('')}</div><button id="detailOptions" class="ghost">OPTIONS</button><div class="bridgeNoteMenu" data-bmenu="${n.id}"></div></section>`
 document.body.appendChild(w);w.querySelector('.detailClose').onclick=()=>w.remove()
 w.querySelectorAll('[data-dr]').forEach(b=>b.onclick=()=>reactNote(n.id,b.dataset.dr,n))
 w.querySelector('#detailOptions').onclick=()=>openBridgeMenu(w.querySelector('.noteDetail'),n)
}
let notesTab=localStorage.getItem('bridge_notes_tab')||'all'
async function notes(){
  app.innerHTML=`<main class="shell commsShell">${top('Comms')}
  <section class="commsHeader"><div><span class="systemTag">COMMUNICATIONS DECK</span><h1 class="pageTitle">Comms</h1><div class="muted">Post-its, sealed nonsense and evidence.</div></div><button id="newTransmission" class="primary transmissionButton">+ TRANSMISSION</button></section>
  <div class="noteFilters commsFilters">
    ${[['all','ALL'],['for_you','FOR YOU'],['notes','NOTES'],['doodles','DOODLES'],['love','Making loveNOTES'],['bin','BIN']].map(([k,l])=>`<button data-nt="${k}" class="${notesTab===k?'active':''}">${l}</button>`).join('')}
  </div>
  <section id="notesStage"><div class="panel card muted">Opening communications channels…</div></section></main>${nav()}`
  wire();q('#newTransmission').onclick=()=>noteTypeChooser()
  qa('[data-nt]').forEach(b=>b.onclick=()=>{notesTab=b.dataset.nt;localStorage.setItem('bridge_notes_tab',notesTab);syncRoute();drawNotes();qa('[data-nt]').forEach(x=>x.classList.toggle('active',x.dataset.nt===notesTab))})
  await drawNotes()
}
async function drawNotes(){
  const stage=q('#notesStage');if(!stage)return
  try{
    const {data,error}=await supabase.from('notes').select('*').eq('household_id',household.id).order('created_at',{ascending:false});if(error)throw error
    let ns=await enrichNoteMedia(data||[])
    const reactions=await reactionSummary(ns.map(n=>n.id))
    if(notesTab==='all')ns=ns.filter(n=>!n.deleted_at&&!n.hoarded_at)
    if(notesTab==='for_you')ns=ns.filter(n=>!n.deleted_at&&!n.hoarded_at&&n.note_type==='for_you')
    if(notesTab==='notes')ns=ns.filter(n=>!n.deleted_at&&!n.hoarded_at&&n.note_type==='sticky')
    if(notesTab==='doodles')ns=ns.filter(n=>!n.deleted_at&&!n.hoarded_at&&n.note_type==='doodle')
    if(notesTab==='love')ns=ns.filter(n=>!n.deleted_at&&n.hoarded_at)
    if(notesTab==='bin')ns=ns.filter(n=>n.deleted_at)
    const title=notesTab==='love'?'<div class="loveNotesTitle">Making <span class="loveNOTES">loveNOTES</span></div>':notesTab==='bin'?'<div class="section-title">7-day bin</div>':'<div class="section-title">Transmission board</div>'
    stage.innerHTML=`<section class="panel card">${title}<div class="noteBoard" style="margin-top:14px">${ns.length?ns.map(n=>noteCard(n,reactions)).join(''):`<div class="empty">${notesTab==='love'?'Time to hoard some LOVE':notesTab==='bin'?'The bin is blessedly empty.':'Empy :('}</div>`}</div></section>`
    wireNoteCards(ns)
  }catch(e){noteError(e)}
}
function expiryWarning(n){
  if(n.hoarded_at||n.deleted_at)return ''
  const days=Math.ceil((new Date(n.expires_at)-new Date())/86400000)
  if(days===7||days===1||days<=0)return `<div class="noteExpiry">${E(days<=1?pick(expiryLines.slice(3)):pick(expiryLines.slice(0,3)))} ${days>0?`${days} day${days===1?'':'s'} remain.`:'Archive it or let it go.'}</div>`
  return ''
}
function noteCard(n,reactions={}){
  const sealed=n.note_type==='for_you'&&n.recipient_user_id===session.user.id&&!n.opened_at
  const noteText=contrastText(n.color)
  if(sealed){
    const f=pick(sealedLines)
    return `<article class="sticky sealedNote" tabindex="0" style="--note-color:${n.color};--note-text:${noteText}" data-open="${n.id}"><div><div class="sealedMark">✦</div><div class="sealedCopy">${E(f(n.author_name_snapshot))}</div><div class="noteMeta">${dateText(n.created_at)}</div></div></article>`
  }
  const editable=n.author_user_id===session.user.id
  const deleted=!!n.deleted_at
  const media=`${n._photoUrl?`<img class="noteMedia" src="${E(n._photoUrl)}" alt="Photo attached to note">`:''}${n._doodleUrl?`<img class="noteMedia" src="${E(n._doodleUrl)}" alt="Doodle attached to note">`:''}`
  return `<article class="sticky ${deleted?'recycleCard':''}" tabindex="0" aria-expanded="false" style="--note-color:${n.color};--note-text:${noteText}">
    <div class="noteTop"><div class="noteTo">${n.recipient_name_snapshot?`TO ${E(n.recipient_name_snapshot)}`:'ON THE BRIDGE'}</div><div>${n.pinned?'PINNED':''}</div></div>
    <div class="noteBody">${E(n.body||'')}</div>${media}
    ${n.needs_action?`<div class="noteReminder">${n.action_completed_at?`✓ QUEST COMPLETED · ${dateText(n.action_completed_at)} ${timeText(n.action_completed_at)}`:'QUEST ACTIVE'}</div>`:''}
    ${n.reminder_at?`<div class="noteReminder">Reminder: ${dateText(n.reminder_at)} · ${timeText(n.reminder_at)}</div>`:''}
    ${expiryWarning(n)}
    <div class="noteMeta">from ${E(n.author_name_snapshot)} · ${dateText(n.created_at)} ${timeText(n.created_at)}${new Date(n.updated_at)-new Date(n.created_at)>1000?` · edited at ${timeText(n.updated_at)}`:''}</div>
    <div class="reactionStrip">${reactionSet.map(r=>reactionButton(n.id,r,reactions,'data-react')).join('')}</div>
    <div class="noteHoldHint">Long press or right-click for note options.</div>
    <div class="noteActions" data-noteactions="${n.id}">
      ${!deleted&&editable?`<button data-editnote="${n.id}">EDIT</button>`:''}
      ${!deleted&&!n.hoarded_at?`<button data-pin="${n.id}">${n.pinned?'UNPIN':'PIN THIS BABY'}</button>`:''}
      ${!deleted&&n.recipient_user_id===session.user.id&&!n.dismissed_at?`<button data-dismiss="${n.id}">TRANSMISSION RECEIVED</button>`:''}
      ${!deleted&&!n.hoarded_at?`<button data-hoard="${n.id}">HOARD THIS</button>`:''}
      ${!deleted&&n.needs_action&&!n.action_completed_at?`<button data-quest="${n.id}">QUEST COMPLETED</button>`:''}
      ${!deleted&&!n.captain_log_saved_at?`<button data-lognote="${n.id}">ADD TO CAPTAIN'S LOG</button>`:''}
      ${!deleted?`<button data-thread="${n.id}">COMMENTS</button><button data-history="${n.id}">HISTORY</button><button data-destroy="${n.id}">DESTROY</button>`:`<button data-restore="${n.id}">RESTORE</button><button data-permadelete="${n.id}">DELETE FOREVER</button>`}
    </div>
  </article>`
}
function wireNoteCards(ns){
  qa('.sticky').forEach(card=>{
    const actions=card.querySelector('[data-noteactions]')
    if(actions)installLongPress(card,actions)
  })
  qa('[data-open]').forEach(b=>b.onclick=()=>openForYou(b.dataset.open))
  qa('[data-editnote]').forEach(b=>b.onclick=()=>noteModal(null,b.dataset.editnote))
  qa('[data-pin]').forEach(b=>b.onclick=async()=>{const n=ns.find(x=>x.id===b.dataset.pin);await supabase.from('notes').update({pinned:!n.pinned,updated_at:new Date().toISOString()}).eq('id',n.id);if(!n.pinned){const pinned=ns.filter(x=>x.pinned&&!x.deleted_at).length;if(pinned>=5)toast(pick(pinChaos))}drawNotes();bridgeNotes()})
  qa('[data-dismiss]').forEach(b=>b.onclick=async()=>{await supabase.from('notes').update({dismissed_at:new Date().toISOString(),pinned:false,updated_at:new Date().toISOString()}).eq('id',b.dataset.dismiss);toast('TRANSMISSION RECEIVED');drawNotes();bridgeNotes()})
  qa('[data-hoard]').forEach(b=>b.onclick=async()=>{await supabase.from('notes').update({hoarded_at:new Date().toISOString(),pinned:false,updated_at:new Date().toISOString()}).eq('id',b.dataset.hoard);toast('Added to Making loveNOTES <3');drawNotes();bridgeNotes()})
  qa('[data-quest]').forEach(b=>b.onclick=async()=>{await supabase.from('notes').update({action_completed_at:new Date().toISOString(),action_completed_by:session.user.id,updated_at:new Date().toISOString()}).eq('id',b.dataset.quest);toast('QUEST COMPLETED');drawNotes()})
  qa('[data-destroy]').forEach(b=>b.onclick=()=>softDeleteNote(b.dataset.destroy))
  qa('[data-restore]').forEach(b=>b.onclick=async()=>{await supabase.from('notes').update({deleted_at:null,updated_at:new Date().toISOString()}).eq('id',b.dataset.restore);toast('Resurrected.');drawNotes()})
  qa('[data-permadelete]').forEach(b=>b.onclick=()=>permanentDeleteNote(b.dataset.permadelete))
  qa('[data-lognote]').forEach(b=>b.onclick=()=>saveNoteToLog(b.dataset.lognote))
  qa('[data-thread]').forEach(b=>b.onclick=()=>noteThreadModal(b.dataset.thread))
  qa('[data-history]').forEach(b=>b.onclick=()=>noteHistoryModal(b.dataset.history))
  qa('[data-react]').forEach(b=>b.onclick=()=>reactNote(b.dataset.react,b.dataset.r,ns.find(x=>x.id===b.dataset.react)))
}
async function openForYou(id){
  const n=(await supabase.from('notes').select('*').eq('id',id).single()).data;if(!n)return
  await supabase.from('notes').update({opened_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',id)
  const photoUrl=await signedNoteMedia(n.photo_path),doodleUrl=await signedNoteMedia(n.doodle_path),noteText=contrastText(n.color)
  const w=document.createElement('div');w.className='modalWrap';w.innerHTML=`<section class="panel modal" style="background:${n.color};color:${noteText}"><div class="section-title">${E(pick(openedLines))}</div><div class="noteBody">${E(n.body||'')}</div>${photoUrl?`<img class="noteMedia" src="${E(photoUrl)}" alt="Photo attached to note">`:''}${doodleUrl?`<img class="noteMedia" src="${E(doodleUrl)}" alt="Doodle attached to note">`:''}<div class="noteMeta">from ${E(n.author_name_snapshot)}</div><div class="noteActions open"><button id="oyPin">PIN THIS BABY</button><button id="oyHoard">HOARD THIS</button><button id="oyReceived">TRANSMISSION RECEIVED</button></div></section>`;document.body.appendChild(w)
  w.querySelector('#oyPin').onclick=async()=>{await supabase.from('notes').update({pinned:true,dismissed_at:null}).eq('id',id);w.remove();drawNotes();bridgeNotes()}
  w.querySelector('#oyHoard').onclick=async()=>{await supabase.from('notes').update({hoarded_at:new Date().toISOString(),pinned:false}).eq('id',id);w.remove();toast('Added to Making loveNOTES <3');drawNotes();bridgeNotes()}
  w.querySelector('#oyReceived').onclick=async()=>{await supabase.from('notes').update({dismissed_at:new Date().toISOString(),pinned:false}).eq('id',id);w.remove();drawNotes();bridgeNotes()}
}

function noteTypeChooser(){
  const w=document.createElement('div');w.className='modalWrap'
  w.innerHTML=`<section class="panel modal noteChooser"><div class="section-title">What are we sending?</div>
    <div class="noteTypeChoices">
      <button data-choose="sticky"><b>GENERAL NOTE</b><span>Stick something on the Bridge.</span></button>
      <button data-choose="for_you"><b>FOR YOU</b><span>A sealed little note for the other human.</span></button>
      <button data-choose="doodle"><b>DOODLE</b><span>Draw them a thing.</span></button>
    </div>
    <button id="chooseCancel" class="ghost">Never mind</button>
  </section>`
  document.body.appendChild(w)
  w.querySelector('#chooseCancel').onclick=()=>w.remove()
  w.querySelectorAll('[data-choose]').forEach(b=>b.onclick=()=>{
    const t=b.dataset.choose;w.remove()
    if(t==='doodle')doodleModal();else noteModal(t)
  })
}

async function noteModal(type='sticky',id=null){
  const profiles=await crewProfiles(),me=await currentDisplayName(),n=id?(await supabase.from('notes').select('*').eq('id',id).single()).data:null
  if(n&&n.author_user_id!==session.user.id)return toast('Only the author gets to rewrite history. Everyone else gets receipts.')
  type=n?.note_type||type||'sticky'
  const otherProfiles=profiles.filter(x=>x.user_id!==session.user.id)
  const defaultRecipient=type==='for_you'?(n?.recipient_user_id||otherProfiles[0]?.user_id||''):null
  const w=document.createElement('div');w.className='modalWrap'
  w.innerHTML=`<section class="panel modal noteComposer">
    <div class="composerHead"><div><div class="section-title">${id?'Edit':'New'} ${type==='for_you'?'For You':'General'} note</div><div class="muted">${type==='for_you'?'Sealed until they open it.':'Lives with the other Bridge notes.'}</div></div><button id="ncancel" type="button" class="detailClose">×</button></div>
    <form id="nf">
      ${type==='for_you'?`<div class="field"><label>For</label><select id="nr">${otherProfiles.map(x=>{const nm=x.nickname||x.display_name||x.email||'Crew';return `<option value="${x.user_id}" ${defaultRecipient===x.user_id?'selected':''}>${E(nm)}</option>`}).join('')}</select></div>`:'<input id="nr" type="hidden" value="">'}
      <div class="composerNotePreview" id="composerPreview" style="--composerColor:${n?.color||'#8b526a'};--composerText:${contrastText(n?.color||'#8b526a')}">
        <textarea id="nb" rows="6" placeholder="${type==='for_you'?'Write something for them…':'What do we need to know?'}">${E(n?.body||'')}</textarea>
      </div>
      <div class="composerTools">
        <div class="field compact"><label>Note colour</label><input id="nc" type="color" value="${n?.color||'#8b526a'}"></div>
        <label class="toggleLine"><input id="na" type="checkbox" ${n?.needs_action?'checked':''}> <span>Needs action</span></label>
      </div>
      <details class="composerExtras">
        <summary>More options</summary>
        <div class="field"><label>Reminder</label><input id="nrem" type="datetime-local" value="${n?.reminder_at?new Date(n.reminder_at).toISOString().slice(0,16):''}"></div>
        <div class="field"><label>Photo</label><input id="nphoto" type="file" accept="image/*"></div>
      </details>
      <div class="composerFooter"><button class="primary">${id?'SAVE CHANGES':type==='for_you'?'SEAL & SEND':'STICK IT'}</button></div>
      <p id="nerr" class="error"></p>
    </form>
  </section>`
  document.body.appendChild(w)
  w.querySelector('#ncancel').onclick=()=>w.remove()
  const color=w.querySelector('#nc'),preview=w.querySelector('#composerPreview')
  color.oninput=()=>{preview.style.setProperty('--composerColor',color.value);preview.style.setProperty('--composerText',contrastText(color.value))}
  w.querySelector('#nf').onsubmit=async e=>{
    e.preventDefault()
    const body=w.querySelector('#nb').value.trim(),file=w.querySelector('#nphoto').files[0]
    if(!body&&!file&&!n?.doodle_path)return w.querySelector('#nerr').textContent=pick(noteEmptyLines)
    const rid=type==='for_you'?(w.querySelector('#nr').value||null):null
    try{
      const rp=profiles.find(x=>x.user_id===rid),rname=rp?(rp.nickname||rp.display_name||rp.email||'Crew'):null
      let photo=n?.photo_path||null;if(file)photo=await uploadNoteImage(file)
      const payload={
        household_id:household.id,
        recipient_user_id:rid,
        recipient_name_snapshot:id?n.recipient_name_snapshot:rname,
        note_type:type,body,color:color.value,
        needs_action:w.querySelector('#na').checked,
        reminder_at:w.querySelector('#nrem')?.value?new Date(w.querySelector('#nrem').value).toISOString():null,
        photo_path:photo,updated_at:new Date().toISOString()
      }
      if(id){
        await supabase.from('note_versions').insert({household_id:household.id,note_id:n.id,body:n.body,color:n.color,needs_action:n.needs_action,reminder_at:n.reminder_at,photo_path:n.photo_path,doodle_path:n.doodle_path,saved_by:session.user.id})
        const r=await supabase.from('notes').update(payload).eq('id',id);if(r.error)throw r.error
      }else{
        payload.author_user_id=session.user.id;payload.author_name_snapshot=me
        const r=await supabase.from('notes').insert(payload);if(r.error)throw r.error
      }
      w.remove();toast(type==='for_you'?'Transmission sent <3':'Note stuck successfully.')
      if(active==='notes')drawNotes();bridgeNotes()
    }catch(err){w.querySelector('#nerr').textContent=pick(noteErrorLines);console.error(err)}
  }
}
async function compressImage(file,max=1280,quality=.72){
  const bmp=await createImageBitmap(file),scale=Math.min(1,max/Math.max(bmp.width,bmp.height)),c=document.createElement('canvas');c.width=Math.round(bmp.width*scale);c.height=Math.round(bmp.height*scale);c.getContext('2d').drawImage(bmp,0,0,c.width,c.height);return await new Promise(r=>c.toBlob(r,'image/jpeg',quality))
}
async function uploadNoteImage(file){
  const blob=await compressImage(file),path=`${household.id}/${session.user.id}/${Date.now()}.jpg`;const r=await supabase.storage.from('note-media').upload(path,blob,{contentType:'image/jpeg'});if(r.error)throw r.error;return path
}
async function doodleModal(){
  const w=document.createElement('div');w.className='modalWrap';w.innerHTML=`<section class="panel modal"><div class="section-title">Doodle transmission</div><div class="canvasTools"><label>Photo underlay <input id="dphoto" type="file" accept="image/*"></label><label>Pen <input id="dsize" type="range" min="2" max="24" value="5"></label><button id="derase" class="ghost">ERASER</button><button id="dundo" class="ghost">UNDO</button></div><div id="dpal" class="palettePanels"></div><canvas id="dc" class="doodleCanvas"></canvas><div class="field"><label>Caption</label><input id="dcap"></div><button id="dsend" class="primary">SEND DOODLE</button> <button id="dcancel" class="ghost">Cancel</button><p id="derr" class="error"></p></section>`;document.body.appendChild(w)
  const c=w.querySelector('#dc'),ctx=c.getContext('2d'),palette=['#ffffff','#ff416d','#ff8fb0','#62a978','#8bc7ff','#ffd65a','#b68cff','#111111'];let col=palette[0],drawing=false,last=null,history=[]
  function sizeCanvas(){const r=c.getBoundingClientRect();c.width=Math.max(600,Math.round(r.width*devicePixelRatio));c.height=Math.round(r.height*devicePixelRatio);ctx.scale(devicePixelRatio,devicePixelRatio)}
  sizeCanvas();w.querySelector('#dpal').innerHTML=palette.map((x,i)=>`<button class="palettePanel ${i===0?'selected':''}" style="background:${x}" data-col="${x}"></button>`).join('')
  w.querySelectorAll('[data-col]').forEach(b=>b.onclick=()=>{col=b.dataset.col;w.querySelectorAll('[data-col]').forEach(x=>x.classList.remove('selected'));b.classList.add('selected')})
  c.onpointerdown=e=>{history.push(c.toDataURL());drawing=true;last=[e.offsetX,e.offsetY]}
  c.onpointermove=e=>{if(!drawing)return;ctx.strokeStyle=col;ctx.lineWidth=Number(w.querySelector('#dsize').value);ctx.lineCap='round';ctx.beginPath();ctx.moveTo(...last);ctx.lineTo(e.offsetX,e.offsetY);ctx.stroke();last=[e.offsetX,e.offsetY]}
  c.onpointerup=c.onpointerleave=()=>drawing=false
  w.querySelector('#derase').onclick=()=>col='#111111'
  w.querySelector('#dundo').onclick=()=>{const x=history.pop();if(!x)return;const im=new Image();im.onload=()=>{ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(im,0,0,c.width/devicePixelRatio,c.height/devicePixelRatio)};im.src=x}
  w.querySelector('#dphoto').onchange=e=>{const f=e.target.files[0];if(!f)return;const im=new Image();im.onload=()=>{history.push(c.toDataURL());ctx.drawImage(im,0,0,c.width/devicePixelRatio,c.height/devicePixelRatio)};im.src=URL.createObjectURL(f)}
  w.querySelector('#dcancel').onclick=()=>w.remove()
  w.querySelector('#dsend').onclick=async()=>{if(!history.length&&!w.querySelector('#dcap').value.trim())return w.querySelector('#derr').textContent=pick(['The canvas has achieved enlightenment: absolutely nothing is on it.','You drew the invisible man. Try again.','Scanners detect no doodle. The pen union is furious.'])
    try{const blob=await new Promise(r=>c.toBlob(r,'image/png')),path=`${household.id}/${session.user.id}/${Date.now()}-doodle.png`;const ur=await supabase.storage.from('note-media').upload(path,blob,{contentType:'image/png'});if(ur.error)throw ur.error;const me=await currentDisplayName();const r=await supabase.from('notes').insert({household_id:household.id,author_user_id:session.user.id,author_name_snapshot:me,note_type:'doodle',body:w.querySelector('#dcap').value.trim()||null,doodle_path:path,color:'#242126'});if(r.error)throw r.error;w.remove();toast('Doodle deployed.');if(active==='notes')drawNotes();bridgeNotes()}catch(e){w.querySelector('#derr').textContent=pick(noteErrorLines)}
  }
}
async function reactNote(id,reaction,n){
  if(n?.author_user_id===session.user.id)toast(`${await currentDisplayName()} hurt themself in their own confusion.`)
  const ex=(await supabase.from('note_reactions').select('id').eq('note_id',id).eq('user_id',session.user.id).eq('reaction',reaction).maybeSingle()).data
  if(ex)await supabase.from('note_reactions').delete().eq('id',ex.id)
  else await supabase.from('note_reactions').insert({household_id:household.id,note_id:id,user_id:session.user.id,reaction})
  if(active==='notes')drawNotes()
  if(active==='bridge')bridgeNotes()
}
async function noteThreadModal(id){
  const w=document.createElement('div');w.className='modalWrap';w.innerHTML=`<section class="panel modal"><div class="section-title">Comment thread</div><div id="threadBody">Loading gossip…</div><div class="field"><label>Reply</label><textarea id="reply"></textarea></div><button id="replySend" class="primary">SEND</button> <button id="threadClose" class="ghost">Done</button></section>`;document.body.appendChild(w)
  async function load(){const {data}=await supabase.from('note_comments').select('*').eq('note_id',id).order('created_at');w.querySelector('#threadBody').innerHTML=data?.length?data.map(x=>`<div class="comment"><span class="commentName">${E(x.author_name_snapshot)}</span>: ${E(x.body)}<div class="noteMeta">${dateText(x.created_at)} ${timeText(x.created_at)}</div></div>`).join(''):'<div class="muted">Nobody has yapped here yet.</div>'}
  await load();w.querySelector('#threadClose').onclick=()=>w.remove();w.querySelector('#replySend').onclick=async()=>{const body=w.querySelector('#reply').value.trim();if(!body)return;await supabase.from('note_comments').insert({household_id:household.id,note_id:id,author_user_id:session.user.id,author_name_snapshot:await currentDisplayName(),body});w.querySelector('#reply').value='';load()}
}
async function noteHistoryModal(id){
  const {data}=await supabase.from('note_versions').select('*').eq('note_id',id).order('saved_at',{ascending:false});const w=document.createElement('div');w.className='modalWrap';w.innerHTML=`<section class="panel modal"><div class="section-title">Note history</div>${data?.length?data.map(v=>`<div class="historyVersion"><div>${E(v.body||'(no text)')}</div><div class="noteMeta">${dateText(v.saved_at)} ${timeText(v.saved_at)}</div></div>`).join(''):'<div class="muted">No rewrites yet. The original canon stands.</div>'}<button id="vhclose" class="ghost">Done</button></section>`;document.body.appendChild(w);w.querySelector('#vhclose').onclick=()=>w.remove()
}
async function softDeleteNote(id){
  if(!confirm(pick(['You sure?','Deleting this won’t delete it from memory <3','Perchance you change your mind?','Send this note to the 7-day void?'])))return
  await supabase.from('notes').update({deleted_at:new Date().toISOString(),pinned:false,updated_at:new Date().toISOString()}).eq('id',id);toast('Into the bin it goes. Seven days to regret this.');drawNotes();bridgeNotes()
}
function permanentDanger(onYes){
  const d=document.createElement('div');d.className='permaDanger';d.innerHTML=`<div class="permaDangerBox"><h1>ARE YOU SURE?</h1><p>This is permanent. We cannot get this back.</p><p>${E(pick(['Like, GONE gone.','There is no Ctrl+Z after this.','Last chance, bestie.','The void does not issue refunds.']))}</p><div class="permaDangerActions"><button id="dangerNo">NO WAIT</button><button id="dangerYes">YES, DESTROY IT</button></div></div>`;document.body.appendChild(d);d.querySelector('#dangerNo').onclick=()=>d.remove();d.querySelector('#dangerYes').onclick=async()=>{await onYes();d.remove()}
}
async function permanentDeleteNote(id){
  permanentDanger(async()=>{const r=await supabase.from('notes').delete().eq('id',id);if(r.error)return noteError(r);toast('Gone gone.');drawNotes()})
}
async function saveNoteToLog(id){
  const n=(await supabase.from('notes').select('*').eq('id',id).single()).data;if(!n)return
  const r=await supabase.from('captains_log').insert({household_id:household.id,source_note_id:n.id,title:n.note_type==='for_you'?'For You transmission':'Saved note',body:n.body,author_user_id:n.author_user_id,author_name_snapshot:n.author_name_snapshot,photo_path:n.photo_path,doodle_path:n.doodle_path});if(r.error)return noteError(r);await supabase.from('notes').update({captain_log_saved_at:new Date().toISOString()}).eq('id',id);toast(pick(logLines));drawNotes()
}
function noteError(err){console.error(err);toast(pick(noteErrorLines),5000)}

const pick=a=>a[Math.floor(Math.random()*a.length)]
const moneyLines={
  alreadyPaid:[
    'We already paid them. Don’t give them ideas.',
    'They’ve had their money already.',
    'STOP TRYING TO GIVE PEOPLE OUR MONEY!',
    'Nope.',
    'Mark has already been paid. Don’t believe his lies.'
  ],
  needAmount:[
    'How much did we give the bastards?',
    'baby girl... the amount....?',
    'Remember numbers! all day! every day!',
    'how about you tell me how much too?'
  ],
  needDate:[
    'When did this financial crime occur?',
    'And WHEN did we pay them?',
    'Temporal coordinates required.',
    'not so fast! payment date??'
  ],
  billTomorrow:[
    n=>`${n} wants money tomorrow. Rude.`,
    n=>`Incoming tomorrow: ${n}.`,
    n=>`Psst. ${n} bill tomorrow.`,
    n=>`ugh, they want money again: ${n} - tmrw`,
    n=>`capitalism is haunting us... ${n} due tmrw`,
    n=>`william is giving birth tmrw.`
  ],
  billToday:[
    n=>`${n} wants its fucking money today.`,
    n=>`PAY THE ${n.toUpperCase()} PEOPLE.`,
    n=>`today is gonna be the day that they're gonna make us pay.`,
    n=>`capitalism is attacking the little people again. this bill is due today`
  ],
  emptyBills:[
    'Nobody wants money from us. Suspicious.',
    'The vultures are quiet this month.',
    'Financial scanners detect fuck all.',
    'We gets to keep moneyz? :3',
    'oh nooooo, we don’t owe anything....'
  ],
  overpay:[
    left=>`You cannot kill it more than dead. It only has €${left.toFixed(2)} left.`,
    left=>`Easy, tiger. It only has €${left.toFixed(2)} left.`,
    left=>`OVERKILL DETECTED. Reduce the payment.`,
    left=>`STOP TRYING TO GIVE PEOPLE MORE MONEY THAN THEY NEED.`,
    left=>`we're too poor for this generosity, reduce the amount.`
  ],
  zeroPay:[
    'That is, technically, fuck all.',
    'An inspiring contribution of absolutely nothing.',
    '0 damage. The enemy remains unimpressed.',
    'Excellent financial strategy: do absolutely fuck all.',
    'A bold payment of zero whole euros.'
  ],
  borrow:[
    a=>`Ah fuck. It healed €${a.toFixed(2)}.`,
    a=>`+€${a.toFixed(2)}. We appear to be going the wrong way.`,
    a=>`Debt has regenerated €${a.toFixed(2)} HP. Bastard.`,
    a=>`The horrible little thing ate another €${a.toFixed(2)}.`,
    a=>`Reverse progress achieved: +€${a.toFixed(2)}.`
  ],
  trophyEmpty:[
    'No corpses yet.',
    'The trophy room awaits its first victim.',
    'Nothing here. Get murdering.',
    'have to earn the trophies first, buddy'
  ],
  errors:[
    'Something has gone tits up.',
    'a fucky-wucky seems to have happened',
    'oh-oh HEP-C will hear about this....',
    'ouch, that didn’t feel right....',
    'WRONG HOLE'
  ],
  billDelete:[
    'Delete it from the app, not unfortunately from real life?',
    'This does not legally absolve us of the bill. I checked.',
    'Just cuz you delete it, doesn’t mean we don’t have to pay it..',
    'if we don’t pay they’ll come for our piss!'
  ]
}
function toast(text,ms=3600){
  q('.finToast')?.remove()
  const d=document.createElement('div');d.className='finToast';d.textContent=text;document.body.appendChild(d)
  setTimeout(()=>d.remove(),ms)
}
function moneyError(err){
  const w=document.createElement('div');w.className='modalWrap'
  w.innerHTML=`<section class="panel modal"><div class="section-title">${E(pick(moneyLines.errors))}</div><button id="showErr" class="ghost">SHOW BORING DETAILS</button><pre id="boringErr" hidden style="white-space:pre-wrap;color:#aaa">${E(err?.message||err)}</pre><div style="margin-top:12px"><button id="errClose" class="primary">Fine.</button></div></section>`
  document.body.appendChild(w);w.querySelector('#showErr').onclick=()=>w.querySelector('#boringErr').hidden=!w.querySelector('#boringErr').hidden;w.querySelector('#errClose').onclick=()=>w.remove()
}
const eur=x=>x===null||x===undefined||x===''?'?':`€${Number(x).toFixed(2)}`
function daysFromNow(iso){
  const a=new Date();a.setHours(0,0,0,0);const b=new Date(iso);b.setHours(0,0,0,0);return Math.round((b-a)/86400000)
}
function billUrgency(b){
  const d=daysFromNow(b.due_at)
  if(d<0){const late=-d;if(late===1)return 'Oops, we forgot the bill.';if(late<=3)return 'they don’t want to let this go huh? the bill is due';if(late<=7)return 'Hey, the bill is due and unpaid.';return "THEY'RE GONNA TAKE OVER THE SHIP!"}
  if(d===0){const f=pick(moneyLines.billToday);return f(b.name)}
  if(d===1){const f=pick(moneyLines.billTomorrow);return f(b.name)}
  return ''
}
function nextBillDate(b){
  if(b.recurrence_type==='one_off')return null
  if(b.recurrence_type==='custom')return null
  const d=new Date(b.due_at),n=b.recurrence_interval||1
  if(b.recurrence_type==='days')d.setDate(d.getDate()+n)
  if(b.recurrence_type==='weeks')d.setDate(d.getDate()+7*n)
  if(b.recurrence_type==='months')d.setMonth(d.getMonth()+n)
  return d.toISOString()
}
async function bridgeBills(){
  const box=q('#bridgeBills');if(!box)return
  try{
    const {data,error}=await supabase.from('bills').select('*').eq('household_id',household.id).eq('active',true).order('due_at')
    if(error)throw error
    const soon=(data||[]).filter(b=>daysFromNow(b.due_at)<=Math.max(0,Number(b.reminder_days??1))).slice(0,4)
    box.innerHTML=soon.length?soon.map(b=>`<div class="billAgenda"><span class="billRadar"></span><b>${E(b.name)}</b> · ${eur(b.amount)} · ${daysFromNow(b.due_at)<0?'OVERDUE':daysFromNow(b.due_at)===0?'today':daysFromNow(b.due_at)===1?'tomorrow':dateText(b.due_at)}<div class="muted">${E(billUrgency(b))}</div></div>`).join(''):'No one is currently rattling the coin slot.'
  }catch(e){box.textContent='Financial radar is making concerning noises.'}
}
async function drawAgendaBills(){
  const box=q('#agendaBills');if(!box)return
  try{
    const {data,error}=await supabase.from('bills').select('*').eq('household_id',household.id).eq('active',true).order('due_at')
    if(error)throw error
    const now=new Date()
    let bills=data||[]
    if(agendaView==='today')bills=bills.filter(b=>dateKey(b.due_at)===dateKey(now))
    if(agendaView==='week'){
      const delta=(now.getDay()+6)%7,mon=new Date(now);mon.setHours(0,0,0,0);mon.setDate(now.getDate()-delta);const sun=new Date(mon);sun.setDate(mon.getDate()+7)
      bills=bills.filter(b=>new Date(b.due_at)>=mon&&new Date(b.due_at)<sun)
    }
    if(agendaView==='month')bills=bills.filter(b=>{const d=new Date(b.due_at);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()})
    box.innerHTML=`<div class="section-title">Treasury radar</div>${bills.length?bills.map(b=>`<div class="billAgenda"><span class="billRadar"></span><b>${E(b.name)}</b> · ${eur(b.amount)} · ${dateText(b.due_at)}${billUrgency(b)?`<div class="muted">${E(billUrgency(b))}</div>`:''}</div>`).join(''):`<div class="muted">${E(pick(moneyLines.emptyBills))}</div>`}`
  }catch(e){box.innerHTML=`<div class="error">${E(pick(moneyLines.errors))}</div>`}
}
let treasuryTab=localStorage.getItem('bridge_treasury_tab')||'bills'
async function treasury(){
  app.innerHTML=`<main class="shell">${top('Treasury')}<div class="agendaToolbar"><div><h1 class="pageTitle">Treasury</h1><div class="muted">Unfortunately, numbers continue to exist.</div></div><div><button id="addBill" class="primary">ADD BILL</button> <button id="addDebt" class="ghost">ADD DEBT</button></div></div>
  <div class="treasuryTabs"><button data-moneytab="bills" class="${treasuryTab==='bills'?'active':''}">BILLS</button><button data-moneytab="debt" class="${treasuryTab==='debt'?'active':''}">DEBT</button><button data-moneytab="history" class="${treasuryTab==='history'?'active':''}">HISTORY</button></div>
  <section id="treasuryStage"><div class="panel card muted">Counting beans…</div></section></main>${nav()}`
  wire();q('#addBill').onclick=()=>billModal();q('#addDebt').onclick=()=>debtModal()
  qa('[data-moneytab]').forEach(b=>b.onclick=()=>{treasuryTab=b.dataset.moneytab;localStorage.setItem('bridge_treasury_tab',treasuryTab);syncRoute();treasury()})
  await drawTreasury()
}
async function drawTreasury(){
  if(treasuryTab==='bills')return drawBills()
  if(treasuryTab==='debt')return drawDebts()
  return drawMoneyHistory()
}
async function drawBills(){
  const stage=q('#treasuryStage')
  try{
    const [br,pr]=await Promise.all([
      supabase.from('bills').select('*').eq('household_id',household.id).eq('active',true).order('due_at'),
      supabase.from('bill_payments').select('*').eq('household_id',household.id).order('paid_at',{ascending:false})
    ])
    if(br.error)throw br.error
    const bills=br.data||[],now=new Date(),monthBills=bills.filter(b=>{const d=new Date(b.due_at);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()})
    const known=monthBills.filter(b=>b.amount!==null).reduce((s,b)=>s+Number(b.amount),0),unknown=monthBills.filter(b=>b.amount===null).length
    const paidThisMonth=(pr.data||[]).filter(p=>{const d=new Date(p.paid_at);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()}).reduce((s,p)=>s+Number(p.paid_amount),0)
    const mysteryText=unknown?` + ${unknown} ${Math.random()<.5?'MYSTERY BLIP'+(unknown===1?'':'S'):'MYSTERY THREAT'+(unknown===1?'':'S')}`:''
    stage.innerHTML=`<section class="panel moneyCard"><div class="section-title">${now.toLocaleDateString('en-IE',{month:'long'})} obligations</div><div class="moneySummary"><div><span class="muted">Known</span><div class="bigMoney">${eur(known)}</div></div><div><span class="muted">Paid</span><div class="bigMoney">${eur(paidThisMonth)}</div></div><div><span class="muted">Remaining known</span><div class="bigMoney">${eur(Math.max(0,known-paidThisMonth))}</div></div></div>${unknown?`<div class="mystery">${E(mysteryText)}</div>`:''}</section>
    <section class="panel card" style="margin-top:12px"><div class="section-title">Upcoming</div>${bills.length?bills.map(b=>billCard(b)).join(''):`<div class="empty">${E(pick(moneyLines.emptyBills))}</div>`}</section>`
    wireBills()
  }catch(e){moneyError(e)}
}
function billCard(b){
  const urgent=billUrgency(b)
  return `<article class="billCard"><div class="billTop"><div><div class="billName">${E(b.name)}</div><div class="taskMeta"><span class="chip">${eur(b.amount)}</span><span class="chip">${dateText(b.due_at)}</span><span class="chip">${E(b.recurrence_type==='one_off'?'one-off':`every ${b.recurrence_interval} ${b.recurrence_type}`)}</span></div>${urgent?`<div class="${daysFromNow(b.due_at)<0?'overdueBill':daysFromNow(b.due_at)===0?'dueToday':'dueSoon'}">${E(urgent)}</div>`:''}${b.notes?`<div class="taskNotes">${E(b.notes)}</div>`:''}</div><div class="moneyActions"><button data-paybill="${b.id}" data-due="${b.due_at}">MARK PAID</button><button data-editbill="${b.id}">EDIT</button><button data-delbill="${b.id}">×</button></div></div></article>`
}
function wireBills(){
  qa('[data-paybill]').forEach(b=>b.onclick=()=>payBillModal(b.dataset.paybill,b.dataset.due))
  qa('[data-editbill]').forEach(b=>b.onclick=()=>billModal(b.dataset.editbill))
  qa('[data-delbill]').forEach(b=>b.onclick=()=>deleteBill(b.dataset.delbill))
}
async function billModal(id=null){
  const bill=id?(await supabase.from('bills').select('*').eq('id',id).single()).data:null
  const w=document.createElement('div');w.className='modalWrap'
  const due=bill?.due_at?new Date(bill.due_at).toISOString().slice(0,16):''
  w.innerHTML=`<section class="panel modal"><div class="section-title">${bill?'Edit bill':'New bill'}</div><form id="bf" class="formGrid">
  <div class="field full"><label>Name</label><input id="bn" required value="${E(bill?.name||'')}"></div>
  <div class="field"><label>Expected amount (optional)</label><input id="ba" type="number" min="0" step="0.01" value="${bill?.amount??''}"></div>
  <div class="field"><label>Usual future amount (optional)</label><input id="bua" type="number" min="0" step="0.01" value="${bill?.usual_amount??bill?.amount??''}"></div>
  <div class="field"><label>Due date/time</label><input id="bd" type="datetime-local" required value="${due}"></div>
  <div class="field"><label>Repeats</label><select id="br"><option value="one_off">One off</option><option value="days" ${bill?.recurrence_type==='days'?'selected':''}>Every X days</option><option value="weeks" ${bill?.recurrence_type==='weeks'?'selected':''}>Every X weeks</option><option value="months" ${bill?.recurrence_type==='months'?'selected':''}>Every X months</option><option value="custom" ${bill?.recurrence_type==='custom'?'selected':''}>Custom / choose next manually</option></select></div>
  <div class="field"><label>X</label><input id="bri" type="number" min="1" value="${bill?.recurrence_interval||1}"></div>
  <div class="field"><label>Reminder up to 3 days before</label><input id="brem" type="number" min="0" max="3" value="${bill?.reminder_days??1}"></div>
  <div class="field"><label>Reminder type</label><select id="bremt"><option value="in_app">In app</option><option value="notification" ${bill?.reminder_type==='notification'?'selected':''}>Notification</option><option value="both" ${bill?.reminder_type==='both'?'selected':''}>Both</option></select></div>
  <div class="field full"><label>Notes</label><textarea id="bnote">${E(bill?.notes||'')}</textarea></div>
  <div class="full"><button class="primary">${bill?'SAVE':'ADD BILL'}</button> <button id="bcancel" type="button" class="ghost">Cancel</button></div><p id="berr" class="error full"></p></form></section>`
  document.body.appendChild(w);w.querySelector('#bcancel').onclick=()=>w.remove()
  w.querySelector('#bf').onsubmit=async e=>{e.preventDefault();try{const payload={household_id:household.id,name:w.querySelector('#bn').value.trim(),amount:w.querySelector('#ba').value===''?null:Number(w.querySelector('#ba').value),usual_amount:w.querySelector('#bua').value===''?null:Number(w.querySelector('#bua').value),due_at:new Date(w.querySelector('#bd').value).toISOString(),recurrence_type:w.querySelector('#br').value,recurrence_interval:Number(w.querySelector('#bri').value)||1,reminder_days:Number(w.querySelector('#brem').value)||0,reminder_type:w.querySelector('#bremt').value,notes:w.querySelector('#bnote').value.trim()||null,updated_at:new Date().toISOString()};let r;if(id)r=await supabase.from('bills').update(payload).eq('id',id);else{payload.created_by=session.user.id;r=await supabase.from('bills').insert(payload)}if(r.error)throw r.error;w.remove();drawBills();bridgeBills();drawAgendaBills()}catch(err){w.querySelector('#berr').textContent=pick(moneyLines.errors);console.error(err)}}
}
async function payBillModal(id,snapshotDue){
  const b=(await supabase.from('bills').select('*').eq('id',id).single()).data
  if(!b||!b.active||b.due_at!==snapshotDue){toast(pick(moneyLines.alreadyPaid));return}
  const w=document.createElement('div');w.className='modalWrap'
  w.innerHTML=`<section class="panel modal"><div class="section-title">Pay ${E(b.name)}</div><form id="payf"><div class="field"><label>Amount paid</label><input id="pam" type="number" min="0" step="0.01" value="${b.amount??''}"></div><div class="field"><label>Payment date</label><input id="pad" type="datetime-local" value="${new Date().toISOString().slice(0,16)}"></div>${b.recurrence_type==='custom'?`<div class="field"><label>Next due date (custom recurrence)</label><input id="nextCustom" type="datetime-local"></div>`:''}<button class="primary">THEY'VE HAD ENOUGH</button> <button id="pcancel" type="button" class="ghost">Cancel</button><p id="perr" class="error"></p></form></section>`
  document.body.appendChild(w);w.querySelector('#pcancel').onclick=()=>w.remove()
  w.querySelector('#payf').onsubmit=async e=>{e.preventDefault();const av=w.querySelector('#pam').value,dv=w.querySelector('#pad').value;if(av==='')return w.querySelector('#perr').textContent=pick(moneyLines.needAmount);if(!dv)return w.querySelector('#perr').textContent=pick(moneyLines.needDate)
    try{
      const pr=await supabase.from('bill_payments').insert({household_id:household.id,bill_id:b.id,bill_name:b.name,expected_amount:b.amount,paid_amount:Number(av),due_at:b.due_at,paid_at:new Date(dv).toISOString(),paid_by:session.user.id});if(pr.error)throw pr.error
      let nd=nextBillDate(b);if(b.recurrence_type==='custom')nd=w.querySelector('#nextCustom').value?new Date(w.querySelector('#nextCustom').value).toISOString():null
      let ur;if(nd)ur=await supabase.from('bills').update({due_at:nd,amount:b.usual_amount,updated_at:new Date().toISOString()}).eq('id',b.id);else ur=await supabase.from('bills').update({active:false,updated_at:new Date().toISOString()}).eq('id',b.id);if(ur.error)throw ur.error
      w.remove();toast(Math.random()<.5?'Tribute delivered. They can leave us alone now.':'Paid. Capitalism has been temporarily appeased.');drawBills();bridgeBills();drawAgendaBills()
    }catch(err){moneyError(err)}
  }
}
async function deleteBill(id){
  if(!confirm(pick(moneyLines.billDelete)))return
  const r=await supabase.from('bills').delete().eq('id',id);if(r.error)return moneyError(r);toast('Gone from the computer. Reality remains regrettably intact.');drawBills();bridgeBills();drawAgendaBills()
}
async function drawDebts(){
  const stage=q('#treasuryStage')
  try{
    const {data,error}=await supabase.from('debts').select('*').eq('household_id',household.id).order('created_at')
    if(error)throw error
    const all=data||[],live=all.filter(d=>!d.defeated_at),dead=all.filter(d=>d.defeated_at),orig=all.reduce((s,d)=>s+Number(d.original_balance),0),cur=live.reduce((s,d)=>s+Number(d.current_balance),0)
    stage.innerHTML=`<section class="panel card"><div class="section-title">Current debt</div>${live.length?live.map(debtCard).join(''):'<div class="empty">No active debt. That feels illegal.</div>'}</section>
    <section class="panel moneyCard" style="margin-top:12px"><div class="section-title">Final combined health bar</div><div class="bigMoney">${eur(cur)} / ${eur(orig)}</div>${hpBar(cur,orig)}<div class="damageLine"><span>${eur(Math.max(0,orig-cur))} destroyed</span><span>${orig?Math.max(0,Math.min(100,(1-cur/orig)*100)).toFixed(1):100}% paid off</span></div></section>
    <div class="portalWrap"><button id="trophyPortal" class="portal">ENTER<br>TROPHY<br>ROOM</button></div>`
    qa('[data-paydebt]').forEach(b=>b.onclick=()=>debtPaymentModal(b.dataset.paydebt))
    qa('[data-borrow]').forEach(b=>b.onclick=()=>borrowingModal(b.dataset.borrow))
    qa('[data-correct]').forEach(b=>b.onclick=()=>correctionModal(b.dataset.correct))
    qa('[data-editdebt]').forEach(b=>b.onclick=()=>debtModal(b.dataset.editdebt))
    qa('[data-deldebt]').forEach(b=>b.onclick=()=>deleteDebt(b.dataset.deldebt))
    q('#trophyPortal').onclick=()=>{go('trophy')}
  }catch(e){moneyError(e)}
}
function hpBar(current,original){
  const pct=original?Math.max(0,Math.min(100,Number(current)/Number(original)*100)):0
  return `<div class="hpTrack"><div class="hpFill" style="width:${pct}%"></div><div class="hpText">${pct.toFixed(1)}% HP REMAINING</div></div><div class="milestones"><span>75</span><span>50</span><span>25</span><span>10</span><span>5</span><span>0</span></div>`
}
function debtCard(d){
  const paid=Math.max(0,Number(d.original_balance)-Number(d.current_balance)),pct=d.original_balance?paid/Number(d.original_balance)*100:100
  return `<article class="debtCard"><div class="debtTop"><div><div class="debtName">${E(d.name)}</div><div class="muted">${E(d.creditor||'')}</div></div><div class="moneyActions"><button data-paydebt="${d.id}">PAYMENT</button><button data-borrow="${d.id}">ADD BORROWING</button><button data-correct="${d.id}">CORRECT</button><button data-editdebt="${d.id}">EDIT</button><button data-deldebt="${d.id}">×</button></div></div><div class="bigMoney">${eur(d.current_balance)} HP</div>${hpBar(d.current_balance,d.original_balance)}<div class="damageLine"><span>${eur(paid)} paid · ${pct.toFixed(1)}%</span><span>${d.recurring_payment?`${eur(d.recurring_payment)} · ${E(d.payment_frequency||'recurring')}`:''}</span></div>${d.next_payment_at?`<div class="muted">Next payment: ${dateText(d.next_payment_at)}</div>`:''}</article>`
}
async function debtModal(id=null){
  const d=id?(await supabase.from('debts').select('*').eq('id',id).single()).data:null,w=document.createElement('div');w.className='modalWrap'
  const np=d?.next_payment_at?new Date(d.next_payment_at).toISOString().slice(0,16):''
  w.innerHTML=`<section class="panel modal"><div class="section-title">${d?'Edit debt':'Add debt'}</div><form id="df" class="formGrid"><div class="field full"><label>Name</label><input id="dnm" required value="${E(d?.name||'')}"></div><div class="field full"><label>Who to pay / creditor</label><input id="dcr" value="${E(d?.creditor||'')}"></div><div class="field"><label>Original balance</label><input id="dob" type="number" min="0" step="0.01" required value="${d?.original_balance??''}"></div><div class="field"><label>Current balance</label><input id="dcb" type="number" min="0" step="0.01" required value="${d?.current_balance??d?.original_balance??''}"></div><div class="field"><label>Recurring payment</label><input id="drp" type="number" min="0" step="0.01" value="${d?.recurring_payment??''}"></div><div class="field"><label>Payment frequency</label><input id="dpf" placeholder="monthly, every 2 weeks…" value="${E(d?.payment_frequency||'')}"></div><div class="field full"><label>Next payment</label><input id="dnp" type="datetime-local" value="${np}"></div><div class="full"><button class="primary">${d?'SAVE':'ADD DEBT'}</button> <button id="dcancel" type="button" class="ghost">Cancel</button></div><p id="derr" class="error full"></p></form></section>`
  document.body.appendChild(w);w.querySelector('#dcancel').onclick=()=>w.remove();w.querySelector('#df').onsubmit=async e=>{e.preventDefault();try{const payload={household_id:household.id,name:w.querySelector('#dnm').value.trim(),creditor:w.querySelector('#dcr').value.trim()||null,original_balance:Number(w.querySelector('#dob').value),current_balance:Number(w.querySelector('#dcb').value),recurring_payment:w.querySelector('#drp').value===''?null:Number(w.querySelector('#drp').value),payment_frequency:w.querySelector('#dpf').value.trim()||null,next_payment_at:w.querySelector('#dnp').value?new Date(w.querySelector('#dnp').value).toISOString():null,updated_at:new Date().toISOString()};let r;if(id)r=await supabase.from('debts').update(payload).eq('id',id);else{payload.created_by=session.user.id;r=await supabase.from('debts').insert(payload)}if(r.error)throw r.error;w.remove();drawDebts()}catch(err){w.querySelector('#derr').textContent=pick(moneyLines.errors);console.error(err)}}
}
function milestoneMessage(before,after,orig){
  const b=orig?before/orig*100:0,a=orig?after/orig*100:0
  const crosses=x=>b>x&&a<=x
  if(after===0)return pick(['DEBTALITY.','THE DEBT HAS FALLEN. THE REALM ENDURES.','THE EMPIRE OF INTEREST HAS BEEN DEFEATED.','FINISH IT. OH WAIT. YOU DID.'])
  if(crosses(75))return 'Basically half paid already. girlmath.'
  if(crosses(50))return "WOOOAH We're halfway there"
  if(crosses(25))return 'final stretch boiiiiiiii'
  if(crosses(10))return 'TEN PERCENT. IT CAN SEE THE END AND IT IS AFRAID.'
  if(crosses(5))return 'I can SMELL the freedom'
  return null
}
async function debtPaymentModal(id){
  const d=(await supabase.from('debts').select('*').eq('id',id).single()).data;if(!d)return
  const w=document.createElement('div');w.className='modalWrap';w.innerHTML=`<section class="panel modal"><div class="section-title">Damage ${E(d.name)}</div><form id="dpfm"><div class="field"><label>Payment amount</label><input id="dpa" type="number" min="0" step="0.01" value="${d.recurring_payment??''}"></div><div class="field"><label>Or enter new balance</label><input id="dnb" type="number" min="0" step="0.01" placeholder="${Number(d.current_balance).toFixed(2)}"></div><div class="field"><label>Date</label><input id="dpd" type="datetime-local" value="${new Date().toISOString().slice(0,16)}"></div><button class="primary">HIT IT</button> <button id="dpcancel" type="button" class="ghost">Cancel</button><p id="dperr" class="error"></p></form></section>`;document.body.appendChild(w);w.querySelector('#dpcancel').onclick=()=>w.remove()
  w.querySelector('#dpfm').onsubmit=async e=>{e.preventDefault();const amountRaw=w.querySelector('#dpa').value,newRaw=w.querySelector('#dnb').value;let amount,newBal;if(newRaw!==''){newBal=Number(newRaw);amount=Number(d.current_balance)-newBal}else{amount=Number(amountRaw);newBal=Number(d.current_balance)-amount}if(!amount||amount===0)return w.querySelector('#dperr').textContent=pick(moneyLines.zeroPay);if(amount<0)return w.querySelector('#dperr').textContent='That would be borrowing. Use ADD BORROWING so the computer knows which direction we are suffering in.';if(amount>Number(d.current_balance)){const f=pick(moneyLines.overpay);return w.querySelector('#dperr').textContent=f(Number(d.current_balance))}
    try{const before=Number(d.current_balance),after=Math.max(0,newBal),at=new Date(w.querySelector('#dpd').value||Date.now()).toISOString();const er=await supabase.from('debt_events').insert({household_id:household.id,debt_id:d.id,event_type:'payment',amount,balance_before:before,balance_after:after,event_at:at,actor_user_id:session.user.id});if(er.error)throw er.error;const ur=await supabase.from('debts').update({current_balance:after,defeated_at:after===0?at:null,updated_at:new Date().toISOString()}).eq('id',d.id);if(ur.error)throw ur.error;w.remove();const mile=milestoneMessage(before,after,Number(d.original_balance));if(mile)toast(mile,5200);else toast(Math.random()<.3?pick(['Solid hit.','Nice. Make it suffer.','Debt reduced. Nature is healing.']):`${eur(amount)} paid ✓`);drawDebts()}catch(err){moneyError(err)}
  }
}
async function borrowingModal(id){
  const d=(await supabase.from('debts').select('*').eq('id',id).single()).data;if(!d)return
  const a=prompt('How much new borrowing?');if(a===null)return;const amount=Number(a);if(!(amount>0))return toast('Give me an actual positive number, menace.')
  const before=Number(d.current_balance),after=before+amount
  try{await supabase.from('debt_events').insert({household_id:household.id,debt_id:d.id,event_type:'borrowing',amount,balance_before:before,balance_after:after,actor_user_id:session.user.id});await supabase.from('debts').update({current_balance:after,defeated_at:null,updated_at:new Date().toISOString()}).eq('id',id);const f=pick(moneyLines.borrow);toast(f(amount));drawDebts()}catch(e){moneyError(e)}
}
async function correctionModal(id){
  const d=(await supabase.from('debts').select('*').eq('id',id).single()).data;if(!d)return
  const a=prompt(`Correct current balance. Current: ${Number(d.current_balance).toFixed(2)}`,Number(d.current_balance).toFixed(2));if(a===null)return;const after=Number(a);if(after<0||Number.isNaN(after))return toast('That balance has offended mathematics.')
  const before=Number(d.current_balance),amount=Math.abs(after-before)
  try{await supabase.from('debt_events').insert({household_id:household.id,debt_id:d.id,event_type:'correction',amount,balance_before:before,balance_after:after,actor_user_id:session.user.id});await supabase.from('debts').update({current_balance:after,defeated_at:after===0?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq('id',id);toast('Balance corrected. The books have stopped screaming.');drawDebts()}catch(e){moneyError(e)}
}
async function deleteDebt(id){
  const events=(await supabase.from('debt_events').select('id').eq('debt_id',id).limit(1)).data||[]
  if(events.length){
    if(!confirm('This will delete the debt AND its entire payment history. Like, actually actually. Still delete it?'))return
    if(!confirm(pick(['YOU ARE ABOUT TO YEET THE RECEIPTS INTO THE VOID. REALLY REALLY?','Last chance, bestie. The numbers will be GONE gone.','Final warning from Records: this is an actual delete, not a cute one.'])))return
  }else if(!confirm('Delete this debt from the computer?'))return
  const r=await supabase.from('debts').delete().eq('id',id);if(r.error)return moneyError(r);toast('Debt record launched into the sun.');drawDebts()
}
async function drawMoneyHistory(){
  const stage=q('#treasuryStage')
  try{
    const [bp,de,debts]=await Promise.all([
      supabase.from('bill_payments').select('*').eq('household_id',household.id).order('paid_at',{ascending:false}),
      supabase.from('debt_events').select('*').eq('household_id',household.id).order('event_at',{ascending:false}),
      supabase.from('debts').select('id,name').eq('household_id',household.id)
    ])
    const dm=Object.fromEntries((debts.data||[]).map(d=>[d.id,d.name]))
    const rows=[
      ...(bp.data||[]).map(x=>({date:x.paid_at,html:`<b>${E(x.bill_name)}</b> paid ${eur(x.paid_amount)}${x.expected_amount!==null&&Number(x.expected_amount)!==Number(x.paid_amount)?` <span class="muted">(expected ${eur(x.expected_amount)})</span>`:''}`})),
      ...(de.data||[]).map(x=>({date:x.event_at,html:`<b>${E(dm[x.debt_id]||'Past debt')}</b> · ${x.event_type==='payment'?`<span class="damaged">${eur(x.amount)} damage</span>`:x.event_type==='borrowing'?`<span class="healed">healed +${eur(x.amount)}</span>`:'balance corrected'} · ${eur(x.balance_before)} → ${eur(x.balance_after)}`}))
    ].sort((a,b)=>new Date(b.date)-new Date(a.date))
    stage.innerHTML=`<section class="panel card"><div class="section-title">Financial history</div>${rows.length?rows.map(r=>`<div class="historyRow">${r.html}<div class="muted">${dateText(r.date)} · ${timeText(r.date)}</div></div>`).join(''):'<div class="empty">History is currently withholding comment.</div>'}</section>`
  }catch(e){moneyError(e)}
}
async function trophyRoom(){
  app.innerHTML=`<main class="shell trophyRoom">${top('Trophy Room')}<div class="agendaToolbar"><div><h1 class="pageTitle">Trophy Room</h1><div class="muted">Past debt. Preserved here so we can point and laugh.</div></div><button id="leaveTrophy" class="ghost">RETURN THROUGH PORTAL</button></div><div id="trophies" class="trophyShelf" style="margin-top:18px"></div></main>${nav()}`
  wire();q('#leaveTrophy').onclick=()=>{active='treasury';treasuryTab='debt';render()}
  try{const {data,error}=await supabase.from('debts').select('*').eq('household_id',household.id).not('defeated_at','is',null).order('defeated_at',{ascending:false});if(error)throw error;q('#trophies').innerHTML=data?.length?data.map(d=>`<article class="trophy"><div class="trophySeal">0 HP</div><h2>${E(d.name)}</h2><div class="muted">${eur(d.original_balance)} defeated</div><div>${dateText(d.defeated_at)}</div></article>`).join(''):`<div class="empty">${E(pick(moneyLines.trophyEmpty))}</div>`}catch(e){moneyError(e)}
}


async function captainsLog(){
  app.innerHTML=`<main class="shell">${top("Captain's Log")}<h1 class="pageTitle">Captain's Log</h1><section class="panel card"><div class="section-title">Permanent record</div><div id="logEntries">Consulting the archives…</div></section></main>${nav()}`;wire()
  const {data,error}=await supabase.from('captains_log').select('*').eq('household_id',household.id).order('created_at',{ascending:false});if(error)return noteError(error)
  const entries=data||[]
  if(!entries.length){q('#logEntries').innerHTML='<div class="empty">The historical record is suspiciously quiet.</div>';return}
  const enriched=await Promise.all(entries.map(async x=>({...x,_photo:await signedNoteMedia(x.photo_path),_doodle:await signedNoteMedia(x.doodle_path)})))
  q('#logEntries').innerHTML=enriched.map(x=>`<article class="logEntry">
    <div class="logEntryHead"><b>${E(x.title||'Log entry')}</b><span class="muted">${E(x.author_name_snapshot||'Crew')} · ${dateText(x.created_at)} ${timeText(x.created_at)}</span></div>
    ${x.body?`<div class="logEntryBody">${E(x.body)}</div>`:''}
    ${x._photo?`<img class="noteMedia" src="${E(x._photo)}" alt="Photo saved to the log">`:''}
    ${x._doodle?`<img class="noteMedia" src="${E(x._doodle)}" alt="Doodle saved to the log">`:''}
  </article>`).join('')
}

function placeholder(t){app.innerHTML=`<main class="shell">${top(t)}<section class="panel card"><h1 class="pageTitle">${E(t)}</h1><p class="muted">Coming soon.</p></section></main>${nav()}`;wire()}
function render(){
document.body.classList.remove('shoppingMode')
if(active==='bridge')bridge();else if(active==='crew')crew();else if(active==='agenda')agenda();else if(active==='more')more();else if(active==='shopping')shopping();else if(active==='treasury')treasury();else if(active==='trophy')trophyRoom();else if(active==='notes')notes();else if(active==='log')captainsLog();else{active='bridge';bridge()}
}
function subscribe(){if(channel)supabase.removeChannel(channel);channel=supabase.channel('bridge-'+household.id).on('postgres_changes',{event:'*',schema:'public',table:'cat_feedings',filter:`household_id=eq.${household.id}`},()=>{if(active==='bridge')loadCats()})
.on('postgres_changes',{event:'*',schema:'public',table:'medications',filter:`household_id=eq.${household.id}`},()=>{if(active==='bridge')loadSickBay();sbRerender?.()})
.on('postgres_changes',{event:'*',schema:'public',table:'medication_schedules',filter:`household_id=eq.${household.id}`},()=>{if(active==='bridge')loadSickBay();sbRerender?.()})
.on('postgres_changes',{event:'*',schema:'public',table:'medication_logs',filter:`household_id=eq.${household.id}`},()=>{if(active==='bridge')loadSickBay();sbRerender?.()})
.on('postgres_changes',{event:'*',schema:'public',table:'health_observations',filter:`household_id=eq.${household.id}`},()=>{sbRerender?.()}).on('postgres_changes',{event:'*',schema:'public',table:'tasks',filter:`household_id=eq.${household.id}`},()=>{if(active==='agenda')drawAgenda();if(active==='bridge')bridgeTasks()}).on('postgres_changes',{event:'*',schema:'public',table:'task_categories',filter:`household_id=eq.${household.id}`},()=>{if(active==='agenda')drawAgenda()})
.on('postgres_changes',{event:'*',schema:'public',table:'shopping_items',filter:`household_id=eq.${household.id}`},payload=>{
  if(active==='shopping'){
    if(payload.eventType==='INSERT' && payload.new.created_by!==session.user.id){
      const ping=q('#newCargoPing');if(ping){ping.innerHTML=`<div class="freshPing">NEW CARGO REQUEST: ${E(payload.new.name)}</div>`;setTimeout(()=>{if(ping)ping.innerHTML=''},5000)}
    }
    drawShopping()
  }
})
.on('postgres_changes',{event:'*',schema:'public',table:'shopping_lists',filter:`household_id=eq.${household.id}`},()=>{if(active==='shopping')shopping()})
.on('postgres_changes',{event:'*',schema:'public',table:'bills',filter:`household_id=eq.${household.id}`},()=>{if(active==='treasury'&&treasuryTab==='bills')drawBills();if(active==='bridge')bridgeBills();if(active==='agenda')drawAgendaBills()})
.on('postgres_changes',{event:'*',schema:'public',table:'bill_payments',filter:`household_id=eq.${household.id}`},()=>{if(active==='treasury')drawTreasury()})
.on('postgres_changes',{event:'*',schema:'public',table:'debts',filter:`household_id=eq.${household.id}`},()=>{if(active==='treasury'&&treasuryTab==='debt')drawDebts();if(active==='trophy')trophyRoom()})
.on('postgres_changes',{event:'*',schema:'public',table:'debt_events',filter:`household_id=eq.${household.id}`},()=>{if(active==='treasury'&&treasuryTab==='history')drawMoneyHistory()})
.on('postgres_changes',{event:'*',schema:'public',table:'notes',filter:`household_id=eq.${household.id}`},()=>{if(active==='notes')drawNotes();if(active==='bridge')bridgeNotes()})
.on('postgres_changes',{event:'*',schema:'public',table:'note_comments',filter:`household_id=eq.${household.id}`},()=>{})
.on('postgres_changes',{event:'*',schema:'public',table:'note_reactions',filter:`household_id=eq.${household.id}`},()=>{})
.on('postgres_changes',{event:'*',schema:'public',table:'captains_log',filter:`household_id=eq.${household.id}`},()=>{if(active==='log')captainsLog()})
.subscribe()}
async function boot(){
  if(!configured)return auth()
  session=(await supabase.auth.getSession()).data.session
  if(session){
    await userData()
    if(household){
      await ensureCategories();await ensureShoppingLists();subscribe()
      parseRoute()
      if(!location.hash)go('bridge',{replace:true});else render()
    }else onboard()
  }else auth()
  supabase.auth.onAuthStateChange(async(_,s)=>{
    session=s
    if(!s){profile=household=null;return auth()}
    await userData()
    if(household){await ensureCategories();await ensureShoppingLists();subscribe();parseRoute();render()}else onboard()
  })
}
window.addEventListener('popstate',()=>{if(!session||!household)return;parseRoute();render()})
window.addEventListener('hashchange',()=>{if(!session||!household)return;parseRoute();render()})
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&session&&household)refreshNotifBadge()})
boot()
