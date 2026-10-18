import { getRandomBytesAsync } from 'expo-crypto';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

export async function hashSecret(secret, salt) {
  const derived = await pbkdf2Async(sha256, secret, hexToBytes(salt), {
    c: 600000,
    dkLen: 32,
    asyncTick: 8,
  });
  return bytesToHex(derived);
}

export async function createVerifier(secret) {
  const salt = bytesToHex(await getRandomBytesAsync(16));
  return { salt, hash: await hashSecret(secret, salt) };
}

export async function matchesVerifier(secret, verifier) {
  const actual = await hashSecret(secret, verifier.salt);
  let difference = actual.length ^ verifier.hash.length;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual.charCodeAt(index) ^ verifier.hash.charCodeAt(index);
  }
  return difference === 0;
}
