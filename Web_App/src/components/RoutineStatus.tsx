import { Box, Button, Card, Stack, Typography, useTheme } from '@mui/material'
import type { ReactNode } from 'react'
import { routineStatusLabels, routineStatusOrder, routineStatusPalette, type RoutineStatusPresentation } from '../lib/routineStatus'

export function RoutineStatusLabel({ presentation }: { presentation: RoutineStatusPresentation }) {
  const palette = routineStatusPalette(presentation.status, useTheme().palette.mode)
  return <Typography component="span" variant="caption" sx={{ display: 'block', width: 'fit-content', borderRadius: 1, px: .5, py: .25,
    bgcolor: palette.background, fontWeight: 700, color: palette.foreground, lineHeight: 1.4 }}>{presentation.label}</Typography>
}

export function RoutineStatusButton({ name, date, presentation, expanded, controls, onClick }: {
  name: string; date: string; presentation: RoutineStatusPresentation; expanded: boolean; controls: string; onClick: () => void
}) {
  const palette = routineStatusPalette(presentation.status, useTheme().palette.mode)
  return <Button aria-label={`View assigned routine ${name} on ${date}`} aria-description={presentation.label}
    aria-expanded={expanded} aria-controls={controls} data-routine-status={presentation.status} onClick={onClick}
    sx={{ '--routine-status-border': palette.border, width: '100%', minWidth: 0, bgcolor: palette.background, color: palette.foreground, border: `2px solid ${palette.border}`,
      borderRadius: '18px', px: .5, py: .75, display: 'flex', flexDirection: 'column', gap: .5,
      fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: { xs: '.72rem', sm: '.82rem' }, lineHeight: 1.3,
      overflowWrap: 'anywhere', '&:hover': { bgcolor: palette.hover }, '&.Mui-focusVisible': { outline: `3px solid ${palette.foreground}`, outlineOffset: 2 } }}>
    <Box component="span">{name}</Box><RoutineStatusLabel presentation={presentation} />
  </Button>
}

export function RoutineStatusCard({ presentation, children }: { presentation: RoutineStatusPresentation; children: ReactNode }) {
  const palette = routineStatusPalette(presentation.status, useTheme().palette.mode)
  return <Card variant="outlined" data-routine-status={presentation.status}
    sx={{ '--routine-status-background': palette.background, '--routine-status-foreground': palette.foreground, '--routine-status-border': palette.border,
      p: 1.5, bgcolor: palette.background, color: palette.foreground, borderColor: palette.border,
      '& .MuiTypography-root': { color: 'inherit' }, '& .MuiButton-root': { color: 'inherit' },
      '& .MuiButton-root.Mui-focusVisible': { outline: '3px solid currentColor', outlineOffset: 2 } }}>
    <RoutineStatusLabel presentation={presentation} />{children}
  </Card>
}

export function RoutineStatusLegend() {
  const mode = useTheme().palette.mode
  return <Box component="section" aria-label="Routine status legend" sx={{ mt: 2, p: 2, bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 3 }}>
    <Typography component="h2" variant="subtitle2" sx={{ mb: 1 }}>Routine status legend</Typography>
    <Stack component="ul" direction="row" useFlexGap flexWrap="wrap" spacing={2} sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {routineStatusOrder.map((status) => {
        const palette = routineStatusPalette(status, mode)
        return <Stack component="li" direction="row" spacing={1} alignItems="center" key={status}>
          <Box aria-hidden="true" sx={{ width: 20, height: 20, flexShrink: 0, bgcolor: palette.background, border: `2px solid ${palette.border}`, borderRadius: 1 }} />
          <Typography variant="body2">{routineStatusLabels[status]}</Typography>
        </Stack>
      })}
    </Stack>
  </Box>
}
