import { memo } from 'react'
import { useAppState } from '@/hooks/useAppState'
import { toNumber } from '@/utils/number'
import { Gauge, WholeWord, TrendingUp } from 'lucide-react'

interface TokenUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

interface TokenSpeedSample {
  t: number
  tps: number
}

interface TokenSpeed {
  tokenSpeed: number
  tokenCount?: number
  durationMs?: number
  // Speculative decoding stats (llama.cpp draft model: n_drafted / n_accepted).
  draftTokensTotal?: number
  draftTokensAccepted?: number
  // Time-series of decode throughput samples for the variance chart.
  tokenSpeedSeries?: TokenSpeedSample[]
}

interface TokenSpeedIndicatorProps {
  metadata?: Record<string, unknown>
  streaming?: boolean
}

export const TokenSpeedIndicator = memo(
  ({ metadata, streaming }: TokenSpeedIndicatorProps) => {
    // Get real-time token speed from global state during streaming
    const streamingTokenSpeed = useAppState((state) =>
      state.tokenSpeed ? Math.round(state.tokenSpeed.tokenSpeed) : 0
    )
    const streamingTokenCount = useAppState((state) =>
      state.tokenSpeed?.tokenCount || 0
    )

    // Fallback to persisted metadata when not streaming
    const persistedTokenSpeed =
      (metadata?.tokenSpeed as TokenSpeed)?.tokenSpeed || 0
    const persistedTokenCount =
      (metadata?.tokenSpeed as TokenSpeed)?.tokenCount || 0
    const usage = metadata?.usage as TokenUsage | undefined

    const nonStreamingAssistantParam =
      typeof metadata?.assistant === 'object' &&
      metadata?.assistant !== null &&
      'parameters' in metadata.assistant
        ? (metadata.assistant as { parameters?: { stream?: boolean } })
            .parameters?.stream === false
        : undefined

    if (nonStreamingAssistantParam) return

    // Use streaming data if available, otherwise fall back to metadata
    const displaySpeed = streaming
      ? streamingTokenSpeed
      : Math.round(toNumber(persistedTokenSpeed))

    const displayTokenCount = streaming
      ? streamingTokenCount
      : (usage?.outputTokens ?? persistedTokenCount)

    // Hide the indicator if token speed is 0 and not streaming
    if (displaySpeed === 0) return

    // Show indicator during streaming OR when we have persisted data
    const shouldShow = streaming || (displaySpeed > 0 && displayTokenCount > 0)

    if (!shouldShow) return

    // Speculative-decoding acceptance rate = accepted / total drafted tokens.
    const spec = metadata?.tokenSpeed as TokenSpeed | undefined
    const draftTotal = spec?.draftTokensTotal ?? 0
    const draftAccepted = spec?.draftTokensAccepted ?? 0
    const acceptanceRate =
      draftTotal > 0 ? (draftAccepted / draftTotal) * 100 : null

    const series = spec?.tokenSpeedSeries
    const showVariance = !streaming && !!series && series.length >= 2

    return (
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <div className="flex items-center gap-1">
          <Gauge size={16} />
          <span>{displaySpeed} tok/sec</span>
        </div>
        {displayTokenCount > 0 && (
          <div className="flex items-center gap-1">
            <WholeWord size={16} />
            <span>{displayTokenCount} tokens</span>
          </div>
        )}
        {acceptanceRate !== null && (
          <span>{acceptanceRate.toFixed(1)}% draft tokens accepted</span>
        )}
        {showVariance && <TokenSpeedVarianceChart samples={series} />}
      </div>
    )
  }
)

const TokenSpeedVarianceChart = memo(function TokenSpeedVarianceChart({
  samples,
}: {
  samples: TokenSpeedSample[]
}) {
  const WIDTH = 64
  const HEIGHT = 18
  const PAD = 1

  const values = samples.map((s) => s.tps)
  const max = Math.max(...values, 1)
  const points = samples
    .map((s, index) => {
      const x = (index / Math.max(samples.length - 1, 1)) * (WIDTH - PAD * 2) + PAD
      const y = HEIGHT - PAD - (s.tps / max) * (HEIGHT - PAD * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <span
      className="inline-flex items-center gap-1"
      title="Decode speed over time (tokens/sec)"
    >
      <TrendingUp size={14} />
      <svg
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="overflow-visible"
        aria-hidden="true"
      >
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </span>
  )
})

export default memo(TokenSpeedIndicator)
