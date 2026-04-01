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

/** Delete a project via API (best-effort, never throws). */
async function deleteProject(
  request: APIRequestContext,
  projectId: string,
): Promise<void> {
  try {
    await request.delete(`/api/projects/${projectId}`, {
      headers: AUTH_HEADERS,
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
        page.locator(`text=${project.title}`).first(),
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

      // 6. Delete the project
      const delRes = await request.delete(`/api/projects/${projectId}`, {
        headers: AUTH_HEADERS,
      })
      expect(delRes.ok()).toBeTruthy()
      projectId = undefined // already cleaned up

      // 7. Verify it's gone from the list
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
        page.locator('text=Chapter One').first(),
      ).toBeVisible({ timeout: 10_000 })

      // Click the chapter to expand, then look for the scene
      await page.locator('text=Chapter One').first().click()
      await page.waitForTimeout(500)

      // The scene should be visible (may already be visible if outline auto-expands)
      await expect(
        page.locator('text=Opening Scene').first(),
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
        page.locator('text=Captain Aria').first(),
      ).toBeVisible({ timeout: 10_000 })
    } finally {
      if (projectId) await deleteProject(request, projectId)
    }
  })

  // ── e) Dashboard API ─────────────────────────────────────────────────
  test('projects API returns valid response', async ({ request }) => {
    const res = await request.get('/api/projects', { headers: AUTH_HEADERS })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.projects).toBeDefined()
    expect(Array.isArray(body.projects)).toBeTruthy()
    expect(typeof body.total).toBe('number')
  })

  // ── f) JSON export ──────────────────────────────────────────────────
  test('JSON export includes all project data', async ({ request }) => {
    let projectId: string | undefined

    try {
      // 1. Create project with content and story objects
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
      const contentHtml = '<p>The sun set over the <strong>ancient</strong> city.</p>'
      const saveRes = await request.post(`/api/nodes/${scene.id}/content`, {
        headers: AUTH_HEADERS,
        data: { content: contentHtml },
      })
      expect(saveRes.status()).toBe(201)

      // 4. Add a story object
      const charRes = await request.post(
        `/api/projects/${projectId}/story-objects`,
        {
          headers: AUTH_HEADERS,
          data: {
            type: 'CHARACTER',
            name: 'Elena',
            description: 'A wandering scholar',
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
      const exported = await exportRes.json()

      // 6. Verify export structure
      expect(exported.exportVersion).toBe(1)
      expect(exported.exportedAt).toBeDefined()

      // Project metadata
      expect(exported.project.id).toBe(projectId)
      expect(exported.project.title).toBe(project.title)
      expect(exported.project.author).toBe('E2E Bot')
      expect(exported.project.genre).toBe('Test')

      // Structure nodes: chapter + scene
      expect(exported.structureNodes.length).toBe(2)
      const expChapter = exported.structureNodes.find(
        (n: { type: string }) => n.type === 'CHAPTER',
      )
      const expScene = exported.structureNodes.find(
        (n: { type: string }) => n.type === 'SCENE',
      )
      expect(expChapter).toBeDefined()
      expect(expChapter.title).toBe('Export Chapter')
      expect(expScene).toBeDefined()
      expect(expScene.title).toBe('Export Scene')
      expect(expScene.parentId).toBe(expChapter.id)

      // Content versions
      expect(exported.contentVersions.length).toBeGreaterThanOrEqual(1)
      const sceneContent = exported.contentVersions.find(
        (v: { nodeId: string }) => v.nodeId === scene.id,
      )
      expect(sceneContent).toBeDefined()
      expect(sceneContent.content).toContain('ancient')

      // Story objects
      expect(exported.storyObjects.length).toBe(1)
      expect(exported.storyObjects[0].name).toBe('Elena')
      expect(exported.storyObjects[0].type).toBe('CHARACTER')
      expect(exported.storyObjects[0].role).toBe('Protagonist')

      // Arrays exist (may be empty for this test project)
      expect(Array.isArray(exported.annotations)).toBeTruthy()
      expect(Array.isArray(exported.relationships)).toBeTruthy()
      expect(Array.isArray(exported.chatHistory)).toBeTruthy()
    } finally {
      if (projectId) await deleteProject(request, projectId)
    }
  })

  // ── g) Manuscript export ────────────────────────────────────────────
  test('manuscript export produces valid markdown', async ({ request }) => {
    let projectId: string | undefined

    try {
      // 1. Create project with content
      const project = await createProject(request, 'manuscript-export')
      projectId = project.id

      const chapterRes = await request.post(
        `/api/projects/${projectId}/nodes`,
        {
          headers: AUTH_HEADERS,
          data: { type: 'CHAPTER', title: 'First Light', orderIndex: 0 },
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
            title: 'Dawn',
            parentId: chapter.id,
            orderIndex: 0,
          },
        },
      )
      expect(sceneRes.status()).toBe(201)
      const scene = await sceneRes.json()

      await request.post(`/api/nodes/${scene.id}/content`, {
        headers: AUTH_HEADERS,
        data: { content: '<p>Morning light crept through the curtains.</p>' },
      })

      // 2. Export as manuscript
      const exportRes = await request.get(
        `/api/projects/${projectId}/export?type=manuscript`,
        { headers: AUTH_HEADERS },
      )
      expect(exportRes.ok()).toBeTruthy()

      const contentType = exportRes.headers()['content-type']
      expect(contentType).toContain('text/markdown')

      const markdown = await exportRes.text()

      // 3. Verify markdown structure
      expect(markdown).toContain(`# ${project.title}`)
      expect(markdown).toContain('*by E2E Bot*')
      expect(markdown).toContain('## Chapter 1: First Light')
      expect(markdown).toContain('Morning light crept through the curtains.')

      // 4. Export with options disabled
      const noSynopsisRes = await request.get(
        `/api/projects/${projectId}/export?type=manuscript&chapterNumbering=false`,
        { headers: AUTH_HEADERS },
      )
      expect(noSynopsisRes.ok()).toBeTruthy()
      const mdNoNum = await noSynopsisRes.text()
      expect(mdNoNum).toContain('## First Light')
      expect(mdNoNum).not.toContain('Chapter 1:')
    } finally {
      if (projectId) await deleteProject(request, projectId)
    }
  })

  // ── h) Round-trip: export JSON, recreate from exported data ─────────
  test('round-trip: exported JSON can recreate a project', async ({
    request,
  }) => {
    let sourceId: string | undefined
    let cloneId: string | undefined

    try {
      // 1. Create source project with rich content
      const source = await createProject(request, 'round-trip-src')
      sourceId = source.id

      // Add chapter + scene + content
      const chRes = await request.post(
        `/api/projects/${sourceId}/nodes`,
        {
          headers: AUTH_HEADERS,
          data: { type: 'CHAPTER', title: 'The Beginning', orderIndex: 0 },
        },
      )
      const ch = await chRes.json()

      const scRes = await request.post(
        `/api/projects/${sourceId}/nodes`,
        {
          headers: AUTH_HEADERS,
          data: {
            type: 'SCENE',
            title: 'Arrival',
            parentId: ch.id,
            orderIndex: 0,
          },
        },
      )
      const sc = await scRes.json()

      await request.post(`/api/nodes/${sc.id}/content`, {
        headers: AUTH_HEADERS,
        data: { content: '<p>She stepped off the train into the fog.</p>' },
      })

      // Add story object
      await request.post(`/api/projects/${sourceId}/story-objects`, {
        headers: AUTH_HEADERS,
        data: {
          type: 'CHARACTER',
          name: 'Maya',
          description: 'A detective returning home',
          role: 'Protagonist',
        },
      })

      // 2. Export the source project
      const exportRes = await request.get(
        `/api/projects/${sourceId}/export?type=json`,
        { headers: AUTH_HEADERS },
      )
      expect(exportRes.ok()).toBeTruthy()
      const exported = await exportRes.json()

      // 3. Recreate from exported data
      const cloneRes = await request.post('/api/projects', {
        headers: AUTH_HEADERS,
        data: {
          title: exported.project.title + ' (clone)',
          author: exported.project.author,
          genre: exported.project.genre,
          projectType: exported.project.projectType,
        },
      })
      expect(cloneRes.status()).toBe(201)
      const clone = await cloneRes.json()
      cloneId = clone.id

      // Recreate structure: chapter first, then scene
      const idMap: Record<string, string> = {}
      for (const node of exported.structureNodes) {
        const createRes = await request.post(
          `/api/projects/${cloneId}/nodes`,
          {
            headers: AUTH_HEADERS,
            data: {
              type: node.type,
              title: node.title,
              synopsis: node.synopsis,
              orderIndex: node.orderIndex,
              parentId: node.parentId ? idMap[node.parentId] : undefined,
            },
          },
        )
        expect(createRes.status()).toBe(201)
        const created = await createRes.json()
        idMap[node.id] = created.id
      }

      // Recreate content
      for (const cv of exported.contentVersions) {
        const newNodeId = idMap[cv.nodeId]
        if (newNodeId) {
          const saveRes = await request.post(
            `/api/nodes/${newNodeId}/content`,
            {
              headers: AUTH_HEADERS,
              data: { content: cv.content },
            },
          )
          expect(saveRes.status()).toBe(201)
        }
      }

      // Recreate story objects
      for (const obj of exported.storyObjects) {
        const soRes = await request.post(
          `/api/projects/${cloneId}/story-objects`,
          {
            headers: AUTH_HEADERS,
            data: {
              type: obj.type,
              name: obj.name,
              description: obj.description,
              notes: obj.notes,
              role: obj.role,
              tags: obj.tags,
            },
          },
        )
        expect(soRes.status()).toBe(201)
      }

      // 4. Export the clone and compare
      const cloneExportRes = await request.get(
        `/api/projects/${cloneId}/export?type=json`,
        { headers: AUTH_HEADERS },
      )
      expect(cloneExportRes.ok()).toBeTruthy()
      const cloneExported = await cloneExportRes.json()

      // Compare structure
      expect(cloneExported.structureNodes.length).toBe(
        exported.structureNodes.length,
      )
      expect(cloneExported.contentVersions.length).toBe(
        exported.contentVersions.length,
      )
      expect(cloneExported.storyObjects.length).toBe(
        exported.storyObjects.length,
      )

      // Verify content fidelity
      const srcContent = exported.contentVersions[0]?.content
      const cloneContent = cloneExported.contentVersions[0]?.content
      expect(cloneContent).toBe(srcContent)

      // Verify story object fidelity
      expect(cloneExported.storyObjects[0].name).toBe('Maya')
      expect(cloneExported.storyObjects[0].role).toBe('Protagonist')
    } finally {
      if (cloneId) await deleteProject(request, cloneId)
      if (sourceId) await deleteProject(request, sourceId)
    }
  })

  // ── i) Export-all (ZIP) ─────────────────────────────────────────────
  test('export-all returns a ZIP archive', async ({ request }) => {
    let projectId: string | undefined

    try {
      // Ensure at least one project exists
      const project = await createProject(request, 'export-all')
      projectId = project.id

      const res = await request.get('/api/projects/export-all', {
        headers: AUTH_HEADERS,
      })
      expect(res.ok()).toBeTruthy()

      const contentType = res.headers()['content-type']
      expect(contentType).toContain('application/zip')

      const disposition = res.headers()['content-disposition']
      expect(disposition).toContain('annie-export-')
      expect(disposition).toContain('.zip')

      // Verify body is non-empty
      const body = await res.body()
      expect(body.length).toBeGreaterThan(0)

      // ZIP files start with PK signature (0x504B)
      expect(body[0]).toBe(0x50) // P
      expect(body[1]).toBe(0x4b) // K
    } finally {
      if (projectId) await deleteProject(request, projectId)
    }
  })

  // ── j) Story bible export ───────────────────────────────────────────
  test('story bible export includes characters and locations', async ({
    request,
  }) => {
    let projectId: string | undefined

    try {
      const project = await createProject(request, 'bible-export')
      projectId = project.id

      // Add story objects
      await request.post(`/api/projects/${projectId}/story-objects`, {
        headers: AUTH_HEADERS,
        data: {
          type: 'CHARACTER',
          name: 'Commander Voss',
          description: 'Fleet commander',
          role: 'Antagonist',
        },
      })
      await request.post(`/api/projects/${projectId}/story-objects`, {
        headers: AUTH_HEADERS,
        data: {
          type: 'LOCATION',
          name: 'Station Omega',
          description: 'An orbital research station',
        },
      })

      const exportRes = await request.get(
        `/api/projects/${projectId}/export?type=story-bible`,
        { headers: AUTH_HEADERS },
      )
      expect(exportRes.ok()).toBeTruthy()

      const contentType = exportRes.headers()['content-type']
      expect(contentType).toContain('text/markdown')

      const markdown = await exportRes.text()
      expect(markdown).toContain('Story Bible:')
      expect(markdown).toContain('## Characters')
      expect(markdown).toContain('### Commander Voss')
      expect(markdown).toContain('**Role:** Antagonist')
      expect(markdown).toContain('## Locations')
      expect(markdown).toContain('### Station Omega')
    } finally {
      if (projectId) await deleteProject(request, projectId)
    }
  })

  // ── k) Per-chapter export ───────────────────────────────────────────
  test('per-chapter export returns separate chapter files', async ({
    request,
  }) => {
    let projectId: string | undefined

    try {
      const project = await createProject(request, 'chapter-export')
      projectId = project.id

      // Create two chapters with scenes
      for (let i = 0; i < 2; i++) {
        const chRes = await request.post(
          `/api/projects/${projectId}/nodes`,
          {
            headers: AUTH_HEADERS,
            data: {
              type: 'CHAPTER',
              title: `Chapter ${i + 1}`,
              orderIndex: i,
            },
          },
        )
        const ch = await chRes.json()

        const scRes = await request.post(
          `/api/projects/${projectId}/nodes`,
          {
            headers: AUTH_HEADERS,
            data: {
              type: 'SCENE',
              title: `Scene ${i + 1}`,
              parentId: ch.id,
              orderIndex: 0,
            },
          },
        )
        const sc = await scRes.json()

        await request.post(`/api/nodes/${sc.id}/content`, {
          headers: AUTH_HEADERS,
          data: { content: `<p>Content for chapter ${i + 1}.</p>` },
        })
      }

      const exportRes = await request.get(
        `/api/projects/${projectId}/export?type=chapters`,
        { headers: AUTH_HEADERS },
      )
      expect(exportRes.ok()).toBeTruthy()
      const body = await exportRes.json()

      expect(body.chapters).toBeDefined()
      expect(body.chapters.length).toBe(2)

      // Verify filenames are numbered and titled
      expect(body.chapters[0].filename).toMatch(/^01_Chapter_1\.md$/)
      expect(body.chapters[1].filename).toMatch(/^02_Chapter_2\.md$/)

      // Verify content
      expect(body.chapters[0].content).toContain('Content for chapter 1')
      expect(body.chapters[1].content).toContain('Content for chapter 2')
    } finally {
      if (projectId) await deleteProject(request, projectId)
    }
  })
})
