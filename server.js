'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const store  = require('./lib/tenant-store');

const app = express();
app.set('trust proxy', true);   // hormati X-Forwarded-Proto/Host dari reverse proxy (Caddy) & Tailscale

const PORT = process.env.PORT || 3000;
// Domain dasar produksi (mis. undanganku.com). Subdomain di bawahnya = slug client.
const BASE_DOMAIN = (process.env.BASE_DOMAIN || '').toLowerCase();
const RESERVED_SUBS = new Set(['www', 'panel', 'app', 'api', 'admin', 'mail', 'ftp']);

// Super-admin panel (URL dari .env SUPERADMIN_PATH, mis. /mgmt-x7k2)
const SA_PATH    = (process.env.SUPERADMIN_PATH || '').replace(/\/+$/, '');
const SA_PASS    = process.env.SUPERADMIN_PASS  || '';
const SA_TTL_MS  = 4 * 60 * 60 * 1000;   // 4 jam
const saSessions = new Map();

const ROOT        = __dirname;
const DATA_DIR    = path.join(ROOT, 'data', 'tenants');          // data/tenants/<slug>.json
const BACKUP_DIR  = path.join(ROOT, 'data', 'tenants', 'backup');
const TENANTS_PATH = path.join(ROOT, 'data', 'tenants.json');     // registry
const TEMPLATE_PATH = path.join(ROOT, 'data', 'template.json');
const ADMIN_DIR   = path.join(ROOT, 'admin');
const TMPL_DIR    = path.join(ROOT, 'templates');                // templates/<name>/index.html
const UPLOAD_ROOT = path.join(ROOT, 'assets', 'uploads');        // assets/uploads/<slug>/

const UPLOAD_MAX = 8 * 1024 * 1024;            // 8 MB (gambar)
const VIDEO_MAX  = 60 * 1024 * 1024;           // 60 MB (video)
const AUDIO_MAX  = 20 * 1024 * 1024;           // 20 MB (audio)
const UPLOAD_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const VIDEO_TYPES  = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/ogg': 'ogv', 'video/quicktime': 'mov' };
const AUDIO_TYPES  = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a' };

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const sessions = new Map();

/* ============== TENANT REGISTRY ============== */
let _reg = {}, _regMtime = -1;
async function getRegistry() {
  try {
    const st = await fs.stat(TENANTS_PATH);
    if (st.mtimeMs !== _regMtime) {
      _reg = JSON.parse(await fs.readFile(TENANTS_PATH, 'utf8'));
      _regMtime = st.mtimeMs;
    }
  } catch (e) {
    if (e.code === 'ENOENT') { _reg = {}; _regMtime = -1; }
    else console.error('getRegistry error:', e);
  }
  return _reg;
}

function tenantFromHost(host, reg) {
  if (!host) return null;
  host = host.split(':')[0].toLowerCase();
  // 1. custom domain (alias penuh)
  for (const [slug, t] of Object.entries(reg)) {
    if (Array.isArray(t.domains) && t.domains.includes(host)) return slug;
  }
  // 2. subdomain: <slug>.localhost (dev) atau <slug>.<base-domain> (produksi)
  const parts = host.split('.');
  let sub = null;
  if (host.endsWith('.localhost') && parts.length >= 2) sub = parts[0];
  else if (BASE_DOMAIN && host.endsWith('.' + BASE_DOMAIN)) sub = parts[0];
  else if (!BASE_DOMAIN && parts.length >= 3) sub = parts[0]; // fallback umum
  if (sub && !RESERVED_SUBS.has(sub) && reg[sub]) return sub;
  return null;
}

// Middleware: tentukan req.tenant dari host (subdomain/custom domain) atau cookie tnt.
async function resolveTenant(req, res, next) {
  try {
    const reg = await getRegistry();
    let slug = tenantFromHost(req.hostname || req.headers.host, reg);
    if (!slug) {
      const c = parseCookies(req).tnt;
      if (c && reg[c]) slug = c;
    }
    req.tenant = slug;
  } catch (e) {
    req.tenant = null;
  }
  next();
}
function requireTenant(req, res, next) {
  if (!req.tenant) return res.status(404).json({ error: 'Client tidak ditemukan' });
  next();
}

