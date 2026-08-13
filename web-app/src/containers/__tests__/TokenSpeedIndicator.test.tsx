import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TokenSpeedIndicator } from '../TokenSpeedIndicator'
import { useAppState } from '@/hooks/useAppState'

describe('TokenSpeedIndicator variance chart', () => {
  beforeEach(() => {
    useAppState.setState({
      tokenSpeed: undefined,
    } as never)
  })

  const metadata = (series: Array<{ t: number; tps: number }>) => ({
    usage: { inputTokens: 10, outputTokens: 120 },
    tokenSpeed: {
      tokenSpeed: 24.5,
      tokenCount: 120,
      durationMs: 5000,
      tokenSpeedSeries: series,
    },
  })

  it('renders a sparkline when a token speed series is present', () => {
    render(
      <TokenSpeedIndicator
        streaming={false}
        metadata={metadata([
          { t: 0, tps: 10 },
          { t: 500, tps: 30 },
          { t: 1000, tps: 20 },
          { t: 1500, tps: 40 },
        ])}
      />
    )

    expect(screen.getByText(/25 tok\/sec/)).toBeInTheDocument()
    expect(screen.getByText('120 tokens')).toBeInTheDocument()
    expect(document.querySelector('polyline')).toBeTruthy()
  })

  it('omits the sparkline when the series has fewer than 2 samples', () => {
    render(
      <TokenSpeedIndicator
        streaming={false}
        metadata={metadata([{ t: 0, tps: 20 }])}
      />
    )

    expect(screen.getByText(/25 tok\/sec/)).toBeInTheDocument()
    expect(document.querySelector('polyline')).toBeNull()
  })

  it('omits the sparkline when no series is present', () => {
    render(
      <TokenSpeedIndicator
        streaming={false}
        metadata={{
          usage: { inputTokens: 10, outputTokens: 120 },
          tokenSpeed: {
            tokenSpeed: 24.5,
            tokenCount: 120,
            durationMs: 5000,
          },
        }}
      />
    )

    expect(screen.getByText(/25 tok\/sec/)).toBeInTheDocument()
    expect(document.querySelector('polyline')).toBeNull()
  })
})
