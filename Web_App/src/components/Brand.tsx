import HealthAndSafetyOutlinedIcon from '@mui/icons-material/HealthAndSafetyOutlined'
import { Stack, Typography } from '@mui/material'

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Stack direction="row" spacing={1.25} alignItems="center">
      <HealthAndSafetyOutlinedIcon color={light ? 'inherit' : 'primary'} fontSize="large" />
      <Typography variant="h6" fontWeight={800} color={light ? 'inherit' : 'primary.dark'}>CareBridge</Typography>
    </Stack>
  )
}
