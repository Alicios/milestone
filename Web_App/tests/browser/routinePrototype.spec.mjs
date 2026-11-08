import { test, expect } from '@playwright/test'
import { setup, routineA, routineB } from './fixture.mjs'
import { routineTemplates, copyPrototypeRoutine } from '../../src/lib/routinePrototype.ts'
import { readFileSync } from 'node:fs'
import { publicVideoPreview } from '../../src/lib/videoPreview.ts'
import { exerciseTags } from '../../src/lib/exerciseTags.ts'

const mediaManifest = JSON.parse(readFileSync(new URL('../../src/data/exerciseMedia.json', import.meta.url), 'utf8'))
const names = [...new Set([...routineTemplates.flatMap((template) => template.names), ...Object.keys(mediaManifest)])]
const catalog = [...names, ...Array.from({ length: 510 - names.length }, (_, i) => `Additional catalog exercise ${String(i).padStart(3, '0')}`)]
  .sort().map((name, i) => ({ id: `00000000-0000-0000-0001-${String(i).padStart(12, '0')}`, name, desc: `Stored instructions for ${name}.` }))

test('catalog tags cover named exercises without mistaking position cues for target areas', () => {
  expect(Object.keys(mediaManifest).filter((name) => !exerciseTags(name).length)).toEqual([])
  expect(exerciseTags('Bird Dog')).toEqual(expect.arrayContaining(['back', 'core']))
  expect(exerciseTags('Thread the Needle')).toContain('back')
  expect(exerciseTags('Heel Slide')).toContain('legs')
  expect(exerciseTags('Heel Slide')).not.toContain('feet')
  expect(exerciseTags('Supine Hand-to-Thigh Isometric Press')).not.toContain('hands')
  expect(exerciseTags('Supine Tabletop Toe Taps')).toEqual(['core'])
  expect(exerciseTags('Knee-to-Wall Ankle Mobility')).toEqual(['feet'])
})

test('public video previews preserve start times and private Vimeo hashes and reject unsupported links', () => {
  expect(publicVideoPreview('https://www.youtube.com/watch?v=gWKT0jXnzac&t=5m50s')).toEqual({ kind: 'embed', url: 'https://www.youtube-nocookie.com/embed/gWKT0jXnzac?start=350&playsinline=1' })
  expect(publicVideoPreview('https://youtu.be/gWKT0jXnzac?t=350')?.url).toContain('start=350')
  expect(publicVideoPreview('https://vimeo.com/123456789/abcdef1234')).toEqual({ kind: 'embed', url: 'https://player.vimeo.com/video/123456789?h=abcdef1234' })
  for (const url of ['not a URL','http://youtu.be/gWKT0jXnzac','https://youtube.com.evil.invalid/watch?v=gWKT0jXnzac','https://youtube.com/watch?v=bad','https://vimeo.com/channels/example','https://pocketphysio.app/exercises/pendulum-exercise/']) expect(publicVideoPreview(url)).toBeUndefined()
})

test('template copies own their routine, exercise and media identities', () => {
  const template = { id: 'shared-template', name: 'Shoulder Mobility', source: 'template', description: 'Shared starting point', exercises: [{
    id: 'shared-exercise', catalogId: 'catalog-shoulder', name: 'Shoulder Pendulum', description: 'Stored instructions',
    sets: '', repetitions: '', duration: '', rest: '', notes: '',
    media: [{ id: 'shared-media', kind: 'video-link', url: 'https://example.invalid/video', name: 'Demonstration', caption: 'Original source', preview: { kind: 'embed', url: 'https://example.invalid/player' } }],
  }] }
  const before = JSON.stringify(template)
  const first = copyPrototypeRoutine(template)
  const second = copyPrototypeRoutine(template)
  first.exercises[0].sets = '9'
  first.exercises[0].media[0].caption = 'Changed in my copy'
  first.exercises[0].media[0].preview.url = 'https://example.invalid/changed'
  expect(JSON.stringify(template)).toBe(before)
  expect(template.source).toBe('template')
  expect(first.source).toBe('provider')
  expect(second.exercises[0].sets).toBe('')
  expect(second.exercises[0].media[0].caption).not.toBe('Changed in my copy')
  expect(new Set([template.id, first.id, second.id]).size).toBe(3)
  expect(first.exercises[0].id).not.toBe(template.exercises[0].id)
  expect(first.exercises[0].id).not.toBe(second.exercises[0].id)
  expect(first.exercises[0].media[0].id).not.toBe(template.exercises[0].media[0].id)
  expect(first.exercises.map((item) => item.catalogId)).toEqual(template.exercises.map((item) => item.catalogId))
})

