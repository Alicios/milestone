import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#125b75', dark: '#0b3d50', light: '#4a8aa0' },
    secondary: { main: '#d9822b' },
    background: { default: '#f5f8fa', paper: '#ffffff' },
    success: { main: '#2e7d62' },
    text: { primary: '#18323d', secondary: '#5c7079' },
  },
  typography: {
    fontFamily: 'Inter, Roboto, Arial, sans-serif',
    h1: { fontWeight: 700, letterSpacing: '-0.03em' },
    h2: { fontWeight: 700, letterSpacing: '-0.02em' },
    h3: { fontWeight: 700 },
    button: { textTransform: 'none', fontWeight: 700 },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiCard: { styleOverrides: { root: { border: '1px solid #e4edf0', boxShadow: '0 8px 24px rgba(24, 50, 61, 0.05)' } } },
    MuiTextField: { defaultProps: { fullWidth: true, variant: 'outlined' } },
  },
})
