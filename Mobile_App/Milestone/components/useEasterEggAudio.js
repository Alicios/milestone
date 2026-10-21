import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useRef } from 'react';

export default function useEasterEggAudio(source) {
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);
  const loaded = useRef({ player, source, ready: false });
  if (loaded.current.player !== player || loaded.current.source !== source) {
    loaded.current = { player, source, ready: false };
  }
  // Status events can still describe the previous source during a flip.
  if (player.isLoaded && status.isLoaded) loaded.current.ready = true;
  return { player, status: { ...status, isLoaded: loaded.current.ready } };
}
