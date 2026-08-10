import './styles.css'
import { supabase, configured } from './supabase'

const app = document.querySelector('#app')
let session=null, household=null, profile=null, activeTab='bridge', realtimeChannel=null
const esc=(s='')=>String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))

const nav=()=>`<nav class="nav">${['bridge','agenda','crew','log','more'].map(x=>`<button data-tab="${x}" class="${activeTab===x?'active':''}">${x.toUpperCase()}</button>`).join('')}</nav>`
const top=(title='The Bridge')=>`<header class="top"><div><div class="brand">${esc(title)}</div><div class="sub">${esc(household?.name||'')}</div></div><button id="logout" class="ghost">Log out</button></header>`

function wire(){
  document.querySelector('#logout')?.addEventListener('click',()=>supabase.auth.signOut())
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{activeTab=b.dataset.tab;renderCurrent()})
}

function renderAuth(msg=''){
  app.innerHTML=`<main class="shell"><section class="panel auth"><div class="brand">The Bridge</div><h1>Permission to come aboard?</h1><p class="muted">Two humans. Two cats. One increasingly over-engineered household.</p>
  <div class="tabs"><button id="loginTab" class="active">Log in</button><button id="signupTab">Sign up</button></div>
  <form id="authForm"><div class="field"><label>Email</label><input id="email" type="email" required></div><div class="field"><label>Password</label><input id="password" type="password" minlength="6" required></div><button class="primary">ENTER THE BRIDGE</button><p id="authMsg" class="error">${esc(msg)}</p></form></section></main>`
  let mode='login'
  loginTab.onclick=()=>{mode='login';loginTab.classList.add('active');signupTab.classList.remove('active')}
  signupTab.onclick=()=>{mode='signup';signupTab.classList.add('active');loginTab.classList.remove('active')}
  authForm.onsubmit=async e=>{
    e.preventDefault()
    const email=document.querySelector('#email').value,password=document.querySelector('#password').value
    const r=mode==='signup'?await supabase.auth.signUp({email,password}):await supabase.auth.signInWithPassword({email,password})
    if(r.error) authMsg.textContent=r.error.message
  }
}

async function loadUserData(){
  const uid=session.user.id
  const {data:p}=await supabase.from('profiles').select('*').eq('user_id',uid).maybeSingle(); profile=p
  const {data:m}=await supabase.from('household_members').select('household_id').eq('user_id',uid).limit(1).maybeSingle()
  if(m){const {data:h}=await supabase.from('households').select('*').eq('id',m.household_id).single();household=h}else household=null
}

function renderOnboarding(){
  app.innerHTML=`<main class="shell"><section class="panel setup"><div class="brand">Crew Registration</div><h1>${profile?'Join your ship':'Create your profile'}</h1>
  ${!profile?`<form id="profileForm"><div class="field"><label>Name</label><input id="display" required></div><div class="field"><label>Nickname (optional)</label><input id="nick"></div><button class="primary">SAVE PROFILE</button></form>`
  :`<p>Welcome, <b>${esc(profile.display_name||'crew member')}</b>.</p><div class="tabs"><button id="createBtn" class="primary">Create household</button><button id="joinBtn" class="ghost">Join with code</button></div><div id="joinArea"></div>`}
  <p id="msg" class="error"></p></section></main>`
  if(!profile){
    profileForm.onsubmit=async e=>{e.preventDefault();const {error}=await supabase.from('profiles').insert({user_id:session.user.id,display_name:display.value,nickname:nick.value});if(error)return msg.textContent=error.message;await loadUserData();renderOnboarding()}
  }else{
    createBtn.onclick=async()=>{const {error}=await supabase.rpc('create_household',{household_name:'The Bridge'});if(error)return msg.textContent=error.message;await loadUserData();await seedCats();subscribeRealtime();activeTab='crew';renderCurrent()}
    joinBtn.onclick=()=>{joinArea.innerHTML=`<form id="joinForm"><div class="field"><label>Invite code</label><input id="code" required></div><button class="primary">COME ABOARD</button></form>`;joinForm.onsubmit=async e=>{e.preventDefault();const {error}=await supabase.rpc('join_household',{code:code.value});if(error)return msg.textContent=error.message;await loadUserData();subscribeRealtime();activeTab='crew';renderCurrent()}}
  }
}

async function seedCats(){
  const {data}=await supabase.from('cats').select('id').eq('household_id',household.id).limit(1);if(data?.length)return
  const {data:cats}=await supabase.from('cats').insert([
    {household_id:household.id,name:'Pukha',breed:'British Longhair',job_title:'Senior Household Supervisor'},
    {household_id:household.id,name:'Pluto',breed:'Domestic shorthair',job_title:'Head of Ruling From High Places'}
  ]).select()
  for(const cat of cats||[]) await supabase.from('cat_feeding_schedules').insert(['05:00','13:00','21:00'].map(t=>({cat_id:cat.id,feeding_time:t})))
}

