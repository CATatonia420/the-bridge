import './styles.css'
import { supabase, configured } from './supabase'

const app = document.querySelector('#app')
let session = null
let household = null
let profile = null
let addOpen = false

const esc = (s='') => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))

function renderAuth(message=''){
  app.innerHTML = `
  <main class="shell"><section class="panel auth">
    <div class="brand">The Bridge</div>
    <h1>Permission to come aboard?</h1>
    <p class="muted">Two humans. Two cats. One increasingly over-engineered household.</p>
    ${!configured ? `<p class="error">Supabase isn't connected yet. Add your project URL and publishable key to a .env file first.</p>`:''}
    <div class="tabs"><button id="loginTab" class="active">Log in</button><button id="signupTab">Sign up</button></div>
    <form id="authForm">
      <div class="field"><label>Email</label><input id="email" type="email" required autocomplete="email"></div>
      <div class="field"><label>Password</label><input id="password" type="password" minlength="6" required autocomplete="current-password"></div>
      <button class="primary" type="submit">ENTER THE BRIDGE</button>
      <p id="authMsg" class="error">${esc(message)}</p>
    </form>
  </section></main>`
  let mode='login'
  const login=document.querySelector('#loginTab'), signup=document.querySelector('#signupTab')
  login.onclick=()=>{mode='login';login.classList.add('active');signup.classList.remove('active')}
  signup.onclick=()=>{mode='signup';signup.classList.add('active');login.classList.remove('active')}
  document.querySelector('#authForm').onsubmit=async e=>{
    e.preventDefault()
    if(!configured) return
    const email=document.querySelector('#email').value
    const password=document.querySelector('#password').value
    const result = mode==='signup'
      ? await supabase.auth.signUp({email,password})
      : await supabase.auth.signInWithPassword({email,password})
    if(result.error) document.querySelector('#authMsg').textContent=result.error.message
  }
}

async function loadUserData(){
  const uid=session.user.id
  const {data:p}=await supabase.from('profiles').select('*').eq('user_id',uid).maybeSingle()
  profile=p
  const {data:m}=await supabase.from('household_members').select('household_id').eq('user_id',uid).limit(1).maybeSingle()
  if(m){
    const {data:h}=await supabase.from('households').select('*').eq('id',m.household_id).single()
    household=h
  } else household=null
}

function renderOnboarding(){
  app.innerHTML=`<main class="shell"><section class="panel setup">
   <div class="brand">Crew Registration</div>
   <h1>${profile ? 'Join your ship' : 'Create your profile'}</h1>
   ${!profile ? `<form id="profileForm">
      <div class="field"><label>Name</label><input id="display" required placeholder="Christina"></div>
      <div class="field"><label>Nickname (optional)</label><input id="nick" placeholder="Chief Chaos Officer"></div>
      <button class="primary">SAVE PROFILE</button>
    </form>` : `
    <p>Welcome, <b>${esc(profile.display_name || 'crew member')}</b>.</p>
    <div class="tabs"><button id="createBtn" class="primary">Create household</button><button id="joinBtn" class="ghost">Join with code</button></div>
    <div id="joinArea"></div>`}
   <p id="msg" class="error"></p>
  </section></main>`
  if(!profile){
    document.querySelector('#profileForm').onsubmit=async e=>{
      e.preventDefault()
      const {error}=await supabase.from('profiles').insert({
        user_id:session.user.id,
        display_name:document.querySelector('#display').value,
        nickname:document.querySelector('#nick').value
      })
      if(error) return document.querySelector('#msg').textContent=error.message
      await loadUserData(); renderOnboarding()
    }
  } else {
    document.querySelector('#createBtn').onclick=async()=>{
      const {data,error}=await supabase.rpc('create_household',{household_name:'The Bridge'})
      if(error) return document.querySelector('#msg').textContent=error.message
      await loadUserData(); await seedCats(); renderBridge()
    }
    document.querySelector('#joinBtn').onclick=()=>{
      document.querySelector('#joinArea').innerHTML=`<form id="joinForm"><div class="field"><label>Invite code</label><input id="code" required></div><button class="primary">COME ABOARD</button></form>`
      document.querySelector('#joinForm').onsubmit=async e=>{
        e.preventDefault()
        const {error}=await supabase.rpc('join_household',{code:document.querySelector('#code').value})
        if(error) return document.querySelector('#msg').textContent=error.message
        await loadUserData(); renderBridge()
      }
    }
  }
}

async function seedCats(){
  if(!household) return
  const {data}=await supabase.from('cats').select('id').eq('household_id',household.id).limit(1)
  if(data?.length) return
  const {data:cats,error}=await supabase.from('cats').insert([
    {household_id:household.id,name:'Pukha',breed:'British Longhair',job_title:'Senior Household Supervisor'},
    {household_id:household.id,name:'Pluto',breed:'Domestic shorthair',job_title:'Head of Ruling From High Places'}
  ]).select()
  if(error) return
  for(const cat of cats){
    await supabase.from('cat_feeding_schedules').insert(
      ['05:00','13:00','21:00'].map(t=>({cat_id:cat.id,feeding_time:t}))
    )
  }
}

function renderBridge(){
  const name=esc(profile?.display_name || 'Crew Member')
  app.innerHTML=`<main class="shell">
    <header class="top"><div><div class="brand">The Bridge</div><div class="sub">${esc(household?.name || '')}</div></div>
      <button id="logout" class="ghost">Log out</button></header>
    <div class="grid">
      <section class="panel hero"><div><span class="muted">GOOD AFTERNOON,</span><h1>${name}.</h1><div>Why did the photon check a suitcase?<br><span class="muted">It was travelling light.</span></div></div><div class="profileDot">${name[0] || '?'}</div></section>
      <section class="panel card cats"><div class="section-title">The children</div><div id="cats" class="catrow"><div class="muted">Scanning for cats…</div></div></section>
      <section class="panel card notes"><div class="section-title">Sticky notes</div><div class="sticky">There is cake in the fridge.<br><br>This is not a drill.</div></section>
      <section class="panel card agenda"><div class="section-title">Today</div><div class="list">
        <div class="row"><span>13:00 &nbsp; Feed the babies</span><span>○</span></div>
        <div class="row"><span>21:00 &nbsp; TAKE YOUR DRUGS</span><span class="danger">!</span></div>
        <div class="row"><span class="muted">No disasters currently detected. Probably.</span><span class="ok">✓</span></div>
      </div></section>
      <section class="panel card ops"><div class="section-title">House status</div><div class="list">
        <div class="row"><span>Laundry</span><span class="muted">Needs doing</span></div>
        <div class="row"><span>Litter</span><span class="ok">Done</span></div>
        <div class="row"><span>Tidy kitchen</span><span class="muted">Needs doing</span></div>
      </div></section>
    </div>
  </main>
  <button id="plus" class="plus">+</button>
  <section id="addMenu" class="panel menu" hidden>
    <button>NOTE</button><button>TASK</button><button>PLAN</button><button>STUFF</button><button>MONEY</button>
  </section>
  <nav class="nav"><button class="active">BRIDGE</button><button>AGENDA</button><button>CREW</button><button>LOG</button><button>MORE</button></nav>`
  document.querySelector('#logout').onclick=()=>supabase.auth.signOut()
  document.querySelector('#plus').onclick=()=>{
    addOpen=!addOpen; document.querySelector('#addMenu').hidden=!addOpen
  }
  loadCats()
}

async function loadCats(){
  const {data:cats}=await supabase.from('cats').select('*, cat_feeding_schedules(*)').eq('household_id',household.id).order('name')
  const holder=document.querySelector('#cats')
  if(!holder) return
  if(!cats?.length){holder.innerHTML='<div class="muted">No feline officers found.</div>';return}
  holder.innerHTML=cats.map(cat=>`
    <article class="cat">
      <div class="catname">${esc(cat.name)}</div>
      <div class="muted">${esc(cat.breed || '')}</div>
      <div>${esc(cat.job_title || '')}</div>
      <div class="bowls">${['05:00','13:00','21:00'].map((t,i)=>`<button class="bowl ${i<2?'done':''}" data-cat="${cat.id}" data-time="${t}">${t}<br>${i<2?'✓':'○'}</button>`).join('')}</div>
    </article>`).join('')
}

async function boot(){
  if(!configured){renderAuth();return}
  const {data:{session:s}}=await supabase.auth.getSession()
  session=s
  if(session){await loadUserData(); household ? renderBridge() : renderOnboarding()}
  else renderAuth()
  supabase.auth.onAuthStateChange(async(_event,newSession)=>{
    session=newSession
    if(!session){profile=null;household=null;renderAuth();return}
    await loadUserData()
    household ? renderBridge() : renderOnboarding()
  })
}
boot()
