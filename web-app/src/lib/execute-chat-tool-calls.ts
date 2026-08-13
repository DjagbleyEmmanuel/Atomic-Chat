import type { UIMessage } from '@ai-sdk/react'
import { lastAssistantMessageIsCompleteWithToolCalls } from 'ai'

export type ChatToolCall = {
  toolCallId: string
  toolName: string
  input: object
}

export type ChatToolOutput =
  | {
      tool: string
      toolCallId: string
      output: unknown
    }
  | {
      state: 'output-error'
      tool: string
      toolCallId: string
      errorText: string
    }

type ToolResult = {
  content?: unknown
  error?: unknown
}

type ExecuteChatToolCallsOptions = {
  toolCalls: readonly ChatToolCall[]
  signal: AbortSignal
  threadId: string
  ragToolNames: ReadonlySet<string>
  mcpToolNames: ReadonlySet<string>
  approve: (
    toolName: string,
    threadId: string,
    input: object
  ) => Promise<boolean>
  callRagTool: (args: {
    toolName: string
    arguments: object
    threadId: string
    projectId?: string
    scope: 'project' | 'thread'
  }) => Promise<ToolResult>
  callMcpTool: (args: {
    toolName: string
    arguments: object
  }) => Promise<ToolResult>
  getProjectId: () => string | undefined
  processOutput: (content: unknown) => Promise<unknown>
  addToolOutput: (output: ChatToolOutput) => void
  onError?: (error: unknown) => void
  // Per-tool-call cancellation: the caller owns one AbortController per
  // toolCallId (so the user can cancel a single running tool without
  // stopping the whole request). The batch-level `signal` still gates the
  // entire run.
  getToolController?: (toolCallId: string) => AbortController | undefined
}

export async function executeChatToolCalls({
  toolCalls,
  signal,
  threadId,
  ragToolNames,
  mcpToolNames,
  approve,
  callRagTool,
  callMcpTool,
  getProjectId,
  processOutput,
  addToolOutput,
  onError = (error) => console.error('Tool call error:', error),
  getToolController,
}: ExecuteChatToolCallsOptions): Promise<void> {
  for (const toolCall of toolCalls) {
    if (signal.aborted) break

    const toolController = getToolController?.(toolCall.toolCallId)
    const toolSignal = toolController?.signal
// Only surface the cancellation if the tool was not retried since
      // (retry installs a fresh controller for the same toolCallId). Without
      // this guard, the cancelled tool's late completion would clobber the
      // retried tool's result that landed on the same tool part.
      if (
        toolSignal?.aborted &&
        getToolController?.(toolCall.toolCallId) === toolController
      ) {
        addToolOutput({
          state: 'output-error',
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          errorText: 'Tool execution cancelled by user',
        })
        continue
      }

    try {
      const approved = await approve(
        toolCall.toolName,
        threadId,
        toolCall.input
      )

      if (toolSignal?.aborted) {
        addToolOutput({
          state: 'output-error',
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          errorText: 'Tool execution cancelled by user',
        })
        continue
      }

      if (!approved) {
        addToolOutput({
          state: 'output-error',
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          errorText: 'Tool execution denied by user',
        })
        continue
      }

      let result: ToolResult
      if (ragToolNames.has(toolCall.toolName)) {
        const projectId = getProjectId()
        result = await callRagTool({
          toolName: toolCall.toolName,
          arguments: toolCall.input,
          threadId,
          projectId,
          scope: projectId ? 'project' : 'thread',
        })
      } else if (mcpToolNames.has(toolCall.toolName)) {
        result = await callMcpTool({
          toolName: toolCall.toolName,
          arguments: toolCall.input,
        })
      } else {
        result = {
          error: `Tool '${toolCall.toolName}' not found in any service`,
        }
      }

      if (toolSignal?.aborted) {
        addToolOutput({
          state: 'output-error',
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          errorText: 'Tool execution cancelled by user',
        })
        continue
      }

      if (result.error) {
        addToolOutput({
          state: 'output-error',
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          errorText: `Error: ${result.error}`,
        })
      } else {
        addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output: await processOutput(result.content),
        })
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        onError(error)
        addToolOutput({
          state: 'output-error',
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          errorText: `Error: ${JSON.stringify(error)}`,
        })
      }
    }
  }
}

export function shouldSendToolFollowUp(
  messages: UIMessage[],
  controller: AbortController | null
): boolean {
  if (!controller || controller.signal.aborted) return false
  return lastAssistantMessageIsCompleteWithToolCalls({ messages })
}