for (const width of [390, 1365]) {
  test(`persistent routine and exercise results support independent custom routines at ${width}px`, async ({ browser }, testInfo) => {
    test.setTimeout(90000)
    const context = await browser.newContext({ viewport: { width, height: 900 } })
    await setup(context, { routines: [
      { id: routineA, name: 'Provider Recovery', exercise_list: [{ exercise_id: catalog[0].id, name: catalog[0].name, sets: 3, reps: 12, duration_seconds: 30, notes: 'Saved provider notes' }] },
      { id: routineB, name: 'Shoulder Mobility', exercise_list: [{ exercise_id: catalog[1].id, name: catalog[1].name }] },
    ] })
    const offsets = []; const writes = []; const errors = []
    let failCatalog = true
    await context.route('**/rest/v1/exercises?*', (route) => {
      if (failCatalog) return route.fulfill({ status: 403, json: { code: '42501', message: 'Catalog access denied' } })
      const url = new URL(route.request().url())
      const offset = Number(url.searchParams.get('offset') || 0)
      const limit = Number(url.searchParams.get('limit') || 500)
      offsets.push(offset)
      return route.fulfill({ json: catalog.slice(offset, offset + limit) })
    })
    context.on('request', (request) => {
      const readRpc = /\/rpc\/(get_routine_scheduling_policy|get_patient_schedule_occupancy)$/.test(new URL(request.url()).pathname)
      if (request.url().includes('/rest/') && request.method() !== 'GET' && !readRpc) writes.push(request.url())
    })
    await context.route('https://www.youtube-nocookie.com/embed/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><button>Fixture video player</button>' }))
    const page = await context.newPage()
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/dashboard/routines')
    await page.getByRole('button', { name: 'Advanced editor', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Retry catalog' })).toBeVisible()
    failCatalog = false
    await page.getByRole('button', { name: 'Retry catalog' }).click()
    await expect(page.getByText(/510 database exercises/)).toBeVisible()
    expect(offsets).toContain(500)
    await expect(page.getByText(/14 templates/)).toBeVisible()
    const search = page.getByRole('textbox', { name: 'Search routines or exercises', exact: true })
    const results = page.getByRole('complementary', { name: 'Search results' })
    const routineResults = page.getByRole('region', { name: 'Routine results' })
    const exerciseResults = page.getByRole('region', { name: 'Exercise results' })
    const builder = page.getByRole('region', { name: 'Routine builder' })
    const routinePreview = page.getByRole('region', { name: 'Routine preview' })
    const exercisePreview = page.getByRole('region', { name: 'Exercise preview' })
    const filters = page.getByRole('group', { name: 'Exercise filters' })
    const firstResults = results.locator('section').first()
    await expect(firstResults).toHaveAttribute('aria-label', 'Routine results')
    await expect(search).toHaveCount(1)
    await expect(page.getByRole('combobox')).toHaveCount(0)
    await search.fill('Shoulder')
    await expect(routineResults.getByRole('button', { name: 'View template: Shoulder Mobility', exact: true })).toBeVisible()
    await expect(routineResults.getByRole('button', { name: 'View my routine: Shoulder Mobility', exact: true })).toBeVisible()
    await expect(exerciseResults.getByRole('button', { name: 'Preview exercise: Shoulder Pendulum', exact: true })).toBeVisible()
    await expect(exerciseResults.getByRole('button', { name: 'Add Shoulder Pendulum to routine', exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`mixed-results-${width}.png`), fullPage: true })

    await search.fill('')
    await filters.getByRole('button', { name: 'Hands & wrists', exact: true }).click()
    await search.fill('Wrist')
    await expect(exerciseResults.getByRole('button', { name: 'Preview exercise: Wrist Extensor Stretch', exact: true })).toBeVisible()
    await expect(exerciseResults.getByRole('button', { name: 'Preview exercise: Ankle Pumps', exact: true })).toHaveCount(0)
    await search.fill('')
    await filters.getByRole('button', { name: 'Feet & ankles', exact: true }).click()
    await expect(exerciseResults.getByRole('button', { name: 'Preview exercise: Ankle Pumps', exact: true })).toBeVisible()
    await expect(exerciseResults.getByRole('button', { name: 'Preview exercise: Wrist Extensor Stretch', exact: true })).toBeVisible()
    await filters.getByRole('button', { name: 'All', exact: true }).click()

    await search.fill('Provider Recovery')
    await routineResults.getByRole('button', { name: 'View my routine: Provider Recovery', exact: true }).click()
    await expect(routinePreview.getByText(/3 sets.*12 reps.*30 sec duration/)).toBeVisible()
    await routinePreview.getByRole('button', { name: 'Edit', exact: true }).click()
    await expect(firstResults).toHaveAttribute('aria-label', 'Exercise results')
    await expect(builder.getByLabel('Sets', { exact: true })).toHaveValue('3')
    await expect(builder.getByLabel('Provider notes', { exact: true })).toHaveValue('Saved provider notes')
    await builder.getByLabel('Routine name', { exact: false }).fill('Provider Recovery Preview')
    await builder.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(routinePreview.getByRole('heading', { name: 'Provider Recovery Preview', exact: true })).toBeVisible()
    await routinePreview.getByRole('button', { name: 'Archive', exact: true }).click()
    await expect(routineResults.getByRole('button', { name: 'View my routine: Provider Recovery Preview', exact: true })).toHaveCount(0)

    await page.getByRole('button', { name: 'New routine', exact: true }).click()
    await expect(firstResults).toHaveAttribute('aria-label', 'Exercise results')
    await builder.getByLabel('Routine name', { exact: false }).fill('Custom recovery')
    await builder.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(builder.getByText('Add at least one exercise.', { exact: true })).toBeVisible()
    await search.fill('Wrist Extensor Stretch')
    await exerciseResults.getByRole('button', { name: 'Add Wrist Extensor Stretch to routine', exact: true }).click()
    await expect(builder.getByLabel('Exercise name', { exact: false })).toHaveValue('Wrist Extensor Stretch')
    await expect(builder.getByLabel('Sets', { exact: true })).toHaveValue('')
    await search.fill('Ankle Pumps')
    await exerciseResults.getByRole('button', { name: 'Preview exercise: Ankle Pumps', exact: true }).click()
    await expect(builder.getByLabel('Routine name', { exact: false })).toHaveValue('Custom recovery')
    await expect(exercisePreview.getByRole('heading', { name: 'Ankle Pumps', exact: true })).toBeVisible()
    await exerciseResults.getByRole('button', { name: 'Add Ankle Pumps to routine', exact: true }).click()
    await expect(builder.getByRole('heading', { name: 'Exercise 2', exact: true })).toBeVisible()
    await expect(results).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`custom-builder-${width}.png`), fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false)
    await search.fill('Shoulder Mobility')
    await routineResults.getByRole('button', { name: 'View template: Shoulder Mobility', exact: true }).click()
    await page.getByRole('button', { name: 'Add template exercises', exact: true }).click()
    await expect(builder.getByRole('heading', { name: 'Exercise 7', exact: true })).toBeVisible()
    await expect(builder.getByLabel('Routine name', { exact: false })).toHaveValue('Custom recovery')
    await builder.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(routinePreview.getByRole('heading', { name: 'Custom recovery', exact: true })).toBeVisible()
    await expect(firstResults).toHaveAttribute('aria-label', 'Routine results')

    await search.fill('Shoulder Mobility')
    await routineResults.getByRole('button', { name: 'View template: Shoulder Mobility', exact: true }).click()
    await expect(routinePreview.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)
    await expect(routinePreview.getByRole('button', { name: 'Archive', exact: true })).toHaveCount(0)
    await routinePreview.getByRole('button', { name: 'Use template', exact: true }).click()
    await expect(builder.getByLabel('Routine name', { exact: false })).toHaveValue('Shoulder Mobility (copy)')
    await builder.getByLabel('Routine name', { exact: false }).fill('My shoulder plan')
    await builder.getByLabel('Sets', { exact: true }).first().fill('6')
    await builder.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(routineResults.getByRole('button', { name: 'View my routine: My shoulder plan', exact: true })).toBeVisible()
    await search.fill('Shoulder Mobility')
    await routineResults.getByRole('button', { name: 'View template: Shoulder Mobility', exact: true }).click()
    await routinePreview.getByRole('button', { name: 'Use template', exact: true }).click()
    await expect(builder.getByLabel('Sets', { exact: true }).first()).toHaveValue('')
    await builder.getByRole('button', { name: 'Cancel', exact: true }).first().click()
    expect(writes).toEqual([])

    await page.reload()
    await page.getByRole('button', { name: 'Advanced editor', exact: true }).click()
    await expect(page.getByText(/14 templates/)).toBeVisible()
    await expect(routineResults.getByRole('button', { name: 'View my routine: Provider Recovery', exact: true })).toBeVisible()
    await expect(routineResults.getByRole('button', { name: 'View my routine: My shoulder plan', exact: true })).toHaveCount(0)
    await search.fill('Walking While Carrying an Object')
    await exerciseResults.getByRole('button', { name: 'Preview exercise: Walking While Carrying an Object', exact: true }).click()
    const illustration = exercisePreview.getByRole('img', { name: 'Walking While Carrying an Object', exact: true })
    await expect(illustration).toBeVisible()
    await expect(illustration).toHaveJSProperty('complete', true)
    expect(await illustration.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0)
    const coverage = await page.evaluate(async () => {
      const { catalogExercise, providerPrototypeRoutines, buildPrototypeRoutines } = await import('/src/lib/routinePrototype.ts')
      const { default: manifest } = await import('/src/data/exerciseMedia.json')
      const catalog = Object.keys(manifest).map((name, index) => ({ id: String(index), name, description: 'Catalog instructions' }))
      const missing = catalog.filter((entry) => !catalogExercise(entry).media.length).map((entry) => entry.name)
      const templates = buildPrototypeRoutines(catalog).routines
      const provider = providerPrototypeRoutines([{ id: 'existing', name: 'Saved provider routine', exercises: catalog.map((entry, position) => ({ id: String(position), name: entry.name, exerciseId: entry.id, position })) }], catalog)
      return { count: catalog.length, missing, providerMissing: provider[0].exercises.filter((entry) => !entry.media.length).length,
        notInline: catalog.filter((entry) => !catalogExercise(entry).media.some((item) => item.kind === 'image' || item.preview)).map((entry) => entry.name),
        routineMedia: [...templates, ...provider].some((routine) => 'media' in routine),
        localImages: Object.values(manifest).flat().filter((item) => item.kind === 'image' && item.url.startsWith('/')).map((item) => item.url) }
    })
    expect(coverage.count).toBe(248)
    expect(coverage.missing).toEqual([])
    expect(coverage.providerMissing).toBe(0)
    expect(coverage.notInline).toEqual([])
    expect(coverage.routineMedia).toBe(false)
    for (const path of coverage.localImages) {
      const response = await page.request.get(path)
      expect(response.status()).toBe(200)
      expect(response.headers()['content-type']).toContain('image/png')
    }
    await search.fill('Shoulder Flexion Table Slide')
    await exerciseResults.getByRole('button', { name: 'Preview exercise: Shoulder Flexion Table Slide', exact: true }).click()
    await exercisePreview.getByRole('button', { name: /^Play video preview:/ }).click()
    await expect(exercisePreview.locator('iframe')).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/DRzwURt6jPk?playsinline=1&autoplay=1')
    await expect(exercisePreview.frameLocator('iframe').getByRole('button', { name: 'Fixture video player' })).toBeVisible()
    expect((await exercisePreview.locator('iframe').boundingBox()).height).toBeGreaterThanOrEqual(200)
    await exercisePreview.getByRole('button', { name: 'Close preview', exact: true }).click()
    await search.fill('Quadriceps Set')
    await exerciseResults.getByRole('button', { name: 'Preview exercise: Quadriceps Set', exact: true }).click()
    await exercisePreview.getByRole('button', { name: /^Play video preview:/ }).click()
    await expect(exercisePreview.getByText('Video could not be played. Open the video source below.')).toBeVisible()
    await search.fill('Leg Press')
    await exerciseResults.getByRole('button', { name: 'Preview exercise: Leg Press', exact: true }).click()
    const replacementPicture = exercisePreview.getByRole('img', { name: 'Leg Press', exact: true })
    await expect(replacementPicture).toBeVisible()
    await expect(replacementPicture).toHaveJSProperty('complete', true)
    expect(await replacementPicture.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0)
    expect(errors).toEqual([])
    expect(writes).toEqual([])
    await context.close()
  })
}
