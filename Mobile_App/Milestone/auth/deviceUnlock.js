export async function unlockWithSecret(method, secret, profilePin) {
  if (method !== 'pin') throw new Error('PIN unlock is the only available sign-in method.');
  if (!/^\d{4}$/.test(profilePin ?? '') || secret !== profilePin) {
    throw new Error('That PIN doesn’t match. Please try again.');
  }
}
