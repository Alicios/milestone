import AddIcon from '@mui/icons-material/Add'
import { Alert, Box, Button, Card, Chip, Divider, Link, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { usePatientOnboardingStatuses } from '../hooks/usePatientOnboarding'
import { onboardingLabels } from '../lib/patientOnboarding'

export function PatientSetupBox() {
  const { data, loading, error, refresh } = usePatientOnboardingStatuses()
  return <Card component="section" aria-labelledby="patient-setup-heading" sx={{ width: { xs: '100%', lg: 320 }, flexShrink: 0, alignSelf: 'flex-start', p: 2.5 }}>
    <Typography id="patient-setup-heading" component="h2" variant="h6" sx={{ mb: 2 }}>Patient setup</Typography>
    <Button component={RouterLink} to="/dashboard/patients/new" variant="contained" startIcon={<AddIcon />} fullWidth>Add patient</Button>
    <Divider sx={{ my: 2 }} />
    {loading ? <Typography role="status">Loading patient setup…</Typography>
      : error ? <Alert severity="error" action={<Button color="inherit" onClick={() => void refresh()}>Retry setup</Button>}>{error}</Alert>
      : !data?.length ? <Typography color="text.secondary">No patients awaiting setup.</Typography>
      : <Stack component="ul" spacing={2} sx={{ m: 0, p: 0, listStyle: 'none', maxHeight: 520, overflowY: 'auto' }}>
        {data.map(patient => <Box component="li" key={patient.patientId}>
          <Link component={RouterLink} to={`/dashboard/patients/${encodeURIComponent(patient.patientId)}/setup`} sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{patient.name}</Link>
          <Chip size="small" label={patient.needsReconciliation ? 'Details need review' : onboardingLabels[patient.status]}
            color={patient.needsReconciliation || patient.status === 'code_expired' ? 'warning' : 'default'} sx={{ display: 'flex', width: 'fit-content', mt: .75 }} />
        </Box>)}
      </Stack>}
  </Card>
}
