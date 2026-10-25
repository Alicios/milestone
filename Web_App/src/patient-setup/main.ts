// Standalone page for a patient to finish an invitation sent by
// api/invite-patient.ts (triggered from the "New Patient" form or a patient's
// "Invite to App" button). Deliberately has no React, no AuthProvider, and no
// dependency on anything provider-specific in this app — it only needs the
// shared Supabase client. detectSessionInUrl (set in ../lib/supabase) parses
// the invite link's token automatically; this script just waits for that
// session, then lets the patient choose a password with supabase.auth.updateUser.
import { supabase } from '../lib/supabase'

const appElement = document.getElementById('app')
if (!appElement) throw new Error('Missing #app container.')
const app: HTMLElement = appElement

function renderLoading() {
  app.innerHTML = '<p class="loading">Checking your invitation link…</p>'
}

function renderInvalid() {
  app.innerHTML = `
    <h1>Link invalid or expired</h1>
    <p class="subtitle">This invitation link is no longer valid. Ask your provider to send a new one.</p>
  `
}

function renderSuccess() {
  app.innerHTML = `
    <h1>You're all set</h1>
    <div class="message success">Your password has been saved.</div>
    <p class="subtitle">Open the Milestone app on your phone to continue.</p>
  `
}

function showFormMessage(text: string) {
  const messageContainer = document.getElementById('formMessage')
  if (messageContainer) messageContainer.innerHTML = `<div class="message error">${text}</div>`
}

function renderForm() {
  app.innerHTML = `
    <h1>Set up your account</h1>
    <p class="subtitle">Choose a password for your Milestone patient account.</p>
    <div id="formMessage"></div>
    <form id="setupForm" novalidate>
      <label for="password">Password</label>
      <input type="password" id="password" autocomplete="new-password" required minlength="6" />
      <label for="confirmPassword">Confirm password</label>
      <input type="password" id="confirmPassword" autocomplete="new-password" required minlength="6" />
      <button type="submit">Set password</button>
    </form>
  `

  const form = document.getElementById('setupForm') as HTMLFormElement
  form.addEventListener('submit', (event) => { void handleSubmit(event) })
}

async function handleSubmit(event: SubmitEvent) {
  event.preventDefault()
  const password = (document.getElementById('password') as HTMLInputElement).value
  const confirmPassword = (document.getElementById('confirmPassword') as HTMLInputElement).value
  const button = (event.currentTarget as HTMLFormElement).querySelector('button') as HTMLButtonElement

  showFormMessage('')
  if (password.length < 6) return showFormMessage('Password must be at least 6 characters.')
  if (password !== confirmPassword) return showFormMessage('Passwords do not match.')

  button.disabled = true
  button.textContent = 'Setting password…'
  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    button.disabled = false
    button.textContent = 'Set password'
    showFormMessage(error.message)
    return
  }
  renderSuccess()
}

async function init() {
  renderLoading()

  const { data } = await supabase.auth.getSession()
  if (data.session) {
    renderForm()
    return
  }

  // detectSessionInUrl's hash parsing can resolve a tick after the client is
  // created, so give it a brief window via onAuthStateChange before
  // concluding the link is actually invalid or expired.
  const timeoutId = window.setTimeout(() => {
    subscription.unsubscribe()
    renderInvalid()
  }, 4000)

  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!session) return
    window.clearTimeout(timeoutId)
    subscription.unsubscribe()
    renderForm()
  })
}

void init()
