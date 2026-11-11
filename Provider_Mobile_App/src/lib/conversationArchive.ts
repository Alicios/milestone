export const emptyConversationCursor = '1970-01-01T00:00:00.000Z';

// Keep PostgreSQL's microseconds when comparing cursors. Date alone loses the
// final three digits and could hide a message arriving in the same millisecond.
function timestampKey(value: string): string | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const fraction = value.match(/\.(\d+)/)?.[1] ?? '';
  return `${date.toISOString().slice(0, 19)}.${fraction.padEnd(6, '0').slice(0, 6)}Z`;
}
export function isConversationArchived(lastMessageAt: string | null, archivedThroughAt: string | null): boolean {
  if (!archivedThroughAt) return false;
  const cursor = timestampKey(archivedThroughAt);
  if (!cursor) return false;
  if (!lastMessageAt) return true;
  const latest = timestampKey(lastMessageAt);
  return latest !== null && latest <= cursor;
}
export function archiveCursor(lastMessageAt: string | null): string {
  if (lastMessageAt !== null && !timestampKey(lastMessageAt)) throw new Error('The conversation timestamp is unavailable. Refresh and try again.');
  return lastMessageAt ?? emptyConversationCursor;
}
export function shouldStartConversationSwipe(dx: number, dy: number): boolean {
  return Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5;
}
export function shouldCommitConversationSwipe(dx: number, vx: number, width: number): boolean {
  return Math.abs(dx) >= Math.max(72, width * 0.25) || (Math.abs(dx) >= 40 && Math.abs(vx) > 0.6 && Math.sign(dx) === Math.sign(vx));
}
