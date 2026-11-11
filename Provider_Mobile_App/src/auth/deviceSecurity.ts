import type { KeyValueStore } from '../lib/secureStorage';

export const logoutMarker = 'milestone-provider-signed-out';
export async function endDeviceSession(storage: KeyValueStore, sessionKey: string, signOut: () => Promise<{ error: unknown }>) {
  let durableBlock = false;
  let credentialsRemoved = false;
  let remoteError = false;
  try { await storage.setItem(logoutMarker, '1'); durableBlock = true; } catch { /* Still attempt both ways to remove the session. */ }
  try { remoteError = Boolean((await signOut()).error); } catch { remoteError = true; }
  try { await storage.removeItem(sessionKey); credentialsRemoved = true; } catch { /* The marker keeps restoration blocked. */ }
  if (!durableBlock && !credentialsRemoved) throw new Error('Sign-out could not clear saved credentials. Retry sign-out before closing the app.');
  if (!credentialsRemoved) throw new Error('Sign-out locked this device, but saved credentials could not be cleared. Please retry.');
  if (remoteError) throw new Error('Sign-out cleared this device, but the server could not be reached to revoke the session.');
}
export function deviceUnlockOutcome(result: { success: boolean; error?: string }): 'unlocked' | 'retry' | 'signIn' {
  if (result.success) return 'unlocked';
  return ['not_available', 'not_enrolled', 'passcode_not_set'].includes(result.error ?? '') ? 'signIn' : 'retry';
}
