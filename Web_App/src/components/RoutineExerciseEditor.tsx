import { Alert, Autocomplete, Box, Button, Stack, TextField, Typography } from '@mui/material'
import type { Exercise } from '../types'
import { maxRoutineExercises, prescriptionBounds, type PrescriptionDraft } from '../lib/exercisePrescriptions'

export function RoutineExerciseEditor({ exercises, catalog, disabled, onChange }: {
  exercises: PrescriptionDraft[]
  catalog: Exercise[]
  disabled: boolean
  onChange: (next: PrescriptionDraft[]) => void
}) {
  const update = (index: number, change: Partial<PrescriptionDraft>) => onChange(exercises.map((item, i) => i === index ? { ...item, ...change } : item))
  const move = (index: number, delta: number) => {
    const next = [...exercises]
    ;[next[index], next[index + delta]] = [next[index + delta], next[index]]
    onChange(next)
  }
  return <Stack spacing={2}>
    <Typography variant="body2">Choose shared catalog exercises. Leave optional prescription fields blank when unspecified.</Typography>
    {!exercises.length && <Alert severity="info">Empty routines can be saved as drafts. Add an exercise before assigning.</Alert>}
    {exercises.map((exercise, index) => {
      const selected = catalog.find((item) => item.id === exercise.exerciseId) ?? null
      const original = exercise.original && typeof exercise.original === 'object' ? exercise.original as Record<string, unknown> : null
      return <Box key={exercise.key} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2 }}>
        <Stack spacing={1.5}>
          {exercise.originalName && !selected && <Alert severity="warning">
            {exercise.originalName}: select a catalog replacement and enter its prescription. The original saved entry will be retained.
            {original && <Typography variant="body2">{['sets', 'reps', 'timer'].filter((key) => original[key] != null).map((key) => `${key}: ${String(original[key])}${key === 'timer' ? ' (original unit unverified)' : ''}`).join(' · ')}</Typography>}
          </Alert>}
          {exercise.exerciseId && !selected && <Alert severity="error">This exercise is unavailable. Select a catalog replacement.</Alert>}
          <Autocomplete options={catalog} value={selected} disabled={disabled}
            getOptionLabel={(option) => option.name} getOptionKey={(option) => option.id}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            onChange={(_, value) => update(index, { exerciseId: value?.id ?? null })}
            renderOption={(props, option) => <li {...props} key={option.id}><Box>{option.name}<Typography variant="caption" display="block" color="text.secondary">{option.description}</Typography></Box></li>}
            renderInput={(params) => <TextField {...params} label={`Exercise ${index + 1}`} required />} />
          {selected?.description && <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{selected.description}</Typography>}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            {([['sets', 'Sets'], ['reps', 'Repetitions per set'], ['timerSeconds', 'Seconds per set']] as const).map(([field, label]) =>
              <TextField key={field} label={label} type="number" value={exercise[field]} disabled={disabled || !selected}
                onChange={(event) => update(index, { [field]: event.target.value })} size="small" fullWidth
                helperText={`Optional · 1–${prescriptionBounds[field]}`} slotProps={{ htmlInput: { min: 1, max: prescriptionBounds[field], step: 1 } }} />)}
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button disabled={disabled || index === 0} onClick={() => move(index, -1)} aria-label={`Move exercise ${index + 1} up`}>Move up</Button>
            <Button disabled={disabled || index === exercises.length - 1} onClick={() => move(index, 1)} aria-label={`Move exercise ${index + 1} down`}>Move down</Button>
            <Button color="error" disabled={disabled} onClick={() => onChange(exercises.filter((_, i) => i !== index))} aria-label={`Remove exercise ${index + 1}`}>Remove</Button>
          </Stack>
        </Stack>
      </Box>
    })}
    <Button disabled={disabled || exercises.length >= maxRoutineExercises} onClick={() => onChange([...exercises, { key: crypto.randomUUID(), exerciseId: null, sets: '', reps: '', timerSeconds: '' }])}>Add catalog exercise</Button>
  </Stack>
}
