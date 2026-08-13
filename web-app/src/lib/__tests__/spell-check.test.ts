import { describe, expect, it } from 'vitest'
import { findMisspelled, splitSpellSegments } from '@/lib/spell-check'

describe('findMisspelled', () => {
  it('flags obvious typos', () => {
    // Capitalized words are treated as proper nouns, so only the lowercase
    // typo is flagged.
    expect(findMisspelled('this is a test of the sistem').map((r) => r.word)).toEqual([
      'sistem',
    ])
  })

  it('leaves correctly spelled prose alone', () => {
    expect(
      findMisspelled('The quick brown fox jumps over the lazy dog').map(
        (r) => r.word
      )
    ).toEqual([])
  })

  it('handles apostrophe contractions', () => {
    expect(findMisspelled("I can't believe you're going").map((r) => r.word)).toEqual(
      []
    )
  })

  it('skips proper nouns, acronyms and identifiers', () => {
    expect(
      findMisspelled('API and JSON and TypeScript work fine').map((r) => r.word)
    ).toEqual([])
  })

  it('skips URLs and emails', () => {
    expect(
      findMisspelled('http://example.com and foo@bar.com are fine').map(
        (r) => r.word
      )
    ).toEqual([])
  })

  it('accepts common inflected forms', () => {
    expect(findMisspelled('running jumped happily beautiful').map((r) => r.word)).toEqual(
      []
    )
  })

  it('flags typos that survive affix stripping', () => {
    expect(findMisspelled('this is a prmise').map((r) => r.word)).toEqual(['prmise'])
    expect(findMisspelled('abcdefghij').map((r) => r.word)).toEqual(['abcdefghij'])
  })

  it('reports accurate ranges', () => {
    const ranges = findMisspelled('go teh file')
    expect(ranges).toEqual([{ word: 'teh', start: 3, end: 6 }])
  })
})

describe('splitSpellSegments', () => {
  it('returns null when nothing is misspelled', () => {
    expect(splitSpellSegments('all good here')).toBeNull()
  })

  it('splits text into plain and misspelled segments', () => {
    const segments = splitSpellSegments('go teh file')
    expect(segments).toEqual([
      { text: 'go ', misspelled: false },
      { text: 'teh', misspelled: true },
      { text: ' file', misspelled: false },
    ])
  })

  it('returns null for empty text', () => {
    expect(splitSpellSegments('')).toBeNull()
  })
})
