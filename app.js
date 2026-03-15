// ─── SUPABASE CONFIG ───────────────────────────────────────────────────────
const SUPABASE_URL = 'https://thhgntgmewwxuxbogwjh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRoaGdudGdtZXd3eHV4Ym9nd2poIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NTUwNzEsImV4cCI6MjA4OTEzMTA3MX0.kp3Tsf4He4hpj2MpOTaLI22VjZay9cTIubgJD4GDekc';
const ANTHROPIC_KEY = 'YOUR_ANTHROPIC_API_KEY'; // Replace after getting key

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── STATE ─────────────────────────────────────────────────────────────────
let currentUser = null;
let householdId = null;
let currentName = null;
let selectedLoginName = null;
let finPeriod = 'daily';
let modalSaveFn = null;

const catColors = {
  Food:'#CF5527', Groceries:'#998731', Transport:'#5FABC2',
  Shopping:'#7D2027', Bills:'#673C34', Travel:'#8A6040', Other:'#4A3828'
};

// ─── AUTH ───────────────────────────────────────────────────────────────────
async function sendOTP() {
  const email = document.getElementById('login-email').value.trim();
  if (!email) return showLoginMsg('Please enter your email');
  showLoginMsg('Sending code...');
  const { error } = await db.auth.signInWithOtp({ email });
  if (error) return showLoginMsg('Error: ' + error.message);
  document.getElementById('login-step1').style.display = 'none';
  document.getElementById('login-step2').style.display = 'block';
  showLoginMsg('Code sent! Check your email.');
}

async function verifyOTP() {
  const email = document.getElementById('login-email').value.trim();
  const token = document.getElementById('login-otp').value.trim();
  if (!token) return showLoginMsg('Enter the code');
  showLoginMsg('Verifying...');
  const { data, error } = await db.auth.verifyOtp({ email, token, type: 'email' });
  if (error) return showLoginMsg('Invalid code. Try again.');
  currentUser = data.user;
  const { data: profile } = await db.from('profiles').select('*').eq('id', currentUser.id).single();
  if (profile && profile.name) {
    currentName = profile.name;
    await initApp();
  } else {
    document.getElementById('login-step2').style.display = 'none';
    document.getElementById('login-step3').style.display = 'block';
    showLoginMsg('');
  }
}

function selectName(name, el) {
  selectedLoginName = name;
  document.querySelectorAll('.name-opt').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
}

async function saveName() {
  if (!selectedLoginName) return showLoginMsg('Please select your name');
  showLoginMsg('Setting up...');
  await db.from('profiles').upsert({ id: currentUser.id, name: selectedLoginName });
  currentName = selectedLoginName;
  await initApp();
}

function backToEmail() {
  document.getElementById('login-step2').style.display = 'none';
  document.getElementById('login-step1').style.display = 'block';
  showLoginMsg('');
}

function showLoginMsg(msg) {
  document.getElementById('login-msg').textContent = msg;
}

async function logout() {
  await db.auth.signOut();
  location.reload();
}

// ─── INIT ───────────────────────────────────────────────────────────────────
async function initApp() {
  document.getElementById('login-screen').classList.remove('active');
  document.getElementById('app-screen').classList.add('active');
  document.getElementById('app-date').textContent = new Date().toLocaleDateString('en-IN', { weekday:'long', month:'long', day:'numeric' });
  updateClock();
  setInterval(updateClock, 60000);
  await ensureHousehold();
  await loadAll();
}

function updateClock() {
  const now = new Date();
  document.getElementById('status-time').textContent =
    now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
}

async function ensureHousehold() {
  let { data } = await db.from('households').select('*').limit(1).single();
  if (!data) {
    const { data: newH } = await db.from('households').insert({}).select().single();
    data = newH;
  }
  householdId = data.id;
  document.getElementById('b-pts').textContent = data.bhakthi_pts || 0;
  document.getElementById('p-pts').textContent = data.prithvi_pts || 0;
  updateLeaderboard(data.bhakthi_pts || 0, data.prithvi_pts || 0);
}

async function loadAll() {
  await Promise.all([loadChores(), loadRituals(), loadGrocery(), loadWishlist(), loadFinances()]);
}

