import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import useEasterEggAudio from '../components/useEasterEggAudio.web';

jest.mock('expo-asset', () => ({ Asset: { fromModule: source => ({ uri: source }) } }));

let renderer;
let audio;
let originalAudio;
let instances;

class MockAudio {
  constructor(source) {
    this.src = source;
    this.readyState = 0;
    this.paused = true;
    this.ended = false;
    this.currentTime = 0;
    this.duration = 0;
    this.listeners = new Map();
    this.load = jest.fn();
    this.removeAttribute = jest.fn();
    this.pause = jest.fn(() => { this.paused = true; this.emit('pause'); });
    this.play = jest.fn(async () => { this.paused = false; this.emit('playing'); });
    instances.push(this);
  }
  addEventListener(event, listener) { this.listeners.set(event, listener); }
  removeEventListener(event) { this.listeners.delete(event); }
  emit(event) { this.listeners.get(event)?.(); }
  ready() { this.readyState = 4; this.duration = 3; this.emit('canplay'); }
}

function Harness({ source }) {
  audio = useEasterEggAudio(source);
  return null;
}

beforeEach(() => {
  instances = [];
  originalAudio = window.Audio;
  window.Audio = MockAudio;
});

afterEach(async () => {
  if (renderer) await ReactTestRenderer.act(() => renderer.unmount());
  window.Audio = originalAudio;
});

test('stops and releases the previous clip and resets loading status for the new photo', async () => {
  await ReactTestRenderer.act(() => { renderer = ReactTestRenderer.create(<Harness source="king.mp3" />); });
  const first = instances[0];
  await ReactTestRenderer.act(() => first.ready());
  await ReactTestRenderer.act(async () => audio.player.play());
  expect(audio.status.playing).toBe(true);

  await ReactTestRenderer.act(() => renderer.update(<Harness source="nfl.mp3" />));
  expect(first.pause).toHaveBeenCalledTimes(1);
  expect(first.removeAttribute).toHaveBeenCalledWith('src');
  expect(first.listeners.size).toBe(0);
  expect(instances[1].src).toBe('nfl.mp3');
  expect(audio.status.isLoaded).toBe(false);
  expect(audio.status.playing).toBe(false);
  await ReactTestRenderer.act(() => first.ready());
  expect(audio.status.isLoaded).toBe(false);
  await ReactTestRenderer.act(() => instances[1].ready());
  expect(audio.status.isLoaded).toBe(true);
  await ReactTestRenderer.act(async () => audio.player.play());
  expect(audio.status.playing).toBe(true);
  await ReactTestRenderer.act(() => renderer.unmount());
  renderer = null;
  expect(instances[1].pause).toHaveBeenCalled();
  expect(instances[1].removeAttribute).toHaveBeenCalledWith('src');
});

test('handles an interrupted play promise when flipping photos', async () => {
  await ReactTestRenderer.act(() => { renderer = ReactTestRenderer.create(<Harness source="king.mp3" />); });
  let rejectPlay;
  instances[0].play.mockImplementationOnce(() => new Promise((_, reject) => { rejectPlay = reject; }));
  const pending = audio.player.play();
  await ReactTestRenderer.act(() => renderer.update(<Harness source="basketball.mp3" />));
  const interrupted = Object.assign(new Error('Playback interrupted'), { name: 'AbortError' });
  rejectPlay(interrupted);
  await expect(pending).resolves.toBeUndefined();
  expect(instances[1].play).not.toHaveBeenCalled();
});

test('reports an active browser autoplay rejection so the manual play button can retry', async () => {
  await ReactTestRenderer.act(() => { renderer = ReactTestRenderer.create(<Harness source="king.mp3" />); });
  const rejection = Object.assign(new Error('User interaction required'), { name: 'NotAllowedError' });
  instances[0].play.mockRejectedValueOnce(rejection);
  await expect(audio.player.play()).rejects.toBe(rejection);
  await ReactTestRenderer.act(async () => audio.player.play());
  expect(audio.status.playing).toBe(true);
});
