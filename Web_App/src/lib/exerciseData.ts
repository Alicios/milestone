import { AppError, normalizeError } from './errors'
import { supabase } from './supabase'
import type { CatalogExercise } from '../types'

export async function loadExercises(): Promise<CatalogExercise[]> {
  try {
    const { data, error, status: errorStatus } = await supabase.from('exercises').select('id, name, desc').order('name').order('id')
    if (error) throw normalizeError(error, { operation: 'loadExercises', status: errorStatus })
    if (!data?.length) throw new AppError('SERVICE_UNAVAILABLE', { message: 'The exercise catalog is unavailable. Retry loading or contact your administrator.' })
    return data.map((row) => ({ id: row.id, name: row.name, description: row.desc ?? '' }))
  } catch (error) {
    throw normalizeError(error, { operation: 'loadExercises' })
  }
}
