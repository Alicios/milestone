import { useLayoutEffect, useMemo, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigationType } from 'react-router-dom'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { AuthProvider } from './auth/AuthContext'
import { DashboardLayout } from './components/DashboardLayout'
import { ProviderPreferencesProvider, useProviderPreferences } from './context/ProviderPreferencesContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { DashboardPage } from './pages/DashboardPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { AboutUsPage } from './pages/AboutUsPage'
import { HomePage } from './pages/HomePage'
import { FaqPage } from './pages/FaqPage'
import { LoginPage } from './pages/LoginPage'
import { MessagesPage } from './pages/MessagesPage'
import { NewPatientPage } from './pages/NewPatientPage'
import { PatientSetupPage } from './pages/PatientSetupPage'
import { PatientPage } from './pages/PatientPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { ProfilePage } from './pages/ProfilePage'
import { RegisterPage } from './pages/RegisterPage'
import { RoutinesPage } from './pages/RoutinesPage'
import { RoutineStatusPreviewPage } from './pages/RoutineStatusPreviewPage'
import { TutorialPage } from './pages/TutorialPage'
import { SettingsPage } from './pages/SettingsPage'
import { SupportToolsPage } from './pages/SupportToolsPage'
import { createMilestoneTheme } from './theme'

function AppTheme({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { resolvedTheme } = useProviderPreferences()
  const isProviderRoute = location.pathname.startsWith('/dashboard')
  const activeTheme = isProviderRoute ? resolvedTheme : 'light'
  const appTheme = useMemo(() => createMilestoneTheme(activeTheme), [activeTheme])

  return <ThemeProvider theme={appTheme}><CssBaseline /><div data-milestone-theme={activeTheme}>{children}</div></ThemeProvider>
}

function RouteScrollReset() {
  const { pathname, hash } = useLocation()
  const navigationType = useNavigationType()
  useLayoutEffect(() => {
    // New pages start at their heading; preserve hash anchors and history returns.
    if (navigationType === 'PUSH' && !hash) window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname, hash, navigationType])
  return null
}

function AppRoutes() {
  return <AuthProvider><Routes><Route path="/" element={<HomePage />} /><Route path="/faq" element={<FaqPage />} /><Route path="/about" element={<AboutUsPage />} /><Route path="/login" element={<LoginPage />} /><Route path="/register" element={<RegisterPage />} /><Route element={<ProtectedRoute />}><Route element={<DashboardLayout />}><Route path="/dashboard" element={<DashboardPage />} /><Route path="/dashboard/patients" element={<DashboardPage />} /><Route path="/dashboard/patients/new" element={<NewPatientPage />} /><Route path="/dashboard/patients/:patientId/setup" element={<PatientSetupPage />} /><Route path="/dashboard/patients/:patientId" element={<PatientPage />} />{import.meta.env.DEV && <Route path="/dashboard/routine-status-preview" element={<RoutineStatusPreviewPage />} />}<Route path="/dashboard/routines" element={<RoutinesPage />} /><Route path="/dashboard/appointments" element={<PlaceholderPage title="Appointments" />} /><Route path="/dashboard/messages" element={<MessagesPage />} /><Route path="/dashboard/profile" element={<ProfilePage />} /><Route path="/dashboard/settings" element={<SettingsPage />} /><Route path="/dashboard/it-support" element={<SupportToolsPage />} /></Route></Route><Route path="*" element={<Navigate to="/" replace />} /></Routes></AuthProvider>
  return <AuthProvider><Routes><Route path="/" element={<HomePage />} /><Route path="/faq" element={<FaqPage />} /><Route path="/about" element={<AboutUsPage />} /><Route path="/login" element={<LoginPage />} /><Route path="/register" element={<RegisterPage />} /><Route element={<ProtectedRoute />}><Route element={<DashboardLayout />}><Route path="/dashboard" element={<DashboardPage />} /><Route path="/dashboard/patients" element={<DashboardPage />} /><Route path="/dashboard/patients/new" element={<NewPatientPage />} /><Route path="/dashboard/patients/:patientId/setup" element={<PatientSetupPage />} /><Route path="/dashboard/patients/:patientId" element={<PatientPage />} />{import.meta.env.DEV && <Route path="/dashboard/routine-status-preview" element={<RoutineStatusPreviewPage />} />}<Route path="/dashboard/routines" element={<RoutinesPage />} /><Route path="/dashboard/appointments" element={<PlaceholderPage title="Appointments" />} /><Route path="/dashboard/analytics" element={<AnalyticsPage />} /><Route path="/dashboard/messages" element={<MessagesPage />} /><Route path="/dashboard/profile" element={<ProfilePage />} /><Route path="/dashboard/tutorials" element={<TutorialPage />} /><Route path="/dashboard/settings" element={<SettingsPage />} /></Route></Route><Route path="*" element={<Navigate to="/" replace />} /></Routes></AuthProvider>
}

export default function App() {
  return <BrowserRouter><RouteScrollReset /><ProviderPreferencesProvider><AppTheme><AppRoutes /></AppTheme></ProviderPreferencesProvider></BrowserRouter>
}
