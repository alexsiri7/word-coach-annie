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

  // ── f) Sharing lifecycle ────────────────────────────────────────────
  test('sharing: add, list, update role, and revoke', async ({ request }) => {
    let projectId: string | undefined

    try {
      // 1. Create project
      const project = await createProject(request, 'sharing')
      projectId = project.id

      // 2. Share with a reader
      const shareRes = await request.post(
        `/api/projects/${projectId}/share`,
        {
          headers: AUTH_HEADERS,
          data: { email: 'reader@example.com', role: 'READER' },
        },
      )
      expect(shareRes.status()).toBe(201)
      const share = await shareRes.json()
      expect(share.email).toBe('reader@example.com')
      expect(share.role).toBe('READER')
      expect(share.id).toBeDefined()
      expect(share.createdAt).toBeDefined()

      // 3. List shares — should contain the one we just added
      const listRes = await request.get(
        `/api/projects/${projectId}/share`,
        { headers: AUTH_HEADERS },
      )
      expect(listRes.ok()).toBeTruthy()
      const listBody = await listRes.json()
      expect(listBody.shares).toHaveLength(1)
      expect(listBody.shares[0].email).toBe('reader@example.com')
      expect(listBody.shares[0].role).toBe('READER')

      // 4. Update role from READER to EDITOR
      const patchRes = await request.patch(
        `/api/projects/${projectId}/share`,
        {
          headers: AUTH_HEADERS,
          data: { email: 'reader@example.com', role: 'EDITOR' },
        },
      )
      expect(patchRes.ok()).toBeTruthy()
      const updated = await patchRes.json()
      expect(updated.role).toBe('EDITOR')

      // 5. Verify the role change via list
      const listRes2 = await request.get(
        `/api/projects/${projectId}/share`,
        { headers: AUTH_HEADERS },
      )
      const listBody2 = await listRes2.json()
      expect(listBody2.shares[0].role).toBe('EDITOR')

      // 6. Revoke access
      const delRes = await request.delete(
        `/api/projects/${projectId}/share`,
        {
          headers: AUTH_HEADERS,
          data: { email: 'reader@example.com' },
        },
      )
      expect(delRes.status()).toBe(204)

      // 7. List should now be empty
      const listRes3 = await request.get(
        `/api/projects/${projectId}/share`,
        { headers: AUTH_HEADERS },
      )
      const listBody3 = await listRes3.json()
      expect(listBody3.shares).toHaveLength(0)
    } finally {
      if (projectId) await deleteProject(request, projectId)
    }
  })

  // ── g) Sharing: multiple collaborators ──────────────────────────────
  test('sharing: add multiple collaborators with different roles', async ({
    request,
  }) => {
    let projectId: string | undefined

    try {
      const project = await createProject(request, 'multi-share')
      projectId = project.id

      // Add a reader and an editor
      const r1 = await request.post(`/api/projects/${projectId}/share`, {
        headers: AUTH_HEADERS,
        data: { email: 'alice@example.com', role: 'READER' },
      })
      expect(r1.status()).toBe(201)

      const r2 = await request.post(`/api/projects/${projectId}/share`, {
        headers: AUTH_HEADERS,
        data: { email: 'bob@example.com', role: 'EDITOR' },
      })
      expect(r2.status()).toBe(201)

      // List should show both
      const listRes = await request.get(
        `/api/projects/${projectId}/share`,
        { headers: AUTH_HEADERS },
      )
      const { shares } = await listRes.json()
      expect(shares).toHaveLength(2)

      const emails = shares.map((s: { email: string }) => s.email)
      expect(emails).toContain('alice@example.com')
      expect(emails).toContain('bob@example.com')

      const alice = shares.find(
        (s: { email: string }) => s.email === 'alice@example.com',
      )
      const bob = shares.find(
        (s: { email: string }) => s.email === 'bob@example.com',
      )
      expect(alice.role).toBe('READER')
      expect(bob.role).toBe('EDITOR')

      // Revoke one, the other remains
      await request.delete(`/api/projects/${projectId}/share`, {
        headers: AUTH_HEADERS,
        data: { email: 'alice@example.com' },
      })

      const listRes2 = await request.get(
        `/api/projects/${projectId}/share`,
        { headers: AUTH_HEADERS },
      )
      const body2 = await listRes2.json()
      expect(body2.shares).toHaveLength(1)
      expect(body2.shares[0].email).toBe('bob@example.com')
    } finally {
      if (projectId) await deleteProject(request, projectId)
    }
  })

  // ── h) Sharing: duplicate email returns 409 ─────────────────────────
  test('sharing: duplicate email returns 409 conflict', async ({
    request,
  }) => {
    let projectId: string | undefined

    try {
      const project = await createProject(request, 'dup-share')
      projectId = project.id

      // First share succeeds
      const r1 = await request.post(`/api/projects/${projectId}/share`, {
        headers: AUTH_HEADERS,
        data: { email: 'dup@example.com', role: 'READER' },
      })
      expect(r1.status()).toBe(201)

      // Duplicate returns 409
      const r2 = await request.post(`/api/projects/${projectId}/share`, {
        headers: AUTH_HEADERS,
        data: { email: 'dup@example.com', role: 'EDITOR' },
      })
      expect(r2.status()).toBe(409)
      const body = await r2.json()
      expect(body.error).toContain('Already shared')
    } finally {
      if (projectId) await deleteProject(request, projectId)
    }
  })

  // ── i) Sharing: invalid email returns 400 ───────────────────────────
  test('sharing: invalid email returns 400', async ({ request }) => {
    let projectId: string | undefined

    try {
      const project = await createProject(request, 'bad-email')
      projectId = project.id

      const res = await request.post(`/api/projects/${projectId}/share`, {
        headers: AUTH_HEADERS,
        data: { email: 'not-an-email', role: 'READER' },
      })
      expect(res.status()).toBe(400)
      const body = await res.json()
      expect(body.error).toContain('email')
    } finally {
      if (projectId) await deleteProject(request, projectId)
    }
  })

  // ── j) Sharing: email is case-insensitive ───────────────────────────
  test('sharing: email stored as lowercase', async ({ request }) => {
    let projectId: string | undefined

    try {
      const project = await createProject(request, 'case-email')
      projectId = project.id

      const res = await request.post(`/api/projects/${projectId}/share`, {
        headers: AUTH_HEADERS,
        data: { email: 'User@Example.COM', role: 'READER' },
      })
      expect(res.status()).toBe(201)
      const share = await res.json()
      expect(share.email).toBe('user@example.com')

      // Duplicate with different casing returns 409
      const r2 = await request.post(`/api/projects/${projectId}/share`, {
        headers: AUTH_HEADERS,
        data: { email: 'USER@EXAMPLE.COM', role: 'EDITOR' },
      })
      expect(r2.status()).toBe(409)
    } finally {
      if (projectId) await deleteProject(request, projectId)
    }
  })

  // ── k) Sharing: invalid role defaults to READER ─────────────────────
  test('sharing: invalid role defaults to READER', async ({ request }) => {
    let projectId: string | undefined

    try {
      const project = await createProject(request, 'bad-role')
      projectId = project.id

      const res = await request.post(`/api/projects/${projectId}/share`, {
        headers: AUTH_HEADERS,
        data: { email: 'fallback@example.com', role: 'ADMIN' },
      })
      expect(res.status()).toBe(201)
      const share = await res.json()
      expect(share.role).toBe('READER')
    } finally {
      if (projectId) await deleteProject(request, projectId)
    }
  })

  // ── l) Sharing: PATCH invalid role returns 400 ──────────────────────
  test('sharing: PATCH with invalid role returns 400', async ({
    request,
  }) => {
    let projectId: string | undefined

    try {
      const project = await createProject(request, 'patch-bad-role')
      projectId = project.id

      // Create a share first
      await request.post(`/api/projects/${projectId}/share`, {
        headers: AUTH_HEADERS,
        data: { email: 'patcher@example.com', role: 'READER' },
      })

      // PATCH with invalid role
      const res = await request.patch(`/api/projects/${projectId}/share`, {
        headers: AUTH_HEADERS,
        data: { email: 'patcher@example.com', role: 'ADMIN' },
      })
      expect(res.status()).toBe(400)
      const body = await res.json()
      expect(body.error).toContain('role')
    } finally {
      if (projectId) await deleteProject(request, projectId)
    }
  })

  // ── m) Sharing: PATCH non-existent share returns 404 ────────────────
  test('sharing: PATCH non-existent share returns 404', async ({
    request,
  }) => {
    let projectId: string | undefined

    try {
      const project = await createProject(request, 'patch-404')
      projectId = project.id

      const res = await request.patch(`/api/projects/${projectId}/share`, {
        headers: AUTH_HEADERS,
        data: { email: 'nobody@example.com', role: 'EDITOR' },
      })
      expect(res.status()).toBe(404)
    } finally {
      if (projectId) await deleteProject(request, projectId)
    }
  })

  // ── n) Sharing: cascade delete removes shares ───────────────────────
  test('sharing: deleting project removes all shares', async ({
    request,
  }) => {
    // Create project and add shares
    const project = await createProject(request, 'cascade')
    const projectId = project.id

    await request.post(`/api/projects/${projectId}/share`, {
      headers: AUTH_HEADERS,
      data: { email: 'cascade1@example.com', role: 'READER' },
    })
    await request.post(`/api/projects/${projectId}/share`, {
      headers: AUTH_HEADERS,
      data: { email: 'cascade2@example.com', role: 'EDITOR' },
    })

    // Verify shares exist
    const listRes = await request.get(`/api/projects/${projectId}/share`, {
      headers: AUTH_HEADERS,
    })
    const { shares } = await listRes.json()
    expect(shares).toHaveLength(2)

    // Delete the project — shares should cascade
    const delRes = await request.delete(`/api/projects/${projectId}`, {
      headers: AUTH_HEADERS,
    })
    expect(delRes.ok()).toBeTruthy()

    // Project is gone, so share endpoint should 403 or 404
    const listRes2 = await request.get(`/api/projects/${projectId}/share`, {
      headers: AUTH_HEADERS,
    })
    expect([403, 404]).toContain(listRes2.status())
  })
})
