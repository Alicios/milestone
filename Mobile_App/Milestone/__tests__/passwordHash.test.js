import { pbkdf2Sync } from 'crypto';
import { Buffer } from 'buffer';
import { createVerifier, matchesVerifier } from '../auth/passwordHash';

jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(async size => new Uint8Array(require('crypto').randomBytes(size))),
}));

test('uses independent random salts and PBKDF2-SHA256, and rejects a wrong secret', async () => {
  const first = await createVerifier('test-password');
  const second = await createVerifier('test-password');
  expect(first.salt).not.toBe(second.salt);
  expect(first.hash).not.toBe(second.hash);
  expect(first.hash).toBe(pbkdf2Sync('test-password', Buffer.from(first.salt, 'hex'), 600000, 32, 'sha256').toString('hex'));
  expect(await matchesVerifier('test-password', first)).toBe(true);
  expect(await matchesVerifier('wrong-password', first)).toBe(false);
  expect(JSON.stringify(first)).not.toContain('test-password');
}, 60000);