/* ============== TENANT DATA I/O ============== */
const dataPath = (slug) => path.join(DATA_DIR, slug + '.json');
const locks = new Map();
function withLock(slug, fn) {
  const prev = locks.get(slug) || Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(slug, next.catch(() => {}));
  return next;
}
async function readTenantData(slug) {
  return JSON.parse(await fs.readFile(dataPath(slug), 'utf8'));
}
function timestamp() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' +
    p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}
async function writeTenantData(slug, data) {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  try {
    const cur = await fs.readFile(dataPath(slug), 'utf8');
    await fs.writeFile(path.join(BACKUP_DIR, `${slug}-${timestamp()}.json`), cur);
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  await fs.writeFile(dataPath(slug), JSON.stringify(data, null, 2));
}

/* ============== PASSWORD (scrypt) ============== */
function hashPass(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex');
}
function verifyPass(pw, stored) {
  const [salt, h] = String(stored || '').split(':');
  if (!salt || !h) return false;
  const a = Buffer.from(h, 'hex');
  const b = crypto.scryptSync(pw, salt, 32);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ============== SESSION (per-tenant) ============== */
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
function createSession(tenant) {
  const id = crypto.randomBytes(24).toString('hex');
  sessions.set(id, { tenant, expiresAt: Date.now() + SESSION_TTL_MS });
  return id;
}
function getSession(req) {
  const id = parseCookies(req).admin_session;
  if (!id) return null;
  const s = sessions.get(id);
  if (!s) return null;
  if (s.expiresAt < Date.now()) { sessions.delete(id); return null; }
  return { id, ...s };
}
function setSessionCookie(res, id) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader('Set-Cookie',
    `admin_session=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`);
}
function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'admin_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
}
// Auth sah hanya jika sesi cocok dengan tenant yang sedang diakses.

/* ============== SUPER-ADMIN SESSION ============== */
function saCreateSession() {
  const id = crypto.randomBytes(24).toString('hex');
  saSessions.set(id, { expiresAt: Date.now() + SA_TTL_MS });
  return id;
}
function saGetSession(req) {
  const id = parseCookies(req).sa_session;
  if (!id) return null;
  const s = saSessions.get(id);
  if (!s || s.expiresAt < Date.now()) { saSessions.delete(id); return null; }
  return s;
}
function requireSA(req, res, next) {
  if (!saGetSession(req)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}
function timingSafeEq(a, b) {
  const ab = Buffer.from(String(a)), bb = Buffer.from(String(b));
  if (ab.length !== bb.length) { crypto.timingSafeEqual(Buffer.alloc(1), Buffer.alloc(1)); return false; }
  return crypto.timingSafeEqual(ab, bb);
}
function requireAuth(req, res, next) {
  const s = getSession(req);
  if (!s || !req.tenant || s.tenant !== req.tenant) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.session = s;
  next();
}

/* ============== MIDDLEWARE ORDER ============== */
app.use(cors());
app.use(resolveTenant);  // set req.tenant sebelum route apa pun

// Upload (admin) — body besar; daftarkan sebelum JSON parser global 256kb.
app.post('/api/admin/upload', requireTenant, requireAuth, express.json({ limit: '85mb' }), handleUpload);

app.use(express.json({ limit: '256kb' }));

/* ---------- validation ---------- */
function validateComment(body) {
  if (!body || typeof body !== 'object') return 'Invalid request body';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!name) return 'Field "name" wajib diisi';
  if (name.length > 50) return 'Field "name" maksimal 50 karakter';
  if (!message) return 'Field "message" wajib diisi';
  if (message.length > 300) return 'Field "message" maksimal 300 karakter';
  if (body.attend !== 'datang' && body.attend !== 'absen') return 'Field "attend" harus "datang" atau "absen"';
  return null;
}
function buildStats(comments) {
  let hadir = 0, absen = 0;
  for (const c of comments) { if (c.attend === 'datang') hadir++; else if (c.attend === 'absen') absen++; }
  return { hadir, absen, total: comments.length };
}

