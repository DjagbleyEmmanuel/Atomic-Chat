import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { IconArrowDown } from '@tabler/icons-react'
import type { ComponentProps } from 'react'
import { useCallback, useEffect, memo, useRef } from 'react'
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom'
import {
  THREAD_SCROLL_BEHAVIOR,
  type ThreadScrollBehavior,
} from '@/constants/threadScroll'

export type ConversationProps = ComponentProps<typeof StickToBottom> & {
  scrollBehavior?: ThreadScrollBehavior
  // While a request is actively streaming, the spring "smooth" follow re-aims
  // its animation on every resize — a multi-frame spring running on the main
  // thread every token. Pin to instant during streaming so the UI stays
  // responsive; the configured behaviour applies once generation settles.
  streaming?: boolean
}

// Spring glide used for the "smooth" scroll preset. use-stick-to-bottom
// re-aims this animation on every resize, which turns the token-by-token
// content growth into a continuous, eased follow instead of page jumps.
const SMOOTH_SCROLL_RESIZE = { damping: 0.9, stiffness: 0.045, mass: 1.35 }

const scrollResizeFor = (
  behavior?: ThreadScrollBehavior,
  streaming?: boolean
): ComponentProps<typeof StickToBottom>['resize'] => {
  if (streaming) return 'instant'
  if (behavior === THREAD_SCROLL_BEHAVIOR.SMOOTH) {
    return SMOOTH_SCROLL_RESIZE
  }
  return 'instant'
}

export const Conversation = memo(
  ({ className, scrollBehavior, streaming, ...props }: ConversationProps) => (
    <StickToBottom
      className={cn('relative flex-1 overflow-y-hidden', className)}
      initial="instant"
      resize={scrollResizeFor(scrollBehavior, streaming)}
      role="log"
      {...props}
    />
  )
)

Conversation.displayName = 'Conversation'

export type ConversationContentProps = ComponentProps<
  typeof StickToBottom.Content
>

export const ConversationContent = memo(
  ({ className, ...props }: ConversationContentProps) => (
    <StickToBottom.Content
      className={cn('flex flex-col gap-x-8 gap-y-2 px-2', className)}
      {...props}
    />
  )
)

ConversationContent.displayName = 'ConversationContent'

export type ConversationAutoScrollProps = {
  trigger?: string
}

export const ConversationAutoScroll = ({
  trigger,
}: ConversationAutoScrollProps) => {
  const { scrollToBottom } = useStickToBottomContext()

  useEffect(() => {
    if (trigger) {
      scrollToBottom()
    }
  }, [scrollToBottom, trigger])

  return null
}

export type ConversationFollowProps = {
  isStreaming: boolean
  behavior?: ThreadScrollBehavior
}

/**
 * Applies FLOW-scroll semantics: once a reply starts streaming the viewport
 * stops chasing the growing content (the reply scrolls into view from below
 * instead). SMOOTH / STICKY presets keep auto-following, so this is a no-op.
 */
export const ConversationFollow = ({
  isStreaming,
  behavior,
}: ConversationFollowProps) => {
  const { stopScroll } = useStickToBottomContext()
  const streamingRef = useRef(false)

  useEffect(() => {
    if (behavior === THREAD_SCROLL_BEHAVIOR.FLOW) {
      if (isStreaming && !streamingRef.current) {
        streamingRef.current = true
        stopScroll()
      } else if (!isStreaming) {
        streamingRef.current = false
      }
    }
  }, [isStreaming, behavior, stopScroll])

  return null
}

export type ConversationEmptyStateProps = ComponentProps<'div'> & {
  title?: string
  description?: string
  icon?: React.ReactNode
}

export const ConversationEmptyState = ({
  className,
  title = 'No messages yet',
  description = 'Start a conversation to see messages here',
  icon,
  children,
  ...props
}: ConversationEmptyStateProps) => (
  <div
    className={cn(
      'flex size-full flex-col items-center justify-center gap-3 p-8 text-center',
      className
    )}
    {...props}
  >
    {children ?? (
      <>
        {icon && <div className="text-muted-foreground">{icon}</div>}
        <div className="space-y-1">
          <h3 className="font-medium text-sm">{title}</h3>
          {description && (
            <p className="text-muted-foreground text-sm">{description}</p>
          )}
        </div>
      </>
    )}
  </div>
)

export type ConversationScrollButtonProps = ComponentProps<typeof Button>

export const ConversationScrollButton = ({
  className,
  ...props
}: ConversationScrollButtonProps) => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext()

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom()
  }, [scrollToBottom])

  return (
    !isAtBottom && (
      <Button
        className={cn(
          'absolute bottom-4 left-[50%] translate-x-[-50%] rounded-full',
          className
        )}
        onClick={handleScrollToBottom}
        size="icon"
        type="button"
        variant="outline"
        {...props}
      >
        <IconArrowDown className="size-4" />
      </Button>
    )
  )
}
