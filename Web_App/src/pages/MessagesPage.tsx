import { useMemo, useState } from 'react'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
import SearchIcon from '@mui/icons-material/Search'
import SendIcon from '@mui/icons-material/Send'
import StarBorderIcon from '@mui/icons-material/StarBorder'
import StarIcon from '@mui/icons-material/Star'
import { Box, Button, IconButton, InputAdornment, OutlinedInput, Stack, Typography } from '@mui/material'

type Message = { id: number; text: string; from: 'patient' | 'provider'; time: string }
type Conversation = { id: string; name: string; initials: string; preview: string; time: string; unread: number; starred?: boolean; messages: Message[] }

const initialConversations: Conversation[] = [
  { id: 'john', name: 'John Patientman', initials: 'JP', preview: 'I had a question about my routine…', time: '10:42 AM', unread: 2, starred: true, messages: [
    { id: 1, text: 'Hi, I finished the first week of my routine. My knee feels much better.', from: 'patient', time: '10:31 AM' },
    { id: 2, text: 'That is great progress, John! Keep the movements slow and controlled.', from: 'provider', time: '10:35 AM' },
    { id: 3, text: 'I had a question about my routine. Should I do the leg stretches on rest days too?', from: 'patient', time: '10:42 AM' },
  ] },
  { id: 'katherine', name: 'Katherine Varela', initials: 'KV', preview: 'Thank you for checking in!', time: 'Yesterday', unread: 0, messages: [
    { id: 1, text: 'How is your shoulder feeling after the new exercises?', from: 'provider', time: 'Yesterday, 3:14 PM' },
    { id: 2, text: 'Much better. Thank you for checking in!', from: 'patient', time: 'Yesterday, 3:28 PM' },
  ] },
  { id: 'neal', name: 'Neal Terrell', initials: 'NT', preview: 'I uploaded my progress photos.', time: 'Mon', unread: 1, messages: [{ id: 1, text: 'I uploaded my progress photos.', from: 'patient', time: 'Monday, 9:06 AM' }] },
  { id: 'frank', name: 'Frank Murgolo', initials: 'FM', preview: 'Can we reschedule my appointment?', time: 'Sun', unread: 0, messages: [{ id: 1, text: 'Can we reschedule my appointment?', from: 'patient', time: 'Sunday, 11:20 AM' }] },
]

const fontSx = { fontFamily: 'Georgia, serif', fontStyle: 'italic' }
const teal = '#4b9da9'
const aqua = '#91c8c0'
const orange = '#eb681d'

