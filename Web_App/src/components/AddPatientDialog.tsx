import { useState, type FormEvent } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from '@mui/material'

interface AddPatientDialogProps {
  onCancel: () => void
  onAdd: (firstName: string, lastName: string) => void
}

export function AddPatientDialog({ onCancel, onAdd }: AddPatientDialogProps) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const trimmedFirstName = firstName.trim()
  const trimmedLastName = lastName.trim()
  const buttonSx = { color: 'black', border: '3px solid black', borderRadius: '24px', px: 3, fontFamily: 'Georgia, serif', fontStyle: 'italic' }
  const fieldSx = { '& .MuiOutlinedInput-root': { bgcolor: 'white', color: 'black', fontFamily: 'Georgia, serif', borderRadius: '20px', '& fieldset': { border: '3px solid black' } }, '& .MuiInputLabel-root': { fontFamily: 'Georgia, serif' } }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!trimmedFirstName || !trimmedLastName) return
    onAdd(trimmedFirstName, trimmedLastName)
  }

  return <Dialog
    open
    onClose={onCancel}
    fullWidth
    maxWidth="sm"
    aria-labelledby="add-patient-title"
    slotProps={{ paper: { sx: { bgcolor: '#e8ddba', color: 'black', border: '4px solid black', borderRadius: '28px' } } }}
  >
    <DialogTitle id="add-patient-title" sx={{ bgcolor: '#4b9da9', color: 'white', fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>Add Patient</DialogTitle>
    <Box component="form" onSubmit={handleSubmit}>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField
            id="patient-first-name"
            label="First Name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            required
            autoFocus
            sx={fieldSx}
          />
          <TextField
            id="patient-last-name"
            label="Last Name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            required
            sx={fieldSx}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1, flexDirection: { xs: 'column', sm: 'row' }, '& > .MuiButton-root': { width: { xs: '100%', sm: 'auto' }, ml: 0 } }}>
        <Button type="button" onClick={onCancel} sx={{ ...buttonSx, bgcolor: 'white', '&:hover': { bgcolor: '#f5f5f5' } }}>Cancel</Button>
        <Button
          type="submit"
          disabled={!trimmedFirstName || !trimmedLastName}
          sx={{ ...buttonSx, bgcolor: '#91c8c0', '&:hover': { bgcolor: '#82bdb5' }, '&.Mui-disabled': { bgcolor: '#d3d3d3', color: '#666666' } }}
        >Add Patient</Button>
      </DialogActions>
    </Box>
  </Dialog>
}
