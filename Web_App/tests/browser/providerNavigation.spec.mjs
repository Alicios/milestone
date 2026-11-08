import { test, expect } from '@playwright/test'
import { setup } from './fixture.mjs'

for (const width of [320, 390, 599, 600, 768, 1365]) for (const theme of ['light', 'dark']) {
  test(`provider navigation and content fit at ${width}px ${theme}`, async ({ context, page }, info) => {
    const height = 900
    const mobile = width < 600
    await page.setViewportSize({ width, height })
    await setup(context)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('/dashboard/settings')
    await page.getByRole('radio', { name: theme === 'dark' ? 'Dark' : 'Light', exact: true }).check()
    const navigation = page.getByRole('navigation', { name: 'Provider pages', exact: true })
    await navigation.getByRole('link', { name: 'Patients', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Patients', exact: true })).toBeVisible()
    const header = page.getByRole('banner')
    const profile = page.getByRole('button', { name: 'Open profile menu', exact: true })
    const rect = await header.boundingBox()
    expect(rect.x).toBeGreaterThanOrEqual(0)
    expect(rect.x + rect.width).toBeLessThanOrEqual(width)
    if (mobile) {
      expect(Math.abs(rect.y + rect.height - height)).toBeLessThan(1)
      expect(rect.height).toBeGreaterThanOrEqual(72)
    } else {
      expect(rect.y).toBe(0)
    }
    for (const control of [...await navigation.getByRole('link').all(), profile]) {
      const box = await control.boundingBox()
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width)
      expect(box.height).toBeGreaterThanOrEqual(mobile ? 48 : 36)
      const fit = await control.evaluate(el => ({ label: el.getAttribute('aria-label'), contentWidth: el.scrollWidth, availableWidth: el.clientWidth }))
      expect(fit.contentWidth, JSON.stringify(fit)).toBeLessThanOrEqual(fit.availableWidth + 1)
      const hit = await control.evaluate(el => {
        const box = el.getBoundingClientRect()
        return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
      })
      expect(hit).toBe(true)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(navigation.getByRole('link', { name: 'Patients', exact: true })).toHaveAttribute('aria-current', 'page')
    if (mobile) {
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      const lastContent = await page.getByText('No patients awaiting setup.', { exact: true }).boundingBox()
      expect(lastContent.y + lastContent.height).toBeLessThan(rect.y)
      expect(Math.abs((await header.boundingBox()).y - rect.y)).toBeLessThan(1)
    }
    await page.screenshot({ path: info.outputPath(`patients-${width}-${theme}.png`) })
    const profileBox = await profile.boundingBox()
    await profile.click()
    const menu = page.getByRole('menu')
    await expect(menu.getByRole('menuitem', { name: 'Settings', exact: true })).toBeVisible()
    if (mobile) {
      const menuBox = await menu.boundingBox()
      expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(profileBox.y + 1)
    }
    await page.keyboard.press('Escape')
    await expect(profile).toBeFocused()
    await navigation.getByRole('link', { name: 'Routines', exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard\/routines$/)
    await expect(navigation.getByRole('link', { name: 'Routines', exact: true })).toHaveAttribute('aria-current', 'page')
    await navigation.getByRole('link', { name: 'Appointments', exact: true }).click()
    await expect(page.getByText('This workspace is coming soon', { exact: true })).toBeVisible()
    await navigation.getByRole('link', { name: 'Messages', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Compose', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: 'Compose', exact: true }).click()
    const composer = page.getByRole('textbox', { name: /^Write a new message/ })
    await expect(composer).toBeVisible()
    if (mobile) {
      const workspace = page.locator('.messages-page')
      const workspaceBox = await workspace.boundingBox()
      expect(workspaceBox.y).toBe(0)
      expect(workspaceBox.y + workspaceBox.height).toBeLessThanOrEqual(rect.y + 1)
      const composerBox = await composer.boundingBox()
      expect(composerBox.y + composerBox.height).toBeLessThan(rect.y)
      await page.setViewportSize({ width, height: 480 })
      await expect.poll(async () => {
        const input = await composer.boundingBox()
        const dock = await header.boundingBox()
        return input.y + input.height <= dock.y
      }).toBe(true)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: info.outputPath(`messages-${width}-${theme}.png`) })
    expect(errors).toEqual([])
  })
}
