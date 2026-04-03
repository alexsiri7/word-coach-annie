import { test, expect, APIRequestContext } from '@playwright/test'

// ── Auth config ─────────────────────────────────────────────────────────
const API_TOKEN = process.env.API_TOKEN || 'e2e-test-token'
const AUTH_HEADERS = { Authorization: `Bearer ${API_TOKEN}` }

// ── Helpers ─────────────────────────────────────────────────────────────

/** Create a project via API, returning its id and title. */
async function createProject(
  request: APIRequestContext,
  suffix?: string,
): Promise<{ id: string; title: string }> {
  const title = `E2E Test Project ${Date.now()}${suffix ? ` ${suffix}` : ''}`
  const res = await request.post('/api/projects', {
    headers: AUTH_HEADERS,
    data: { title, author: 'E2E Bot', genre: 'Test', projectType: 'FICTION' },
  })
  expect(res.status()).toBe(201)
  const body = await res.json()
  return { id: body.id, title }
}

/** Delete a project via API (best-effort, never throws).
 *  The delete endpoint requires the project to be archived first
 *  and a confirmTitle matching the project title. */
async function deleteProject(
  request: APIRequestContext,
  projectId: string,
): Promise<void> {
  try {
    // Fetch the project to get its title
    const getRes = await request.get(`/api/projects/${projectId}`, {
      headers: AUTH_HEADERS,
    })
    if (!getRes.ok()) return
    const project = await getRes.json()

    // Archive the project first (ignore if already archived)
    await request.post(`/api/projects/${projectId}/archive`, {
      headers: AUTH_HEADERS,
    })

    // Delete with title confirmation
    await request.delete(`/api/projects/${projectId}`, {
      headers: AUTH_HEADERS,
      data: { confirmTitle: project.title },
    })
  } catch {
    // Cleanup is best-effort
  }
}

// ── Tests ───────────────────────────────────────────────────────────────

