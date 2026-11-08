import type { CatalogExercise, Routine } from '../types'
import { exerciseMedia } from './exerciseMedia'
import type { VideoPreview } from './videoPreview'

export type DemoMedia = { id: string; kind: 'image' | 'uploaded-video' | 'youtube' | 'vimeo' | 'video-link' | 'image-link'; url: string; caption: string; name: string; sourceUrl?: string; preview?: VideoPreview }
export type DemoExercise = {
  id: string
  catalogId?: string
  name: string
  description: string
  sets: string
  repetitions: string
  duration: string
  rest: string
  notes: string
  media: DemoMedia[]
}
export type DemoRoutine = { id: string; name: string; description: string; exercises: DemoExercise[]; source?: 'provider' | 'template' }

export function copyPrototypeRoutine(routine: DemoRoutine): DemoRoutine {
  const copy = structuredClone(routine)
  return { ...copy, id: crypto.randomUUID(), name: `${routine.name} (copy)`, source: 'provider',
    exercises: copy.exercises.map((exercise) => ({ ...exercise, id: crypto.randomUUID(), media: exercise.media.map((item) => ({ ...item, id: crypto.randomUUID() })) })),
  }
}

export function providerPrototypeRoutines(routines: Routine[], catalog: CatalogExercise[]): DemoRoutine[] {
  const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]))
  const byName = new Map(catalog.map((exercise) => [exercise.name.toLowerCase(), exercise]))
  return routines.map((routine) => ({
    id: `provider-${routine.id}`, name: routine.name, description: '', source: 'provider',
    exercises: routine.exercises.map((exercise) => {
      const entry = exercise.exerciseId ? byId.get(exercise.exerciseId) : byName.get(exercise.name.toLowerCase())
      return {
        id: `provider-${routine.id}-${exercise.id}`, catalogId: exercise.exerciseId ?? entry?.id,
        name: entry?.name ?? exercise.name, description: entry?.description ?? '',
        sets: exercise.sets == null ? '' : String(exercise.sets),
        repetitions: exercise.reps == null ? '' : String(exercise.reps),
        duration: exercise.durationSeconds == null ? '' : String(exercise.durationSeconds),
        rest: '', notes: exercise.notes ?? '', media: exerciseMedia(entry?.name ?? exercise.name),
      }
    }),
  }))
}

type Template = { id: string; name: string; description: string; names: string[] }

