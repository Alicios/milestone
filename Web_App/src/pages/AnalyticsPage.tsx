import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Alert, Box, Button, Card, Stack, Typography, useTheme } from '@mui/material'
import type { DashboardOutletContext } from '../components/DashboardLayout'
import { loadProviderRoutineAnalytics } from '../lib/supabaseData'
import { loadMessageConversations } from '../lib/messages'
import { errorMessage } from '../lib/errors'
import { routineStatusLabels, routineStatusPalette, type RoutineVisualStatus } from '../lib/routineStatus'
import type { ProviderRoutineAnalyticsRow } from '../types'

const fontSx = { fontFamily: 'Georgia, serif', fontStyle: 'italic' }

function StatCard({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: string }) {
  const theme = useTheme()
  const surface = theme.palette.background.paper
  const text = theme.palette.text.primary
  const border = theme.palette.divider
  return <Card sx={{ flex: '1 1 180px', minWidth: 160, p: 2.5, border: `4px solid ${border}`, bgcolor: surface, color: text, borderRadius: '20px' }}>
    <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: '.08em' }}>{label}</Typography>
    <Typography sx={{ ...fontSx, fontSize: '2.1rem', fontWeight: 700, mt: 0.5, color: accent }}>{value}</Typography>
    {hint && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{hint}</Typography>}
  </Card>
}

function StatusChip({ status, count }: { status: RoutineVisualStatus; count: number }) {
  const theme = useTheme()
  const palette = routineStatusPalette(status, theme.palette.mode)
  return <Stack direction="row" spacing={1} alignItems="center" sx={{ bgcolor: palette.background, color: palette.foreground, border: `2px solid ${palette.border}`, borderRadius: '999px', px: 1.5, py: 0.5 }}>
    <Typography sx={{ fontWeight: 700 }}>{count}</Typography>
    <Typography variant="body2">{routineStatusLabels[status]}</Typography>
  </Stack>
}

function patientPriority(row: ProviderRoutineAnalyticsRow) {
  // Patients needing attention float to the top: critical first, then any
  // open issue, then a high miss rate, then alphabetical as a stable tiebreak.
  if (row.criticalCount > 0) return 0
  if (row.issueCount > 0) return 1
  if (row.missedCount > 0) return 2
  return 3
}

export function AnalyticsPage() {
  const theme = useTheme()
  const surface = theme.palette.background.paper
  const text = theme.palette.text.primary
  const border = theme.palette.divider
  const { patients } = useOutletContext<DashboardOutletContext>()
  const [rows, setRows] = useState<ProviderRoutineAnalyticsRow[]>([])
  const [unreadMessages, setUnreadMessages] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    Promise.all([loadProviderRoutineAnalytics(), loadMessageConversations()]).then(([analytics, conversations]) => {
      if (!active) return
      setRows(analytics)
      setUnreadMessages(conversations.reduce((total, conversation) => total + conversation.unread, 0))
    }).catch((loadError) => {
      if (active) setError(errorMessage(loadError, 'Analytics could not be loaded.'))
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [attempt])

  const activePatients = patients.filter((patient) => !patient.dischargedAt).length
  const totals = useMemo(() => rows.reduce((sum, row) => ({
    scheduled: sum.scheduled + row.scheduledCount,
    completed: sum.completed + row.completedCount,
    missed: sum.missed + row.missedCount,
    critical: sum.critical + row.criticalCount,
    issue: sum.issue + row.issueCount,
    inProgress: sum.inProgress + row.inProgressCount,
  }), { scheduled: 0, completed: 0, missed: 0, critical: 0, issue: 0, inProgress: 0 }), [rows])
  const completionRate = totals.scheduled ? Math.round((totals.completed / totals.scheduled) * 100) : null
  const painScores = rows.map((row) => row.avgPainScore).filter((score): score is number => score != null)
  const avgPainScore = painScores.length ? painScores.reduce((sum, score) => sum + score, 0) / painScores.length : null
  const sortedRows = useMemo(() => [...rows].filter((row) => !row.discharged)
    .sort((first, second) => patientPriority(first) - patientPriority(second) || first.patientName.localeCompare(second.patientName)), [rows])

  return <>
    <Stack spacing={0.5} sx={{ mb: 3 }}>
      <Typography component="h1" variant="h4">Analytics</Typography>
      <Typography color="text.secondary">Routine completion and patient feedback across your active patients, last 8 weeks.</Typography>
    </Stack>

    {error && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" disabled={loading} onClick={() => setAttempt((n) => n + 1)}>Retry</Button>}>{error}</Alert>}
    {loading && !rows.length && !error && <Alert severity="info" sx={{ mb: 2 }}>Loading analytics…</Alert>}

    <Stack direction="row" flexWrap="wrap" gap={2} sx={{ mb: 4 }}>
      <StatCard label="Active patients" value={String(activePatients)} hint={`${patients.length} total`} />
      <StatCard label="Routines scheduled" value={String(totals.scheduled)} hint="last 8 weeks" />
      <StatCard label="Completion rate" value={completionRate == null ? '—' : `${completionRate}%`} accent={completionRate != null && completionRate < 60 ? '#b42332' : undefined} />
      <StatCard label="Needs attention" value={String(totals.critical + totals.issue)} hint={`${totals.critical} critical`} accent={totals.critical > 0 ? '#b42332' : undefined} />
      <StatCard label="Avg. reported pain" value={avgPainScore == null ? '—' : avgPainScore.toFixed(1)} hint="scale of 1–10" />
      <StatCard label="Unread messages" value={unreadMessages == null ? '—' : String(unreadMessages)} />
    </Stack>

    <Typography component="h2" variant="h6" sx={{ mb: 1.5 }}>By patient</Typography>
    {!loading && !sortedRows.length && !error ? <Card sx={{ p: 4, textAlign: 'center', border: `4px solid ${border}`, bgcolor: surface, color: text }}><Typography>No routines scheduled in the last 8 weeks for your active patients.</Typography></Card> : null}
    <Stack spacing={1.5}>
      {sortedRows.map((row) => <Card key={row.patientProfileId} sx={{ p: 2.5, border: `4px solid ${border}`, bgcolor: surface, color: text, borderRadius: '18px' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1.5}>
          <Box minWidth={0}>
            <Typography sx={{ fontWeight: 700, fontSize: '1.2rem', overflowWrap: 'anywhere' }}>{row.patientName}</Typography>
            <Typography variant="body2" color="text.secondary">
              {row.scheduledCount} scheduled · {row.completedCount} completed{row.avgPainScore != null && ` · avg pain ${row.avgPainScore.toFixed(1)}`}
            </Typography>
          </Box>
          <Stack direction="row" flexWrap="wrap" gap={1}>
            {row.criticalCount > 0 && <StatusChip status="critical" count={row.criticalCount} />}
            {row.issueCount > 0 && <StatusChip status="issue" count={row.issueCount} />}
            {row.missedCount > 0 && <StatusChip status="missed" count={row.missedCount} />}
            {row.completedCount > 0 && <StatusChip status="completed" count={row.completedCount} />}
          </Stack>
        </Stack>
      </Card>)}
    </Stack>
  </>
}
