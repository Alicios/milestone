import { useState } from 'react'
import { AppBar, Avatar, Box, Button, Container, IconButton, Stack, Toolbar, Typography } from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const teal = '#4b9da9'
const aqua = '#91c8c0'

export function DashboardLayout() {
  const { user } = useAuth()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  const buttonSx = { color: 'black', border: '4px solid black', borderRadius: '18px', px: { xs: 2, sm: 4 }, py: 1, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: { xs: '1.4rem', sm: '2rem' }, '&:hover': { bgcolor: '#eb681d', color: 'white' } }

  return <Box sx={{ minHeight: '100vh', bgcolor: '#e8ddba', color: '#050505', fontFamily: 'Georgia, Times New Roman, serif' }}><AppBar position="static" elevation={0} sx={{ bgcolor: teal, color: 'white', borderRadius: { xs: 0, md: '0 0 16px 16px' } }}><Container maxWidth="xl"><Toolbar disableGutters sx={{ minHeight: { xs: 112, sm: 148 }, justifyContent: 'space-between', gap: 2, alignItems: 'center' }}><Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 3 }} alignItems={{ xs: 'stretch', sm: 'center' }}><Button component={RouterLink} to="/dashboard" onClick={() => setMenuOpen(false)} sx={{ ...buttonSx, bgcolor: location.pathname === '/dashboard' ? '#eb681d' : aqua, color: location.pathname === '/dashboard' ? 'white' : 'black' }}>Patients</Button><Button component={RouterLink} to="/dashboard/routines" onClick={() => setMenuOpen(false)} sx={{ ...buttonSx, bgcolor: location.pathname === '/dashboard/routines' ? '#eb681d' : aqua }}>Routines</Button></Stack><Stack direction="row" spacing={{ xs: 1, sm: 2 }} alignItems="center"><Typography sx={{ display: { xs: 'none', sm: 'block' }, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 700, fontSize: { sm: '2rem', md: '2.8rem' }, whiteSpace: 'nowrap' }}>Welcome, {user?.name.split(' ')[0]}!</Typography><Avatar sx={{ width: { xs: 58, sm: 96 }, height: { xs: 58, sm: 96 }, bgcolor: aqua, color: 'black', border: '3px solid black', fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: { xs: '1.3rem', sm: '2.2rem' } }}>{user?.initials}</Avatar><IconButton aria-label="Open dashboard menu" onClick={() => setMenuOpen((open) => !open)} sx={{ display: { xs: 'flex', md: 'none' }, color: 'white' }}><MenuIcon /></IconButton></Stack></Toolbar>{menuOpen && <Box sx={{ display: { xs: 'block', md: 'none' }, pb: 2 }}><Button component={RouterLink} to="/dashboard/patients" sx={{ color: 'white', fontFamily: 'Georgia, serif' }}>Patients</Button><Button component={RouterLink} to="/dashboard/appointments" sx={{ color: 'white', fontFamily: 'Georgia, serif' }}>Appointments</Button><Button component={RouterLink} to="/dashboard/messages" sx={{ color: 'white', fontFamily: 'Georgia, serif' }}>Messages</Button></Box>}</Container></AppBar><Container maxWidth="xl" sx={{ py: { xs: 2, md: 3 } }}><Outlet /></Container></Box>
}
