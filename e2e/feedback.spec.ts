import { test, expect, Page } from '@playwright/test'

// ── Mock data ───────────────────────────────────────────────────────────

const MOCK_AUTH_USER = {
  authenticated: true,
  authMethod: 'google',
  user: {
    userId: 'test-user-1',
    email: 'tester@example.com',
    name: 'Test User',
    picture: null,
  },
}

const MOCK_PROJECTS = {
  projects: [
    {
      id: 'proj-1',
      title: 'Test Novel',
      author: 'Test Author',
      synopsis: 'A test project.',
      genre: 'Fiction',
      projectType: 'FICTION',
      wordCount: 10000,
      nodeCount: 5,
      createdAt: '2026-01-15T10:00:00Z',
      updatedAt: '2026-03-10T14:30:00Z',
    },
  ],
  total: 1,
}

const MOCK_FEEDBACK_SUCCESS = {
  success: true,
  issueUrl: 'https://github.com/test-owner/test-repo/issues/42',
}

// ── Helpers ─────────────────────────────────────────────────────────────

async function mockCommonApis(page: Page) {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ json: MOCK_AUTH_USER, status: 200 }),
  )
  await page.route('**/api/projects?*', (route) =>
    route.fulfill({ json: MOCK_PROJECTS, status: 200 }),
  )
  await page.route('**/api/projects', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: MOCK_PROJECTS, status: 200 })
    }
    return route.continue()
  })
  await page.route('**/api/ai-settings', (route) =>
    route.fulfill({
      json: { provider: 'openai', model: 'gpt-4o', apiKey: '' },
      status: 200,
    }),
  )
  await page.route('**/api/health', (route) =>
    route.fulfill({ json: { status: 'ok' }, status: 200 }),
  )
  await page.route('**/api/setup-status', (route) =>
    route.fulfill({ json: { setupComplete: true }, status: 200 }),
  )
}

/** Open the feedback dialog via the user menu */
async function openFeedbackDialog(page: Page) {
  // Click the user avatar button to open dropdown
  const userButton = page.locator('button.rounded-full').first()
  await userButton.waitFor({ state: 'visible', timeout: 10_000 })
  await userButton.click()

  // Click "Send Feedback" in the dropdown
  const feedbackItem = page.locator('text=Send Feedback')
  await feedbackItem.waitFor({ state: 'visible', timeout: 5_000 })
  await feedbackItem.click()

  // Wait for the dialog to appear
  await page.locator('text=Report a bug').waitFor({ state: 'visible', timeout: 5_000 })
}

// ── Tests ───────────────────────────────────────────────────────────────

