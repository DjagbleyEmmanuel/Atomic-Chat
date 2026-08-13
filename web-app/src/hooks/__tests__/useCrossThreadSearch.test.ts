import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useCrossThreadSearch } from '../useCrossThreadSearch'
import { useThreads } from '../useThreads'
import { useMessages } from '../useMessages'
import { seedServiceHub } from '@/test/service-hub'
import type { MessagesService } from '@/services/messages/types'
import { ContentType, ThreadMessage } from '@janhq/core'
import { TEMPORARY_CHAT_ID } from '@/constants/chat'

const mockFetchMessages = vi.fn()

const makeMessage = (id: string, threadId: string, role: string, text: string): ThreadMessage => ({
  id,
  thread_id: threadId,
  object: 'thread.message',
  role,
  content: [
    {
      type: ContentType.Text,
      text: { value: text, annotations: [] },
    },
  ],
  status: 'ready',
  created_at: Date.now(),
  completed_at: Date.now(),
})

describe('useCrossThreadSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    seedServiceHub({
      messages: {
        fetchMessages: mockFetchMessages,
      } as MessagesService,
    })
    useThreads.setState({ threads: {} })
    useMessages.setState({ messages: {} })
  })

  it('returns no matches for an empty query', () => {
    const { result } = renderHook(() => useCrossThreadSearch())
    expect(result.current.matches).toEqual([])
  })

  it('finds matches across threads in already-loaded messages', async () => {
    useThreads.setState({
      threads: {
        'thread-a': { id: 'thread-a', title: 'Alpha' } as never,
        'thread-b': { id: 'thread-b', title: 'Beta' } as never,
      },
    })
    useMessages.setState({
      messages: {
        'thread-a': [makeMessage('m1', 'thread-a', 'user', 'hello world')],
        'thread-b': [
          makeMessage('m2', 'thread-b', 'assistant', 'nothing here'),
        ],
      },
    })

    const { result } = renderHook(() => useCrossThreadSearch())

    act(() => {
      result.current.setSearchQuery('hello')
    })

    await waitFor(() => {
      expect(result.current.matches.length).toBeGreaterThan(0)
    })

    expect(result.current.matches[0]).toMatchObject({
      threadId: 'thread-a',
      threadTitle: 'Alpha',
      messageId: 'm1',
      snippet: expect.stringContaining('hello world'),
    })
  })

  it('lazy-loads messages for threads not yet in the store', async () => {
    useThreads.setState({
      threads: {
        'thread-a': { id: 'thread-a', title: 'Alpha' } as never,
      },
    })
    mockFetchMessages.mockResolvedValue([
      makeMessage('m1', 'thread-a', 'user', 'unique needle phrase'),
    ])

    const { result } = renderHook(() => useCrossThreadSearch())

    act(() => {
      result.current.setSearchQuery('needle')
    })

    await waitFor(() => {
      expect(mockFetchMessages).toHaveBeenCalledWith('thread-a')
    })
    await waitFor(() => {
      expect(result.current.matches.length).toBeGreaterThan(0)
    })

    expect(result.current.matches[0].messageId).toBe('m1')
  })

  it('ignores temporary chat and system messages', async () => {
    useThreads.setState({
      threads: {
        [TEMPORARY_CHAT_ID]: { id: TEMPORARY_CHAT_ID, title: 'Temp' } as never,
        'thread-a': { id: 'thread-a', title: 'Alpha' } as never,
      },
    })
    useMessages.setState({
      messages: {
        [TEMPORARY_CHAT_ID]: [
          makeMessage('temp1', TEMPORARY_CHAT_ID, 'user', 'secret term'),
        ],
        'thread-a': [
          makeMessage('sys1', 'thread-a', 'system', 'secret term'),
        ],
      },
    })

    const { result } = renderHook(() => useCrossThreadSearch())

    act(() => {
      result.current.setSearchQuery('secret')
    })

    await waitFor(() => {
      expect(result.current.matches).toEqual([])
    })
  })
})
