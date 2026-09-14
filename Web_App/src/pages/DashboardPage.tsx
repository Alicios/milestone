import { useMemo, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import RemoveIcon from '@mui/icons-material/Remove'
import SearchIcon from '@mui/icons-material/Search'
import SwapVertIcon from '@mui/icons-material/SwapVert'
import { Box, Button, Card, Divider, InputAdornment, OutlinedInput, Stack, Tooltip, Typography } from '@mui/material'

interface Patient {
  id: string
  name: string
  statuses: Array<'missed' | 'complete' | 'modified' | 'none' | 'routine'>
}

const patients: Patient[] = [
  { id: 'john', name: 'John Patientman', statuses: ['missed', 'complete', 'modified', 'none', 'routine', 'none', 'routine'] },
  { id: 'katherine', name: 'Katherine Varela', statuses: ['complete', 'complete', 'routine', 'complete', 'none', 'none', 'routine'] },
  { id: 'neal', name: 'Neal Terrell', statuses: ['routine', 'complete', 'complete', 'none', 'routine', 'none', 'none'] },
  { id: 'frank', name: 'Frank Murgolo', statuses: ['none', 'routine', 'complete', 'complete', 'none', 'none', 'routine'] },
]

const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

function StatusIcon({ status }: { status: Patient['statuses'][number] }) {
  if (status === 'missed') return <CloseIcon />
  if (status === 'complete') return <CheckIcon />
  if (status === 'modified') return <SwapVertIcon />
  if (status === 'routine') return <Typography component="span" sx={{ fontSize: '1.5rem', lineHeight: 1 }}>✣</Typography>
  return <RemoveIcon />
}

function PatientRow({ patient, expanded, onToggle }: { patient: Patient; expanded: boolean; onToggle: () => void }) {
  return <Card sx={{ bgcolor: 'transparent', boxShadow: 'none', border: 0, overflow: 'visible', mb: 1.5 }}>
    <Button fullWidth onClick={onToggle} aria-expanded={expanded} sx={{ minHeight: 64, justifyContent: 'center', position: 'relative', bgcolor: '#91c8c0', color: 'black', border: '4px solid black', borderRadius: '40px', fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: { xs: '1.2rem', sm: '1.65rem' }, '&:hover': { bgcolor: '#82bdb5' } }}>
      {patient.name}<ExpandMoreIcon sx={{ position: 'absolute', right: 12, bgcolor: 'black', color: '#91c8c0', borderRadius: '50%', transform: expanded ? 'rotate(180deg)' : 'none' }} />
    </Button>
    {expanded && <Box sx={{ bgcolor: '#4b9da9', border: '4px solid black', borderTop: 0, borderRadius: '0 0 28px 28px', mt: -2, pt: 3, px: { xs: .5, sm: 1 }, pb: 1 }}><Stack direction="row" spacing={{ xs: .25, sm: .75 }} justifyContent="center">{days.map((day, index) => <Box key={day} sx={{ flex: 1, minWidth: 0, textAlign: 'center' }}><Typography sx={{ bgcolor: index === 2 ? '#eb681d' : '#777777', color: 'white', border: '3px solid black', borderRadius: '28px', py: { xs: 1, sm: 1.5 }, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 700, fontSize: { xs: '.65rem', sm: '1.15rem' } }}>{day}</Typography><Box sx={{ mt: .5, bgcolor: 'white', border: '3px solid black', borderRadius: '24px', height: { xs: 76, sm: 112 }, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Tooltip title={patient.statuses[index]}><Box sx={{ width: { xs: 42, sm: 66 }, height: { xs: 42, sm: 66 }, borderRadius: '50%', border: '3px solid black', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: patient.statuses[index] === 'missed' ? '#ff333c' : patient.statuses[index] === 'complete' ? '#8bd153' : patient.statuses[index] === 'modified' ? '#ffdc55' : '#777777', color: 'white' }}><StatusIcon status={patient.statuses[index]} /></Box></Tooltip></Box></Box>)}</Stack></Box>}
  </Card>
}

export function DashboardPage() {
  const [expanded, setExpanded] = useState<string[]>(['john'])
  const [query, setQuery] = useState('')
  const visiblePatients = useMemo(() => patients.filter((patient) => patient.name.toLowerCase().includes(query.toLowerCase())), [query])
  const allExpanded = visiblePatients.length > 0 && visiblePatients.every((patient) => expanded.includes(patient.id))
  const togglePatient = (id: string) => setExpanded((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const toggleAll = () => setExpanded(allExpanded ? [] : visiblePatients.map((patient) => patient.id))

  return <Stack direction={{ xs: 'column', lg: 'row' }} spacing={{ xs: 2, lg: 5 }} alignItems="stretch"><Box flexGrow={1} minWidth={0}><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} mb={3}><Button onClick={toggleAll} sx={{ bgcolor: 'white', color: 'black', border: '4px solid black', borderRadius: '34px', px: 3, py: 1.25, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '1.2rem', '&:hover': { bgcolor: '#f5f5f5' } }}>{allExpanded ? 'Collapse All' : 'Expand All'}</Button><OutlinedInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search..." aria-label="Search patients" startAdornment={<InputAdornment position="start"><SearchIcon sx={{ bgcolor: '#4b9da9', border: '3px solid black', borderRadius: '50%', p: .5, boxSizing: 'content-box', fontSize: 42 }} /></InputAdornment>} sx={{ flexGrow: 1, bgcolor: 'white', border: '4px solid black', borderRadius: '34px', fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '1.3rem', '& fieldset': { border: 0 } }} /></Stack>{visiblePatients.length ? visiblePatients.map((patient) => <PatientRow key={patient.id} patient={patient} expanded={expanded.includes(patient.id)} onToggle={() => togglePatient(patient.id)} />) : <Card sx={{ p: 5, textAlign: 'center', border: '4px solid black', bgcolor: 'white' }}><Typography variant="h6" fontFamily="Georgia, serif">No patients found</Typography></Card>}</Box><Box sx={{ width: { xs: '100%', lg: 250 }, display: 'flex', flexDirection: { xs: 'row', lg: 'column' }, justifyContent: 'center', gap: { xs: 2, lg: 6 }, alignItems: 'center' }}><Button sx={{ color: 'black', display: 'flex', flexDirection: 'column', fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '1.65rem', '&:hover': { bgcolor: 'transparent' } }}><Box sx={{ width: { xs: 110, sm: 170 }, height: { xs: 110, sm: 170 }, borderRadius: '50%', bgcolor: '#4b9da9', border: '4px solid black', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><AddIcon sx={{ color: 'white', fontSize: { xs: 70, sm: 120 } }} /></Box><Box component="span" mt={1}>New Patient</Box></Button><Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', lg: 'block' }, borderColor: 'black', borderWidth: 2 }} /><Button sx={{ color: 'black', display: 'flex', flexDirection: 'column', fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: '1.65rem', '&:hover': { bgcolor: 'transparent' } }}><Box sx={{ position: 'relative', width: { xs: 110, sm: 170 }, height: { xs: 110, sm: 170 }, borderRadius: '50%', bgcolor: '#4b9da9', border: '4px solid black', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChatBubbleOutlineIcon sx={{ color: 'white', fontSize: { xs: 65, sm: 95 } }} /><Box sx={{ position: 'absolute', top: -2, right: -2, width: 46, height: 46, bgcolor: '#ef1640', borderRadius: '50%', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia, serif', fontStyle: 'normal', fontWeight: 700 }}>3</Box></Box><Box component="span" mt={1}>Messages</Box></Button></Box></Stack>
}
