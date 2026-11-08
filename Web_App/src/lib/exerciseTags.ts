// Prototype lookup tags use exercise names, never incidental words in the instructions.
const tagRules = [
  { id: 'hands', label: 'Hands & wrists', pattern: /\b(finger|thumb|wrist|putty|grip)\b/, names: [] },
  { id: 'feet', label: 'Feet & ankles', pattern: /\b(ankle|toe|foot|feet|plantar|gastrocnemius|soleus|heel raise|heel lowering|heel walking|wobble board)\b/, names: [] },
  { id: 'back', label: 'Back', pattern: /\b(thoracic|trunk|latissimus|back)\b/, names: ['Bird Dog', 'Cat-Cow', "Child's Pose", 'Prone Press-Up', 'Side-Lying Open Book', 'Thread the Needle', 'Resistance Band Row'] },
  { id: 'neck', label: 'Neck', pattern: /\b(cervical|chin|levator scapulae|upper trapezius)\b/, names: [] },
  { id: 'shoulders', label: 'Shoulders', pattern: /\b(shoulder|scapular|scaption|serratus|latissimus|prone t raise|prone w raise|prone y raise)\b/, names: ['Forearm Wall Slide', 'Doorway Chest Stretch', 'Wall Push-Up Plus', 'Resistance Band Row'] },
  { id: 'arms', label: 'Arms & elbows', pattern: /\b(elbow|forearm|biceps|triceps|punches|ergometer)\b/, names: ['Chair Press-Up'] },
  { id: 'hips', label: 'Hips', pattern: /\b(hip|glute|gluteal|clamshell|adductor|piriformis|lunge|bridge|romanian deadlift)\b/, names: ['Bent-Knee Fallout', 'Lateral Resistance Band Walk', 'Monster Walk'] },
  { id: 'legs', label: 'Knees & legs', pattern: /\b(knee|quadriceps|hamstring|squat|lunge|step up|step down|leg press|straight leg raise)\b/, names: ['Sit-to-Stand', 'Tall-Kneeling Heel Sit', 'Stair Ascent and Descent Practice', 'Heel Slide', 'Wall Sit'] },
  { id: 'core', label: 'Core', pattern: /\b(abdominal|pelvic|pallof|plank|bird dog|dead bug|chop|trunk rotation)\b/, names: ['Hooklying March', 'Supine Tabletop Toe Taps', 'Supine Hand-to-Thigh Isometric Press', 'Quadruped Arm Lift', 'Quadruped Knee Hover', 'Resistance Band Low-to-High Lift', 'Wall Shoulder Taps', 'Seated Stability Ball March'] },
  { id: 'balance', label: 'Balance & walking', pattern: /\b(balance|walking|stepping|gait|weight shift|march|marching|carry|obstacle|grapevine|wobble board)\b/, names: ['Single-Leg Clock Reach', 'Standing Multidirectional Reach', 'Stair Ascent and Descent Practice', 'Alternating Step Taps'] },
  { id: 'cardio', label: 'Cardio', pattern: /\b(cycling|elliptical|treadmill|stepper|ergometer)\b/, names: ['Low-Impact Step Jack', 'Seated Alternating Punches', 'Standing March in Place'] },
  { id: 'breathing', label: 'Breathing', pattern: /\bbreathing\b/, names: [] },
  { id: 'daily', label: 'Daily movements', pattern: /\b(transfer|bed rolling|scooting)\b/, names: ['Floor-to-Waist Lift', 'Shelf Reach and Place', 'Sit-to-Stand', 'Chair Press-Up', 'Walking While Carrying an Object'] },
] as const

export type ExerciseTag = typeof tagRules[number]['id']
export const exerciseTagOptions = tagRules.map(({ id, label }) => ({ id, label }))
const normalize = (name: string) => name.toLowerCase().replace(/[-–]/g, ' ').trim()

export function exerciseTags(name: string): ExerciseTag[] {
  const normalized = normalize(name)
  // These names refer to a movement cue or position rather than the target area.
  if (normalized === 'supine tabletop toe taps') return ['core']
  if (normalized === 'knee to wall ankle mobility') return ['feet']
  return tagRules.filter(({ pattern, names }) => pattern.test(normalized) || names.some((alias) => normalize(alias) === normalized)).map(({ id }) => id)
}

export function matchesExerciseTags(names: string[], selected: ExerciseTag[]) {
  return selected.length === 0 || names.some((name) => exerciseTags(name).some((tag) => selected.includes(tag)))
}
