import { test, expect } from '@playwright/test'
import { setup, patient } from './fixture.mjs'

for (const width of [390, 1365]) {
  test(`patient details save, validation, cancellation, retry, and refresh at ${width}px`, async ({ browser }, testInfo) => {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await setup(context);
      let row = { id: patient, name: 'Synthetic Browser Patient', email: null, phone: '0000000000', primary_concern: null, treatment_focus: null, start_of_care: null, care_status: 'pending' };
      const writes = []; let fail = false;
      await context.route('**/rest/v1/patients?*', route => route.fulfill({ json: [row] }));
      await context.route('**/rest/v1/rpc/update_patient_details', async route => {
        const data = route.request().postDataJSON(); writes.push(data);
        await new Promise(resolve => setTimeout(resolve, 150));
        if (fail) return route.fulfill({ status: 403, json: { code: '42501', message: 'Synthetic save rejected' } });
        row = { id: patient, name: data.p_name, email: data.p_email, phone: data.p_phone, primary_concern: data.p_primary_concern, treatment_focus: data.p_treatment_focus, start_of_care: data.p_start_of_care, care_status: data.p_care_status };
        return route.fulfill({ json: row });
      });
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:4187/dashboard/patients/${patient}`);
      await page.getByRole('button', { name: 'Edit patient details', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(page.getByRole('textbox', { name: /^Full name/ })).toBeFocused();
      await page.getByRole('textbox', { name: /^Full name/ }).fill('Updated Synthetic Patient');
      await page.getByLabel('Email address', { exact: true }).fill('bad');
      await page.getByRole('button', { name: 'Save patient details', exact: true }).click();
      await expect(page.getByText('Enter a valid email address.')).toBeVisible();
      if (writes.length !== 0) throw Error('Invalid email was submitted');
      await page.getByLabel('Email address', { exact: true }).fill('saved@example.invalid');
      await page.getByLabel('Phone number', { exact: true }).fill('+1 (202) 555-0100');
      await page.getByLabel('Primary concern', { exact: true }).fill('Synthetic concern');
      await page.getByLabel('Treatment focus', { exact: true }).fill('Synthetic treatment');
      await page.getByLabel('Start of care', { exact: true }).fill('2026-10-26');
      await page.getByRole('combobox', { name: /^Care status/ }).click();
      await page.getByRole('option', { name: 'Active', exact: true }).click();
      await expect(page.getByRole('listbox')).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath(`web-edit-${width}.png`) });
      await dialog.locator('form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
      await expect(dialog).toHaveCount(0);
      if (writes.length !== 1) throw Error('Duplicate save was not guarded');
      await expect(page.getByRole('heading', { name: 'Updated Synthetic Patient', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'saved@example.invalid' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Invite to App' })).toBeEnabled();
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Updated Synthetic Patient', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Edit patient details', exact: true }).click();
      await page.getByRole('textbox', { name: /^Full name/ }).fill('Discarded name');
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Updated Synthetic Patient', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Edit patient details', exact: true }).click();
      await page.getByLabel('Email address', { exact: true }).fill('retry@example.invalid');
      fail = true; await page.getByRole('button', { name: 'Save patient details', exact: true }).click();
      await expect(page.getByText('Synthetic save rejected', { exact: true })).toBeVisible();
      await expect(page.getByLabel('Email address', { exact: true })).toHaveValue('retry@example.invalid');
      fail = false; await page.getByRole('button', { name: 'Save patient details', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'retry@example.invalid' })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`web-saved-${width}.png`), fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      if (overflow || errors.length) throw Error(JSON.stringify({ overflow, errors }));
      console.log(`PASS web ${width}px: save, validation, cancel, retry, duplicate guard, refresh, invitation, keyboard focus, no overflow`);
      await context.close();
  })
}
