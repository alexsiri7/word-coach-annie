import { test, expect, Page } from '@playwright/test'

// ── Shared mock data (reused from visual.spec.ts patterns) ──────────────

const MOCK_PROJECTS = {
  projects: [
    {
      id: 'proj-1',
      title: 'The Amber Throne',
      author: 'Jane Doe',
      synopsis: 'A reluctant queen must unite warring kingdoms.',
      genre: 'Fantasy',
      projectType: 'FICTION',
      wordCount: 42500,
      nodeCount: 18,
      createdAt: '2026-01-15T10:00:00Z',
      updatedAt: '2026-03-10T14:30:00Z',
    },
  ],
  total: 1,
}

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
    children: [
      {
        id: 'sc-1',
        projectId: 'proj-1',
        parentId: 'ch-1',
        type: 'SCENE',
        title: 'Throne Room',
        synopsis: 'The messenger arrives.',
        status: 'FINAL',
        orderIndex: 0,
        wordCount: 1800,
        createdAt: '2026-01-15T10:00:00Z',
        updatedAt: '2026-03-01T10:00:00Z',
        children: [],
      },
    ],
  },
]

const MOCK_SCENE_CONTENT = {
  latest: {
    id: 'cv-1',
    nodeId: 'sc-1',
    content:
      '<p>The heavy oak doors groaned open, admitting a gust of winter wind.</p>',
    wordCount: 1800,
    createdAt: '2026-03-01T10:00:00Z',
  },
  history: [],
}

const MOCK_STORY_OBJECTS = {
  data: [
    {
      id: 'so-1',
      projectId: 'proj-1',
      type: 'CHARACTER',
      name: 'Queen Mira',
      description: 'Young ruler of the Southern Kingdom.',
      notes: 'Reluctant leader.',
      role: 'Protagonist',
      tags: 'royalty',
      source: 'project',
      createdAt: '2026-01-15T10:00:00Z',
      updatedAt: '2026-03-01T10:00:00Z',
    },
  ],
  total: 1,
}

const MOCK_FOCUS_CONTEXT = {
  context: {
    id: 'sc-1',
    projectId: 'proj-1',
    parentId: 'ch-1',
    type: 'SCENE',
    title: 'Throne Room',
    synopsis: 'The messenger arrives.',
    status: 'FINAL',
    orderIndex: 0,
    wordCount: 1800,
    createdAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-03-01T10:00:00Z',
    chapterTitle: 'The Summons',
    prevScene: null,
    nextScene: null,
  },
  related: {
    CHARACTER: [
      {
        id: 'so-1',
        name: 'Queen Mira',
        role: 'Protagonist',
        description: 'Young ruler.',
        notes: '',
      },
    ],
    LOCATION: [],
  },
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Mock the dashboard project-list API */
async function mockDashboardApi(
  page: Page,
  projects = MOCK_PROJECTS,
) {
  await page.route('**/api/projects?*', (route) =>
    route.fulfill({ json: projects, status: 200 }),
  )
  await page.route('**/api/projects', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: projects, status: 200 })
    }
    return route.continue()
  })
}

/** Mock the project editor APIs (detail, outline, story objects, etc.) */
async function mockProjectEditorApi(page: Page) {
  await page.route('**/api/projects/proj-1', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: MOCK_PROJECT_DETAIL, status: 200 })
    }
    return route.continue()
  })
  await page.route('**/api/projects/proj-1/nodes', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        json: { tree: MOCK_OUTLINE },
        status: 200,
      })
    }
    return route.continue()
  })
  await page.route('**/api/projects/proj-1/story-objects*', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: MOCK_STORY_OBJECTS, status: 200 })
    }
    return route.continue()
  })
  await page.route('**/api/projects/proj-1/relationships*', (route) =>
    route.fulfill({ json: [], status: 200 }),
  )
  await page.route('**/api/projects/proj-1/search*', (route) =>
    route.fulfill({ json: { results: [] }, status: 200 }),
  )
  // Register wildcard BEFORE specific route (Playwright routes are LIFO)
  await page.route('**/api/nodes/*/content', (route) => {
    const url = route.request().url()
    if (url.includes('/nodes/sc-1/content')) {
      return route.fallback()
    }
    if (route.request().method() === 'GET') {
      return route.fulfill({
        json: {
          latest: null,
          history: [],
        },
        status: 200,
      })
    }
    // Auto-save POST → accept silently
    return route.fulfill({ json: { ok: true }, status: 200 })
  })
  await page.route('**/api/nodes/sc-1/content', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: MOCK_SCENE_CONTENT, status: 200 })
    }
    return route.fulfill({ json: { ok: true }, status: 200 })
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
  await page.route('**/api/health', (route) =>
    route.fulfill({ json: { status: 'ok' }, status: 200 }),
  )
}

