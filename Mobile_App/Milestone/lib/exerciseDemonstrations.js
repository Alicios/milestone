import { supabase } from './supabase';

export function httpsUrl(value) {
  if (typeof value !== 'string') return undefined;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined; }
  catch { return undefined; }
}

export function normalizeDemonstrations(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const bundled = typeof item.url === 'string' && /^\/exercise-media\/[a-z0-9-]+\.png$/.test(item.url);
    const url = bundled ? item.url : httpsUrl(item.url);
    if (!url || !['image', 'image-link', 'video-link'].includes(item.kind)) return [];
    const base = { kind: item.kind, url, title: String(item.title || 'Exercise demonstration'), source: String(item.source || ''), sourceUrl: httpsUrl(item.sourceUrl), accessNote: String(item.accessNote || '') };
    if (item.kind !== 'video-link') return [base];
    const previewUrl = httpsUrl(item.preview?.url);
    const embed = previewUrl && /^https:\/\/(www\.youtube-nocookie\.com\/embed\/|player\.vimeo\.com\/video\/)/.test(previewUrl);
    const video = previewUrl && item.preview?.kind === 'video' && /\.mp4(?:[?#]|$)/i.test(previewUrl);
    return [{ ...base, preview: embed || video ? { kind: video ? 'video' : 'embed', url: previewUrl, poster: httpsUrl(item.preview.poster) } : undefined }];
  });
}

export async function loadAssignmentDemonstrations(assignmentId) {
  const { data, error } = await supabase.rpc('get_my_routine_assignment_media', { p_routine_assignment_id: assignmentId });
  if (error) throw error;
  const rows = await Promise.all((data || []).filter(row => row.assignment_exercise_id).map(async row => {
    const media = await Promise.all((Array.isArray(row.media) ? row.media : []).map(async item => {
      if (!item?.storagePath) return item;
      const { data: signed, error: signError } = await supabase.storage.from('routine-media').createSignedUrl(item.storagePath, 3600);
      if (signError) throw signError;
      return { ...item, url: signed.signedUrl,
        preview: item.preview?.kind === 'video' ? { ...item.preview, url: signed.signedUrl } : item.preview };
    }));
    return [row.assignment_exercise_id, {
      exerciseId: row.exercise_id,
      instructions: typeof row.instructions === 'string' ? row.instructions : '',
      media: normalizeDemonstrations(media),
    }];
  }));
  return new Map(rows);
}
