'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { encryptGuestName, decryptGuestToken } = require('./lib/guest-token');

const app = express();
app.set('trust proxy', true);   // hormati X-Forwarded-Proto dari reverse proxy (Caddy/nginx) untuk URL https
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

// Kunci enkripsi link tamu. Kalau var khususnya kosong, turunkan dari kredensial
// admin supaya server tetap jalan — tapi link jadi ikut berubah bila password diganti.
const GUEST_SECRET = process.env.GUEST_LINK_SECRET || (ADMIN_USER + '|' + ADMIN_PASS);
const GUEST_SECRET_IS_DEFAULT = !process.env.GUEST_LINK_SECRET;
const GUEST_NAME_MAX  = 100;
const GUEST_BATCH_MAX = 300;

const ROOT       = __dirname;
const DATA_PATH  = path.join(ROOT, 'data', 'wedding.json');
const BACKUP_DIR = path.join(ROOT, 'data', 'backup');
const ADMIN_DIR  = path.join(ROOT, 'admin');
const INDEX_PATH = path.join(ROOT, 'index.html');
const UPLOAD_DIR = path.join(ROOT, 'assets', 'uploads');
const UPLOAD_MAX = 8 * 1024 * 1024;            // 8 MB (gambar)
const VIDEO_MAX  = 60 * 1024 * 1024;           // 60 MB (video)
const AUDIO_MAX  = 20 * 1024 * 1024;           // 20 MB (audio)
const UPLOAD_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const VIDEO_TYPES  = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/ogg': 'ogv', 'video/quicktime': 'mov' };
const AUDIO_TYPES  = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a' };

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const sessions = new Map();

app.use(cors());

// Image upload (admin only). Registered BEFORE the global 256kb JSON parser so
// its own larger body limit applies to base64 image payloads.
app.post('/api/admin/upload', requireAuth, express.json({ limit: '85mb' }), handleUpload);

app.use(express.json({ limit: '256kb' }));

let writeQueue = Promise.resolve();

async function readData() {
  const raw = await fs.readFile(DATA_PATH, 'utf8');
  return JSON.parse(raw);
}

function timestamp() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return (
    d.getFullYear() +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    '-' +
    p(d.getHours()) +
    p(d.getMinutes()) +
    p(d.getSeconds())
  );
}

async function backupAndWrite(newData) {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  try {
    const current = await fs.readFile(DATA_PATH, 'utf8');
    const backupPath = path.join(BACKUP_DIR, `wedding-${timestamp()}.json`);
    await fs.writeFile(backupPath, current);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  await fs.writeFile(DATA_PATH, JSON.stringify(newData, null, 2));
}

function withWriteLock(fn) {
  const next = writeQueue.then(fn, fn);
  writeQueue = next.catch(() => {});
  return next;
}

/* ---------- session helpers ---------- */
function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    if (k) out[k] = v;
  }
  return out;
}

function createSession() {
  const id = crypto.randomBytes(24).toString('hex');
  sessions.set(id, { username: ADMIN_USER, expiresAt: Date.now() + SESSION_TTL_MS });
  return id;
}

function getSession(req) {
  const cookies = parseCookies(req);
  const id = cookies.admin_session;
  if (!id) return null;
  const s = sessions.get(id);
  if (!s) return null;
  if (s.expiresAt < Date.now()) {
    sessions.delete(id);
    return null;
  }
  return { id, ...s };
}