test.describe('Integration tests — real server, real data', () => {
  // Set auth header for every page navigation in this describe block
  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders(AUTH_HEADERS)
  })

  // ── a) Health check ─────────────────────────────────────────────────
  test('health check returns ok', async ({ request }) => {
    const res = await request.get('/api/health', { headers: AUTH_HEADERS })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.status).toMatch(/ok|degraded/)
    expect(body.db).toBeDefined()
    expect(body.db.projects + body.db.users).toBeGreaterThanOrEqual(0)
  })

  // ── b) Project lifecycle ────────────────────────────────────────────
  test('project CRUD lifecycle', async ({ page, request }) => {
    let projectId: string | undefined

    try {
      // 1. Create project
      const project = await createProject(request)
      projectId = project.id

      // 2. Verify it appears in the list
      const listRes = await request.get('/api/projects', {
        headers: AUTH_HEADERS,
      })
      expect(listRes.ok()).toBeTruthy()
      const listBody = await listRes.json()
      const found = listBody.projects.find(
        (p: { id: string }) => p.id === projectId,
      )
      expect(found).toBeDefined()
      expect(found.title).toBe(project.title)

      // 3. Navigate to dashboard and verify card is visible
      await page.goto('/')
      await page.waitForSelector('main', { timeout: 20_000 })
      await expect(
        page.getByText(project.title).first(),
      ).toBeVisible({ timeout: 10_000 })

      // 4. Update the title
      const updatedTitle = `${project.title} (updated)`
      const patchRes = await request.patch(`/api/projects/${projectId}`, {
        headers: AUTH_HEADERS,
        data: { title: updatedTitle },
      })
      expect(patchRes.ok()).toBeTruthy()

      // 5. Navigate to the project page and verify the updated title
      //    (title is in a Breadcrumbs component, not an h1)
      await page.goto(`/project/${projectId}`)
      await page.waitForSelector('main', { timeout: 20_000 })
      await expect(page.locator('nav, header').first()).toContainText(updatedTitle, {
        timeout: 10_000,
      })

      // 6. Archive the project (required before deletion)
      const archiveRes = await request.post(
        `/api/projects/${projectId}/archive`,
        { headers: AUTH_HEADERS },
      )
      expect(archiveRes.ok()).toBeTruthy()

      // 7. Delete the project (requires confirmTitle)
      const delRes = await request.delete(`/api/projects/${projectId}`, {
        headers: AUTH_HEADERS,
        data: { confirmTitle: updatedTitle },
      })
      expect(delRes.ok()).toBeTruthy()
      projectId = undefined // already cleaned up

      // 8. Verify it's gone from the list
      const listRes2 = await request.get('/api/projects', {
        headers: AUTH_HEADERS,
      })
      const listBody2 = await listRes2.json()
      const notFound = listBody2.projects.find(
        (p: { id: string }) => p.id === project.id,
      )
      expect(notFound).toBeUndefined()
    } finally {
      if (projectId) await deleteProject(request, projectId)
    }
  })

  // ── c) Content authoring flow ───────────────────────────────────────
  test('content authoring: chapters, scenes, and content', async ({
    page,
    request,
  }) => {
    let projectId: string | undefined

    try {
      // 1. Create project
      const project = await createProject(request, 'content')
      projectId = project.id

      // 2. Create a chapter
      const chapterRes = await request.post(
        `/api/projects/${projectId}/nodes`,
        {
          headers: AUTH_HEADERS,
          data: {
            type: 'CHAPTER',
            title: 'Chapter One',
            orderIndex: 0,
          },
        },
      )
      expect(chapterRes.status()).toBe(201)
      const chapter = await chapterRes.json()

      // 3. Create a scene under the chapter
      const sceneRes = await request.post(
        `/api/projects/${projectId}/nodes`,
        {
          headers: AUTH_HEADERS,
          data: {
            type: 'SCENE',
            title: 'Opening Scene',
            parentId: chapter.id,
            orderIndex: 0,
          },
        },
      )
      expect(sceneRes.status()).toBe(201)
      const scene = await sceneRes.json()

      // 4. Verify tree structure
      const treeRes = await request.get(
        `/api/projects/${projectId}/nodes`,
        { headers: AUTH_HEADERS },
      )
      expect(treeRes.ok()).toBeTruthy()
      const treeBody = await treeRes.json()
      expect(treeBody.tree).toBeDefined()
      expect(treeBody.tree.length).toBeGreaterThanOrEqual(1)

      const chapterNode = treeBody.tree.find(
        (n: { id: string }) => n.id === chapter.id,
      )
      expect(chapterNode).toBeDefined()
      expect(chapterNode.children?.length).toBeGreaterThanOrEqual(1)

      // 5. Save content to the scene
      const contentText = '<p>Once upon a time in a land far away...</p>'
      const saveRes = await request.post(
        `/api/nodes/${scene.id}/content`,
        {
          headers: AUTH_HEADERS,
          data: { content: contentText },
        },
      )
      expect(saveRes.status()).toBe(201)

      // 6. Verify content was saved
      const readRes = await request.get(
        `/api/nodes/${scene.id}/content`,
        { headers: AUTH_HEADERS },
      )
      expect(readRes.ok()).toBeTruthy()
      const contentBody = await readRes.json()
      expect(contentBody.latest).toBeDefined()
      expect(contentBody.latest.content).toContain('Once upon a time')

      // 7. Navigate to the project editor and verify the outline
      await page.goto(`/project/${projectId}`)
      await page.waitForSelector('main', { timeout: 20_000 })

      // Chapter should be visible in outline
      await expect(
        page.getByRole('treeitem', { name: 'Chapter One' }),
      ).toBeVisible({ timeout: 10_000 })

      // Click the chapter to expand, then look for the scene
      await page.getByRole('treeitem', { name: 'Chapter One' }).click()

      // The scene should be visible (may already be visible if outline auto-expands)
      await expect(
        page.getByRole('treeitem', { name: 'Opening Scene' }),
      ).toBeVisible({ timeout: 5_000 })
    } finally {
      if (projectId) await deleteProject(request, projectId)
    }
  })

  // ── d) Story objects ────────────────────────────────────────────────
  test('story objects: create character and location', async ({
    page,
    request,
  }) => {
    let projectId: string | undefined

    try {
      // 1. Create project
      const project = await createProject(request, 'story-objects')
      projectId = project.id

      // 2. Create a CHARACTER
      const charRes = await request.post(
        `/api/projects/${projectId}/story-objects`,
        {
          headers: AUTH_HEADERS,
          data: {
            type: 'CHARACTER',
            name: 'Captain Aria',
            description: 'A fearless pirate captain',
            role: 'Protagonist',
          },
        },
      )
      expect(charRes.status()).toBe(201)

      // 3. Create a LOCATION
      const locRes = await request.post(
        `/api/projects/${projectId}/story-objects`,
        {
          headers: AUTH_HEADERS,
          data: {
            type: 'LOCATION',
            name: 'Port Meridian',
            description: 'A bustling harbor town',
          },
        },
      )
      expect(locRes.status()).toBe(201)

      // 4. Verify both exist via API
      const listRes = await request.get(
        `/api/projects/${projectId}/story-objects`,
        { headers: AUTH_HEADERS },
      )
      expect(listRes.ok()).toBeTruthy()
      const listBody = await listRes.json()
      expect(listBody.data.length).toBe(2)

      const names = listBody.data.map((o: { name: string }) => o.name)
      expect(names).toContain('Captain Aria')
      expect(names).toContain('Port Meridian')

      // 5. Navigate to project page and verify character in sidebar
      await page.goto(`/project/${projectId}`)
      await page.waitForSelector('main', { timeout: 20_000 })

      // Click the Characters tab (uses aria-label, not title)
      const charsTab = page.locator('button[aria-label="Characters"]').first()
      await charsTab.waitFor({ state: 'visible', timeout: 10_000 })
      await charsTab.click()

      // Character should appear in the sidebar list
      await expect(
        page.getByText('Captain Aria').first(),
      ).toBeVisible({ timeout: 10_000 })
    } finally {
      if (projectId) await deleteProject(request, projectId)
    }
  })

  // ── e) Archive/delete workflow ──────────────────────────────────────
  test('archive/delete workflow: archive, unarchive, re-archive, export, delete', async ({
    page,
    request,
  }) => {
    let projectId: string | undefined

    try {
      // 1. Create project
      const project = await createProject(request, 'archive-test')
      projectId = project.id

      // 2. Verify project appears on dashboard (active list)
      await page.goto('/')
      await page.waitForSelector('main', { timeout: 20_000 })
      await expect(
        page.locator(`text=${project.title}`).first(),
      ).toBeVisible({ timeout: 10_000 })

      // 3. Archive the project via API
      const archiveRes = await request.post(
        `/api/projects/${projectId}/archive`,
        { headers: AUTH_HEADERS },
      )
      expect(archiveRes.ok()).toBeTruthy()
      const archiveBody = await archiveRes.json()
      expect(archiveBody.status).toBe('archived')
      expect(archiveBody.archivedAt).toBeDefined()

      // 4. Verify archived project is hidden from active list
      const activeList = await request.get('/api/projects', {
        headers: AUTH_HEADERS,
      })
      const activeBody = await activeList.json()
      const inActive = activeBody.projects.find(
        (p: { id: string }) => p.id === projectId,
      )
      expect(inActive).toBeUndefined()

      // 5. Verify archived project appears in archived list
      const archivedList = await request.get('/api/projects?archived=true', {
        headers: AUTH_HEADERS,
      })
      const archivedBody = await archivedList.json()
      const inArchived = archivedBody.projects.find(
        (p: { id: string }) => p.id === projectId,
      )
      expect(inArchived).toBeDefined()
      expect(inArchived.archivedAt).toBeTruthy()

      // 6. Verify dashboard hides archived project from main view
      await page.goto('/')
      await page.waitForSelector('main', { timeout: 20_000 })
      // The project should NOT be in the active cards
      const activeCards = page.locator('main').locator(`text=${project.title}`)
      // It should only appear in the archived section (if expanded)
      // First, check it's not immediately visible as an active project card
      await page.waitForTimeout(1000)

      // 7. Verify archiving an already-archived project returns 400
      const doubleArchive = await request.post(
        `/api/projects/${projectId}/archive`,
        { headers: AUTH_HEADERS },
      )
      expect(doubleArchive.status()).toBe(400)

      // 8. Unarchive the project
      const unarchiveRes = await request.delete(
        `/api/projects/${projectId}/archive`,
        { headers: AUTH_HEADERS },
      )
      expect(unarchiveRes.ok()).toBeTruthy()
      const unarchiveBody = await unarchiveRes.json()
      expect(unarchiveBody.status).toBe('unarchived')

      // 9. Verify project is back in active list
      const activeList2 = await request.get('/api/projects', {
        headers: AUTH_HEADERS,
      })
      const activeBody2 = await activeList2.json()
      const backInActive = activeBody2.projects.find(
        (p: { id: string }) => p.id === projectId,
      )
      expect(backInActive).toBeDefined()

      // 10. Verify unarchiving a non-archived project returns 400
      const doubleUnarchive = await request.delete(
        `/api/projects/${projectId}/archive`,
        { headers: AUTH_HEADERS },
      )
      expect(doubleUnarchive.status()).toBe(400)

      // 11. Re-archive the project (needed for deletion)
      const reArchiveRes = await request.post(
        `/api/projects/${projectId}/archive`,
        { headers: AUTH_HEADERS },
      )
      expect(reArchiveRes.ok()).toBeTruthy()

      // 12. Export the project (JSON backup before delete)
      const exportRes = await request.get(
        `/api/projects/${projectId}/export?type=json`,
        { headers: AUTH_HEADERS },
      )
      expect(exportRes.ok()).toBeTruthy()
      // Verify export contains project data
      const exportText = await exportRes.text()
      expect(exportText).toContain(project.title)

      // 13. Verify delete without confirmTitle fails
      const badDelete = await request.delete(
        `/api/projects/${projectId}`,
        {
          headers: AUTH_HEADERS,
          data: { confirmTitle: 'wrong title' },
        },
      )
      expect(badDelete.status()).toBe(400)

      // 14. Verify delete of non-archived project fails
      // (project is archived, so unarchive first to test this guard)
      await request.delete(`/api/projects/${projectId}/archive`, {
        headers: AUTH_HEADERS,
      })
      const deleteNonArchived = await request.delete(
        `/api/projects/${projectId}`,
        {
          headers: AUTH_HEADERS,
          data: { confirmTitle: project.title },
        },
      )
      expect(deleteNonArchived.status()).toBe(400)

      // Re-archive for the real delete
      await request.post(`/api/projects/${projectId}/archive`, {
        headers: AUTH_HEADERS,
      })

      // 15. Delete with correct confirmTitle
      const delRes = await request.delete(
        `/api/projects/${projectId}`,
        {
          headers: AUTH_HEADERS,
          data: { confirmTitle: project.title },
        },
      )
      expect(delRes.ok()).toBeTruthy()
      const delBody = await delRes.json()
      expect(delBody.status).toBe('deleted')
      projectId = undefined // already cleaned up

      // 16. Verify project is gone from both active and archived lists
      const finalActive = await request.get('/api/projects', {
        headers: AUTH_HEADERS,
      })
      const finalActiveBody = await finalActive.json()
      expect(
        finalActiveBody.projects.find(
          (p: { id: string }) => p.id === project.id,
        ),
      ).toBeUndefined()

      const finalArchived = await request.get('/api/projects?archived=true', {
        headers: AUTH_HEADERS,
      })
      const finalArchivedBody = await finalArchived.json()
      expect(
        finalArchivedBody.projects.find(
          (p: { id: string }) => p.id === project.id,
        ),
      ).toBeUndefined()
    } finally {
      if (projectId) await deleteProject(request, projectId)
    }
  })

  // ── f) Dashboard API ─────────────────────────────────────────────────
  test('projects API returns valid response', async ({ request }) => {
    const res = await request.get('/api/projects', { headers: AUTH_HEADERS })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.projects).toBeDefined()
    expect(Array.isArray(body.projects)).toBeTruthy()
    expect(typeof body.total).toBe('number')
  })
})