// ─── SCORES ─────────────────────────────────────────────────────────────────
async function addPoints(who, pts) {
  const field = who === 'b' ? 'bhakthi_pts' : 'prithvi_pts';
  const { data } = await db.from('households').select(field).eq('id', householdId).single();
  const current = data[field] || 0;
  await db.from('households').update({ [field]: current + pts }).eq('id', householdId);
  document.getElementById(who === 'b' ? 'b-pts' : 'p-pts').textContent = current + pts;
  const bPts = parseInt(document.getElementById('b-pts').textContent);
  const pPts = parseInt(document.getElementById('p-pts').textContent);
  updateLeaderboard(bPts, pPts);
}

async function deductPoints(who, pts) {
  const field = who === 'b' ? 'bhakthi_pts' : 'prithvi_pts';
  const { data } = await db.from('households').select(field).eq('id', householdId).single();
  const current = data[field] || 0;
  if (current < pts) return false;
  await db.from('households').update({ [field]: current - pts }).eq('id', householdId);
  document.getElementById(who === 'b' ? 'b-pts' : 'p-pts').textContent = current - pts;
  return true;
}

function updateLeaderboard(bPts, pPts) {
  const el = document.getElementById('dash-leader');
  if (!el) return;
  const diff = Math.abs(bPts - pPts);
  let msg = bPts === 0 && pPts === 0 ? 'No points yet — get going!' :
    bPts === pPts ? "It's a tie! Neck and neck" :
    bPts > pPts ? `Bhakthi is leading by ${diff} pts!` : `Prithvi is leading by ${diff} pts!`;
  const bg = bPts >= pPts ? 'var(--burnt)' : 'var(--crimson)';
  el.innerHTML = `<div class="leader-banner" style="background:${bg}">${msg}</div>`;
  const bc = document.getElementById('b-card');
  const pc = document.getElementById('p-card');
  bc.classList.toggle('leading', bPts > pPts);
  pc.classList.toggle('leading', pPts > bPts);
  document.querySelectorAll('.score-crown').forEach(e => e.remove());
  if (bPts > pPts) { const c = document.createElement('div'); c.className = 'score-crown'; c.textContent = '👑'; bc.appendChild(c); }
  else if (pPts > bPts) { const c = document.createElement('div'); c.className = 'score-crown'; c.textContent = '👑'; pc.appendChild(c); }
}

// ─── CHORES ─────────────────────────────────────────────────────────────────
async function loadChores() {
  const { data } = await db.from('chores').select('*').eq('household_id', householdId).order('created_at');
  renderChoresList(data || []);
}

function renderChoresList(chores) {
  const bc = document.getElementById('b-chores');
  const pc = document.getElementById('p-chores');
  const dc = document.getElementById('dash-chores');
  const cc = document.getElementById('dash-claimable');
  const cs = document.getElementById('dash-claimable-section');
  if (bc) { bc.innerHTML = ''; chores.filter(c => c.owner === 'b').forEach(c => bc.appendChild(choreCard(c, false))); }
  if (pc) { pc.innerHTML = ''; chores.filter(c => c.owner === 'p').forEach(c => pc.appendChild(choreCard(c, false))); }
  if (dc) {
    dc.innerHTML = '';
    const active = chores.filter(c => !c.claimable && !c.done);
    if (!active.length) dc.innerHTML = '<div class="empty-state">All chores done for today! 🎉</div>';
    else active.forEach(c => dc.appendChild(choreCard(c, true)));
  }
  const claimable = chores.filter(c => c.claimable && !c.done);
  if (cs) cs.style.display = claimable.length ? 'block' : 'none';
  if (cc) { cc.innerHTML = ''; claimable.forEach(c => cc.appendChild(claimableCard(c))); }
}

