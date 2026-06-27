'use strict';
/* CLI provisioning client (tenant). Jalankan dari root project.
   node scripts/tenant.js add <slug> "<Nama>" [password]
   node scripts/tenant.js list
   node scripts/tenant.js passwd <slug> [password]
   node scripts/tenant.js domain <slug> <domain.com>
   node scripts/tenant.js remove <slug>
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const TENANTS_PATH = path.join(ROOT, 'data', 'tenants.json');
const DATA_DIR     = path.join(ROOT, 'data', 'tenants');
const TEMPLATE     = path.join(ROOT, 'data', 'template.json');
const UPLOAD_ROOT  = path.join(ROOT, 'assets', 'uploads');

const hashPass = (pw) => {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex');
};
const loadReg = () => { try { return JSON.parse(fs.readFileSync(TENANTS_PATH, 'utf8')); } catch { return {}; } };
const saveReg = (r) => fs.writeFileSync(TENANTS_PATH, JSON.stringify(r, null, 2));
const genPass = () => crypto.randomBytes(8).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
const slugOk  = (s) => /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(s || '');

function add(slug, name, pass) {
  if (!slugOk(slug)) { console.error('Slug tidak valid: huruf kecil/angka/strip, 2-40 char.'); process.exit(1); }
  const reg = loadReg();
  if (reg[slug]) { console.error('Slug sudah dipakai:', slug); process.exit(1); }
  pass = pass || genPass();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const df = path.join(DATA_DIR, slug + '.json');
  if (!fs.existsSync(df)) {
    const tpl = fs.existsSync(TEMPLATE) ? fs.readFileSync(TEMPLATE, 'utf8') : '{"comments":[]}';
    fs.writeFileSync(df, tpl);
  }
  fs.mkdirSync(path.join(UPLOAD_ROOT, slug), { recursive: true });
  reg[slug] = { name: name || slug, pass: hashPass(pass), domains: [], createdAt: Date.now() };
  saveReg(reg);
  console.log(`OK — client "${slug}" dibuat.`);
  console.log(`  Nama    : ${name || slug}`);
  console.log(`  Password: ${pass}`);
  console.log(`  Data    : data/tenants/${slug}.json`);
  console.log(`  Akses   : /t/${slug} (host tunggal/Funnel) atau ${slug}.localhost:PORT (subdomain)`);
}
function list() {
  const reg = loadReg(); const keys = Object.keys(reg);
  if (!keys.length) return console.log('(belum ada client)');
  keys.forEach(s => console.log(`- ${s}  ·  ${reg[s].name || ''}  ·  domains: ${(reg[s].domains || []).join(', ') || '-'}`));
}
function passwd(slug, pass) {
  const reg = loadReg(); if (!reg[slug]) { console.error('Tidak ada:', slug); process.exit(1); }
  pass = pass || genPass(); reg[slug].pass = hashPass(pass); saveReg(reg);
  console.log(`Password "${slug}" diganti: ${pass}`);
}
function domain(slug, dom) {
  const reg = loadReg(); if (!reg[slug]) { console.error('Tidak ada:', slug); process.exit(1); }
  reg[slug].domains = reg[slug].domains || [];
  if (!reg[slug].domains.includes(dom)) reg[slug].domains.push(dom);
  saveReg(reg); console.log(`Domain ${dom} -> ${slug}`);
}
function remove(slug) {
  const reg = loadReg(); if (!reg[slug]) { console.error('Tidak ada:', slug); process.exit(1); }
  delete reg[slug]; saveReg(reg);
  console.log(`Client "${slug}" dihapus dari registry (file data tidak dihapus).`);
}

const [, , cmd, ...a] = process.argv;
({ add: () => add(a[0], a[1], a[2]), list, passwd: () => passwd(a[0], a[1]),
   domain: () => domain(a[0], a[1]), remove: () => remove(a[0]) }[cmd] || (() => {
  console.log('Penggunaan:');
  console.log('  node scripts/tenant.js add <slug> "<Nama>" [password]');
  console.log('  node scripts/tenant.js list');
  console.log('  node scripts/tenant.js passwd <slug> [password]');
  console.log('  node scripts/tenant.js domain <slug> <domain.com>');
  console.log('  node scripts/tenant.js remove <slug>');
}))();
