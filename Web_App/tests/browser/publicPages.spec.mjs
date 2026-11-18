import { test, expect } from '@playwright/test'
import { setup } from './fixture.mjs'

for (const width of [390, 1365]) {
  test(`public presentation pages, app previews, FAQ and empty account forms at ${width}px`, async ({ context, page }, info) => {
    await setup(context, { initialSession: null })
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const fits = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.goto('/')
    for (const title of ['Provider web workspace', 'Provider companion app', 'Patient app']) {
      await page.getByRole('button', { name: `Enlarge ${title} screenshot`, exact: true }).click()
      const dialog = page.getByRole('dialog', { name: title, exact: true })
      await expect(dialog).toBeVisible()
      await expect.poll(() => dialog.getByRole('img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true)
      await fits()
      await dialog.getByRole('button', { name: 'Close screenshot', exact: true }).click()
    }
    await page.screenshot({ path: info.outputPath('homepage.png'), fullPage: true, animations: 'disabled' })
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    if (width < 1200) {
      await page.getByRole('button', { name: 'Open home page resources', exact: true }).click()
      await page.getByRole('menuitem', { name: 'FAQ', exact: true }).click()
    } else await page.getByRole('navigation', { name: 'Home page resources' }).getByRole('link', { name: 'FAQ', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Frequently asked questions', exact: true })).toBeVisible()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
    await page.getByRole('button', { name: 'Who is Milestone for?', exact: true }).click()
    await expect(page.getByText('Milestone connects physical therapy providers and their patients.', { exact: false })).toBeVisible()
    await fits()
    await page.screenshot({ path: info.outputPath('faq.png'), fullPage: true, animations: 'disabled' })
    await page.goto('/login')
    await expect(page.getByRole('textbox', { name: 'Work email' })).toHaveValue('')
    await fits()
    await page.screenshot({ path: info.outputPath('login.png'), fullPage: true })
    await page.goto('/register')
    await expect(page.getByRole('textbox', { name: 'Full name' })).toHaveValue('')
    await expect(page.getByRole('textbox', { name: 'Work email' })).toHaveValue('')
    await fits()
    await page.screenshot({ path: info.outputPath('register.png'), fullPage: true })
    expect(errors).toEqual([])
  })
}
