'use strict';

const assert = require('assert');
const { encryptGuestName, decryptGuestToken } = require('../lib/guest-token');

const SECRET = 'rahasia-uji-coba-32-byte';

/* ---------- round-trip ---------- */
for (const name of [
  'Bapak Joris',
  'Ibu Sari & Keluarga',
  'Bpk. Budi Santoso',
  "O'Brien",
  'Keluarga Bpk. H. Ahmad Fadli',
  'Änne Müller-Şahin',
  '山田太郎',
  'Tamu 🎉'
]) {
  const token = encryptGuestName(name, SECRET);
  const out = decryptGuestToken(token, SECRET);
  assert.strictEqual(out.ok, true, `token untuk "${name}" harus valid`);
  assert.strictEqual(out.name, name, `nama harus kembali utuh: "${name}"`);
}

/* ---------- token tidak membocorkan nama ---------- */
const secretToken = encryptGuestName('Bapak Joris', SECRET);
assert.ok(!secretToken.includes('Joris'), 'nama tidak boleh terbaca di token');
assert.ok(secretToken.includes('Bapak') === false, 'nama tidak boleh terbaca di token');
assert.ok(/^[A-Za-z0-9_-]+$/.test(secretToken), 'token harus base64url (aman untuk URL)');

/* ---------- IV acak → token selalu berbeda ---------- */
const a = encryptGuestName('Bapak Joris', SECRET);
const b = encryptGuestName('Bapak Joris', SECRET);
assert.notStrictEqual(a, b, 'dua enkripsi nama sama harus menghasilkan token berbeda');
assert.strictEqual(decryptGuestToken(a, SECRET).name, decryptGuestToken(b, SECRET).name);

/* ---------- token diubah → ditolak ---------- */
{
  const raw = Buffer.from(secretToken, 'base64url');
  raw[raw.length - 1] ^= 0x01;                     // balik 1 bit di ciphertext
  const tampered = raw.toString('base64url');
  const out = decryptGuestToken(tampered, SECRET);
  assert.strictEqual(out.ok, false, 'token yang diubah harus ditolak');
  assert.strictEqual(out.reason, 'auth-failed');
}
{
  const raw = Buffer.from(secretToken, 'base64url');
  raw[1] ^= 0x01;                                  // ubah IV
  assert.strictEqual(decryptGuestToken(raw.toString('base64url'), SECRET).ok, false);
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

/* ---------- version byte asing → ditolak ---------- */
{
  const raw = Buffer.from(secretToken, 'base64url');
  raw[0] = 9;
  assert.strictEqual(decryptGuestToken(raw.toString('base64url'), SECRET).reason, 'bad-version');
}

console.log('guest token OK');
