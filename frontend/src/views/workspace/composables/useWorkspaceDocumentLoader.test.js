import { describe, expect, it, vi } from 'vitest'

import {
  __workspaceDocumentLoaderTestables,
  useWorkspaceDocumentLoader,
} from './useWorkspaceDocumentLoader.js'

const createSubject = ({
  route = { params: {}, path: '/workspace', meta: {}, query: {} },
  api = {},
} = {}) => {
  const router = { replace: vi.fn(async () => {}) }
  const logError = vi.fn()
  return {
    router,
    logError,
    api: {
      getPost: vi.fn(async (id) => ({ idx: id, title: 'Loaded' })),
      getPostByUuid: vi.fn(async () => ({ result: { body: { idx: 77 } } })),
      ...api,
    },
    subject: null,
    route,
  }
}

const buildSubject = (options) => {
  const harness = createSubject(options)
  harness.subject = useWorkspaceDocumentLoader({
    route: harness.route,
    router: harness.router,
    api: harness.api,
    logError: harness.logError,
  })
  return harness
}

describe('useWorkspaceDocumentLoader', () => {
  it('returns an empty workspace model for the new workspace route', async () => {
    const { subject, api } = buildSubject()

    await expect(subject.prepareWorkspaceData()).resolves.toEqual({
      idx: null,
      title: '',
      contents: '',
      type: false,
      status: 'Private',
      uuid: '',
      accessRole: 'ADMIN',
    })
    expect(api.getPost).not.toHaveBeenCalled()
  })

  it('uses matching route initial data before calling the API', async () => {
    const initialData = { idx: 12, title: 'Initial' }
    const { subject, api } = buildSubject({
      route: { params: { id: 12 }, path: '/workspace/read/12', meta: { initialData }, query: {} },
    })

    await expect(subject.prepareWorkspaceData()).resolves.toBe(initialData)
    expect(api.getPost).not.toHaveBeenCalled()
  })

  it('falls back to route-derived collaborative data when loading fails', async () => {
    const { subject } = buildSubject({
      route: { params: { id: '99' }, path: '/workspace/read/99', name: 'workspace_read', meta: {}, query: {} },
      api: { getPost: vi.fn(async () => { throw new Error('not found') }) },
    })

    await expect(subject.prepareWorkspaceData()).resolves.toMatchObject({
      idx: 99,
      type: true,
      status: 'Public',
      accessRole: 'WRITE',
    })
  })

  it('redirects invite UUIDs to the resolved workspace document', async () => {
    const { subject, api, router } = buildSubject({
      route: { params: {}, path: '/workspace/invite', meta: {}, query: { uuid: 'abc' } },
    })

    await expect(subject.checkAndRedirectUuid()).resolves.toBe(true)

    expect(api.getPostByUuid).toHaveBeenCalledWith('abc')
    expect(router.replace).toHaveBeenCalledWith({ name: 'workspace_read', params: { id: 77 } })
  })

  it('redirects invalid invite UUIDs back to the workspace list', async () => {
    const { subject, router, logError } = buildSubject({
      route: { params: {}, path: '/workspace/invite', meta: {}, query: { uuid: 'bad' } },
      api: { getPostByUuid: vi.fn(async () => { throw new Error('invalid') }) },
    })

    await expect(subject.checkAndRedirectUuid()).resolves.toBe(true)

    expect(logError).toHaveBeenCalled()
    expect(router.replace).toHaveBeenCalledWith('/workspace')
  })

  it('detects readonly fallback routes', () => {
    expect(__workspaceDocumentLoaderTestables.workspaceDataFallbackFor({
      params: { id: 5 },
      path: '/workspace/readonly/5',
      name: 'workspace_readonly',
    })).toMatchObject({
      idx: 5,
      type: true,
      status: 'Public',
      accessRole: 'READ',
    })
  })
})