function choreCard(c, showOwner) {
  const div = document.createElement('div');
  div.className = 'card' + (c.done ? ' done' : '');
  const row = document.createElement('div'); row.className = 'row';
  const btn = document.createElement('div');
  btn.className = 'done-btn' + (c.done ? ' checked' : '');
  if (!c.done && !c.claimable) btn.onclick = () => markChoreDone(c.id, c.owner, c.pts);
  const info = document.createElement('div'); info.className = 'info';
  const name = document.createElement('div'); name.className = 'item-name' + (c.done ? ' done' : ''); name.textContent = c.name;
  const meta = document.createElement('div'); meta.className = 'item-meta';
  meta.textContent = 'By ' + c.deadline + (showOwner ? ' · ' + (c.owner === 'b' ? 'Bhakthi' : 'Prithvi') : '');
  info.appendChild(name); info.appendChild(meta);
  const right = document.createElement('div'); right.className = 'right';
  const badge = document.createElement('div'); badge.className = 'pts-badge ' + (c.owner === 'b' ? 'pts-b' : 'pts-p'); badge.textContent = c.pts + ' pts';
  const tag = document.createElement('div'); tag.className = 'tag ' + c.freq; tag.textContent = c.freq;
  right.appendChild(badge); right.appendChild(tag);
  row.appendChild(btn); row.appendChild(info); row.appendChild(right); div.appendChild(row); return div;
}

function claimableCard(c) {
  const div = document.createElement('div'); div.className = 'card claimable';
  const row = document.createElement('div'); row.className = 'row';
  const info = document.createElement('div'); info.className = 'info';
  const name = document.createElement('div'); name.className = 'item-name'; name.textContent = c.name;
  const meta = document.createElement('div'); meta.className = 'item-meta urgent';
  meta.textContent = 'Deadline passed · was ' + (c.owner === 'b' ? 'Bhakthi' : 'Prithvi') + "'s";
  info.appendChild(name); info.appendChild(meta);
  const right = document.createElement('div'); right.className = 'right';
  const badge = document.createElement('div'); badge.className = 'pts-badge pts-b'; badge.textContent = c.pts + ' pts';
  const cb = document.createElement('button'); cb.className = 'action-btn btn-claim'; cb.textContent = 'Claim it!';
  cb.onclick = () => claimChore(c.id, c.owner, c.pts);
  right.appendChild(badge); right.appendChild(cb);
  row.appendChild(info); row.appendChild(right); div.appendChild(row); return div;
}

async function markChoreDone(id, owner, pts) {
  await db.from('chores').update({ done: true }).eq('id', id);
  await addPoints(owner, pts);
  await loadChores();
  showToast('+' + pts + ' pts for ' + (owner === 'b' ? 'Bhakthi' : 'Prithvi') + '!');
}

async function claimChore(id, originalOwner, pts) {
  await db.from('chores').update({ done: true, claimable: false }).eq('id', id);
  const claimedBy = originalOwner === 'b' ? 'p' : 'b';
  await addPoints(claimedBy, pts);
  await loadChores();
  showToast('Claimed! +' + pts + ' pts');
}

// ─── RITUALS ────────────────────────────────────────────────────────────────
async function loadRituals() {
  const { data } = await db.from('rituals').select('*').eq('household_id', householdId).order('created_at');
  renderRitualsList(data || []);
}

function renderRitualsList(rituals) {
  const rl = document.getElementById('rituals-list');
  const dr = document.getElementById('dash-rituals');
  if (rl) { rl.innerHTML = ''; rituals.forEach(r => rl.appendChild(ritualCard(r))); }
  if (dr) {
    dr.innerHTML = '';
    const active = rituals.filter(r => !(r.b_done && r.p_done));
    if (!active.length) dr.innerHTML = '<div class="empty-state">All rituals completed! 🌟</div>';
    else active.forEach(r => dr.appendChild(ritualCard(r)));
  }
}

