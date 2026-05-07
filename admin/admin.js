'use strict';

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const loginView   = $('#loginView');
const dashView    = $('#dashView');
const loginForm   = $('#loginForm');
const loginError  = $('#loginError');
const userBadge   = $('#userBadge');
const logoutBtn   = $('#logoutBtn');
const toastEl     = $('#toast');

let weddingData = null;

/* ---------- HTTP helper ---------- */
async function api(path, options = {}) {
  const opts = Object.assign(
    { credentials: 'same-origin', headers: {} },
    options
  );
  if (opts.body && typeof opts.body !== 'string') {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, opts);
  let body = null;
  try { body = await res.json(); } catch {}
  if (!res.ok) {
    const msg = (body && body.error) || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return body;
}

/* ---------- Toast ---------- */
let toastTimer = null;
function toast(msg, type = 'ok') {
  toastEl.textContent = msg;
  toastEl.classList.toggle('is-error', type === 'error');
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2400);
}

/* ---------- Path helpers ---------- */
function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}
function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (o[keys[i]] == null || typeof o[keys[i]] !== 'object') o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

/* ---------- Auth flow ---------- */
function showLogin() {
  loginView.hidden = false;
  dashView.hidden = true;
  loginError.hidden = true;
}
function showDashboard(username) {
  loginView.hidden = true;
  dashView.hidden = false;
  userBadge.textContent = username;
}

async function checkAuth() {
  try {
    const me = await api('/api/admin/me');
    if (me.authenticated) {
      showDashboard(me.username);
      await loadData();
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  const fd = new FormData(loginForm);
  const btn = loginForm.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Loading…';
  try {
    const res = await api('/api/admin/login', {
      method: 'POST',
      body: { username: fd.get('username'), password: fd.get('password') }
    });
    showDashboard(res.username);
    loginForm.reset();
    await loadData();
  } catch (err) {
    loginError.textContent = err.message;
    loginError.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Login';
  }
});

logoutBtn.addEventListener('click', async () => {
  try { await api('/api/admin/logout', { method: 'POST' }); } catch {}
  weddingData = null;
  showLogin();
});

/* ---------- Tabs ---------- */
$$('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    $$('.tab').forEach(t => t.classList.toggle('is-active', t === tab));
    $$('.panel').forEach(p => p.classList.toggle('is-active', p.dataset.panel === target));
    if (target === 'comments') renderComments();
  });
});

/* ---------- Load data ---------- */
async function loadData() {
  try {
    weddingData = await api('/api/admin/data');
    bindAll();
    renderStory();
    renderBank();
    renderComments();
  } catch (err) {
    toast('Gagal memuat data: ' + err.message, 'error');
  }
}

/* ---------- Generic bind: input[data-bind="path.to.field"] ---------- */
function bindAll() {
  $$('[data-bind]').forEach(el => {
    const val = getPath(weddingData, el.dataset.bind);
    el.value = val == null ? '' : val;
  });
  $$('[data-preview]').forEach(img => {
    const val = getPath(weddingData, img.dataset.preview);
    if (val) img.src = val; else img.removeAttribute('src');
  });
  // Live preview update for photo URLs
  $$('input[data-bind$=".photo"]').forEach(input => {
    input.oninput = () => {
      const preview = $(`[data-preview="${input.dataset.bind}"]`);
      if (preview) {
        if (input.value) preview.src = input.value;
        else preview.removeAttribute('src');
      }
    };
  });
}

function collectBinds(prefix) {
  const out = {};
  $$('[data-bind]').forEach(el => {
    const path = el.dataset.bind;
    if (!path.startsWith(prefix + '.') && path !== prefix) return;
    setPath(out, path, el.value);
  });
  return getPath(out, prefix);
}

/* ---------- Our Story (dynamic list) ---------- */
const storyList = $('#storyList');

function renderStory() {
  const items = Array.isArray(weddingData.ourStory) ? weddingData.ourStory : [];
  storyList.innerHTML = items.map((s, i) => storyRowHTML(s, i)).join('') ||
    '<p class="empty">Belum ada story. Klik "+ Tambah Story" untuk menambah.</p>';
}