async function renderBridge(){
  const name=esc(profile?.display_name||'Crew Member')
  app.innerHTML=`<main class="shell">${top()}<div class="grid">
  <section class="panel hero"><div><span class="muted">GOOD AFTERNOON,</span><h1>${name}.</h1><div>Why did the photon check a suitcase?<br><span class="muted">It was travelling light.</span></div></div><div class="profileDot">${name[0]||'?'}</div></section>
  <section class="panel card cats"><div class="section-title">The children</div><div id="cats" class="catrow">Scanning for cats…</div></section>
  <section class="panel card notes"><div class="section-title">Sticky notes</div><div class="sticky">There is cake in the fridge.<br><br>This is not a drill.</div></section>
  <section class="panel card agenda"><div class="section-title">Today</div><div class="list"><div class="row"><span>13:00 Feed the babies</span><span>○</span></div><div class="row"><span>21:00 TAKE YOUR DRUGS</span><span class="danger">!</span></div></div></section>
  <section class="panel card ops"><div class="section-title">House status</div><div class="list"><div class="row"><span>Laundry</span><span class="muted">Needs doing</span></div><div class="row"><span>Litter</span><span class="ok">Done</span></div></div></section>
  </div></main><button id="plus" class="plus">+</button><section id="addMenu" class="panel menu" hidden><button>NOTE</button><button>TASK</button><button>PLAN</button><button>STUFF</button><button>MONEY</button></section>${nav()}`
  wire(); plus.onclick=()=>addMenu.hidden=!addMenu.hidden; loadCats()
}

async function loadCats(){
  const {data:cats}=await supabase.from('cats').select('*').eq('household_id',household.id).order('name')
  if(!cats?.length){document.querySelector('#cats').innerHTML='No feline officers found.';return}
  document.querySelector('#cats').innerHTML=cats.map(c=>`<article class="cat"><div class="catname">${esc(c.name)}</div><div class="muted">${esc(c.breed||'')}</div><div>${esc(c.job_title||'')}</div><div class="bowls">${['05:00','13:00','21:00'].map(t=>`<button class="bowl">${t}<br>○</button>`).join('')}</div></article>`).join('')
}

async function renderCrew(){
  app.innerHTML=`<main class="shell">${top('Crew')}<section class="panel invite"><div class="section-title">Household invite code</div><p class="muted">Joe signs up on his own device, then chooses <b>Join with code</b>.</p><div class="copyline"><div class="code">${esc(household.invite_code)}</div><button id="copyCode" class="primary">COPY CODE</button></div><p id="copyMsg" class="muted"></p></section><h1 class="pageTitle">Crew Manifest</h1><div id="crewGrid" class="crewgrid">Calling all idiots to the bridge…</div></main>${nav()}`
  wire();copyCode.onclick=async()=>{await navigator.clipboard.writeText(household.invite_code);copyMsg.textContent='Copied. Try not to transmit it to the Borg.'};await loadCrew()
}

async function loadCrew(){
  const {data:members}=await supabase.from('household_members').select('user_id').eq('household_id',household.id)
  const ids=(members||[]).map(m=>m.user_id)
  let humans=[]; if(ids.length){const {data}=await supabase.from('profiles').select('*').in('user_id',ids);humans=data||[]}
  const {data:cats}=await supabase.from('cats').select('*').eq('household_id',household.id).order('name')
  crewGrid.innerHTML=[
    ...humans.map(p=>`<article class="panel crewcard"><div class="crewhead"><div class="avatar">${esc((p.display_name||'?')[0])}</div><div><div class="crewname">${esc(p.display_name||'Crew member')}</div><div class="muted">${esc(p.nickname||'Human')}</div><span class="badge">Human crew</span></div></div></article>`),
    ...(cats||[]).map(c=>`<article class="panel crewcard"><div class="crewhead"><div class="avatar">CAT</div><div><div class="crewname">${esc(c.name)}</div><div class="muted">${esc(c.breed||'Cat')}</div><span class="badge">${esc(c.job_title||'Feline officer')}</span></div></div></article>`)
  ].join('')
}

function renderPlaceholder(title,line){app.innerHTML=`<main class="shell">${top(title)}<section class="panel card"><h1 class="pageTitle">${esc(title)}</h1><p>${esc(line)}</p><p class="muted">This module is coming in the next builds.</p></section></main>${nav()}`;wire()}
function renderCurrent(){if(activeTab==='bridge')return renderBridge();if(activeTab==='crew')return renderCrew();if(activeTab==='agenda')return renderPlaceholder('Agenda','Temporal nonsense will live here.');if(activeTab==='log')return renderPlaceholder("Captain's Log",'Funny shit, memories, photos and doodles.');return renderPlaceholder('More','Bills, boss battles, freezer, drugs, house ops and settings.')}

function subscribeRealtime(){
  if(!household)return
  if(realtimeChannel)supabase.removeChannel(realtimeChannel)
  realtimeChannel=supabase.channel(`household-${household.id}`)
   .on('postgres_changes',{event:'*',schema:'public',table:'household_members',filter:`household_id=eq.${household.id}`},()=>{if(activeTab==='crew')loadCrew()})
   .on('postgres_changes',{event:'*',schema:'public',table:'profiles'},()=>{if(activeTab==='crew')loadCrew()})
   .on('postgres_changes',{event:'*',schema:'public',table:'cats',filter:`household_id=eq.${household.id}`},()=>{if(activeTab==='crew')loadCrew();if(activeTab==='bridge')loadCats()})
   .subscribe()
}

async function boot(){
  if(!configured)return renderAuth()
  const {data:{session:s}}=await supabase.auth.getSession();session=s
  if(session){await loadUserData();if(household){subscribeRealtime();renderCurrent()}else renderOnboarding()}else renderAuth()
  supabase.auth.onAuthStateChange(async(_e,newSession)=>{session=newSession;if(!session){if(realtimeChannel)supabase.removeChannel(realtimeChannel);profile=null;household=null;return renderAuth()}await loadUserData();if(household){subscribeRealtime();renderCurrent()}else renderOnboarding()})
}
boot()
