import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export function useKeyboardLayout() {
  const [layout, setLayout] = useState({ visible: Keyboard.isVisible(), bottomInset: 0 });
  useEffect(() => {
    if (Platform.OS === 'web') {
      const viewport = window.visualViewport;
      const update = () => {
        // A browser can overlay the keyboard without resizing its layout viewport.
        const inset = viewport && Math.abs(viewport.scale - 1) < 0.01
          ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
        const visible = inset > 100;
        setLayout({ visible, bottomInset: visible ? inset : 0 });
      };
      update();
      viewport?.addEventListener('resize', update);
      viewport?.addEventListener('scroll', update);
      window.addEventListener('resize', update);
      return () => {
        viewport?.removeEventListener('resize', update);
        viewport?.removeEventListener('scroll', update);
        window.removeEventListener('resize', update);
      };
    }
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setLayout({ visible: true, bottomInset: 0 }));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setLayout({ visible: false, bottomInset: 0 }));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return layout;
}
