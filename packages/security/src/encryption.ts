import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * AES-256-GCM at-rest encryption for secrets stored in the database (e.g. user-supplied LLM
 * provider API keys — see apps/api/src/llm-settings). Not used for anything transient like JWTs;
 * this is specifically for values that must be recoverable in plaintext later.
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;

function loadKey(): Buffer {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'SETTINGS_ENCRYPTION_KEY is not set — required to encrypt/decrypt stored settings such as LLM provider API keys.',
    );
  }
  // Accept either a 64-char hex string or a base64 string that decodes to 32 bytes, so a key
  // generated via `openssl rand -hex 32` or `openssl rand -base64 32` both work unmodified.
  const key = Buffer.from(raw, /^[0-9a-fA-F]{64}$/.test(raw) ? 'hex' : 'base64');
  if (key.length !== 32) {
    throw new Error('SETTINGS_ENCRYPTION_KEY must decode to exactly 32 bytes (a hex or base64-encoded AES-256 key).');
  }
  return key;
}

/** Returns `iv.authTag.ciphertext`, each base64, so the whole thing is one storable string. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, loadKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((buf) => buf.toString('base64')).join('.');
}

export function decryptSecret(payload: string): string {
  const [ivB64, authTagB64, ciphertextB64] = payload.split('.');
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error('Malformed encrypted payload — expected "iv.authTag.ciphertext"');
  }
  const decipher = createDecipheriv(ALGORITHM, loadKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()]);
  return plaintext.toString('utf8');
}

/** Last 4 chars of a secret, for display (e.g. "••••ab12") — never enough to reconstruct the key. */
export function previewSecret(plaintext: string): string {
  return plaintext.slice(-4);
}
