import { useState } from 'react'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined'
import DevicesOutlinedIcon from '@mui/icons-material/DevicesOutlined'
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import NetworkCheckOutlinedIcon from '@mui/icons-material/NetworkCheckOutlined'
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined'
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined'
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined'
import { Alert, Box, Button, Card, Chip, Divider, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

type CheckStatus = 'idle' | 'passed' | 'warning' | 'failed'

interface DiagnosticCheck {
  id: string
  title: string
  status: CheckStatus
  detail: string
}

const initialChecks: DiagnosticCheck[] = [
  { id: 'browser', title: 'Browser compatibility', status: 'idle', detail: 'Checks the browser features Milestone needs.' },
  { id: 'storage', title: 'Browser storage', status: 'idle', detail: 'Checks whether this browser allows local and session storage.' },
  { id: 'network', title: 'Network connection', status: 'idle', detail: 'Checks the browser network state and whether this app can be reached.' },
  { id: 'service', title: 'Milestone service', status: 'idle', detail: 'Checks whether the configured authentication service can be reached.' },
  { id: 'session', title: 'Sign-in session', status: 'idle', detail: 'Checks for a local signed-in session. Credentials are never displayed.' },
]

const statusLabel: Record<CheckStatus, string> = {
  idle: 'Not run',
  passed: 'Passed',
  warning: 'Check',
  failed: 'Failed',
}

function statusColor(status: CheckStatus): 'default' | 'success' | 'warning' | 'error' {
  if (status === 'passed') return 'success'
  if (status === 'warning') return 'warning'
  if (status === 'failed') return 'error'
  return 'default'
}

function browserCheck(): DiagnosticCheck {
  const missing = [
    typeof window.fetch !== 'function' && 'fetch',
    typeof window.Promise !== 'function' && 'Promise',
    typeof window.URL !== 'function' && 'URL',
  ].filter(Boolean)

  return {
    id: 'browser',
    title: 'Browser compatibility',
    status: missing.length ? 'failed' : 'passed',
    detail: missing.length
      ? `This browser is missing required features: ${missing.join(', ')}. Update to a supported browser and try again.`
      : 'Required browser features are available.',
  }
}

function storageCheck(): DiagnosticCheck {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const stores = [
    { name: 'local storage', getStorage: () => window.localStorage },
    { name: 'session storage', getStorage: () => window.sessionStorage },
  ]
  const unavailable: string[] = []
  const cleanupFailures: string[] = []

  for (const { name, getStorage } of stores) {
    const key = `milestone-support-check-${suffix}-${name.replace(' ', '-')}`
    let writeSucceeded = false
    try {
      const storage = getStorage()
      storage.setItem(key, 'ok')
      writeSucceeded = true
      storage.removeItem(key)
    } catch {
      unavailable.push(name)
      if (writeSucceeded) cleanupFailures.push(name)
    }
  }

  if (cleanupFailures.length) {
    return {
      id: 'storage',
      title: 'Browser storage',
      status: 'warning',
      detail: `Could not remove a temporary test item from ${cleanupFailures.join(' and ')}. If needed, clear this site's storage after signing out.`,
    }
  }
  return {
    id: 'storage',
    title: 'Browser storage',
    status: unavailable.length ? 'warning' : 'passed',
    detail: unavailable.length
      ? `Could not use ${unavailable.join(' and ')}. Browser privacy settings or extensions may be blocking storage.`
      : 'Local and session storage are available.',
  }
}

async function checkEndpoint(url: URL, id: string, title: string, reachableDetail: string, method: 'GET' | 'HEAD' = 'HEAD', headers?: HeadersInit): Promise<DiagnosticCheck> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 8000)
  try {
    const response = await window.fetch(url, { method, headers, cache: 'no-store', signal: controller.signal })
    if (response.ok) {
      return { id, title, status: 'passed', detail: reachableDetail }
    }
    const status = response.status
    return {
      id,
      title,
      status: status >= 500 ? 'failed' : 'warning',
      detail: status === 401 || status === 403
        ? `The endpoint is reachable but rejected the health check with HTTP ${status}. Verify the deployment's public API key and any network access policies.`
        : `The endpoint responded with HTTP ${status}. The service may be unavailable or this check may be blocked.`,
    }
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'AbortError'
    return {
      id,
      title,
      status: 'failed',
      detail: timedOut
        ? 'The request timed out after 8 seconds.'
        : 'The request could not complete. Check the network, firewall, or browser extensions.',
    }
  } finally {
    window.clearTimeout(timeout)
  }
}

