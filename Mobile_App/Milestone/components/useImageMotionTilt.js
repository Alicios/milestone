import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Platform, useWindowDimensions } from 'react-native';
import { Accelerometer } from 'expo-sensors';

const maxTilt = 45;
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
  const [touchEnabled, setTouchEnabled] = useState(false);
  const touchAllowed = useRef(false);
  const touching = useRef(false);
  const touchOrigin = useRef({ x: 0, y: 0 });
  const sensorTarget = useRef({ x: 0, y: 0 });
  const pendingTarget = useRef({ x: 0, y: 0 });
  const frame = useRef(null);

  const queueTilt = useCallback(value => {
    pendingTarget.current = value;
    if (frame.current !== null) return;
    // Coalesce inputs to the display's refresh cadence (60/90/120 Hz, etc.).
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      Animated.timing(tilt, {
        toValue: pendingTarget.current,
        duration: 0,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    });
  }, [tilt]);

  const beginTouch = useCallback(() => {
    if (!touchAllowed.current) return;
    touching.current = true;
    touchOrigin.current = { ...pendingTarget.current };
  }, []);
  const moveTouch = useCallback((dx, dy, imageWidth, imageHeight) => {
    if (!touchAllowed.current || !touching.current || imageWidth <= 0 || imageHeight <= 0) return;
    queueTilt({ x: clamp(touchOrigin.current.x - dy / (imageHeight / 2) * maxTilt), y: clamp(touchOrigin.current.y + dx / (imageWidth / 2) * maxTilt) });
  }, [queueTilt]);
  const endTouch = useCallback(() => {
    if (!touching.current) return;
    touching.current = false;
    queueTilt(sensorTarget.current);
  }, [queueTilt]);

  useEffect(() => {
    let disposed = false;
    let subscription = null;
    let baseline = null;
    let direction = 1;
    let allowed = false;
    let reduced = false;
    let foreground = AppState.currentState !== 'background';
    let revision = 0;

    function allowTouch(value) { touchAllowed.current = value; setTouchEnabled(value); }

    function stop() {
      subscription?.remove();
      subscription = null;
      baseline = null;
      touching.current = false;
      sensorTarget.current = { x: 0, y: 0 };
      pendingTarget.current = { x: 0, y: 0 };
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      tilt.stopAnimation();
      tilt.setValue({ x: 0, y: 0 });
    }

    function start() {
      if (disposed || !allowed || reduced || !foreground || subscription) return;
      // 8 ms requests 125 Hz, providing fresh samples for 60+ Hz displays.
      Accelerometer.setUpdateInterval(8);
      subscription = Accelerometer.addListener(reading => {
        if (disposed || !foreground || reduced || ![reading.x, reading.y, reading.z].every(Number.isFinite)) return;
        if (Math.hypot(reading.x, reading.y, reading.z) < 0.1) return;
        if (!baseline) {
          direction = (landscape ? reading.x : reading.y) < 0 ? -1 : 1;
          baseline = angles(reading, landscape, direction);
          return;
        }
        const current = angles(reading, landscape, direction);
        sensorTarget.current = {
          x: clamp(-angleDifference(current.pitch, baseline.pitch) * 0.4),
          y: clamp(angleDifference(current.roll, baseline.roll) * 0.4),
        };
        if (!touching.current) queueTilt(sensorTarget.current);
      });
      setStatus('active');
    }

    async function initialize() {
      const currentRevision = ++revision;
      try {
        reduced = await AccessibilityInfo.isReduceMotionEnabled();
        if (disposed || currentRevision !== revision) return;
        allowTouch(!reduced && foreground);
        if (reduced) { stop(); setStatus('reduced'); return; }
        if (Platform.OS === 'web') { setStatus('unavailable'); return; }
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
      allowTouch(!value && foreground);
      revision += 1;
      stop();
      if (value) setStatus('reduced');
      else initialize();
    });
    const appState = AppState.addEventListener('change', value => {
      foreground = value === 'active';
      allowTouch(!reduced && foreground);
      if (foreground) start();
      else stop();
    });
    initialize();
    return () => {
      disposed = true;
      touchAllowed.current = false;
      revision += 1;
      stop();
      motionPreference.remove();
      appState.remove();
    };
  }, [landscape, retry, tilt, queueTilt]);

  return { tilt, status, enable, touchEnabled, beginTouch, moveTouch, endTouch };
}
