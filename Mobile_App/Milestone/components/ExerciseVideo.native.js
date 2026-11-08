import React, { useEffect } from 'react';
import { supabase } from '../lib/supabase';

function DirectVideo({ preview, active, onError }) {
  const { useVideoPlayer, VideoView } = require('expo-video');
  const player = useVideoPlayer(preview.url, instance => { instance.staysActiveInBackground = false; });
  useEffect(() => {
    const subscription = player.addListener('statusChange', ({ status }) => {
      if (status === 'error') onError();
    });
    if (active) player.play();
    else player.pause();
    // useVideoPlayer releases the native player on unmount.
    return () => subscription.remove();
  }, [player, active, onError]);
  return <VideoView player={player} style={{ width: '100%', height: '100%' }} nativeControls={active} contentFit="contain" surfaceType="textureView" />;
}

function EmbeddedVideo({ preview, title, onError }) {
  const { WebView } = require('react-native-webview');
  const escaped = preview.url.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const origin = supabase?.supabaseUrl;
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="strict-origin-when-cross-origin"><style>html,body,iframe{margin:0;width:100%;height:100%;border:0;background:#000}</style></head><body><iframe src="${escaped}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></body></html>`;
  return <WebView accessibilityLabel={title} source={{ html, baseUrl: origin }} style={{ flex: 1, backgroundColor: '#000' }} originWhitelist={['https://*']} allowsInlineMediaPlayback allowsFullscreenVideo mediaPlaybackRequiresUserAction onError={onError} onHttpError={onError} onContentProcessDidTerminate={onError} />;
}

export default function ExerciseVideo(props) {
  return props.preview.kind === 'video' ? <DirectVideo {...props} /> : <EmbeddedVideo {...props} />;
}
