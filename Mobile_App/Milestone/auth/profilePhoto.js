import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

// System photo picker only: no camera access and no upload to a server.
export async function chooseProfilePhoto() {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: Platform.OS !== 'web',
    aspect: [1, 1],
    quality: 1,
  });
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset?.uri || !asset.width || !asset.height) throw new Error('Unable to read this photo. Please choose another image.');

  // A small, square JPEG also keeps browser mock persistence lightweight.
  const context = ImageManipulator.manipulate(asset.uri);
  let image;
  try {
    const side = Math.min(asset.width, asset.height);
    context.crop({ originX: (asset.width - side) / 2, originY: (asset.height - side) / 2, width: side, height: side });
    context.resize({ width: 256, height: 256 });
    image = await context.renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
    if (!saved.base64) throw new Error('Unable to prepare this photo. Please choose another image.');
    return `data:image/jpeg;base64,${saved.base64}`;
  } finally {
    image?.release();
    context.release();
  }
}
