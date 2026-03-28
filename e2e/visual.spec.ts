import { test, expect, Page } from '@playwright/test'

// ── Stable mock data ──────────────────────────────────────────────────────

const MOCK_PROJECTS = {
  projects: [
    {
      id: 'proj-1',
      title: 'The Amber Throne',
      author: 'Jane Doe',
      synopsis: 'A reluctant queen must unite warring kingdoms before an ancient evil returns.',
      genre: 'Fantasy',
      projectType: 'FICTION',
      wordCount: 42500,
      nodeCount: 18,
      createdAt: '2026-01-15T10:00:00Z',
      updatedAt: '2026-03-10T14:30:00Z',
    },
    {
      id: 'proj-2',
      title: 'Echoes of Mars',
      author: 'Jane Doe',
      synopsis: 'First-generation colonists discover they are not alone on Mars.',
      genre: 'Sci-Fi',
      projectType: 'FICTION',
      wordCount: 18200,
      nodeCount: 9,
      createdAt: '2026-02-01T09:00:00Z',
      updatedAt: '2026-03-08T11:00:00Z',
    },
    {
      id: 'proj-3',
      title: 'Writing Better Dialogue',
      author: 'Jane Doe',
      synopsis: 'A practical guide to crafting authentic character voices.',
      genre: 'Craft',
      projectType: 'ARTICLE_COLLECTION',
      wordCount: 6800,
      nodeCount: 5,
      createdAt: '2026-03-01T08:00:00Z',
      updatedAt: '2026-03-05T16:00:00Z',
    },
  ],
  total: 3,
}

const MOCK_OUTLINE = [
  {
    id: 'ch-1',
    projectId: 'proj-1',
    parentId: null,
    type: 'CHAPTER',
    title: 'The Summons',
    synopsis: 'Queen Mira receives a desperate plea from the northern border.',
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
      {
        id: 'sc-2',
        projectId: 'proj-1',
        parentId: 'ch-1',
        type: 'SCENE',
        title: 'War Council',
        synopsis: 'Advisors debate the response.',
        status: 'DRAFT',
        orderIndex: 1,
        wordCount: 1400,
        createdAt: '2026-01-16T10:00:00Z',
        updatedAt: '2026-03-02T10:00:00Z',
        children: [],
      },
    ],
  },
  {
    id: 'ch-2',
    projectId: 'proj-1',
    parentId: null,
    type: 'CHAPTER',
    title: 'The Road North',
    synopsis: 'Mira sets out with a small escort.',
    status: 'DRAFT',
    orderIndex: 1,
    wordCount: 2100,
    createdAt: '2026-01-20T10:00:00Z',
    updatedAt: '2026-03-05T10:00:00Z',
    children: [
      {
        id: 'sc-3',
        projectId: 'proj-1',
        parentId: 'ch-2',
        type: 'SCENE',
        title: 'Departure at Dawn',
        synopsis: 'Leaving the capital behind.',
        status: 'OUTLINE',
        orderIndex: 0,
        wordCount: 0,
        createdAt: '2026-01-20T10:00:00Z',
        updatedAt: '2026-03-05T10:00:00Z',
        children: [],
      },
    ],
  },
]

const MOCK_STORY_OBJECTS = {
  storyObjects: [
    {
      id: 'so-1',
      projectId: 'proj-1',
      type: 'CHARACTER',
      name: 'Queen Mira',
      description: 'Young ruler of the Southern Kingdom.',
      notes: 'Reluctant leader, skilled diplomat.',
      role: 'Protagonist',
      tags: 'royalty,diplomat',
      createdAt: '2026-01-15T10:00:00Z',
      updatedAt: '2026-03-01T10:00:00Z',
    },
    {
      id: 'so-2',
      projectId: 'proj-1',
      type: 'CHARACTER',
      name: 'Kael',
      description: 'Captain of the royal guard.',
      notes: 'Loyal, battle-hardened veteran.',
      role: 'Supporting',
      tags: 'military,guard',
      createdAt: '2026-01-16T10:00:00Z',
      updatedAt: '2026-02-28T10:00:00Z',
    },
    {
      id: 'so-3',
      projectId: 'proj-1',
      type: 'LOCATION',
      name: 'Sunstone Keep',
      description: 'The royal palace of the Southern Kingdom.',
      notes: 'Built on a hill of amber-veined stone.',
      role: null,
      tags: 'palace,capital',
      createdAt: '2026-01-15T10:00:00Z',
      updatedAt: '2026-02-20T10:00:00Z',
    },
  ],
  total: 3,
}

const MOCK_PROJECT_DETAIL = {
  id: 'proj-1',
  title: 'The Amber Throne',
  author: 'Jane Doe',
  synopsis: 'A reluctant queen must unite warring kingdoms before an ancient evil returns.',
  genre: 'Fantasy',
  projectType: 'FICTION',
  universeId: null,
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-03-10T14:30:00Z',
}

