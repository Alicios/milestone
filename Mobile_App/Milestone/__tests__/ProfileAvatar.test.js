import React from 'react';
import { Image, Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import ProfileAvatar from '../components/ProfileAvatar';

test('shows the chosen photo and falls back to initials if it cannot load', async () => {
  let renderer;
  await ReactTestRenderer.act(async () => { renderer = ReactTestRenderer.create(<ProfileAvatar profile={{ fullName: 'Frank Murgolo', photoUri: 'file:///photo.jpg' }} />); });
  expect(renderer.root.findByType(Image).props.source.uri).toBe('file:///photo.jpg');
  await ReactTestRenderer.act(async () => renderer.root.findByType(Image).props.onError());
  expect(renderer.root.findByType(Text).props.children).toBe('F');
  await ReactTestRenderer.act(async () => renderer.update(<ProfileAvatar profile={{ fullName: 'Frank Murgolo', photoUri: 'file:///replacement.jpg' }} />));
  expect(renderer.root.findByType(Image).props.source.uri).toBe('file:///replacement.jpg');
  await ReactTestRenderer.act(async () => renderer.unmount());
});
