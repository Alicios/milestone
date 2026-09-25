import { useState, type Dispatch, type SetStateAction } from 'react'
import { AppBar, Avatar, Box, Button, Container, Divider, IconButton, Menu, MenuItem, Stack, Toolbar, Typography } from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { mockPatients, type Patient } from '../data/mockPatients'
import type { Routine } from '../data/mockRoutines'

export type DayAssignments = Partial<Record<number, Routine>>
type RoutineAssignments = Record<string, DayAssignments>

export interface DashboardOutletContext {
  patients: Patient[]
  setPatients: Dispatch<SetStateAction<Patient[]>>
  assignments: RoutineAssignments
  setAssignments: Dispatch<SetStateAction<RoutineAssignments>>
}

const teal = '#4b9da9'
const aqua = '#91c8c0'

export function DashboardLayout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const isMessagesPage = location.pathname === '/dashboard/messages'
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileMenuAnchor, setProfileMenuAnchor] = useState<null | HTMLElement>(null)
  const [patients, setPatients] = useState<Patient[]>(mockPatients)
  const [assignments, setAssignments] = useState<RoutineAssignments>({})

  const buttonSx = { color: 'black', border: '4px solid black', borderRadius: '18px', px: { xs: 2, sm: 3 }, py: 0.75, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: { xs: '1.2rem', sm: '1.7rem' }, '&:hover': { bgcolor: '#eb681d', color: 'white' } }

  return <Box className={isMessagesPage ? 'dashboard-shell messages-shell' : 'dashboard-shell modern-dashboard-shell'} sx={{ minHeight: '100vh', bgcolor: 'background.default', color: 'text.primary', fontFamily: 'Georgia, Times New Roman, serif' }}>
    <AppBar position="sticky" elevation={0} sx={{ bgcolor: teal, color: 'white', borderRadius: { xs: 0, md: '0 0 16px 16px' }, zIndex: (theme) => theme.zIndex.appBar }}>
      <Container maxWidth="xl">
        <Toolbar disableGutters sx={{ minHeight: { xs: 96, sm: 124 }, justifyContent: 'space-between', gap: 2, alignItems: 'center' }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 2 }} alignItems={{ xs: 'stretch', sm: 'center' }}>
            <Button component={RouterLink} to="/dashboard" onClick={() => setMenuOpen(false)} sx={{ ...buttonSx, bgcolor: location.pathname === '/dashboard' ? '#eb681d' : aqua, color: location.pathname === '/dashboard' ? 'white' : 'black' }}>Patients</Button>
            <Button component={RouterLink} to="/dashboard/routines" onClick={() => setMenuOpen(false)} sx={{ ...buttonSx, bgcolor: location.pathname === '/dashboard/routines' ? '#eb681d' : aqua }}>Routines</Button>
            <Button component={RouterLink} to="/dashboard/messages" onClick={() => setMenuOpen(false)} sx={{ ...buttonSx, bgcolor: location.pathname === '/dashboard/messages' ? '#eb681d' : aqua, color: location.pathname === '/dashboard/messages' ? 'white' : 'black' }}>Messages</Button>
          </Stack>
          <Stack direction="row" spacing={{ xs: 1, sm: 2 }} alignItems="center">
            <Typography sx={{ display: { xs: 'none', sm: 'block' }, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 700, fontSize: { sm: '1.7rem', md: '2.4rem' }, whiteSpace: 'nowrap' }}>Welcome, {user?.name.split(' ')[0]}!</Typography>
            <IconButton id="profile-menu-button" aria-label="Open profile menu" aria-haspopup="menu" aria-expanded={Boolean(profileMenuAnchor) ? 'true' : undefined} onClick={(event) => setProfileMenuAnchor(event.currentTarget)} sx={{ p: 0, borderRadius: '50%' }}>
              <Avatar alt={`${user?.name ?? 'User'} profile picture`} src={user?.avatarUrl} sx={{ width: { xs: 50, sm: 80 }, height: { xs: 50, sm: 80 }, bgcolor: aqua, color: 'black', border: '3px solid black', fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: { xs: '1.1rem', sm: '1.9rem' } }}>{user?.initials}</Avatar>
            </IconButton>
            <Menu anchorEl={profileMenuAnchor} open={Boolean(profileMenuAnchor)} onClose={() => setProfileMenuAnchor(null)} MenuListProps={{ 'aria-labelledby': 'profile-menu-button' }} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
              <Box sx={{ px: 2, py: 1 }}><Typography sx={{ fontWeight: 700, fontFamily: 'Georgia, serif' }}>{user?.name}</Typography>{(user?.role || user?.department) && <Typography variant="body2" color="text.secondary">{[user.role, user.department].filter(Boolean).join(' · ')}</Typography>}<Typography variant="body2" color="text.secondary">{user?.email}</Typography></Box>
              <Divider />
              <MenuItem component={RouterLink} to="/dashboard/profile" onClick={() => setProfileMenuAnchor(null)} sx={{ fontFamily: 'Georgia, serif' }}>Profile</MenuItem>
              <MenuItem component={RouterLink} to="/dashboard/settings" onClick={() => setProfileMenuAnchor(null)} sx={{ fontFamily: 'Georgia, serif' }}>Settings</MenuItem>
              <MenuItem onClick={() => { setProfileMenuAnchor(null); logout() }} sx={{ fontFamily: 'Georgia, serif' }}>Logout</MenuItem>
            </Menu>
            <IconButton aria-label="Open dashboard menu" onClick={() => setMenuOpen((open) => !open)} sx={{ display: { xs: 'flex', md: 'none' }, color: 'white' }}><MenuIcon /></IconButton>
          </Stack>
        </Toolbar>
        {menuOpen && <Box sx={{ display: { xs: 'block', md: 'none' }, pb: 2 }}>
          <Button component={RouterLink} to="/dashboard/patients" sx={{ color: 'white', fontFamily: 'Georgia, serif' }}>Patients</Button>
          <Button component={RouterLink} to="/dashboard/appointments" sx={{ color: 'white', fontFamily: 'Georgia, serif' }}>Appointments</Button>
          <Button component={RouterLink} to="/dashboard/messages" sx={{ color: 'white', fontFamily: 'Georgia, serif' }}>Messages</Button>
        </Box>}
      </Container>
    </AppBar>
    <Container maxWidth={false} sx={{ width: { xs: '100%', sm: '95%', md: '90%' }, maxWidth: 'none', py: isMessagesPage ? 0 : { xs: 2, md: 3 } }}>
      <Outlet context={{ patients, setPatients, assignments, setAssignments } satisfies DashboardOutletContext} />
    </Container>
  </Box>
}
