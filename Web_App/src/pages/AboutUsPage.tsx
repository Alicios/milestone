import { Box, Stack, Typography } from '@mui/material'
import { useState, type MouseEvent } from 'react'
import { PublicHeader } from '../components/PublicHeader'

export function AboutUsPage() {
  const [imageTilt, setImageTilt] = useState({ rotateX: 0, rotateY: 0, hovering: false })
  const glareX = Math.max(8, Math.min(92, 42 - imageTilt.rotateY * 1.5))
  const glareY = Math.max(8, Math.min(92, 38 + imageTilt.rotateX * 1.5))

  function handleImageMove(event: MouseEvent<HTMLImageElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    const horizontalPosition = (event.clientX - bounds.left) / bounds.width - 0.5
    const verticalPosition = (event.clientY - bounds.top) / bounds.height - 0.5
    setImageTilt({ rotateX: verticalPosition * -20, rotateY: horizontalPosition * 20, hovering: true })
  }

  return (
    <Box minHeight="100vh" bgcolor="background.default">
      <PublicHeader />
      <Box component="main" minHeight="calc(100vh - 76px)" bgcolor="background.default" display="flex" alignItems="center" justifyContent="center" px={{ xs: 2, sm: 4 }} py={{ xs: 4, md: 8 }}>
        <Stack alignItems="center" spacing={2}>
          <Typography variant="h2" color="primary.dark" textAlign="center" sx={{ fontSize: { xs: '2.4rem', md: '3.5rem' }, fontWeight: 800 }}>LeTeam</Typography>
          <Box className="about-easter-egg-image-shell" sx={{ position: 'relative', width: '100%', maxWidth: 1100, transform: `perspective(1000px) rotateX(${imageTilt.rotateX}deg) rotateY(${imageTilt.rotateY}deg) scale(${imageTilt.hovering ? 1.04 : 1})` }}>
            <Box component="img" className="about-easter-egg-image" src="/wallpapersden.com_king-lebron-james-hd-la-lakers-ai_1920x1080.jpg" alt="LeBron James in a Los Angeles Lakers uniform." onMouseMove={handleImageMove} onMouseLeave={() => setImageTilt({ rotateX: 0, rotateY: 0, hovering: false })} sx={{ display: 'block', width: '100%', maxHeight: 'calc(100vh - 190px)', objectFit: 'contain', borderRadius: { xs: 2, md: 4 }, boxShadow: '0 20px 50px rgba(11, 61, 80, .2)' }} />
            <Box className="about-easter-egg-glare" sx={{ opacity: imageTilt.hovering ? 1 : 0, background: `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255, 255, 255, .46), rgba(255, 255, 255, .14) 16%, transparent 44%)` }} />
          </Box>
          <Typography variant="h6" color="primary.dark" textAlign="center">LeTeam was for a King</Typography>
        </Stack>
      </Box>
    </Box>
  )
}
