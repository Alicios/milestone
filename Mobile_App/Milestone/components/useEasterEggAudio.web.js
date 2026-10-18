import { useEffect, useMemo, useRef, useState } from 'react';
import { Asset } from 'expo-asset';

// Await HTMLAudioElement.play() so closing during startup handles AbortError.
export default function useEasterEggAudio() {
  const audioRef = useRef(null);
  const [status, setStatus] = useState({ isLoaded: false, playing: false, currentTime: 0, duration: 0, didJustFinish: false, error: null });

  useEffect(() => {
    const audio = new window.Audio(Asset.fromModule(require('../assets/easter-egg/lebroooon-james.mp3')).uri);
    audioRef.current = audio;
    audio.preload = 'auto';
    const update = () => setStatus({
      isLoaded: audio.readyState >= 2,
      playing: !audio.paused && !audio.ended,
      currentTime: audio.currentTime,
      duration: Number.isFinite(audio.duration) ? audio.duration : 0,
      didJustFinish: audio.ended,
      error: audio.error ? 'Unable to load sound.' : null,
    });
    const events = ['canplay', 'playing', 'pause', 'ended', 'timeupdate', 'error'];
    events.forEach(event => audio.addEventListener(event, update));
    audio.load();
    return () => {
      audioRef.current = null;
      events.forEach(event => audio.removeEventListener(event, update));
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };
  }, []);

  const player = useMemo(() => ({
    async play() {
      const audio = audioRef.current;
      if (!audio) return;
      try {
        await audio.play();
      } catch (error) {
        if (error.name !== 'AbortError' && audioRef.current === audio) throw error;
      }
    },
    pause() { audioRef.current?.pause(); },
    async seekTo(seconds) {
      if (audioRef.current) audioRef.current.currentTime = seconds;
    },
  }), []);

  return { player, status };
}
