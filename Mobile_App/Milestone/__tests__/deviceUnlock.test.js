import { unlockWithSecret } from '../auth/deviceUnlock';
test('uses the patient-chosen PIN with no default', async () => {
  await expect(unlockWithSecret('pin', '6789', '6789')).resolves.toBeUndefined();
  await expect(unlockWithSecret('pin', '0000', '6789')).rejects.toThrow('PIN');
  await expect(unlockWithSecret('pin', '0000')).rejects.toThrow('PIN');
  await expect(unlockWithSecret('password', 'password', '6789')).rejects.toThrow('only available');
});
