import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const supportedOrientations = [
  'portrait', 'portrait-upside-down', 'landscape-left', 'landscape-right',
];

// Use the current app window, not device type or physical screen dimensions.
// Rotation, folding and split-screen resizing all update this hook in place.
export default function useAdaptiveLayout() {
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const availableWidth = Math.max(0, width - insets.left - insets.right);
  const availableHeight = Math.max(0, height - insets.top - insets.bottom);
  const readableWidth = availableWidth / Math.max(1, fontScale);
  return {
    width: availableWidth,
    height: availableHeight,
    isWide: readableWidth >= 840,
    isMedium: readableWidth >= 600,
    isShort: availableHeight < 500,
  };
}
