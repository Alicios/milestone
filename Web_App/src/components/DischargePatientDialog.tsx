import { useId } from 'react'
import PersonRemoveOutlinedIcon from '@mui/icons-material/PersonRemoveOutlined'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography, useTheme } from '@mui/material'

interface DischargePatientDialogProps {
  patientName: string
  onCancel: () => void
  onDischarge: () => void
}

export function DischargePatientDialog({ patientName, onCancel, onDischarge }: DischargePatientDialogProps) {
  const theme = useTheme()
  const border = theme.palette.divider
  const text = theme.palette.text.primary
  const surface = theme.palette.background.paper
  const id = useId()
  const buttonSx = { color: text, border: `3px solid ${border}`, borderRadius: '24px', px: 3, fontFamily: 'Georgia, serif', fontStyle: 'italic' }

  return <Dialog
    open
    onClose={onCancel}
    fullWidth
    maxWidth="sm"
    aria-labelledby={`${id}-title`}
    aria-describedby={`${id}-description`}
    slotProps={{ paper: { sx: { bgcolor: 'background.paper', color: 'text.primary', border: `4px solid ${border}`, borderRadius: '28px' } } }}
  >
    <DialogTitle id={`${id}-title`} sx={{ bgcolor: '#4b9da9', color: 'white', fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>Discharge Patient</DialogTitle>
    <DialogContent>
      <Typography id={`${id}-description`} sx={{ mt: 2, fontFamily: 'Georgia, serif', fontSize: '1.2rem', overflowWrap: 'anywhere' }}>
        Discharging <strong>{patientName}</strong> will remove them from the active patient list. This does not permanently delete their medical record.
      </Typography>
    </DialogContent>
    <DialogActions sx={{ px: 3, pb: 3, gap: 1, flexWrap: 'wrap' }}>
      <Button autoFocus onClick={onCancel} sx={{ ...buttonSx, bgcolor: surface, '&:hover': { bgcolor: theme.palette.action.hover } }}>Cancel</Button>
      <Button
        startIcon={<PersonRemoveOutlinedIcon />}
        onClick={onDischarge}
        sx={{ ...buttonSx, bgcolor: '#eb681d', '&:hover': { bgcolor: '#d15a17' } }}
      >Discharge Patient</Button>
    </DialogActions>
  </Dialog>
}
