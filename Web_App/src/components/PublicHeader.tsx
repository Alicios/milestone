import { AppBar, Box, Button, Container, Toolbar } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { Brand } from './Brand'

export function PublicHeader() {
  return (
    <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
      <Container maxWidth="lg">
        <Toolbar disableGutters sx={{ justifyContent: 'space-between', minHeight: 76 }}>
          <Brand />
          <Box display="flex" gap={1} alignItems="center">
            <Button component={RouterLink} to="/login" color="inherit">Sign in</Button>
            <Button component={RouterLink} to="/login" variant="contained">Get started</Button>
          </Box>
        </Toolbar>
      </Container>
    </AppBar>
  )
}
