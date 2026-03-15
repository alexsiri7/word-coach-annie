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

/** Intercept all API calls for the dashboard (project list) */
async function mockDashboardApi(page: Page, options: { empty?: boolean } = {}) {
  const projects = options.empty ? { projects: [], total: 0 } : MOCK_PROJECTS

  await page.route('**/api/projects?*', route =>
    route.fulfill({ json: projects, status: 200 })
  )
  await page.route('**/api/projects', route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: projects, status: 200 })
    }
    return route.continue()
  })
}

/** Intercept all API calls for the project editor view */
async function mockProjectEditorApi(page: Page) {
  await page.route('**/api/projects/proj-1', route =>
    route.fulfill({ json: MOCK_PROJECT_DETAIL, status: 200 })
  )
  await page.route('**/api/projects/proj-1/outline', route =>
    route.fulfill({ json: MOCK_OUTLINE, status: 200 })
  )
  await page.route('**/api/projects/proj-1/story-objects*', route =>
    route.fulfill({ json: MOCK_STORY_OBJECTS, status: 200 })
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
}

/** Intercept API calls for the universe page */
async function mockUniverseApi(page: Page, options: { empty?: boolean } = {}) {
  const universes = options.empty ? [] : MOCK_UNIVERSES

  await page.route('**/api/universes', route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: universes, status: 200 })
    }
    return route.continue()
  })
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

const MOCK_STORY_OBJECT_DETAIL = {
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
}

/** Intercept API calls for the story object panel */
async function mockStoryObjectDetailApi(page: Page) {
  await page.route('**/api/story-objects/so-1', route =>
    route.fulfill({ json: MOCK_STORY_OBJECT_DETAIL, status: 200 })
  )
  await page.route('**/api/projects/proj-1', route =>
    route.fulfill({ json: MOCK_PROJECT_DETAIL, status: 200 })
  )
}

// ── Tests ──────────────────────────────────────────────────────────────────

test.describe('Visual regression – Annie', () => {
  test('dashboard – empty state', async ({ page }) => {
    await mockDashboardApi(page, { empty: true })
    await page.goto('/')
    await page.waitForSelector('main', { timeout: 20_000 })
    await disableAnimations(page)

    await expect(page).toHaveScreenshot('dashboard-empty.png', {
      animations: 'disabled',
    })
  })

  test('dashboard – with projects', async ({ page }) => {
    await mockDashboardApi(page)
    await page.goto('/')
    await page.waitForSelector('main', { timeout: 20_000 })
    // Wait for project cards to render
    await page.waitForSelector('.glass-card', { timeout: 5_000 }).catch(() => {})
    await disableAnimations(page)

    await expect(page).toHaveScreenshot('dashboard-with-projects.png', {
      animations: 'disabled',
    })
  })

  test('project editor – outline sidebar', async ({ page }) => {
    await mockProjectEditorApi(page)
    await page.goto('/project/proj-1')
    await page.waitForSelector('main', { timeout: 20_000 })
    await disableAnimations(page)
    // Wait for outline to load
    await page.waitForTimeout(500)

    await expect(page).toHaveScreenshot('project-editor-outline.png', {
      animations: 'disabled',
    })
  })

  test('project editor – scene selected', async ({ page }) => {
    await mockProjectEditorApi(page)
    await page.goto('/project/proj-1')
    await page.waitForSelector('main', { timeout: 20_000 })
    await disableAnimations(page)
    await page.waitForTimeout(500)

    // Click the first scene in the outline to open it
    const sceneItem = page.locator('text=Throne Room').first()
    if (await sceneItem.isVisible()) {
      await sceneItem.click()
      await page.waitForTimeout(500)
    }

    await expect(page).toHaveScreenshot('project-editor-scene-open.png', {
      animations: 'disabled',
    })
  })

  test('project editor – story objects panel', async ({ page }) => {
    await mockProjectEditorApi(page)
    await mockStoryObjectDetailApi(page)
    await page.goto('/project/proj-1')
    await page.waitForSelector('main', { timeout: 20_000 })
    await disableAnimations(page)
    await page.waitForTimeout(500)

    // Switch to Characters tab in sidebar
    const charsTab = page.locator('button[title="Characters"]').first()
    if (await charsTab.isVisible()) {
      await charsTab.click()
      await page.waitForTimeout(300)
    }

    // Click "Queen Mira" to open the story object panel
    const queenMira = page.locator('text=Queen Mira').first()
    if (await queenMira.isVisible()) {
      await queenMira.click()
      await page.waitForTimeout(500)
    }

    await expect(page).toHaveScreenshot('project-editor-story-object.png', {
      animations: 'disabled',
    })
  })

  test('focus mode – writing view', async ({ page }) => {
    await mockFocusModeApi(page)
    await page.goto('/project/proj-1/scene/sc-1/focus')
    await page.waitForSelector('main', { timeout: 20_000 })
    await disableAnimations(page)
    await page.waitForTimeout(500)

    await expect(page).toHaveScreenshot('focus-mode-writing.png', {
      animations: 'disabled',
    })
  })

  test('universe list – empty state', async ({ page }) => {
    await mockUniverseApi(page, { empty: true })
    await page.goto('/universe')
    await page.waitForSelector('main', { timeout: 20_000 })
    await disableAnimations(page)

    await expect(page).toHaveScreenshot('universe-list-empty.png', {
      animations: 'disabled',
    })
  })

  test('universe list – with universes', async ({ page }) => {
    await mockUniverseApi(page)
    await page.goto('/universe')
    await page.waitForSelector('main', { timeout: 20_000 })
    await disableAnimations(page)
    await page.waitForTimeout(500)

    await expect(page).toHaveScreenshot('universe-list-populated.png', {
      animations: 'disabled',
    })
  })
})