function ConversationRow({ conversation, selected, onClick }: { conversation: Conversation; selected: boolean; onClick: () => void }) {
  return <Button onClick={onClick} fullWidth sx={{ ...fontSx, color: 'black', textAlign: 'left', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 1.25, p: 1.25, borderRadius: '20px', bgcolor: selected ? aqua : 'transparent', border: selected ? '3px solid black' : '3px solid transparent', '&:hover': { bgcolor: selected ? aqua : '#eaf3f1' } }}>
    <Box sx={{ width: 48, height: 48, flexShrink: 0, bgcolor: teal, color: 'white', border: '3px solid black', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: 700 }}>{conversation.initials}</Box>
    <Box minWidth={0} flexGrow={1}><Stack direction="row" justifyContent="space-between" gap={1}><Typography sx={{ ...fontSx, fontWeight: 700, fontSize: '1.05rem' }} noWrap>{conversation.name}</Typography><Typography sx={{ ...fontSx, fontSize: '.78rem', whiteSpace: 'nowrap' }}>{conversation.time}</Typography></Stack><Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}><Typography sx={{ ...fontSx, fontSize: '.9rem', color: '#4b4b4b' }} noWrap>{conversation.preview}</Typography>{conversation.unread > 0 && <Box sx={{ flexShrink: 0, bgcolor: '#ef1640', color: 'white', borderRadius: '50%', minWidth: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Georgia, serif', fontStyle: 'normal', fontWeight: 700, fontSize: '.8rem' }}>{conversation.unread}</Box>}</Stack></Box>
  </Button>
}

export function MessagesPage() {
  const [conversations, setConversations] = useState(initialConversations)
  const [selectedId, setSelectedId] = useState(initialConversations[0].id)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [draft, setDraft] = useState('')
  const [showConversation, setShowConversation] = useState(false)
  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? conversations[0]
  const visibleConversations = useMemo(() => conversations.filter((conversation) => conversation.name.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || conversation.unread > 0)), [conversations, filter, query])

  function selectConversation(id: string) {
    setSelectedId(id); setShowConversation(true)
    setConversations((current) => current.map((conversation) => conversation.id === id ? { ...conversation, unread: 0 } : conversation))
  }

  function sendMessage() {
    const text = draft.trim(); if (!text) return
    setConversations((current) => current.map((conversation) => conversation.id === selected.id ? { ...conversation, preview: text, time: 'Now', messages: [...conversation.messages, { id: Date.now(), text, from: 'provider', time: 'Just now' }] } : conversation))
    setDraft('')
  }

  return <Box sx={{ ...fontSx }}>
    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2} gap={1}><Box><Typography sx={{ ...fontSx, fontSize: { xs: '2rem', sm: '2.8rem' }, fontWeight: 700 }}>Messages</Typography><Typography sx={{ ...fontSx, fontSize: { xs: '.95rem', sm: '1.1rem' } }}>Stay connected with your patients</Typography></Box><Button sx={{ ...fontSx, bgcolor: orange, color: 'white', border: '3px solid black', borderRadius: '20px', px: { xs: 1.5, sm: 2.5 }, '&:hover': { bgcolor: '#d15a17' } }}>New message</Button></Stack>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(275px, 34%) 1fr' }, minHeight: { md: 590 }, border: '4px solid black', borderRadius: '28px', overflow: 'hidden', bgcolor: 'white' }}>
      <Box sx={{ display: showConversation ? { xs: 'none', md: 'block' } : 'block', borderRight: { md: '4px solid black' }, p: { xs: 1.5, sm: 2 }, bgcolor: '#f8f8f8' }}><OutlinedInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search messages" aria-label="Search messages" startAdornment={<InputAdornment position="start"><SearchIcon sx={{ color: 'black' }} /></InputAdornment>} sx={{ ...fontSx, bgcolor: 'white', border: '3px solid black', borderRadius: '24px', '& fieldset': { border: 0 } }} /><Stack direction="row" spacing={1} my={2}><Button onClick={() => setFilter('all')} sx={{ ...fontSx, color: 'black', bgcolor: filter === 'all' ? aqua : 'white', border: '2px solid black', borderRadius: '18px', px: 2 }}>All</Button><Button onClick={() => setFilter('unread')} sx={{ ...fontSx, color: 'black', bgcolor: filter === 'unread' ? aqua : 'white', border: '2px solid black', borderRadius: '18px', px: 2 }}>Unread</Button></Stack><Stack spacing={.5}>{visibleConversations.map((conversation) => <ConversationRow key={conversation.id} conversation={conversation} selected={conversation.id === selectedId} onClick={() => selectConversation(conversation.id)} />)}{visibleConversations.length === 0 && <Typography sx={{ ...fontSx, p: 2, textAlign: 'center' }}>No messages found</Typography>}</Stack></Box>
      <Box sx={{ display: showConversation ? 'flex' : { xs: 'none', md: 'flex' }, flexDirection: 'column', minWidth: 0 }}><Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ p: 2, borderBottom: '3px solid black', bgcolor: teal, color: 'white' }}><Stack direction="row" alignItems="center" gap={1}><IconButton onClick={() => setShowConversation(false)} aria-label="Back to messages" sx={{ display: { xs: 'flex', md: 'none' }, color: 'white' }}><ArrowBackIcon /></IconButton><Box sx={{ width: 48, height: 48, bgcolor: aqua, color: 'black', border: '3px solid black', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{selected.initials}</Box><Box><Typography sx={{ ...fontSx, fontWeight: 700, fontSize: '1.25rem' }}>{selected.name}</Typography><Typography sx={{ ...fontSx, fontSize: '.85rem' }}>Patient</Typography></Box></Stack><Stack direction="row"><IconButton aria-label="Star conversation" sx={{ color: 'white' }}>{selected.starred ? <StarIcon /> : <StarBorderIcon />}</IconButton><IconButton aria-label="More conversation actions" sx={{ color: 'white' }}><MoreHorizIcon /></IconButton></Stack></Stack><Box sx={{ flexGrow: 1, p: { xs: 1.5, sm: 3 }, bgcolor: '#e8ddba', overflowY: 'auto' }}><Stack spacing={2}>{selected.messages.map((message) => <Box key={message.id} sx={{ alignSelf: message.from === 'provider' ? 'flex-end' : 'flex-start', maxWidth: { xs: '90%', sm: '72%' } }}><Box sx={{ bgcolor: message.from === 'provider' ? aqua : 'white', border: '3px solid black', borderRadius: message.from === 'provider' ? '20px 20px 4px 20px' : '20px 20px 20px 4px', px: 2, py: 1.25 }}><Typography sx={{ ...fontSx, fontStyle: 'normal', fontSize: '1rem' }}>{message.text}</Typography></Box><Typography sx={{ ...fontSx, fontSize: '.75rem', mt: .5, textAlign: message.from === 'provider' ? 'right' : 'left' }}>{message.time}{message.from === 'provider' && '  ·  You'}</Typography></Box>)}</Stack></Box><Box sx={{ p: 1.5, borderTop: '3px solid black', bgcolor: 'white' }}><Stack direction="row" spacing={1} alignItems="center"><IconButton aria-label="Attach file" sx={{ color: 'black' }}><AttachFileIcon /></IconButton><OutlinedInput value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage() } }} placeholder="Write a message…" aria-label="Write a message" sx={{ ...fontSx, flexGrow: 1, border: '3px solid black', borderRadius: '24px', '& fieldset': { border: 0 } }} /><IconButton onClick={sendMessage} aria-label="Send message" sx={{ bgcolor: teal, color: 'white', border: '3px solid black', '&:hover': { bgcolor: '#3e8792' } }}><SendIcon /></IconButton></Stack></Box></Box>
    </Box><Stack direction="row" spacing={1} alignItems="center" mt={2} sx={{ color: '#333' }}><CheckCircleOutlineIcon fontSize="small" /><Typography sx={{ ...fontSx, fontSize: '.9rem' }}>Messages are private and secure</Typography></Stack>
  </Box>
}
