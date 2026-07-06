import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useWorkspaceSseRoleChange } from './useWorkspaceSseRoleChange.js'

const createWindowTarget = () => ({
  setTimeout: vi.fn((callback) => callback()),
  location: {
    reload: vi.fn(),
  },
})

describe('useWorkspaceSseRoleChange', () => {
  it('ignores role changes for another workspace', () => {
    const router = { push: vi.fn() }
    const showWorkspaceNotice = vi.fn()
    const allowNextRouteLeave = vi.fn()
    const allowNextWindowUnload = vi.fn()
    const windowTarget = createWindowTarget()

    const { handleSseRoleChanged } = useWorkspaceSseRoleChange({
      workspaceId: ref(10),
      router,
      windowTarget,
      showWorkspaceNotice,
      allowNextRouteLeave,
      allowNextWindowUnload,
    })

    handleSseRoleChanged({ detail: { postIdx: 11, newRole: 'KICKED' } })
    handleSseRoleChanged({ detail: {} })

    expect(showWorkspaceNotice).not.toHaveBeenCalled()
    expect(allowNextRouteLeave).not.toHaveBeenCalled()
    expect(allowNextWindowUnload).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
    expect(windowTarget.location.reload).not.toHaveBeenCalled()
  })

  it('notifies and redirects when the current user is kicked', () => {
    const router = { push: vi.fn() }
    const showWorkspaceNotice = vi.fn()
    const allowNextRouteLeave = vi.fn()
    const windowTarget = createWindowTarget()

    const { handleSseRoleChanged } = useWorkspaceSseRoleChange({
      workspaceId: ref(10),
      router,
      windowTarget,
      showWorkspaceNotice,
      allowNextRouteLeave,
      kickedMessage: '추방됨',
      redirectDelayMs: 500,
    })

    handleSseRoleChanged({ detail: { postIdx: '10', newRole: 'KICKED' } })

    expect(showWorkspaceNotice).toHaveBeenCalledWith('추방됨', 'error', { timeout: 500 })
    expect(allowNextRouteLeave).toHaveBeenCalledTimes(1)
    expect(windowTarget.setTimeout).toHaveBeenCalledWith(expect.any(Function), 500)
    expect(router.push).toHaveBeenCalledWith('/workspace')
  })

  it('reloads the page when the current workspace role changes', () => {
    const allowNextWindowUnload = vi.fn()
    const windowTarget = createWindowTarget()

    const { handleSseRoleChanged } = useWorkspaceSseRoleChange({
      workspaceId: () => 10,
      windowTarget,
      allowNextWindowUnload,
    })

    handleSseRoleChanged({ detail: { postIdx: 10, newRole: 'READ' } })

    expect(allowNextWindowUnload).toHaveBeenCalledTimes(1)
    expect(windowTarget.location.reload).toHaveBeenCalledTimes(1)
  })
})