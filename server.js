'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

const ROOT       = __dirname;
const DATA_PATH  = path.join(ROOT, 'data', 'wedding.json');
const BACKUP_DIR = path.join(ROOT, 'data', 'backup');
const ADMIN_DIR  = path.join(ROOT, 'admin');
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
  return null;
}

app.put('/api/admin/data', requireAuth, async (req, res) => {
  const err = validateAdminPayload(req.body);
  if (err) return res.status(400).json({ error: err });

  try {
    const data = await withWriteLock(async () => {
      const current = await readData();
      const ALLOWED = ['cover', 'quote', 'gift', 'video', 'music', 'mempelai', 'alamat', 'event', 'ourStory', 'bank', 'socialMedia'];
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

app.use(express.static(ROOT, { index: 'index.html' }));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Admin panel:    http://localhost:${PORT}/admin`);
  console.log(`Data file:      ${DATA_PATH}`);
  console.log(`Backup dir:     ${BACKUP_DIR}`);
});
