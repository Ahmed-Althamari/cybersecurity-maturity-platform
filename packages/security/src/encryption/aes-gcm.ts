import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // NIST-recommended IV length for GCM

export class EncryptionKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EncryptionKeyError';
  }
}

export class DecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecryptionError';
  }
}

/**
 * Accepts a 32-byte key encoded as base64 or 64-char hex -- the two formats
 * {@link generateEncryptionKey} and most secret-manager UIs produce.
 * Anything else (wrong length, garbage encoding) is rejected outright
 * rather than silently derived/padded into *some* 32-byte key, which would
 * make a typo'd key just as "valid" (and just as wrong) as the real one.
 */
function normalizeKey(rawKey: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    return Buffer.from(rawKey, 'hex');
  }
  const asBase64 = Buffer.from(rawKey, 'base64');
  if (asBase64.length === KEY_BYTES) {
    return asBase64;
  }
  throw new EncryptionKeyError(
    `Encryption key must be a ${KEY_BYTES}-byte value, base64 or hex encoded (got ${asBase64.length} bytes decoded)`,
  );
}

/**
 * Encrypts `plaintext` with AES-256-GCM under `rawKey`, returning a single
 * `.`-joined base64 payload (`iv.authTag.ciphertext`) safe to store as one
 * string column. A fresh random IV is generated per call -- never reuse an
 * IV under the same key, which is what would actually break GCM's
 * confidentiality guarantee.
 */
export function encrypt(plaintext: string, rawKey: string): string {
  const key = normalizeKey(rawKey);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((buffer) => buffer.toString('base64')).join('.');
}

/**
 * Reverses {@link encrypt}. Throws {@link DecryptionError} -- never returns
 * a garbage string -- when the payload is malformed, the key is wrong, or
 * the ciphertext was tampered with: GCM's authentication tag check fails
 * closed in all three cases, which is exactly the property that makes it
 * safe to trust a decrypted value without a separate integrity check.
 */
export function decrypt(payload: string, rawKey: string): string {
  const key = normalizeKey(rawKey);
  const parts = payload.split('.');
  if (parts.length !== 3) {
    throw new DecryptionError('Malformed ciphertext payload (expected "iv.authTag.ciphertext")');
  }
  const [ivB64, authTagB64, ciphertextB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  try {
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch {
    throw new DecryptionError('Failed to decrypt -- wrong key, or the ciphertext was corrupted/tampered with');
  }
}

/** Generates a fresh random 32-byte key, base64-encoded -- for an operator to put in SETTINGS_ENCRYPTION_KEY. */
export function generateEncryptionKey(): string {
  return randomBytes(KEY_BYTES).toString('base64');
}