function setSessionCookie(res, id) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader('Set-Cookie',
    `admin_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie',
    'admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
}

function requireAuth(req, res, next) {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: 'Unauthorized' });
  req.session = s;
  next();
}

function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/* ---------- validation ---------- */
function validateComment(body) {
  if (!body || typeof body !== 'object') return 'Invalid request body';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const attend = body.attend;

  if (!name) return 'Field "name" wajib diisi';
  if (name.length > 50) return 'Field "name" maksimal 50 karakter';
  if (!message) return 'Field "message" wajib diisi';
  if (message.length > 300) return 'Field "message" maksimal 300 karakter';
  if (attend !== 'datang' && attend !== 'absen') {
    return 'Field "attend" harus "datang" atau "absen"';
  }
  return null;
}

function buildStats(comments) {
  let hadir = 0, absen = 0;
  for (const c of comments) {
    if (c.attend === 'datang') hadir++;
    else if (c.attend === 'absen') absen++;
  }
  return { hadir, absen, total: comments.length };
}

/* ---------- image upload (base64 data URL → file) ---------- */
async function handleUpload(req, res) {
  try {
    const data = req.body && typeof req.body.data === 'string' ? req.body.data : '';
    const m = /^data:([^;]+);base64,(.+)$/s.exec(data);
    if (!m) return res.status(400).json({ error: 'Field "data" harus berupa data URL base64' });
    const mime = m[1].toLowerCase();
    const ext  = UPLOAD_TYPES[mime] || VIDEO_TYPES[mime] || AUDIO_TYPES[mime];
    if (!ext) return res.status(400).json({ error: 'Tipe harus gambar (JPG/PNG/WebP/GIF), video (MP4/WebM/OGG/MOV), atau audio (MP3/OGG/WAV/M4A)' });

    const buf = Buffer.from(m[2], 'base64');
    if (!buf.length) return res.status(400).json({ error: 'File kosong' });
    const max = UPLOAD_TYPES[mime] ? UPLOAD_MAX : VIDEO_TYPES[mime] ? VIDEO_MAX : AUDIO_MAX;
    if (buf.length > max) return res.status(413).json({ error: `Ukuran maksimal ${Math.round(max / 1048576)} MB` });

    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const raw  = String((req.body && req.body.filename) || 'img');
    const base = raw.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-')
                    .replace(/^-+|-+$/g, '').slice(0, 40) || 'img';
    const name = `${base}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    await fs.writeFile(path.join(UPLOAD_DIR, name), buf);

    res.json({ ok: true, url: `/assets/uploads/${name}` });
  } catch (e) {
    console.error('POST /api/admin/upload error:', e);
    res.status(500).json({ error: 'Gagal mengunggah file' });
  }
}

/* ============== PUBLIC API ============== */

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/api/wedding', async (req, res) => {
  try {
    const data = await readData();
    const { comments, ...rest } = data;
    res.json(rest);
  } catch (e) {
    console.error('GET /api/wedding error:', e);
    res.status(500).json({ error: 'Failed to read data' });
  }
});

app.get('/api/comments', async (req, res) => {
  try {
    const data = await readData();
    const comments = Array.isArray(data.comments) ? data.comments : [];
    const sorted = comments.slice().sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    res.json({ comments: sorted, stats: buildStats(comments) });
  } catch (e) {
    console.error('GET /api/comments error:', e);
    res.status(500).json({ error: 'Failed to read comments' });
  }
});

app.post('/api/comments', async (req, res) => {
  const error = validateComment(req.body);
  if (error) return res.status(400).json({ error });

  try {
    const entry = await withWriteLock(async () => {
      const data = await readData();
      if (!Array.isArray(data.comments)) data.comments = [];

      const newEntry = {
        id: crypto.randomUUID(),
        name: req.body.name.trim().slice(0, 50),
        attend: req.body.attend,
        message: req.body.message.trim().slice(0, 300),
        timestamp: Date.now()
      };
      data.comments.push(newEntry);
      await backupAndWrite(data);
      return newEntry;
    });

    res.status(201).json({ ok: true, comment: entry });
  } catch (e) {
    console.error('POST /api/comments error:', e);
    res.status(500).json({ error: 'Failed to save comment' });
  }
});

/* ============== ADMIN AUTH ============== */

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Username & password wajib diisi' });
  }
  const okUser = timingSafeEqual(username, ADMIN_USER);
  const okPass = timingSafeEqual(password, ADMIN_PASS);
  if (!okUser || !okPass) {
    return res.status(401).json({ error: 'Username atau password salah' });
  }
  const id = createSession();
  setSessionCookie(res, id);
  res.json({ ok: true, username: ADMIN_USER });
});

