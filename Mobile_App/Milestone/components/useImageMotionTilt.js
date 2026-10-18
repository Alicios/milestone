import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Platform, useWindowDimensions } from 'react-native';
import { Accelerometer } from 'expo-sensors';

const maxTilt = 12;
const clamp = value => Math.max(-maxTilt, Math.min(maxTilt, value));
const angleDifference = (current, initial) => ((current - initial + 540) % 360) - 180;

function angles({ x, y, z }, landscape, direction) {
  const horizontal = landscape ? y * direction : x * direction;
  const vertical = landscape ? -x * direction : y * direction;
  return {
    pitch: Math.atan2(vertical, z) * 180 / Math.PI,
    roll: Math.atan2(horizontal, Math.sqrt(vertical ** 2 + z ** 2)) * 180 / Math.PI,
  };
}

export default function useImageMotionTilt() {
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const tilt = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const [status, setStatus] = useState('checking');
  const [retry, setRetry] = useState(0);
  const enable = useCallback(() => setRetry(value => value + 1), []);

  useEffect(() => {
    // The native accelerometer reports gravity in g; the web shim uses angles.
    if (Platform.OS === 'web') {
      setStatus('unavailable');
      return;
    }
    let disposed = false;
    let subscription = null;
    let baseline = null;
    let filtered = null;
    let direction = 1;
    let allowed = false;
    let reduced = false;
    let foreground = AppState.currentState !== 'background';
    let revision = 0;

    function stop() {
      subscription?.remove();
      subscription = null;
      baseline = null;
      filtered = null;
      tilt.stopAnimation();
      tilt.setValue({ x: 0, y: 0 });
    }

    function start() {
      if (disposed || !allowed || reduced || !foreground || subscription) return;
      Accelerometer.setUpdateInterval(50);
      subscription = Accelerometer.addListener(reading => {
        if (disposed || !foreground || reduced || ![reading.x, reading.y, reading.z].every(Number.isFinite)) return;
        if (Math.hypot(reading.x, reading.y, reading.z) < 0.1) return;
        if (!filtered) {
          filtered = { x: reading.x, y: reading.y, z: reading.z };
          direction = (landscape ? reading.x : reading.y) < 0 ? -1 : 1;
          baseline = angles(filtered, landscape, direction);
          return;
        }
        // Filter short acceleration spikes so shaking doesn't jerk the image.
        for (const axis of ['x', 'y', 'z']) filtered[axis] += (reading[axis] - filtered[axis]) * 0.2;
        const current = angles(filtered, landscape, direction);
        Animated.timing(tilt, {
          toValue: {
            x: clamp(-angleDifference(current.pitch, baseline.pitch) * 0.4),
            y: clamp(angleDifference(current.roll, baseline.roll) * 0.4),
          },
          duration: 80,
          useNativeDriver: true,
        }).start();
      });
      setStatus('active');
    }

    async function initialize() {
      const currentRevision = ++revision;
      try {
        reduced = await AccessibilityInfo.isReduceMotionEnabled();
        if (disposed || currentRevision !== revision) return;
        if (reduced) { stop(); setStatus('reduced'); return; }
        if (!await Accelerometer.isAvailableAsync()) {
          if (!disposed && currentRevision === revision) setStatus('unavailable');
          return;
        }
        if (disposed || currentRevision !== revision) return;
        let permission = await Accelerometer.getPermissionsAsync();
        if (disposed || currentRevision !== revision) return;
        if (!permission.granted && permission.canAskAgain) permission = await Accelerometer.requestPermissionsAsync();
        if (disposed || currentRevision !== revision) return;
        allowed = permission.granted;
        if (!allowed) { setStatus(permission.canAskAgain ? 'denied' : 'blocked'); return; }
        start();
      } catch {
        if (!disposed && currentRevision === revision) {
          stop();
          setStatus('unavailable');
        }
      }
    }

    const motionPreference = AccessibilityInfo.addEventListener('reduceMotionChanged', value => {
      reduced = value;
      revision += 1;
      stop();
      if (value) setStatus('reduced');
      else initialize();
    });
    const appState = AppState.addEventListener('change', value => {
      foreground = value === 'active';
      if (foreground) start();
      else stop();
    });
    initialize();
    return () => {
      disposed = true;
      revision += 1;
      stop();
      motionPreference.remove();
      appState.remove();
    };
  }, [landscape, retry, tilt]);

  return { tilt, status, enable };
}
