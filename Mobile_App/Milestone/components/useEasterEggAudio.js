import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

export default function useEasterEggAudio(source) {
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);
  // Status events can still describe the previous source during a flip.
  return { player, status: { ...status, isLoaded: player.isLoaded && status.isLoaded } };
}
