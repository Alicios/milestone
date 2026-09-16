import { useMemo, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import CloseIcon from '@mui/icons-material/Close'
import EditIcon from '@mui/icons-material/Edit'
import SearchIcon from '@mui/icons-material/Search'
import { Box, Button, IconButton, InputAdornment, OutlinedInput, Stack, TextField, Typography } from '@mui/material'

interface Routine {
  id: string
  name: string
  exercises: string[]
}

const teal = '#4b9da9'
const aqua = '#91c8c0'
const orange = '#eb681d'
const chipGrey = '#d9d9d9'

const initialRoutines: Routine[] = [
  { id: 'lower-body', name: 'Lower Body', exercises: ['Leg Stretch', 'Calf Stretch'] },
  { id: 'upper-body', name: 'Upper Body', exercises: ['Arm Stretch', 'Shoulder Stretch'] },
  { id: 'cardio', name: 'Cardio', exercises: ['Swim exercise', 'Running'] },
  { id: 'underwater-basketweaving', name: 'Underwater Basketweaving Routine', exercises: [] },
  { id: 'mongolian-throat-singing', name: 'Mongolian Throat Singing Routine', exercises: [] },
]

const fontSx = { fontFamily: 'Georgia, serif', fontStyle: 'italic' }

function RoutineColumn({ routine, dimmed, highlighted, onClick }: {
  routine: Routine
  dimmed?: boolean
  highlighted?: boolean
  onClick?: () => void
}) {
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
      <Box sx={{ ...fontSx, bgcolor: aqua, border: '4px solid black', borderColor: highlighted ? orange : 'black', borderRadius: '20px', textAlign: 'center', py: 1.25, px: 1.5, mx: 1.5, mb: -3, position: 'relative', zIndex: 2, fontSize: '1.15rem', fontWeight: 700 }}>
        {routine.name}
      </Box>
      <Box sx={{ border: '4px solid black', borderColor: highlighted ? orange : 'black', borderRadius: '30px', bgcolor: 'white', pt: 5, pb: 2, px: 1.25, minHeight: 320, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {routine.exercises.map((exercise) => (
          <Box key={exercise} sx={{ ...fontSx, bgcolor: chipGrey, border: '3px solid black', borderRadius: '20px', py: 1, px: 1.5, textAlign: 'center', fontSize: '1rem' }}>
            {exercise}
          </Box>
        ))}
      </Box>
    </Box>
  )
}

function ExerciseEditor({ exercises, onChange }: { exercises: string[]; onChange: (next: string[]) => void }) {
  const updateAt = (index: number, value: string) => onChange(exercises.map((exercise, i) => (i === index ? value : exercise)))
  const removeAt = (index: number) => onChange(exercises.filter((_, i) => i !== index))
  const add = () => onChange([...exercises, ''])

  return (
    <Stack spacing={1.5}>
      {exercises.map((exercise, index) => (
        <Stack key={index} direction="row" spacing={1} alignItems="center">
          <TextField
            value={exercise}
            onChange={(event) => updateAt(index, event.target.value)}
            placeholder="Exercise name"
            size="small"
            sx={{ '& .MuiOutlinedInput-root': { ...fontSx, bgcolor: chipGrey, borderRadius: '20px', '& fieldset': { border: '3px solid black' } } }}
          />
          <IconButton aria-label="Remove exercise" onClick={() => removeAt(index)} sx={{ bgcolor: '#ff333c', color: 'white', border: '2px solid black', '&:hover': { bgcolor: '#e02c34' } }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      ))}
      <Button onClick={add} startIcon={<AddIcon />} sx={{ ...fontSx, alignSelf: 'flex-start', bgcolor: aqua, color: 'black', border: '3px solid black', borderRadius: '20px', px: 2, '&:hover': { bgcolor: '#82bdb5' } }}>
        Add Exercise
      </Button>
    </Stack>
  )
}

export function RoutinesPage() {
  const [routines, setRoutines] = useState<Routine[]>(initialRoutines)
  const [mode, setMode] = useState<'list' | 'new' | 'edit-pick' | 'edit'>('list')
  const [query, setQuery] = useState('')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [newName, setNewName] = useState('')
  const [newExercises, setNewExercises] = useState<string[]>([''])

  const [editName, setEditName] = useState('')
  const [editExercises, setEditExercises] = useState<string[]>([])

  const visibleRoutines = useMemo(() => routines.filter((routine) => routine.name.toLowerCase().includes(query.toLowerCase())), [routines, query])
  const editingRoutine = routines.find((routine) => routine.id === editingId) ?? null

  function startNew() {
    setNewName('')
    setNewExercises([''])
    setMode('new')
  }

  function submitNew() {
    if (!newName.trim()) return
    const id = `${newName.trim().toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`
    setRoutines((current) => [...current, { id, name: newName.trim(), exercises: newExercises.map((e) => e.trim()).filter(Boolean) }])
    setMode('list')
  }

  function selectForEdit(id: string) {
    const routine = routines.find((item) => item.id === id)
    if (!routine) return
    setEditingId(id)
    setEditName(routine.name)
    setEditExercises([...routine.exercises])
    setMode('edit')
  }

  function finishEditing() {
    if (editingId) {
      setRoutines((current) => current.map((routine) => (routine.id === editingId ? { ...routine, name: editName.trim() || routine.name, exercises: editExercises.map((e) => e.trim()).filter(Boolean) } : routine)))
    }
    setEditingId(null)
    setMode('list')
  }

  function deleteRoutine(id: string) {
    setRoutines((current) => current.filter((routine) => routine.id !== id))
    setHoveredId((current) => (current === id ? null : current))
  }

  if (mode === 'new') {
    return (
      <Box maxWidth={480} mx="auto">
        <Typography variant="h4" sx={{ ...fontSx, mb: 3, textAlign: 'center' }}>New Routine</Typography>
        <Box sx={{ border: '4px solid black', borderRadius: '30px', bgcolor: 'white', p: 3 }}>
          <Stack spacing={2.5}>
            <TextField
              label="Routine name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { ...fontSx, borderRadius: '20px', '& fieldset': { border: '3px solid black' } } }}
            />
            <ExerciseEditor exercises={newExercises} onChange={setNewExercises} />
            <Stack direction="row" spacing={1.5} justifyContent="flex-end" mt={2}>
              <Button onClick={() => setMode('list')} sx={{ ...fontSx, color: 'black', border: '3px solid black', borderRadius: '20px', px: 3, '&:hover': { bgcolor: '#f0f0f0' } }}>Cancel</Button>
              <Button onClick={submitNew} disabled={!newName.trim()} sx={{ ...fontSx, bgcolor: orange, color: 'white', border: '3px solid black', borderRadius: '20px', px: 3, '&:hover': { bgcolor: '#d15a17' } }}>Create Routine</Button>
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
        <Box sx={{ border: '4px solid black', borderRadius: '30px', bgcolor: 'white', p: 3 }}>
          <Stack spacing={2.5}>
            <TextField
              label="Routine name"
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              sx={{ '& .MuiOutlinedInput-root': { ...fontSx, borderRadius: '20px', '& fieldset': { border: '3px solid black' } } }}
            />
            <ExerciseEditor exercises={editExercises} onChange={setEditExercises} />
            <Stack direction="row" justifyContent="flex-end" mt={2}>
              <Button onClick={finishEditing} sx={{ ...fontSx, bgcolor: orange, color: 'white', border: '3px solid black', borderRadius: '20px', px: 3, '&:hover': { bgcolor: '#d15a17' } }}>Finish Editing</Button>
            </Stack>
          </Stack>
        </Box>
      </Box>
    )
  }

  return (
    <Stack direction={{ xs: 'column', lg: 'row' }} spacing={{ xs: 2, lg: 5 }} alignItems="flex-start">
      <Box flexGrow={1} minWidth={0} width="100%">
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} mb={3} alignItems="center">
          <OutlinedInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search..."
            aria-label="Search routines"
            startAdornment={<InputAdornment position="start"><SearchIcon sx={{ bgcolor: teal, border: '3px solid black', borderRadius: '50%', p: .5, boxSizing: 'content-box', fontSize: 42 }} /></InputAdornment>}
            sx={{ flexGrow: 1, bgcolor: 'white', border: '4px solid black', borderRadius: '34px', ...fontSx, fontSize: '1.3rem', '& fieldset': { border: 0 } }}
          />
          {mode === 'edit-pick' && (
            <Button onClick={() => { setMode('list'); setHoveredId(null) }} sx={{ ...fontSx, color: 'black', border: '3px solid black', borderRadius: '20px', px: 2, whiteSpace: 'nowrap', '&:hover': { bgcolor: '#f0f0f0' } }}>
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
                <IconButton
                  aria-label={`Delete ${routine.name}`}
                  onClick={(event) => { event.stopPropagation(); deleteRoutine(routine.id) }}
                  sx={{
                    mt: 1.5,
                    width: 52,
                    height: 52,
                    bgcolor: '#ff333c',
                    color: 'white',
                    border: '4px solid black',
                    visibility: isHovered ? 'visible' : 'hidden',
                    '&:hover': { bgcolor: '#d81f28' },
                  }}
                >
                  <CloseIcon />
                </IconButton>
              </Box>
            )
          })}
        </Box>
      </Box>
      <Box sx={{ width: { xs: '100%', lg: 180 }, display: 'flex', flexDirection: { xs: 'row', lg: 'column' }, justifyContent: 'center', gap: { xs: 3, lg: 5 }, alignItems: 'center' }}>
        <Button onClick={startNew} sx={{ color: 'black', display: 'flex', flexDirection: 'column', ...fontSx, fontSize: '1.3rem', '&:hover': { bgcolor: 'transparent' } }}>
          <Box sx={{ width: { xs: 90, sm: 130 }, height: { xs: 90, sm: 130 }, borderRadius: '50%', bgcolor: teal, border: '4px solid black', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AddIcon sx={{ color: 'white', fontSize: { xs: 56, sm: 90 } }} />
          </Box>
          <Box component="span" mt={1}>New Routine</Box>
        </Button>
        <Button onClick={() => setMode('edit-pick')} sx={{ color: 'black', display: 'flex', flexDirection: 'column', ...fontSx, fontSize: '1.3rem', '&:hover': { bgcolor: 'transparent' } }}>
          <Box sx={{ width: { xs: 90, sm: 130 }, height: { xs: 90, sm: 130 }, borderRadius: '50%', bgcolor: teal, border: '4px solid black', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <EditIcon sx={{ color: 'white', fontSize: { xs: 48, sm: 76 } }} />
          </Box>
          <Box component="span" mt={1}>Edit Routine</Box>
        </Button>
      </Box>
    </Stack>
  )
}
