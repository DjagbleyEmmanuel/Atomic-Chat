import {
  memo,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type UIEventHandler,
} from 'react'
import type { UIMessage, ChatStatus } from 'ai'
import { RenderMarkdown } from './RenderMarkdown'
import { useInterfaceSettings } from '@/hooks/useInterfaceSettings'
import { cn } from '@/lib/utils'
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
  ReasoningViewport,
} from '@/components/ai-elements/reasoning'
import { CopyButton } from './CopyButton'
import { useModelProvider } from '@/hooks/useModelProvider'
import {
  IconAlertCircle,
  IconMessageReply,
  IconPencil,
  IconRefresh,
} from '@tabler/icons-react'
import { AudioPlayer } from '@/containers/AudioPlayer'
import { InlineMessageEditor } from '@/containers/InlineMessageEditor'
import { DeleteMessageDialog } from '@/containers/dialogs/DeleteMessageDialog'
import TokenSpeedIndicator from '@/containers/TokenSpeedIndicator'
import { extractFilesFromPrompt, FileMetadata } from '@/lib/fileMetadata'
import { AttachmentChip } from '@/containers/AttachmentChip'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/i18n/react-i18next-compat'
import {
  buildTraceBlocks,
  isAgentTurnActive,
} from '@/lib/tools/message-trace-parts'
import type { AgentRunSummary } from '@/types/agent'
import { ToolActivityGroup } from '@/components/ai-elements/tools/activity-group'
import { TraceBlock } from '@/lib/tools/types'
import {
  agentFilePathFromHref,
  containsAgentFileLink,
  type AgentFileReference,
  extractAgentToolPaths,
  linkAgentFileReferences,
} from '@/lib/agent-file-links'
import { useServiceHub } from '@/hooks/useServiceHub'
import { agentErrorCopy } from '@/lib/agent-error-copy'
import { isPlatformTauri } from '@/lib/platform/utils'

const CHAT_STATUS = {
  STREAMING: 'streaming',
  SUBMITTED: 'submitted',
} as const

const CONTENT_TYPE = {
  TEXT: 'text',
  FILE: 'file',
} as const

type TextTraceBlock = Extract<TraceBlock, { kind: 'text' }>
type FileTraceBlock = Extract<TraceBlock, { kind: 'file' }>
type AudioTraceBlock = Extract<TraceBlock, { kind: 'audio' }>
type ActivityTraceBlock = Extract<TraceBlock, { kind: 'activity' }>
type ReasoningTraceBlock = Extract<TraceBlock, { kind: 'reasoning' }>

export type MessageItemProps = {
  message: UIMessage
  isFirstMessage: boolean
  isLastMessage: boolean
  status: ChatStatus
  requestActive?: boolean
  reasoningContainerRef?: React.RefObject<HTMLDivElement | null>
  onReasoningScroll?: UIEventHandler<HTMLDivElement>
  onRegenerate?: (messageId: string) => void
  onEdit?: (messageId: string, newText: string) => void
  onDelete?: (messageId: string) => void
  onReply?: (messageId: string, snippet: string) => void
  assistant?: { avatar?: React.ReactNode; name?: string }
  showAssistant?: boolean
  isAnimating?: boolean
  hideActions?: boolean
  agentAttachmentReferences?: readonly AgentFileReference[]
}

