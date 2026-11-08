import sources from '../data/exerciseMedia.json' with { type: 'json' }
import previews from '../data/exerciseVideoPreviews.json' with { type: 'json' }
import type { DemoMedia } from './routinePrototype'
import { publicAsset } from './assets'
import { publicVideoPreview, type VideoPreview } from './videoPreview'

type ExerciseMediaSource = { kind: 'video-link' | 'image-link' | 'image'; url: string; source: string; title: string; accessNote?: string; sourceUrl?: string }
const mediaSources: Record<string, ExerciseMediaSource[]> = sources as Record<string, ExerciseMediaSource[]>
const byName = new Map(Object.entries(mediaSources).map(([name, media]) => [name.toLowerCase(), media]))
const videoPreviews = previews as Record<string, VideoPreview>

export function exerciseMedia(name: string): DemoMedia[] {
  return (byName.get(name.trim().toLowerCase()) ?? []).flatMap((item, index) => {
    const preview = item.kind === 'video-link' ? videoPreviews[item.url] ?? publicVideoPreview(item.url) : undefined
    // Unavailable videos are represented by the exercise's picture instead of an unplayable card.
    if (item.kind === 'video-link' && !preview) return []
    const replacement = item.source === 'PocketPhysio' && preview?.sourceUrl && preview.source ? preview : undefined
    const url = replacement?.sourceUrl ?? item.url
    return [{
      id: `catalog-media-${name}-${index}`, kind: item.kind, url: url.startsWith('/') ? publicAsset(url.slice(1)) : url,
      name: item.title, caption: replacement?.source ?? [item.source, item.accessNote].filter(Boolean).join(' · '),
      ...(item.sourceUrl ? { sourceUrl: item.sourceUrl } : {}),
      ...(preview ? { preview } : {}),
    }]
  })
}