function ritualCard(r) {
  const div = document.createElement('div');
  div.className = 'card ritual-card' + (r.b_done && r.p_done ? ' done' : '') + (r.pending_confirm ? ' pending' : '');
  const row = document.createElement('div'); row.className = 'row';
  const info = document.createElement('div'); info.className = 'info';
  const name = document.createElement('div'); name.className = 'item-name'; name.textContent = r.name;
  const meta = document.createElement('div');
  if (r.b_done && r.p_done) { meta.className = 'item-meta'; meta.textContent = 'Both done! Points awarded ✓'; }
  else if (r.pending_confirm) { meta.className = 'item-meta confirm-meta'; meta.textContent = (r.initiator === 'b' ? 'Prithvi' : 'Bhakthi') + ' — confirm you did this too!'; }
  else { meta.className = 'item-meta ritual-meta'; meta.textContent = 'Both mark done · ' + r.pts + ' pts each'; }
  info.appendChild(name); info.appendChild(meta);
  const right = document.createElement('div'); right.className = 'right';
  const badge = document.createElement('div'); badge.className = 'pts-badge pts-both'; badge.textContent = r.pts + ' pts each';
  const tag = document.createElement('div'); tag.className = 'tag ' + r.freq; tag.textContent = r.freq;
  right.appendChild(badge); right.appendChild(tag);
  if (!r.b_done && !r.p_done && !r.pending_confirm) {
    const brow = document.createElement('div'); brow.className = 'btn-row';
    const mb = document.createElement('button'); mb.className = 'action-btn btn-bhakthi'; mb.textContent = 'Bhakthi did it'; mb.onclick = () => markRitual(r.id, 'b', r.pts);
    const mp = document.createElement('button'); mp.className = 'action-btn btn-prithvi'; mp.textContent = 'Prithvi did it'; mp.onclick = () => markRitual(r.id, 'p', r.pts);
    brow.appendChild(mb); brow.appendChild(mp); right.appendChild(brow);
  } else if (r.pending_confirm) {
    const cf = document.createElement('button'); cf.className = 'action-btn btn-confirm'; cf.style.marginTop = '4px';
    cf.textContent = 'Confirm done!'; cf.onclick = () => confirmRitual(r.id, r.initiator, r.pts);
    right.appendChild(cf);
  }
  row.appendChild(info); row.appendChild(right); div.appendChild(row); return div;
}

async function markRitual(id, who, pts) {
  const field = who === 'b' ? 'b_done' : 'p_done';
  await db.from('rituals').update({ [field]: true, pending_confirm: true, initiator: who }).eq('id', id);
  await loadRituals();
  showToast('Waiting for ' + (who === 'b' ? 'Prithvi' : 'Bhakthi') + ' to confirm...');
}

async function confirmRitual(id, initiator, pts) {
  const otherField = initiator === 'b' ? 'p_done' : 'b_done';
  await db.from('rituals').update({ [otherField]: true, pending_confirm: false }).eq('id', id);
  await addPoints('b', pts);
  await addPoints('p', pts);
  await loadRituals();
  showToast('Both get +' + pts + ' pts! 🎉');
}

// ─── GROCERY ────────────────────────────────────────────────────────────────
async function loadGrocery() {
  const { data } = await db.from('grocery').select('*').eq('household_id', householdId).order('created_at');
  renderGroceryList(data || []);
}

function renderGroceryList(items) {
  const gl = document.getElementById('grocery-list'); if (!gl) return;
  gl.innerHTML = '';
  items.forEach(item => {
    const div = document.createElement('div'); div.className = 'card';
    const row = document.createElement('div'); row.className = 'row';
    const check = document.createElement('div'); check.className = 'g-check' + (item.checked ? ' checked' : '');
    check.onclick = () => toggleGrocery(item.id, item.checked);
    const name = document.createElement('div'); name.className = 'item-name' + (item.checked ? ' done' : ''); name.style.flex = '1'; name.textContent = item.name;
    const qty = document.createElement('div'); qty.className = 'tag weekly'; qty.textContent = item.qty;
    row.appendChild(check); row.appendChild(name); row.appendChild(qty); div.appendChild(row); gl.appendChild(div);
  });
}

async function toggleGrocery(id, current) {
  await db.from('grocery').update({ checked: !current }).eq('id', id);
  await loadGrocery();
}

// ─── WISHLIST ───────────────────────────────────────────────────────────────
async function loadWishlist() {
  const { data } = await db.from('wishlist').select('*').eq('household_id', householdId).order('created_at');
  renderWishlist(data || []);
}