app.post('/api/admin/logout', (req, res) => {
  const s = getSession(req);
  if (s) sessions.delete(s.id);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/admin/me', (req, res) => {
  const s = getSession(req);
  if (!s) return res.status(401).json({ authenticated: false });
  res.json({ authenticated: true, username: s.username });
});

/* ============== ADMIN DATA ============== */

app.get('/api/admin/data', requireAuth, async (req, res) => {
  try {
    const data = await readData();
    res.json(data);
  } catch (e) {
    console.error('GET /api/admin/data error:', e);
    res.status(500).json({ error: 'Failed to read data' });
  }
});

function isObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }

function validateAdminPayload(payload) {
  if (!isObject(payload)) return 'Payload harus berupa object';

  if (payload.mempelai !== undefined) {
    if (!isObject(payload.mempelai)) return 'mempelai harus object';
    for (const key of ['groom', 'bride']) {
      if (payload.mempelai[key] !== undefined && !isObject(payload.mempelai[key])) {
        return `mempelai.${key} harus object`;
      }
    }
  }
  if (payload.cover !== undefined && !isObject(payload.cover)) return 'cover harus object';
  if (payload.quote !== undefined && !isObject(payload.quote)) return 'quote harus object';
  if (payload.gift !== undefined && !isObject(payload.gift)) return 'gift harus object';
  if (payload.video !== undefined && !isObject(payload.video)) return 'video harus object';
  if (payload.music !== undefined && !isObject(payload.music)) return 'music harus object';
  if (payload.alamat !== undefined && !isObject(payload.alamat)) return 'alamat harus object';
  if (payload.event !== undefined && !isObject(payload.event)) return 'event harus object';
  if (payload.ourStory !== undefined && !Array.isArray(payload.ourStory)) return 'ourStory harus array';
  if (payload.bank !== undefined && !Array.isArray(payload.bank)) return 'bank harus array';
  if (payload.socialMedia !== undefined && !isObject(payload.socialMedia)) return 'socialMedia harus object';
  if (payload.settings !== undefined) {
    if (!isObject(payload.settings)) return 'settings harus object';
    if (payload.settings.chatTemplate !== undefined && typeof payload.settings.chatTemplate !== 'string') {
      return 'settings.chatTemplate harus berupa teks';
    }
    if (typeof payload.settings.chatTemplate === 'string' && payload.settings.chatTemplate.length > 2000) {
      return 'settings.chatTemplate maksimal 2000 karakter';
    }
  }
  return null;
}

app.put('/api/admin/data', requireAuth, async (req, res) => {
  const err = validateAdminPayload(req.body);
  if (err) return res.status(400).json({ error: err });

  try {
    const data = await withWriteLock(async () => {
      const current = await readData();
      const ALLOWED = ['cover', 'quote', 'gift', 'video', 'music', 'mempelai', 'alamat', 'event', 'ourStory', 'bank', 'socialMedia', 'settings'];
      for (const key of ALLOWED) {
        if (req.body[key] !== undefined) current[key] = req.body[key];
      }
      await backupAndWrite(current);
      return current;
    });
    res.json({ ok: true, data });
  } catch (e) {
    console.error('PUT /api/admin/data error:', e);
    res.status(500).json({ error: 'Failed to save data' });
  }
});

/* ---------- guest links (nama tamu terenkripsi) ---------- */
function guestBaseUrl(input, req) {
  const fallback = `${req.protocol}://${req.get('host')}`;
  if (typeof input !== 'string') return fallback;
  const trimmed = input.trim().replace(/\/+$/, '');
  return /^https?:\/\/[^\s/]+/i.test(trimmed) ? trimmed : fallback;
}

