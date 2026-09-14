import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { DashboardLayout } from './components/DashboardLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { DashboardPage } from './pages/DashboardPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { PlaceholderPage } from './pages/PlaceholderPage'

export default function App() {
  return <BrowserRouter><AuthProvider><Routes><Route path="/" element={<HomePage />} /><Route path="/login" element={<LoginPage />} /><Route element={<ProtectedRoute />}><Route element={<DashboardLayout />}><Route path="/dashboard" element={<DashboardPage />} /><Route path="/dashboard/patients" element={<DashboardPage />} /><Route path="/dashboard/routines" element={<PlaceholderPage title="Routines" />} /><Route path="/dashboard/appointments" element={<PlaceholderPage title="Appointments" />} /><Route path="/dashboard/messages" element={<PlaceholderPage title="Messages" />} /></Route></Route><Route path="*" element={<Navigate to="/" replace />} /></Routes></AuthProvider></BrowserRouter>
}
