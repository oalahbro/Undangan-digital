'use strict';

/*
 * Token nama tamu — AES-256-GCM.
 *
 * Format V2 (saat ini): base64url( iv(12) ‖ authTag(16) ‖ ciphertext )
 * Plaintext: nama tamu sebagai UTF-8 polos (tanpa wrapper JSON).
 *
 * Format V1 (legacy, masih diterima untuk backward-compat):
 *   base64url( version(1) ‖ iv(12) ‖ authTag(16) ‖ ciphertext(JSON{ v, n }) )
 *
 * GCM memberi kerahasiaan sekaligus integritas: satu byte diubah membuat
 * authTag tidak cocok, jadi token tidak bisa dipalsukan tanpa secret.
 *
 * Decoder mencoba V2 dulu; kalau gagal dan byte-0 === 1, fallback ke V1
 * supaya link lama (yang sudah tersebar) tetap bisa dibuka.
 */

const crypto = require('crypto');

const IV_LEN   = 12;
const TAG_LEN  = 16;
const HEAD_V2  = IV_LEN + TAG_LEN;             // 28
const HEAD_V1  = 1 + IV_LEN + TAG_LEN;         // 29
const V1_MARK  = 1;                            // version byte untuk V1

// Panjang secret bebas → dipetakan ke kunci 32 byte.
function deriveKey(secret) {
  return crypto.createHash('sha256').update(String(secret), 'utf8').digest();
}

function encryptGuestName(name, secret) {
  const iv     = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const body   = Buffer.concat([cipher.update(String(name), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

// Decode V2: iv ‖ authTag ‖ ciphertext → nama UTF-8.
// Throw bila auth-tag mismatch / plaintext kosong.
function decodeV2(raw, secret) {
  const iv   = raw.subarray(0, IV_LEN);
  const tag  = raw.subarray(IV_LEN, HEAD_V2);
  const body = raw.subarray(HEAD_V2);
  const d = crypto.createDecipheriv('aes-256-gcm', deriveKey(secret), iv);
  d.setAuthTag(tag);
  const plain = Buffer.concat([d.update(body), d.final()]).toString('utf8');
  if (!plain) throw new Error('empty-plain');
  return plain;
}

// Decode V1 (legacy): version ‖ iv ‖ authTag ‖ ciphertext(JSON{ v, n }).
// Throw bila format tidak cocok / nama kosong.
function decodeV1(raw, secret) {
  if (raw[0] !== V1_MARK) throw new Error('not-v1');
  const iv   = raw.subarray(1, 1 + IV_LEN);
  const tag  = raw.subarray(1 + IV_LEN, HEAD_V1);
  const body = raw.subarray(HEAD_V1);
  const d = crypto.createDecipheriv('aes-256-gcm', deriveKey(secret), iv);
  d.setAuthTag(tag);
  const plain = Buffer.concat([d.update(body), d.final()]).toString('utf8');
  const parsed = JSON.parse(plain);
  if (!parsed || typeof parsed.n !== 'string' || parsed.n === '') {
    throw new Error('empty-name');
  }
  return parsed.n;
}

// Selalu mengembalikan object — tidak pernah throw, supaya pemanggil tidak
// perlu try/catch di jalur request.
function decryptGuestToken(token, secret) {
  if (typeof token !== 'string' || token === '') return { ok: false, reason: 'empty' };
  if (!secret) return { ok: false, reason: 'no-secret' };

  const raw = Buffer.from(token, 'base64url');
  if (raw.length < HEAD_V2) return { ok: false, reason: 'too-short' };

  // 1) Coba V2 dulu — semua token baru pakai format ini.
  try {
    return { ok: true, name: decodeV2(raw, secret) };
  } catch (_) {
    // Lanjut ke fallback V1 di bawah.
  }

  // 2) Fallback V1 hanya kalau raw panjang cukup DAN byte-0 === version lama.
  //    Langkah ini mencegah raw acak tanpa byte-0 === 1 men-trigger JSON.parse.
  if (raw.length >= HEAD_V1 && raw[0] === V1_MARK) {
    try {
      return { ok: true, name: decodeV1(raw, secret) };
    } catch (_) {
      // jatuh ke auth-failed
    }
  }

  return { ok: false, reason: 'auth-failed' };
}

module.exports = { encryptGuestName, decryptGuestToken };
