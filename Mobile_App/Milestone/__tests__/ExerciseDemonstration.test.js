import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AppState, Image, Modal, Pressable } from 'react-native';
import ExerciseDemonstration from '../components/ExerciseDemonstration';
import ExerciseVideo from '../components/ExerciseVideo';
import { loadAssignmentDemonstrations } from '../lib/exerciseDemonstrations';
jest.mock('../components/ExerciseVideo', () => jest.fn(() => null));
jest.mock('../lib/exerciseDemonstrations', () => ({ loadAssignmentDemonstrations: jest.fn() }));
jest.mock('../lib/exerciseMediaAssets', () => ({ '/exercise-media/leg-press.png': 10 }));
const exercise = { id: 'one', name: 'Leg press', assignmentExerciseId: 'one', routineAssignmentId: 'assignment', media: [
  { kind: 'image', url: '/exercise-media/leg-press.png', title: 'Illustration', source: 'Milestone' },
  { kind: 'video-link', url: 'https://youtu.be/abcdefghijk', title: 'Video', preview: { kind: 'embed', url: 'https://www.youtube-nocookie.com/embed/abcdefghijk', poster: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg' } },
] };
const press = async (tree, label) => act(async () => tree.root.findAll(item => item.props.accessibilityLabel === label && typeof item.props.onPress === 'function')[0].props.onPress());
beforeEach(() => jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() }));
afterEach(() => jest.restoreAllMocks());
test('pictures are inline and enlarge, video starts on request and closes when app backgrounds', async () => {
  let listener;
  const remove = jest.fn();
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => { listener = callback; return { remove }; });
  let tree;
  await act(async () => { tree = renderer.create(<ExerciseDemonstration exercise={exercise} />); });
  expect(tree.root.findAllByType(Image).some(image => image.props.source === 10)).toBe(true);
  expect(tree.root.findAllByType(ExerciseVideo)).toHaveLength(0);
  await press(tree, 'Enlarge demonstration for Leg press');
  expect(tree.root.findByType(Modal).props.visible).toBe(true);
  await press(tree, 'Close enlarged demonstration');
  expect(tree.root.findByType(Modal).props.visible).toBe(false);
  await press(tree, 'Play demonstration for Leg press');
  expect(tree.root.findByType(ExerciseVideo).props.active).toBe(true);
  await act(async () => listener('background'));
  expect(tree.root.findAllByType(ExerciseVideo)).toHaveLength(0);
  await act(async () => tree.unmount());
  expect(remove).toHaveBeenCalled(); spy.mockRestore();
});
test('media retry fetches only demonstrations and restores inline content', async () => {
  loadAssignmentDemonstrations.mockResolvedValue(new Map([['one', { media: exercise.media }]]));
  let tree;
  await act(async () => { tree = renderer.create(<ExerciseDemonstration exercise={{ ...exercise, media: [], mediaError: 'Offline' }} />); });
  await press(tree, 'Retry exercise media');
  expect(loadAssignmentDemonstrations).toHaveBeenCalledWith('assignment');
  expect(tree.root.findAllByType(Image).length).toBe(2);
  await act(async () => tree.unmount());
});
