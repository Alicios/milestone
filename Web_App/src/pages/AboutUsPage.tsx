import { Box, Button, Stack, Typography } from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PauseIcon from '@mui/icons-material/Pause'
import { useRef, useState, type MouseEvent } from 'react'
import { PublicHeader } from '../components/PublicHeader'
import { publicAsset } from '../lib/assets'

export function AboutUsPage() {
  const [imageTilt, setImageTilt] = useState({ rotateX: 0, rotateY: 0, hovering: false })
  const [showAlternateImage, setShowAlternateImage] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const glareX = Math.max(8, Math.min(92, 42 - imageTilt.rotateY * 1.5))
  const glareY = Math.max(8, Math.min(92, 38 + imageTilt.rotateX * 1.5))

  function handleImageMove(event: MouseEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    const horizontalPosition = (event.clientX - bounds.left) / bounds.width - 0.5
    const verticalPosition = (event.clientY - bounds.top) / bounds.height - 0.5
    setImageTilt({ rotateX: verticalPosition * -20, rotateY: horizontalPosition * 20, hovering: true })
  }

  function toggleImage() {
    setShowAlternateImage((shown) => !shown)
  }

  async function toggleSound() {
    const audio = audioRef.current
    if (!audio) return

    if (audio.paused) {
      await audio.play()
      setIsPlaying(true)
    } else {
      audio.pause()
      setIsPlaying(false)
    }
  }

  return (
    <Box minHeight="100vh" bgcolor="background.default">
      <PublicHeader />
      <Box component="main" minHeight="calc(100vh - 76px)" bgcolor="background.default" display="flex" alignItems="center" justifyContent="center" px={{ xs: 2, sm: 4 }} py={{ xs: 4, md: 8 }}>
        <Stack alignItems="center" spacing={2} sx={{ width: '100%' }}>
          <Typography variant="h2" color="primary.dark" textAlign="center" sx={{ fontSize: { xs: '2.4rem', md: '3.5rem' }, fontWeight: 800 }}>LeTeam</Typography>
          <Box className="about-easter-egg-image-shell" role="button" tabIndex={0} aria-label="Flip the LeBron image" aria-pressed={showAlternateImage} onClick={toggleImage} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleImage() } }} onMouseMove={handleImageMove} onMouseLeave={() => setImageTilt({ rotateX: 0, rotateY: 0, hovering: false })} sx={{ position: 'relative', width: showAlternateImage ? 'min(100%, calc((100vh - 190px) * 1.5))' : 'min(100%, calc((100vh - 190px) * 1.7778))', maxWidth: 1200, aspectRatio: showAlternateImage ? '3 / 2' : '16 / 9', borderRadius: { xs: 2, md: 4 }, boxShadow: '0 20px 50px rgba(11, 61, 80, .2)', cursor: 'pointer', transform: `perspective(1000px) rotateX(${imageTilt.rotateX}deg) rotateY(${imageTilt.rotateY}deg) scale(${imageTilt.hovering ? 1.04 : 1})` }}>
            <Box className="about-easter-egg-flip-card" sx={{ position: 'relative', width: '100%', height: '100%', transform: `rotateY(${showAlternateImage ? 180 : 0}deg)` }}>
              <Box component="img" className="about-easter-egg-image about-easter-egg-front" src={publicAsset('wallpapersden.com_king-lebron-james-hd-la-lakers-ai_1920x1080.jpg')} alt="LeBron James in a Los Angeles Lakers uniform." sx={{ borderRadius: { xs: 2, md: 4 } }} />
              <Box component="img" className="about-easter-egg-image about-easter-egg-back" src={publicAsset('lebron-76.jpg')} alt="LeBron James, number 76." sx={{ borderRadius: { xs: 2, md: 4 } }} />
            </Box>
            <Box className="about-easter-egg-glare" sx={{ opacity: imageTilt.hovering ? 1 : 0, background: `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255, 255, 255, .46), rgba(255, 255, 255, .14) 16%, transparent 44%)` }} />
          </Box>
          <audio ref={audioRef} src="/lebroooon-james.mp3" onEnded={() => setIsPlaying(false)} />
          <Button onClick={toggleSound} startIcon={isPlaying ? <PauseIcon /> : <PlayArrowIcon />} variant="contained" color="primary" aria-label={isPlaying ? 'Pause the easter egg sound' : 'Play the easter egg sound'}>
            {isPlaying ? 'Pause sound' : 'Play sound'}
          </Button>
          <Typography variant="h6" color="primary.dark" textAlign="center">LeTeam was for a King</Typography>
        </Stack>
      </Box>
    </Box>
  )
}
