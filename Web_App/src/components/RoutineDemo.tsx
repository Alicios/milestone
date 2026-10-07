import { useEffect, useMemo, useRef, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import EditIcon from '@mui/icons-material/Edit'
import LinkIcon from '@mui/icons-material/Link'
import { Alert, Box, Button, Card, CardContent, Chip, Divider, Stack, TextField, Typography, useTheme } from '@mui/material'
import { alpha } from '@mui/material/styles'

type MediaKind = 'image' | 'uploaded-video' | 'youtube' | 'vimeo'
type DemoMedia = { id: string; kind: MediaKind; url: string; caption: string; name: string }
type DemoExercise = {
  id: string
  name: string
  description: string
  sets: string
  repetitions: string
  duration: string
  rest: string
  notes: string
  media: DemoMedia[]
}
type DemoRoutine = { id: string; name: string; description: string; media: DemoMedia[]; exercises: DemoExercise[] }

const MAX_ITEMS = 5
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_VIDEO_BYTES = 50 * 1024 * 1024
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const videoTypes = new Set(['video/mp4', 'video/webm'])

function newExercise(): DemoExercise {
  return { id: crypto.randomUUID(), name: '', description: '', sets: '', repetitions: '', duration: '', rest: '', notes: '', media: [] }
}

const sampleRoutines: DemoRoutine[] = [
  {
    id: 'demo-lower-body',
    name: 'Lower Body Mobility',
    description: 'A gentle mobility routine to prepare for walking and daily movement.',
    media: [{ id: 'demo-photo', kind: 'image', url: '/physical-therapy.webp', caption: 'Routine overview', name: 'Example picture' }],
    exercises: [
      { id: 'demo-squat', name: 'Supported Sit to Stand', description: 'Rise from a chair with controlled movement. Use the armrests if needed.', sets: '2', repetitions: '8', duration: '', rest: '60', notes: 'Stop if pain increases.', media: [] },
      { id: 'demo-raise', name: 'Standing Heel Raise', description: 'Hold a stable surface and lift both heels slowly.', sets: '2', repetitions: '10', duration: '', rest: '45', notes: '', media: [] },
    ],
  },
  {
    id: 'demo-balance',
    name: 'Balance Practice',
    description: 'Short balance exercises with support close by.',
    media: [],
    exercises: [{ id: 'demo-stand', name: 'Supported Single Leg Stand', description: 'Stand near a counter and lift one foot slightly.', sets: '2', repetitions: '', duration: '20', rest: '30', notes: 'Repeat on each side.', media: [] }],
  },
  {
    id: 'demo-upper-body-mobility',
    name: 'Upper Body Mobility',
    description: 'Gentle movements for the upper back, chest, and shoulders to support comfortable reaching and upright posture.',
    media: [{ id: 'demo-upper-body-video', kind: 'youtube', url: 'https://www.youtube.com/watch?v=XXwXJ1IAzxc', caption: 'NHS guidance for preventing and easing shoulder pain', name: 'Upper body mobility overview' }],
    exercises: [
      { id: 'demo-thoracic-rotation', name: 'Seated Thoracic Rotation', description: 'Sit tall with your arms crossed over your chest. Rotate your upper body slowly to one side, return to center, and repeat on the other side.', sets: '2', repetitions: '8', duration: '', rest: '30', notes: 'Keep your hips facing forward and move only through a comfortable range.', media: [] },
      { id: 'demo-doorway-stretch', name: 'Doorway Chest Stretch', description: 'Place your forearms against a doorway and step forward gently until you feel a stretch across the front of your chest.', sets: '2', repetitions: '', duration: '30', rest: '30', notes: 'Keep your shoulders relaxed and stop if the stretch causes pain or tingling.', media: [] },
      { id: 'demo-wall-slides', name: 'Wall Slides', description: 'Stand with your back near a wall and slide your arms upward slowly, then return to the starting position with control.', sets: '2', repetitions: '10', duration: '', rest: '45', notes: 'Use the range prescribed by your clinician and avoid shrugging your shoulders.', media: [] },
    ],
  },
  {
    id: 'demo-core-stability',
    name: 'Core Stability',
    description: 'Controlled trunk exercises that build support for everyday movement while maintaining a neutral spine.',
    media: [{ id: 'demo-core-video', kind: 'youtube', url: 'https://www.youtube.com/watch?v=E2VEV505574', caption: 'NHS back care class focused on strength and flexibility', name: 'Core stability overview' }],
    exercises: [
      { id: 'demo-abdominal-brace', name: 'Abdominal Brace', description: 'Lie on your back with your knees bent. Gently tighten your lower abdominal muscles while breathing normally.', sets: '2', repetitions: '10', duration: '5', rest: '30', notes: 'Do not hold your breath or press your lower back forcefully into the floor.', media: [] },
      { id: 'demo-bridge', name: 'Bridge', description: 'From a bent-knee position, tighten your abdomen and lift your hips until your shoulders, hips, and knees form a comfortable line.', sets: '2', repetitions: '10', duration: '', rest: '45', notes: 'Lower slowly and stop if symptoms increase in your back or legs.', media: [] },
      { id: 'demo-bird-dog', name: 'Bird Dog', description: 'From hands and knees, extend one arm and the opposite leg while keeping your trunk steady, then alternate sides.', sets: '2', repetitions: '8', duration: '', rest: '45', notes: 'Use an arm-only or leg-only variation if directed by your clinician.', media: [] },
    ],
  },
  {
    id: 'demo-post-op-knee',
    name: 'Post-Op Knee Recovery',
    description: 'Early mobility and strengthening examples for rebuilding knee motion and quadriceps control after surgery.',
    media: [{ id: 'demo-post-op-knee-video', kind: 'youtube', url: 'https://www.youtube.com/watch?v=emO4tQxtR0U', caption: 'CHKD sports medicine home exercise program for post-operative knee recovery', name: 'Post-op knee recovery overview' }],
    exercises: [
      { id: 'demo-heel-slides', name: 'Heel Slides', description: 'Lie on your back and slowly slide your heel toward your body to bend the knee, then return the leg to a comfortable straight position.', sets: '3', repetitions: '10', duration: '', rest: '30', notes: 'Follow the motion limits and weight-bearing precautions provided by your surgical team.', media: [] },
      { id: 'demo-quad-sets', name: 'Quad Sets', description: 'With your leg supported and straight, tighten the muscle on the front of your thigh by gently pressing the knee downward.', sets: '3', repetitions: '10', duration: '5', rest: '30', notes: 'Keep the rest of your leg relaxed and do not force the knee into pain.', media: [] },
      { id: 'demo-straight-leg-raise', name: 'Straight-Leg Raise', description: 'Tighten your thigh, keep the knee straight, and lift the leg a short distance before lowering it slowly.', sets: '2', repetitions: '8', duration: '', rest: '60', notes: 'Perform only after your clinician confirms you can keep the knee fully straight during the lift.', media: [] },
    ],
  },
  {
    id: 'demo-shoulder-rehabilitation',
    name: 'Shoulder Rehabilitation',
    description: 'A gradual shoulder program emphasizing relaxed motion, shoulder-blade control, and assisted range of motion.',
    media: [{ id: 'demo-shoulder-rehabilitation-video', kind: 'youtube', url: 'https://www.youtube.com/watch?v=5duN9yeTFYk', caption: 'Shoulder exercises demonstrated by North Bristol NHS Trust physiotherapists', name: 'Shoulder rehabilitation overview' }],
    exercises: [
      { id: 'demo-pendulum', name: 'Pendulum', description: 'Support yourself with one hand, let the involved arm relax, and use gentle body movement to create small circles.', sets: '2', repetitions: '', duration: '30', rest: '30', notes: 'Keep the arm relaxed and stay within the restrictions provided by your clinician.', media: [] },
      { id: 'demo-scapular-retraction', name: 'Scapular Retraction', description: 'Sit or stand tall and draw your shoulder blades gently back and down without lifting your shoulders.', sets: '2', repetitions: '10', duration: '5', rest: '30', notes: 'Avoid arching your lower back or forcing the shoulder blades together.', media: [] },
      { id: 'demo-assisted-flexion', name: 'Assisted Shoulder Flexion', description: 'Use the unaffected arm or a cane to help raise the involved arm forward, then lower it slowly.', sets: '2', repetitions: '10', duration: '', rest: '45', notes: 'Do not move beyond your prescribed range or through increasing pain.', media: [] },
    ],
  },
  {
    id: 'demo-low-back-relief',
    name: 'Low-Back Relief',
    description: 'Low-impact mobility exercises intended to reduce stiffness and encourage comfortable lower-back movement.',
    media: [{ id: 'demo-low-back-video', kind: 'youtube', url: 'https://www.youtube.com/watch?v=nII38aNoSKc', caption: 'NHS back care class with low-impact strength and flexibility exercises', name: 'Low-back relief overview' }],
    exercises: [
      { id: 'demo-knee-rolls', name: 'Knee Rolls', description: 'Lie on your back with your knees bent and slowly roll both knees from side to side within a comfortable range.', sets: '2', repetitions: '10', duration: '', rest: '30', notes: 'Keep your shoulders relaxed against the surface and make the movement small if needed.', media: [] },
      { id: 'demo-single-knee-to-chest', name: 'Single Knee-to-Chest', description: 'Bring one knee gently toward your chest while the other leg stays comfortable, then switch sides.', sets: '2', repetitions: '8', duration: '10', rest: '30', notes: 'Hold behind the thigh if gripping the knee is uncomfortable.', media: [] },
      { id: 'demo-pelvic-tilts', name: 'Pelvic Tilts', description: 'With your knees bent, gently tilt your pelvis to flatten and release the curve of your lower back.', sets: '2', repetitions: '10', duration: '', rest: '30', notes: 'Use slow, comfortable motion and stop if back or leg symptoms worsen.', media: [] },
    ],
  },
]

function videoEmbed(media: DemoMedia) {
  if (media.kind === 'youtube') {
    const parsed = new URL(media.url)
    const id = parsed.hostname === 'youtu.be' ? parsed.pathname.slice(1) : parsed.searchParams.get('v') ?? parsed.pathname.split('/').filter(Boolean).at(-1)
    return `https://www.youtube-nocookie.com/embed/${id}`
  }
  const id = new URL(media.url).pathname.split('/').filter(Boolean).at(-1)
  return `https://player.vimeo.com/video/${id}`
}

function parseVideoLink(raw: string): Pick<DemoMedia, 'kind' | 'url' | 'name'> | null {
  try {
    const url = new URL(raw.trim())
    if (url.protocol !== 'https:') return null
    const host = url.hostname.toLowerCase()
    if (host === 'youtu.be') {
      const id = url.pathname.slice(1)
      return /^[\w-]{11}$/.test(id) ? { kind: 'youtube', url: `https://youtu.be/${id}`, name: 'YouTube video' } : null
    }
    if (host === 'youtube.com' || host === 'www.youtube.com' || host === 'www.youtube-nocookie.com') {
      const path = url.pathname.split('/').filter(Boolean)
      const id = path[0] === 'watch' ? url.searchParams.get('v') : path[0] === 'shorts' || path[0] === 'embed' ? path[1] : null
      return id && /^[\w-]{11}$/.test(id) ? { kind: 'youtube', url: `https://www.youtube.com/watch?v=${id}`, name: 'YouTube video' } : null
    }
    if (host === 'vimeo.com' || host === 'www.vimeo.com') {
      const id = url.pathname.split('/').filter(Boolean).at(-1)
      return id && /^\d+$/.test(id) ? { kind: 'vimeo', url: `https://vimeo.com/${id}`, name: 'Vimeo video' } : null
    }
  } catch {
    return null
  }
  return null
}

function MediaGallery({ media, editing, onChange }: { media: DemoMedia[]; editing?: boolean; onChange?: (next: DemoMedia[]) => void }) {
  const [link, setLink] = useState('')
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  function addFiles(files: FileList | null) {
    if (!files || !onChange) return
    const next = [...media]
    for (const file of Array.from(files)) {
      if (next.length >= MAX_ITEMS) { setError(`Each gallery can contain up to ${MAX_ITEMS} items.`); break }
      const kind = imageTypes.has(file.type) ? 'image' : videoTypes.has(file.type) ? 'uploaded-video' : null
      if (!kind) { setError(`${file.name}: choose a JPEG, PNG, WebP, MP4, or WebM file.`); continue }
      const maxBytes = kind === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES
      if (file.size > maxBytes) { setError(`${file.name}: ${kind === 'image' ? 'pictures must be under 10 MB' : 'videos must be under 50 MB'}.`); continue }
      next.push({ id: crypto.randomUUID(), kind, url: URL.createObjectURL(file), caption: '', name: file.name })
    }
    onChange(next)
    if (fileInput.current) fileInput.current.value = ''
  }

  function addLink() {
    if (!onChange) return
    if (media.length >= MAX_ITEMS) { setError(`Each gallery can contain up to ${MAX_ITEMS} items.`); return }
    const parsed = parseVideoLink(link)
    if (!parsed) { setError('Paste a valid public YouTube or Vimeo video link.'); return }
    onChange([...media, { id: crypto.randomUUID(), ...parsed, caption: '' }])
    setLink('')
    setError('')
  }

  return <Stack spacing={1.5}>
    {media.length === 0 && <Typography variant="body2" color="text.secondary">No pictures or videos added.</Typography>}
    {media.map((item, index) => <Card key={item.id} variant="outlined" sx={{ overflow: 'hidden' }}>
      <Box sx={{ bgcolor: 'action.hover', aspectRatio: '16 / 9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {item.kind === 'image' ? <Box component="img" src={item.url} alt={item.caption || item.name} sx={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          : item.kind === 'uploaded-video' ? <Box component="video" src={item.url} controls preload="metadata" sx={{ width: '100%', height: '100%' }} />
            : <Box component="iframe" src={videoEmbed(item)} title={item.caption || item.name} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" sx={{ border: 0, width: '100%', height: '100%' }} />}
      </Box>
      <CardContent sx={{ pb: '12px !important' }}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{item.name}</Typography>
          <Chip size="small" label={item.kind === 'image' ? 'Picture' : item.kind === 'uploaded-video' ? 'Video file' : item.kind === 'youtube' ? 'YouTube' : 'Vimeo'} />
        </Stack>
        {editing && onChange ? <>
          <TextField label="Caption or image description" size="small" fullWidth value={item.caption} onChange={(event) => onChange(media.map((current) => current.id === item.id ? { ...current, caption: event.target.value } : current))} sx={{ mt: 1.5 }} />
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button size="small" disabled={index === 0} onClick={() => { const next = [...media]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next) }}>Move up</Button>
            <Button size="small" disabled={index === media.length - 1} onClick={() => { const next = [...media]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; onChange(next) }}>Move down</Button>
            <Button size="small" color="error" onClick={() => onChange(media.filter((current) => current.id !== item.id))}>Remove</Button>
          </Stack>
        </> : item.caption && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{item.caption}</Typography>}
      </CardContent>
    </Card>)}
    {editing && onChange && <>
      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <Button component="label" variant="outlined" startIcon={<AddIcon />} disabled={media.length >= MAX_ITEMS}>Add picture or video<input ref={fileInput} type="file" hidden multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={(event) => addFiles(event.target.files)} /></Button>
        <TextField size="small" label="YouTube or Vimeo link" value={link} onChange={(event) => setLink(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addLink() } }} sx={{ flex: 1 }} />
        <Button variant="outlined" startIcon={<LinkIcon />} onClick={addLink} disabled={!link.trim() || media.length >= MAX_ITEMS}>Add link</Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">Demo files preview in this browser only. Pictures: up to 10 MB. Videos: up to 50 MB.</Typography>
    </>}
  </Stack>
}

function Dosage({ exercise }: { exercise: DemoExercise }) {
  const parts = [exercise.sets && `${exercise.sets} sets`, exercise.repetitions && `${exercise.repetitions} reps`, exercise.duration && `${exercise.duration} sec duration`, exercise.rest && `${exercise.rest} sec rest`].filter(Boolean)
  return parts.length ? <Typography variant="body2" color="text.secondary">{parts.join(' · ')}</Typography> : null
}

function invalidDosage(value: string) {
  return value !== '' && (!/^\d+$/.test(value) || Number(value) > 9999)
}

export function RoutineDemo() {
  const theme = useTheme()
  const invalidInputSx = { '& .MuiOutlinedInput-root': { bgcolor: alpha(theme.palette.error.main, theme.palette.mode === 'dark' ? 0.22 : 0.14) } }
  const [routines, setRoutines] = useState<DemoRoutine[]>(sampleRoutines)
  const [selectedId, setSelectedId] = useState(sampleRoutines[0].id)
  const [draft, setDraft] = useState<DemoRoutine | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [validationAttempted, setValidationAttempted] = useState(false)
  const objectUrls = useRef(new Set<string>())
  const selected = routines.find((routine) => routine.id === selectedId) ?? routines[0]
  const filtered = useMemo(() => routines.filter((routine) => routine.name.toLowerCase().includes(query.toLowerCase())), [routines, query])

  useEffect(() => () => { objectUrls.current.forEach((url) => URL.revokeObjectURL(url)) }, [])

  function updateMedia(owner: 'routine' | string, next: DemoMedia[]) {
    for (const media of next) if (media.url.startsWith('blob:')) objectUrls.current.add(media.url)
    setDraft((current) => {
      if (!current) return current
      return owner === 'routine' ? { ...current, media: next } : { ...current, exercises: current.exercises.map((exercise) => exercise.id === owner ? { ...exercise, media: next } : exercise) }
    })
  }

  function updateExercise(id: string, field: keyof Omit<DemoExercise, 'id' | 'media'>, value: string) {
    setDraft((current) => current && { ...current, exercises: current.exercises.map((exercise) => exercise.id === id ? { ...exercise, [field]: value } : exercise) })
  }

  function save() {
    if (!draft) return
    setValidationAttempted(true)
    if (!draft.name.trim()) { setError('Enter a routine name.'); return }
    if (draft.exercises.some((exercise) => !exercise.name.trim())) { setError('Name each exercise or remove the empty one.'); return }
    if (draft.exercises.some((exercise) => [exercise.sets, exercise.repetitions, exercise.duration, exercise.rest].some(invalidDosage))) {
      setError('Use whole numbers from 0 to 9999 for sets, repetitions, duration, and rest.')
      return
    }
    const cleaned = { ...draft, name: draft.name.trim(), exercises: draft.exercises.map((exercise) => ({ ...exercise, name: exercise.name.trim() })) }
    setRoutines((current) => current.some((routine) => routine.id === cleaned.id) ? current.map((routine) => routine.id === cleaned.id ? cleaned : routine) : [...current, cleaned])
    setSelectedId(cleaned.id)
    setDraft(null)
    setError('')
    setValidationAttempted(false)
    setNotice('Saved to the demo only. Refreshing the page resets these changes.')
  }

  return <Stack spacing={2.5}>
    <Alert severity="info">Demo mode uses sample data and temporary browser previews. Creating, editing, and archiving here do not change your saved routines or upload files.</Alert>
    {notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}
    {draft ? <>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1} alignItems={{ sm: 'center' }}>
        <Typography component="h2" variant="h5">{routines.some((routine) => routine.id === draft.id) ? 'Edit routine demo' : 'New routine demo'}</Typography>
        <Button onClick={() => { setDraft(null); setError(''); setValidationAttempted(false) }}>Cancel</Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      <Card variant="outlined"><CardContent><Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1.1fr) minmax(0, .9fr)' }, gap: 3 }}>
        <Stack spacing={2.5} minWidth={0}>
          <Typography component="h3" variant="h6">Routine information</Typography>
          <TextField label="Routine name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required fullWidth error={validationAttempted && !draft.name.trim()} helperText={validationAttempted && !draft.name.trim() ? 'Routine name is required.' : undefined} sx={validationAttempted && !draft.name.trim() ? invalidInputSx : undefined} />
          <TextField label="Routine description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} multiline minRows={3} fullWidth helperText="Describe the goal and overall instructions." />
        </Stack>
        <Stack spacing={2} minWidth={0}>
          <Typography component="h3" variant="h6">Routine pictures and videos</Typography>
          <MediaGallery media={draft.media} editing onChange={(next) => updateMedia('routine', next)} />
        </Stack>
      </Box></CardContent></Card>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography component="h3" variant="h6">Exercises</Typography>
        <Button startIcon={<AddIcon />} onClick={() => setDraft({ ...draft, exercises: [...draft.exercises, newExercise()] })}>Add exercise</Button>
      </Stack>
      {draft.exercises.map((exercise, index) => <Card key={exercise.id} variant="outlined"><CardContent><Stack spacing={2}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography component="h4" variant="h6">Exercise {index + 1}</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="flex-end">
            <Button size="small" disabled={index === 0} onClick={() => { const next = [...draft.exercises]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setDraft({ ...draft, exercises: next }) }}>Move up</Button>
            <Button size="small" disabled={index === draft.exercises.length - 1} onClick={() => { const next = [...draft.exercises]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; setDraft({ ...draft, exercises: next }) }}>Move down</Button>
            <Button size="small" color="error" startIcon={<DeleteOutlineIcon />} onClick={() => setDraft({ ...draft, exercises: draft.exercises.filter((item) => item.id !== exercise.id) })}>Remove</Button>
          </Stack>
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1.1fr) minmax(0, .9fr)' }, gap: 3 }}>
          <Stack spacing={2} minWidth={0}>
            <TextField label="Exercise name" value={exercise.name} onChange={(event) => updateExercise(exercise.id, 'name', event.target.value)} required fullWidth error={validationAttempted && !exercise.name.trim()} helperText={validationAttempted && !exercise.name.trim() ? 'Exercise name is required.' : undefined} sx={validationAttempted && !exercise.name.trim() ? invalidInputSx : undefined} />
            <TextField label="Exercise description" value={exercise.description} onChange={(event) => updateExercise(exercise.id, 'description', event.target.value)} multiline minRows={2} fullWidth helperText="Explain how to perform the movement." />
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.5 }}>
              {([['sets', 'Sets'], ['repetitions', 'Repetitions'], ['duration', 'Duration (seconds)'], ['rest', 'Rest (seconds)']] as const).map(([field, label]) => <TextField key={field} label={label} type="number" value={exercise[field]} onChange={(event) => updateExercise(exercise.id, field, event.target.value)} error={validationAttempted && invalidDosage(exercise[field])} sx={validationAttempted && invalidDosage(exercise[field]) ? invalidInputSx : undefined} slotProps={{ htmlInput: { min: 0, step: 1 } }} />)}
            </Box>
            <TextField label="Provider notes" value={exercise.notes} onChange={(event) => updateExercise(exercise.id, 'notes', event.target.value)} multiline minRows={2} fullWidth />
          </Stack>
          <Stack spacing={2} minWidth={0}>
            <Typography component="h5" variant="subtitle1" fontWeight={700}>Exercise pictures and videos</Typography>
            <MediaGallery media={exercise.media} editing onChange={(next) => updateMedia(exercise.id, next)} />
          </Stack>
        </Box>
      </Stack></CardContent></Card>)}
      <Stack direction="row" justifyContent="flex-end" spacing={1.5}>
        <Button variant="outlined" onClick={() => { setDraft(null); setError(''); setValidationAttempted(false) }}>Cancel</Button>
        <Button variant="contained" onClick={save}>Save demo routine</Button>
      </Stack>
    </> : <>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between">
        <TextField size="small" label="Search demo routines" value={query} onChange={(event) => setQuery(event.target.value)} sx={{ minWidth: { sm: 280 }, '& .MuiOutlinedInput-root': { height: 50 }, '& .MuiInputLabel-outlined.MuiInputLabel-sizeSmall:not(.MuiInputLabel-shrink)': { top: '50%', transform: 'translate(14px, -50%) scale(1)' } }} />
        <Button variant="contained" startIcon={<AddIcon />} sx={{ height: 50 }} onClick={() => { setDraft({ id: crypto.randomUUID(), name: '', description: '', media: [], exercises: [newExercise()] }); setNotice(''); setError(''); setValidationAttempted(false) }}>New routine</Button>
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(220px, 300px) minmax(0, 1fr)' }, gap: 2.5, alignItems: 'start' }}>
        <Stack spacing={1}>
          {filtered.length === 0 && <Typography color="text.secondary">No matching demo routines.</Typography>}
          {filtered.map((routine) => <Card key={routine.id} variant="outlined" sx={{ borderColor: selected?.id === routine.id ? 'primary.main' : 'divider', borderWidth: selected?.id === routine.id ? 2 : 1 }}>
            <Button fullWidth onClick={() => setSelectedId(routine.id)} sx={{ justifyContent: 'flex-start', textAlign: 'left', p: 1.5, color: 'text.primary', textTransform: 'none' }}>
              <Box><Typography fontWeight={700}>{routine.name}</Typography><Typography variant="body2" color="text.secondary">{routine.exercises.length} exercises · {routine.media.length + routine.exercises.reduce((count, exercise) => count + exercise.media.length, 0)} media items</Typography></Box>
            </Button>
          </Card>)}
        </Stack>
        {selected ? <Card variant="outlined"><CardContent><Stack spacing={2.5}>
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button size="small" startIcon={<EditIcon />} onClick={() => { setDraft(structuredClone(selected)); setNotice(''); setError(''); setValidationAttempted(false) }}>Edit</Button>
            <Button size="small" color="error" onClick={() => { setRoutines((current) => current.filter((routine) => routine.id !== selected.id)); setNotice('Archived in the demo only. Refreshing restores sample routines.') }}>Archive</Button>
          </Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1.1fr) minmax(0, .9fr)' }, gap: 3 }}>
            <Box minWidth={0}><Typography component="h2" variant="h5" sx={{ fontFamily: 'Georgia, serif' }}>{selected.name}</Typography><Typography color="text.secondary" sx={{ mt: .75, whiteSpace: 'pre-wrap' }}>{selected.description || 'No routine description yet.'}</Typography></Box>
            <Box minWidth={0}><Typography component="h3" variant="h6" sx={{ mb: 1.5 }}>Routine media</Typography><MediaGallery media={selected.media} /></Box>
          </Box>
          <Divider />
          <Typography component="h3" variant="h6">Exercises</Typography>
          {selected.exercises.length === 0 && <Typography color="text.secondary">No exercises added.</Typography>}
          {selected.exercises.map((exercise, index) => <Box key={exercise.id}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1.1fr) minmax(0, .9fr)' }, gap: 3 }}>
              <Box minWidth={0}>
                <Typography component="h4" variant="subtitle1" fontWeight={700}>{index + 1}. {exercise.name}</Typography>
                {exercise.description && <Typography sx={{ mt: .5, whiteSpace: 'pre-wrap' }}>{exercise.description}</Typography>}
                <Dosage exercise={exercise} />
                {exercise.notes && <Typography variant="body2" sx={{ mt: .75, whiteSpace: 'pre-wrap' }}><strong>Provider notes:</strong> {exercise.notes}</Typography>}
              </Box>
              <Box minWidth={0}><Typography component="h5" variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Exercise media</Typography><MediaGallery media={exercise.media} /></Box>
            </Box>
            {index < selected.exercises.length - 1 && <Divider sx={{ mt: 2 }} />}
          </Box>)}
        </Stack></CardContent></Card> : <Card variant="outlined"><CardContent><Typography color="text.secondary">Select a routine or create a new one.</Typography></CardContent></Card>}
      </Box>
    </>}
  </Stack>
}
