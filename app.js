// 1) Supabase values (Project Settings > API). The publishable key is safe to expose.
const SUPABASE_URL='https://uechkunlijbtkufubxdo.supabase.co',SUPABASE_KEY='sb_publishable_Qr7zD1bN-19MZerPi2CboQ_-Vz8RpGJ';
// 2) Stripe Payment Link for the Pro unlock. The user's ID is attached on checkout so the
//    webhook knows whose profile to flip. Create/manage it: Dashboard > Payment links.
const PAY_LINK='https://buy.stripe.com/8x2aEW0QCaZ91JRf8LabK02';
const PRO_PRICE='$4.99'; // display only — the real price is on the Stripe payment link. Keep in sync.

const LS={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
const JOIN=new URLSearchParams(location.search).get('join')||'';
const CK=new URLSearchParams(location.search).get('checkout')||'';
let sb,me=null,prof=null,CR=[],cid=null,M={},B=[],FF=[],loaded=false,t='bets',pre='',signup=false,bound=false;
let spicyOn=LS.get('bet_spicy')==='1',pwOpen=false;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const val=id=>{const e=document.getElementById(id);return e?e.value.trim():''};
const nm=id=>M[id]||'Someone',ids=()=>Object.keys(M),live=()=>B.filter(b=>!b.rep),crew=()=>CR.find(c=>c.id===cid)||{};
const isPro=()=>!!(prof&&prof.pro);
const tot=(b,s)=>{let x=0;for(const k in b.picks)if(b.picks[k].side===s)x+=b.picks[k].amt;return x};
function payout(b,id){const p=b.picks,pk=p[id];if(!pk||b.st!=='done')return 0;let pool=0,win=0;for(const k in p){pool+=p[k].amt;if(p[k].side===b.res)win+=p[k].amt}
 if(win===0||win===pool)return pk.amt;return pk.side===b.res?Math.round(pool*pk.amt/win):0}
function bal(id){let p=100;live().forEach(b=>{const pk=b.picks[id];if(pk){p-=pk.amt;p+=payout(b,id)}});return p}
const T_W=['Called it. Pay respect.','Easiest points of my life.','Some of us just know things.','Write it down: I was right.'],T_L=['Thanks for the donation.','Better luck next season.','Bold take. Wrong, but bold.','Not your finest read.'];
const T_WS=['Called it. Frame this.','Never doubted myself. You should have.','Free money. You are welcome for the lesson.','Sit back and watch a professional.'],T_LS=['Sit down.','Embarrassing. Truly.','Hope that read was free, because it cost you.','Wrong again. Consistent, at least.','Go touch grass and think about what you did.'];
function taunt(b,res){const pk=b.picks,w=Object.keys(pk).filter(k=>pk[k].side===res).map(nm),l=Object.keys(pk).filter(k=>pk[k].side!==res).map(nm),r=a=>a[Math.floor(Math.random()*a.length)];
 return (w.length?w.join(', ')+': '+r(spicyOn?T_WS:T_W):'Nobody saw that coming.')+(l.length?' '+l.join(', ')+': '+r(spicyOn?T_LS:T_L):'')}
async function run(p){const r=await p;if(r.error)alert(r.error.message);await load();return r}
async function auth(){
 const e=val('em'),p=document.getElementById('pw').value;
 if(signup){const n=val('nm');
  if(!document.getElementById('adult').checked)return alert('The Bet is for adults 18 and over.');
  if(!n||!e||p.length<8)return alert('Add a name, an email, and a password of 8+ characters.');
  const {data,error}=await sb.auth.signUp({email:e,password:p,options:{data:{name:n,adult:true}}});
  if(error)return alert(error.message);
  if(!data.session)alert('Check your email to confirm your account, then sign in.')}
 else{const {error}=await sb.auth.signInWithPassword({email:e,password:p});if(error)alert(error.message)}}
const out=()=>sb.auth.signOut();
async function mkCrew(){const n=val('cn');if(!n)return alert('Name your crew.');
 const r=await sb.rpc('create_crew',{crew_name:n,my_name:prof.name});if(r.error)return alert(r.error.message);cid=r.data.id;LS.set('bet_crew',cid);await load()}
async function joinCrew(){const c=val('jc');if(!c)return alert('Enter the invite code.');
 const r=await sb.rpc('join_crew',{join_code:c,my_name:prof.name});if(r.error)return alert(r.error.message);cid=r.data.id;LS.set('bet_crew',cid);history.replaceState(null,'',location.pathname);await load()}
const pickCrew=v=>{cid=v;LS.set('bet_crew',v);load()};
async function invite(){const u=location.origin+location.pathname+'?join='+crew().code,x=`Join my crew "${crew().name}" on The Bet (18+, play money): ${u}`;
 try{if(navigator.share){await navigator.share({text:x});return}await navigator.clipboard.writeText(x);alert('Invite copied. Text it to your friends.')}catch(e){prompt('Copy this invite:',x)}}
function addBet(){const s=val('subj'),q=val('q');if(!q)return alert('Write the bet first.');
 const fo2el=document.getElementById('fo2'),custom=fo2el?val('fo2'):'';
 const f=custom||(document.getElementById('fo')?document.getElementById('fo').value:'');
 if(custom.length>140)return alert('Keep the forfeit under 140 characters.');
 if(custom&&!isPro()&&prof&&prof.forfeit_tokens<1){pwOpen=true;render();return}
 pre='';t='bets';
 run(sb.rpc('post_bet',{p_crew:cid,p_subject:s,p_question:q,p_forfeit:f}))}
function pick(id,side){const a=parseInt(val('a'+id),10);
 if(!(a>0))return alert('Pick a stake of 1 BB or more.');
 run(sb.rpc('place_pick',{p_bet:id,p_side:side,p_amt:a}))}
const accept=id=>run(sb.rpc('accept_forfeit',{p_bet:id}));
const settle=(id,res)=>run(sb.rpc('settle_bet',{p_bet:id,p_result:res,p_line:taunt(B.find(x=>x.id===id),res)}));
const veto=id=>run(sb.rpc('veto_bet',{p_bet:id}));
const report=id=>{if(confirm('Report this bet? It will be hidden for the crew.'))run(sb.from('bets').update({reported:true}).eq('id',id))};
function cardText(b){const w=Object.keys(b.picks).filter(k=>b.picks[k].side===b.res).map(nm);
 return `THE BET (${crew().name})\n${b.q}\nResult: ${b.res.toUpperCase()}\nCalled it: ${w.join(', ')||'nobody'}\n${b.line||''}${b.fo?'\nOwed: '+b.fo:''}`}
function copyText(x,ok){try{navigator.clipboard.writeText(x).then(()=>alert(ok),()=>prompt('Copy this:',x))}catch(e){prompt('Copy this:',x)}}
function qrFor(code){if(!code)return '';try{const q=window.qr(0,'M');q.addData('https://thebet.website/?join='+encodeURIComponent(code));q.make();return q.createDataURL(4,8)}catch(e){return ''}}
function copyRecruit(id){const b=B.find(x=>x.id===id);
 copyText(cardText(b)+`\nThink you can call it better? Join the crew — code ${crew().code||''} (18+, play money)`,'Recruit card copied — it contains your crew code. Share it deliberately.')}
function copyCard(id){copyText(cardText(B.find(b=>b.id===id)),'Copied. Paste it anywhere.')}
const mailCard=id=>{location.href='mailto:?subject='+encodeURIComponent('The Bet: settled')+'&body='+encodeURIComponent(cardText(B.find(b=>b.id===id)))};
const P=['Will {n} text their ex this weekend?','Will {n} skip the gym... again?','Will {n} be the first to leave the party?','Will {n} buy something they cannot afford this week?','Will {n} finish what they started this month?','Will {n} laugh at the worst possible moment?','Will {n} cry at the next movie night?','Will {n} order dessert after swearing they would not?','Will {n} check their phone before the mains arrive?','Will {n} actually read the book they keep recommending?'];
function spin(){const el=document.getElementById('wh'),ns=ids().map(nm);let i=0;
 const iv=setInterval(()=>{el.textContent=P[Math.floor(Math.random()*P.length)].replace('{n}',ns[Math.floor(Math.random()*ns.length)]);
  if(++i>14){clearInterval(iv);pre=el.textContent;document.getElementById('use').style.display='block'}},90)}
const useIt=()=>{t='new';render()},tab=x=>{t=x;render()};
const flip=k=>{if(k==='s'){spicyOn=!spicyOn;LS.set('bet_spicy',spicyOn?'1':'0')}render()};
async function buyPro(){
 if(!me)return alert('Sign in first.');
 // Attaching client_reference_id lets the stripe-webhook function match this
 // payment to the signed-in user's profile.
 location.href=PAY_LINK+'?client_reference_id='+encodeURIComponent(me)}
async function restorePro(){const r=await sb.from('profiles').select('pro').eq('id',me).single();
 if(r.data&&r.data.pro){prof.pro=true;alert('Pro is active on your account.');render()}else alert('No Pro purchase found on this account yet. If you just paid, give it a minute and try again.')}
async function redeem(){const c=val('rc');if(!c)return alert('Enter your code.');
 const r=await sb.rpc('redeem_code',{p_code:c});
 if(r.error)return alert(r.error.message);
 await refreshProSilent();alert('Code accepted — Pro unlocked.');pwOpen=false;render()}
async function rotateCode(){if(!confirm('Rotate the crew code? Old invite codes and links stop working.'))return;
 const r=await sb.rpc('rotate_code',{p_crew:cid});if(r.error)return alert(r.error.message);
 alert('Crew code rotated.');await load()}
async function refreshProSilent(){const r=await sb.from('profiles').select('pro').eq('id',me).single();
 if(r.data&&r.data.pro){prof.pro=true;render()}}
function card(b){
 const pk=b.picks,y=tot(b,'yes'),n=tot(b,'no'),pc=y+n?Math.round(100*y/(y+n)):50,mine=pk[me],ac=b.acc;
 let h=`<div class="card"><div class="tag">About ${esc(nm(b.subj))}${b.st==='done'?' · settled':''}</div><div class="q">${esc(b.q)}</div>${b.fo?`<div class="sub">Losers owe: <b>${esc(b.fo)}</b></div>`:''}<div class="bar"><i style="width:${pc}%"></i></div><div class="sub">Yes ${y} BB · No ${n} BB · ${Object.keys(pk).length} in</div>`;
 if(b.st==='pending'){
  h+=`<div class="sub">Everyone must accept the forfeit before this opens: ${Object.keys(ac).length}/${ids().length}</div>`;
  if(!ac[me])h+=`<button style="width:100%" onclick="accept('${b.id}')">Accept the forfeit</button>`;
  if(b.subj===me)h+=`<button class="g" style="width:100%;margin-top:8px" onclick="veto('${b.id}')">Veto and delete</button>`}
 else if(b.st==='open'){
  if(b.subj!==me&&!mine)h+=`<input id="a${b.id}" type="number" value="10" min="1"><div class="row"><button class="y" onclick="pick('${b.id}','yes')">Yes</button><button class="n" onclick="pick('${b.id}','no')">No</button></div>`;
  else if(mine)h+=`<div class="sub">You picked ${mine.side.toUpperCase()} for ${mine.amt} BB.</div>`;
  if(b.subj===me)h+=`<button class="g" style="width:100%" onclick="veto('${b.id}')">Veto and refund (your call)</button>`;
  else h+=`<div class="sub" style="margin-top:8px">Settle it (not the subject):</div><div class="row"><button class="g" onclick="settle('${b.id}','yes')">Happened</button><button class="g" onclick="settle('${b.id}','no')">Did not</button></div>`}
 else{const w=Object.keys(pk).filter(k=>pk[k].side===b.res).map(nm),myWin=payout(b,me);
  h+=`<div class="share"><img class="wm" src="assets/chip-watermark.png" alt=""><div class="tag" style="color:#fff9">THE BET · SETTLED${spicyOn?' · SPICY':''}</div><div class="q">${esc(b.q)}</div><div class="bigres">${b.res==='yes'?'YES':'NO'}.</div><span class="pill">Called it: ${esc(w.join(', ')||'nobody')}</span>${myWin>0?`<div class="win">+${myWin} BB WINNINGS</div>`:''}<div style="margin-top:8px;position:relative"><i>${esc(b.line||'')}</i>${b.fo?`<div style="margin-top:6px">Owed: <b>${esc(b.fo)}</b></div>`:''}<div class="row" style="margin-top:12px;align-items:center;position:relative">${qrFor(crew().code)?`<img src="${qrFor(crew().code)}" alt="Join code QR" style="width:88px;height:88px;background:#fff;padding:5px;border-radius:10px;flex:none">`:''}<div style="flex:1"><div class="tag" style="color:#ffe082">JOIN THE CREW</div><div style="font-size:22px;font-weight:900;letter-spacing:2px">${esc(crew().code||'')}</div><div style="color:#fff9;font-size:12px">thebet.website · 18+</div></div></div><div class="sub" style="color:#fff9;margin-top:8px">${esc(crew().name)}</div></div></div><div class="row"><button onclick="copyCard('${b.id}')">Copy card</button><button class="g" onclick="copyRecruit('${b.id}')">Recruit</button><button class="g" onclick="mailCard('${b.id}')">Email it</button></div>`}
 return h+`<div class="sub" style="text-align:right;margin:8px 0 0"><a href="#" onclick="report('${b.id}');return false" style="color:var(--mut)">Report</a></div></div>`}
function render(){
 const app=document.getElementById('app'),nav=document.getElementById('nav');let h='';nav.innerHTML='';
 const H=`<h1>The <b>Bet</b></h1>`;
 if(!sb){app.innerHTML=H+`<div class="card">Setup needed: paste your Supabase URL and anon key at the top of index.html. See README.md.</div>`;return}
 if(!loaded){app.innerHTML=H+`<div class="sub">Loading...</div>`;return}
 if(!me){app.innerHTML=H+`<div class="sub">Bragging rights only. BB are play money. Adults 18+.</div><div class="card">${signup?'<input id="nm" placeholder="Your name">':''}<input id="em" type="email" placeholder="Email"><input id="pw" type="password" placeholder="Password (8+ characters)" minlength="8" autocomplete="new-password">${signup?'<label style="display:block;margin:6px 0"><input type="checkbox" id="adult" style="width:auto;margin-right:8px">I am 18 or older. This app is adults only.</label>':''}<button onclick="auth()" style="width:100%">${signup?'Create account':'Sign in'}</button><div class="sub" style="margin:10px 0 0;text-align:center"><a href="#" onclick="signup=!signup;render();return false">${signup?'Have an account? Sign in':'New here? Create an account'}</a></div></div>`;return}
 if(!prof){app.innerHTML=H+`<div class="card">Your profile is not set up. Sign out and create an account with the 18+ box checked.<br><br><button onclick="out()">Sign out</button></div>`;return}
 if(!cid){app.innerHTML=H+`<div class="sub">Hi ${esc(prof.name)}. Join a crew or start one.</div><div class="card"><div class="tag">Have an invite code?</div><input id="jc" value="${esc(JOIN)}" placeholder="Invite code"><button onclick="joinCrew()" style="width:100%">Join crew</button></div><div class="card"><div class="tag">Start a new crew</div><input id="cn" placeholder="Crew name"><button class="g" onclick="mkCrew()" style="width:100%">Create crew</button></div>`;return}
 h+=`<h1><img src="assets/chip-192.png" alt="" style="width:30px;height:30px;border-radius:8px;vertical-align:-5px;margin-right:6px">The <b>Bet</b> · ${esc(crew().name)}${isPro()?'<span class="propill">PRO</span>':''}</h1><div class="sub">You are ${esc(nm(me))} · ${bal(me)} BB · ${ids().length} in crew · <a href="#" onclick="flip('s');return false">${spicyOn?'Spicy ON':'Friendly'}</a> · <a href="#" onclick="invite();return false">Invite</a></div>`;
 if(CR.length>1)h+=`<select onchange="pickCrew(this.value)">${CR.map(c=>`<option value="${c.id}"${c.id===cid?' selected':''}>${esc(c.name)}</option>`).join('')}</select>`;
 if(t==='bets'){const L=live();if(!L.length)h+=`<div class="card">No bets yet. Hit <b>New</b> or spin the <b>Wheel</b>.</div>`;L.forEach(b=>h+=card(b))}
 if(t==='new'){const o=ids().map(i=>`<option value="${i}"${i===me?' selected':''}>${esc(nm(i))}</option>`).join('');
  const fos=FF.length?FF:['20 push-ups, video proof','Buys the next round','One push-up on video whenever the winner calls','Wears the winner\'s jersey for a day','Posts an embarrassing photo'];
  h+=`<div class="card"><div class="tag">Who is it about?</div><select id="subj">${o}</select><div class="tag">The bet (yes/no question)</div><textarea id="q" rows="3" placeholder="Will Mike finish the marathon?">${esc(pre)}</textarea><div class="tag">Loser's forfeit (optional)</div><select id="fo"><option value="">No forfeit</option>${fos.map(f=>`<option>${esc(f)}</option>`).join('')}</select><input id="fo2" maxlength="140" placeholder="Or write your own forfeit">${isPro()?'<div class="sub">Pro: unlimited custom forfeits.</div>':`<div class="sub">Custom forfeits left: <b>${prof.forfeit_tokens|0}</b> — earn one back when a bet you made settles with 4+ players, or <a href="#" onclick="pwOpen=true;render();return false">go Pro for unlimited</a></div>`}<button style="width:100%" onclick="addBet()">Post bet</button><div class="sub" style="margin-top:8px">Crew members only. The subject can veto.</div></div>`}
 if(t==='board')h+=`<h2>Leaderboard</h2><div class="card">${ids().sort((a,b)=>bal(b)-bal(a)).map((i,k)=>`<div class="lb"><span>${k+1}. ${esc(nm(i))}</span><b>${bal(i)} BB</b></div>`).join('')}</div>`;
 if(t==='wheel')h+=`<h2>Fate Wheel</h2><div class="card"><div class="wheel" id="wh">Spin for a random bet</div><button style="width:100%" onclick="spin()">Spin</button><button id="use" class="g" style="width:100%;margin-top:8px;display:none" onclick="useIt()">Use this bet</button></div>`;
 if(t==='guide')h+=`<h2>Quick guide</h2><div class="card"><ol><li><b>Join:</b> sign up, confirm you are 18+, then join a crew with an invite code or start one. Tap Invite to text friends a link. Everyone starts with 100 BB (bragging bucks).</li><li><b>New bet:</b> write a yes/no question about a crew member, or spin the Wheel for one.</li><li><b>Forfeit:</b> pick a penalty or write your own. 10 custom forfeits free (Founding Crew got 100); earn one back when a bet you made settles with 4+ players. Pro is unlimited.</li><li><b>Pick:</b> stake some BB on Yes or No. You can't bet on yourself.</li><li><b>Settle:</b> someone other than the subject marks what happened. Winners split the pot by stake. If nobody was on the other side, everyone is refunded.</li><li><b>Veto:</b> the subject can delete a bet, and everyone is refunded.</li><li><b>Share:</b> settled bets make a card with a join QR + crew code. Copy, Recruit, or email it. Friendly/Spicy changes the trash talk.</li></ol><div class="row">${isPro()?'<button class="g" onclick="restorePro()">Pro: active — restore</button>':'<button onclick="pwOpen=true;render()">Upgrade to Pro ('+PRO_PRICE+')</button>'}<button class="g" onclick="out()">Sign out</button></div><div class="sub" style="margin-top:10px">Crew invite code: <b>${esc(crew().code||'')}</b>${crew().created_by===me?' · <a href="#" onclick="rotateCode();return false">rotate it</a>':''}. Anyone with the code can join — treat it like a password. BB are play money with no cash value: they can't be bought, cashed out, or traded. The Bet is 18+ only. Keep it to crew members who agreed to play.</div></div>`;
 app.innerHTML=h;
 if(pwOpen)app.innerHTML+=`<div class="paywall"><div><h3>The Bet <span class="propill" style="margin-left:0">PRO</span></h3><div class="sub" style="margin-bottom:10px"><b>${PRO_PRICE} once. Pro for life.</b> Unlimited custom forfeits — never count again.<br><br>Or skip Pro: earn one back every time a bet you made settles with 4+ players.<br>BB stay play money — you unlock a feature, never buy chips.</div><button style="width:100%" onclick="pwOpen=false;buyPro()">Unlock Pro</button><input id="rc" style="margin-top:8px" placeholder="Have a free code? Enter it"><button class="g" style="width:100%;margin-top:4px" onclick="redeem()">Redeem code</button><button class="g" style="width:100%;margin-top:8px" onclick="pwOpen=false;render()">Not now</button><div class="sub" style="margin-top:8px">18+. Already paid? <a href="#" onclick="pwOpen=false;restorePro();return false">Restore</a></div></div></div>`;
 nav.innerHTML=[['bets','Bets'],['new','New'],['board','Board'],['wheel','Wheel'],['guide','Guide']].map(x=>`<button class="${t===x[0]?'on':''}" onclick="tab('${x[0]}')">${x[1]}</button>`).join('')}
function soft(){const a=document.activeElement;if(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)&&document.getElementById('app').contains(a))return;render()}
async function load(){
 const ms=await sb.from('members').select('crew_id,crews(id,name,code,created_by)').eq('user_id',me);
 CR=(ms.data||[]).map(m=>m.crews).filter(Boolean);
 if(!CR.length){cid=null;loaded=true;render();return}
 if(!CR.find(c=>c.id===cid)){const s=LS.get('bet_crew');cid=CR.find(c=>c.id===s)?s:CR[0].id}
 const [a,b,k,c,f]=await Promise.all([sb.from('members').select('user_id,name').eq('crew_id',cid),sb.from('bets').select('*').eq('crew_id',cid).order('created_at',{ascending:false}),sb.from('picks').select('*'),sb.from('accepts').select('*'),sb.from('forfeits').select('label')]);
 M={};(a.data||[]).forEach(m=>M[m.user_id]=m.name);
 B=(b.data||[]).map(x=>({id:x.id,subj:x.subject,q:x.question,fo:x.forfeit,st:x.status,res:x.result,line:x.line,rep:x.reported,picks:{},acc:{}}));
 (k.data||[]).forEach(p=>{const x=B.find(y=>y.id===p.bet_id);if(x)x.picks[p.user_id]={side:p.side,amt:p.amt}});
 (c.data||[]).forEach(p=>{const x=B.find(y=>y.id===p.bet_id);if(x)x.acc[p.user_id]=1});
 FF=(f.data||[]).map(x=>x.label);
 loaded=true;soft()}
