import { test, expect, Page } from '@playwright/test'
import sharp from 'sharp'

const PROJECT = {
  id: 'proj-1',
  title: 'The Amber Throne',
  author: 'Jane Doe',
  synopsis: '',
  genre: 'Fantasy',
  projectType: 'FICTION',
  universeId: null,
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-03-10T14:30:00Z',
}

const LOCATION = {
  id: 'so-3',
  projectId: 'proj-1',
  type: 'LOCATION',
  name: 'Sunstone Keep',
  description: 'The royal palace.',
  notes: '',
  role: null,
  tags: '',
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-02-20T10:00:00Z',
}

const SNAPSHOT = {
  id: 'snap-1',
  storyObjectId: 'so-3',
  build: 'a1b2c3d',
  takenAt: '2026-03-12T09:30:00Z',
  createdAt: '2026-03-12T09:31:00Z',
  sha256: 'sha',
  width: 800,
  height: 450,
  things: [
    { key: 'door', name: 'Great door', description: 'Oak, bound in iron.', kind: 'exit', box: { x: 300, y: 150, w: 120, h: 250 } },
  ],
  imageUrl: '/api/location-snapshots/snap-1/file',
}

/** The project editor with one location, and a snapshot API that keeps annotations in memory across reloads. */
async function mockApi(page: Page) {
  const annotations: Record<string, unknown>[] = []
  const png = await sharp({ create: { width: 800, height: 450, channels: 3, background: '#3b2a1e' } }).png().toBuffer()

  await page.route(url => /\/api\/projects\/proj-1\/?$/.test(url.pathname), route => route.fulfill({ json: PROJECT }))
  await page.route('**/api/projects/proj-1/nodes', route => route.fulfill({ json: { tree: [] } }))
  await page.route('**/api/projects/proj-1/outline', route => route.fulfill({ json: [] }))
  await page.route('**/api/projects/proj-1/story-objects*', route => route.fulfill({ json: { data: [LOCATION], total: 1 } }))
  await page.route('**/api/projects/proj-1/relationships*', route => route.fulfill({ json: [] }))
  await page.route('**/api/projects/proj-1/search*', route => route.fulfill({ json: { results: [] } }))
  await page.route('**/api/ai-settings', route => route.fulfill({ json: { model: '', apiKey: '' } }))
  await page.route('**/api/story-objects/so-3', route => route.fulfill({ json: { ...LOCATION, relationships: [], relatedBy: [] } }))
  await page.route('**/api/story-objects/so-3/images', route => route.fulfill({ json: { data: [] } }))
  await page.route('**/api/story-objects/so-3/snapshots', route =>
    route.fulfill({
      json: {
        data: [{ id: SNAPSHOT.id, build: SNAPSHOT.build, takenAt: SNAPSHOT.takenAt, createdAt: SNAPSHOT.createdAt, width: 800, height: 450, thingCount: 1 }],
        annotations,
      },
    })
  )
  await page.route('**/api/location-snapshots/snap-1', route => route.fulfill({ json: SNAPSHOT }))
  await page.route('**/api/location-snapshots/snap-1/file', route => route.fulfill({ body: png, contentType: 'image/png' }))
  await page.route('**/api/location-snapshots/snap-1/annotations', route => {
    const body = route.request().postDataJSON()
    expect(route.request().headers()['x-csrf-protection']).toBe('1')
    const annotation = {
      id: `sa-${annotations.length + 1}`,
      locationId: 'so-3',
      snapshotId: 'snap-1',
      thingKey: null,
      region: null,
      storyObjectId: null,
      status: 'open',
      ...body,
    }
    annotations.push(annotation)
    return route.fulfill({ json: annotation, status: 201 })
  })
}

async function openSnapshots(page: Page) {
  await page.goto('/project/proj-1')
  await page.waitForSelector('main', { timeout: 20_000 })
  const menuButton = page.locator('button[aria-label="Open sidebar menu"]')
  if (await menuButton.isVisible().catch(() => false)) await menuButton.click()
  await page.getByRole('tab', { name: 'Locations' }).click()
  await page.getByRole('button', { name: 'Sunstone Keep' }).click()
  await page.getByRole('tab', { name: 'Snapshots' }).click()
  await expect(page.locator('img[alt="Game snapshot"]')).toHaveJSProperty('complete', true)
}

test.describe('Location snapshots', () => {
  test('the author edits a description and circles a region, and both survive a reload', async ({ page }) => {
    await mockApi(page)
    await openSnapshots(page)

    await page.getByRole('button', { name: 'Great door' }).click()
    await page.locator('#thing-description').fill('Oak, bound in brass.')
    await page.getByRole('button', { name: 'Save request' }).click()
    await expect(page.getByText('Description of Great door')).toBeVisible()

    await page.getByRole('button', { name: 'Draw a rectangle' }).click()
    const overlay = await page.getByLabel('Snapshot overlay').boundingBox()
    await page.mouse.move(overlay!.x + overlay!.width * 0.1, overlay!.y + overlay!.height * 0.1)
    await page.mouse.down()
    await page.mouse.move(overlay!.x + overlay!.width * 0.3, overlay!.y + overlay!.height * 0.3, { steps: 5 })
    await page.mouse.up()
    await page.locator('#snapshot-note').fill('Add a window here.')
    await page.getByRole('button', { name: 'Save note' }).click()
    await expect(page.getByText('Add a window here.')).toBeVisible()

    await page.reload()
    await openSnapshots(page)
    await expect(page.getByText('Oak, bound in brass.')).toBeVisible()
    await expect(page.getByText('Add a window here.')).toBeVisible()
    await page.getByRole('button', { name: 'Great door' }).click()
    await expect(page.getByText('Changed in Annie, not in the game yet')).toBeVisible()
  })
})
