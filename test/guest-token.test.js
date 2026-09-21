'use strict';

const assert = require('assert');
const crypto = require('crypto');
const { encryptGuestName, decryptGuestToken } = require('../lib/guest-token');

const SECRET = 'rahasia-uji-coba-32-byte';

const IV_LEN  = 12;
const TAG_LEN = 16;
const HEAD_V2 = IV_LEN + TAG_LEN;     // 28
const HEAD_V1 = 1 + IV_LEN + TAG_LEN; // 29

// Helper: bikin token V1 (format legacy) pakai crypto primitif langsung.
function encryptGuestNameV1(name, secret) {
  const key = crypto.createHash('sha256').update(String(secret), 'utf8').digest();
  const iv = crypto.randomBytes(IV_LEN);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([
    c.update(JSON.stringify({ v: 1, n: String(name) }), 'utf8'),
    c.final()
  ]);
  return Buffer.concat([Buffer.from([1]), iv, c.getAuthTag(), body]).toString('base64url');
}

/* ---------- round-trip V2 ---------- */
for (const name of [
  'Bapak Joris',
  'Ibu Sari & Keluarga',
  'Bpk. Budi Santoso',
  "O'Brien",
  'Keluarga Bpk. H. Ahmad Fadli',
  'Änne Müller-Şahin',
  '山田太郎',
  'Tamu 🎉',
  'Eka',
  'A'
]) {
  const token = encryptGuestName(name, SECRET);
  const out = decryptGuestToken(token, SECRET);
  assert.strictEqual(out.ok, true, `token untuk "${name}" harus valid`);
  assert.strictEqual(out.name, name, `nama harus kembali utuh: "${name}"`);
}

/* ---------- target panjang: nama pendek harus ≤ 55 char ---------- */
// Batas user "40-50 char untuk nama normal". Nama ≤12 char biasanya ≤55 char
// (overhead tetap 28 byte = 38 char base64url + nama UTF-8 ≈ 4/3 char).
// Nama lebih panjang menghasilkan token lebih panjang tapi tetap 28% lebih
// pendek dari format V1 (lihat ukuran V1 di README / test legacy).
for (const name of ['Eka', 'Bapak Joris', 'Ibu Sari']) {
  const token = encryptGuestName(name, SECRET);
  assert.ok(token.length <= 55, `token untuk "${name}" harusnya ≤ 55 char, dapat ${token.length}`);
}

/* ---------- token tidak membocorkan nama ---------- */
const secretToken = encryptGuestName('Bapak Joris', SECRET);
assert.ok(!secretToken.includes('Joris'), 'nama tidak boleh terbaca di token');
assert.ok(!secretToken.includes('Bapak'), 'nama tidak boleh terbaca di token');
assert.ok(/^[A-Za-z0-9_-]+$/.test(secretToken), 'token harus base64url (aman untuk URL)');
// Panjang token V2 untuk nama 11 char harus jauh lebih pendek dari format V1.
assert.ok(secretToken.length < 60, `token V2 harus < 60 char (dapat ${secretToken.length})`);

/* ---------- IV acak → token selalu berbeda ---------- */
const a = encryptGuestName('Bapak Joris', SECRET);
const b = encryptGuestName('Bapak Joris', SECRET);
assert.notStrictEqual(a, b, 'dua enkripsi nama sama harus menghasilkan token berbeda');
assert.strictEqual(decryptGuestToken(a, SECRET).name, decryptGuestToken(b, SECRET).name);

/* ---------- token diubah → ditolak ---------- */
{
  const raw = Buffer.from(secretToken, 'base64url');
  raw[raw.length - 1] ^= 0x01;                     // balik 1 bit di ciphertext
  assert.strictEqual(decryptGuestToken(raw.toString('base64url'), SECRET).ok, false);
}
{
  const raw = Buffer.from(secretToken, 'base64url');
  raw[1] ^= 0x01;                                  // ubah IV
  assert.strictEqual(decryptGuestToken(raw.toString('base64url'), SECRET).ok, false);
}
{
  const raw = Buffer.from(secretToken, 'base64url');
  raw[HEAD_V2 - 1] ^= 0x01;                        // ubah authTag
  const out = decryptGuestToken(raw.toString('base64url'), SECRET);
  assert.strictEqual(out.ok, false);
  assert.strictEqual(out.reason, 'auth-failed');
}

/* ---------- secret salah → ditolak ---------- */
assert.strictEqual(decryptGuestToken(secretToken, 'secret-yang-berbeda').ok, false);
assert.strictEqual(decryptGuestToken(secretToken, '').reason, 'no-secret');

/* ---------- input sampah → tidak throw ---------- */
for (const bad of ['', 'bukan-token', 'a', '%%%', 'x'.repeat(400), null, undefined, 123, {}]) {
  const out = decryptGuestToken(bad, SECRET);
  assert.strictEqual(out.ok, false, `input sampah harus ditolak: ${String(bad).slice(0, 20)}`);
  assert.strictEqual(typeof out.reason, 'string');
}

/* ---------- token terpotong → ditolak ---------- */
{
  const raw = Buffer.from(secretToken, 'base64url');
  const cut = raw.subarray(0, raw.length - 4).toString('base64url');
  assert.strictEqual(decryptGuestToken(cut, SECRET).ok, false);
}
{
  const raw = Buffer.from(secretToken, 'base64url');
  assert.strictEqual(decryptGuestToken(raw.subarray(0, 8).toString('base64url'), SECRET).reason, 'too-short');
}

/* ---------- backward-compat V1 ---------- */
// Token V1 harus tetap bisa di-decode oleh decryptGuestToken.
for (const name of ['Bapak Joris', 'Ibu Sari & Keluarga', 'Eka & Salsa']) {
  const v1 = encryptGuestNameV1(name, SECRET);
  const out = decryptGuestToken(v1, SECRET);
  assert.strictEqual(out.ok, true, `V1 token untuk "${name}" harus tetap valid (backward-compat)`);
  assert.strictEqual(out.name, name);
}

/* ---------- V1 tamper: ubah ciphertext di V1 → ditolak ---------- */
{
  const v1 = encryptGuestNameV1('Bapak Joris', SECRET);
  const raw = Buffer.from(v1, 'base64url');
  raw[raw.length - 1] ^= 0x01;
  assert.strictEqual(decryptGuestToken(raw.toString('base64url'), SECRET).ok, false);
}

/* ---------- V1 fallback tidak aktif untuk raw tanpa byte-0 === 1 ---------- */
// Raw acak dengan byte-0 bukan 1 harus ditolak langsung tanpa fallback.
{
  const raw = Buffer.from(secretToken, 'base64url');
  raw[0] = 9;  // byte-0 bukan 1 → tidak masuk fallback V1
  // V2 akan gagal (karena IV byte pertama kacau), fallback V1 dilewati (byte-0 !== 1) → auth-failed
  const out = decryptGuestToken(raw.toString('base64url'), SECRET);
  assert.strictEqual(out.ok, false);
}

console.log('guest token OK');