function renderWishlist(items) {
  const wl = document.getElementById('wishlist-list'); if (!wl) return;
  wl.innerHTML = '';
  const sorted = [...items].sort((a, b) => {
    const o = { necessary: 0, canwait: 1, leisure: 2 };
    return (o[a.priority] - o[b.priority]) || (b.boosts - a.boosts);
  });
  sorted.forEach(item => {
    const div = document.createElement('div'); div.className = 'wish-card';
    const top = document.createElement('div'); top.className = 'wish-top';
    const name = document.createElement('div'); name.className = 'wish-name'; name.textContent = item.name;
    const price = document.createElement('div'); price.className = 'wish-price'; price.textContent = '₹' + item.price.toLocaleString();
    top.appendChild(name); top.appendChild(price);
    const bottom = document.createElement('div'); bottom.className = 'wish-bottom';
    const ptag = document.createElement('div'); ptag.className = 'priority-tag p-' + item.priority;
    ptag.textContent = item.priority === 'necessary' ? 'Extremely necessary' : item.priority === 'canwait' ? 'Can wait' : 'Leisure';
    const brow = document.createElement('div'); brow.className = 'boost-row';
    const bbtn = document.createElement('button'); bbtn.className = 'boost-btn'; bbtn.textContent = 'Boost (10 pts)'; bbtn.onclick = () => boostWish(item.id);
    const bl = document.createElement('div'); bl.className = 'boost-label'; bl.textContent = item.boosts > 0 ? item.boosts + ' boost' + (item.boosts > 1 ? 's' : '') : '';
    brow.appendChild(bbtn); brow.appendChild(bl);
    bottom.appendChild(ptag); bottom.appendChild(brow);
    div.appendChild(top); div.appendChild(bottom); wl.appendChild(div);
  });
}

async function boostWish(id) {
  const bPts = parseInt(document.getElementById('b-pts').textContent);
  const pPts = parseInt(document.getElementById('p-pts').textContent);
  const who = bPts >= pPts ? 'b' : 'p';
  const ok = await deductPoints(who, 10);
  if (!ok) return showToast('Not enough points!');
  const { data } = await db.from('wishlist').select('boosts').eq('id', id).single();
  await db.from('wishlist').update({ boosts: (data.boosts || 0) + 1 }).eq('id', id);
  await loadWishlist();
  showToast('Item boosted up the list!');
}

// ─── FINANCES ───────────────────────────────────────────────────────────────
async function loadFinances() {
  const now = new Date();
  let startDate;
  if (finPeriod === 'daily') {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  }
  const { data } = await db.from('expenses').select('*').eq('household_id', householdId).gte('created_at', startDate);
  renderFinances(data || []);
}

function renderFinances(expenses) {
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const el = document.getElementById('fin-total'); if (el) el.textContent = '₹' + total.toLocaleString();
  const pl = document.getElementById('fin-period-label'); if (pl) pl.textContent = finPeriod === 'daily' ? 'Today' : 'This month';
  const cats = {};
  expenses.forEach(e => { cats[e.category] = (cats[e.category] || 0) + e.amount; });
  const topCat = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
  const tc = document.getElementById('fin-top'); if (tc) tc.textContent = topCat ? topCat[0] : '—';
  const cl = document.getElementById('cat-list'); if (!cl) return; cl.innerHTML = '';
  const max = Math.max(...Object.values(cats), 1);
  Object.entries(cats).sort((a, b) => b[1] - a[1]).forEach(([cat, amt]) => {
    const row = document.createElement('div'); row.className = 'cat-row';
    const dot = document.createElement('div'); dot.className = 'cat-dot'; dot.style.background = catColors[cat] || '#888';
    const nm = document.createElement('div'); nm.className = 'cat-name'; nm.textContent = cat;
    const bw = document.createElement('div'); bw.className = 'cat-bar-wrap';
    const bar = document.createElement('div'); bar.className = 'cat-bar';
    bar.style.width = Math.round((amt / max) * 100) + '%'; bar.style.background = catColors[cat] || '#888';
    bw.appendChild(bar);
    const amount = document.createElement('div'); amount.className = 'cat-amt'; amount.textContent = '₹' + amt.toLocaleString();
    row.appendChild(dot); row.appendChild(nm); row.appendChild(bw); row.appendChild(amount); cl.appendChild(row);
  });
}

async function setPeriod(p, btn) {
  finPeriod = p;
  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  await loadFinances();
}

// ─── FREE PASS ───────────────────────────────────────────────────────────────
async function useFreePass() {
  const who = currentName === 'Bhakthi' ? 'b' : 'p';
  const ok = await deductPoints(who, 20);
  if (!ok) return showToast('Need 20 pts to use a free pass!');
  showToast('Free pass used! One chore skipped. 🎉');
}

// ─── TABS ────────────────────────────────────────────────────────────────────
function showTab(tab, btn) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  if (btn) btn.classList.add('active');
  if (tab === 'finances') loadFinances();
}

