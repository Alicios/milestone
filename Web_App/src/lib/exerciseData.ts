import { supabase } from './supabase'
import type { CatalogExercise } from '../types'

export async function loadExercises(): Promise<CatalogExercise[]> {
  const { data, error } = await supabase.from('exercises').select('id, name, desc').order('name').order('id')
  if (error) throw error
  if (!data?.length) throw new Error('The exercise catalog is unavailable. Retry loading or contact your administrator.')
  return data.map((row) => ({ id: row.id, name: row.name, description: row.desc ?? '' }))
}