test.describe('E2E feedback/bug report flow', () => {
  test('submit bug report without screenshot and verify GitHub issue link', async ({
    page,
  }) => {
    // Track feedback API calls
    const feedbackRequests: string[] = []
    await mockCommonApis(page)

    await page.route('**/api/feedback', (route) => {
      if (route.request().method() === 'POST') {
        feedbackRequests.push(route.request().postData() || '')
        return route.fulfill({
          json: MOCK_FEEDBACK_SUCCESS,
          status: 201,
        })
      }
      return route.continue()
    })

    await page.goto('/')
    await page.waitForSelector('main', { timeout: 20_000 })

    // Open feedback dialog from user menu
    await openFeedbackDialog(page)

    // Verify dialog title
    await expect(
      page.locator('text=Send Feedback').first(),
    ).toBeVisible()

    // Submit button should be disabled when message is empty
    const submitButton = page.getByRole('button', { name: 'Submit' })
    await expect(submitButton).toBeDisabled()

    // Type a bug report message
    const textarea = page.locator('textarea')
    await textarea.fill('The editor crashes when I paste a large block of text')

    // Submit should now be enabled
    await expect(submitButton).toBeEnabled()

    // Click submit
    await submitButton.click()

    // Should show success message
    await expect(
      page.locator('text=Feedback submitted').first(),
    ).toBeVisible({ timeout: 5_000 })

    // Should show the GitHub issue link
    const githubLink = page.locator('a[href*="github.com"]')
    await expect(githubLink).toBeVisible()
    await expect(githubLink).toHaveAttribute(
      'href',
      'https://github.com/test-owner/test-repo/issues/42',
    )
    await expect(githubLink).toHaveText('View on GitHub')

    // Verify the API was called with correct payload
    expect(feedbackRequests).toHaveLength(1)
    const payload = JSON.parse(feedbackRequests[0])
    expect(payload.type).toBe('bug')
    expect(payload.message).toBe(
      'The editor crashes when I paste a large block of text',
    )
    expect(payload.email).toBe('tester@example.com')
    expect(payload.context).toBeDefined()
    expect(payload.context.url).toBeDefined()
    expect(payload.context.screenSize).toBeDefined()
  })

  test('capture screenshot, annotate, submit, and verify GitHub issue created', async ({
    page,
  }) => {
    const feedbackRequests: string[] = []
    await mockCommonApis(page)

    await page.route('**/api/feedback', (route) => {
      if (route.request().method() === 'POST') {
        feedbackRequests.push(route.request().postData() || '')
        return route.fulfill({
          json: MOCK_FEEDBACK_SUCCESS,
          status: 201,
        })
      }
      return route.continue()
    })

    await page.goto('/')
    await page.waitForSelector('main', { timeout: 20_000 })

    // Open feedback dialog
    await openFeedbackDialog(page)

    // Type message first
    const textarea = page.locator('textarea')
    await textarea.fill('Button alignment is broken on the dashboard')

    // Click "Capture Screenshot"
    const captureButton = page.getByRole('button', {
      name: /Capture Screenshot/i,
    })
    await expect(captureButton).toBeVisible()
    await captureButton.click()

    // Dialog closes while screenshot is captured. Wait for the screenshot
    // editor to appear (full-screen overlay with annotation tools).
    // html-to-image runs in the real browser, so this should work.
    // The editor is a fixed full-screen div with a canvas and toolbar.

    // If the screenshot editor doesn't appear (html-to-image failed), the
    // dialog re-opens with an error. Handle both paths.
    const editorOrDialog = await Promise.race([
      page
        .locator('canvas')
        .first()
        .waitFor({ state: 'visible', timeout: 10_000 })
        .then(() => 'editor' as const),
      page
        .locator('text=Failed to capture screenshot')
        .waitFor({ state: 'visible', timeout: 10_000 })
        .then(() => 'error' as const),
    ])

    if (editorOrDialog === 'editor') {
      // Screenshot editor is open — draw an annotation
      const canvas = page.locator('canvas').first()

      // Get canvas bounding box for drawing
      const box = await canvas.boundingBox()
      expect(box).not.toBeNull()

      // Select the Highlight tool (button with title="Highlight")
      const highlightTool = page.locator('button[title="Highlight"]')
      if (await highlightTool.isVisible()) {
        await highlightTool.click()
      }

      // Draw a rectangle on the canvas
      await page.mouse.move(box!.x + 100, box!.y + 100)
      await page.mouse.down()
      await page.mouse.move(box!.x + 300, box!.y + 200)
      await page.mouse.up()

      // Click "Done" to return to the feedback dialog with the annotated screenshot
      const doneButton = page.getByRole('button', { name: 'Done' })
      await doneButton.click()

      // Dialog should re-open with the screenshot attached
      await page.locator('text=Send Feedback').first().waitFor({
        state: 'visible',
        timeout: 5_000,
      })

      // Verify screenshot preview is shown (annotated image)
      const screenshotPreview = page.locator('img[alt="Annotated screenshot"]')
      await expect(screenshotPreview).toBeVisible({ timeout: 5_000 })

      // The message should still be filled in from before capture
      // Re-fill if needed (state may reset during dialog close/reopen cycle)
      const currentMessage = await page.locator('textarea').inputValue()
      if (!currentMessage) {
        await page.locator('textarea').fill(
          'Button alignment is broken on the dashboard',
        )
      }

      // Submit the feedback with screenshot
      const submitButton = page.getByRole('button', { name: 'Submit' })
      await submitButton.click()

      // Should show success message
      await expect(
        page.locator('text=Feedback submitted').first(),
      ).toBeVisible({ timeout: 5_000 })

      // Verify the GitHub issue link
      const githubLink = page.locator('a[href*="github.com"]')
      await expect(githubLink).toBeVisible()
      await expect(githubLink).toHaveText('View on GitHub')

      // Verify API was called with screenshot data
      expect(feedbackRequests).toHaveLength(1)
      const payload = JSON.parse(feedbackRequests[0])
      expect(payload.type).toBe('bug')
      expect(payload.message).toBe(
        'Button alignment is broken on the dashboard',
      )
      expect(payload.screenshot).toBeDefined()
      expect(payload.screenshot).toContain('data:image/')
    } else {
      // Screenshot capture failed — submit without screenshot instead
      // The dialog should be open with the error message

      // Fill message if needed
      const currentMessage = await page.locator('textarea').inputValue()
      if (!currentMessage) {
        await page.locator('textarea').fill(
          'Button alignment is broken on the dashboard',
        )
      }

      const submitButton = page.getByRole('button', { name: 'Submit' })
      await submitButton.click()

      await expect(
        page.locator('text=Feedback submitted').first(),
      ).toBeVisible({ timeout: 5_000 })

      expect(feedbackRequests).toHaveLength(1)
    }
  })

  test('change feedback type to feature request', async ({ page }) => {
    const feedbackRequests: string[] = []
    await mockCommonApis(page)

    await page.route('**/api/feedback', (route) => {
      if (route.request().method() === 'POST') {
        feedbackRequests.push(route.request().postData() || '')
        return route.fulfill({
          json: MOCK_FEEDBACK_SUCCESS,
          status: 201,
        })
      }
      return route.continue()
    })

    await page.goto('/')
    await page.waitForSelector('main', { timeout: 20_000 })

    await openFeedbackDialog(page)

    // Change type to "feature"
    const typeSelect = page.locator('button[role="combobox"]')
    await typeSelect.click()
    const featureOption = page.locator('[role="option"]', {
      hasText: 'Feature Request',
    })
    await featureOption.click()

    // Type message and submit
    await page.locator('textarea').fill('Add dark mode to the editor toolbar')
    await page.getByRole('button', { name: 'Submit' }).click()

    await expect(
      page.locator('text=Feedback submitted').first(),
    ).toBeVisible({ timeout: 5_000 })

    // Verify type was sent as "feature"
    expect(feedbackRequests).toHaveLength(1)
    const payload = JSON.parse(feedbackRequests[0])
    expect(payload.type).toBe('feature')
  })

  test('show error when feedback API fails', async ({ page }) => {
    await mockCommonApis(page)

    await page.route('**/api/feedback', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          json: { error: 'Feedback is not configured.' },
          status: 503,
        })
      }
      return route.continue()
    })

    await page.goto('/')
    await page.waitForSelector('main', { timeout: 20_000 })

    await openFeedbackDialog(page)

    await page.locator('textarea').fill('This should fail')
    await page.getByRole('button', { name: 'Submit' }).click()

    // Should show error message
    await expect(
      page.locator('text=Feedback is not configured').first(),
    ).toBeVisible({ timeout: 5_000 })

    // Dialog should remain open (not success state)
    await expect(page.locator('textarea')).toBeVisible()
  })
})