async function networkCheck(): Promise<DiagnosticCheck[]> {
  const connection: DiagnosticCheck = navigator.onLine
    ? { id: 'network', title: 'Network connection', status: 'passed', detail: 'The browser reports an active network connection.' }
    : { id: 'network', title: 'Network connection', status: 'failed', detail: 'The browser reports that it is offline. Reconnect and run the checks again.' }
  if (!navigator.onLine) return [connection]

  const appUrl = new URL(import.meta.env.BASE_URL, window.location.origin)
  const app = await checkEndpoint(appUrl, 'app', 'Web app reachability', 'The Milestone web app responded successfully.')
  return [connection, app]
}

async function serviceCheck(): Promise<DiagnosticCheck> {
  const serviceUrl = import.meta.env.VITE_SUPABASE_URL
  if (!isSupabaseConfigured || !serviceUrl) {
    return {
      id: 'service',
      title: 'Milestone service',
      status: 'failed',
      detail: 'This deployment is missing its service configuration. Contact your Milestone administrator.',
    }
  }
  try {
    const healthUrl = new URL('auth/v1/health', `${serviceUrl.replace(/\/+$/, '')}/`)
    const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    return checkEndpoint(healthUrl, 'service', 'Milestone service', 'The authentication service is reachable.', 'GET', { apikey: apiKey })
  } catch {
    return {
      id: 'service',
      title: 'Milestone service',
      status: 'failed',
      detail: 'This deployment has an invalid service URL. Contact your Milestone administrator.',
    }
  }
}

async function sessionCheck(): Promise<DiagnosticCheck> {
  try {
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      return { id: 'session', title: 'Sign-in session', status: 'failed', detail: 'The browser could not read the current sign-in session. Try signing in again.' }
    }
    return data.session
      ? { id: 'session', title: 'Sign-in session', status: 'passed', detail: 'A signed-in session is present. Credentials are excluded from this report.' }
      : { id: 'session', title: 'Sign-in session', status: 'warning', detail: 'No signed-in session was found. Sign in again and rerun the checks.' }
  } catch {
    return { id: 'session', title: 'Sign-in session', status: 'failed', detail: 'The browser could not read the current sign-in session. Try signing in again.' }
  }
}

