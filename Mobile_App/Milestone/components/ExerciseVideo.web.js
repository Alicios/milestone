import React from 'react';

export default function ExerciseVideo({ preview, title, active, onError }) {
  const style = { width: '100%', height: '100%', border: 0, background: '#000', objectFit: 'contain' };
  if (preview.kind === 'embed') {
    return <iframe title={title} src={preview.url} style={style} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" onError={onError} />;
  }
  return <video aria-label={title} src={`${preview.url}${preview.url.includes('#') ? '' : '#t=0.1'}`} style={style} controls={active} autoPlay={active} playsInline preload="metadata" poster={preview.poster} onError={onError} />;
}
