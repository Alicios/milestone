import MenuIcon from '@mui/icons-material/Menu'
import { AppBar, Box, Button, Container, IconButton, Menu, MenuItem, Toolbar } from '@mui/material'
import { useState } from 'react'
import { Link as RouterLink, useLocation } from 'react-router-dom'
import { Brand } from './Brand'

const resourceLinks = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'App previews', href: '#app-previews' },
  { label: 'Resources', href: '#resources' },
]

export function PublicHeader() {
  const { pathname } = useLocation()
  const homeHref = (hash: string) => pathname === '/' ? hash : `/${hash}`
  return (
    <AppBar position="sticky" color="transparent" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'rgba(232, 221, 186, .92)', backdropFilter: 'blur(12px)', zIndex: (theme) => theme.zIndex.appBar }}>
      <Container maxWidth="lg">
        <Toolbar disableGutters sx={{ justifyContent: 'space-between', minHeight: 76 }}>
          <Brand />
          <Box display="flex" gap={{ xs: 0.5, sm: 1 }} alignItems="center">
            <Box component="nav" aria-label="Home page resources" sx={{ display: { xs: 'none', lg: 'flex' }, gap: 0.5 }}>
              {resourceLinks.map((link) => <Button key={link.href} component="a" href={homeHref(link.href)} color="inherit" size="small">{link.label}</Button>)}
              <Button component={RouterLink} to="/faq" color="inherit" size="small">FAQ</Button>
            </Box>
            <ResourceMenu homeHref={homeHref} />
            <Button component={RouterLink} to="/login" color="inherit">Sign in</Button>
            <Button component={RouterLink} to="/register" variant="contained" sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>Get started</Button>
          </Box>
        </Toolbar>
      </Container>
    </AppBar>
  )
}

function ResourceMenu({ homeHref }: { homeHref: (hash: string) => string }) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const open = Boolean(anchorEl)

  return <>
    <IconButton aria-label="Open home page resources" aria-controls={open ? 'home-resource-menu' : undefined} aria-expanded={open ? 'true' : undefined} onClick={(event) => setAnchorEl(event.currentTarget)} sx={{ display: { xs: 'inline-flex', lg: 'none' }, color: 'text.primary' }}>
      <MenuIcon />
    </IconButton>
    <Menu id="home-resource-menu" anchorEl={anchorEl} open={open} onClose={() => setAnchorEl(null)} MenuListProps={{ 'aria-label': 'Home page resources' }}>
      {resourceLinks.map((link) => <MenuItem component="a" href={homeHref(link.href)} key={link.href} onClick={() => setAnchorEl(null)}>{link.label}</MenuItem>)}
      <MenuItem component={RouterLink} to="/faq" onClick={() => setAnchorEl(null)}>FAQ</MenuItem>
    </Menu>
  </>
}
