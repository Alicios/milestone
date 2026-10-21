import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import EditIcon from '@mui/icons-material/Edit'
import SearchIcon from '@mui/icons-material/Search'
import { Alert, Autocomplete, Box, Button, IconButton, InputAdornment, OutlinedInput, Stack, TextField, Typography, useTheme } from '@mui/material'
import type { DashboardOutletContext } from '../components/DashboardLayout'
import type { CatalogExercise, Routine } from '../types'
import { loadExercises } from '../lib/exerciseData'
import { errorMessage } from '../lib/errors'
import { MAX_PRESCRIPTION_INTEGER, parsePrescriptionText, prescriptionSummary, validPrescriptionText } from '../lib/prescriptions'
import { RoutineDemo } from '../components/RoutineDemo'

const teal = '#4b9da9'
const aqua = '#91c8c0'
const orange = '#eb681d'

const fontSx = { fontFamily: 'Georgia, serif', fontStyle: 'italic' }

function RoutineColumn({ routine, dimmed, highlighted, onClick }: {
  routine: Routine
  dimmed?: boolean
  highlighted?: boolean
  onClick?: () => void
}) {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const border = theme.palette.divider
  const surface = theme.palette.background.paper
  const text = theme.palette.text.primary
  const chipSurface = isDark ? '#29454d' : '#d9d9d9'

  return (
    <Box
      onClick={onClick}
      sx={{
        width: 200,
        flexShrink: 0,
        mt: 3,
        cursor: onClick ? 'pointer' : 'default',
        filter: dimmed ? 'grayscale(1) opacity(0.45)' : 'none',
        transition: 'filter .15s ease',
      }}
    >
      <Box sx={{ ...fontSx, bgcolor: aqua, color: '#102b34', border: `4px solid ${highlighted ? orange : border}`, borderRadius: '20px', textAlign: 'center', py: 1.25, px: 1.5, mx: 1.5, mb: -3, position: 'relative', zIndex: 2, fontSize: '1.15rem', fontWeight: 700 }}>
        {routine.name}
      </Box>
      <Box sx={{ border: `4px solid ${highlighted ? orange : border}`, borderRadius: '30px', bgcolor: surface, color: text, pt: 5, pb: 2, px: 1.25, minHeight: 320, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {routine.exercises.map((exercise) => (
          <Box key={exercise.id} sx={{ ...fontSx, bgcolor: chipSurface, border: `3px solid ${border}`, borderRadius: '20px', py: 1, px: 1.5, textAlign: 'center', fontSize: '1rem' }}>
            {exercise.name}
            {prescriptionSummary(exercise) && <Typography variant="body2">{prescriptionSummary(exercise)}</Typography>}
            {exercise.notes && <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{exercise.notes}</Typography>}
          </Box>
        ))}
      </Box>
    </Box>
  )
}

type ExerciseSelection = {
  key: string; exerciseId: string | null; originalName?: string
  sets?: string; reps?: string; durationSeconds?: string; notes?: string
}
const emptySelection = (): ExerciseSelection => ({ key: crypto.randomUUID(), exerciseId: null, sets: '', reps: '', durationSeconds: '', notes: '' })
const prescriptionInput = (exercise: ExerciseSelection) => ({
  exerciseId: exercise.exerciseId!,
  sets: parsePrescriptionText(exercise.sets), reps: parsePrescriptionText(exercise.reps),
  durationSeconds: parsePrescriptionText(exercise.durationSeconds), notes: exercise.notes?.trim() || null,
})

export function ExerciseEditor({ exercises, catalog, disabled, onChange }: {
  exercises: ExerciseSelection[]
  catalog: CatalogExercise[]
  disabled: boolean
  onChange: (next: ExerciseSelection[]) => void
}) {
  return <Stack spacing={1.5}>
    {exercises.map((exercise, index) => {
      const selected = catalog.find((item) => item.id === exercise.exerciseId) ?? null
      const update = (field: 'sets' | 'reps' | 'durationSeconds' | 'notes', value: string) =>
        onChange(exercises.map((item, i) => i === index ? { ...item, [field]: value } : item))
      const move = (delta: number) => {
        const next = [...exercises]
        ;[next[index], next[index + delta]] = [next[index + delta], next[index]]
        onChange(next)
      }
      return <Stack key={exercise.key} spacing={1}>
        {exercise.originalName && !selected && <Alert severity="warning">Saved entry: {exercise.originalName}. Select a catalog replacement or remove this entry before saving. Additional legacy fields are replaced when you save.</Alert>}
        {exercise.exerciseId && !selected && !disabled && <Alert severity="error">This catalog exercise is unavailable. Choose a replacement.</Alert>}
        <Autocomplete options={catalog} value={selected} disabled={disabled}
          getOptionLabel={(option) => option.name} getOptionKey={(option) => option.id}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          onChange={(_, value) => onChange(exercises.map((item, i) => i === index ? { ...item, exerciseId: value?.id ?? null } : item))}
          renderOption={(props, option) => {
            const { key, ...rest } = props
            return <li key={key} {...rest}><Box>{option.name}<Typography variant="caption" display="block">{option.description}</Typography></Box></li>
          }}
          renderInput={(params) => <TextField {...params} label={`Exercise ${index + 1}`} required />} />
        {selected?.description && <Typography variant="body2">{selected.description}</Typography>}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          {([['sets', 'Sets'], ['reps', 'Reps'], ['durationSeconds', 'Duration (seconds)']] as const).map(([field, label]) =>
            <TextField key={field} label={`${label} — exercise ${index + 1}`} value={exercise[field] ?? ''}
              disabled={disabled} fullWidth onChange={(event) => update(field, event.target.value)}
              error={!validPrescriptionText(exercise[field])}
              helperText={validPrescriptionText(exercise[field]) ? 'Optional' : `Enter a whole number from 1 to ${MAX_PRESCRIPTION_INTEGER}.`}
              slotProps={{ htmlInput: { inputMode: 'numeric' } }} />)}
        </Stack>
        <TextField label={`Notes — exercise ${index + 1}`} value={exercise.notes ?? ''} multiline minRows={2}
          disabled={disabled} helperText="Optional" onChange={(event) => update('notes', event.target.value)} />
        <Stack direction="row" spacing={1}>
          <Button disabled={disabled || index === 0} onClick={() => move(-1)} aria-label={`Move exercise ${index + 1} up`}>Move up</Button>
          <Button disabled={disabled || index === exercises.length - 1} onClick={() => move(1)} aria-label={`Move exercise ${index + 1} down`}>Move down</Button>
          <IconButton disabled={disabled} aria-label={`Remove exercise ${index + 1}`} onClick={() => onChange(exercises.filter((_, i) => i !== index))}><CloseIcon /></IconButton>
        </Stack>
      </Stack>
    })}
    <Button disabled={disabled || exercises.length >= 100} startIcon={<AddIcon />} onClick={() => onChange([...exercises, emptySelection()])}>Add catalog exercise</Button>
  </Stack>
}

export function SavedRoutinesPage() {
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'
  const border = theme.palette.divider
  const surface = theme.palette.background.paper
  const text = theme.palette.text.primary
  const { routines, saveRoutine } = useOutletContext<DashboardOutletContext>()
  const [mode, setMode] = useState<'list' | 'new' | 'edit-pick' | 'edit'>('list')
  const [query, setQuery] = useState('')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [error, setError] = useState('')

  const [newName, setNewName] = useState('')
  const [newExercises, setNewExercises] = useState<ExerciseSelection[]>([emptySelection()])

  const [editName, setEditName] = useState('')
  const [editExercises, setEditExercises] = useState<ExerciseSelection[]>([])
  const [catalog, setCatalog] = useState<CatalogExercise[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState('')
  const [catalogAttempt, setCatalogAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setCatalogLoading(true)
    setCatalogError('')
    void loadExercises().then((rows) => { if (active) setCatalog(rows) }).catch((error) => {
      if (active) setCatalogError(errorMessage(error, 'The exercise catalog could not be loaded.'))
    }).finally(() => { if (active) setCatalogLoading(false) })
    return () => { active = false }
  }, [catalogAttempt])
  const validSelection = (items: ExerciseSelection[]) => !catalogLoading && !catalogError && items.length > 0 && items.length <= 100 && items.every((item) =>
    catalog.some((exercise) => exercise.id === item.exerciseId) && [item.sets, item.reps, item.durationSeconds].every(validPrescriptionText))
  const catalogStatus = <>
    {catalogLoading && <Alert severity="info">Loading exercise catalog…</Alert>}
    {catalogError && <Alert severity="error" action={<Button onClick={() => setCatalogAttempt((n) => n + 1)}>Retry catalog</Button>}>{catalogError}</Alert>}
  </>

  const visibleRoutines = useMemo(() => routines.filter((routine) => routine.name.toLowerCase().includes(query.toLowerCase())), [routines, query])
  const editingRoutine = routines.find((routine) => routine.id === editingId) ?? null

  function startNew() {
    setError('')
    setNewName('')
    setNewExercises([emptySelection()])
    setMode('new')
  }

  async function submitNew() {
    if (!newName.trim() || !validSelection(newExercises) || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError('')
    try {
      await saveRoutine(null, newName, newExercises.map(prescriptionInput))
      setMode('list')
    } catch (saveError) {
      setError(errorMessage(saveError, 'The routine could not be created.'))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  function selectForEdit(id: string) {
    const routine = routines.find((item) => item.id === id)
    if (!routine) return
    setError('')
    setEditingId(id)
    setEditName(routine.name)
    setEditExercises(routine.exercises.map((exercise) => ({
      key: exercise.id, exerciseId: exercise.requiresReview ? null : exercise.exerciseId ?? null, originalName: exercise.name,
      sets: exercise.sets?.toString() ?? '', reps: exercise.reps?.toString() ?? '',
      durationSeconds: exercise.durationSeconds?.toString() ?? '', notes: exercise.notes ?? '',
    })))
    setMode('edit')
  }

  async function finishEditing() {
    if (!editingId || !editName.trim() || !validSelection(editExercises) || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError('')
    try {
      await saveRoutine(editingId, editName, editExercises.map(prescriptionInput))
      setEditingId(null)
      setMode('list')
    } catch (saveError) {
      setError(errorMessage(saveError, 'The routine could not be updated.'))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  if (mode === 'new') {
    return (
      <Box maxWidth={480} mx="auto">
        <Typography variant="h4" sx={{ ...fontSx, mb: 3, textAlign: 'center' }}>New Routine</Typography>
        <Box sx={{ border: `4px solid ${border}`, borderRadius: '30px', bgcolor: surface, color: text, p: 3 }}>
          <Stack spacing={2.5}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="Routine name"
              slotProps={{ htmlInput: { maxLength: 200 } }}
              disabled={saving} value={newName}
              onChange={(event) => setNewName(event.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { ...fontSx, borderRadius: '20px', '& fieldset': { border: `3px solid ${border}` } } }}
            />
            {catalogStatus}
            <ExerciseEditor catalog={catalog} disabled={saving || catalogLoading || Boolean(catalogError)} exercises={newExercises} onChange={setNewExercises} />
            <Stack direction="row" spacing={1.5} justifyContent="flex-end" mt={2}>
              <Button disabled={saving} onClick={() => setMode('list')} sx={{ ...fontSx, color: text, border: `3px solid ${border}`, borderRadius: '20px', px: 3, '&:hover': { bgcolor: isDark ? '#29454d' : '#f0f0f0' } }}>Cancel</Button>
              <Button onClick={() => void submitNew()} disabled={!newName.trim() || !validSelection(newExercises) || saving} sx={{ ...fontSx, bgcolor: orange, color: 'white', border: `3px solid ${border}`, borderRadius: '20px', px: 3, '&:hover': { bgcolor: '#d15a17' } }}>{saving ? 'Creating…' : 'Create Routine'}</Button>
            </Stack>
          </Stack>
        </Box>
      </Box>
    )
  }

  if (mode === 'edit' && editingRoutine) {
    return (
      <Box maxWidth={480} mx="auto">
        <Typography variant="h4" sx={{ ...fontSx, mb: 3, textAlign: 'center' }}>Edit Routine</Typography>
        <Box sx={{ border: `4px solid ${border}`, borderRadius: '30px', bgcolor: surface, color: text, p: 3 }}>
          <Stack spacing={2.5}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="Routine name"
              slotProps={{ htmlInput: { maxLength: 200 } }}
              disabled={saving} value={editName}
              onChange={(event) => setEditName(event.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { ...fontSx, borderRadius: '20px', '& fieldset': { border: `3px solid ${border}` } } }}
            />
            {catalogStatus}
            <ExerciseEditor catalog={catalog} disabled={saving || catalogLoading || Boolean(catalogError)} exercises={editExercises} onChange={setEditExercises} />
            <Stack direction="row" spacing={1.5} justifyContent="flex-end" mt={2}>
              <Button disabled={saving} onClick={() => setMode('list')}>Cancel</Button>
              <Button disabled={!editName.trim() || !validSelection(editExercises) || saving} onClick={() => void finishEditing()} sx={{ ...fontSx, bgcolor: orange, color: 'white', border: `3px solid ${border}`, borderRadius: '20px', px: 3, '&:hover': { bgcolor: '#d15a17' } }}>{saving ? 'Saving…' : 'Finish Editing'}</Button>
            </Stack>
          </Stack>
        </Box>
      </Box>
    )
  }

  return (
    <Stack direction={{ xs: 'column', lg: 'row' }} spacing={{ xs: 2, lg: 5 }} alignItems="flex-start">
      <Box flexGrow={1} minWidth={0} width="100%">
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} mb={3} alignItems="center">
          <OutlinedInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search..."
            aria-label="Search routines"
            startAdornment={<InputAdornment position="start"><SearchIcon sx={{ bgcolor: teal, border: `3px solid ${border}`, borderRadius: '50%', p: .5, boxSizing: 'content-box', fontSize: 42 }} /></InputAdornment>}
            sx={{ flexGrow: 1, bgcolor: surface, border: `4px solid ${border}`, borderRadius: '34px', ...fontSx, fontSize: '1.3rem', '& fieldset': { border: 0 } }}
          />
          {mode === 'edit-pick' && (
            <Button onClick={() => { setMode('list'); setHoveredId(null) }} sx={{ ...fontSx, color: text, border: `3px solid ${border}`, borderRadius: '20px', px: 2, whiteSpace: 'nowrap', '&:hover': { bgcolor: isDark ? '#29454d' : '#f0f0f0' } }}>
              Cancel
            </Button>
          )}
        </Stack>
        {mode === 'edit-pick' && (
          <Typography sx={{ ...fontSx, mb: 2 }}>Select a routine to edit&hellip;</Typography>
        )}
        <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 1 }}>
          {visibleRoutines.map((routine) => {
            const isHovered = mode === 'edit-pick' && hoveredId === routine.id
            return (
              <Box
                key={routine.id}
                onMouseEnter={mode === 'edit-pick' ? () => setHoveredId(routine.id) : undefined}
                onMouseLeave={mode === 'edit-pick' ? () => setHoveredId(null) : undefined}
                sx={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
              >
                <RoutineColumn
                  routine={routine}
                  dimmed={mode === 'edit-pick' && hoveredId !== null && hoveredId !== routine.id}
                  highlighted={isHovered}
                  onClick={mode === 'edit-pick' ? () => selectForEdit(routine.id) : undefined}
                />
              </Box>
            )
          })}
        </Box>
      </Box>
      <Box sx={{ width: { xs: '100%', lg: 180 }, display: 'flex', flexDirection: { xs: 'row', lg: 'column' }, justifyContent: 'center', gap: { xs: 3, lg: 5 }, alignItems: 'center' }}>
        <Button onClick={startNew} sx={{ color: isDark ? 'white' : 'black', display: 'flex', flexDirection: 'column', ...fontSx, fontSize: '1.3rem', '&:hover': { bgcolor: 'transparent' } }}>
          <Box sx={{ width: { xs: 90, sm: 130 }, height: { xs: 90, sm: 130 }, borderRadius: '50%', bgcolor: teal, border: `4px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AddIcon sx={{ color: 'white', fontSize: { xs: 56, sm: 90 } }} />
          </Box>
          <Box component="span" mt={1}>New Routine</Box>
        </Button>
        <Button onClick={() => setMode('edit-pick')} sx={{ color: isDark ? 'white' : 'black', display: 'flex', flexDirection: 'column', ...fontSx, fontSize: '1.3rem', '&:hover': { bgcolor: 'transparent' } }}>
          <Box sx={{ width: { xs: 90, sm: 130 }, height: { xs: 90, sm: 130 }, borderRadius: '50%', bgcolor: teal, border: `4px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <EditIcon sx={{ color: 'white', fontSize: { xs: 48, sm: 76 } }} />
          </Box>
          <Box component="span" mt={1}>Edit Routine</Box>
        </Button>
      </Box>
    </Stack>
  )
}

export function RoutinesPage() {
  const [showDemo, setShowDemo] = useState(false)

  return <Box>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} justifyContent="space-between" sx={{ mb: 3 }}>
      <Box>
        <Typography component="h1" variant="h4" sx={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>Routines</Typography>
        <Typography color="text.secondary">{showDemo ? 'Preview the expanded routine editor with sample data.' : 'Your saved provider routines.'}</Typography>
      </Box>
      <Stack direction="row" spacing={1}>
        <Button variant={showDemo ? 'contained' : 'outlined'} onClick={() => setShowDemo(true)}>Editor demo</Button>
        <Button variant={showDemo ? 'outlined' : 'contained'} onClick={() => setShowDemo(false)}>Saved routines</Button>
      </Stack>
    </Stack>
    {showDemo && <RoutineDemo />}
    <Box sx={{ display: showDemo ? 'none' : 'block' }}><SavedRoutinesPage /></Box>
  </Box>
}
