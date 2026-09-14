import ConstructionOutlinedIcon from '@mui/icons-material/ConstructionOutlined'
import { Box, Paper, Typography } from '@mui/material'

export function PlaceholderPage({ title }: { title: string }) {
  return <Box maxWidth="xl" mx="auto"><Typography variant="h4" mb={3}>{title}</Typography><Paper sx={{ p: 6, textAlign: 'center' }}><ConstructionOutlinedIcon color="primary" sx={{ fontSize: 48 }} /><Typography variant="h6" mt={2}>This workspace is coming soon</Typography><Typography color="text.secondary">The overview prototype is ready while this section is being designed.</Typography></Paper></Box>
}
