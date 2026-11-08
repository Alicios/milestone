import { AppError, normalizeError } from './errors'
import { supabase } from './supabase'
import type { CatalogExercise } from '../types'

export async function loadExercises(): Promise<CatalogExercise[]> {
  try {
    const catalog: CatalogExercise[] = []
    const pageSize = 500
    for (let offset = 0; ; offset += pageSize) {
      const { data, error, status: errorStatus } = await supabase.from('exercises').select('id, name, desc, exercise_media(media)')
        .order('name').order('id').range(offset, offset + pageSize - 1)
      if (error) throw normalizeError(error, { operation: 'loadExercises', status: errorStatus })
      catalog.push(...(data ?? []).map((row) => {
        const related = Array.isArray(row.exercise_media) ? row.exercise_media[0] : row.exercise_media
        return { id: row.id, name: row.name, description: row.desc ?? '', ...(related?.media ? { media: related.media } : {}) }
      }))
      if ((data?.length ?? 0) < pageSize) break
    }
    if (!catalog.length) throw new AppError('SERVICE_UNAVAILABLE', { message: 'The exercise catalog is unavailable. Retry loading or contact your administrator.' })
    return catalog
  } catch (error) {
    throw normalizeError(error, { operation: 'loadExercises' })
  }
}
