import { useMemo, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { AuthProvider } from './auth/AuthContext'
import { DashboardLayout } from './components/DashboardLayout'
import { ProviderPreferencesProvider, useProviderPreferences } from './context/ProviderPreferencesContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { DashboardPage } from './pages/DashboardPage'
import { AboutUsPage } from './pages/AboutUsPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { MessagesPage } from './pages/MessagesPage'
import { NewPatientPage } from './pages/NewPatientPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { ProfilePage } from './pages/ProfilePage'
import { RegisterPage } from './pages/RegisterPage'
import { RoutinesPage } from './pages/RoutinesPage'
import { SettingsPage } from './pages/SettingsPage'
import { createMilestoneTheme } from './theme'

function AppTheme({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { resolvedTheme } = useProviderPreferences()
  const isProviderRoute = location.pathname.startsWith('/dashboard')
  const activeTheme = isProviderRoute ? resolvedTheme : 'light'
  const appTheme = useMemo(() => createMilestoneTheme(activeTheme), [activeTheme])

  return <ThemeProvider theme={appTheme}><CssBaseline /><div data-milestone-theme={activeTheme}>{children}</div></ThemeProvider>
}

function AppRoutes() {
  return <AuthProvider><Routes><Route path="/" element={<HomePage />} /><Route path="/about" element={<AboutUsPage />} /><Route path="/login" element={<LoginPage />} /><Route path="/register" element={<RegisterPage />} /><Route element={<ProtectedRoute />}><Route element={<DashboardLayout />}><Route path="/dashboard" element={<DashboardPage />} /><Route path="/dashboard/patients" element={<DashboardPage />} /><Route path="/dashboard/patients/new" element={<NewPatientPage />} /><Route path="/dashboard/routines" element={<RoutinesPage />} /><Route path="/dashboard/appointments" element={<PlaceholderPage title="Appointments" />} /><Route path="/dashboard/messages" element={<MessagesPage />} /><Route path="/dashboard/profile" element={<ProfilePage />} /><Route path="/dashboard/settings" element={<SettingsPage />} /></Route></Route><Route path="*" element={<Navigate to="/" replace />} /></Routes></AuthProvider>
}

export default function App() {
  return <BrowserRouter><ProviderPreferencesProvider><AppTheme><AppRoutes /></AppTheme></ProviderPreferencesProvider></BrowserRouter>
}