app.post('/api/admin/guest-links', requireAuth, (req, res) => {
  const body  = req.body || {};
  const names = Array.isArray(body.names) ? body.names : null;
  if (!names) return res.status(400).json({ error: 'Field "names" harus berupa array' });
  if (names.length > GUEST_BATCH_MAX) {
    return res.status(400).json({ error: `Maksimal ${GUEST_BATCH_MAX} nama sekali generate` });
  }

  const clean = [];
  const seen  = new Set();
  for (const raw of names) {
    if (typeof raw !== 'string') return res.status(400).json({ error: 'Setiap nama harus berupa teks' });
    const name = raw.trim();
    if (!name || seen.has(name)) continue;   // kosong & duplikat dibuang
    if (name.length > GUEST_NAME_MAX) {
      return res.status(400).json({ error: `Nama "${name.slice(0, 30)}…" melebihi ${GUEST_NAME_MAX} karakter` });
    }
    seen.add(name);
    clean.push(name);
  }
  if (!clean.length) return res.status(400).json({ error: 'Daftar nama kosong' });

  const base = guestBaseUrl(body.base, req);
  const links = clean.map(name => ({
    name,
    url: `${base}/?g=${encryptGuestName(name, GUEST_SECRET)}`
  }));

  res.json({ links, secretIsDefault: GUEST_SECRET_IS_DEFAULT });
});

