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

const MOCK_ANNOTATIONS = [
  {
    id: 'ann-1',
    content: 'Strengthen the tension when the messenger enters — too passive right now.',
    nodeId: 'sc-1',
    nodeTitle: 'Throne Room',
    projectTitle: 'The Amber Throne',
    selectedText: 'The doors swung open and a figure stumbled in.',
    createdAt: '2026-03-10T09:00:00Z',
  },
  {
    id: 'ann-2',
    content: 'Consider adding a physical reaction from Mira here.',
    nodeId: 'sc-1',
    nodeTitle: 'Throne Room',
    projectTitle: 'The Amber Throne',
    selectedText: null,
    createdAt: '2026-03-11T14:00:00Z',
  },
  {
    id: 'ann-3',
    content: 'The advisors feel too uniform — differentiate their voices.',
    nodeId: 'sc-2',
    nodeTitle: 'War Council',
    projectTitle: 'The Amber Throne',
    selectedText: null,
    createdAt: '2026-03-12T10:00:00Z',
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
    route.fulfill({ json: { model: 'gemini-2.0-flash-001', apiKey: '' }, status: 200 })
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

/** Intercept API calls for the annotations page */
async function mockAnnotationsApi(page: Page) {
  await page.route('**/api/annotations*', route =>
    route.fulfill({ json: MOCK_ANNOTATIONS, status: 200 })
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
  await page.route('**/api/projects/proj-1/nodes', route =>
    route.fulfill({ json: { tree: MOCK_OUTLINE }, status: 200 })
  )
  await page.route('**/api/projects/proj-1/story-objects*', route =>
    route.fulfill({ json: { data: MOCK_STORY_OBJECTS.storyObjects, total: MOCK_STORY_OBJECTS.total }, status: 200 })
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
    route.fulfill({ json: { model: 'gemini-2.0-flash-001', apiKey: '' }, status: 200 })
  )
  await page.route(
    url => /\/api\/projects\/proj-1\/?$/.test(url.pathname),
    route => route.fulfill({ json: MOCK_PROJECT_DETAIL, status: 200 })
  )
}

const MOCK_WRITING_TASKS = {
  tasks: [
    {
      id: 'wt-1',
      projectId: 'proj-1',
      sceneId: null,
      name: 'Revise the opening confrontation',
      whatIsNeeded: 'Punch up the dialogue — Mira sounds passive.',
      importance: 'Critical',
      size: 'Medium',
      energy: 'Dramatic',
      completed: false,
      createdAt: '2026-03-01T10:00:00Z',
      updatedAt: '2026-03-01T10:00:00Z',
      scene: null,
    },
    {
      id: 'wt-2',
      projectId: 'proj-1',
      sceneId: 'sc-1',
      name: 'Add foreshadowing in Throne Room',
      whatIsNeeded: 'Plant the crown motif earlier.',
      importance: 'High',
      size: 'Small',
      energy: 'Introspective',
      completed: true,
      createdAt: '2026-02-15T10:00:00Z',
      updatedAt: '2026-03-05T10:00:00Z',
      scene: { id: 'sc-1', title: 'Throne Room' },
    },
  ],
  total: 2,
}

// ── Tests ──────────────────────────────────────────────────────────────────
// 6 screens × 3 viewports (desktop, mobile, dark-desktop) = 18 screenshots

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

    // On mobile, open the sidebar menu first
    const menuButton = page.locator('button[aria-label="Open sidebar menu"], button:has-text("Open sidebar")')
    if (await menuButton.isVisible().catch(() => false)) {
      await menuButton.click()
    }

    // Wait for outline to fully render
    const chapterItem = page.getByRole('treeitem', { name: 'The Summons' })
    await chapterItem.waitFor({ state: 'visible', timeout: 5_000 })

    // Ensure Throne Room scene is visible
    const sceneItem = page.getByRole('treeitem', { name: 'Throne Room' })
    if (!(await sceneItem.isVisible().catch(() => false))) {
      // Chapter is collapsed — expand it
      await chapterItem.click()
      await sceneItem.waitFor({ state: 'visible', timeout: 5_000 })
    }
    await sceneItem.click()
    // Wait for the editor to load the scene (breadcrumb updates)
    await page.getByText('Throne Room').nth(1).waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {})

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
    // Wait for focus mode content to load
    await page.getByText('Throne Room').first().waitFor({ state: 'visible', timeout: 5_000 })

    await expect(page).toHaveScreenshot('focus-mode.png', {
      animations: 'disabled',
    })
  })

  test('landing page', async ({ page }) => {
    await page.goto('/landing')
    await page.waitForSelector('main', { timeout: 20_000 })
    await disableAnimations(page)

    await expect(page).toHaveScreenshot('landing.png', {
      animations: 'disabled',
    })
  })

  test('dmca page', async ({ page }) => {
    await page.goto('/dmca')
    await page.waitForSelector('main', { timeout: 20_000 })
    await disableAnimations(page)

    await expect(page).toHaveScreenshot('dmca.png', {
      animations: 'disabled',
    })
  })

  test('universe list populated', async ({ page }) => {
    await mockUniverseApi(page)
    await page.goto('/universe')
    await page.waitForSelector('main', { timeout: 20_000 })
    await disableAnimations(page)
    // Wait for universe cards to render
    await page.getByTestId('universe-card').first().waitFor({ state: 'visible', timeout: 5_000 })

    await expect(page).toHaveScreenshot('universe-list.png', {
      animations: 'disabled',
    })
  })

  test('annotations page populated', async ({ page }) => {
    await mockAnnotationsApi(page)
    await page.goto('/project/proj-1/annotations')
    await page.waitForSelector('main', { timeout: 20_000 })
    await disableAnimations(page)
    // Wait for annotations to render
    await page.getByText('Annotations').first().waitFor({ state: 'visible', timeout: 5_000 })

    await expect(page).toHaveScreenshot('annotations.png', {
      animations: 'disabled',
    })
  })

  test('offline fallback page', async ({ page }) => {
    await page.goto('/offline')
    await page.waitForSelector('main', { timeout: 20_000 })
    await disableAnimations(page)

    await expect(page).toHaveScreenshot('offline.png', {
      animations: 'disabled',
    })
  })

  test('tasks page populated', async ({ page }) => {
    await page.route('**/api/writing-tasks*', route =>
      route.fulfill({ json: MOCK_WRITING_TASKS, status: 200 })
    )
    await page.route(
      url => /\/api\/projects\/proj-1\/?$/.test(url.pathname),
      route => route.fulfill({ json: MOCK_PROJECTS.projects[0], status: 200 })
    )
    await page.goto('/project/proj-1/tasks')
    await page.waitForSelector('main', { timeout: 20_000 })
    await disableAnimations(page)
    await page.getByText('Writing Tasks').first().waitFor({ state: 'visible', timeout: 5_000 })

    await expect(page).toHaveScreenshot('tasks.png', {
      animations: 'disabled',
    })
  })
})
