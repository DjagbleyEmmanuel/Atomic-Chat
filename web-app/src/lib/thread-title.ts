/**
 * Derive a short, human-readable thread title from the first exchange.
 *
 * The thread is created with the raw first prompt as its title; after the
 * first assistant reply we replace that raw text with a clean one-line
 * summary derived from the content. Deterministic and free (no model call),
 * and only applied while the title is still the untouched default.
 */

const MAX_TITLE_LENGTH = 48

export function stripMarkdown(text: string): string {
  return text
    // Code fences (and their contents)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    // Headers
    .replace(/^#{1,6}\s+/gm, ' ')
    // Blockquotes (reply quotes)
    .replace(/^>\s?/gm, ' ')
    // List markers
    .replace(/^\s*[-*+]\s+/gm, ' ')
    .replace(/^\s*\d+\.\s+/gm, ' ')
    // Link syntax -> keep the label
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Emphasis
    .replace(/[*_~]{1,3}/g, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim()
}

function firstSentence(text: string): string {
  const match = text.match(/[^.!?\n]+[.!?]?/)
  return match?.[0].trim() || text
}

export function deriveThreadTitle(
  userText: string,
  assistantText?: string
): string | undefined {
  let source = stripMarkdown(userText)
  if (!source && assistantText) source = stripMarkdown(assistantText)
  if (!source) return undefined

  let title = firstSentence(source)
  if (title.length > MAX_TITLE_LENGTH) {
    title = `${title.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`
  }
  return title || undefined
}

/**
 * Join the plain-text parts of a persisted ThreadMessage's content array.
 * Image/audio/file parts are ignored — only `type === 'text'` contributes.
 */
export function threadMessageText(message: {
  role: string
  content?: unknown
}): string {
  if (!Array.isArray(message.content)) {
    return typeof message.content === 'string' ? message.content : ''
  }
  return message.content
    .filter(
      (c): c is { type: string; text?: { value?: string } } =>
        typeof c === 'object' && c !== null && 'type' in c
    )
    .map((c) => (c.type === 'text' ? c.text?.value ?? '' : ''))
    .join('')
}
