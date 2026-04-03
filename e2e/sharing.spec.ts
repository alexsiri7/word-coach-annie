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
  const title = `E2E Share Test ${Date.now()}${suffix ? ` ${suffix}` : ''}`
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
    const getRes = await request.get(`/api/projects/${projectId}`, {
      headers: AUTH_HEADERS,
    })
    if (!getRes.ok()) return
    const project = await getRes.json()

    await request.post(`/api/projects/${projectId}/archive`, {
      headers: AUTH_HEADERS,
    })
    await request.delete(`/api/projects/${projectId}`, {
      headers: AUTH_HEADERS,
      data: { confirmTitle: project.title },
    })
  } catch {
    // Cleanup is best-effort
  }
}

// ── Tests ───────────────────────────────────────────────────────────────

test.describe('Sharing and collaboration — real server, real data', () => {
  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders(AUTH_HEADERS)
  })

  // ── a) Full sharing lifecycle ───────────────────────────────────────
  test('sharing lifecycle: create, list, update role, revoke', async ({
    request,
  }) => {
    let projectId: string | undefined

    try {
      // 1. Create a project
      const project = await createProject(request, 'sharing-lifecycle')
      projectId = project.id

      // 2. List shares — should be empty initially
      const emptyList = await request.get(
        `/api/projects/${projectId}/share`,
        { headers: AUTH_HEADERS },
      )
      expect(emptyList.ok()).toBeTruthy()
      const emptyBody = await emptyList.json()
      expect(emptyBody.shares).toEqual([])

      // 3. Create a share with READER role (default)
      const createRes = await request.post(
        `/api/projects/${projectId}/share`,
        {
          headers: AUTH_HEADERS,
          data: { email: 'reader@example.com' },
        },
      )
      expect(createRes.status()).toBe(201)
      const readerShare = await createRes.json()
      expect(readerShare.email).toBe('reader@example.com')
      expect(readerShare.role).toBe('READER')
      expect(readerShare.id).toBeDefined()
      expect(readerShare.createdAt).toBeDefined()

      // 4. Create a share with explicit EDITOR role
      const editorRes = await request.post(
        `/api/projects/${projectId}/share`,
        {
          headers: AUTH_HEADERS,
          data: { email: 'editor@example.com', role: 'EDITOR' },
        },
      )
      expect(editorRes.status()).toBe(201)
      const editorShare = await editorRes.json()
      expect(editorShare.email).toBe('editor@example.com')
      expect(editorShare.role).toBe('EDITOR')

      // 5. List shares — should show both
      const listRes = await request.get(
        `/api/projects/${projectId}/share`,
        { headers: AUTH_HEADERS },
      )
      expect(listRes.ok()).toBeTruthy()
      const listBody = await listRes.json()
      expect(listBody.shares).toHaveLength(2)
      const emails = listBody.shares.map(
        (s: { email: string }) => s.email,
      )
      expect(emails).toContain('reader@example.com')
      expect(emails).toContain('editor@example.com')

      // 6. Update reader's role to EDITOR
      const patchRes = await request.patch(
        `/api/projects/${projectId}/share`,
        {
          headers: AUTH_HEADERS,
          data: { email: 'reader@example.com', role: 'EDITOR' },
        },
      )
      expect(patchRes.ok()).toBeTruthy()
      const updatedShare = await patchRes.json()
      expect(updatedShare.email).toBe('reader@example.com')
      expect(updatedShare.role).toBe('EDITOR')

      // 7. Update editor's role to READER
      const patchRes2 = await request.patch(
        `/api/projects/${projectId}/share`,
        {
          headers: AUTH_HEADERS,
          data: { email: 'editor@example.com', role: 'READER' },
        },
      )
      expect(patchRes2.ok()).toBeTruthy()
      const updatedShare2 = await patchRes2.json()
      expect(updatedShare2.role).toBe('READER')

      // 8. Revoke the first share
      const deleteRes = await request.delete(
        `/api/projects/${projectId}/share`,
        {
          headers: AUTH_HEADERS,
          data: { email: 'reader@example.com' },
        },
      )
      expect(deleteRes.status()).toBe(204)

      // 9. List shares — should show only one remaining
      const afterRevoke = await request.get(
        `/api/projects/${projectId}/share`,
        { headers: AUTH_HEADERS },
      )
      const afterRevokeBody = await afterRevoke.json()
      expect(afterRevokeBody.shares).toHaveLength(1)
      expect(afterRevokeBody.shares[0].email).toBe('editor@example.com')

      // 10. Revoke the second share
      const deleteRes2 = await request.delete(
        `/api/projects/${projectId}/share`,
        {
          headers: AUTH_HEADERS,
          data: { email: 'editor@example.com' },
        },
      )
      expect(deleteRes2.status()).toBe(204)

      // 11. List shares — should be empty again
      const finalList = await request.get(
        `/api/projects/${projectId}/share`,
        { headers: AUTH_HEADERS },
      )
      const finalBody = await finalList.json()
      expect(finalBody.shares).toEqual([])
    } finally {
      if (projectId) await deleteProject(request, projectId)
    }
  })

  // ── b) Duplicate share returns 409 ──────────────────────────────────
  test('duplicate share returns 409 conflict', async ({ request }) => {
    let projectId: string | undefined

    try {
      const project = await createProject(request, 'dup-share')
      projectId = project.id

      // Create share
      const first = await request.post(
        `/api/projects/${projectId}/share`,
        {
          headers: AUTH_HEADERS,
          data: { email: 'dup@example.com', role: 'READER' },
        },
      )
      expect(first.status()).toBe(201)

      // Attempt duplicate
      const second = await request.post(
        `/api/projects/${projectId}/share`,
        {
          headers: AUTH_HEADERS,
          data: { email: 'dup@example.com', role: 'EDITOR' },
        },
      )
      expect(second.status()).toBe(409)
      const body = await second.json()
      expect(body.error).toContain('Already shared')
    } finally {
      if (projectId) await deleteProject(request, projectId)
    }
  })

  // ── c) Invalid email returns 400 ───────────────────────────────────
  test('share with invalid email returns 400', async ({ request }) => {
    let projectId: string | undefined

    try {
      const project = await createProject(request, 'bad-email')
      projectId = project.id

      // Missing email
      const noEmail = await request.post(
        `/api/projects/${projectId}/share`,
        {
          headers: AUTH_HEADERS,
          data: { role: 'READER' },
        },
      )
      expect(noEmail.status()).toBe(400)

      // Invalid format
      const badFormat = await request.post(
        `/api/projects/${projectId}/share`,
        {
          headers: AUTH_HEADERS,
          data: { email: 'not-an-email', role: 'READER' },
        },
      )
      expect(badFormat.status()).toBe(400)
    } finally {
      if (projectId) await deleteProject(request, projectId)
    }
  })

  // ── d) Update non-existent share returns 404 ───────────────────────
  test('update role for non-existent share returns 404', async ({
    request,
  }) => {
    let projectId: string | undefined

    try {
      const project = await createProject(request, 'no-share')
      projectId = project.id

      const patchRes = await request.patch(
        `/api/projects/${projectId}/share`,
        {
          headers: AUTH_HEADERS,
          data: { email: 'nobody@example.com', role: 'EDITOR' },
        },
      )
      expect(patchRes.status()).toBe(404)
      const body = await patchRes.json()
      expect(body.error).toContain('not found')
    } finally {
      if (projectId) await deleteProject(request, projectId)
    }
  })

  // ── e) Invalid role returns 400 ────────────────────────────────────
  test('update with invalid role returns 400', async ({ request }) => {
    let projectId: string | undefined

    try {
      const project = await createProject(request, 'bad-role')
      projectId = project.id

      // Create a share first
      await request.post(`/api/projects/${projectId}/share`, {
        headers: AUTH_HEADERS,
        data: { email: 'user@example.com', role: 'READER' },
      })

      // Attempt update with invalid role
      const patchRes = await request.patch(
        `/api/projects/${projectId}/share`,
        {
          headers: AUTH_HEADERS,
          data: { email: 'user@example.com', role: 'ADMIN' },
        },
      )
      expect(patchRes.status()).toBe(400)
      const body = await patchRes.json()
      expect(body.error).toContain('Invalid role')
    } finally {
      if (projectId) await deleteProject(request, projectId)
    }
  })

  // ── f) Shares cascade-delete with project ──────────────────────────
  test('shares are removed when project is deleted', async ({ request }) => {
    let projectId: string | undefined

    try {
      const project = await createProject(request, 'cascade')
      projectId = project.id

      // Create some shares
      await request.post(`/api/projects/${projectId}/share`, {
        headers: AUTH_HEADERS,
        data: { email: 'cascade1@example.com', role: 'READER' },
      })
      await request.post(`/api/projects/${projectId}/share`, {
        headers: AUTH_HEADERS,
        data: { email: 'cascade2@example.com', role: 'EDITOR' },
      })

      // Verify shares exist
      const listRes = await request.get(
        `/api/projects/${projectId}/share`,
        { headers: AUTH_HEADERS },
      )
      const listBody = await listRes.json()
      expect(listBody.shares).toHaveLength(2)

      // Archive and delete the project
      await request.post(`/api/projects/${projectId}/archive`, {
        headers: AUTH_HEADERS,
      })
      const delRes = await request.delete(`/api/projects/${projectId}`, {
        headers: AUTH_HEADERS,
        data: { confirmTitle: project.title },
      })
      expect(delRes.ok()).toBeTruthy()
      projectId = undefined // already cleaned up

      // Attempting to list shares on deleted project should 404
      const afterDelete = await request.get(
        `/api/projects/${project.id}/share`,
        { headers: AUTH_HEADERS },
      )
      expect(afterDelete.status()).toBe(404)
    } finally {
      if (projectId) await deleteProject(request, projectId)
    }
  })

  // ── g) Email is case-insensitive and trimmed ───────────────────────
  test('email is normalized: trimmed and lowercased', async ({ request }) => {
    let projectId: string | undefined

    try {
      const project = await createProject(request, 'normalize')
      projectId = project.id

      // Create with mixed case and whitespace
      const createRes = await request.post(
        `/api/projects/${projectId}/share`,
        {
          headers: AUTH_HEADERS,
          data: { email: '  User@Example.COM  ', role: 'READER' },
        },
      )
      expect(createRes.status()).toBe(201)
      const share = await createRes.json()
      expect(share.email).toBe('user@example.com')

      // Duplicate with different casing should still conflict
      const dupRes = await request.post(
        `/api/projects/${projectId}/share`,
        {
          headers: AUTH_HEADERS,
          data: { email: 'USER@EXAMPLE.COM', role: 'EDITOR' },
        },
      )
      expect(dupRes.status()).toBe(409)

      // Patch with different casing should still find the share
      const patchRes = await request.patch(
        `/api/projects/${projectId}/share`,
        {
          headers: AUTH_HEADERS,
          data: { email: 'USER@example.com', role: 'EDITOR' },
        },
      )
      expect(patchRes.ok()).toBeTruthy()
      const updated = await patchRes.json()
      expect(updated.role).toBe('EDITOR')

      // Delete with different casing should still work
      const deleteRes = await request.delete(
        `/api/projects/${projectId}/share`,
        {
          headers: AUTH_HEADERS,
          data: { email: 'User@EXAMPLE.com' },
        },
      )
      expect(deleteRes.status()).toBe(204)

      // Verify share is gone
      const listRes = await request.get(
        `/api/projects/${projectId}/share`,
        { headers: AUTH_HEADERS },
      )
      const listBody = await listRes.json()
      expect(listBody.shares).toEqual([])
    } finally {
      if (projectId) await deleteProject(request, projectId)
    }
  })

  // ── h) Revoking non-existent share is idempotent ───────────────────
  test('revoking a non-existent share returns 204', async ({ request }) => {
    let projectId: string | undefined

    try {
      const project = await createProject(request, 'revoke-noop')
      projectId = project.id

      // Delete share that was never created — should still 204
      const deleteRes = await request.delete(
        `/api/projects/${projectId}/share`,
        {
          headers: AUTH_HEADERS,
          data: { email: 'ghost@example.com' },
        },
      )
      expect(deleteRes.status()).toBe(204)
    } finally {
      if (projectId) await deleteProject(request, projectId)
    }
  })
})
