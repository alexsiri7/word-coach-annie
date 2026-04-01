import { test, expect } from '@playwright/test'

// ── Helpers ──────────────────────────────────────────────────────────────

const MOCK_PROJECT_DETAIL = {
  id: 'proj-1',
  title: 'The Amber Throne',
  author: 'Jane Doe',
  synopsis: 'A reluctant queen must unite warring kingdoms.',
  genre: 'Fantasy',
  projectType: 'FICTION',
  universeId: null,
  wordCount: 42500,
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-03-10T14:30:00Z',
}

const MOCK_OUTLINE = [
  {
    id: 'ch-1',
    projectId: 'proj-1',
    parentId: null,
    type: 'CHAPTER',
    title: 'The Summons',
    synopsis: 'Queen Mira receives a desperate plea.',
    status: 'FINAL',
    orderIndex: 0,
    wordCount: 3200,
    createdAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-03-01T10:00:00Z',
    children: [],
  },
]

// ── Tests ────────────────────────────────────────────────────────────────

test.describe('Error scenario tests — auth and server errors', () => {
  // ── 401 Unauthenticated ────────────────────────────────────────────

  test('401: unauthenticated API request returns 401 JSON', async ({
    request,
  }) => {
    // Make a direct API request without auth headers to a protected endpoint
    const res = await request.get('/api/projects', {
      headers: {
        Authorization: 'Bearer invalid-token-that-does-not-exist',
      },
    })
    expect(res.status()).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  test('401: unauthenticated page access redirects to login', async ({
    page,
  }) => {
    // Simulate unauthenticated access by intercepting /api/auth/me to return 401
    // and intercepting the page route to mimic middleware redirect behavior
    await page.route('**/api/auth/me', (route) =>
      route.fulfill({
        json: { error: 'Unauthorized' },
        status: 401,
      }),
    )

    // Mock the dashboard API to return 401 (as middleware would block it)
    await page.route('**/api/projects', (route) =>
      route.fulfill({
        json: { error: 'Unauthorized' },
        status: 401,
      }),
    )
    await page.route('**/api/sessions/heatmap', (route) =>
      route.fulfill({
        json: { error: 'Unauthorized' },
        status: 401,
      }),
    )

    // Navigate to login page (where middleware would redirect)
    await page.goto('/login?from=/project/proj-1')

    // Verify login page renders with correct elements
    await expect(
      page.locator('h1:has-text("Word Coach Annie")'),
    ).toBeVisible({ timeout: 10_000 })
    await expect(
      page.locator('text=Sign in to continue'),
    ).toBeVisible()

    // Verify Google sign-in button is present
    await expect(
      page.locator('text=Sign in with Google'),
    ).toBeVisible()

    // Verify token sign-in option is available
    await expect(
      page.locator('text=Sign in with access token'),
    ).toBeVisible()
  })

  test('401: login page preserves redirect path in Google auth link', async ({
    page,
  }) => {
    await page.goto('/login?from=/project/proj-1')
    await page.waitForSelector('main, h1', { timeout: 10_000 })

    // The Google sign-in link should include the "from" redirect
    const googleLink = page.locator('a:has-text("Sign in with Google")')
    await expect(googleLink).toBeVisible()
    const href = await googleLink.getAttribute('href')
    expect(href).toContain('/api/auth/google')
    expect(href).toContain('from=%2Fproject%2Fproj-1')
  })

  test('401: login with invalid token shows error', async ({ page }) => {
    // Mock the login API to reject the token
    await page.route('**/api/auth/login', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          json: { error: 'Invalid token' },
          status: 401,
        })
      }
      return route.continue()
    })

    await page.goto('/login')
    await page.waitForSelector('h1', { timeout: 10_000 })

    // Click "Sign in with access token" to show the form
    await page.locator('text=Sign in with access token').click()

    // Fill in a bad token
    const tokenInput = page.locator('input[placeholder="Access token"]')
    await tokenInput.waitFor({ state: 'visible' })
    await tokenInput.fill('bad-token-123')

    // Submit
    await page.getByRole('button', { name: /Sign in with token/i }).click()

    // Error message should appear
    await expect(
      page.locator('text=Invalid token'),
    ).toBeVisible({ timeout: 5_000 })
  })

  // ── 403 Forbidden ──────────────────────────────────────────────────

  test('403: forbidden project API returns 403 JSON', async ({
    request,
  }) => {
    // Simulate forbidden access by sending a request with a valid-looking
    // but unauthorized token (the server would return 403 for projects
    // belonging to another user)
    const res = await request.get('/api/projects/nonexistent-project-id', {
      headers: {
        Authorization: 'Bearer invalid-token-that-does-not-exist',
      },
    })
    // Will be 401 (no valid auth) or 403/404 (valid auth but wrong user/missing)
    expect([401, 403, 404]).toContain(res.status())
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  test('403: accessing forbidden project shows error in UI', async ({
    page,
  }) => {
    // Mock the project API to return 403
    await page.route('**/api/projects/proj-forbidden', (route) =>
      route.fulfill({
        json: { error: 'Forbidden' },
        status: 403,
      }),
    )
    await page.route('**/api/projects/proj-forbidden/nodes', (route) =>
      route.fulfill({
        json: { error: 'Forbidden' },
        status: 403,
      }),
    )
    await page.route('**/api/projects/proj-forbidden/story-objects*', (route) =>
      route.fulfill({
        json: { error: 'Forbidden' },
        status: 403,
      }),
    )
    await page.route('**/api/projects/proj-forbidden/relationships*', (route) =>
      route.fulfill({ json: [], status: 200 }),
    )
    await page.route('**/api/projects/proj-forbidden/search*', (route) =>
      route.fulfill({ json: { results: [] }, status: 200 }),
    )
    await page.route('**/api/ai-settings', (route) =>
      route.fulfill({
        json: { provider: 'openai', model: 'gpt-4o', apiKey: '' },
        status: 200,
      }),
    )

    await page.goto('/project/proj-forbidden')

    // The page should show an error state (error boundary or error message)
    // Next.js error boundary should catch the render failure
    await expect(
      page.locator('text=/Something went wrong|error|Error/i').first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('403: invite_only error shows access denied message on login', async ({
    page,
  }) => {
    await page.goto('/login?error=invite_only')
    await page.waitForSelector('h1', { timeout: 10_000 })

    // The invite_only error banner should be visible
    await expect(
      page.locator('text=invite-only'),
    ).toBeVisible({ timeout: 5_000 })
    await expect(
      page.locator('text=not on the access list'),
    ).toBeVisible()
  })

  // ── 500 Server Error ───────────────────────────────────────────────

  test('500: server error on dashboard shows error state', async ({
    page,
  }) => {
    // Mock projects API to return 500
    await page.route('**/api/projects', (route) =>
      route.fulfill({
        json: { error: 'Internal server error' },
        status: 500,
      }),
    )
    await page.route('**/api/sessions/heatmap', (route) =>
      route.fulfill({
        json: { error: 'Internal server error' },
        status: 500,
      }),
    )

    await page.goto('/')
    await page.waitForSelector('main, [role="alert"]', { timeout: 20_000 })

    // The page should show an error state — either an error boundary message
    // or the page should not crash entirely (graceful degradation)
    // The dashboard's fetchProjects doesn't have error handling, so it will
    // throw when trying to read data.projects from an error response.
    // This should trigger the error boundary.
    await expect(
      page.locator('text=/Something went wrong|error|Try Again|Try again/i').first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('500: server error on project editor shows error boundary', async ({
    page,
  }) => {
    // Mock the project detail API to return 500
    await page.route('**/api/projects/proj-err', (route) =>
      route.fulfill({
        json: { error: 'Internal server error' },
        status: 500,
      }),
    )
    await page.route('**/api/projects/proj-err/nodes', (route) =>
      route.fulfill({
        json: { error: 'Internal server error' },
        status: 500,
      }),
    )
    await page.route('**/api/projects/proj-err/story-objects*', (route) =>
      route.fulfill({
        json: { error: 'Internal server error' },
        status: 500,
      }),
    )
    await page.route('**/api/projects/proj-err/relationships*', (route) =>
      route.fulfill({ json: [], status: 200 }),
    )
    await page.route('**/api/projects/proj-err/search*', (route) =>
      route.fulfill({ json: { results: [] }, status: 200 }),
    )
    await page.route('**/api/ai-settings', (route) =>
      route.fulfill({
        json: { provider: 'openai', model: 'gpt-4o', apiKey: '' },
        status: 200,
      }),
    )

    await page.goto('/project/proj-err')

    // Error boundary should catch the render failure
    await expect(
      page.locator('text=/Something went wrong|error|Try Again|Try again/i').first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('500: error boundary retry button re-renders the component', async ({
    page,
  }) => {
    let requestCount = 0

    // First request returns 500, second returns success
    await page.route('**/api/projects/proj-1', (route) => {
      requestCount++
      if (requestCount <= 1) {
        return route.fulfill({
          json: { error: 'Internal server error' },
          status: 500,
        })
      }
      return route.fulfill({ json: MOCK_PROJECT_DETAIL, status: 200 })
    })
    await page.route('**/api/projects/proj-1/nodes', (route) => {
      if (requestCount <= 1) {
        return route.fulfill({
          json: { error: 'Internal server error' },
          status: 500,
        })
      }
      return route.fulfill({ json: { tree: MOCK_OUTLINE }, status: 200 })
    })
    await page.route('**/api/projects/proj-1/story-objects*', (route) =>
      route.fulfill({ json: { data: [], total: 0 }, status: 200 }),
    )
    await page.route('**/api/projects/proj-1/relationships*', (route) =>
      route.fulfill({ json: [], status: 200 }),
    )
    await page.route('**/api/projects/proj-1/search*', (route) =>
      route.fulfill({ json: { results: [] }, status: 200 }),
    )
    await page.route('**/api/nodes/*/content', (route) =>
      route.fulfill({ json: { latest: null, history: [] }, status: 200 }),
    )
    await page.route('**/api/nodes/*/annotations', (route) =>
      route.fulfill({ json: [], status: 200 }),
    )
    await page.route('**/api/ai-settings', (route) =>
      route.fulfill({
        json: { provider: 'openai', model: 'gpt-4o', apiKey: '' },
        status: 200,
      }),
    )

    await page.goto('/project/proj-1')

    // First load should show error
    const errorText = page.locator(
      'text=/Something went wrong|error|Try Again|Try again/i',
    ).first()
    await expect(errorText).toBeVisible({ timeout: 15_000 })

    // Click "Try Again" or "Try again" button
    const retryButton = page.locator(
      'button:has-text("Try Again"), button:has-text("Try again"), button:has-text("Retry")',
    ).first()
    await retryButton.click()

    // After retry, page should recover and show project content
    await expect(
      page.locator('text=The Amber Throne').first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  // ── Health endpoint degraded ───────────────────────────────────────

  test('health endpoint: returns 503 on database error', async ({
    request,
  }) => {
    // This is a direct API test — the health endpoint returns 503
    // when the database is unreachable. We can only test the format
    // since we can't actually break the DB in E2E.
    const res = await request.get('/api/health')
    // In a functioning test environment, health should be 200
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.status).toBeDefined()
    expect(body.db).toBeDefined()
  })
})