function storyRowHTML(s = {}, i) {
  return `
    <div class="row-card" data-story-row="${i}">
      <div class="row-card__head">
        <span class="row-card__index">Story #${i + 1}</span>
        <button class="btn btn--danger" data-story-remove="${i}">Hapus</button>
      </div>
      <div class="row-card__grid">
        <label class="field"><span>Year</span><input data-story-field="year" data-story-i="${i}" value="${escapeAttr(s.year || '')}" /></label>
        <label class="field"><span>Title</span><input data-story-field="title" data-story-i="${i}" value="${escapeAttr(s.title || '')}" /></label>
        <label class="field full"><span>Description</span><textarea rows="2" data-story-field="description" data-story-i="${i}">${escapeHtml(s.description || '')}</textarea></label>
        <label class="field full"><span>Image URL</span><input data-story-field="image" data-story-i="${i}" value="${escapeAttr(s.image || '')}" /></label>
      </div>
    </div>
  `;
}

function collectStory() {
  const rows = $$('[data-story-row]');
  return rows.map(row => {
    const i = row.dataset.storyRow;
    return {
      year:        $(`[data-story-field="year"][data-story-i="${i}"]`, row)?.value || '',
      title:       $(`[data-story-field="title"][data-story-i="${i}"]`, row)?.value || '',
      description: $(`[data-story-field="description"][data-story-i="${i}"]`, row)?.value || '',
      image:       $(`[data-story-field="image"][data-story-i="${i}"]`, row)?.value || ''
    };
  });
}

storyList.addEventListener('click', (e) => {
  const removeBtn = e.target.closest('[data-story-remove]');
  if (removeBtn) {
    const i = +removeBtn.dataset.storyRemove;
    weddingData.ourStory = collectStory();
    weddingData.ourStory.splice(i, 1);
    renderStory();
  }
});

$('[data-action="story-add"]').addEventListener('click', () => {
  weddingData.ourStory = collectStory();
  weddingData.ourStory.push({ year: '', title: '', description: '', image: '' });
  renderStory();
});

/* ---------- Bank (dynamic list) ---------- */
const bankList = $('#bankList');

function renderBank() {
  const items = Array.isArray(weddingData.bank) ? weddingData.bank : [];
  bankList.innerHTML = items.map((b, i) => bankRowHTML(b, i)).join('') ||
    '<p class="empty">Belum ada rekening. Klik "+ Tambah Bank" untuk menambah.</p>';
}

function bankRowHTML(b = {}, i) {
  return `
    <div class="row-card" data-bank-row="${i}">
      <div class="row-card__head">
        <span class="row-card__index">Bank #${i + 1}</span>
        <button class="btn btn--danger" data-bank-remove="${i}">Hapus</button>
      </div>
      <div class="row-card__grid">
        <label class="field"><span>Bank</span><input data-bank-field="name" data-bank-i="${i}" value="${escapeAttr(b.name || '')}" /></label>
        <label class="field"><span>Atas Nama</span><input data-bank-field="atasNama" data-bank-i="${i}" value="${escapeAttr(b.atasNama || '')}" /></label>
        <label class="field"><span>Nomor (raw)</span><input data-bank-field="number" data-bank-i="${i}" value="${escapeAttr(b.number || '')}" /></label>
        <label class="field"><span>Nomor (formatted)</span><input data-bank-field="numberFormatted" data-bank-i="${i}" value="${escapeAttr(b.numberFormatted || '')}" /></label>
      </div>
    </div>
  `;
}

function collectBank() {
  const rows = $$('[data-bank-row]');
  return rows.map(row => {
    const i = row.dataset.bankRow;
    return {
      name:            $(`[data-bank-field="name"][data-bank-i="${i}"]`, row)?.value || '',
      number:          $(`[data-bank-field="number"][data-bank-i="${i}"]`, row)?.value || '',
      numberFormatted: $(`[data-bank-field="numberFormatted"][data-bank-i="${i}"]`, row)?.value || '',
      atasNama:        $(`[data-bank-field="atasNama"][data-bank-i="${i}"]`, row)?.value || ''
    };
  });
}

