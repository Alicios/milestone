import { useMemo, useState } from 'react'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
import SearchIcon from '@mui/icons-material/Search'
import SendIcon from '@mui/icons-material/Send'
import StarBorderIcon from '@mui/icons-material/StarBorder'
import StarIcon from '@mui/icons-material/Star'
import { Box, Button, FormControl, IconButton, InputAdornment, InputLabel, MenuItem, OutlinedInput, Select, Stack, Typography } from '@mui/material'

type MessageAttachment = { src: string; alt: string; label: string }
type Message = { id: number; text: string; from: 'patient' | 'provider'; time: string; attachments?: MessageAttachment[] }
type Conversation = { id: string; name: string; initials: string; preview: string; time: string; unread: number; starred?: boolean; messages: Message[] }

const initialConversations: Conversation[] = [
  { id: 'john', name: 'John Patientman', initials: 'JP', preview: 'I had a question about my routine…', time: '10:42 AM', unread: 2, starred: true, messages: [
    { id: 1, text: 'Hi, I finished the first week of my routine. My knee feels much better.', from: 'patient', time: '10:31 AM' },
    { id: 2, text: 'That is great progress, John! Keep the movements slow and controlled.', from: 'provider', time: '10:35 AM' },
    { id: 3, text: 'I had a question about my routine. Should I do the leg stretches on rest days too?', from: 'patient', time: '10:42 AM' },
    { id: 4, text: 'Yes, gentle stretching is perfect on rest days. Stop if you feel sharp pain, and send me a photo if you want feedback on your setup.', from: 'provider', time: '10:45 AM', attachments: [{ src: '/home/progress-review.png', alt: 'Physical therapist reviewing a patient exercise plan', label: 'A quick form check from today’s session' }] },
    { id: 5, text: 'I tried the stretch next to the couch like you showed me. It feels much steadier this way.', from: 'patient', time: '10:51 AM', attachments: [{ src: '/telehealth-physical-therapy-1.webp', alt: 'Patient practicing a guided exercise at home', label: 'My home setup for the stretch' }] },
    { id: 6, text: 'That setup looks good. Keep your shoulders relaxed and hold for 20 seconds, three times. I’ll update your routine with that cue.', from: 'provider', time: '10:56 AM' },
  ] },
  { id: 'katherine', name: 'Katherine Varela', initials: 'KV', preview: 'Thank you for checking in!', time: 'Yesterday', unread: 0, messages: [
    { id: 1, text: 'How is your shoulder feeling after the new exercises?', from: 'provider', time: 'Yesterday, 3:14 PM' },
    { id: 2, text: 'Much better. Thank you for checking in!', from: 'patient', time: 'Yesterday, 3:28 PM' },
    { id: 3, text: 'Wonderful. Try to keep the movement comfortable and let me know if the soreness lasts longer than a day.', from: 'provider', time: 'Yesterday, 3:32 PM', attachments: [{ src: '/physical-therapy.webp', alt: 'Therapist guiding a shoulder mobility exercise', label: 'Reference for the shoulder movement' }] },
    { id: 4, text: 'I’ll keep that in mind. I’m going to practice it after work and send you an update tomorrow.', from: 'patient', time: 'Yesterday, 3:41 PM' },
  ] },
  { id: 'neal', name: 'Neal Terrell', initials: 'NT', preview: 'I uploaded my progress photos.', time: 'Mon', unread: 1, messages: [{ id: 1, text: 'I uploaded my progress photos.', from: 'patient', time: 'Monday, 9:06 AM' }] },
  { id: 'frank', name: 'Frank Murgolo', initials: 'FM', preview: 'Can we reschedule my appointment?', time: 'Sun', unread: 0, messages: [{ id: 1, text: 'Can we reschedule my appointment?', from: 'patient', time: 'Sunday, 11:20 AM' }] },
]

const teal = '#4b9da9'
const aqua = '#91c8c0'
const orange = '#eb681d'
const border = '#d8e2e5'

