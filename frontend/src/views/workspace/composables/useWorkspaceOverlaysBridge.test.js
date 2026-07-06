import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import {
  createWorkspaceOverlaysMutableValues,
  createWorkspaceOverlaysValueSetter,
  useWorkspaceOverlaysBridge,
} from './useWorkspaceOverlaysBridge.js'

describe('useWorkspaceOverlaysBridge', () => {
  it('builds overlay model values from refs', () => {
    const { workspaceOverlaysModel } = useWorkspaceOverlaysBridge({
      workspaceNotice: ref({ message: 'Saved' }),
      workspaceConfirm: ref({ title: 'Delete' }),
      isWorkspaceCommandPaletteOpen: ref(true),
      workspaceCommandQuery: ref('roadmap'),
      workspaceCommandActiveIndex: ref(2),
      workspaceCommandItems: ref([{ id: 'open' }]),
      workspaceCommandEmptyLabel: ref('No commands'),
      showWorkspaceShareModal: ref(true),
      workspaceId: ref(9),
      workspaceUuid: ref('uuid-9'),
      workspaceShareStatus: ref('Private'),
    })

    expect(workspaceOverlaysModel.value).toMatchObject({
      workspaceNotice: { message: 'Saved' },
      workspaceConfirm: { title: 'Delete' },
      isCommandPaletteOpen: true,
      commandQuery: 'roadmap',
      commandActiveIndex: 2,
      commandItems: [{ id: 'open' }],
      commandEmptyLabel: 'No commands',
      showShareModal: true,
      workspaceId: 9,
      workspaceUuid: 'uuid-9',
      workspaceShareStatus: 'Private',
    })
  })

  it('updates mutable refs and wraps overlay actions', () => {
    const workspaceCommandQuery = ref('')
    const workspaceCommandActiveIndex = ref(0)
    const workspaceCommandInput = ref(null)
    const showWorkspaceShareModal = ref(true)
    const handleWorkspaceShareRefresh = vi.fn()

    const { workspaceOverlaysActions } = useWorkspaceOverlaysBridge({
      workspaceCommandQuery,
      workspaceCommandActiveIndex,
      workspaceCommandInput,
      showWorkspaceShareModal,
      handleWorkspaceShareRefresh,
    })

    workspaceOverlaysActions.setValue('workspaceCommandQuery', 'page')
    workspaceOverlaysActions.setValue('workspaceCommandActiveIndex', 3)
    workspaceOverlaysActions.registerCommandInput('input-ref')
    workspaceOverlaysActions.closeWorkspaceShare()
    workspaceOverlaysActions.refreshWorkspaceShare()

    expect(workspaceCommandQuery.value).toBe('page')
    expect(workspaceCommandActiveIndex.value).toBe(3)
    expect(workspaceCommandInput.value).toBe('input-ref')
    expect(showWorkspaceShareModal.value).toBe(false)
    expect(handleWorkspaceShareRefresh).toHaveBeenCalledTimes(1)
  })

  it('ignores unknown mutable keys', () => {
    const workspaceCommandQuery = ref('')
    const setter = createWorkspaceOverlaysValueSetter(createWorkspaceOverlaysMutableValues({ workspaceCommandQuery }))

    setter('workspaceCommandQuery', 'query')
    setter('missing', 'ignored')

    expect(workspaceCommandQuery.value).toBe('query')
  })
})