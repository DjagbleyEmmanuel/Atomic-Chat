import { Components } from 'react-markdown'
import {
  isValidElement,
  memo,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import { cn, disableIndentedCodeBlockPlugin } from '@/lib/utils'
import { closeUnclosedCodeFence } from '@/lib/code-fence'
import { ttftEnabled, ttftMark, ttftReport } from '@/lib/ttft-timing'
import { CodeBlock } from '@/components/ai-elements/code-block'
import {
  type BundledLanguage,
  bundledLanguagesInfo,
} from 'shiki'
// import 'katex/dist/katex.min.css'
import {
  defaultRehypePlugins,
  Streamdown,
  type MermaidErrorComponentProps,
} from 'streamdown'
import { cjk } from '@streamdown/cjk'
import { code } from '@streamdown/code'
import { mermaid } from '@streamdown/mermaid'

import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { MermaidError } from '@/components/MermaidError'
import { ArtifactTrigger } from './ArtifactPanel'
import type { MessageDisplayMode } from '@/hooks/useInterfaceSettings'

interface MarkdownProps {
  content: string
  className?: string
  components?: Components
  isUser?: boolean
  isStreaming?: boolean
  messageId?: string
  isAnimating?: boolean
  enableHtmlPreview?: boolean
  allowRawHtml?: boolean
  displayMode?: MessageDisplayMode
}

const HTML_LANGUAGES = new Set(['html', 'htm'])

// Stable plugin configuration shared by the top-level renderer and the nested
// renderer used to delegate non-HTML code blocks back to streamdown.
const REMARK_PLUGINS = [remarkGfm, remarkMath, disableIndentedCodeBlockPlugin]
const REHYPE_PLUGINS = [rehypeKatex, defaultRehypePlugins.harden]
const REHYPE_PLUGINS_WITH_RAW_HTML = [
  defaultRehypePlugins.raw,
  defaultRehypePlugins.sanitize,
  defaultRehypePlugins.harden,
  rehypeKatex,
]
const STREAMDOWN_PLUGINS = { code, mermaid, cjk }
const STREAMDOWN_CONTROLS = { mermaid: { fullscreen: false } }

// Shiki resolves language ids and aliases; unknown langs make codeToHtml throw,
// so only highlight when the fence's info string maps to a real bundled lang.
const SHIKI_LANG_IDS = new Set<string>(
  bundledLanguagesInfo.flatMap((info) => [info.id, ...(info.aliases ?? [])])
)

/** Pick a fence longer than any backtick run inside the code. */
function makeFence(source: string): string {
  const runs = source.match(/`+/g)
  let longest = 0
  if (runs) {
    for (const run of runs) longest = Math.max(longest, run.length)
  }
  return '`'.repeat(Math.max(3, longest + 1))
}

// Some models emit a full HTML document as raw text (no ```html fence),
// especially when asked to "output only the document". Wrap it in a fence so
// the artifact pipeline still renders a preview. Conservative: only when the
// document is at the very start, and never when already fenced.
function wrapBareHtmlDocument(content: string): string {
  const leading = content.match(/^\s*/)?.[0] ?? ''
  const rest = content.slice(leading.length)
  if (rest.startsWith('```')) return content
  const lower = rest.toLowerCase()
  if (!lower.startsWith('<!doctype html') && !lower.startsWith('<html')) {
    return content
  }
  const fence = makeFence(rest)
  return `${leading}${fence}html\n${rest}\n${fence}`
}

/** Best-effort extraction of the raw text from a `code` element's children. */
function extractCodeText(children: ReactNode): string {
  if (typeof children === 'string') return children
  if (Array.isArray(children)) {
    return children
      .map((child) =>
        typeof child === 'string'
          ? child
          : isValidElement(child) &&
              typeof (child.props as { children?: unknown })?.children ===
                'string'
            ? (child.props as { children: string }).children
            : ''
      )
      .join('')
  }
  if (
    isValidElement(children) &&
    typeof (children.props as { children?: unknown })?.children === 'string'
  ) {
    return (children.props as { children: string }).children
  }
  return ''
}

// Cache for normalized LaTeX content
const latexCache = new Map<string, string>()

/**
 * Optimized preprocessor: normalize LaTeX fragments into $ / $$.
 * Uses caching to avoid reprocessing the same content.
 */
const normalizeLatex = (input: string): string => {
  // Check cache first
  if (latexCache.has(input)) {
    return latexCache.get(input)!
  }

  const segments = input.split(/(```[\s\S]*?```|`[^`]*`|<[a-zA-Z/_!][^>]*>)/g)

  let result = ''

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (!segment) continue

    // Captured code blocks, inline code, html tags
    if (i % 2 === 1) {
      result += segment
      continue
    }

    let s = segment

    // --- Escape suspicious $<number> to prevent Markdown from treating it as LaTeX
    // Example: "$1" → "\$1"
    s = s.replace(/\$(\d+)(?![^\n]*\$([^\d]|$))/g, (_, num) => '\\$' + num)

    // --- Display math: \[...\] surrounded by newlines
    if (s.includes('\\['))
      s = s.replace(
        /(^|\n)\\\[\s*\n([\s\S]*?)\n\s*\\\](?=\n|$)/g,
        (_, pre, inner) => `${pre}$$\n${inner.trim()}\n$$`
      )

    // --- Inline math: space \( ... \)
    if (s.includes('\\('))
      s = s.replace(
        /(^|[^$\\])\\\((.+?)\\\)(?=[^$\\]|$)/g,
        (_, pre, inner) => `${pre}$${inner.trim()}$`
      )

    result += s
  }

  // Cache the result (with size limit to prevent memory leaks)
  if (latexCache.size > 100) {
    const firstKey = latexCache.keys().next().value || ''
    latexCache.delete(firstKey)
  }
  latexCache.set(input, result)

  return result
}

function RenderMarkdownComponent({
  content,
  className,
  isUser,
  components,
  messageId,
  isAnimating,
  isStreaming,
  enableHtmlPreview,
  allowRawHtml,
  displayMode,
}: MarkdownProps) {
  const rehypePlugins = allowRawHtml
    ? REHYPE_PLUGINS_WITH_RAW_HTML
    : REHYPE_PLUGINS

  const normalizedContent = useMemo(() => {
    const prepared = enableHtmlPreview ? wrapBareHtmlDocument(content) : content
    const fenced = closeUnclosedCodeFence(prepared)
    return normalizeLatex(fenced)
  }, [content, enableHtmlPreview])
  const thetaMarked = useRef(false)

  useEffect(() => {
    thetaMarked.current = false
  }, [messageId])

  useEffect(() => {
    if (content.length > 0 && !thetaMarked.current && ttftEnabled()) {
      thetaMarked.current = true
      ttftMark('thetaFirstRender')
      ttftReport('first-visible-render')
    }
  }, [content, messageId])

  const mermaidConfig = useMemo(
    () =>
      messageId
        ? {
            errorComponent: (props: MermaidErrorComponentProps) => (
              <MermaidError messageId={messageId} {...props} />
            ),
          }
        : {},
    [messageId]
  )

  // Props for the nested renderer that delegates non-HTML code blocks back to
  // streamdown so mermaid / syntax highlighting behave exactly as before.
  const delegateProps = useMemo(
    () => ({
      animate: false as const,
      linkSafety: { enabled: false },
      remarkPlugins: REMARK_PLUGINS,
      rehypePlugins: REHYPE_PLUGINS,
      plugins: STREAMDOWN_PLUGINS,
      controls: STREAMDOWN_CONTROLS,
      mermaid: mermaidConfig,
      components,
    }),
    [components, mermaidConfig]
  )

  const mergedComponents = useMemo<Components | undefined>(() => {
    if (!enableHtmlPreview) return components

    const CodeRenderer: Components['code'] = ({
      node,
      className: codeClassName,
      children,
      ...props
    }) => {
      const position = node?.position
      const isInline = position
        ? position.start?.line === position.end?.line
        : false

      if (isInline) {
        return (
          <code
            className={cn(
              'rounded bg-muted px-1.5 py-0.5 font-mono text-sm',
              codeClassName
            )}
            data-streamdown="inline-code"
            {...props}
          >
            {children}
          </code>
        )
      }

      const match =
        typeof codeClassName === 'string'
          ? codeClassName.match(/language-([^\s]+)/)
          : null
      const language = (match?.[1] ?? '').toLowerCase()
      const codeText = extractCodeText(children)

      if (HTML_LANGUAGES.has(language)) {
        // Show the code highlighted inline (Shiki) AND keep the artifact
        // preview trigger, so HTML never appears as plain white text in chat.
        return (
          <div className="my-2 space-y-2">
            <CodeBlock
              code={codeText}
              language={
                SHIKI_LANG_IDS.has(language)
                  ? (language as BundledLanguage)
                  : 'html'
              }
            />
            <ArtifactTrigger code={codeText} streaming={!!isStreaming} />
          </div>
        )
      }

      // Delegate every other code block (incl. mermaid) to streamdown.
      const fence = makeFence(codeText)
      const reconstructed = `${fence}${match?.[1] ?? ''}\n${codeText}\n${fence}`
      return <Streamdown {...delegateProps}>{reconstructed}</Streamdown>
    }

    return { code: CodeRenderer, ...(components ?? {}) }
  }, [enableHtmlPreview, components, delegateProps, isStreaming])

  const containsMath =
    normalizedContent.includes('$$') ||
    /(^|[^\\])\$[^$\n]+\$/.test(normalizedContent)

  // Short plain-text replies (e.g. "Yes", "4") skip the markdown pipeline for
  // speed, but only when there's no markdown syntax that would be lost — a
  // reply like "**Green**" must still render as bold, not literal asterisks.
  const containsMarkdownSyntax = useMemo(
    () =>
      /[*_`~#[\]|]/.test(content) ||
      content.includes('\n') ||
      /^\s*(?:[-+>]|\d+\.)\s/m.test(content),
    [content]
  )

  // Non-markdown display presets: render the raw message text as-is, skipping
  // the markdown pipeline entirely. "monospace" is the same raw text in a
  // monospace font for easy structural scanning of a token stream.
  if (displayMode === 'plain' || displayMode === 'monospace') {
    return (
      <div
        dir="auto"
        className={cn(
          'markdown wrap-break-word select-text whitespace-pre-wrap',
          displayMode === 'monospace' && 'font-mono',
          isUser && 'is-user',
          className
        )}
      >
        {content}
      </div>
    )
  }

  if (
    content.length > 0 &&
    content.length < 32 &&
    !components &&
    !containsMath &&
    !containsMarkdownSyntax
  ) {
    return (
      <div
        dir="auto"
        className={cn(
          'markdown wrap-break-word select-text whitespace-pre-wrap',
          isUser && 'is-user',
          className
        )}
      >
        {content}
      </div>
    )
  }

  // Render the markdown content live — Streamdown's streaming mode parses
  // incrementally and defers the parse with useTransition, and its async code
  // plugin shows code as plain text until the highlight settles, so headings,
  // bold and code blocks all appear in real time while the model is speaking.
  return (
    <div
      dir="auto"
      className={cn(
        'markdown wrap-break-word select-text',
        isUser && 'is-user',
        className
      )}
    >
      <Streamdown
        mode={isStreaming ? 'streaming' : 'static'}
        animate={isStreaming ? false : isAnimating}
        animationDuration={500}
        linkSafety={{
          enabled: false,
        }}
        className={cn(
          'size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
          className
        )}
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={rehypePlugins}
        components={mergedComponents}
        plugins={STREAMDOWN_PLUGINS}
        controls={STREAMDOWN_CONTROLS}
        mermaid={mermaidConfig}
      >
        {normalizedContent}
      </Streamdown>
    </div>
  )
}
export const RenderMarkdown = memo(
  RenderMarkdownComponent,
  (prevProps, nextProps) =>
    prevProps.content === nextProps.content &&
    prevProps.components === nextProps.components &&
    prevProps.enableHtmlPreview === nextProps.enableHtmlPreview &&
    prevProps.allowRawHtml === nextProps.allowRawHtml &&
    prevProps.displayMode === nextProps.displayMode &&
    // With HTML preview on, re-render on streaming→done to drop the loader.
    (!nextProps.enableHtmlPreview ||
      prevProps.isStreaming === nextProps.isStreaming)
)
