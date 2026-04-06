import { test, expect, Page } from '@playwright/test'

// ── Helpers ──────────────────────────────────────────────────────────────

/** Mock all API routes to return a specific status code and error body. */
async function mockAllApiWithStatus(
  page: Page,
  status: number,
  body: Record<string, string>,
) {
  await page.route('**/api/**', (route) => {
    // Allow health check through so the app can load
    if (route.request().url().includes('/api/health')) {
      return route.fulfill({ json: { status: 'ok' }, status: 200 })
    }
    // Allow auth/me through — the frontend checks this for user state
    if (route.request().url().includes('/api/auth/')) {
      return route.fulfill({
        json: { authenticated: false },
        status: 401,
      })
    }
    return route.fulfill({ json: body, status })
  })
}

/** Mock project-page API routes to all return an error status. */
async function mockProjectApiWithError(
  page: Page,
  projectId: string,
  status: number,
  errorBody: Record<string, string>,
) {
  await page.route(`**/api/projects/${projectId}`, (route) =>
    route.fulfill({ json: errorBody, status }),
  )
  await page.route(`**/api/projects/${projectId}/nodes`, (route) =>
    route.fulfill({ json: errorBody, status }),
  )
  await page.route(`**/api/projects/${projectId}/story-objects*`, (route) =>
    route.fulfill({ json: errorBody, status }),
  )
  await page.route(`**/api/projects/${projectId}/relationships*`, (route) =>
    route.fulfill({ json: errorBody, status }),
  )
  await page.route(`**/api/projects/${projectId}/search*`, (route) =>
    route.fulfill({ json: errorBody, status }),
  )
  await page.route(`**/api/projects/${projectId}/plot-thread-status*`, (route) =>
    route.fulfill({ json: errorBody, status }),
  )
  await page.route('**/api/ai-settings', (route) =>
    route.fulfill({
      json: { model: 'gemini-2.0-flash-001', apiKey: '' },
      status: 200,
    }),
  )
  await page.route('**/api/health', (route) =>
    route.fulfill({ json: { status: 'ok' }, status: 200 }),
  )
}

// ── Tests ────────────────────────────────────────────────────────────────

