import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import SearchIcon from '@mui/icons-material/Search'
import SendIcon from '@mui/icons-material/Send'
import StarBorderIcon from '@mui/icons-material/StarBorder'
import StarIcon from '@mui/icons-material/Star'
import { Alert, Box, Button, FormControl, IconButton, InputAdornment, InputLabel, MenuItem, OutlinedInput, Select, Stack, Typography, useMediaQuery, useTheme } from '@mui/material'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { loadMessageConversations, markMessageThreadRead, sendProviderMessage, setMessageThreadStarred, type Conversation } from '../lib/messages'

function formatMessageTime(value: string | null, detailed = false) {
  if (!value) return ''
  const date = new Date(value)
  if (detailed) return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
  const today = new Date()
  return date.toDateString() === today.toDateString()
    ? new Intl.DateTimeFormat('en-US', { timeStyle: 'short' }).format(date)
    : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)
}

const teal = '#4b9da9'
const aqua = '#91c8c0'
const orange = '#eb681d'
function ConversationRow({ conversation, selected, onClick }: { conversation: Conversation; selected: boolean; onClick: () => void }) {
  const theme = useTheme()
  const border = theme.palette.divider
  const selectedBackground = theme.palette.mode === 'dark' ? '#214b52' : '#edf7f5'
  const hoverBackground = theme.palette.mode === 'dark' ? '#1c4148' : '#f5f8f8'
  return <Button onClick={onClick} fullWidth sx={{ color: 'text.primary', textAlign: 'left', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 1.25, p: 1.25, borderRadius: 1.5, bgcolor: selected ? selectedBackground : 'transparent', borderLeft: selected ? `3px solid ${teal}` : '3px solid transparent', '&:hover': { bgcolor: selected ? selectedBackground : hoverBackground }, transition: 'background-color 160ms ease, border-color 160ms ease' }}>
    <Box sx={{ width: 42, height: 42, flexShrink: 0, bgcolor: selected ? teal : 'action.hover', color: selected ? 'white' : 'text.primary', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.85rem', fontWeight: 700 }}>{conversation.initials}</Box>
    <Box minWidth={0} flexGrow={1}><Stack direction="row" justifyContent="space-between" gap={1}><Typography fontWeight={conversation.unread ? 700 : 600} fontSize=".92rem" noWrap>{conversation.name}</Typography><Typography color="text.secondary" fontSize=".72rem" whiteSpace="nowrap">{formatMessageTime(conversation.lastMessageAt)}</Typography></Stack><Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}><Typography color="text.secondary" fontSize=".8rem" noWrap>{conversation.preview}</Typography>{conversation.unread > 0 && <Box sx={{ flexShrink: 0, bgcolor: orange, color: 'white', borderRadius: '50%', minWidth: 21, height: 21, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '.7rem' }}>{conversation.unread}</Box>}</Stack></Box>
  </Button>
}

export function MessagesPage() {
  const { user } = useAuth()
  const theme = useTheme()
  const desktop = useMediaQuery(theme.breakpoints.up('md'))
  const border = theme.palette.divider
  const listBackground = theme.palette.mode === 'dark' ? '#15343d' : '#fbfcfc'
  const threadBackground = theme.palette.mode === 'dark' ? '#122f38' : '#f7faf9'
  const providerBubble = theme.palette.mode === 'dark' ? '#24564f' : '#e3f2ef'
  const patientBubble = theme.palette.mode === 'dark' ? '#1b3c46' : 'white'
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [draft, setDraft] = useState('')
  const [showConversation, setShowConversation] = useState(false)
  const [isComposing, setIsComposing] = useState(false)
  const [composeRecipientId, setComposeRecipientId] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const requestId = useRef(0)
  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? conversations[0]
  const composeRecipient = conversations.find((conversation) => conversation.id === composeRecipientId) ?? conversations[0]
  const visibleConversations = useMemo(() => conversations.filter((conversation) => conversation.name.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || conversation.unread > 0)), [conversations, filter, query])

  const refresh = useCallback(async () => {
    if (!user) return
    const currentRequest = ++requestId.current
    try {
      const rows = await loadMessageConversations(user.id)
      if (currentRequest !== requestId.current) return
      setConversations(rows)
      setSelectedId((current) => rows.some((row) => row.id === current) ? current : rows[0]?.id ?? '')
      setComposeRecipientId((current) => rows.some((row) => row.id === current) ? current : rows[0]?.id ?? '')
      setError('')
    } catch (loadError) {
      if (currentRequest === requestId.current) setError((loadError as Error).message || 'Messages could not be loaded.')
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    void refresh()
    const channel = supabase.channel(`provider-messages-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => { void refresh() })
      .subscribe()
    const onFocus = () => { void refresh() }
    window.addEventListener('focus', onFocus)
    return () => {
      requestId.current += 1
      window.removeEventListener('focus', onFocus)
      void supabase.removeChannel(channel)
    }
  }, [refresh, user])

  useEffect(() => {
    if (!selected || selected.unread === 0 || isComposing || (!desktop && !showConversation)) return
    const latest = selected.messages.at(-1)
    if (!latest) return
    void markMessageThreadRead(selected.id, latest.createdAt)
      .then(refresh)
      .catch((readError: Error) => setError(readError.message))
  }, [desktop, isComposing, refresh, selected, showConversation])

  function selectConversation(id: string) {
    setSelectedId(id)
    setIsComposing(false)
    setShowConversation(true)
  }

  function startCompose() {
    if (!selected) return
    setComposeRecipientId(selected.id)
    setDraft('')
    setIsComposing(true)
    setShowConversation(true)
  }

  async function toggleStar() {
    if (!selected) return
    try {
      await setMessageThreadStarred(selected.id, !selected.starred)
      await refresh()
    } catch (starError) {
      setError((starError as Error).message)
    }
  }

  async function sendMessage() {
    const text = draft.trim()
    const recipientId = isComposing ? composeRecipientId : selected?.id
    if (!text || !recipientId || sending) return
    setSending(true)
    try {
      await sendProviderMessage(recipientId, text)
      setSelectedId(recipientId)
      setDraft('')
      setIsComposing(false)
      await refresh()
    } catch (sendError) {
      setError((sendError as Error).message || 'Message could not be sent.')
    } finally {
      setSending(false)
    }
  }

  if (!selected) return <Box className="messages-page" sx={{ width: '100%', height: { xs: 'calc(100dvh - 88px)', sm: 'calc(100dvh - 96px)' }, minHeight: 520, bgcolor: 'background.paper', border: `1px solid ${border}`, p: 3 }}>
    {error ? <Alert severity="error">{error}</Alert> : <Typography color="text.secondary">{loading ? 'Loading messages…' : 'No linked patients are available for messaging.'}</Typography>}
  </Box>

  const listVisible = { xs: showConversation ? 'none' : 'flex', md: 'flex' } as const
  const conversationVisible = { xs: showConversation ? 'flex' : 'none', md: 'flex' } as const

  return <Box className="messages-page" sx={{ width: '100%', height: { xs: 'calc(100dvh - 88px)', sm: 'calc(100dvh - 96px)' }, minHeight: 520, bgcolor: 'background.paper', border: `1px solid ${border}`, overflow: 'hidden', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '320px minmax(0, 1fr)' }, gridTemplateRows: 'minmax(0, 1fr)' }}>
    <Box component="aside" aria-label="Message conversations" sx={{ display: listVisible, minWidth: 0, minHeight: 0, flexDirection: 'column', borderRight: { md: `1px solid ${border}` }, bgcolor: listBackground, overflow: 'hidden' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ p: 1.5, borderBottom: `1px solid ${border}` }}>
        <Typography fontWeight={700} color="text.primary">Inbox</Typography>
        <Button onClick={startCompose} variant="contained" size="small" sx={{ bgcolor: orange, color: 'white', borderRadius: 1.5, px: 1.5, '&:hover': { bgcolor: '#d15a17' } }}>Compose</Button>
      </Stack>
      {error && <Alert severity="error" sx={{ m: 1 }}>{error}</Alert>}
      <Box sx={{ p: 1.25, borderBottom: `1px solid ${border}` }}><OutlinedInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search mail" aria-label="Search messages" fullWidth size="small" startAdornment={<InputAdornment position="start"><SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} /></InputAdornment>} sx={{ bgcolor: 'background.paper', borderRadius: 1.5, '& fieldset': { borderColor: border } }} /></Box>
      <Stack direction="row" spacing={.5} sx={{ px: 1.25, py: 1, borderBottom: `1px solid ${border}` }}>
        <Button onClick={() => setFilter('all')} size="small" sx={{ minWidth: 0, px: 1.25, borderRadius: 1, color: filter === 'all' ? 'text.primary' : 'text.secondary', bgcolor: filter === 'all' ? (theme.palette.mode === 'dark' ? '#214b52' : '#e8f3f1') : 'transparent' }}>All mail</Button>
        <Button onClick={() => setFilter('unread')} size="small" sx={{ minWidth: 0, px: 1.25, borderRadius: 1, color: filter === 'unread' ? 'text.primary' : 'text.secondary', bgcolor: filter === 'unread' ? (theme.palette.mode === 'dark' ? '#214b52' : '#e8f3f1') : 'transparent' }}>Unread</Button>
      </Stack>
      <Stack spacing={.25} sx={{ p: .75, overflowY: 'auto', flexGrow: 1 }}>{visibleConversations.map((conversation) => <ConversationRow key={conversation.id} conversation={conversation} selected={conversation.id === selectedId && !isComposing} onClick={() => selectConversation(conversation.id)} />)}{visibleConversations.length === 0 && <Typography color="text.secondary" fontSize=".9rem" textAlign="center" sx={{ p: 3 }}>No messages found</Typography>}</Stack>
    </Box>

    <Box component="section" aria-label={isComposing ? 'Compose message' : `Conversation with ${selected.name}`} sx={{ display: conversationVisible, minWidth: 0, minHeight: 0, overflow: 'hidden', flexDirection: 'column', bgcolor: 'background.paper' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ minHeight: 64, px: { xs: 1.5, sm: 2.5 }, borderBottom: `1px solid ${border}` }}>
        <Stack direction="row" alignItems="center" gap={1.25} minWidth={0}>
          <IconButton onClick={() => setShowConversation(false)} aria-label="Back to messages" sx={{ display: { xs: 'flex', md: 'none' } }}><ArrowBackIcon /></IconButton>
          {isComposing ? <Typography fontWeight={700} fontSize="1.1rem">New message</Typography> : <><Box sx={{ width: 40, height: 40, flexShrink: 0, bgcolor: aqua, color: '#18323d', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{selected.initials}</Box><Box minWidth={0}><Typography fontWeight={700} noWrap>{selected.name}</Typography><Typography color="text.secondary" fontSize=".75rem">Patient conversation</Typography></Box></>}
        </Stack>
        {!isComposing && <IconButton onClick={() => void toggleStar()} aria-label={selected.starred ? 'Unstar conversation' : 'Star conversation'} color={selected.starred ? 'warning' : 'default'}>{selected.starred ? <StarIcon /> : <StarBorderIcon />}</IconButton>}
      </Stack>

      {isComposing && <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} gap={1.5} sx={{ px: { xs: 1.5, sm: 2.5 }, py: 1.5, borderBottom: `1px solid ${border}` }}>
        <FormControl size="small" sx={{ minWidth: { sm: 260 } }}><InputLabel id="compose-recipient-label">To</InputLabel><Select labelId="compose-recipient-label" value={composeRecipient?.id ?? selected.id} label="To" onChange={(event) => setComposeRecipientId(event.target.value)}>{conversations.map((conversation) => <MenuItem key={conversation.id} value={conversation.id}>{conversation.name}</MenuItem>)}</Select></FormControl>
        <Typography color="text.secondary" fontSize=".85rem">Patient message</Typography>
      </Stack>}

      {!isComposing && <Box sx={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', p: { xs: 1.5, sm: 3 }, bgcolor: threadBackground }}><Stack spacing={2}>{selected.messages.map((message) => <Box key={message.id} sx={{ alignSelf: message.from === 'provider' ? 'flex-end' : 'flex-start', maxWidth: { xs: '92%', sm: '72%' } }}><Typography color="text.secondary" fontSize=".72rem" sx={{ mb: .5, textAlign: message.from === 'provider' ? 'right' : 'left' }}>{message.from === 'provider' ? 'You' : selected.name} · {formatMessageTime(message.createdAt, true)}</Typography><Box sx={{ bgcolor: message.from === 'provider' ? providerBubble : patientBubble, border: `1px solid ${border}`, borderRadius: 2, px: 2, py: 1.25, boxShadow: '0 1px 2px rgba(24, 50, 61, .04)' }}><Typography fontSize=".95rem" lineHeight={1.55}>{message.text}</Typography></Box></Box>)}{selected.messages.length === 0 && <Typography color="text.secondary">No messages yet. Send the first one below.</Typography>}</Stack></Box>}
      {isComposing && <Box sx={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', bgcolor: threadBackground, p: { xs: 1.5, sm: 3 } }}><Typography color="text.secondary" fontSize=".9rem">Write a new message to {composeRecipient?.name ?? selected.name}.</Typography></Box>}

      <Box component="form" onSubmit={(event) => { event.preventDefault(); void sendMessage() }} sx={{ flexShrink: 0, p: { xs: 1, sm: 1.5 }, borderTop: `1px solid ${border}`, bgcolor: 'background.paper' }}><Stack direction="row" spacing={1} alignItems="center"><OutlinedInput value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={isComposing ? 'Write a new message…' : 'Reply to this conversation…'} aria-label={isComposing ? 'Write a new message' : 'Write a reply'} fullWidth size="small" inputProps={{ maxLength: 4000 }} sx={{ bgcolor: threadBackground, borderRadius: 1.5, '& fieldset': { borderColor: border } }} /><IconButton type="submit" disabled={!draft.trim() || sending} aria-label="Send message" sx={{ bgcolor: teal, color: 'white', borderRadius: 1.5, '&:hover': { bgcolor: '#3e8792' } }}><SendIcon fontSize="small" /></IconButton></Stack></Box>
    </Box>
  </Box>
}