// ─── MODALS ──────────────────────────────────────────────────────────────────
function openModal(type) {
  const title = document.getElementById('modal-title');
  const body = document.getElementById('modal-body');
  if (type === 'chore') {
    title.textContent = 'Add chore';
    body.innerHTML = `<input id="m-name" placeholder="Chore name"><div class="modal-row"><input id="m-pts" type="number" placeholder="Points" min="1"><select id="m-owner"><option value="b">Bhakthi</option><option value="p">Prithvi</option></select></div><div class="modal-row"><select id="m-freq"><option value="daily">Daily</option><option value="weekly">Weekly</option></select><input id="m-deadline" placeholder="Deadline e.g. 8:00 PM"></div>`;
    modalSaveFn = async () => {
      const n = document.getElementById('m-name').value.trim(); if (!n) return;
      await db.from('chores').insert({ household_id: householdId, name: n, owner: document.getElementById('m-owner').value, pts: parseInt(document.getElementById('m-pts').value) || 5, freq: document.getElementById('m-freq').value, deadline: document.getElementById('m-deadline').value || '9:00 PM' });
      await loadChores(); closeModal(); showToast('Chore added!');
    };
  } else if (type === 'ritual') {
    title.textContent = 'Add ritual';
    body.innerHTML = `<input id="m-name" placeholder="Ritual name"><div class="modal-row"><input id="m-pts" type="number" placeholder="Points each" min="1"><select id="m-freq"><option value="daily">Daily</option><option value="weekly">Weekly</option></select></div>`;
    modalSaveFn = async () => {
      const n = document.getElementById('m-name').value.trim(); if (!n) return;
      await db.from('rituals').insert({ household_id: householdId, name: n, pts: parseInt(document.getElementById('m-pts').value) || 8, freq: document.getElementById('m-freq').value });
      await loadRituals(); closeModal(); showToast('Ritual added!');
    };
  } else if (type === 'grocery') {
    title.textContent = 'Add grocery item';
    body.innerHTML = `<input id="m-name" placeholder="Item name"><input id="m-qty" placeholder="Quantity e.g. 500g">`;
    modalSaveFn = async () => {
      const n = document.getElementById('m-name').value.trim(); if (!n) return;
      await db.from('grocery').insert({ household_id: householdId, name: n, qty: document.getElementById('m-qty').value.trim() || '1' });
      await loadGrocery(); closeModal(); showToast('Added to grocery list!');
    };
  } else if (type === 'wish') {
    title.textContent = 'Add to wishlist';
    body.innerHTML = `<input id="m-name" placeholder="Item name"><div class="modal-row"><input id="m-price" type="number" placeholder="Price ₹"><select id="m-priority"><option value="necessary">Extremely necessary</option><option value="canwait">Can wait</option><option value="leisure">Leisure</option></select></div>`;
    modalSaveFn = async () => {
      const n = document.getElementById('m-name').value.trim(); if (!n) return;
      await db.from('wishlist').insert({ household_id: householdId, name: n, price: parseInt(document.getElementById('m-price').value) || 0, priority: document.getElementById('m-priority').value, boosts: 0 });
      await loadWishlist(); closeModal(); showToast('Added to wishlist!');
    };
  } else if (type === 'expense') {
    title.textContent = 'Add expense';
    body.innerHTML = `<input id="m-amt" type="number" placeholder="Amount ₹"><select id="m-cat"><option>Food</option><option>Groceries</option><option>Transport</option><option>Shopping</option><option>Bills</option><option>Travel</option><option>Other</option></select>`;
    modalSaveFn = async () => {
      const amt = parseInt(document.getElementById('m-amt').value) || 0; if (!amt) return;
      await db.from('expenses').insert({ household_id: householdId, amount: amt, category: document.getElementById('m-cat').value });
      await loadFinances(); closeModal(); showToast('Expense added!');
    };
  }
  document.getElementById('modal-bg').classList.add('open');
}

async function saveModal() { if (modalSaveFn) await modalSaveFn(); }
function closeModal() { document.getElementById('modal-bg').classList.remove('open'); }
function closeModalBg(e) { if (e.target === document.getElementById('modal-bg')) closeModal(); }

// ─── TOAST ───────────────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

