import { useOutletContext } from 'react-router-dom'
import { Box, Typography } from '@mui/material'
import type { DashboardOutletContext } from '../components/DashboardLayout'
import { RoutineEditor } from '../components/RoutineEditor'

export function RoutinesPage() {
  const { routines, saveEditorRoutine, deleteRoutine } = useOutletContext<DashboardOutletContext>()
  return <Box>
    <Box sx={{ mb: 3 }}>
      <Typography component="h1" variant="h4" sx={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>Routines</Typography>
      <Typography color="text.secondary">Create, edit, and manage your saved patient routines.</Typography>
    </Box>
    <RoutineEditor savedRoutines={routines} onSave={saveEditorRoutine} onDelete={deleteRoutine} />
  </Box>
}
