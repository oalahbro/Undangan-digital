'use strict';
/* Pengelola tenant (registry data/tenants.json) — dipakai CLI & super-admin web. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const TENANTS_PATH = path.join(ROOT, 'data', 'tenants.json');
const DATA_DIR     = path.join(ROOT, 'data', 'tenants');
const TEMPLATE     = path.join(ROOT, 'data', 'template.json');
const UPLOAD_ROOT  = path.join(ROOT, 'assets', 'uploads');

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
const genPass = () => crypto.randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
const slugOk  = (s) => /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(s || '');

function load() { try { return JSON.parse(fs.readFileSync(TENANTS_PATH, 'utf8')); } catch { return {}; } }
function save(reg) {
  fs.mkdirSync(path.dirname(TENANTS_PATH), { recursive: true });
  fs.writeFileSync(TENANTS_PATH, JSON.stringify(reg, null, 2));
}

function listTenants() {
  const reg = load();
  return Object.keys(reg).sort().map(slug => ({
    slug, name: reg[slug].name || slug,
    template: reg[slug].template || 'green-pii',
    domains: reg[slug].domains || [], createdAt: reg[slug].createdAt || 0
  }));
}

function createTenant(slug, name, pass, template) {
  if (!slugOk(slug)) throw new Error('Slug tidak valid (huruf kecil/angka/strip, 2-40 char).');
  const reg = load();
  if (reg[slug]) throw new Error('Slug sudah dipakai: ' + slug);
  pass = pass || genPass();
  template = template || 'green-pii';
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const df = path.join(DATA_DIR, slug + '.json');
  if (!fs.existsSync(df)) {
    const tpl = fs.existsSync(TEMPLATE) ? fs.readFileSync(TEMPLATE, 'utf8') : '{"comments":[]}';
    fs.writeFileSync(df, tpl);
  }
  fs.mkdirSync(path.join(UPLOAD_ROOT, slug), { recursive: true });
  reg[slug] = { name: name || slug, template, pass: hashPass(pass), domains: [], createdAt: Date.now() };
  save(reg);
  return { slug, name: reg[slug].name, template, password: pass };
}

function setPassword(slug, pass) {
  const reg = load();
  if (!reg[slug]) throw new Error('Client tidak ada: ' + slug);
  pass = pass || genPass();
  reg[slug].pass = hashPass(pass);
  save(reg);
  return { slug, password: pass };
}

function addDomain(slug, domain) {
  const reg = load();
  if (!reg[slug]) throw new Error('Client tidak ada: ' + slug);
  domain = String(domain || '').trim().toLowerCase();
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw new Error('Domain tidak valid.');
  reg[slug].domains = reg[slug].domains || [];
  if (!reg[slug].domains.includes(domain)) reg[slug].domains.push(domain);
  save(reg);
  return { slug, domains: reg[slug].domains };
}

function removeTenant(slug) {
  const reg = load();
  if (!reg[slug]) throw new Error('Client tidak ada: ' + slug);
  delete reg[slug];
  save(reg);
  return { slug };
}

module.exports = {
  TENANTS_PATH, hashPass, verifyPass, genPass, slugOk,
  load, listTenants, createTenant, setPassword, addDomain, removeTenant
};
