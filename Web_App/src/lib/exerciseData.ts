import { supabase } from './supabase'
import type { Exercise } from '../types'

export async function loadExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase.from('exercises').select('id, name, desc, created_at').order('name').order('id')
  if (error) throw error
  if (!data?.length) throw new Error('The exercise catalog is unavailable. Please contact your administrator.')
  return data.map((row) => ({ id: row.id, name: row.name, description: row.desc, createdAt: row.created_at }))
}