function listen(){if(bound)return;bound=true;let tm;
 sb.channel('bet-all').on('postgres_changes',{event:'*',schema:'public'},()=>{clearTimeout(tm);tm=setTimeout(load,300)}).subscribe()}
async function postCheckout(){
 if(CK!=='success')return;
 history.replaceState(null,'',location.pathname);
 for(let i=0;i<3;i++){const r=await sb.from('profiles').select('pro').eq('id',me).single();
  if(r.data&&r.data.pro){prof.pro=true;alert('Pro unlocked. Write your own forfeits.');render();return}
  await new Promise(r2=>setTimeout(r2,1500))}
 alert('Payment received — Pro should light up within a minute or two. If it does not, tap Guide > Restore.')}
function init(){
 if(!window.supabase||SUPABASE_URL.startsWith('PASTE')){render();return}
 sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
 sb.auth.onAuthStateChange((ev,s)=>setTimeout(async()=>{
  if(s){me=s.user.id;let r=await sb.from('profiles').select('*').eq('id',me).maybeSingle();prof=r.data;
   const m=s.user.user_metadata||{};
   if(!prof&&m.adult){const n=m.name||'Player';await sb.from('profiles').insert({id:me,name:n,adult:true});prof={id:me,name:n,adult:true}}
   await load();listen();postCheckout()}
  else{me=null;prof=null;cid=null;loaded=true;render()}},0));
 render()}
init();