const MOCK_SCENE_CONTENT = {
  id: 'cv-1',
  nodeId: 'sc-1',
  content: '<p>The heavy oak doors groaned open, admitting a gust of winter wind and a figure wrapped in a travel-stained cloak. Queen Mira straightened on her throne, her fingers tightening on the armrest carved with suns.</p><p>"Your Majesty," the messenger gasped, sinking to one knee. "The northern border—they come from the mountains."</p>',
  wordCount: 1800,
  createdAt: '2026-03-01T10:00:00Z',
}

const MOCK_UNIVERSES = [
  {
    id: 'uni-1',
    title: 'Solara',
    description: 'A high-fantasy world of amber magic and warring kingdoms.',
    createdAt: '2026-01-10T10:00:00Z',
    updatedAt: '2026-03-01T10:00:00Z',
    _count: { projects: 1, worldObjects: 4 },
  },
]

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
    nextScene: { id: 'sc-2', title: 'War Council' },
  },
  related: {
    CHARACTER: [
      { id: 'so-1', name: 'Queen Mira', role: 'Protagonist', description: 'Young ruler of the Southern Kingdom.', notes: 'Reluctant leader, skilled diplomat.' },
    ],
    LOCATION: [
      { id: 'so-3', name: 'Sunstone Keep', description: 'The royal palace of the Southern Kingdom.', notes: 'Built on a hill of amber-veined stone.' },
    ],
  },
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function disableAnimations(page: Page) {
  await page.addStyleTag({
    content: `*, *::before, *::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition-duration: 0s !important;
    }`,
  })
}

const MOCK_PROGRESS_DATA = {
  totalWords: 42500,
  totalScenes: 12,
  scenesDrafted: 9,
  sceneStatusCounts: { FINAL: 5, REVISED: 2, DRAFT: 2, OUTLINE: 3 },
  partProgress: [
    {
      id: 'ch-1',
      title: 'The Summons',
      chapterCount: 0,
      sceneCount: 3,
      wordCount: 8200,
      statusCounts: { FINAL: 3, REVISED: 0, DRAFT: 0, OUTLINE: 0 },
    },
    {
      id: 'ch-2',
      title: 'The Journey',
      chapterCount: 0,
      sceneCount: 4,
      wordCount: 18300,
      statusCounts: { FINAL: 2, REVISED: 1, DRAFT: 1, OUTLINE: 0 },
    },
    {
      id: 'ch-3',
      title: 'The Confrontation',
      chapterCount: 0,
      sceneCount: 5,
      wordCount: 16000,
      statusCounts: { FINAL: 0, REVISED: 1, DRAFT: 1, OUTLINE: 3 },
    },
  ],
  nextScene: { id: 'sc-10', title: 'The Final Confrontation' },
  estimatedTotalWords: 56667,
}

/** Intercept all API calls for the dashboard (project list) */
async function mockDashboardApi(page: Page) {
  await page.route('**/api/projects?*', route =>
    route.fulfill({ json: MOCK_PROJECTS, status: 200 })
  )
  await page.route('**/api/projects', route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: MOCK_PROJECTS, status: 200 })
    }
    return route.continue()
  })
  await page.route('**/api/sessions*', route =>
    route.fulfill({ json: { sessions: [], byDate: {} }, status: 200 })
  )
}

/** Intercept all API calls for the project editor view */
async function mockProjectEditorApi(page: Page) {
  await page.route('**/api/projects/proj-1/nodes', route =>
    route.fulfill({ json: { tree: MOCK_OUTLINE }, status: 200 })
  )
  await page.route('**/api/projects/proj-1/outline', route =>
    route.fulfill({ json: MOCK_OUTLINE, status: 200 })
  )
  await page.route('**/api/projects/proj-1/story-objects*', route =>
    route.fulfill({ json: { data: MOCK_STORY_OBJECTS.storyObjects, total: MOCK_STORY_OBJECTS.total }, status: 200 })
  )
  await page.route('**/api/projects/proj-1/relationships*', route =>
    route.fulfill({ json: [], status: 200 })
  )
  await page.route('**/api/projects/proj-1/search*', route =>
    route.fulfill({ json: { results: [] }, status: 200 })
  )
  await page.route('**/api/nodes/sc-1/content', route =>
    route.fulfill({ json: MOCK_SCENE_CONTENT, status: 200 })
  )
  await page.route('**/api/nodes/*/content', route =>
    route.fulfill({ json: { id: 'cv-0', nodeId: 'sc-0', content: '', wordCount: 0, createdAt: '2026-01-01T00:00:00Z' }, status: 200 })
  )
  await page.route('**/api/nodes/*/annotations', route =>
    route.fulfill({ json: [], status: 200 })
  )
  await page.route('**/api/ai-settings', route =>
    route.fulfill({ json: { provider: 'openai', model: 'gpt-4o', apiKey: '' }, status: 200 })
  )
  await page.route('**/api/chat', route =>
    route.fulfill({ json: { message: 'Mock response' }, status: 200 })
  )
  // Use function matcher for exact project endpoint to avoid intercepting sub-routes
  await page.route(
    url => /\/api\/projects\/proj-1\/?$/.test(url.pathname),
    route => route.fulfill({ json: MOCK_PROJECT_DETAIL, status: 200 })
  )
}

