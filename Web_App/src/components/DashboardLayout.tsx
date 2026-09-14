import { useState } from 'react'
import { AppBar, Avatar, Box, Button, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Toolbar, Typography, useMediaQuery } from '@mui/material'
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined'
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline'
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline'
import MenuIcon from '@mui/icons-material/Menu'
import LogoutIcon from '@mui/icons-material/Logout'
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom'
import { useTheme } from '@mui/material/styles'
import { Brand } from './Brand'
import { useAuth } from '../auth/AuthContext'

const drawerWidth = 248
const navigation = [
  { label: 'Overview', path: '/dashboard', icon: <DashboardOutlinedIcon /> },
  { label: 'Patients', path: '/dashboard/patients', icon: <PeopleOutlineIcon /> },
  { label: 'Appointments', path: '/dashboard/appointments', icon: <CalendarMonthOutlinedIcon /> },
  { label: 'Messages', path: '/dashboard/messages', icon: <ChatBubbleOutlineIcon /> },
]

export function DashboardLayout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const theme = useTheme()
  const desktop = useMediaQuery(theme.breakpoints.up('md'))
  const [mobileOpen, setMobileOpen] = useState(false)

  const drawer = (
    <Box sx={{ height: '100%', bgcolor: 'primary.dark', color: 'white', p: 2 }}>
      <Box sx={{ p: 1, mb: 3 }}><Brand light /></Box>
      <Typography variant="overline" sx={{ px: 1, color: 'rgba(255,255,255,.6)' }}>Workspace</Typography>
      <List>
        {navigation.map((item) => (
          <ListItemButton key={item.path} component={RouterLink} to={item.path} selected={location.pathname === item.path} onClick={() => setMobileOpen(false)} sx={{ color: 'inherit', borderRadius: 2, mb: .5, '&.Mui-selected': { bgcolor: 'rgba(255,255,255,.15)' }, '&.Mui-selected:hover': { bgcolor: 'rgba(255,255,255,.2)' } }}>
            <ListItemIcon sx={{ color: 'inherit', minWidth: 42 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
      <Box flexGrow={1} />
      <Button fullWidth startIcon={<LogoutIcon />} onClick={logout} sx={{ color: 'white', justifyContent: 'flex-start', px: 1.5 }}>Sign out</Button>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="fixed" color="inherit" elevation={0} sx={{ width: { md: `calc(100% - ${drawerWidth}px)` }, ml: { md: `${drawerWidth}px` }, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          {!desktop && <IconButton aria-label="Open navigation" onClick={() => setMobileOpen(true)}><MenuIcon /></IconButton>}
          <Box flexGrow={1} />
          <Box display="flex" alignItems="center" gap={1.5}><Avatar sx={{ bgcolor: 'secondary.main', width: 36, height: 36 }}>{user?.initials}</Avatar><Box display={{ xs: 'none', sm: 'block' }}><Typography variant="body2" fontWeight={700}>{user?.name}</Typography><Typography variant="caption" color="text.secondary">{user?.role}</Typography></Box></Box>
        </Toolbar>
      </AppBar>
      {desktop ? <Drawer variant="permanent" sx={{ width: drawerWidth, flexShrink: 0, '& .MuiDrawer-paper': { width: drawerWidth, boxSizing: 'border-box', border: 0 } }}>{drawer}</Drawer> : <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} sx={{ '& .MuiDrawer-paper': { width: drawerWidth } }}>{drawer}</Drawer>}
      <Box component="main" sx={{ flexGrow: 1, width: { md: `calc(100% - ${drawerWidth}px)` }, p: { xs: 2, sm: 3, md: 5 }, pt: { xs: 10, md: 12 } }}><Outlet /></Box>
    </Box>
  )
}