test.describe('E2E error scenarios — 401, 403, 500', () => {
  // ── 401 Unauthenticated ────────────────────────────────────────────

  test('401: unauthenticated API requests on dashboard show no project cards', async ({
    page,
  }) => {
    await mockAllApiWithStatus(page, 401, { error: 'Unauthorized' })

    await page.goto('/')
    await page.waitForSelector('main', { timeout: 20_000 })

    // The dashboard should not show project cards (data fetch returned 401)
    const projectCards = page.locator('.glass-card')
    const cardCount = await projectCards.count()
    expect(cardCount).toBe(0)
  })

  test('401: unauthenticated API on project page shows loading state, not project data', async ({
    page,
  }) => {
    await mockProjectApiWithError(page, 'proj-1', 401, {
      error: 'Unauthorized',
    })

    await page.goto('/project/proj-1')

    // When project fetch returns 401, the page stays in loading state
    // (spinner div without main element). Wait for it to stabilize.
    await page.waitForTimeout(3000)

    // The project page should NOT have rendered the full UI with main
    const mainCount = await page.locator('main').count()
    expect(mainCount).toBe(0)

    // A loading spinner should be visible instead
    await expect(page.locator('.animate-spin').first()).toBeVisible()
  })

  // ── 403 Forbidden ──────────────────────────────────────────────────

  test('403: forbidden project access shows loading state, not project data', async ({
    page,
  }) => {
    await mockProjectApiWithError(page, 'proj-forbidden', 403, {
      error: 'Forbidden',
    })

    await page.goto('/project/proj-forbidden')

    // When project fetch returns 403, the page stays in loading state
    await page.waitForTimeout(3000)

    // The project page should NOT have rendered the full UI
    const mainCount = await page.locator('main').count()
    expect(mainCount).toBe(0)

    // Loading spinner should be visible
    await expect(page.locator('.animate-spin').first()).toBeVisible()
  })

  test('403: forbidden share endpoint does not crash the project page', async ({
    page,
  }) => {
    // Set up a working project page but with forbidden share endpoint
    await page.route('**/api/projects/proj-1', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          json: {
            id: 'proj-1',
            title: 'Test Project',
            author: 'Author',
            genre: 'Fantasy',
            projectType: 'FICTION',
            universeId: null,
            wordCount: 1000,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-03-01T00:00:00Z',
          },
          status: 200,
        })
      }
      return route.continue()
    })
    await page.route('**/api/projects/proj-1/nodes', (route) =>
      route.fulfill({ json: { tree: [] }, status: 200 }),
    )
    await page.route('**/api/projects/proj-1/story-objects*', (route) =>
      route.fulfill({ json: { data: [], total: 0 }, status: 200 }),
    )
    await page.route('**/api/projects/proj-1/relationships*', (route) =>
      route.fulfill({ json: [], status: 200 }),
    )
    await page.route('**/api/projects/proj-1/search*', (route) =>
      route.fulfill({ json: { results: [] }, status: 200 }),
    )
    await page.route('**/api/projects/proj-1/plot-thread-status*', (route) =>
      route.fulfill({ json: [], status: 200 }),
    )
    await page.route('**/api/projects/proj-1/share', (route) =>
      route.fulfill({
        json: { error: 'Forbidden' },
        status: 403,
      }),
    )
    await page.route('**/api/ai-settings', (route) =>
      route.fulfill({
        json: { model: 'gemini-2.0-flash-001', apiKey: '' },
        status: 200,
      }),
    )
    await page.route('**/api/health', (route) =>
      route.fulfill({ json: { status: 'ok' }, status: 200 }),
    )

    await page.goto('/project/proj-1')
    await page.waitForSelector('main', { timeout: 20_000 })

    // Project page should have rendered successfully despite share API being forbidden
    await expect(page.locator('main')).toBeVisible()

    // Look for a share button — it may not exist on all views
    const shareButton = page.locator('button').filter({ hasText: /share/i })
    const shareButtonCount = await shareButton.count()
    if (shareButtonCount > 0) {
      await shareButton.first().click()
      await page.waitForTimeout(2000)

      // The page should still be functional (no crash)
      await expect(page.locator('main')).toBeVisible()
    }
  })

  // ── 500 Server Error ───────────────────────────────────────────────

  test('500: server error on dashboard shows empty state, no project cards', async ({
    page,
  }) => {
    await page.route('**/api/projects?*', (route) =>
      route.fulfill({
        json: { error: 'Internal server error' },
        status: 500,
      }),
    )
    await page.route('**/api/projects', (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({
          json: { error: 'Internal server error' },
          status: 500,
        })
      }
      return route.continue()
    })
    await page.route('**/api/sessions/heatmap', (route) =>
      route.fulfill({
        json: { error: 'Internal server error' },
        status: 500,
      }),
    )
    await page.route('**/api/health', (route) =>
      route.fulfill({ json: { status: 'ok' }, status: 200 }),
    )

    await page.goto('/')
    await page.waitForSelector('main', { timeout: 20_000 })

    // The page should still render (not a blank screen)
    await expect(page.locator('main')).toBeVisible()

    // Should not show project cards since the API returned 500
    const projectCards = page.locator('.glass-card')
    const cardCount = await projectCards.count()
    expect(cardCount).toBe(0)
  })

  test('500: server error on project page shows loading state, not project content', async ({
    page,
  }) => {
    await mockProjectApiWithError(page, 'proj-1', 500, {
      error: 'Internal server error',
    })

    await page.goto('/project/proj-1')

    // When project fetch returns 500, the page stays in loading state
    await page.waitForTimeout(3000)

    // The project page should NOT have rendered the full UI
    const mainCount = await page.locator('main').count()
    expect(mainCount).toBe(0)

    // A loading spinner should be visible
    await expect(page.locator('.animate-spin').first()).toBeVisible()
  })

  test('500: server error on content save does not crash focus mode editor', async ({
    page,
  }) => {
    const mockProject = {
      id: 'proj-1',
      title: 'Test Project',
      author: 'Author',
      genre: 'Fantasy',
      projectType: 'FICTION',
      wordCount: 1000,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-03-01T00:00:00Z',
    }
    const mockContent = {
      latest: {
        id: 'cv-1',
        nodeId: 'sc-1',
        content: '<p>Test content for editing.</p>',
        wordCount: 5,
        createdAt: '2026-03-01T00:00:00Z',
      },
      history: [],
    }
    const mockFocusContext = {
      context: {
        id: 'sc-1',
        projectId: 'proj-1',
        parentId: 'ch-1',
        type: 'SCENE',
        title: 'Test Scene',
        synopsis: '',
        status: 'DRAFT',
        orderIndex: 0,
        wordCount: 5,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-03-01T00:00:00Z',
        chapterTitle: 'Chapter One',
        prevScene: null,
        nextScene: null,
      },
      related: { CHARACTER: [], LOCATION: [] },
    }

    await page.route('**/api/focus/sc-1', (route) =>
      route.fulfill({ json: mockFocusContext, status: 200 }),
    )
    await page.route('**/api/projects/proj-1', (route) =>
      route.fulfill({ json: mockProject, status: 200 }),
    )
    // Register wildcard BEFORE specific route (Playwright routes are LIFO)
    await page.route('**/api/nodes/*/content', (route) => {
      const url = route.request().url()
      if (url.includes('/nodes/sc-1/content')) {
        return route.fallback()
      }
      if (route.request().method() === 'GET') {
        return route.fulfill({
          json: { latest: null, history: [] },
          status: 200,
        })
      }
      return route.fulfill({
        json: { error: 'Internal server error' },
        status: 500,
      })
    })
    // Specific route for sc-1: GET succeeds, POST (save) returns 500
    await page.route('**/api/nodes/sc-1/content', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          json: { error: 'Internal server error' },
          status: 500,
        })
      }
      return route.fulfill({ json: mockContent, status: 200 })
    })
    await page.route('**/api/nodes/*/annotations', (route) =>
      route.fulfill({ json: [], status: 200 }),
    )
    await page.route('**/api/ai-settings', (route) =>
      route.fulfill({
        json: { model: 'gemini-2.0-flash-001', apiKey: '' },
        status: 200,
      }),
    )

    await page.goto('/project/proj-1/scene/sc-1/focus')

    // Focus mode renders without a <main> initially, but the full page has one
    // Wait for the scene title to appear (indicates page has loaded)
    await expect(
      page.locator('text=Test Scene').first(),
    ).toBeVisible({ timeout: 20_000 })

    // Editor should load with content
    await expect(
      page.locator('text=Test content for editing').first(),
    ).toBeVisible({ timeout: 10_000 })

    // Type in the editor to trigger auto-save
    const editor = page.locator('.tiptap, .ProseMirror').first()
    await editor.waitFor({ state: 'visible', timeout: 5_000 })
    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' Additional text.')

    // Wait for debounced auto-save attempt (will fail with 500)
    await page.waitForTimeout(3000)

    // Editor should still be functional — content should still be visible
    await expect(
      page.locator('text=Test content for editing').first(),
    ).toBeVisible()

    // Scene title should still be visible (page didn't crash)
    await expect(
      page.locator('text=Test Scene').first(),
    ).toBeVisible()
  })
})
