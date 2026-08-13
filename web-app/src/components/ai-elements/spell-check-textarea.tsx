import {
  type ComponentProps,
  forwardRef,
  type CSSProperties,
  type ReactNode,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react'
import TextareaAutosize from 'react-textarea-autosize'
import { cn } from '@/lib/utils'
import { splitSpellSegments } from '@/lib/spell-check'

type TextareaProps = ComponentProps<typeof TextareaAutosize>

export interface SpellCheckTextareaProps extends TextareaProps {
  /** When true, the JS spell-check mirror draws wavy underlines. */
  spellCheckEnabled?: boolean
}

/**
 * Drop-in wrapper around `TextareaAutosize` that adds a transparent mirror
 * layer behind the textarea drawing wavy red underlines under likely
 * misspellings (the Tauri Linux webview has no native spell-check). The mirror
 * is disabled while an IME composition is active so composing text stays
 * visible, and the native `spellcheck` attribute is turned off while the
 * mirror is on so squiggles never double up.
 */
export const SpellCheckTextarea = forwardRef<
  HTMLTextAreaElement,
  SpellCheckTextareaProps
>(function SpellCheckTextarea(
  {
    spellCheckEnabled = false,
    value,
    onScroll,
    onCompositionStart,
    onCompositionEnd,
    style,
    className,
    dir,
    spellCheck,
    ...props
  },
  ref,
) {
  const [composing, setComposing] = useState(false)
  const backdropRef = useRef<HTMLDivElement>(null)

  const active = spellCheckEnabled && !composing
  const text = typeof value === 'string' ? value : ''

  const segments = useMemo(
    () => (active ? splitSpellSegments(text) : null),
    [active, text],
  )

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLTextAreaElement>) => {
      onScroll?.(event)
      if (backdropRef.current) {
        backdropRef.current.scrollTop = event.currentTarget.scrollTop
        backdropRef.current.scrollLeft = event.currentTarget.scrollLeft
      }
    },
    [onScroll],
  )

  const renderBackdrop = (): ReactNode => {
    if (!segments) return text
    return segments.map((segment, index) =>
      segment.misspelled ? (
        <span
          key={index}
          className="rounded-[2px] text-foreground"
          style={{
            textDecorationLine: 'underline',
            textDecorationStyle: 'wavy',
            textDecorationColor: 'rgb(239 68 68 / 0.85)',
            textUnderlineOffset: '2px',
          }}
        >
          {segment.text}
        </span>
      ) : (
        segment.text
      ),
    )
  }

  const backdropStyle: CSSProperties = useMemo(() => {
    const { textIndent, ...rest } = style ?? {}
    return {
      ...rest,
      textIndent: typeof textIndent === 'number' ? `${textIndent}px` : textIndent,
    }
  }, [style])

  return (
    <>
      {active && (
        <div
          ref={backdropRef}
          aria-hidden
          dir={dir}
          style={backdropStyle}
          className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words text-sm leading-6 pt-3 px-4"
        >
          {renderBackdrop()}
        </div>
      )}
      <TextareaAutosize
        {...props}
        ref={ref}
        value={value}
        onScroll={handleScroll}
        dir={dir}
        style={style}
        className={cn(
          className,
          active && 'relative text-transparent caret-foreground selection:bg-primary/30',
        )}
        spellCheck={active ? false : spellCheck}
        onCompositionStart={(event) => {
          setComposing(true)
          onCompositionStart?.(event)
        }}
        onCompositionEnd={(event) => {
          setComposing(false)
          onCompositionEnd?.(event)
        }}
      />
    </>
  )
})
