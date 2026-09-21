import { useId } from 'react'
import PersonRemoveOutlinedIcon from '@mui/icons-material/PersonRemoveOutlined'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'

interface DischargePatientDialogProps {
  patientName: string
  onCancel: () => void
  onDischarge: () => void
}

export function DischargePatientDialog({ patientName, onCancel, onDischarge }: DischargePatientDialogProps) {
  const id = useId()
  const buttonSx = { color: 'black', border: '3px solid black', borderRadius: '24px', px: 3, fontFamily: 'Georgia, serif', fontStyle: 'italic' }

  return <Dialog
    open
    onClose={onCancel}
    fullWidth
    maxWidth="sm"
    aria-labelledby={`${id}-title`}
    aria-describedby={`${id}-description`}
    slotProps={{ paper: { sx: { bgcolor: '#e8ddba', color: 'black', border: '4px solid black', borderRadius: '28px' } } }}
  >
    <DialogTitle id={`${id}-title`} sx={{ bgcolor: '#4b9da9', color: 'white', fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>Discharge Patient</DialogTitle>
    <DialogContent>
      <Typography id={`${id}-description`} sx={{ mt: 2, fontFamily: 'Georgia, serif', fontSize: '1.2rem', overflowWrap: 'anywhere' }}>
        Discharging <strong>{patientName}</strong> will remove them from the active patient list. This does not permanently delete their medical record.
      </Typography>
    </DialogContent>
    <DialogActions sx={{ px: 3, pb: 3, gap: 1, flexWrap: 'wrap' }}>
      <Button autoFocus onClick={onCancel} sx={{ ...buttonSx, bgcolor: 'white', '&:hover': { bgcolor: '#f5f5f5' } }}>Cancel</Button>
      <Button
        startIcon={<PersonRemoveOutlinedIcon />}
        onClick={onDischarge}
        sx={{ ...buttonSx, bgcolor: '#eb681d', '&:hover': { bgcolor: '#d15a17' } }}
      >Discharge Patient</Button>
    </DialogActions>
  </Dialog>
}
