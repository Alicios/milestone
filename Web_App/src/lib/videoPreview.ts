export type VideoPreview = { kind: 'embed' | 'video'; url: string; source?: string; sourceUrl?: string; poster?: string }

export function videoPreviewPoster(preview: VideoPreview) {
  if (preview.poster) return preview.poster
  const url = new URL(preview.url)
  if (url.hostname === 'www.youtube-nocookie.com' && /^\/embed\/[\w-]{11}$/.test(url.pathname)) {
    return `https://i.ytimg.com/vi/${url.pathname.split('/')[2]}/hqdefault.jpg`
  }
  return undefined
}

function startSeconds(value: string | null) {
  if (!value) return 0
  if (/^\d+$/.test(value)) return Number(value)
  const parts = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value)
  return parts ? Number(parts[1] ?? 0) * 3600 + Number(parts[2] ?? 0) * 60 + Number(parts[3] ?? 0) : 0
}

export function publicVideoPreview(raw: string): VideoPreview | undefined {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return undefined
    const host = url.hostname.toLowerCase()
    const path = url.pathname.split('/').filter(Boolean)
    if (['youtu.be', 'youtube.com', 'www.youtube.com', 'www.youtube-nocookie.com'].includes(host)) {
      const id = host === 'youtu.be' ? path[0] : path[0] === 'watch' ? url.searchParams.get('v') : ['embed', 'shorts'].includes(path[0]) ? path[1] : undefined
      if (!id || !/^[\w-]{11}$/.test(id)) return undefined
      const embed = new URL(`https://www.youtube-nocookie.com/embed/${id}`)
      const start = startSeconds(url.searchParams.get('start') ?? url.searchParams.get('t'))
      if (start > 0) embed.searchParams.set('start', String(start))
      embed.searchParams.set('playsinline', '1')
      return { kind: 'embed', url: embed.href }
    }
    if (['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(host)) {
      const id = host === 'player.vimeo.com' ? path[1] : path[0]
      if (!id || !/^\d+$/.test(id)) return undefined
      const embed = new URL(`https://player.vimeo.com/video/${id}`)
      const hash = url.searchParams.get('h') ?? (host !== 'player.vimeo.com' ? path[1] : undefined)
      if (hash && /^[\w]+$/.test(hash)) embed.searchParams.set('h', hash)
      return { kind: 'embed', url: embed.href }
    }
  } catch { /* Unsupported links retain their source link. */ }
  return undefined
}