/** Mock the focus-mode API */
async function mockFocusModeApi(page: Page) {
  await page.route('**/api/focus/sc-1', (route) =>
    route.fulfill({ json: MOCK_FOCUS_CONTEXT, status: 200 }),
  )
  // Register wildcard BEFORE specific route (Playwright routes are LIFO)
  await page.route('**/api/nodes/*/content', (route) => {
    const url = route.request().url()
    // Let the specific sc-1 handler take precedence via fallthrough
    if (url.includes('/nodes/sc-1/content')) {
      return route.fallback()
    }
    if (route.request().method() === 'GET') {
      return route.fulfill({
        json: { latest: null, history: [] },
        status: 200,
      })
    }
    return route.fulfill({ json: { ok: true }, status: 200 })
  })
  await page.route('**/api/nodes/sc-1/content', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: MOCK_SCENE_CONTENT, status: 200 })
    }
    return route.fulfill({ json: { ok: true }, status: 200 })
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
}

// ── Tests ────────────────────────────────────────────────────────────────

test.describe('E2E smoke tests – critical user flows', () => {
  test('1. Create a project and verify it appears in the project list', async ({
    page,
  }) => {
    const createdProject = {
      id: 'proj-new',
      title: 'Smoke Test Novel',
      author: 'Test Author',
      synopsis: '',
      genre: 'Thriller',
      projectType: 'FICTION',
      wordCount: 0,
      nodeCount: 0,
      createdAt: '2026-03-15T10:00:00Z',
      updatedAt: '2026-03-15T10:00:00Z',
    }

    // Start with empty dashboard
    await mockDashboardApi(page, { projects: [], total: 0 })

    // Intercept POST /api/projects to return the new project
    await page.route('**/api/projects', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ json: createdProject, status: 200 })
      }
      return route.fulfill({
        json: { projects: [], total: 0 },
        status: 200,
      })
    })

    // Mock the project editor page the user will be redirected to
    await page.route('**/api/projects/proj-new', (route) =>
      route.fulfill({ json: createdProject, status: 200 }),
    )
    await page.route('**/api/projects/proj-new/nodes', (route) =>
      route.fulfill({ json: { tree: [] }, status: 200 }),
    )
    await page.route('**/api/projects/proj-new/story-objects*', (route) =>
      route.fulfill({ json: { data: [], total: 0 }, status: 200 }),
    )
    await page.route('**/api/projects/proj-new/relationships*', (route) =>
      route.fulfill({ json: [], status: 200 }),
    )
    await page.route('**/api/projects/proj-new/search*', (route) =>
      route.fulfill({ json: { results: [] }, status: 200 }),
    )
    await page.route('**/api/ai-settings', (route) =>
      route.fulfill({
        json: { model: 'gemini-2.0-flash-001', apiKey: '' },
        status: 200,
      }),
    )

    await page.goto('/')
    await page.waitForSelector('main', { timeout: 20_000 })

    // Click "Create Project" (empty-state CTA)
    await page.getByRole('button', { name: /Create Project/i }).click()

    // Fill in the project title
    const titleInput = page.locator('input[placeholder="My Novel"]')
    await titleInput.waitFor({ state: 'visible' })
    await titleInput.fill('Smoke Test Novel')

    // Fill in author
    await page.locator('input[placeholder="Your name"]').fill('Test Author')

    // Fill in genre
    await page
      .locator('input[placeholder*="Fantasy"]')
      .fill('Thriller')

    // Click Create button in the dialog
    await page.getByRole('button', { name: 'Create' }).click()

    // Should navigate to the new project editor page
    await page.waitForURL('**/project/proj-new', { timeout: 10_000 })

    // Verify we're on the project page with the title showing
    await expect(page.locator('h1')).toContainText('Smoke Test Novel')
  })

  test('2. Open a project, navigate outline, and click a scene', async ({
    page,
  }) => {
    await mockDashboardApi(page)
    await mockProjectEditorApi(page)

    // Navigate to dashboard and click the project card
    await page.goto('/')
    await page.waitForSelector('main', { timeout: 20_000 })

    // Click on "The Amber Throne" project card
    const projectCard = page.getByTestId('project-card').filter({ hasText: 'The Amber Throne' }).first()
    await projectCard.waitFor({ state: 'visible' })
    await projectCard.click()

    // Should navigate to /project/proj-1
    await page.waitForURL('**/project/proj-1', { timeout: 10_000 })

    // Verify the project title in header
    await expect(page.locator('h1')).toContainText('The Amber Throne')

    // The outline should show chapter "The Summons"
    const chapter = page.getByRole('treeitem', { name: 'The Summons' })
    await chapter.waitFor({ state: 'visible', timeout: 5_000 })

    // Click the chapter to expand it (may be collapsed on initial render)
    await chapter.click()

    // If clicking selected the chapter rather than expanding it, look for
    // an expand toggle (chevron) or try clicking again
    const scene = page.getByRole('treeitem', { name: 'Throne Room' })
    if (!(await scene.isVisible().catch(() => false))) {
      // Click the chapter text again to toggle expansion
      await chapter.click()
      await scene.waitFor({ state: 'visible', timeout: 5_000 })
    }

    await scene.waitFor({ state: 'visible', timeout: 5_000 })
    await scene.click()

    // The scene editor should load with content
    await expect(
      page.getByText('The heavy oak doors groaned open').first(),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('3. Focus mode – type in editor and verify auto-save fires', async ({
    page,
  }) => {
    await mockFocusModeApi(page)

    // Track auto-save POST calls
    const saveRequests: string[] = []
    await page.route('**/api/nodes/sc-1/content', (route) => {
      if (route.request().method() === 'POST') {
        saveRequests.push(route.request().postData() || '')
        return route.fulfill({ json: { ok: true }, status: 200 })
      }
      return route.fulfill({ json: MOCK_SCENE_CONTENT, status: 200 })
    })

    await page.goto('/project/proj-1/scene/sc-1/focus')
    await page.waitForSelector('main', { timeout: 20_000 })

    // Verify scene title is visible
    await expect(
      page.getByText('Throne Room').first(),
    ).toBeVisible({ timeout: 5_000 })

    // Verify initial content loaded
    await expect(
      page.getByText('The heavy oak doors groaned open').first(),
    ).toBeVisible({ timeout: 5_000 })

    // Find the tiptap editor and type into it
    const editor = page.locator('.tiptap, .ProseMirror').first()
    await editor.waitFor({ state: 'visible', timeout: 5_000 })
    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' The cold air bit at her cheeks.')

    // Wait for debounced auto-save to fire
    await expect.poll(() => saveRequests.length, { timeout: 5_000 }).toBeGreaterThan(0)
  })

  test('4. Story objects panel – create a character and verify it appears', async ({
    page,
  }) => {
    // Start with empty story objects so we can see the new one appear
    const emptyStoryObjects = { data: [], total: 0 }
    const createdCharacter = {
      id: 'so-new',
      projectId: 'proj-1',
      type: 'CHARACTER',
      name: 'Lord Ashford',
      description: '',
      notes: '',
      role: '',
      tags: '',
      source: 'project',
      createdAt: '2026-03-15T10:00:00Z',
      updatedAt: '2026-03-15T10:00:00Z',
    }

    let storyObjectsCreated = false

    await page.route('**/api/projects/proj-1', (route) =>
      route.fulfill({ json: MOCK_PROJECT_DETAIL, status: 200 }),
    )
    await page.route('**/api/projects/proj-1/nodes', (route) =>
      route.fulfill({ json: { tree: MOCK_OUTLINE }, status: 200 }),
    )
    await page.route('**/api/projects/proj-1/story-objects*', (route) => {
      if (route.request().method() === 'POST') {
        storyObjectsCreated = true
        return route.fulfill({ json: createdCharacter, status: 200 })
      }
      // After creation, return the new character in the list
      if (storyObjectsCreated) {
        return route.fulfill({
          json: { data: [createdCharacter], total: 1 },
          status: 200,
        })
      }
      return route.fulfill({ json: emptyStoryObjects, status: 200 })
    })
    await page.route('**/api/projects/proj-1/relationships*', (route) =>
      route.fulfill({ json: [], status: 200 }),
    )
    await page.route('**/api/projects/proj-1/search*', (route) =>
      route.fulfill({ json: { results: [] }, status: 200 }),
    )
    await page.route('**/api/nodes/*/content', (route) =>
      route.fulfill({
        json: { latest: null, history: [] },
        status: 200,
      }),
    )
    await page.route('**/api/nodes/*/annotations', (route) =>
      route.fulfill({ json: [], status: 200 }),
    )
    await page.route('**/api/ai-settings', (route) =>
      route.fulfill({
        json: { model: 'gemini-2.0-flash-001', apiKey: '' },
        status: 200,
      }),
    )

    await page.goto('/project/proj-1')
    await page.waitForSelector('main', { timeout: 20_000 })

    // Click the Characters tab (icon button with title="Characters")
    const charsTab = page.locator('button[title="Characters"]').first()
    await charsTab.waitFor({ state: 'visible', timeout: 5_000 })
    await charsTab.click()

    // Should show "No characters yet." empty state
    await expect(
      page.getByText('No characters yet').first(),
    ).toBeVisible({ timeout: 5_000 })

    // Click the "+" button to add a character (in the Characters header area)
    // The + button is in the header row next to "CHARACTERS"
    const addButton = page
      .locator('button')
      .filter({ has: page.locator('svg.lucide-plus') })
      .first()
    await addButton.click()

    // Fill in the character name in the dialog
    const nameInput = page.locator('input[placeholder="Name"]')
    await nameInput.waitFor({ state: 'visible' })
    await nameInput.fill('Lord Ashford')

    // Click Add
    await page.getByRole('button', { name: 'Add' }).click()

    // The new character should appear in the sidebar list
    await expect(
      page.getByText('Lord Ashford').first(),
    ).toBeVisible({ timeout: 5_000 })
  })

  test('5. Dashboard project card navigates to project editor', async ({
    page,
  }) => {
    await mockDashboardApi(page)
    await mockProjectEditorApi(page)

    await page.goto('/')
    await page.waitForSelector('main', { timeout: 20_000 })

    // Verify project card shows key info
    await expect(
      page.getByText('The Amber Throne').first(),
    ).toBeVisible()
    await expect(
      page.getByText('Fantasy').first(),
    ).toBeVisible()

    // Click the project card
    await page.locator('.glass-card').first().click()

    // Verify navigation to project editor
    await page.waitForURL('**/project/proj-1', { timeout: 10_000 })
    await expect(page.locator('h1')).toContainText('The Amber Throne')

    // Verify sidebar tabs are present
    await expect(page.getByText('Outline').first()).toBeVisible()
    await expect(
      page.locator('button[title="Characters"]').first(),
    ).toBeVisible()
  })
})
