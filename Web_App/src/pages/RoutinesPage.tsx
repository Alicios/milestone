import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import SearchIcon from '@mui/icons-material/Search'
import { Alert, Box, Button, InputAdornment, OutlinedInput, Stack, TextField, Typography, useTheme } from '@mui/material'
import type { DashboardOutletContext } from '../components/DashboardLayout'
import type { Exercise, Routine } from '../types'
import { loadExercises } from '../lib/exerciseData'
import { buildPrescriptionPayload, errorMessage, prescriptionSummary, toPrescriptionDraft, type PrescriptionDraft } from '../lib/exercisePrescriptions'
import { RoutineExerciseEditor } from '../components/RoutineExerciseEditor'
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
        {routine.assignmentIssue && <Typography variant="caption" color="warning.main">{routine.assignmentIssue}</Typography>}
        {routine.exercises.map((exercise) => (
          <Box key={exercise.id} sx={{ ...fontSx, bgcolor: chipSurface, border: `3px solid ${border}`, borderRadius: '20px', py: 1, px: 1.5, textAlign: 'center', fontSize: '1rem' }}>
            {exercise.name}
            <Typography variant="caption" display="block">{exercise.resolved ? prescriptionSummary(exercise) : 'Needs catalog replacement'}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

function SavedRoutinesPage({ active }: { active: boolean }) {
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
  const [error, setError] = useState('')
  const [catalog, setCatalog] = useState<Exercise[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState('')
  const [catalogAttempt, setCatalogAttempt] = useState(0)
  const [editRevision, setEditRevision] = useState<number | null>(null)
  useEffect(() => {
    if (!active) return
    let current = true
    setCatalogLoading(true)
    setCatalogError('')
    void loadExercises().then((rows) => { if (current) setCatalog(rows) })
      .catch((cause: unknown) => { if (current) setCatalogError(errorMessage(cause, 'The exercise catalog could not be loaded.')) })
      .finally(() => { if (current) setCatalogLoading(false) })
    return () => { current = false }
  }, [active, catalogAttempt])
  const editorDisabled = saving || catalogLoading || Boolean(catalogError)
  const catalogStatus = <>{catalogLoading && <Typography>Loading exercise catalog…</Typography>}{catalogError && <Alert severity="error" action={<Button color="inherit" onClick={() => setCatalogAttempt((value) => value + 1)}>Retry</Button>}>{catalogError}</Alert>}</>


  const [newName, setNewName] = useState('')
  const [newExercises, setNewExercises] = useState<PrescriptionDraft[]>([])

  const [editName, setEditName] = useState('')
  const [editExercises, setEditExercises] = useState<PrescriptionDraft[]>([])

  const visibleRoutines = useMemo(() => routines.filter((routine) => routine.name.toLowerCase().includes(query.toLowerCase())), [routines, query])
  const editingRoutine = routines.find((routine) => routine.id === editingId) ?? null

  function startNew() {
    setError('')
    setNewName('')
    setNewExercises([])
    setMode('new')
  }

  async function submitNew() {
    if (!newName.trim()) return
    setSaving(true)
    setError('')
    try {
      await saveRoutine(null, newName, buildPrescriptionPayload(newName, newExercises, new Set(catalog.map((item) => item.id))), null)
      setMode('list')
    } catch (saveError) {
      setError(errorMessage(saveError, 'The routine could not be created.'))
    } finally {
      setSaving(false)
    }
  }

  function selectForEdit(id: string) {
    const routine = routines.find((item) => item.id === id)
    if (!routine) return
    setEditingId(id)
    setEditName(routine.name)
    setEditExercises(routine.exercises.map(toPrescriptionDraft))
    setEditRevision(routine.exerciseRevision)
    setError('')
    setMode('edit')
  }

  async function finishEditing() {
    if (!editingId || !editName.trim()) return
    setSaving(true)
    setError('')
    try {
      await saveRoutine(editingId, editName, buildPrescriptionPayload(editName, editExercises, new Set(catalog.map((item) => item.id))), editRevision)
      setEditingId(null)
      setMode('list')
    } catch (saveError) {
      setError(errorMessage(saveError, 'The routine could not be updated.'))
    } finally {
      setSaving(false)
    }
  }

  if (mode === 'new') {
    return (
      <Box maxWidth={760} mx="auto">
        <Typography variant="h4" sx={{ ...fontSx, mb: 3, textAlign: 'center' }}>New Routine</Typography>
        <Box sx={{ border: `4px solid ${border}`, borderRadius: '30px', bgcolor: surface, color: text, p: 3 }}>
          <Stack spacing={2.5}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="Routine name"
              disabled={saving}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { ...fontSx, borderRadius: '20px', '& fieldset': { border: `3px solid ${border}` } } }}
            />
            {catalogStatus}
            <RoutineExerciseEditor exercises={newExercises} catalog={catalog} disabled={editorDisabled} onChange={setNewExercises} />
            <Stack direction="row" spacing={1.5} justifyContent="flex-end" mt={2}>
              <Button disabled={saving} onClick={() => setMode('list')} sx={{ ...fontSx, color: text, border: `3px solid ${border}`, borderRadius: '20px', px: 3, '&:hover': { bgcolor: isDark ? '#29454d' : '#f0f0f0' } }}>Cancel</Button>
              <Button onClick={() => void submitNew()} disabled={!newName.trim() || editorDisabled} sx={{ ...fontSx, bgcolor: orange, color: 'white', border: `3px solid ${border}`, borderRadius: '20px', px: 3, '&:hover': { bgcolor: '#d15a17' } }}>{saving ? 'Creating…' : 'Create Routine'}</Button>
            </Stack>
          </Stack>
        </Box>
      </Box>
    )
  }

  if (mode === 'edit' && editingRoutine) {
    return (
      <Box maxWidth={760} mx="auto">
        <Typography variant="h4" sx={{ ...fontSx, mb: 3, textAlign: 'center' }}>Edit Routine</Typography>
        <Box sx={{ border: `4px solid ${border}`, borderRadius: '30px', bgcolor: surface, color: text, p: 3 }}>
          <Stack spacing={2.5}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="Routine name"
              disabled={saving}
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { ...fontSx, borderRadius: '20px', '& fieldset': { border: `3px solid ${border}` } } }}
            />
            {catalogStatus}
            <RoutineExerciseEditor exercises={editExercises} catalog={catalog} disabled={editorDisabled} onChange={setEditExercises} />
            <Stack direction="row" justifyContent="flex-end" mt={2}>
              <Button disabled={saving} onClick={() => setMode('list')}>Cancel</Button>
              <Button disabled={!editName.trim() || editorDisabled} onClick={() => void finishEditing()} sx={{ ...fontSx, bgcolor: orange, color: 'white', border: `3px solid ${border}`, borderRadius: '20px', px: 3, '&:hover': { bgcolor: '#d15a17' } }}>{saving ? 'Saving…' : 'Finish Editing'}</Button>
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
  const [showDemo, setShowDemo] = useState(true)

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
    <Box sx={{ display: showDemo ? 'block' : 'none' }}><RoutineDemo /></Box>
    <Box sx={{ display: showDemo ? 'none' : 'block' }}><SavedRoutinesPage active={!showDemo} /></Box>
  </Box>
}
