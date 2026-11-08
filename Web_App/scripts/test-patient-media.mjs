// Export Mobile_App/milestone with --platform web --output-dir .expo/media-web.
// Run node scripts/prepare-exercise-media.mjs, then node scripts/test-patient-media.mjs.
// Patient/auth requests use fixtures; approved public media is loaded for playback checks.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(resolve('package.json'));
const { chromium } = require('playwright');
const { expect } = require('@playwright/test');
const root = resolve(process.argv[2] || '../Mobile_App/milestone/.expo/media-web');
const output = resolve('test-results/patient-media-browser');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.ttf': 'font/ttf', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg' };
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = resolve(root, `.${decodeURIComponent(pathname === '/' ? '/index.html' : pathname)}`);
  if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
await mkdir(output, { recursive: true });
const userId = '00000000-0000-4000-8000-000000000001';
const snapshotId = '00000000-0000-4000-8000-000000000002';
const patient = { id: 'review-patient', name: 'Review Patient', email: 'review@example.invalid', phone: '', care_status: 'active', auth_user_id: userId };
const expires = Math.floor(Date.now() / 1000) + 3600;
const jwt = [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: userId, role: 'authenticated', exp: expires })).toString('base64url'), 'review-fixture'].join('.');
const session = { access_token: jwt, refresh_token: 'review-fixture', token_type: 'bearer', expires_in: 3600, expires_at: expires,
  user: { id: userId, email: patient.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } };
const catalog = JSON.parse(await readFile('test-results/patient-media/catalog.json', 'utf8'));
const illustration = catalog.flatMap(x => x.media).find(x => x.url === '/exercise-media/leg-press.png');
const allVideos = catalog.flatMap(x => x.media).filter(x => x.preview);
const videos = [allVideos.find(x => x.preview.url.includes('youtube-nocookie')),allVideos.find(x => x.preview.url.includes('vimeo.com')),allVideos.find(x => x.preview.kind === 'video')];
let failMedia = true;
let allowMedia = false;
let mediaReads = 0;
const sizes = [[320, 568], [390, 844], [768, 1024], [844, 390], [390, 320]];
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/Los_Angeles', reducedMotion: 'reduce', hasTouch: true });
  const saves = [];
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (!url.hostname.endsWith('.supabase.co')) return allowMedia ? route.continue() : route.abort();
    const name = url.pathname.split('/').at(-1);
    const body = route.request().postData() ? route.request().postDataJSON() : {};
    const json = data => route.fulfill({ json: data });
    if (url.pathname.startsWith('/auth/v1/')) return json(name === 'verify' || name === 'token' ? session : session.user);
    if (name === 'get_my_patient_profile') return json([patient]);
    if (name === 'get_my_care_relationships') return json([{ patient_profile_id: 'relationship' }]);
    if (name === 'get_my_routine_assignments') return json([{ id: 'assignment', scheduled_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date()), status: 'scheduled', routine_name_snapshot: 'Daily mobility', created_at: '2026-01-01' }, { id: 'upcoming-assignment', scheduled_date: '2099-01-01', status: 'scheduled', routine_name_snapshot: 'Upcoming mobility', created_at: '2026-01-01' }]);
    if (name === 'get_my_routine_assignment_media') {
      mediaReads++;
      return failMedia && body.p_routine_assignment_id !== 'upcoming-assignment' ? route.fulfill({status:503,json:{message:'Media temporarily unavailable'}}) : json([{assignment_exercise_id:snapshotId,exercise_id:'catalog',instructions:'Keep movement controlled.',media:[illustration,...videos]}]);
    }
    if (name === 'get_my_routine_assignment_prescriptions') return json([{ id: snapshotId, exercise_name_snapshot: 'Gentle stretch', sets_snapshot: 1, reps_snapshot: 5 }]);
    if (name === 'save_my_routine_exercise_feedback') {
      saves.push(body);
      return json([{ routine_assignment_exercise_id: body.p_routine_assignment_exercise_id, pain_score: body.p_pain_score, feeling: body.p_feeling, explanation: body.p_explanation, reported_at: new Date().toISOString() }]);
    }
    return json([]);
  });
  const page = await context.newPage();
  const errors = [];
  page.on('requestfailed', request => { const url = new URL(request.url()); if (url.hostname !== '127.0.0.1' && !url.hostname.endsWith('.supabase.co') && allowMedia) console.log('Media request failed:', url.hostname, request.failure()?.errorText); });
  page.on('pageerror', error => errors.push(error.message));
  const press = name => page.getByRole('button', { name, exact: true }).click();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('textbox', { name: 'Email address' }).fill(patient.email);
  await page.getByRole('textbox', { name: 'Login code' }).fill('123456');
  await press('Sign in');
  await press('Finish setup');
  await press('Routines');
  await page.getByRole('button',{name:/Upcoming mobility, .* information/}).click();
  await expect(page.getByRole('button',{name:'Gentle stretch information',exact:true})).toHaveCount(2);
  await page.getByRole('button',{name:'Gentle stretch information',exact:true}).last().click();
  await expect(page.getByRole('button',{name:'Enlarge demonstration for Gentle stretch'})).toBeVisible();
  await page.getByRole('button',{name:/Upcoming mobility, .* information/}).click();
  failMedia = true;
  await press('Home');

  await press('Start routine');
  await expect(page.getByRole('button',{name:'Retry exercise media'})).toBeVisible();
  failMedia = false;
  await press('Retry exercise media');
  const picture = page.getByRole('button',{name:'Enlarge demonstration for Gentle stretch'});
  await expect(picture).toBeVisible();
  await expect(picture.getByRole('img')).toHaveJSProperty('complete',true);
  assert(await picture.getByRole('img').evaluate(img=>img.naturalWidth>0));
  await picture.click();
  await expect(page.getByRole('img',{name:'Gentle stretch enlarged demonstration'})).toBeVisible();
  await page.getByRole('img',{name:'Gentle stretch enlarged demonstration'}).screenshot({path:resolve(output,'enlarged-picture.png')});
  await press('Close enlarged demonstration');
  await expect(page.getByText('Close picture',{exact:true})).not.toBeVisible();
  for (const scheme of ['light','dark']) {
    await page.emulateMedia({colorScheme:scheme});
    for(const [width,height] of sizes) {
      await page.setViewportSize({width,height});
      await picture.scrollIntoViewIfNeeded();
      await picture.screenshot({path:resolve(output,scheme+'-'+width+'x'+height+'-picture.png')});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    }
  }
  await page.setViewportSize({width:390,height:844});
  await picture.scrollIntoViewIfNeeded();
  await page.screenshot({path:resolve(output,'patient-preview.png'),fullPage:true});
  allowMedia = true;
  const play = page.getByRole('button',{name:'Play demonstration for Gentle stretch'});
  await play.nth(0).click();
  await expect(page.locator('iframe')).toHaveAttribute('src',videos[0].preview.url);
  await page.frameLocator('iframe').locator('video').waitFor({state:'attached',timeout:30000});
  await page.frameLocator('iframe').getByRole('button',{name:/Play/i}).first().click();
  await expect.poll(()=>page.frameLocator('iframe').locator('video').evaluate(video=>video.currentTime),{timeout:30000}).toBeGreaterThan(0.3);
  await page.locator('iframe').screenshot({path:resolve(output,'youtube-player.png')});
  await press('Close video');
  await expect(page.locator('iframe')).toHaveCount(0);
  await play.nth(1).click();
  await expect(page.locator('iframe')).toHaveAttribute('src',videos[1].preview.url);
  await page.frameLocator('iframe').locator('video').waitFor({state:'attached',timeout:30000});
  await page.frameLocator('iframe').getByRole('button',{name:/Play/i}).first().click();
  await expect.poll(()=>page.frameLocator('iframe').locator('video').evaluate(video=>video.currentTime),{timeout:30000}).toBeGreaterThan(0.3);
  await page.locator('iframe').screenshot({path:resolve(output,'vimeo-player.png')});
  await press('Close video');
  await play.nth(2).click();
  await expect.poll(()=>page.locator('video').evaluate(video=>video.readyState),{timeout:30000}).toBeGreaterThan(1);
  await page.locator('video').evaluate(video=>{void video.play().catch(()=>{});});
  const time = await page.locator('video').evaluate(video=>video.currentTime);
  await expect.poll(()=>page.locator('video').evaluate(video=>video.currentTime)).toBeGreaterThan(time+0.3);
  await page.locator('video').screenshot({path:resolve(output,'direct-video.png')});
  await press('Close video');
  await press('Start exercise');
  await expect(picture).toBeVisible();
  await picture.click();
  await press('Close enlarged demonstration');
  await expect(page.getByText('Close picture',{exact:true})).not.toBeVisible();
  await expect(page.getByRole('button',{name:'Pause exercise'})).toBeVisible();
  await picture.scrollIntoViewIfNeeded();
  await page.screenshot({path:resolve(output,'patient-active-exercise.png'),fullPage:true});
  assert(mediaReads>=2);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({pictures:true,enlarge:true,retry:true,upcomingAssignment:true,videoPlayback:true,activeExercise:true,layouts:sizes,errors}));
} finally {
  await browser?.close();
  await new Promise(done=>server.close(done));
}