/* ---------- upload (base64 data URL → file, per tenant) ---------- */
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

    const dir = path.join(UPLOAD_ROOT, req.tenant);
    await fs.mkdir(dir, { recursive: true });
    const raw  = String((req.body && req.body.filename) || 'file');
    const base = raw.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-')
                    .replace(/^-+|-+$/g, '').slice(0, 40) || 'file';
    const name = `${base}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    await fs.writeFile(path.join(dir, name), buf);

    res.json({ ok: true, url: `/assets/uploads/${req.tenant}/${name}` });
  } catch (e) {
    console.error('POST /api/admin/upload error:', e);
    res.status(500).json({ error: 'Gagal mengunggah file' });
  }
}

/* ============== PUBLIC API ============== */
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.get('/api/wedding', requireTenant, async (req, res) => {
  try {
    const { comments, ...rest } = await readTenantData(req.tenant);
    res.json(rest);
  } catch (e) {
    console.error('GET /api/wedding error:', e);
    res.status(500).json({ error: 'Failed to read data' });
  }
});

app.get('/api/comments', requireTenant, async (req, res) => {
  try {
    const data = await readTenantData(req.tenant);
    const comments = Array.isArray(data.comments) ? data.comments : [];
    const sorted = comments.slice().sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    res.json({ comments: sorted, stats: buildStats(comments) });
  } catch (e) {
    console.error('GET /api/comments error:', e);
    res.status(500).json({ error: 'Failed to read comments' });
  }
});

app.post('/api/comments', requireTenant, async (req, res) => {
  const error = validateComment(req.body);
  if (error) return res.status(400).json({ error });
  try {
    const entry = await withLock(req.tenant, async () => {
      const data = await readTenantData(req.tenant);
      if (!Array.isArray(data.comments)) data.comments = [];
      const newEntry = {
        id: crypto.randomUUID(),
        name: req.body.name.trim().slice(0, 50),
        attend: req.body.attend,
        message: req.body.message.trim().slice(0, 300),
        timestamp: Date.now()
      };
      data.comments.push(newEntry);
      await writeTenantData(req.tenant, data);
      return newEntry;
    });
    res.status(201).json({ ok: true, comment: entry });
  } catch (e) {
    console.error('POST /api/comments error:', e);
    res.status(500).json({ error: 'Failed to save comment' });
  }
});

/* ============== ADMIN AUTH (per tenant) ============== */
app.post('/api/admin/login', requireTenant, async (req, res) => {
  const { password } = req.body || {};
  if (typeof password !== 'string') return res.status(400).json({ error: 'Password wajib diisi' });
  const reg = await getRegistry();
  const t = reg[req.tenant];
  if (!t || !verifyPass(password, t.pass)) return res.status(401).json({ error: 'Password salah' });
  const id = createSession(req.tenant);
  setSessionCookie(res, id);
  res.json({ ok: true, tenant: req.tenant, username: t.name || req.tenant });
});

app.post('/api/admin/logout', (req, res) => {
  const s = getSession(req);
  if (s) sessions.delete(s.id);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/admin/me', async (req, res) => {
  const s = getSession(req);
  if (!s || !req.tenant || s.tenant !== req.tenant) return res.status(401).json({ authenticated: false });
  const reg = await getRegistry();
  res.json({ authenticated: true, tenant: req.tenant, username: (reg[req.tenant] && reg[req.tenant].name) || req.tenant });
});

/* ============== ADMIN DATA ============== */
app.get('/api/admin/data', requireTenant, requireAuth, async (req, res) => {
  try {
    res.json(await readTenantData(req.tenant));
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
      if (payload.mempelai[key] !== undefined && !isObject(payload.mempelai[key])) return `mempelai.${key} harus object`;
    }
  }
  for (const k of ['cover', 'quote', 'gift', 'video', 'music', 'alamat', 'event', 'socialMedia']) {
    if (payload[k] !== undefined && !isObject(payload[k])) return `${k} harus object`;
  }
  if (payload.ourStory !== undefined && !Array.isArray(payload.ourStory)) return 'ourStory harus array';
  if (payload.bank !== undefined && !Array.isArray(payload.bank)) return 'bank harus array';
  return null;
}

app.put('/api/admin/data', requireTenant, requireAuth, async (req, res) => {
  const err = validateAdminPayload(req.body);
  if (err) return res.status(400).json({ error: err });
  try {
    const data = await withLock(req.tenant, async () => {
      const current = await readTenantData(req.tenant);
      const ALLOWED = ['cover', 'quote', 'gift', 'video', 'music', 'mempelai', 'alamat', 'event', 'ourStory', 'bank', 'socialMedia'];
      for (const key of ALLOWED) if (req.body[key] !== undefined) current[key] = req.body[key];
      await writeTenantData(req.tenant, current);
      return current;
    });
    res.json({ ok: true, data });
  } catch (e) {
    console.error('PUT /api/admin/data error:', e);
    res.status(500).json({ error: 'Failed to save data' });
  }
});

app.delete('/api/admin/comments/:id', requireTenant, requireAuth, async (req, res) => {
  const id = req.params.id;
  try {
    const result = await withLock(req.tenant, async () => {
      const data = await readTenantData(req.tenant);
      const before = (data.comments || []).length;
      data.comments = (data.comments || []).filter(c => c.id !== id);
      if (data.comments.length === before) return { removed: false };
      await writeTenantData(req.tenant, data);
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
  return html.replace(new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`), `$1${escAttr(value)}$2`);
}
function injectOG(html, data, origin, fullUrl) {
  const m = (data && data.mempelai) || {};
  const groom = (m.groom && m.groom.nickname) || 'Mempelai Pria';
  const bride = (m.bride && m.bride.nickname) || 'Mempelai Wanita';
  const dateLabel = (data && data.event && data.event.dateLabel) || '';
  const title = `The Wedding of ${groom} & ${bride}`;
  const desc  = `Dengan memohon rahmat Allah SWT, kami mengundang Anda untuk hadir di pernikahan ${groom} & ${bride}${dateLabel ? ' — ' + dateLabel : ''}.`;
  const img   = absUrl(origin, (data && data.cover && data.cover.image) || (m.bride && m.bride.photo) || '');
  let out = html.replace(/<title>[^<]*<\/title>/, `<title>${escAttr(title)}</title>`);
  out = setMeta(out, 'property', 'og:site_name', title);
  out = setMeta(out, 'property', 'og:title', title);
  out = setMeta(out, 'property', 'og:description', desc);
  out = setMeta(out, 'property', 'og:url', fullUrl);
  out = setMeta(out, 'property', 'og:image', img);
  out = setMeta(out, 'name', 'twitter:title', title);
  out = setMeta(out, 'name', 'twitter:description', desc);
  out = setMeta(out, 'name', 'twitter:image', img);
  return out;
}
function landingHtml() {
  return `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Undangan Digital</title>
<style>body{font-family:system-ui,sans-serif;background:#1a1a1a;color:#eee;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;text-align:center;padding:24px}div{max-width:420px}</style>
</head><body><div>
<h1>Undangan tidak ditemukan</h1>
<p>Link undangan tidak valid atau client belum terdaftar. Hubungi penyedia undangan Anda.</p>
</div></body></html>`;
}
async function serveIndex(req, res) {
  if (!req.tenant) return res.status(404).type('html').send(landingHtml());
  try {
    const reg   = await getRegistry();
    const tmpl  = (reg[req.tenant] && reg[req.tenant].template) || 'green-pii';
    const idxPath = path.join(TMPL_DIR, tmpl, 'index.html');
    const [html, data] = await Promise.all([
      fs.readFile(idxPath, 'utf8'),
      readTenantData(req.tenant).catch(() => ({}))
    ]);
    const origin  = `${req.protocol}://${req.get('host')}`;
    res.type('html').send(injectOG(html, data, origin, origin + req.originalUrl));
  } catch (e) {
    console.error('serveIndex error:', e);
    res.status(500).type('html').send('<h1>Template tidak ditemukan</h1>');
  }
}

