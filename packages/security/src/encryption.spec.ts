import { decryptSecret, encryptSecret, previewSecret } from './encryption';

describe('encryptSecret / decryptSecret', () => {
  const originalKey = process.env.SETTINGS_ENCRYPTION_KEY;

  afterEach(() => {
    process.env.SETTINGS_ENCRYPTION_KEY = originalKey;
  });

  it('round-trips a secret through encrypt then decrypt', () => {
    process.env.SETTINGS_ENCRYPTION_KEY = 'a'.repeat(64);
    const ciphertext = encryptSecret('sk-ant-super-secret');
    expect(ciphertext).not.toContain('sk-ant-super-secret');
    expect(decryptSecret(ciphertext)).toBe('sk-ant-super-secret');
  });

  it('accepts a base64-encoded 32-byte key, not just hex', () => {
    process.env.SETTINGS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    const ciphertext = encryptSecret('another-secret');
    expect(decryptSecret(ciphertext)).toBe('another-secret');
  });

  it('throws when SETTINGS_ENCRYPTION_KEY is not set', () => {
    delete process.env.SETTINGS_ENCRYPTION_KEY;
    expect(() => encryptSecret('x')).toThrow(/SETTINGS_ENCRYPTION_KEY/);
  });

  it('throws when SETTINGS_ENCRYPTION_KEY does not decode to 32 bytes', () => {
    process.env.SETTINGS_ENCRYPTION_KEY = 'too-short';
    expect(() => encryptSecret('x')).toThrow(/32 bytes/);
  });

  it('fails to decrypt with the wrong key (auth tag mismatch)', () => {
    process.env.SETTINGS_ENCRYPTION_KEY = 'a'.repeat(64);
    const ciphertext = encryptSecret('secret');
    process.env.SETTINGS_ENCRYPTION_KEY = 'b'.repeat(64);
    expect(() => decryptSecret(ciphertext)).toThrow();
  });

  it('rejects a malformed payload', () => {
    process.env.SETTINGS_ENCRYPTION_KEY = 'a'.repeat(64);
    expect(() => decryptSecret('not-a-valid-payload')).toThrow(/Malformed/);
  });
});

describe('previewSecret', () => {
  it('returns only the last 4 characters', () => {
    expect(previewSecret('sk-ant-1234567890')).toBe('7890');
  });
});
