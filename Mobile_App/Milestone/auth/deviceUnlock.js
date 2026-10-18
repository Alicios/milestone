export const DEFAULT_PROFILE_PIN = '0000';

export async function unlockWithSecret(method, secret) {
  if (method !== 'pin') throw new Error('PIN unlock is the only available sign-in method.');
  if (secret !== DEFAULT_PROFILE_PIN) {
    throw new Error('That PIN doesn’t match. Please try again.');
  }
}
