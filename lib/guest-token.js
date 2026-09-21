'use strict';

/*
 * Token nama tamu — AES-256-GCM.
 *
 * Format: base64url( version ‖ iv(12) ‖ authTag(16) ‖ ciphertext )
 * Payload: JSON { v, n }  →  n = nama tamu
 *
 * GCM memberi kerahasiaan sekaligus integritas: satu byte diubah membuat
 * authTag tidak cocok, jadi token tidak bisa dipalsukan tanpa secret.
 */

const crypto = require('crypto');

const VERSION = 1;
const IV_LEN  = 12;
const TAG_LEN = 16;
const HEAD_LEN = 1 + IV_LEN + TAG_LEN;

// Panjang secret bebas → dipetakan ke kunci 32 byte.
function deriveKey(secret) {
  return crypto.createHash('sha256').update(String(secret), 'utf8').digest();
}

function encryptGuestName(name, secret) {
  const iv     = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const plain  = JSON.stringify({ v: VERSION, n: String(name) });
  const body   = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), body]).toString('base64url');
}

// Selalu mengembalikan object — tidak pernah throw, supaya pemanggil tidak
// perlu try/catch di jalur request.
function decryptGuestToken(token, secret) {
  if (typeof token !== 'string' || token === '') return { ok: false, reason: 'empty' };
  if (!secret) return { ok: false, reason: 'no-secret' };

  const raw = Buffer.from(token, 'base64url');
  if (raw.length < HEAD_LEN) return { ok: false, reason: 'too-short' };
  if (raw[0] !== VERSION) return { ok: false, reason: 'bad-version' };

  const iv  = raw.subarray(1, 1 + IV_LEN);
  const tag = raw.subarray(1 + IV_LEN, HEAD_LEN);
  const body = raw.subarray(HEAD_LEN);

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(secret), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');

    const parsed = JSON.parse(plain);
    if (!parsed || typeof parsed.n !== 'string' || parsed.n === '') {
      return { ok: false, reason: 'bad-payload' };
    }
    return { ok: true, name: parsed.n };
  } catch (e) {
    return { ok: false, reason: 'auth-failed' };
  }
}

module.exports = { encryptGuestName, decryptGuestToken, VERSION };
