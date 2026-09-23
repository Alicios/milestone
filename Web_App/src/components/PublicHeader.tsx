import MenuIcon from '@mui/icons-material/Menu'
import { AppBar, Box, Button, Container, IconButton, Menu, MenuItem, Toolbar } from '@mui/material'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Brand } from './Brand'

const resourceLinks = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Resources', href: '#resources' },
]

export function PublicHeader() {
  return (
    <AppBar position="sticky" color="transparent" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'rgba(232, 221, 186, .92)', backdropFilter: 'blur(12px)', zIndex: (theme) => theme.zIndex.appBar }}>
      <Container maxWidth="lg">
        <Toolbar disableGutters sx={{ justifyContent: 'space-between', minHeight: 76 }}>
          <Brand />
          <Box display="flex" gap={{ xs: 0.5, sm: 1 }} alignItems="center">
            <Box component="nav" aria-label="Home page resources" sx={{ display: { xs: 'none', md: 'flex' }, gap: 0.5 }}>
              {resourceLinks.map((link) => <Button key={link.href} component="a" href={link.href} color="inherit" size="small">{link.label}</Button>)}
            </Box>
            <ResourceMenu />
            <Button component={RouterLink} to="/login" color="inherit">Sign in</Button>
            <Button component={RouterLink} to="/login" variant="contained" sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>Get started</Button>
          </Box>
        </Toolbar>
      </Container>
    </AppBar>
  )
}

function ResourceMenu() {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const open = Boolean(anchorEl)

  return <>
    <IconButton aria-label="Open home page resources" aria-controls={open ? 'home-resource-menu' : undefined} aria-expanded={open ? 'true' : undefined} onClick={(event) => setAnchorEl(event.currentTarget)} sx={{ display: { xs: 'inline-flex', md: 'none' }, color: 'text.primary' }}>
      <MenuIcon />
    </IconButton>
    <Menu id="home-resource-menu" anchorEl={anchorEl} open={open} onClose={() => setAnchorEl(null)} MenuListProps={{ 'aria-label': 'Home page resources' }}>
      {resourceLinks.map((link) => <MenuItem component="a" href={link.href} key={link.href} onClick={() => setAnchorEl(null)}>{link.label}</MenuItem>)}
    </Menu>
  </>
}
