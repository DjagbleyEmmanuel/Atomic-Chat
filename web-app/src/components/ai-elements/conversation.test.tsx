import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Conversation } from './conversation'

vi.mock('use-stick-to-bottom', () => {
  const StickToBottom = ({
    children,
    initial,
    resize,
    ...props
  }: React.ComponentProps<'div'> & {
    initial?: string
    resize?: string | Record<string, number>
  }) => (
    <div
      data-initial={initial}
      data-resize={typeof resize === 'string' ? resize : 'spring'}
      {...props}
    >
      {children}
    </div>
  )

  StickToBottom.Content = ({ children }: React.ComponentProps<'div'>) => (
    <div>{children}</div>
  )

  return {
    StickToBottom,
    useStickToBottomContext: () => ({
      isAtBottom: true,
      scrollToBottom: vi.fn(),
    }),
  }
})

describe('Conversation', () => {
  it('defaults to an instant resize so streaming token growth does not restart a fresh animation on every resize', () => {
    render(<Conversation>Message</Conversation>)

    const conversation = screen.getByRole('log')
    expect(conversation).toHaveAttribute('data-initial', 'instant')
    expect(conversation).toHaveAttribute('data-resize', 'instant')
  })

  it('uses a spring resize for the smooth scroll preset', () => {
    render(
      <Conversation scrollBehavior="smooth">Message</Conversation>
    )

    const conversation = screen.getByRole('log')
    expect(conversation).toHaveAttribute('data-initial', 'instant')
    expect(conversation).toHaveAttribute('data-resize', 'spring')
  })
})