bankList.addEventListener('click', (e) => {
  const removeBtn = e.target.closest('[data-bank-remove]');
  if (removeBtn) {
    const i = +removeBtn.dataset.bankRemove;
    weddingData.bank = collectBank();
    weddingData.bank.splice(i, 1);
    renderBank();
  }
});

$('[data-action="bank-add"]').addEventListener('click', () => {
  weddingData.bank = collectBank();
  weddingData.bank.push({ name: '', number: '', numberFormatted: '', atasNama: '' });
  renderBank();
});

/* ---------- Comments ---------- */
const commentsList  = $('#commentsList');
const commentsStats = $('#commentsStats');

function renderComments() {
  const list = (weddingData?.comments || []).slice().sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  let hadir = 0, absen = 0;
  for (const c of list) {
    if (c.attend === 'datang') hadir++;
    else if (c.attend === 'absen') absen++;
  }
  commentsStats.innerHTML = `
    <div class="stat-pill"><span class="stat-pill__num">${hadir}</span><span class="stat-pill__lbl">Attend</span></div>
    <div class="stat-pill"><span class="stat-pill__num">${absen}</span><span class="stat-pill__lbl">Absent</span></div>
    <div class="stat-pill"><span class="stat-pill__num">${list.length}</span><span class="stat-pill__lbl">Total</span></div>
  `;
  commentsList.innerHTML = list.length === 0
    ? '<p class="empty">Belum ada ucapan.</p>'
    : list.map(c => `
      <article class="comment">
        <div class="comment__body">
          <div class="comment__head">
            <span class="comment__name">${escapeHtml(c.name)}</span>
            <span class="comment__attend ${c.attend === 'absen' ? 'absen' : ''}">${c.attend === 'absen' ? 'Absent' : 'Attend'}</span>
            <span class="comment__time">${formatTime(c.timestamp)}</span>
          </div>
          <p class="comment__msg">${escapeHtml(c.message)}</p>
        </div>
        <button class="btn btn--danger" data-comment-delete="${escapeAttr(c.id || '')}">Hapus</button>
      </article>
    `).join('');
}

commentsList.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-comment-delete]');
  if (!btn) return;
  const id = btn.dataset.commentDelete;
  if (!id) return;
  if (!confirm('Hapus komentar ini?')) return;
  btn.disabled = true;
  try {
    await api('/api/admin/comments/' + encodeURIComponent(id), { method: 'DELETE' });
    weddingData.comments = (weddingData.comments || []).filter(c => c.id !== id);
    renderComments();
    toast('Komentar dihapus');
  } catch (err) {
    toast('Gagal hapus: ' + err.message, 'error');
    btn.disabled = false;
  }
});

$('[data-action="comments-refresh"]').addEventListener('click', loadData);

/* ---------- Save handlers ---------- */
async function saveSection(payload, label) {
  const btns = $$('[data-save]');
  btns.forEach(b => b.disabled = true);
  try {
    const res = await api('/api/admin/data', { method: 'PUT', body: payload });
    weddingData = res.data;
    bindAll();
    renderStory();
    renderBank();
    toast(label + ' tersimpan');
  } catch (err) {
    toast('Gagal simpan ' + label + ': ' + err.message, 'error');
  } finally {
    btns.forEach(b => b.disabled = false);
  }
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-save]');
  if (!btn) return;
  const which = btn.dataset.save;

  if (which === 'mempelai') {
    return saveSection({ mempelai: collectBinds('mempelai') }, 'Mempelai');
  }
  if (which === 'alamat') {
    return saveSection({ alamat: collectBinds('alamat') }, 'Alamat');
  }
  if (which === 'event') {
    return saveSection({ event: collectBinds('event') }, 'Event');
  }
  if (which === 'social') {
    return saveSection({ socialMedia: collectBinds('socialMedia') }, 'Social Media');
  }
  if (which === 'story') {
    return saveSection({ ourStory: collectStory() }, 'Our Story');
  }
  if (which === 'bank') {
    return saveSection({ bank: collectBank() }, 'Bank');
  }
});

/* ---------- Utils ---------- */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
function escapeAttr(s) { return escapeHtml(s); }
function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ---------- Init ---------- */
checkAuth();
