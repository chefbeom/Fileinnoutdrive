import { describe, expect, it } from 'vitest'

import {
  createWorkspaceCalendarFilterOptions,
  createWorkspaceCalendarItems,
  createWorkspaceTimelineFilterOptions,
  createWorkspaceTimelineItems,
  createWorkspaceTimelineRange,
  filterWorkspaceCalendarItems,
  filterWorkspaceTimelineItems,
  getWorkspaceCalendarEmptyLabel,
  getWorkspaceTimelineEmptyLabel,
  groupWorkspaceCalendarItems,
  groupWorkspaceTimelineItems,
  workspaceCalendarDateLabel,
  workspaceScheduleDateTime,
  workspaceTimelineDaySpan,
  workspaceTimelineItemOffsetStyle,
} from './workspaceSchedule.js'

const pageRows = [
  {
    id: 1,
    title: 'My page',
    dueDate: '2026-07-03',
    isOverdue: false,
    status: 'active',
    ownerEmail: 'me@example.com',
    scopeLabel: '내 문서',
    roleLabel: '쓰기',
  },
  {
    id: 2,
    title: 'Done page',
    dueDate: '2026-07-02',
    isOverdue: true,
    status: 'done',
    ownerEmail: 'other@example.com',
    scopeLabel: '공유',
    roleLabel: '읽기',
  },
]

const indexedTasks = [
  {
    id: 'task-a',
    text: 'Open task',
    dueDate: '2026-07-02',
    isOverdue: true,
    checked: false,
    isMine: true,
    documentTitle: 'My page',
    pathLabel: '본문',
  },
  {
    id: 'task-b',
    text: 'No due task',
    dueDate: '',
    checked: false,
  },
]

describe('workspaceSchedule', () => {
  it('formats schedule dates with today/tomorrow shortcuts and handles invalid values', () => {
    expect(workspaceScheduleDateTime('not-a-date')).toBe(Number.POSITIVE_INFINITY)
    expect(workspaceCalendarDateLabel('', { todayKey: '2026-07-02' })).toBe('기한 없음')
    expect(workspaceCalendarDateLabel('bad-value', { todayKey: '2026-07-02' })).toBe('bad-value')
    expect(workspaceCalendarDateLabel('2026-07-02', { todayKey: '2026-07-02' })).toBe('오늘')
    expect(workspaceCalendarDateLabel('2026-07-03', { todayKey: '2026-07-02' })).toBe('내일')
  })

  it('creates sorted page and task calendar items', () => {
    const items = createWorkspaceCalendarItems(pageRows, indexedTasks, 'me@example.com')

    expect(items.map((item) => item.id)).toEqual(['task:task-a', 'page:2', 'page:1'])
    expect(items[0]).toMatchObject({ type: 'task', typeLabel: '작업', title: 'Open task', isMine: true })
    expect(items[2]).toMatchObject({ type: 'page', typeLabel: '페이지', title: 'My page', isMine: true })
  })

  it('filters and groups calendar items by the active calendar filter', () => {
    const items = createWorkspaceCalendarItems(pageRows, indexedTasks, 'me@example.com')

    expect(filterWorkspaceCalendarItems(items, 'overdue').map((item) => item.id)).toEqual(['task:task-a', 'page:2'])
    expect(filterWorkspaceCalendarItems(items, 'mine').map((item) => item.id)).toEqual(['task:task-a', 'page:1'])
    expect(filterWorkspaceCalendarItems(items, 'pages').map((item) => item.id)).toEqual(['page:2', 'page:1'])
    expect(filterWorkspaceCalendarItems(items, 'upcoming', '2026-07-02').map((item) => item.id)).toEqual(['page:1'])

    const groups = groupWorkspaceCalendarItems(items, { todayKey: '2026-07-02' })
    expect(groups.map((group) => [group.id, group.label, group.items.length])).toEqual([
      ['2026-07-02', '오늘', 2],
      ['2026-07-03', '내일', 1],
    ])
  })


  it('creates calendar and timeline filter options and empty labels', () => {
    const calendarItems = createWorkspaceCalendarItems(pageRows, indexedTasks, 'me@example.com')
    const upcomingItems = filterWorkspaceCalendarItems(calendarItems, 'upcoming', '2026-07-02')
    const overdueCalendarItems = filterWorkspaceCalendarItems(calendarItems, 'overdue')
    const myCalendarItems = filterWorkspaceCalendarItems(calendarItems, 'mine')
    const timelineItems = createWorkspaceTimelineItems(calendarItems)
    const openTimelineItems = filterWorkspaceTimelineItems(timelineItems, 'open')
    const overdueTimelineItems = filterWorkspaceTimelineItems(timelineItems, 'overdue')
    const myTimelineItems = filterWorkspaceTimelineItems(timelineItems, 'mine')

    expect(createWorkspaceCalendarFilterOptions({
      allItems: calendarItems,
      upcomingItems,
      overdueItems: overdueCalendarItems,
      myItems: myCalendarItems,
    })).toEqual([
      { id: 'upcoming', label: '예정', count: 1 },
      { id: 'overdue', label: '지연', count: 2 },
      { id: 'mine', label: '내 일정', count: 2 },
      { id: 'pages', label: '페이지', count: 2 },
      { id: 'tasks', label: '작업', count: 1 },
      { id: 'all', label: '전체', count: 3 },
    ])
    expect(createWorkspaceTimelineFilterOptions({
      allItems: timelineItems,
      openItems: openTimelineItems,
      overdueItems: overdueTimelineItems,
      myItems: myTimelineItems,
    })).toEqual([
      { id: 'open', label: '열림', count: 2 },
      { id: 'overdue', label: '지연', count: 1 },
      { id: 'mine', label: '내 일정', count: 2 },
      { id: 'pages', label: '페이지', count: 2 },
      { id: 'tasks', label: '작업', count: 1 },
      { id: 'all', label: '전체', count: 3 },
    ])
    expect(getWorkspaceCalendarEmptyLabel({ itemCount: 0, filter: 'upcoming' })).toBe('기한이 지정된 페이지나 작업이 없습니다.')
    expect(getWorkspaceCalendarEmptyLabel({ itemCount: 3, filter: 'mine' })).toBe('내게 배정된 일정이 없습니다.')
    expect(getWorkspaceTimelineEmptyLabel({ itemCount: 0, filter: 'open' })).toBe('타임라인에 표시할 기한이 없습니다.')
    expect(getWorkspaceTimelineEmptyLabel({ itemCount: 3, filter: 'overdue' })).toBe('지연된 타임라인 항목이 없습니다.')
  })
  it('creates timeline items, range, grouped rows, and offset style', () => {
    const calendarItems = createWorkspaceCalendarItems(pageRows, indexedTasks, 'me@example.com')
    const timelineItems = createWorkspaceTimelineItems(calendarItems)
    const visibleItems = filterWorkspaceTimelineItems(timelineItems, 'open')
    const range = createWorkspaceTimelineRange(visibleItems)

    expect(workspaceTimelineDaySpan(timelineItems[0].time, timelineItems[2].time)).toBe(1)
    expect(visibleItems.map((item) => item.id)).toEqual(['task:task-a', 'page:1'])
    expect(range).toMatchObject({ daySpan: 1, summaryLabel: '하루 범위' })
    expect(groupWorkspaceTimelineItems(timelineItems).map((group) => [group.id, group.items.length])).toEqual([
      ['2026-07', 3],
    ])
    expect(workspaceTimelineItemOffsetStyle(visibleItems[1], range)).toEqual({
      '--workspace-timeline-offset': '100.00%',
    })
  })
})