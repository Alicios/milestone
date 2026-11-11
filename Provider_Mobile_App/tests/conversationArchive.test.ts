import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveCursor, emptyConversationCursor, isConversationArchived, shouldCommitConversationSwipe, shouldStartConversationSwipe } from '../src/lib/conversationArchive';

test('archives through the displayed message and reopens for newer activity', () => {
  const cursor = '2026-11-10T18:00:00.123456Z';
  assert.equal(isConversationArchived(cursor, cursor), true);
  assert.equal(isConversationArchived('2026-11-10T18:00:00.123455Z', cursor), true);
  assert.equal(isConversationArchived('2026-11-10T18:00:00.123457Z', cursor), false);
  assert.equal(isConversationArchived(cursor, null), false);
});
test('archive comparisons handle timezone offsets and timestamp precision', () => {
  assert.equal(isConversationArchived('2026-11-10T10:00:00.123456-08:00', '2026-11-10T18:00:00.123456+00:00'), true);
  assert.equal(isConversationArchived('2026-11-10T18:00:00.1Z', '2026-11-10T18:00:00.100000Z'), true);
});
test('empty conversations can be archived and reopen on their first message', () => {
  assert.equal(archiveCursor(null), emptyConversationCursor);
  assert.equal(isConversationArchived(null, emptyConversationCursor), true);
  assert.equal(isConversationArchived('2026-11-10T18:00:00Z', emptyConversationCursor), false);
});
test('malformed timestamps cannot silently hide a conversation', () => {
  assert.equal(isConversationArchived('invalid', emptyConversationCursor), false);
  assert.equal(isConversationArchived(null, 'invalid'), false);
  assert.throws(() => archiveCursor('invalid'));
});
test('swipe intent excludes vertical scrolling and small movement', () => {
  assert.equal(shouldStartConversationSwipe(100, 2), true);
  assert.equal(shouldStartConversationSwipe(-100, 2), true);
  assert.equal(shouldStartConversationSwipe(10, 2), false);
  assert.equal(shouldStartConversationSwipe(20, 80), false);
});
test('left and right swipes commit only after distance or deliberate velocity', () => {
  assert.equal(shouldCommitConversationSwipe(100, 0, 320), true);
  assert.equal(shouldCommitConversationSwipe(-100, 0, 320), true);
  assert.equal(shouldCommitConversationSwipe(30, 3, 320), false);
  assert.equal(shouldCommitConversationSwipe(50, 0.8, 320), true);
  assert.equal(shouldCommitConversationSwipe(50, -0.8, 320), false);
  assert.equal(shouldCommitConversationSwipe(60, 0.1, 320), false);
});
