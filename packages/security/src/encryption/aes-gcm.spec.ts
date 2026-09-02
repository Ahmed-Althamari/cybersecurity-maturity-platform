import { decrypt, DecryptionError, encrypt, EncryptionKeyError, generateEncryptionKey } from './aes-gcm';

const KEY = generateEncryptionKey();
const OTHER_KEY = generateEncryptionKey();

describe('generateEncryptionKey', () => {
  it('generates a 32-byte key, base64 encoded', () => {
    const key = generateEncryptionKey();
    expect(Buffer.from(key, 'base64')).toHaveLength(32);
  });

  it('generates a different key every call', () => {
    expect(generateEncryptionKey()).not.toBe(generateEncryptionKey());
  });
});

describe('encrypt/decrypt round trip', () => {
  it('decrypts back to the original plaintext', () => {
    const ciphertext = encrypt('sk-ant-super-secret-value', KEY);
    expect(decrypt(ciphertext, KEY)).toBe('sk-ant-super-secret-value');
  });

  it('produces a different ciphertext each call (random IV), even for the same plaintext', () => {
    const a = encrypt('same plaintext', KEY);
    const b = encrypt('same plaintext', KEY);
    expect(a).not.toBe(b);
    expect(decrypt(a, KEY)).toBe('same plaintext');
    expect(decrypt(b, KEY)).toBe('same plaintext');
  });

  it('accepts a hex-encoded key as well as base64', () => {
    const hexKey = Buffer.from(generateEncryptionKey(), 'base64').toString('hex');
    const ciphertext = encrypt('hello', hexKey);
    expect(decrypt(ciphertext, hexKey)).toBe('hello');
  });

  it('round-trips an empty string', () => {
    const ciphertext = encrypt('', KEY);
    expect(decrypt(ciphertext, KEY)).toBe('');
  });
});

describe('failure modes (must throw, never silently return garbage)', () => {
  it('rejects a key of the wrong length', () => {
    expect(() => encrypt('x', 'too-short')).toThrow(EncryptionKeyError);
  });

  it('fails closed on the wrong decryption key', () => {
    const ciphertext = encrypt('secret', KEY);
    expect(() => decrypt(ciphertext, OTHER_KEY)).toThrow(DecryptionError);
  });

  it('fails closed on a tampered ciphertext (GCM auth tag check)', () => {
    const ciphertext = encrypt('secret', KEY);
    const [iv, authTag, body] = ciphertext.split('.');
    const tamperedBody = Buffer.from(body, 'base64');
    tamperedBody[0] ^= 0xff;
    const tampered = [iv, authTag, tamperedBody.toString('base64')].join('.');
    expect(() => decrypt(tampered, KEY)).toThrow(DecryptionError);
  });

  it('rejects a malformed payload shape', () => {
    expect(() => decrypt('not-the-right-shape', KEY)).toThrow(DecryptionError);
  });
});
