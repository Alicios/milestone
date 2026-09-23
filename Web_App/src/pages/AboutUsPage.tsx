import { Box } from '@mui/material'
import { PublicHeader } from '../components/PublicHeader'

export function AboutUsPage() {
  return (
    <Box minHeight="100vh" bgcolor="background.default">
      <PublicHeader />
      <Box component="main" minHeight="calc(100vh - 76px)" bgcolor="background.default" />
    </Box>
  )
}