/** Intercept API calls for the universe page */
async function mockUniverseApi(page: Page) {
  await page.route('**/api/universes', route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: MOCK_UNIVERSES, status: 200 })
    }
    return route.continue()
  })
}

/** Intercept API calls for the progress page */
async function mockProgressApi(page: Page) {
  await page.route('**/api/projects/proj-1/progress', route =>
    route.fulfill({ json: MOCK_PROGRESS_DATA, status: 200 })
  )
  await page.route('**/api/sessions*', route =>
    route.fulfill({ json: { sessions: [], byDate: {} }, status: 200 })
  )
  await page.route(
    url => /\/api\/projects\/proj-1\/?$/.test(url.pathname),
    route => route.fulfill({ json: MOCK_PROJECT_DETAIL, status: 200 })
  )
}

/** Intercept API calls for the focus mode page */
async function mockFocusModeApi(page: Page) {
  await page.route('**/api/focus/sc-1', route =>
    route.fulfill({ json: MOCK_FOCUS_CONTEXT, status: 200 })
  )
  await page.route('**/api/nodes/sc-1/content', route =>
    route.fulfill({ json: MOCK_SCENE_CONTENT, status: 200 })
  )
  await page.route('**/api/nodes/*/content', route =>
    route.fulfill({ json: { id: 'cv-0', nodeId: 'sc-0', content: '', wordCount: 0, createdAt: '2026-01-01T00:00:00Z' }, status: 200 })
  )
  await page.route('**/api/nodes/*/annotations', route =>
    route.fulfill({ json: [], status: 200 })
  )
  await page.route('**/api/ai-settings', route =>
    route.fulfill({ json: { provider: 'openai', model: 'gpt-4o', apiKey: '' }, status: 200 })
  )
  await page.route(
    url => /\/api\/projects\/proj-1\/?$/.test(url.pathname),
    route => route.fulfill({ json: MOCK_PROJECT_DETAIL, status: 200 })
  )
}

// ── Tests ──────────────────────────────────────────────────────────────────
// 4 screens × 3 projects (desktop, mobile, dark-desktop) = 12 screenshots

test.describe('Visual regression – Annie', () => {
  test('dashboard with projects', async ({ page }) => {
    await mockDashboardApi(page)
    // Dismiss the setup wizard so it doesn't cover the dashboard
    await page.addInitScript(() => {
      localStorage.setItem('setup-wizard-dismissed', 'true')
    })
    await page.goto('/')
    await page.waitForSelector('main', { timeout: 20_000 })
    await page.waitForSelector('.glass-card', { timeout: 5_000 }).catch(() => {})
    await disableAnimations(page)

    await expect(page).toHaveScreenshot('dashboard.png', {
      animations: 'disabled',
    })
  })

  test('project editor with scene selected', async ({ page }) => {
    await mockProjectEditorApi(page)
    await page.goto('/project/proj-1')
    await page.waitForSelector('main', { timeout: 20_000 })
    await disableAnimations(page)
    await page.waitForTimeout(500)

    // On mobile, open the sidebar menu first
    const menuButton = page.locator('button[aria-label="Open sidebar menu"], button:has-text("Open sidebar")')
    if (await menuButton.isVisible().catch(() => false)) {
      await menuButton.click()
      await page.waitForTimeout(300)
    }

    // Wait for outline to fully render, then ensure Throne Room scene is visible
    await page.waitForTimeout(500)
    const sceneItem = page.locator('text=Throne Room').first()
    if (!(await sceneItem.isVisible().catch(() => false))) {
      // Chapter is collapsed — expand it
      const chapter = page.locator('text=The Summons').first()
      await chapter.click()
      await sceneItem.waitFor({ state: 'visible', timeout: 5_000 })
    }
    await sceneItem.click()
    // Wait for the editor to load the scene (breadcrumb updates)
    await page.locator('text=Throne Room').nth(1).waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {})
    await page.waitForTimeout(500)

    await expect(page).toHaveScreenshot('project-editor.png', {
      animations: 'disabled',
      maxDiffPixelRatio: 0.01,
    })
  })

  test('focus mode writing view', async ({ page }) => {
    await mockFocusModeApi(page)
    await page.goto('/project/proj-1/scene/sc-1/focus')
    await page.waitForSelector('main', { timeout: 20_000 })
    await disableAnimations(page)
    await page.waitForTimeout(500)

    await expect(page).toHaveScreenshot('focus-mode.png', {
      animations: 'disabled',
    })
  })

  test('universe list populated', async ({ page }) => {
    await mockUniverseApi(page)
    await page.goto('/universe')
    await page.waitForSelector('main', { timeout: 20_000 })
    await disableAnimations(page)
    await page.waitForTimeout(500)

    await expect(page).toHaveScreenshot('universe-list.png', {
      animations: 'disabled',
    })
  })

  test('manuscript progress view', async ({ page }) => {
    await mockProgressApi(page)
    await page.goto('/project/proj-1/progress')
    await page.waitForSelector('main', { timeout: 20_000 })
    await disableAnimations(page)
    await page.waitForTimeout(500)

    await expect(page).toHaveScreenshot('progress-view.png', {
      animations: 'disabled',
    })
  })
})