app.delete('/api/admin/comments/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  try {
    const result = await withWriteLock(async () => {
      const data = await readData();
      const before = (data.comments || []).length;
      data.comments = (data.comments || []).filter(c => c.id !== id);
      if (data.comments.length === before) return { removed: false };
      await backupAndWrite(data);
      return { removed: true };
    });
    if (!result.removed) return res.status(404).json({ error: 'Comment tidak ditemukan' });
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/admin/comments error:', e);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

/* ============== SSR: inject Open Graph per data ============== */
function escAttr(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function absUrl(origin, p) {
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  return origin + (p.startsWith('/') ? p : '/' + p);
}
function setMeta(html, attr, key, value) {
  const re = new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`);
  return html.replace(re, `$1${escAttr(value)}$2`);
}
// Crawler WhatsApp/FB tidak menjalankan JS → tag OG harus sudah benar saat HTML di-serve.
function injectOG(html, data, origin, fullUrl) {
  const m = (data && data.mempelai) || {};
  const groom = (m.groom && m.groom.nickname) || 'Mempelai Pria';
  const bride = (m.bride && m.bride.nickname) || 'Mempelai Wanita';
  const event = data && data.event;
  const firstEvent = event && Array.isArray(event.items) && event.items[0];
  const dateLabel = (event && event.dateLabel) || (firstEvent && firstEvent.date) || '';
  const title = `The Wedding of ${groom} & ${bride}`;
  const desc  = `Dengan memohon rahmat Allah SWT, kami mengundang Anda untuk hadir di pernikahan ${groom} & ${bride}${dateLabel ? ' — ' + dateLabel : ''}.`;
  const cover = (data && data.cover && data.cover.image) || (m.bride && m.bride.photo) || '';
  const img   = absUrl(origin, cover);

  let out = html.replace(/<title>[^<]*<\/title>/, `<title>${escAttr(title)}</title>`);
  out = setMeta(out, 'property', 'og:site_name', title);
  out = setMeta(out, 'property', 'og:title', title);
  out = setMeta(out, 'property', 'og:description', desc);
  out = setMeta(out, 'property', 'og:url', fullUrl);
  out = setMeta(out, 'property', 'og:image', img);
  out = setMeta(out, 'name', 'twitter:title', title);
  out = setMeta(out, 'name', 'twitter:description', desc);
  out = setMeta(out, 'name', 'twitter:image', img);
  out = out.replace(/(<img id="vintageCoverImage"[^>]*\bsrc=")[^"]*/, `$1${escAttr(cover)}`);
  return out;
}

/* ---------- SSR: inject nama tamu dari token terenkripsi ---------- */
function injectGuest(html, name) {
  if (!name) return html;
  return html.replace(
    /(<p id="vintageGuestName"[^>]*>)[\s\S]*?(<\/p>)/,
    (m, open, close) => open + escAttr(name) + close
  );
}

// Halaman mandiri (tanpa JS, tanpa font eksternal) untuk token yang tidak valid.
function invalidLinkPage() {
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Link Undangan Tidak Valid</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 2rem;
    text-align: center; color: #f2eddc; background: #0f2418;
    font-family: "Cormorant Garamond", Georgia, "Times New Roman", serif;
  }
  .card {
    max-width: 26rem; padding: 2.5rem 1.75rem;
    border: 1px solid rgba(255, 248, 222, .28); border-radius: 16px;
    background: linear-gradient(180deg, rgba(24, 53, 34, .95), rgba(15, 36, 24, .95));
    box-shadow: 0 20px 60px rgba(0, 0, 0, .45);
  }
  h1 { margin: 0 0 .75rem; font-size: 1.6rem; font-style: italic; font-weight: 600; }
  .rule { width: 3rem; height: 1px; margin: 1.25rem auto; background: rgba(255, 248, 222, .45); }
  p { margin: 0; font-size: 1.05rem; font-style: italic; line-height: 1.75; color: rgba(242, 237, 220, .88); }
</style>
</head>
<body>
  <main class="card">
    <h1>Link Undangan Tidak Valid</h1>
    <div class="rule" aria-hidden="true"></div>
    <p>Link yang Anda buka tidak dikenali atau sudah diubah. Silakan minta ulang link undangan kepada kami.</p>
  </main>
</body>
</html>`;
}

async function serveIndex(req, res) {
  // Token ada tapi gagal didekripsi = dipalsukan/diubah → blokir.
  const token = typeof req.query.g === 'string' ? req.query.g : '';
  let guestName = null;
  if (token) {
    const result = decryptGuestToken(token, GUEST_SECRET);
    if (!result.ok) {
      res.set('Cache-Control', 'no-store, must-revalidate');
      return res.status(403).type('html').send(invalidLinkPage());
    }
    guestName = result.name;
  }

  try {
    const [html, data] = await Promise.all([
      fs.readFile(INDEX_PATH, 'utf8'),
      readData().catch(() => ({}))
    ]);
    const origin  = `${req.protocol}://${req.get('host')}`;
    const fullUrl = origin + req.originalUrl;
    res.set('Cache-Control', 'no-store, must-revalidate');
    res.type('html').send(injectGuest(injectOG(html, data, origin, fullUrl), guestName));
  } catch (e) {
    console.error('serveIndex error:', e);
    res.sendFile(INDEX_PATH);
  }
}

/* ============== STATIC ============== */

app.get('/admin', (req, res) => {
  res.sendFile(path.join(ADMIN_DIR, 'index.html'));
});
app.use('/admin', express.static(ADMIN_DIR));

// Jangan expose index.html di URL — redirect ke root (query string dipertahankan).
// http://host/index.html?to=Joris  ->  http://host/?to=Joris
app.get(['/index.html', '/index.htm'], (req, res) => {
  const i = req.originalUrl.indexOf('?');
  res.redirect(302, i >= 0 ? '/' + req.originalUrl.slice(i) : '/');
});

// Root: serve index.html dengan OG di-inject dari wedding.json (per client).
app.get('/', serveIndex);

app.use(express.static(ROOT, { index: 'index.html' }));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Admin panel:    http://localhost:${PORT}/admin`);
  console.log(`Data file:      ${DATA_PATH}`);
  console.log(`Backup dir:     ${BACKUP_DIR}`);
  if (GUEST_SECRET_IS_DEFAULT) {
    console.warn('');
    console.warn('PERINGATAN: GUEST_LINK_SECRET belum di-set di .env.');
    console.warn('  Link tamu memakai kunci turunan dari ADMIN_USER/ADMIN_PASS,');
    console.warn('  sehingga semua link tamu jadi tidak valid bila password admin diganti.');
    console.warn('  Set GUEST_LINK_SECRET sebelum online — lihat .env.example.');
  }
});
