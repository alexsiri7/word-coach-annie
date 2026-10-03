import { test, expect } from '@playwright/test'

const OPEN_TASK = {
  id: 'wt-1',
  name: 'Draft the border skirmish',
  whatIsNeeded: null,
  kind: 'Draft',
  capacity: 'Full',
  importance: 'High',
  size: 'Medium',
  energy: 'Technical',
  dueDate: null,
  project: { id: 'proj-1', title: 'The Amber Throne' },
  scene: null,
}

const BEFORE_COMPLETE = {
  suggestedNow: [OPEN_TASK],
  upcomingDeadlines: [],
  openTasks: [OPEN_TASK],
  openTaskTotal: 1,
  completedThisWeek: [],
}

const AFTER_COMPLETE = {
  suggestedNow: [],
  upcomingDeadlines: [],
  openTasks: [],
  openTaskTotal: 0,
  completedThisWeek: [
    { id: OPEN_TASK.id, name: OPEN_TASK.name, kind: 'Draft', project: OPEN_TASK.project, completedAt: '2026-06-01T10:00:00.000Z' },
  ],
}

test.describe('Writing task dashboard', () => {
  test('marking a task complete refetches the dashboard and moves the task to done this week', async ({ page }) => {
    let completed = false
    let dashboardFetches = 0
    await page.route('**/api/writing-tasks/dashboard*', (route) => {
      dashboardFetches++
      return route.fulfill({ json: completed ? AFTER_COMPLETE : BEFORE_COMPLETE, status: 200 })
    })
    await page.route(`**/api/writing-tasks/${OPEN_TASK.id}/complete`, (route) => {
      expect(route.request().method()).toBe('POST')
      completed = true
      return route.fulfill({ json: { id: OPEN_TASK.id }, status: 200 })
    })

    await page.goto('/tasks')
    await page.getByText('Suggested now').waitFor({ state: 'visible', timeout: 20_000 })
    await expect(page.getByText(OPEN_TASK.name)).toHaveCount(2)
    const fetchesBeforeComplete = dashboardFetches

    await page.getByRole('button', { name: 'Mark as complete' }).first().click()

    await expect(page.getByText('Done this week')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mark as complete' })).toHaveCount(0)
    await expect(page.getByText('No open tasks')).toBeVisible()
    await expect(page.getByText(OPEN_TASK.name)).toHaveCount(1)
    expect(dashboardFetches).toBeGreaterThan(fetchesBeforeComplete)
  })

  test('a failed project load is reported in the new task dialog and retried on reopen', async ({ page }) => {
    let projectLoads = 0
    await page.route('**/api/writing-tasks/dashboard*', (route) =>
      route.fulfill({ json: BEFORE_COMPLETE, status: 200 })
    )
    await page.route('**/api/projects?*', (route) => {
      projectLoads++
      return projectLoads === 1
        ? route.fulfill({ json: { error: 'boom' }, status: 500 })
        : route.fulfill({ json: { projects: [OPEN_TASK.project], total: 1 }, status: 200 })
    })

    await page.goto('/tasks')
    await page.getByRole('button', { name: 'New task' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText("Couldn't load your projects")).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await page.getByRole('button', { name: 'New task' }).click()

    await expect(dialog.getByText("Couldn't load your projects")).toBeHidden()
    await dialog.getByRole('combobox', { name: 'Project' }).click()
    await expect(page.getByRole('option', { name: OPEN_TASK.project.title })).toBeVisible()
    expect(projectLoads).toBe(2)
  })
})