export const routineTemplates: Template[] = [
  { id: 'shoulder-mobility', name: 'Shoulder Mobility', description: 'A starting collection of shoulder range-of-motion exercises.', names: ['Shoulder Pendulum', 'Shoulder Flexion Table Slide', 'Active Shoulder Flexion', 'Wand-Assisted Shoulder Abduction', 'Wand-Assisted Shoulder External Rotation'] },
  { id: 'shoulder-strength', name: 'Shoulder & Scapular Strength', description: 'Shoulder rotation and shoulder-blade control exercises for a provider to adapt.', names: ['Scapular Retraction', 'Resistance Band Row', 'Resistance Band Shoulder External Rotation', 'Resistance Band Shoulder Internal Rotation', 'Wall Push-Up Plus'] },
  { id: 'upper-body-mobility', name: 'Upper Body Mobility', description: 'Thoracic and chest mobility exercises from the shared catalog.', names: ['Seated Thoracic Rotation', 'Seated Thoracic Extension over Chair', 'Side-Lying Open Book', 'Doorway Chest Stretch', 'Thread the Needle'] },
  { id: 'core-control', name: 'Core Control', description: 'A draft collection of trunk control exercises with different support positions.', names: ['Abdominal Bracing', 'Posterior Pelvic Tilt', 'Hooklying March', 'Dead Bug', 'Bird Dog'] },
  { id: 'back-mobility', name: 'Back Mobility', description: 'A draft selection of comfortable trunk and spinal movement options.', names: ['Cat-Cow', 'Supine Lower Trunk Rotation', "Child's Pose", 'Seated Thoracic Flexion', 'Quadruped Thoracic Rotation'] },
  { id: 'hip-mobility', name: 'Hip Mobility', description: 'Hip rotation, flexor, and gluteal stretch options.', names: ['Seated 90/90 Hip Rotation Switch', 'Half-Kneeling Hip Flexor Stretch', 'Supine Figure-Four Piriformis Stretch', 'Butterfly Adductor Stretch', 'Adductor Rockback'] },
  { id: 'hip-strength', name: 'Hip & Glute Strength', description: 'A starting collection of hip and gluteal strengthening exercises.', names: ['Glute Bridge', 'Clamshell', 'Side-Lying Hip Abduction', 'Prone Hip Extension', 'Lateral Resistance Band Walk'] },
  { id: 'knee-motion', name: 'Knee Motion & Activation', description: 'Knee movement and quadriceps activation options for provider review.', names: ['Heel Slide', 'Quadriceps Set', 'Short Arc Quadriceps Extension', 'Seated Knee Extension', 'Straight Leg Raise'] },
  { id: 'lower-body-function', name: 'Lower Body Function', description: 'Chair rise, squat, step, and heel-raise exercises from the catalog.', names: ['Sit-to-Stand', 'Mini Squat', 'Forward Step-Up', 'Standing Bilateral Heel Raise', 'Standing Hamstring Curl'] },
  { id: 'ankle-mobility', name: 'Foot & Ankle Mobility', description: 'Ankle movement, calf flexibility, and foot control options.', names: ['Ankle Pumps', 'Ankle Circles', 'Knee-to-Wall Ankle Mobility', 'Standing Gastrocnemius Stretch', 'Standing Soleus Stretch', 'Toe Yoga'] },
  { id: 'ankle-strength', name: 'Foot & Ankle Strength', description: 'Resistance and foot control exercises for a provider to tailor.', names: ['Resistance Band Ankle Dorsiflexion', 'Resistance Band Ankle Plantar Flexion', 'Resistance Band Ankle Inversion', 'Resistance Band Ankle Eversion', 'Short Foot Exercise', 'Towel Toe Curls'] },
  { id: 'balance', name: 'Supported Balance', description: 'Standing balance and weight-shift options. Review the support required for each patient.', names: ['Feet-Together Balance', 'Semi-Tandem Balance', 'Tandem Balance', 'Single-Leg Balance', 'Lateral Weight Shift'] },
  { id: 'walking', name: 'Walking & Stepping', description: 'Walking and stepping practice options with support selected by the provider.', names: ['Sideways Walking', 'Tandem Walking', 'Alternating Step Taps', 'Stepping Turns', 'Forward Walking with Heel-to-Toe Pattern'] },
  { id: 'hand-wrist', name: 'Hand & Wrist Mobility', description: 'A draft collection for wrist movement, finger mobility, and thumb control.', names: ['Wrist Circles', 'Wrist Flexor Stretch', 'Wrist Extensor Stretch', 'Finger Tendon Glides', 'Thumb Opposition'] },
]

export function catalogExercise(exercise: CatalogExercise, id: string = crypto.randomUUID()): DemoExercise {
  return { id, catalogId: exercise.id, name: exercise.name, description: exercise.description, sets: '', repetitions: '', duration: '', rest: '', notes: '', media: exerciseMedia(exercise.name) }
}

export function buildPrototypeRoutines(catalog: CatalogExercise[]) {
  const byName = new Map(catalog.map((exercise) => [exercise.name.toLowerCase(), exercise]))
  const missing: string[] = []
  const routines = routineTemplates.map((template): DemoRoutine => ({
    id: `prototype-${template.id}`, name: template.name, description: template.description, source: 'template',
    exercises: template.names.flatMap((name, index) => {
      const exercise = byName.get(name.toLowerCase())
      if (!exercise) { missing.push(name); return [] }
      return [catalogExercise(exercise, `${template.id}-${index}-${exercise.id}`)]
    }),
  })).filter((routine) => routine.exercises.length > 0)
  return { routines, missing }
}
