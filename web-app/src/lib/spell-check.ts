/**
 * Lightweight client-side spell checker.
 *
 * Tauri's Linux webview stack (wry 0.54 + WebKitGTK) provides no spell-check
 * API, so the native `spellcheck` attribute is a no-op on Linux. This module
 * is a small dictionary-based fallback used by the chat input to draw wavy
 * underlines under likely-misspelled words on every platform.
 *
 * Heuristics keep false positives low for chat-like input: proper nouns,
 * acronyms, camelCase, URLs, numbers, markdown and domain terms are skipped.
 */

import { SPELL_WORDS } from '@/lib/spell-dictionary'

const WORDS = new Set(SPELL_WORDS.split(/\s+/).filter(Boolean))

const IGNORE_SYMBOL = /[^a-zA-Z'’-]/
const ALL_CAPS = /^[A-Z]{2,}$/
const CAMEL_CASE = /[a-z][A-Z]/

const APOSTROPHE_CONTRACTIONS = new Set([
  "can't",
  "couldn't",
  "didn't",
  "doesn't",
  "don't",
  "hadn't",
  "hasn't",
  "haven't",
  "he'd",
  "he'll",
  "he's",
  "i'd",
  "i'll",
  "i'm",
  "i've",
  "isn't",
  "it'd",
  "it'll",
  "it's",
  "let's",
  "mightn't",
  "mustn't",
  "shan't",
  "she'd",
  "she'll",
  "she's",
  "shouldn't",
  "that's",
  "there'd",
  "there'll",
  "there's",
  "they'd",
  "they'll",
  "they're",
  "they've",
  "wasn't",
  "we'd",
  "we'll",
  "we're",
  "we've",
  "weren't",
  "what'll",
  "what's",
  "where's",
  "who'd",
  "who'll",
  "who's",
  "won't",
  "wouldn't",
  "you'd",
  "you'll",
  "you're",
  "you've",
])

const SUFFIXES = [
  'ation',
  'ations',
  'ability',
  'abilities',
  'ibility',
  'ness',
  'ously',
  'fully',
  'less',
  'lessly',
  'ment',
  'ments',
  'ing',
  'ings',
  'est',
  'er',
  'ers',
  'ed',
  'es',
  's',
  'ly',
]

/** Strip common English suffixes and check the root against the dictionary. */
function checkWithAffixes(word: string): boolean {
  if (word.length <= 3) return false
  for (const suffix of SUFFIXES) {
    if (word.length - suffix.length < 2) continue
    if (!word.endsWith(suffix)) continue
    const root = word.slice(0, -suffix.length)
    if (WORDS.has(root)) return true
    // doubled consonant (running -> run), e -> ing (making -> make),
    // ie -> y (trying -> try)
    if (
      root.length >= 2 &&
      root[root.length - 1] === root[root.length - 2]
    ) {
      if (WORDS.has(root.slice(0, -1))) return true
    }
    if (suffix === 'ing' && WORDS.has(`${root}e`)) return true
    if (suffix === 'ing' && root.endsWith('ie')) {
      if (WORDS.has(`${root.slice(0, -2)}y`)) return true
    }
    if (suffix === 'y' && root.endsWith('i')) {
      if (WORDS.has(`${root.slice(0, -1)}y`)) return true
    }
  }
  return false
}

function isWordFine(raw: string): boolean {
  if (!raw) return true

  const word = raw.replace(/^['’-]+|['’-]+$/g, '')
  if (!word) return true

  // Skip anything containing digits or symbols (URLs, emails, code, math).
  if (IGNORE_SYMBOL.test(word)) {
    // But still check hyphenated words part by part.
    if (word.includes('-')) {
      return word.split('-').every((part) => isWordFine(part))
    }
    return true
  }

  // Acronyms / abbreviations.
  if (ALL_CAPS.test(word)) return true
  // camelCase / PascalCase identifiers.
  if (CAMEL_CASE.test(word)) return true
  // Capitalized words are treated as proper nouns / sentence starts.
  if (/^[A-Z]/.test(word)) return true
  // Single letters (a, i) and short tokens.
  if (word.length === 1) return true

  const lower = word.toLowerCase()

  if (WORDS.has(lower)) return true
  if (APOSTROPHE_CONTRACTIONS.has(lower)) return true

  // Split contractions like "i'm", "you're" and check the root word.
  const apostrophe = lower.match(/^([a-z]+)['’]([a-z]+)$/)
  if (apostrophe) {
    const [, left, right] = apostrophe
    if (left.length === 1 && right === 'm') return true // i'm
    if (right === 's' || right === 're' || right === 've' || right === 'd') {
      return isWordFine(left) || checkWithAffixes(left)
    }
  }

  if (checkWithAffixes(lower)) return true

  // Repeated characters (3+) like "sooo" are treated as emphasis, not typos.
  if (/(.)\1{2,}/.test(word)) return true

  return false
}

export interface MisspelledRange {
  /** The raw token as it appears in the source text. */
  word: string
  /** Start index in the source text. */
  start: number
  /** End index (exclusive) in the source text. */
  end: number
}

const WORD_PATTERN = /[A-Za-z'’-]+/g
const URL_EMAIL_PATTERN =
  /https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|[\w.+-]+@[\w-]+\.[\w.-]+/g

/** Ranges of text that are URLs / emails and must never be spell-checked. */
function protectedRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  URL_EMAIL_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = URL_EMAIL_PATTERN.exec(text)) !== null) {
    ranges.push([match.index, match.index + match[0].length])
  }
  return ranges
}

/**
 * Find likely-misspelled word ranges in `text`. Returns an empty array when
 * spelling is fine or the text has no words worth flagging.
 */
export function findMisspelled(text: string): MisspelledRange[] {
  const result: MisspelledRange[] = []
  const protectedZones = protectedRanges(text)

  WORD_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = WORD_PATTERN.exec(text)) !== null) {
    const [word] = match
    const start = match.index
    if (
      protectedZones.some(
        ([zoneStart, zoneEnd]) => start >= zoneStart && start < zoneEnd
      )
    ) {
      continue
    }
    if (!isWordFine(word)) {
      result.push({ word, start, end: start + word.length })
    }
  }
  return result
}

/**
 * Split text into segments that can be rendered with wavy underlines on the
 * misspelled words. Returns null when there is nothing to underline.
 */
export function splitSpellSegments(
  text: string,
): Array<{ text: string; misspelled: boolean }> | null {
  const ranges = findMisspelled(text)
  if (ranges.length === 0) return null

  const segments: Array<{ text: string; misspelled: boolean }> = []
  let cursor = 0
  for (const range of ranges) {
    if (range.start > cursor) {
      segments.push({ text: text.slice(cursor, range.start), misspelled: false })
    }
    segments.push({
      text: text.slice(range.start, range.end),
      misspelled: true,
    })
    cursor = range.end
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), misspelled: false })
  }
  return segments
}
