import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

export default function useEasterEggAudio() {
  const player = useAudioPlayer(require('../assets/easter-egg/lebroooon-james.mp3'));
  const status = useAudioPlayerStatus(player);
  return { player, status };
}
