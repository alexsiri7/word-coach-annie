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
  test('health check responds with valid status', async ({ request }) => {
    const res = await request.get('/api/health', { headers: AUTH_HEADERS })
    expect([200, 503]).toContain(res.status())
    const body = await res.json()
    expect(body.status).toMatch(/ok|degraded/)
    // db counts must not be exposed (information disclosure fix)
    expect(body.db).toBeUndefined()
    expect(body.projects).toBeUndefined()
    expect(body.users).toBeUndefined()
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

      // The outline auto-expands chapters by default; only click to expand if needed
      const openingScene = page.getByRole('treeitem', { name: 'Opening Scene' })
      if (!(await openingScene.isVisible())) {
        await page.getByRole('treeitem', { name: 'Chapter One' }).click()
      }
      await expect(openingScene).toBeVisible({ timeout: 5_000 })
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
      // Wait for the page to settle, then verify the archived project is not visible
      await expect(activeCards).toHaveCount(0, { timeout: 10_000 })

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

  // ── g) Beats survive save/load cycle (regression: an-9yp) ───────────
  test('beats survive save/load cycle', async ({ page, request }) => {
    let projectId: string | undefined

    try {
      // 1. Create project + chapter + scene
      const project = await createProject(request, 'beats-regression')
      projectId = project.id

      const chapterRes = await request.post(
        `/api/projects/${projectId}/nodes`,
        {
          headers: AUTH_HEADERS,
          data: { type: 'CHAPTER', title: 'Chapter One', orderIndex: 0 },
        },
      )
      expect(chapterRes.status()).toBe(201)
      const chapter = await chapterRes.json()

      const sceneRes = await request.post(
        `/api/projects/${projectId}/nodes`,
        {
          headers: AUTH_HEADERS,
          data: {
            type: 'SCENE',
            title: 'Beat Scene',
            parentId: chapter.id,
            orderIndex: 0,
          },
        },
      )
      expect(sceneRes.status()).toBe(201)
      const scene = await sceneRes.json()

      // 2. Save scene content that includes beat annotations
      const contentWithBeats =
        '<p>Opening paragraph.</p>' +
        '<!-- beat: ACTION: The hero leaps across the chasm -->' +
        '<p>Landing paragraph.</p>' +
        '<!-- beat: EMOTION: Relief washes over her -->' +
        '<p>Closing paragraph.</p>'

      const saveRes = await request.post(
        `/api/nodes/${scene.id}/content`,
        {
          headers: AUTH_HEADERS,
          data: { content: contentWithBeats },
        },
      )
      expect(saveRes.status()).toBe(201)

      // 3. Reload content via API and verify beats are preserved
      const readRes = await request.get(
        `/api/nodes/${scene.id}/content`,
        { headers: AUTH_HEADERS },
      )
      expect(readRes.ok()).toBeTruthy()
      const contentBody = await readRes.json()
      const savedContent: string = contentBody.latest.content

      expect(savedContent).toContain('<!-- beat:')
      expect(savedContent).toContain('ACTION: The hero leaps across the chasm')
      expect(savedContent).toContain('EMOTION: Relief washes over her')
      expect(savedContent).toContain('Opening paragraph.')
      expect(savedContent).toContain('Landing paragraph.')
      expect(savedContent).toContain('Closing paragraph.')

      // 4. Navigate to the scene editor and verify beats render in the UI
      await page.goto(`/project/${projectId}`)
      await page.waitForSelector('main', { timeout: 20_000 })

      // Wait for chapter to load in the tree
      await expect(
        page.getByRole('treeitem', { name: 'Chapter One' }),
      ).toBeVisible({ timeout: 10_000 })

      // The outline auto-expands chapters by default when nodes are loaded before mount.
      // Only click Chapter One to expand it if Beat Scene isn't already visible.
      const beatScene = page.getByRole('treeitem', { name: 'Beat Scene' })
      if (!(await beatScene.isVisible())) {
        await page.getByRole('treeitem', { name: 'Chapter One' }).click()
      }
      await beatScene.click()

      // The editor converts <!-- beat: ... --> comments to
      // <div data-type="beat-annotation"> nodes for display
      await expect(
        page.locator('.beat-annotation').first(),
      ).toBeVisible({ timeout: 15_000 })

      // Both beat annotations should be visible
      const beatAnnotations = page.locator('.beat-annotation')
      await expect(beatAnnotations).toHaveCount(2, { timeout: 5_000 })
    } finally {
      if (projectId) await deleteProject(request, projectId)
    }
  })

  // ── h) JSON export round-trip ──────────────────────────────────────
  test('JSON export contains all project data', async ({ request }) => {
    let projectId: string | undefined

    try {
      // 1. Create a project with content and story objects
      const project = await createProject(request, 'json-export')
      projectId = project.id

      // 2. Add a chapter with a scene
      const chapterRes = await request.post(
        `/api/projects/${projectId}/nodes`,
        {
          headers: AUTH_HEADERS,
          data: { type: 'CHAPTER', title: 'Export Chapter', orderIndex: 0 },
        },
      )
      expect(chapterRes.status()).toBe(201)
      const chapter = await chapterRes.json()

      const sceneRes = await request.post(
        `/api/projects/${projectId}/nodes`,
        {
          headers: AUTH_HEADERS,
          data: {
            type: 'SCENE',
            title: 'Export Scene',
            parentId: chapter.id,
            orderIndex: 0,
          },
        },
      )
      expect(sceneRes.status()).toBe(201)
      const scene = await sceneRes.json()

      // 3. Save content to the scene
      const contentHtml = '<p>The ship sailed into the harbor at dawn.</p>'
      const saveRes = await request.post(`/api/nodes/${scene.id}/content`, {
        headers: AUTH_HEADERS,
        data: { content: contentHtml },
      })
      expect(saveRes.status()).toBe(201)

      // 4. Add a character
      const charRes = await request.post(
        `/api/projects/${projectId}/story-objects`,
        {
          headers: AUTH_HEADERS,
          data: {
            type: 'CHARACTER',
            name: 'Export Hero',
            description: 'A test character for export',
            role: 'Protagonist',
          },
        },
      )
      expect(charRes.status()).toBe(201)

      // 5. Export as JSON
      const exportRes = await request.get(
        `/api/projects/${projectId}/export?type=json`,
        { headers: AUTH_HEADERS },
      )
      expect(exportRes.ok()).toBeTruthy()

      // Verify Content-Type and Content-Disposition headers
      const contentType = exportRes.headers()['content-type']
      expect(contentType).toContain('application/json')
      const disposition = exportRes.headers()['content-disposition']
      expect(disposition).toContain('attachment')
      expect(disposition).toContain('.json')

      // 6. Parse and validate the exported JSON
      const exported = await exportRes.json()
      expect(exported.exportVersion).toBe(1)
      expect(exported.exportedAt).toBeDefined()

      // Project metadata
      expect(exported.project.id).toBe(projectId)
      expect(exported.project.title).toBe(project.title)
      expect(exported.project.projectType).toBe('FICTION')

      // Structure nodes (chapter + scene)
      expect(exported.structureNodes.length).toBe(2)
      const expChapter = exported.structureNodes.find(
        (n: { type: string }) => n.type === 'CHAPTER',
      )
      expect(expChapter).toBeDefined()
      expect(expChapter.title).toBe('Export Chapter')

      const expScene = exported.structureNodes.find(
        (n: { type: string }) => n.type === 'SCENE',
      )
      expect(expScene).toBeDefined()
      expect(expScene.title).toBe('Export Scene')
      expect(expScene.parentId).toBe(chapter.id)

      // Content versions
      expect(exported.contentVersions.length).toBeGreaterThanOrEqual(1)
      const expContent = exported.contentVersions.find(
        (v: { nodeId: string }) => v.nodeId === scene.id,
      )
      expect(expContent).toBeDefined()
      expect(expContent.content).toContain('sailed into the harbor')

      // Story objects
      expect(exported.storyObjects.length).toBe(1)
      expect(exported.storyObjects[0].name).toBe('Export Hero')
      expect(exported.storyObjects[0].type).toBe('CHARACTER')
      expect(exported.storyObjects[0].role).toBe('Protagonist')

      // Arrays exist (may be empty)
      expect(Array.isArray(exported.annotations)).toBe(true)
      expect(Array.isArray(exported.relationships)).toBe(true)
      expect(Array.isArray(exported.chatHistory)).toBe(true)
    } finally {
      if (projectId) await deleteProject(request, projectId)
    }
  })

  // ── i) Manuscript export ───────────────────────────────────────────
  test('manuscript export returns valid markdown', async ({ request }) => {
    let projectId: string | undefined

    try {
      // 1. Create project with content
      const project = await createProject(request, 'manuscript-export')
      projectId = project.id

      const chapterRes = await request.post(
        `/api/projects/${projectId}/nodes`,
        {
          headers: AUTH_HEADERS,
          data: { type: 'CHAPTER', title: 'First Chapter', orderIndex: 0 },
        },
      )
      expect(chapterRes.status()).toBe(201)
      const chapter = await chapterRes.json()

      const sceneRes = await request.post(
        `/api/projects/${projectId}/nodes`,
        {
          headers: AUTH_HEADERS,
          data: {
            type: 'SCENE',
            title: 'Opening',
            parentId: chapter.id,
            orderIndex: 0,
          },
        },
      )
      expect(sceneRes.status()).toBe(201)
      const scene = await sceneRes.json()

      await request.post(`/api/nodes/${scene.id}/content`, {
        headers: AUTH_HEADERS,
        data: { content: '<p>It was a dark and stormy night.</p>' },
      })

      // 2. Export as manuscript (markdown)
      const exportRes = await request.get(
        `/api/projects/${projectId}/export?type=manuscript`,
        { headers: AUTH_HEADERS },
      )
      expect(exportRes.ok()).toBeTruthy()

      const contentType = exportRes.headers()['content-type']
      expect(contentType).toContain('text/markdown')
      const disposition = exportRes.headers()['content-disposition']
      expect(disposition).toContain('attachment')
      expect(disposition).toContain('.md')

      const markdown = await exportRes.text()

      // Verify manuscript structure
      expect(markdown).toContain(`# ${project.title}`)
      expect(markdown).toContain('## Chapter 1: First Chapter')
      expect(markdown).toContain('dark and stormy night')

      // 3. Export without chapter numbering
      const noNumRes = await request.get(
        `/api/projects/${projectId}/export?type=manuscript&chapterNumbering=false`,
        { headers: AUTH_HEADERS },
      )
      expect(noNumRes.ok()).toBeTruthy()
      const noNumMd = await noNumRes.text()
      expect(noNumMd).toContain('## First Chapter')
      expect(noNumMd).not.toContain('Chapter 1:')
    } finally {
      if (projectId) await deleteProject(request, projectId)
    }
  })

  // ── j) Story bible export ──────────────────────────────────────────
  test('story bible export includes characters and locations', async ({
    request,
  }) => {
    let projectId: string | undefined

    try {
      const project = await createProject(request, 'bible-export')
      projectId = project.id

      // Add character and location
      await request.post(`/api/projects/${projectId}/story-objects`, {
        headers: AUTH_HEADERS,
        data: {
          type: 'CHARACTER',
          name: 'Detective Blake',
          description: 'Hard-boiled detective',
          role: 'Protagonist',
        },
      })
      await request.post(`/api/projects/${projectId}/story-objects`, {
        headers: AUTH_HEADERS,
        data: {
          type: 'LOCATION',
          name: 'Noir City',
          description: 'A rain-soaked metropolis',
        },
      })

      // Export story bible
      const exportRes = await request.get(
        `/api/projects/${projectId}/export?type=story-bible`,
        { headers: AUTH_HEADERS },
      )
      expect(exportRes.ok()).toBeTruthy()

      const contentType = exportRes.headers()['content-type']
      expect(contentType).toContain('text/markdown')

      const markdown = await exportRes.text()
      expect(markdown).toContain(`Story Bible: ${project.title}`)
      expect(markdown).toContain('## Characters')
      expect(markdown).toContain('### Detective Blake')
      expect(markdown).toContain('Hard-boiled detective')
      expect(markdown).toContain('**Role:** Protagonist')
      expect(markdown).toContain('## Locations')
      expect(markdown).toContain('### Noir City')
      expect(markdown).toContain('rain-soaked metropolis')
    } finally {
      if (projectId) await deleteProject(request, projectId)
    }
  })

  // ── k) Export-all ZIP ──────────────────────────────────────────────
  test('export-all returns a valid ZIP with project data', async ({
    request,
  }) => {
    let projectId: string | undefined

    try {
      const project = await createProject(request, 'export-all')
      projectId = project.id

      const exportRes = await request.get('/api/projects/export-all', {
        headers: AUTH_HEADERS,
      })
      expect(exportRes.ok()).toBeTruthy()

      const contentType = exportRes.headers()['content-type']
      expect(contentType).toContain('application/zip')
      const disposition = exportRes.headers()['content-disposition']
      expect(disposition).toContain('attachment')
      expect(disposition).toContain('annie-export-')
      expect(disposition).toContain('.zip')

      // Verify the response body is non-empty (valid ZIP)
      const body = await exportRes.body()
      expect(body.length).toBeGreaterThan(0)

      // ZIP magic bytes: PK\x03\x04
      expect(body[0]).toBe(0x50) // P
      expect(body[1]).toBe(0x4b) // K
    } finally {
      if (projectId) await deleteProject(request, projectId)
    }
  })

  // ── l-1) GDPR data export ──────────────────────────────────────────
  test('export-data returns zip for authenticated user', async ({ request }) => {
    const res = await request.get('/api/auth/export-data', { headers: AUTH_HEADERS })
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('application/zip')
  })

  test('export-data returns 401 for unauthenticated request', async ({ request }) => {
    const res = await request.get('/api/auth/export-data')
    expect(res.status()).toBe(401)
  })

  // ── l) JSON export → re-import round-trip ──────────────────────────
  test('JSON export data can be used to recreate a project', async ({
    request,
  }) => {
    let sourceProjectId: string | undefined
    let importedProjectId: string | undefined

    try {
      // 1. Create a rich source project
      const source = await createProject(request, 'round-trip-source')
      sourceProjectId = source.id

      // Add chapter + scene + content
      const chapterRes = await request.post(
        `/api/projects/${sourceProjectId}/nodes`,
        {
          headers: AUTH_HEADERS,
          data: { type: 'CHAPTER', title: 'Round Trip Chapter', orderIndex: 0 },
        },
      )
      expect(chapterRes.status()).toBe(201)
      const chapter = await chapterRes.json()

      const sceneRes = await request.post(
        `/api/projects/${sourceProjectId}/nodes`,
        {
          headers: AUTH_HEADERS,
          data: {
            type: 'SCENE',
            title: 'Round Trip Scene',
            parentId: chapter.id,
            orderIndex: 0,
          },
        },
      )
      expect(sceneRes.status()).toBe(201)
      const scene = await sceneRes.json()

      const contentRes = await request.post(`/api/nodes/${scene.id}/content`, {
        headers: AUTH_HEADERS,
        data: { content: '<p>Round-trip test content that must survive.</p>' },
      })
      expect(contentRes.status()).toBe(201)

      // Add story object
      const storyObjRes = await request.post(
        `/api/projects/${sourceProjectId}/story-objects`,
        {
          headers: AUTH_HEADERS,
          data: {
            type: 'CHARACTER',
            name: 'Round Trip Hero',
            description: 'Survives the export-import cycle',
          },
        },
      )
      expect(storyObjRes.status()).toBe(201)

      // 2. Export the project as JSON
      const exportRes = await request.get(
        `/api/projects/${sourceProjectId}/export?type=json`,
        { headers: AUTH_HEADERS },
      )
      expect(exportRes.ok()).toBeTruthy()
      const exported = await exportRes.json()

      // 3. Import using the dedicated import endpoint (handles all entities in one transaction)
      const importRes = await request.post('/api/projects/import', {
        headers: AUTH_HEADERS,
        data: exported,
      })
      expect(importRes.status()).toBe(201)
      const imported = await importRes.json()
      importedProjectId = imported.id

      // 5. Export the imported project and compare
      const reExportRes = await request.get(
        `/api/projects/${importedProjectId}/export?type=json`,
        { headers: AUTH_HEADERS },
      )
      expect(reExportRes.ok()).toBeTruthy()
      const reExported = await reExportRes.json()

      // Verify structural equivalence
      expect(reExported.structureNodes.length).toBe(
        exported.structureNodes.length,
      )
      expect(reExported.contentVersions.length).toBe(
        exported.contentVersions.length,
      )
      expect(reExported.storyObjects.length).toBe(
        exported.storyObjects.length,
      )

      // Verify content survived the round-trip
      const reExportedContent = reExported.contentVersions.find(
        (v: { content: string }) =>
          v.content.includes('Round-trip test content'),
      )
      expect(reExportedContent).toBeDefined()

      // Verify story object survived
      const reExportedChar = reExported.storyObjects.find(
        (o: { name: string }) => o.name === 'Round Trip Hero',
      )
      expect(reExportedChar).toBeDefined()
      expect(reExportedChar.description).toBe(
        'Survives the export-import cycle',
      )
    } finally {
      if (importedProjectId) await deleteProject(request, importedProjectId)
      if (sourceProjectId) await deleteProject(request, sourceProjectId)
    }
  })
})
