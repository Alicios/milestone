import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator } from 'expo-image-manipulator';
import { chooseProfilePhoto } from '../auth/profilePhoto';

jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: { manipulate: jest.fn() }, SaveFormat: { JPEG: 'jpeg' } }));
beforeEach(() => jest.resetAllMocks());
test('canceling photo selection leaves the existing photo alone', async () => {
  ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true });
  expect(await chooseProfilePhoto()).toBeNull();
  expect(ImageManipulator.manipulate).not.toHaveBeenCalled();
});
test('prepares a centered square JPEG and releases image resources', async () => {
  const image = { saveAsync: jest.fn(async () => ({ base64: 'YWJj' })), release: jest.fn() };
  const context = { crop: jest.fn(), resize: jest.fn(), renderAsync: jest.fn(async () => image), release: jest.fn() };
  ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///photo.png', width: 1200, height: 800 }] });
  ImageManipulator.manipulate.mockReturnValue(context);
  expect(await chooseProfilePhoto()).toBe('data:image/jpeg;base64,YWJj');
  expect(context.crop).toHaveBeenCalledWith({ originX: 200, originY: 0, width: 800, height: 800 });
  expect(context.resize).toHaveBeenCalledWith({ width: 256, height: 256 });
  expect(image.saveAsync).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.8, base64: true });
  expect(image.release).toHaveBeenCalled(); expect(context.release).toHaveBeenCalled();
});
test('reports unreadable selections and propagates picker failures', async () => {
  ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [] });
  await expect(chooseProfilePhoto()).rejects.toThrow('Unable to read');
  ImagePicker.launchImageLibraryAsync.mockRejectedValue(new Error('Access denied'));
  await expect(chooseProfilePhoto()).rejects.toThrow('Access denied');
});
test('releases resources if processing fails', async () => {
  ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///photo.png', width: 100, height: 100 }] });
  const context = { crop: jest.fn(), resize: jest.fn(), renderAsync: jest.fn(async () => { throw new Error('Decode failed'); }), release: jest.fn() };
  ImageManipulator.manipulate.mockReturnValue(context);
  await expect(chooseProfilePhoto()).rejects.toThrow('Decode failed');
  expect(context.release).toHaveBeenCalled();
});
