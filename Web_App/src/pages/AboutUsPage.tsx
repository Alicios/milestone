import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PauseIcon from '@mui/icons-material/Pause'
import { Box, Button, Stack, Typography } from '@mui/material'
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { PublicHeader } from '../components/PublicHeader'
import { publicAsset } from '../lib/assets'

const images = [
  { description: 'LeBron James in a Los Angeles Lakers uniform.', image: 'wallpapersden.com_king-lebron-james-hd-la-lakers-ai_1920x1080.jpg', sound: 'lebroooon-james.mp3', ratio: 16 / 9 },
  { description: 'LeBron James, number 76.', image: 'lebron-76.jpg', sound: 'bang-basketball_Y4765Ub.mp3', ratio: 3 / 2 },
  { description: 'LeBron James holding a football in a Dallas Cowboys cap.', image: 'lebron-nfl.jpg', sound: 'nfl-on-fox-theme-music.mp3', ratio: 474 / 324 },
]
type Tilt = { rotateX: number; rotateY: number; hovering: boolean }
const neutral: Tilt = { rotateX: 0, rotateY: 0, hovering: false }
const clamp = (n: number, limit: number) => Math.max(-limit, Math.min(limit, n))

export function AboutUsPage() {
  const [faces, setFaces] = useState({ front: 0, back: 1, flipped: false })
  const [tilt, setTilt] = useState<Tilt>(neutral)
  const [isPlaying, setIsPlaying] = useState(false)
  const [soundError, setSoundError] = useState('')
  const [motionPermission, setMotionPermission] = useState<'unavailable' | 'available' | 'needed' | 'denied'>('unavailable')
  const audioRef = useRef<HTMLAudioElement>(null)
  const audioRequest = useRef(0)
  const regularSide = useRef(0)
  const pointerStart = useRef<{ id: number; x: number; y: number } | null>(null)
  const dragged = useRef(false)
  const sensorTilt = useRef<Tilt>(neutral)
  const motionOrigin = useRef<{ beta: number; gamma: number } | null>(null)
  const activeIndex = faces.flipped ? faces.back : faces.front
  const current = images[activeIndex]
  const glareX = Math.max(8, Math.min(92, 42 - tilt.rotateY * 1.5))
  const glareY = Math.max(8, Math.min(92, 38 + tilt.rotateX * 1.5))

  function playClip(index: number, restart = false) {
    const audio = audioRef.current
    if (!audio) return
    const request = ++audioRequest.current
    const source = publicAsset(images[index].sound)
    audio.pause()
    if (audio.getAttribute('src') !== source) audio.src = source
    else if (restart || audio.ended) audio.currentTime = 0
    setIsPlaying(false)
    setSoundError('')
    void audio.play().then(() => {
      if (audioRequest.current === request) setIsPlaying(true)
    }).catch((error: unknown) => {
      if (audioRequest.current !== request) return
      setIsPlaying(false)
      if (error instanceof DOMException && error.name === 'NotAllowedError') return
      setSoundError('The sound could not play. Please try again.')
    })
  }

  useEffect(() => {
    const audio = audioRef.current
    // Browser autoplay may be blocked until the first interaction.
    if (audio) void audio.play().then(() => setIsPlaying(true)).catch(() => {})
    const stopInBackground = () => {
      if (document.visibilityState === 'hidden') { audioRequest.current += 1; audio?.pause(); setIsPlaying(false) }
    }
    document.addEventListener('visibilitychange', stopInBackground)
    if (window.matchMedia('(pointer: coarse)').matches && typeof DeviceOrientationEvent !== 'undefined') {
      const orientation = DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> }
      setMotionPermission(orientation.requestPermission ? 'needed' : 'available')
    }
    return () => { document.removeEventListener('visibilitychange', stopInBackground); audioRequest.current += 1; audio?.pause() }
  }, [])

  useEffect(() => {
    if (motionPermission !== 'available') return
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta === null || event.gamma === null) return
      if (!motionOrigin.current) motionOrigin.current = { beta: event.beta, gamma: event.gamma }
      sensorTilt.current = { rotateX: clamp((event.beta - motionOrigin.current.beta) * -0.45, 12), rotateY: clamp((event.gamma - motionOrigin.current.gamma) * 0.45, 12), hovering: false }
      if (!pointerStart.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) setTilt(sensorTilt.current)
    }
    const reset = () => { motionOrigin.current = null; sensorTilt.current = neutral; setTilt(neutral) }
    window.addEventListener('deviceorientation', onOrientation)
    window.addEventListener('orientationchange', reset)
    return () => { window.removeEventListener('deviceorientation', onOrientation); window.removeEventListener('orientationchange', reset) }
  }, [motionPermission])

  async function enableMotion() {
    try {
      const orientation = DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> }
      setMotionPermission(await orientation.requestPermission?.() === 'granted' ? 'available' : 'denied')
    } catch { setMotionPermission('denied') }
  }

  function flipImage() {
    if (dragged.current) { dragged.current = false; return }
    regularSide.current = 1 - regularSide.current
    const next = Math.random() < 0.1 ? 2 : regularSide.current
    setFaces(previous => ({ front: previous.flipped ? next : previous.front, back: previous.flipped ? previous.back : next, flipped: !previous.flipped }))
    playClip(next, true)
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const start = pointerStart.current
    if (start?.id === event.pointerId) {
      const dx = event.clientX - start.x, dy = event.clientY - start.y
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragged.current = true
      if (dragged.current) {
        setTilt({ rotateX: clamp(-dy / bounds.height * 90, 45), rotateY: clamp(dx / bounds.width * 90, 45), hovering: true })
      }
    } else if (event.pointerType === 'mouse') {
      setTilt({ rotateX: ((event.clientY - bounds.top) / bounds.height - 0.5) * -20, rotateY: ((event.clientX - bounds.left) / bounds.width - 0.5) * 20, hovering: true })
    }
  }

  function toggleSound() {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) { audioRequest.current += 1; audio.pause(); setIsPlaying(false) }
    else playClip(activeIndex, audio.ended)
  }

  return <Box minHeight="100vh" bgcolor="background.default">
    <PublicHeader />
    <Box component="main" minHeight="calc(100vh - 76px)" bgcolor="background.default" display="flex" alignItems="center" justifyContent="center" px={{ xs: 2, sm: 4 }} py={{ xs: 4, md: 8 }}>
      <Stack alignItems="center" spacing={2} sx={{ width: '100%' }}>
        <Typography variant="h2" color="primary.dark" textAlign="center" sx={{ fontSize: { xs: '2.4rem', md: '3.5rem' }, fontWeight: 800 }}>LeTeam</Typography>
        <Box className="about-easter-egg-touch-space" role="button" tabIndex={0} aria-label="Flip the LeBron image" aria-description="Tap to flip. Drag to tilt the photo." onClick={flipImage} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); flipImage() } }} onPointerDown={event => { pointerStart.current = { id: event.pointerId, x: event.clientX, y: event.clientY }; dragged.current = false }} onPointerMove={handlePointerMove} onPointerUp={() => { pointerStart.current = null; setTilt(sensorTilt.current) }} onPointerCancel={() => { pointerStart.current = null; setTilt(sensorTilt.current) }} onPointerLeave={() => { if (!pointerStart.current) setTilt(sensorTilt.current) }} sx={{ position: 'relative', width: `min(100%, calc((100vh - 400px) * ${current.ratio}))`, maxWidth: 1200, aspectRatio: current.ratio, borderRadius: { xs: 2, md: 4 }, cursor: 'pointer', touchAction: 'none' }}>
          <Box className="about-easter-egg-image-shell" sx={{ position: 'relative', width: '100%', height: '100%', borderRadius: 'inherit', boxShadow: '0 20px 50px rgba(11, 61, 80, .2)', pointerEvents: 'none', transform: `perspective(1000px) rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg) scale(${tilt.hovering ? 1.04 : 1})` }}>
          <Box className="about-easter-egg-flip-card" sx={{ position: 'relative', width: '100%', height: '100%', transform: `rotateY(${faces.flipped ? 180 : 0}deg)` }}>
            <Box component="img" className="about-easter-egg-image about-easter-egg-front" src={publicAsset(images[faces.front].image)} alt={images[faces.front].description} aria-hidden={faces.flipped} sx={{ borderRadius: { xs: 2, md: 4 } }} />
            <Box component="img" className="about-easter-egg-image about-easter-egg-back" src={publicAsset(images[faces.back].image)} alt={images[faces.back].description} aria-hidden={!faces.flipped} sx={{ borderRadius: { xs: 2, md: 4 } }} />
          </Box>
          <Box className="about-easter-egg-glare" sx={{ opacity: tilt.hovering ? 1 : 0, background: `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255, 255, 255, .46), rgba(255, 255, 255, .14) 16%, transparent 44%)` }} />
          </Box>
        </Box>
        <Typography variant="body2" color="text.secondary" textAlign="center">{motionPermission === 'available' ? 'Tilt your phone or drag the photo to tilt it. ' : 'Drag the photo to tilt it. '}Tap the image to flip.</Typography>
        {motionPermission === 'needed' && <Button onClick={() => void enableMotion()}>Enable motion tilt</Button>}
        {motionPermission === 'denied' && <Typography variant="body2" color="text.secondary">Enable motion access for Milestone in your browser settings to use tilt.</Typography>}
        <audio ref={audioRef} src={publicAsset(images[0].sound)} onEnded={() => setIsPlaying(false)} onError={() => setSoundError('The sound could not load. Please try again.')} />
        <Button onClick={toggleSound} startIcon={isPlaying ? <PauseIcon /> : <PlayArrowIcon />} variant="contained" color="primary" aria-label={isPlaying ? 'Pause the easter egg sound' : 'Play the easter egg sound'}>{isPlaying ? 'Pause sound' : 'Play sound'}</Button>
        {soundError && <Typography role="alert" color="error">{soundError}</Typography>}
        <Typography variant="h6" color="primary.dark" textAlign="center">{activeIndex === 2 ? 'Lets play some Football!' : 'LeTeam was for a King'}</Typography>
      </Stack>
    </Box>
  </Box>
}