function ConversationRow({ conversation, selected, onClick }: { conversation: Conversation; selected: boolean; onClick: () => void }) {
  return <Button onClick={onClick} fullWidth sx={{ color: '#18323d', textAlign: 'left', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 1.25, p: 1.25, borderRadius: 1.5, bgcolor: selected ? '#edf7f5' : 'transparent', borderLeft: selected ? `3px solid ${teal}` : '3px solid transparent', '&:hover': { bgcolor: selected ? '#edf7f5' : '#f5f8f8' }, transition: 'background-color 160ms ease, border-color 160ms ease' }}>
    <Box sx={{ width: 42, height: 42, flexShrink: 0, bgcolor: selected ? teal : '#e7eff0', color: selected ? 'white' : '#18323d', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.85rem', fontWeight: 700 }}>{conversation.initials}</Box>
    <Box minWidth={0} flexGrow={1}><Stack direction="row" justifyContent="space-between" gap={1}><Typography fontWeight={conversation.unread ? 700 : 600} fontSize=".92rem" noWrap>{conversation.name}</Typography><Typography color="text.secondary" fontSize=".72rem" whiteSpace="nowrap">{conversation.time}</Typography></Stack><Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}><Typography color="text.secondary" fontSize=".8rem" noWrap>{conversation.preview}</Typography>{conversation.unread > 0 && <Box sx={{ flexShrink: 0, bgcolor: orange, color: 'white', borderRadius: '50%', minWidth: 21, height: 21, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '.7rem' }}>{conversation.unread}</Box>}</Stack></Box>
  </Button>
}

export function MessagesPage() {
  const [conversations, setConversations] = useState(initialConversations)
  const [selectedId, setSelectedId] = useState(initialConversations[0].id)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [draft, setDraft] = useState('')
  const [showConversation, setShowConversation] = useState(false)
  const [isComposing, setIsComposing] = useState(false)
  const [composeRecipientId, setComposeRecipientId] = useState(initialConversations[0].id)
  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? conversations[0]
  const composeRecipient = conversations.find((conversation) => conversation.id === composeRecipientId) ?? conversations[0]
  const visibleConversations = useMemo(() => conversations.filter((conversation) => conversation.name.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || conversation.unread > 0)), [conversations, filter, query])

  function selectConversation(id: string) {
    setSelectedId(id)
    setIsComposing(false)
    setShowConversation(true)
    setConversations((current) => current.map((conversation) => conversation.id === id ? { ...conversation, unread: 0 } : conversation))
  }

  function startCompose() {
    setComposeRecipientId(selected.id)
    setDraft('')
    setIsComposing(true)
    setShowConversation(true)
  }

  function toggleStar() {
    setConversations((current) => current.map((conversation) => conversation.id === selected.id ? { ...conversation, starred: !conversation.starred } : conversation))
  }

  function sendMessage() {
    const text = draft.trim()
    const recipientId = isComposing ? composeRecipientId : selected.id
    if (!text || !recipientId) return
    setConversations((current) => current.map((conversation) => conversation.id === recipientId ? { ...conversation, preview: text, time: 'Now', messages: [...conversation.messages, { id: Date.now(), text, from: 'provider', time: 'Just now' }] } : conversation))
    setSelectedId(recipientId)
    setDraft('')
    setIsComposing(false)
  }

  const listVisible = { xs: showConversation ? 'none' : 'flex', md: 'flex' } as const
  const conversationVisible = { xs: showConversation ? 'flex' : 'none', md: 'flex' } as const

  return <Box className="messages-page" sx={{ width: '100%', height: { xs: 'calc(100dvh - 88px)', sm: 'calc(100dvh - 96px)' }, minHeight: 520, bgcolor: 'white', border: `1px solid ${border}`, overflow: 'hidden', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '320px minmax(0, 1fr)' }, gridTemplateRows: 'minmax(0, 1fr)' }}>
    <Box component="aside" aria-label="Message conversations" sx={{ display: listVisible, minWidth: 0, minHeight: 0, flexDirection: 'column', borderRight: { md: `1px solid ${border}` }, bgcolor: '#fbfcfc', overflow: 'hidden' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ p: 1.5, borderBottom: `1px solid ${border}` }}>
        <Typography fontWeight={700} color="#18323d">Inbox</Typography>
        <Button onClick={startCompose} variant="contained" size="small" sx={{ bgcolor: orange, color: 'white', borderRadius: 1.5, px: 1.5, '&:hover': { bgcolor: '#d15a17' } }}>Compose</Button>
      </Stack>
      <Box sx={{ p: 1.25, borderBottom: `1px solid ${border}` }}><OutlinedInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search mail" aria-label="Search messages" fullWidth size="small" startAdornment={<InputAdornment position="start"><SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} /></InputAdornment>} sx={{ bgcolor: 'white', borderRadius: 1.5, '& fieldset': { borderColor: border } }} /></Box>
      <Stack direction="row" spacing={.5} sx={{ px: 1.25, py: 1, borderBottom: `1px solid ${border}` }}>
        <Button onClick={() => setFilter('all')} size="small" sx={{ minWidth: 0, px: 1.25, borderRadius: 1, color: filter === 'all' ? '#18323d' : 'text.secondary', bgcolor: filter === 'all' ? '#e8f3f1' : 'transparent' }}>All mail</Button>
        <Button onClick={() => setFilter('unread')} size="small" sx={{ minWidth: 0, px: 1.25, borderRadius: 1, color: filter === 'unread' ? '#18323d' : 'text.secondary', bgcolor: filter === 'unread' ? '#e8f3f1' : 'transparent' }}>Unread</Button>
      </Stack>
      <Stack spacing={.25} sx={{ p: .75, overflowY: 'auto', flexGrow: 1 }}>{visibleConversations.map((conversation) => <ConversationRow key={conversation.id} conversation={conversation} selected={conversation.id === selectedId && !isComposing} onClick={() => selectConversation(conversation.id)} />)}{visibleConversations.length === 0 && <Typography color="text.secondary" fontSize=".9rem" textAlign="center" sx={{ p: 3 }}>No messages found</Typography>}</Stack>
    </Box>

    <Box component="section" aria-label={isComposing ? 'Compose message' : `Conversation with ${selected.name}`} sx={{ display: conversationVisible, minWidth: 0, minHeight: 0, overflow: 'hidden', flexDirection: 'column', bgcolor: 'white' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ minHeight: 64, px: { xs: 1.5, sm: 2.5 }, borderBottom: `1px solid ${border}` }}>
        <Stack direction="row" alignItems="center" gap={1.25} minWidth={0}>
          <IconButton onClick={() => setShowConversation(false)} aria-label="Back to messages" sx={{ display: { xs: 'flex', md: 'none' } }}><ArrowBackIcon /></IconButton>
          {isComposing ? <Typography fontWeight={700} fontSize="1.1rem">New message</Typography> : <><Box sx={{ width: 40, height: 40, flexShrink: 0, bgcolor: aqua, color: '#18323d', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{selected.initials}</Box><Box minWidth={0}><Typography fontWeight={700} noWrap>{selected.name}</Typography><Typography color="text.secondary" fontSize=".75rem">Patient conversation</Typography></Box></>}
        </Stack>
        {!isComposing && <Stack direction="row"><IconButton onClick={toggleStar} aria-label={selected.starred ? 'Unstar conversation' : 'Star conversation'} color={selected.starred ? 'warning' : 'default'}>{selected.starred ? <StarIcon /> : <StarBorderIcon />}</IconButton><IconButton aria-label="More conversation actions"><MoreHorizIcon /></IconButton></Stack>}
      </Stack>

      {isComposing && <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} gap={1.5} sx={{ px: { xs: 1.5, sm: 2.5 }, py: 1.5, borderBottom: `1px solid ${border}` }}>
        <FormControl size="small" sx={{ minWidth: { sm: 260 } }}><InputLabel id="compose-recipient-label">To</InputLabel><Select labelId="compose-recipient-label" value={composeRecipientId} label="To" onChange={(event) => setComposeRecipientId(event.target.value)}>{conversations.map((conversation) => <MenuItem key={conversation.id} value={conversation.id}>{conversation.name}</MenuItem>)}</Select></FormControl>
        <Typography color="text.secondary" fontSize=".85rem">Patient message</Typography>
      </Stack>}

      {!isComposing && <Box sx={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', p: { xs: 1.5, sm: 3 }, bgcolor: '#f7faf9' }}><Stack spacing={2}>{selected.messages.map((message) => <Box key={message.id} sx={{ alignSelf: message.from === 'provider' ? 'flex-end' : 'flex-start', maxWidth: { xs: '92%', sm: '72%' } }}><Typography color="text.secondary" fontSize=".72rem" sx={{ mb: .5, textAlign: message.from === 'provider' ? 'right' : 'left' }}>{message.from === 'provider' ? 'You' : selected.name} · {message.time}</Typography><Box sx={{ bgcolor: message.from === 'provider' ? '#e3f2ef' : 'white', border: `1px solid ${border}`, borderRadius: 2, px: 2, py: 1.25, boxShadow: '0 1px 2px rgba(24, 50, 61, .04)' }}><Typography fontSize=".95rem" lineHeight={1.55}>{message.text}</Typography>{message.attachments?.map((attachment) => <Box key={attachment.src} sx={{ mt: 1.25, overflow: 'hidden', borderRadius: 1.5, bgcolor: 'rgba(255, 255, 255, .72)', border: `1px solid ${border}` }}><Box component="img" src={attachment.src} alt={attachment.alt} sx={{ display: 'block', width: '100%', maxHeight: 220, objectFit: 'cover' }} /><Typography color="text.secondary" fontSize=".75rem" sx={{ px: 1, py: .75 }}>{attachment.label}</Typography></Box>)}</Box></Box>)}</Stack></Box>}
      {isComposing && <Box sx={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', bgcolor: '#f7faf9', p: { xs: 1.5, sm: 3 } }}><Typography color="text.secondary" fontSize=".9rem">Write a new message to {composeRecipient.name}.</Typography></Box>}

      <Box component="form" onSubmit={(event) => { event.preventDefault(); sendMessage() }} sx={{ flexShrink: 0, p: { xs: 1, sm: 1.5 }, borderTop: `1px solid ${border}`, bgcolor: 'white' }}><Stack direction="row" spacing={1} alignItems="center"><IconButton type="button" aria-label="Attach file"><AttachFileIcon fontSize="small" /></IconButton><OutlinedInput value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={isComposing ? 'Write a new message…' : 'Reply to this conversation…'} aria-label={isComposing ? 'Write a new message' : 'Write a reply'} fullWidth size="small" sx={{ bgcolor: '#f7faf9', borderRadius: 1.5, '& fieldset': { borderColor: border } }} /><IconButton type="submit" aria-label="Send message" sx={{ bgcolor: teal, color: 'white', borderRadius: 1.5, '&:hover': { bgcolor: '#3e8792' } }}><SendIcon fontSize="small" /></IconButton></Stack></Box>
    </Box>
  </Box>
}