// ─── AI AGENT ────────────────────────────────────────────────────────────────
function fillPrompt(text) { document.getElementById('agent-input').value = text; }

async function sendAgent() {
  const input = document.getElementById('agent-input');
  const msg = input.value.trim(); if (!msg) return;
  input.value = '';
  const msgs = document.getElementById('agent-msgs');
  const uDiv = document.createElement('div'); uDiv.className = 'msg user'; uDiv.textContent = msg; msgs.appendChild(uDiv);
  msgs.scrollTop = msgs.scrollHeight;
  const typing = document.getElementById('agent-typing'); typing.style.display = 'block';

  try {
    const { data: chores } = await db.from('chores').select('*').eq('household_id', householdId);
    const { data: rituals } = await db.from('rituals').select('*').eq('household_id', householdId);
    const { data: grocery } = await db.from('grocery').select('*').eq('household_id', householdId);
    const { data: wishlist } = await db.from('wishlist').select('*').eq('household_id', householdId);

    const systemPrompt = `You are the all-powerful AI agent for "Penny Lane" — a couples home management app for Bhakthi and Prithvi. You can make ANY change to the app.

Current app data: ${JSON.stringify({ chores, rituals, grocery, wishlist })}

The user said: "${msg}"

You can perform these actions by including ACTION blocks in your response:

DATA ACTIONS:
ACTION:{"type":"add_chore","name":"X","owner":"b or p","pts":5,"freq":"daily or weekly","deadline":"9:00 PM"}
ACTION:{"type":"add_ritual","name":"X","pts":5,"freq":"daily or weekly"}
ACTION:{"type":"add_grocery","name":"X","qty":"500g"}
ACTION:{"type":"add_wish","name":"X","price":1000,"priority":"necessary or canwait or leisure"}
ACTION:{"type":"add_expense","amount":500,"category":"Food"}
ACTION:{"type":"add_multiple_grocery","items":[{"name":"Milk","qty":"1L"},{"name":"Eggs","qty":"12"}]}

VISUAL ACTIONS:
ACTION:{"type":"change_colors","burnt":"#hex","crimson":"#hex","moss":"#hex","sky":"#hex","coffee":"#hex","sand":"#hex","bg":"#hex","bgCard":"#hex","bgSurface":"#hex","border":"#hex","textPrimary":"#hex","textSecondary":"#hex","textMuted":"#hex"}

LAYOUT ACTIONS:
ACTION:{"type":"reorder_dashboard","order":["leaderboard","claimable","rituals","chores"]}
ACTION:{"type":"rename_app","name":"New Name"}

For color changes: burnt=header/primary, crimson=secondary, moss=checkmarks/rituals, sky=claims/daily tags, coffee=weekly tags/boost. bg must be dark. textPrimary must be light readable color. sand=main text color on dark bg.

Reply helpfully in 1-2 sentences, then include ACTION blocks for any changes. You can include multiple ACTION blocks.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content: systemPrompt }] })
    });

    const data = await res.json();
    const reply = data.content[0].text;
    const displayText = reply.replace(/ACTION:\{[^}]+\}/g, '').trim();

    typing.style.display = 'none';
    const aDiv = document.createElement('div'); aDiv.className = 'msg ai'; aDiv.textContent = displayText || 'Done!'; msgs.appendChild(aDiv);
    msgs.scrollTop = msgs.scrollHeight;

    const actionMatches = [...reply.matchAll(/ACTION:(\{[^}]+\})/g)];
    for (const match of actionMatches) {
      try {
        const action = JSON.parse(match[1]);
        await executeAction(action);
      } catch (e) { console.error('Action parse error:', e); }
    }
  } catch (e) {
    typing.style.display = 'none';
    const aDiv = document.createElement('div'); aDiv.className = 'msg ai'; aDiv.textContent = 'Something went wrong. Try again!'; msgs.appendChild(aDiv);
  }
}

async function executeAction(action) {
  const r = document.documentElement;
  switch (action.type) {
    case 'add_chore':
      await db.from('chores').insert({ household_id: householdId, name: action.name, owner: action.owner || 'b', pts: action.pts || 5, freq: action.freq || 'daily', deadline: action.deadline || '9:00 PM' });
      await loadChores(); showToast('Chore added by AI!'); break;
    case 'add_ritual':
      await db.from('rituals').insert({ household_id: householdId, name: action.name, pts: action.pts || 8, freq: action.freq || 'daily' });
      await loadRituals(); showToast('Ritual added by AI!'); break;
    case 'add_grocery':
      await db.from('grocery').insert({ household_id: householdId, name: action.name, qty: action.qty || '1' });
      await loadGrocery(); showToast('Added to grocery!'); break;
    case 'add_multiple_grocery':
      for (const item of action.items) await db.from('grocery').insert({ household_id: householdId, name: item.name, qty: item.qty || '1' });
      await loadGrocery(); showToast('Groceries added!'); break;
    case 'add_wish':
      await db.from('wishlist').insert({ household_id: householdId, name: action.name, price: action.price || 0, priority: action.priority || 'canwait', boosts: 0 });
      await loadWishlist(); showToast('Added to wishlist!'); break;
    case 'add_expense':
      await db.from('expenses').insert({ household_id: householdId, amount: action.amount, category: action.category || 'Other' });
      await loadFinances(); showToast('Expense added!'); break;
    case 'change_colors':
      if (action.burnt) r.style.setProperty('--burnt', action.burnt);
      if (action.crimson) r.style.setProperty('--crimson', action.crimson);
      if (action.moss) r.style.setProperty('--moss', action.moss);
      if (action.sky) r.style.setProperty('--sky', action.sky);
      if (action.coffee) r.style.setProperty('--coffee', action.coffee);
      if (action.sand) r.style.setProperty('--sand', action.sand);
      if (action.bg) r.style.setProperty('--bg', action.bg);
      if (action.bgCard) r.style.setProperty('--bg-card', action.bgCard);
      if (action.bgSurface) r.style.setProperty('--bg-surface', action.bgSurface);
      if (action.border) r.style.setProperty('--border', action.border);
      if (action.textPrimary) r.style.setProperty('--text-primary', action.textPrimary);
      if (action.textSecondary) r.style.setProperty('--text-secondary', action.textSecondary);
      if (action.textMuted) r.style.setProperty('--text-muted', action.textMuted);
      if (action.burnt) { document.getElementById('app-header').style.background = action.burnt; document.querySelector('.status-bar').style.background = action.burnt; }
      showToast('Theme updated! 🎨'); break;
    case 'rename_app':
      document.querySelector('.app-name').textContent = action.name;
      document.querySelector('.login-logo').textContent = action.name;
      document.title = action.name;
      showToast('App renamed!'); break;
    case 'reorder_dashboard':
      reorderDashboard(action.order); break;
  }
}

function reorderDashboard(order) {
  const dashboard = document.getElementById('tab-dashboard');
  const map = {
    leaderboard: () => { const s = document.createElement('div'); s.innerHTML = '<div class="section-label">Leaderboard</div><div id="dash-leader"></div>'; return s; },
    chores: () => { const s = document.createElement('div'); s.innerHTML = '<div class="section-label">Today\'s chores</div><div id="dash-chores"></div>'; return s; },
    rituals: () => { const s = document.createElement('div'); s.innerHTML = '<div class="section-label">Today\'s rituals</div><div id="dash-rituals"></div>'; return s; },
    claimable: () => { const s = document.createElement('div'); s.id = 'dash-claimable-section'; s.style.display = 'none'; s.innerHTML = '<div class="section-label claim-label">Open to claim</div><div id="dash-claimable"></div>'; return s; }
  };
  dashboard.innerHTML = '';
  (order || ['leaderboard', 'chores', 'rituals', 'claimable']).forEach(key => { if (map[key]) dashboard.appendChild(map[key]()); });
  loadAll();
  showToast('Dashboard reordered!');
}

// ─── AUTO SESSION CHECK ───────────────────────────────────────────────────────
db.auth.getSession().then(({ data: { session } }) => {
  if (session) {
    currentUser = session.user;
    db.from('profiles').select('name').eq('id', currentUser.id).single().then(({ data }) => {
      if (data && data.name) { currentName = data.name; initApp(); }
      else {
        document.getElementById('login-step1').style.display = 'none';
        document.getElementById('login-step3').style.display = 'block';
        document.getElementById('login-screen').classList.add('active');
      }
    });
  }
});
