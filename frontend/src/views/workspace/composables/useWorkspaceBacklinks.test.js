import { describe, expect, it } from 'vitest'
import { ref } from 'vue'

import { createWorkspaceBacklinkEmptyLabel, useWorkspaceBacklinks } from './useWorkspaceBacklinks.js'

const snapshot = (blocks) => JSON.stringify({ blocks })

describe('useWorkspaceBacklinks', () => {
  it('creates empty labels from workspace and document state', () => {
    expect(createWorkspaceBacklinkEmptyLabel({ workspaceId: '', documentCount: 0 }))
      .toBe('문서를 저장하면 백링크를 찾을 수 있습니다.')
    expect(createWorkspaceBacklinkEmptyLabel({ workspaceId: 'target', documentCount: 1 }))
      .toBe('다른 페이지가 생기면 백링크를 추적할 수 있습니다.')
    expect(createWorkspaceBacklinkEmptyLabel({ workspaceId: 'target', documentCount: 2 }))
      .toBe('아직 이 페이지를 참조하는 다른 페이지가 없습니다.')
  })

  it('refreshes explicit and mentioned backlinks with partial failure feedback', async () => {
    const workspaceDocuments = ref([
      { id: 'target', title: 'Target', role: 'OWNER' },
      { id: 'explicit', title: 'Explicit source', role: 'READ' },
      { id: 'mention', title: 'Mention source', scope: 'shared', role: 'EDIT' },
      { id: 'nomatch', title: 'No match', role: 'READ' },
      { id: 'failed', title: 'Failed source', role: 'READ' },
    ])
    const fetchWorkspaceDocument = async (id) => {
      if (id === 'failed') throw new Error('network')
      if (id === 'explicit') {
        return {
          title: 'Explicit source',
          contents: snapshot([
            { type: 'paragraph', data: { text: '<a data-workspace-page-id="target">Target</a>' } },
          ]),
        }
      }
      if (id === 'mention') {
        return {
          title: 'Mention source',
          contents: snapshot([{ type: 'paragraph', data: { text: 'Target title mentioned here' } }]),
        }
      }
      return {
        title: 'No match',
        contents: snapshot([{ type: 'paragraph', data: { text: 'nothing useful' } }]),
      }
    }
    const subject = useWorkspaceBacklinks({
      workspaceId: ref('target'),
      workspaceDocuments,
      title: ref('Target title'),
      fetchWorkspaceDocument,
      now: () => '2026-07-04T00:00:00.000Z',
    })

    const result = await subject.refreshWorkspaceBacklinks()

    expect(result.map((document) => [document.id, document.backlinkSource])).toEqual([
      ['explicit', 'explicit'],
      ['mention', 'mention'],
    ])
    expect(subject.workspaceBacklinks.value).toHaveLength(2)
    expect(subject.workspaceBacklinkError.value).toBe('1개 문서의 백링크를 확인하지 못했습니다.')
    expect(subject.workspaceBacklinkRefreshedAt.value).toBe('2026-07-04T00:00:00.000Z')
    expect(subject.workspaceBacklinkLoading.value).toBe(false)
  })

  it('clears backlink state when the workspace has no id or candidates', async () => {
    const noWorkspace = useWorkspaceBacklinks({
      workspaceId: ref(''),
      workspaceDocuments: ref([{ id: 'target' }]),
      title: ref('Target'),
      fetchWorkspaceDocument: async () => ({}),
    })
    expect(await noWorkspace.refreshWorkspaceBacklinks()).toEqual([])
    expect(noWorkspace.workspaceBacklinks.value).toEqual([])

    const noCandidates = useWorkspaceBacklinks({
      workspaceId: ref('target'),
      workspaceDocuments: ref([{ id: 'target' }]),
      title: ref('Target'),
      fetchWorkspaceDocument: async () => ({}),
      now: () => '2026-07-04T01:00:00.000Z',
    })
    expect(await noCandidates.refreshWorkspaceBacklinks()).toEqual([])
    expect(noCandidates.workspaceBacklinkRefreshedAt.value).toBe('2026-07-04T01:00:00.000Z')
  })
})