export const MessageItem = memo(
  ({
    message,
    isLastMessage,
    status,
    requestActive,
    isAnimating,
    hideActions,
    reasoningContainerRef,
    onReasoningScroll,
    onRegenerate,
    onEdit,
    onDelete,
    onReply,
    agentAttachmentReferences = [],
  }: MessageItemProps) => {
    const { t } = useTranslation('chat')
    const serviceHub = useServiceHub()
    const selectedModel = useModelProvider((state) => state.selectedModel)
    const messageDisplayMode = useInterfaceSettings(
      (state) => state.messageDisplayMode
    )
    const [previewImage, setPreviewImage] = useState<{
      url: string
      filename?: string
    } | null>(null)
    const [longTextExpanded, setLongTextExpanded] = useState(false)

    // Reply-to selection UI: when the user highlights text inside a message,
    // show a floating reply chip near the selection. Clicking it quotes the
    // highlighted words.
    const contentRef = useRef<HTMLDivElement>(null)
    const [replySelection, setReplySelection] = useState<{
      x: number
      y: number
      text: string
    } | null>(null)

    useEffect(() => {
      if (!replySelection) return
      const dismiss = () => setReplySelection(null)
      document.addEventListener('mousedown', dismiss)
      window.addEventListener('scroll', dismiss, true)
      return () => {
        document.removeEventListener('mousedown', dismiss)
        window.removeEventListener('scroll', dismiss, true)
      }
    }, [replySelection])

    const handleContentMouseUp = useCallback(() => {
      const selection = window.getSelection()
      const text = selection?.toString().trim()
      if (
        !text ||
        !selection ||
        !selection.anchorNode ||
        !contentRef.current?.contains(selection.anchorNode)
      ) {
        setReplySelection(null)
        return
      }
      if (selection.rangeCount === 0) {
        setReplySelection(null)
        return
      }
      const rect = selection.getRangeAt(0).getBoundingClientRect()
      if (!rect || (rect.width === 0 && rect.height === 0)) {
        setReplySelection(null)
        return
      }
      setReplySelection({
        x: rect.left,
        y: rect.top - 8,
        text: text.slice(0, 400),
      })
    }, [])

    // Editing state is deliberately local: the memo comparator below does not
    // compare `onEdit` or any edit prop, so an `editingMessageId` lifted to the
    // thread route would go stale for every non-last message.
    const [isEditing, setIsEditing] = useState(false)

    const handleRegenerate = useCallback(() => {
      onRegenerate?.(message.id)
    }, [onRegenerate, message.id])

    const handleEditSave = useCallback(
      (newText: string) => {
        setIsEditing(false)
        onEdit?.(message.id, newText)
      },
      [onEdit, message.id]
    )

    const handleEditCancel = useCallback(() => setIsEditing(false), [])

    const handleDelete = useCallback(() => {
      onDelete?.(message.id)
    }, [onDelete, message.id])

    const getThinkingMessage = useCallback(
      (thinking: boolean, duration?: number) => {
        if (thinking) {
          return t('activity.thinkingFor', { count: duration ?? 1 })
        }
        if (duration === undefined) {
          return t('activity.reasoned')
        }
        return t('activity.thoughtFor', { count: duration })
      },
      [t]
    )

    const isStreaming = isLastMessage && status === CHAT_STATUS.STREAMING
    const agentRunStatus = (
      message.metadata as { agent_run?: AgentRunSummary } | undefined
    )?.agent_run?.status
    // Agent metadata owns its lifecycle; Chat's transport flags can lag a
    // terminal agent event or go idle while permission is being requested.
    const isRequestActive =
      isLastMessage &&
      message.role === 'assistant' &&
      (agentRunStatus !== undefined
        ? isAgentTurnActive(agentRunStatus)
        : (requestActive ??
          (status === CHAT_STATUS.STREAMING ||
            status === CHAT_STATUS.SUBMITTED)))
    const isAgentMessage = Boolean(
      (message.metadata as { agent_run?: unknown } | undefined)?.agent_run
    )
    const messageModelId =
      !isAgentMessage &&
      (message.metadata as Record<string, unknown> | undefined)?.model
    const modelLabel =
      typeof messageModelId === 'string'
        ? messageModelId.split(/[\\/]/).pop() || messageModelId
        : undefined
    const agentFileReferences = useMemo(
      () =>
        isAgentMessage
          ? [
              ...agentAttachmentReferences,
              ...extractAgentToolPaths(message.parts),
            ]
          : [],
      [agentAttachmentReferences, isAgentMessage, message.parts]
    )
    const messageMarkdownComponents = useMemo(
      () => ({
        a: ({
          href,
          children,
          target,
          rel,
          ...props
        }: ComponentPropsWithoutRef<'a'>) => {
          const filePath = href ? agentFilePathFromHref(href) : null
          if (!filePath) {
            return (
              <a
                href={href}
                target={target ?? '_blank'}
                rel={rel ?? 'noopener noreferrer'}
                {...props}
              >
                {children}
              </a>
            )
          }

          return (
            <a
              href={href}
              {...props}
              className={cn(
                'font-medium text-blue-600 underline decoration-blue-500/40 underline-offset-2 hover:decoration-blue-600 focus-visible:decoration-blue-600 dark:text-blue-400 dark:hover:decoration-blue-400',
                props.className
              )}
              onClick={(event) => {
                event.preventDefault()
                if (!isPlatformTauri()) return
                void serviceHub
                  .opener()
                  .openPath(filePath)
                  .catch((error) => {
                    console.error('Failed to open Agent file:', error)
                  })
              }}
            >
              {children}
            </a>
          )
        },
      }),
      [serviceHub]
    )

    // Extract file metadata from message text (for user messages with attachments)
    const attachedFiles = useMemo(() => {
      if (message.role !== 'user') return []

      const textParts = message.parts.filter(
        (part): part is { type: 'text'; text: string } =>
          part.type === CONTENT_TYPE.TEXT
      )

      if (textParts.length === 0) return []

      const { files } = extractFilesFromPrompt(textParts[0].text)
      return files
    }, [message.parts, message.role])

    // Get full text content for copy button
    const getFullTextContent = useCallback(() => {
      return message.parts
        .filter(
          (part): part is { type: 'text'; text: string } =>
            part.type === CONTENT_TYPE.TEXT
        )
        .map((part) => part.text)
        .join('\n')
    }, [message.parts])

    // A reply message starts with a markdown blockquote (the quoted text the
    // composer prepends when replying). Extract that snippet for the badge.
    const extractReplyQuote = useCallback((text: string): string | undefined => {
      const quoteLines: string[] = []
      for (const raw of text.split('\n')) {
        const line = raw.trimStart()
        if (line.startsWith('>')) {
          quoteLines.push(line.slice(1).trim())
        } else if (quoteLines.length > 0) {
          break
        } else if (line) {
          return undefined
        }
      }
      if (quoteLines.length === 0) return undefined
      const snippet = quoteLines.filter(Boolean).join(' ')
      return snippet.slice(0, 140)
    }, [])

    // Remove the leading blockquote lines (plus any blank separator) so the
    // quoted text is only shown in the reply badge, not duplicated in the body.
    const stripLeadingReplyQuote = useCallback((text: string): string => {
      const lines = text.split('\n')
      let index = 0
      while (index < lines.length && lines[index].trimStart().startsWith('>')) {
        index++
      }
      while (index < lines.length && !lines[index].trim()) {
        index++
      }
      return lines.slice(index).join('\n').trim()
    }, [])

    const handleReplyFromSelection = useCallback(() => {
      const selected = replySelection?.text
      setReplySelection(null)
      onReply?.(message.id, selected || getFullTextContent())
    }, [replySelection, onReply, message.id, getFullTextContent])

    const handleReplyToMessage = useCallback(() => {
      setReplySelection(null)
      onReply?.(message.id, getFullTextContent())
    }, [onReply, message.id, getFullTextContent])

    const renderEditor = (key: string) => {
      const editor = (
        <InlineMessageEditor
          initialText={getFullTextContent()}
          onSave={handleEditSave}
          onCancel={handleEditCancel}
        />
      )

      if (message.role !== 'user') {
        return (
          <div key={key} className="w-full">
            {editor}
          </div>
        )
      }

      return (
        <div key={key} className="w-full">
          <div className="flex justify-end w-full text-start">
            {/* `w-full` instead of the bubble's `inline-block`, so clearing the
                text does not collapse the box to caret width. */}
            <div className="bg-secondary relative text-foreground p-2 rounded-md w-full max-w-[80%]">
              {attachedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {attachedFiles.map((file: FileMetadata, idx: number) => (
                    <AttachmentChip
                      key={`file-${idx}-${file.id}`}
                      name={file.name}
                      fileType={file.type}
                      size={file.size}
                    />
                  ))}
                </div>
              )}
              {editor}
            </div>
          </div>
        </div>
      )
    }

    const renderTextBlock = (block: TextTraceBlock, index: number) => {
      const isLastBlock = index === traceBlocks.length - 1
      const displayText =
        message.role === 'user'
          ? extractFilesFromPrompt(block.text).cleanPrompt
          : block.text

      if (
        !displayText.trim() &&
        message.role === 'user' &&
        attachedFiles.length === 0
      ) {
        return null
      }

      const isCollapsible = !isStreaming && displayText.length > 2400
      const clampBody = isCollapsible && !longTextExpanded

      // The editor owns the whole message text, because that is what the save
      // handler writes back: a single text part. So only the first text block
      // turns into an editor, and the rest are folded into it.
      if (isEditing) {
        if (block.key !== firstTextBlockKey) return null
        return renderEditor(block.key)
      }

      const assistantText =
        message.role === 'assistant'
          ? linkAgentFileReferences(
              block.text,
              isAgentMessage ? agentFileReferences : []
            )
          : block.text

      return (
        <div key={block.key} className="w-full">
          {message.role === 'user' ? (
            <div className="flex justify-end w-full h-full text-start wrap-break-word whitespace-normal">
              <div className="bg-secondary relative text-foreground p-2 rounded-md inline-block max-w-[80%]">
                {attachedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {attachedFiles.map((file: FileMetadata, idx: number) => (
                      <AttachmentChip
                        key={`file-${idx}-${file.id}`}
                        name={file.name}
                        fileType={file.type}
                        size={file.size}
                      />
                    ))}
                  </div>
                )}
                {(() => {
                  const replyQuote =
                    message.role === 'user'
                      ? extractReplyQuote(displayText)
                      : undefined
                  // The quote is shown in the badge; drop the leading
                  // blockquote from the body so it isn't duplicated.
                  const bodyText = replyQuote
                    ? stripLeadingReplyQuote(displayText)
                    : displayText
                  return (
                    <>
                      {replyQuote && (
                        <div className="mb-1.5 flex items-center gap-1.5 rounded-md border border-border/70 bg-background/60 px-2 py-1 text-xs text-muted-foreground max-w-full">
                          <IconMessageReply
                            size={12}
                            className="shrink-0 text-primary"
                          />
                          <span className="truncate">{replyQuote}</span>
                        </div>
                      )}
                      {bodyText && (
                        <div
                          dir="auto"
                          className={cn(
                            'relative select-text whitespace-pre-wrap',
                            clampBody && 'max-h-64 overflow-hidden'
                          )}
                        >
                          {bodyText}
                          {clampBody && (
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-secondary to-transparent" />
                          )}
                        </div>
                      )}
                      {isCollapsible && (
                        <button
                          type="button"
                          onClick={() => setLongTextExpanded((v) => !v)}
                          className="mt-1 text-xs font-medium text-primary hover:underline"
                        >
                          {longTextExpanded ? 'Show less' : 'Show more'}
                        </button>
                      )}
                    </>
                  )
                })()}
              </div>
            </div>
          ) : (
            <>
              <div
                className={cn(
                  'relative',
                  clampBody && 'max-h-96 overflow-hidden'
                )}
              >
                <RenderMarkdown
                  content={assistantText}
                  components={
                    isAgentMessage || containsAgentFileLink(assistantText)
                      ? messageMarkdownComponents
                      : undefined
                  }
                  // The thread page reports `submitted` for the whole request, so
                  // `status === 'streaming'` alone would leave HTML artifacts
                  // thinking they are complete and re-render the iframe per token.
                  isStreaming={(isStreaming || isRequestActive) && isLastBlock}
                  messageId={message.id}
                  isAnimating={isAnimating}
                  enableHtmlPreview
                  displayMode={messageDisplayMode}
                />
                {clampBody && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent" />
                )}
              </div>
              {isCollapsible && (
                <button
                  type="button"
                  onClick={() => setLongTextExpanded((v) => !v)}
                  className="mt-1 text-xs font-medium text-primary hover:underline"
                >
                  {longTextExpanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </>
          )}
        </div>
      )
    }

    const renderFileBlock = (block: FileTraceBlock) => {
      return (
        <div
          key={block.key}
          className={cn(
            'flex w-full mt-2 mb-2',
            message.role === 'user' ? 'justify-end' : 'justify-start'
          )}
        >
          <button
            type="button"
            className="block overflow-hidden rounded-md border border-border max-w-[80%] cursor-pointer"
            onClick={() =>
              setPreviewImage({ url: block.url, filename: block.filename })
            }
          >
            <img
              src={block.url}
              alt={block.filename || 'Attached image'}
              className="max-h-80 w-auto object-contain"
            />
          </button>
        </div>
      )
    }

    const renderAudioBlock = (block: AudioTraceBlock) => {
      return (
        <div
          key={block.key}
          className={cn(
            'flex w-full mt-2 mb-2',
            message.role === 'user' ? 'justify-end' : 'justify-start'
          )}
        >
          <AudioPlayer
            src={block.url}
            mediaType={block.mediaType}
            filename={block.filename}
            className="w-80 max-w-[80%]"
          />
        </div>
      )
    }

    const renderReasoningBlock = (block: ReasoningTraceBlock) => {
      // A reasoning part commonly reports `done` while the same turn pauses
      // for tools. The disclosure belongs to the enclosing turn, so it must
      // not finalize and restart as individual reasoning parts come and go.
      const reasoningActive = isRequestActive

      return (
        <Reasoning
          key={block.key}
          className="mb-5"
          isStreaming={reasoningActive}
          defaultOpen={false}
        >
          <ReasoningTrigger getThinkingMessage={getThinkingMessage} />
          <ReasoningViewport
            ref={reasoningActive ? reasoningContainerRef : null}
            onScroll={reasoningActive ? onReasoningScroll : undefined}
          >
            <ReasoningContent isStreaming={reasoningActive}>
              {block.items.map((item) => item.text).join('\n\n')}
            </ReasoningContent>
          </ReasoningViewport>
        </Reasoning>
      )
    }

    const renderActivityBlock = (block: ActivityTraceBlock) => {
      const active = isRequestActive
      const error = block.agentSummary?.error
      // Pending agent calls already have input-available parts. Permission
      // waits must still say Working until the run resumes executing them.
      const awaitingPermission =
        agentRunStatus === 'awaiting_approval' ||
        agentRunStatus === 'awaiting_folder_access'

      if (!block.tools.length && !error && !active) {
        return null
      }

      return (
        <div key={block.key} className="not-prose mb-3">
          {(block.tools.length > 0 || active) && (
            <ToolActivityGroup
              tools={block.tools}
              active={active}
              working={awaitingPermission}
              onRetry={onRegenerate ? handleRegenerate : undefined}
            />
          )}
          {error &&
            (() => {
              const copy = agentErrorCopy(error)
              return (
                <div
                  role="alert"
                  className="mt-3 flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3"
                  data-testid="agent-error-card"
                >
                  <IconAlertCircle
                    size={18}
                    className="mt-0.5 shrink-0 text-destructive"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{t(copy.titleKey)}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {t(copy.bodyKey)}
                    </p>
                  </div>
                  {onRegenerate && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRegenerate}
                    >
                      {t('chat:agentError.retry')}
                    </Button>
                  )}
                </div>
              )
            })()}
        </div>
      )
    }

    const traceBlocks = useMemo(
      () =>
        buildTraceBlocks(message, {
          ensureActivity: isRequestActive,
        }),
      [message, isRequestActive]
    )

    // A message with only attachments has no text block to anchor the editor
    // to — `buildTraceBlocks` drops blank text parts — so it gets a standalone
    // editor appended below the blocks instead.
    const firstTextBlockKey = useMemo(
      () => traceBlocks.find((block) => block.kind === 'text')?.key,
      [traceBlocks]
    )

    return (
      <div className="w-full mb-4" ref={contentRef} onMouseUp={handleContentMouseUp}>
        {/* Render message parts */}
        {traceBlocks.map((block, index) => {
          switch (block.kind) {
            case 'text':
              return renderTextBlock(block, index)
            case 'file':
              return renderFileBlock(block)
            case 'audio':
              return renderAudioBlock(block)
            case 'reasoning':
              return renderReasoningBlock(block)
            case 'activity':
              return renderActivityBlock(block)
            default:
              return null
          }
        })}

        {isEditing && !firstTextBlockKey && renderEditor('inline-editor')}

        {/* Message actions for user messages */}
        {message.role === 'user' && !hideActions && !isEditing && (
          <div className="flex items-center justify-end gap-1 text-muted-foreground text-xs mt-4">
            {onReply && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleReplyToMessage}
                title={t('common:reply')}
              >
                <IconMessageReply size={16} />
              </Button>
            )}

            <CopyButton text={getFullTextContent()} />

            {onEdit && status !== CHAT_STATUS.STREAMING && (
              <Button
                variant="ghost"
                size="icon-xs"
                role="button"
                tabIndex={0}
                disabled={!selectedModel}
                title={t('common:editMessage')}
                aria-label={t('common:editMessage')}
                onClick={() => setIsEditing(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setIsEditing(true)
                  }
                }}
              >
                <IconPencil size={16} />
              </Button>
            )}

            {onDelete && status !== CHAT_STATUS.STREAMING && (
              <DeleteMessageDialog onDelete={handleDelete} />
            )}
          </div>
        )}

        {/* Message actions for assistant messages (non-tool) */}
        {message.role === 'assistant' && (
          <div
            className="mt-3 flex min-h-6 flex-wrap items-center gap-2 text-xs text-muted-foreground"
            data-testid="assistant-message-actions"
          >
            <div
              className={cn(
                'flex items-center gap-1',
                (isRequestActive || hideActions || isEditing) && 'hidden'
              )}
            >
              <CopyButton text={getFullTextContent()} />

              {onReply && !isStreaming && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleReplyToMessage}
                  title={t('common:reply')}
                >
                  <IconMessageReply size={16} />
                </Button>
              )}

              {onEdit && !isStreaming && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  role="button"
                  tabIndex={0}
                  title={t('common:editMessage')}
                  aria-label={t('common:editMessage')}
                  onClick={() => setIsEditing(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setIsEditing(true)
                    }
                  }}
                >
                  <IconPencil size={16} />
                </Button>
              )}

              {onDelete && !isStreaming && (
                <DeleteMessageDialog onDelete={handleDelete} />
              )}

              {selectedModel &&
                onRegenerate &&
                !isStreaming &&
                isLastMessage && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={handleRegenerate}
                    title="Regenerate response"
                  >
                    <IconRefresh size={16} />
                  </Button>
                )}
            </div>

            {modelLabel && !isStreaming && (
              <span
                title={typeof messageModelId === 'string' ? messageModelId : undefined}
                className="inline-flex max-w-[180px] items-center truncate rounded-full border border-border bg-background/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80"
              >
                {modelLabel}
              </span>
            )}

            {!isRequestActive && (
              <TokenSpeedIndicator
                streaming={false}
                metadata={
                  message.metadata as Record<string, unknown> | undefined
                }
              />
            )}
          </div>
        )}

        {/* Floating reply chip for highlighted text */}
        {replySelection && onReply && (
          <div
            className="fixed z-50"
            style={{ left: replySelection.x, top: replySelection.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
              <Button
                variant="secondary"
                size="sm"
                className="shadow-md"
                onClick={handleReplyFromSelection}
              >
                <IconMessageReply size={14} className="mr-1" />
                {t('common:reply')}
              </Button>
          </div>
        )}

        {/* Image Preview Dialog */}
        {previewImage && (
          <div
            className="fixed inset-0 z-100 bg-black/50 backdrop-blur-md flex items-center justify-center cursor-pointer"
            onClick={() => setPreviewImage(null)}
          >
            <img
              src={previewImage.url}
              alt={previewImage.filename || 'Preview'}
              className="max-h-[90vh] max-w-[90vw] object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </div>
    )
  },
  (prevProps, nextProps) => {
    // Always re-render if streaming and this is the last message
    if (
      nextProps.isLastMessage &&
      (nextProps.status === CHAT_STATUS.STREAMING ||
        nextProps.status === CHAT_STATUS.SUBMITTED)
    ) {
      return false
    }

    return (
      prevProps.message === nextProps.message &&
      prevProps.isFirstMessage === nextProps.isFirstMessage &&
      prevProps.isLastMessage === nextProps.isLastMessage &&
      prevProps.status === nextProps.status &&
      prevProps.requestActive === nextProps.requestActive &&
      prevProps.onReply === nextProps.onReply &&
      prevProps.showAssistant === nextProps.showAssistant &&
      prevProps.hideActions === nextProps.hideActions &&
      prevProps.onReasoningScroll === nextProps.onReasoningScroll &&
      prevProps.agentAttachmentReferences ===
        nextProps.agentAttachmentReferences
    )
  }
)

MessageItem.displayName = 'MessageItem'