function getEnvironmentDetails() {
  return [
    ['Browser', navigator.userAgent],
    ['Language', navigator.language || 'Unavailable'],
    ['Time zone', Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unavailable'],
    ['Viewport', `${window.innerWidth} × ${window.innerHeight}`],
    ['App origin', window.location.origin],
  ]
}

function createReport(checks: DiagnosticCheck[], completedAt: string) {
  const lines = [
    'Milestone Web App Support Report',
    `Generated: ${completedAt}`,
    ...getEnvironmentDetails().map(([label, value]) => `${label}: ${value}`),
    '',
    'Diagnostic checks',
    ...checks.map((check) => `${statusLabel[check.status]} — ${check.title}: ${check.detail}`),
  ]
  return lines.join('\n')
}

function CheckIcon({ status }: { status: CheckStatus }) {
  if (status === 'passed') return <CheckCircleOutlineIcon color="success" />
  if (status === 'failed') return <ErrorOutlineIcon color="error" />
  if (status === 'warning') return <HelpOutlineIcon color="warning" />
  return <HelpOutlineIcon color="disabled" />
}

export function SupportToolsPage() {
  const [checks, setChecks] = useState(initialChecks)
  const [running, setRunning] = useState(false)
  const [completedAt, setCompletedAt] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const hasRun = Boolean(completedAt)

  const runChecks = async () => {
    if (running) return
    setRunning(true)
    setActionMessage('')
    setActionError('')
    setChecks(initialChecks)

    try {
      const [networkResults, service, session] = await Promise.all([
        networkCheck(),
        serviceCheck(),
        sessionCheck(),
      ])
      const results = [
        browserCheck(),
        storageCheck(),
        ...networkResults,
        service,
        session,
      ]
      setChecks(results)
      setCompletedAt(new Date().toISOString())
    } catch {
      setActionError('Some checks could not complete. Retry, and contact your Milestone administrator if the problem continues.')
    } finally {
      setRunning(false)
    }
  }

  const report = hasRun ? createReport(checks, completedAt) : ''

  const copyReport = async () => {
    setActionMessage('')
    setActionError('')
    try {
      await navigator.clipboard.writeText(report)
      setActionMessage('Support report copied. Review it before sharing with your IT team.')
    } catch {
      setActionError('The report could not be copied. Try downloading it instead.')
    }
  }

  const downloadReport = () => {
    setActionMessage('')
    setActionError('')
    try {
      const blob = new Blob([report], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `milestone-support-report-${new Date().toISOString().slice(0, 10)}.txt`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setActionMessage('Support report downloaded. Review it before sharing with your IT team.')
    } catch {
      setActionError('The report could not be downloaded in this browser.')
    }
  }

  return <Box maxWidth={1080} mx="auto" py={{ xs: 1, md: 2 }}>
    <Button component={RouterLink} to="/dashboard" startIcon={<ArrowBackIcon />} sx={{ mb: 2 }}>Back to Dashboard</Button>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} mb={1}>
      <Box sx={{ width: 56, height: 56, flexShrink: 0, borderRadius: 2, bgcolor: 'primary.main', color: 'primary.contrastText', display: 'grid', placeItems: 'center' }}>
        <SupportAgentOutlinedIcon fontSize="large" />
      </Box>
      <Box>
        <Typography component="h1" variant="h3" sx={{ fontSize: { xs: '2rem', sm: '2.7rem' } }}>IT Support Tools</Typography>
        <Typography color="text.secondary">Run safe checks for common browser, network, and sign-in issues.</Typography>
      </Box>
    </Stack>

    <Alert severity="info" icon={<ShieldOutlinedIcon />} sx={{ my: 2 }}>
      Checks run in this browser only. Nothing is sent to Milestone automatically. Reports include browser and network diagnostics, but never patient details, account identifiers, or sign-in credentials. Review a report before sharing it.
    </Alert>

    <Stack spacing={2}>
      <Card component="section" aria-labelledby="support-checks-heading" sx={{ borderRadius: 3, overflow: 'hidden' }}>
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ sm: 'center' }}>
            <Box>
              <Typography id="support-checks-heading" component="h2" variant="h5">System checks</Typography>
              <Typography color="text.secondary" variant="body2">These checks do not read patient records or change your account.</Typography>
            </Box>
            <Button type="button" onClick={() => void runChecks()} disabled={running} variant="contained" startIcon={<RefreshOutlinedIcon />} sx={{ flexShrink: 0 }}>
              {running ? 'Running checks…' : hasRun ? 'Run checks again' : 'Run checks'}
            </Button>
          </Stack>
          <Divider sx={{ my: 2 }} />
          <Stack spacing={1}>
            {checks.map((check) => <Box key={check.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, py: 1 }}>
              <Box sx={{ pt: 0.25, flexShrink: 0 }}><CheckIcon status={check.status} /></Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Typography fontWeight={700}>{check.title}</Typography>
                  <Chip size="small" label={statusLabel[check.status]} color={statusColor(check.status)} variant={check.status === 'idle' ? 'outlined' : 'filled'} />
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{check.detail}</Typography>
              </Box>
            </Box>)}
          </Stack>
          {actionError && <Alert severity="error" sx={{ mt: 2 }}>{actionError}</Alert>}
          {actionMessage && <Alert severity="success" role="status" sx={{ mt: 2 }}>{actionMessage}</Alert>}
          {hasRun && <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }}>
            <Button type="button" onClick={() => void copyReport()} disabled={running} variant="outlined" startIcon={<ContentCopyOutlinedIcon />}>Copy support report</Button>
            <Button type="button" onClick={downloadReport} disabled={running} variant="outlined" startIcon={<DownloadOutlinedIcon />}>Download support report</Button>
          </Stack>}
          {hasRun && <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>Report generated {completedAt}. It is only shared if you choose to copy or download it.</Typography>}
        </Box>
      </Card>

      <Card component="section" aria-labelledby="support-environment-heading" sx={{ borderRadius: 3 }}>
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack direction="row" spacing={1.5} alignItems="center" mb={1}>
            <DevicesOutlinedIcon color="primary" />
            <Typography id="support-environment-heading" component="h2" variant="h6">Browser environment</Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Useful context when reporting a problem. The same details are included in a support report.</Typography>
          <Stack spacing={1}>
            {getEnvironmentDetails().map(([label, value]) => <Stack key={label} direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0, sm: 2 }}>
              <Typography variant="body2" fontWeight={700} sx={{ minWidth: { sm: 140 } }}>{label}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{value}</Typography>
            </Stack>)}
          </Stack>
        </Box>
      </Card>

      <Card component="section" aria-labelledby="support-next-steps-heading" sx={{ borderRadius: 3 }}>
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack direction="row" spacing={1.5} alignItems="center" mb={1}>
            <NetworkCheckOutlinedIcon color="primary" />
            <Typography id="support-next-steps-heading" component="h2" variant="h6">If something is not working</Typography>
          </Stack>
          <Stack component="ul" spacing={1} sx={{ pl: 2.5, mb: 0 }}>
            <Typography component="li" variant="body2" color="text.secondary">Refresh Milestone and run the checks again. If you have unsaved work, save it before refreshing.</Typography>
            <Typography component="li" variant="body2" color="text.secondary">If the service or network check fails, ask your organization’s IT team to verify access to the Milestone web app and its configured services.</Typography>
            <Typography component="li" variant="body2" color="text.secondary">If the session check needs attention, sign out and sign in again. Do not share passwords or verification codes with support.</Typography>
            <Typography component="li" variant="body2" color="text.secondary">Share the downloaded or copied report only with your approved IT or Milestone support contact.</Typography>
          </Stack>
        </Box>
      </Card>
    </Stack>
  </Box>
}
