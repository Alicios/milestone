import { DEFAULT_PROFILE_PIN, unlockWithSecret } from '../auth/deviceUnlock';

test('unlocks the sample profile with PIN 0000 only', async () => {
  expect(DEFAULT_PROFILE_PIN).toBe('0000');
  await expect(unlockWithSecret('pin', '0000')).resolves.toBeUndefined();
  await expect(unlockWithSecret('pin', '1234')).rejects.toThrow('PIN doesn’t match');
  await expect(unlockWithSecret('password', 'password')).rejects.toThrow('only available');
});