/* ============== ROUTING ============== */
// Pilih client di host tunggal (Tailscale Funnel / dev): /t/<slug> set cookie → /
app.get('/t/:slug', async (req, res) => {
  const reg = await getRegistry();
  if (!reg[req.params.slug]) return res.status(404).type('html').send(landingHtml());
  res.setHeader('Set-Cookie', `tnt=${encodeURIComponent(req.params.slug)}; Path=/; SameSite=Lax; Max-Age=2592000`);
  const i = req.originalUrl.indexOf('?');           // pertahankan ?to= untuk link tamu
  res.redirect(302, '/' + (i >= 0 ? req.originalUrl.slice(i) : ''));
});

app.get('/admin', (req, res) => res.sendFile(path.join(ADMIN_DIR, 'index.html')));
app.use('/admin', express.static(ADMIN_DIR));

/* ---------- super-admin panel (URL dari env SUPERADMIN_PATH) ---------- */
if (SA_PATH) {
  const saRouter = express.Router();

  saRouter.get('/', (req, res) => res.sendFile(path.join(ROOT, 'super-admin', 'index.html')));

  saRouter.post('/login', (req, res) => {
    if (!SA_PASS) return res.status(503).json({ error: 'SUPERADMIN_PASS belum diset di .env' });
    const pw = (req.body && typeof req.body.password === 'string') ? req.body.password : '';
    if (!pw || !timingSafeEq(pw, SA_PASS)) return res.status(401).json({ error: 'Password salah' });
    const id = saCreateSession();
    res.setHeader('Set-Cookie',
      `sa_session=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SA_TTL_MS / 1000)}`);
    res.json({ ok: true });
  });

  saRouter.post('/logout', (req, res) => {
    const id = parseCookies(req).sa_session;
    if (id) saSessions.delete(id);
    res.setHeader('Set-Cookie', 'sa_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    res.json({ ok: true });
  });

  saRouter.get('/api/me', (req, res) => res.json({ ok: !!saGetSession(req) }));

  saRouter.get('/api/templates', async (req, res) => {
    try {
      const entries = await fs.readdir(TMPL_DIR, { withFileTypes: true });
      res.json(entries.filter(e => e.isDirectory()).map(e => e.name).sort());
    } catch { res.json(['green-pii']); }
  });

  saRouter.get('/api/tenants', requireSA, (req, res) => {
    try { res.json(store.listTenants()); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  saRouter.post('/api/tenants', requireSA, (req, res) => {
    const { slug, name, password, template } = req.body || {};
    try { res.status(201).json(store.createTenant(slug, name, password, template)); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  saRouter.patch('/api/tenants/:slug/password', requireSA, (req, res) => {
    const { password } = req.body || {};
    try { res.json(store.setPassword(req.params.slug, password || undefined)); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  saRouter.post('/api/tenants/:slug/domain', requireSA, (req, res) => {
    const { domain } = req.body || {};
    try { res.json(store.addDomain(req.params.slug, domain)); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  saRouter.delete('/api/tenants/:slug', requireSA, (req, res) => {
    try { res.json({ ok: true, ...store.removeTenant(req.params.slug) }); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.use(SA_PATH, saRouter);
  console.log(`Super-admin: http://localhost:${PORT}${SA_PATH}`);
} else {
  console.log('Super-admin: SUPERADMIN_PATH tidak diset (dinonaktifkan)');
}

// Jangan expose index.html — redirect ke root (query dipertahankan).
app.get(['/index.html', '/index.htm'], (req, res) => {
  const i = req.originalUrl.indexOf('?');
  res.redirect(302, i >= 0 ? '/' + req.originalUrl.slice(i) : '/');
});

// Root: index.html + OG per tenant.
app.get('/', serveIndex);

// Aset statis (css/js/assets/uploads) — sama untuk semua tenant.
app.use(express.static(ROOT, { index: false }));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Multi-tenant. Registry: ${TENANTS_PATH}`);
  console.log(`Data dir:    ${DATA_DIR}`);
  console.log(`Test 1 host: http://localhost:${PORT}/t/<slug>  (set cookie) lalu /`);
  console.log(`Test subdom: http://<slug>.localhost:${PORT}/`);
});
