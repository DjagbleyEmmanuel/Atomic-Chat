---
date: 2026-08-12
title: "Make per-tool cancel instant and hide cancel/retry on agent-run tools"
---

# 2026-08-12 — Make per-tool cancel instant and hide cancel/retry on agent-run tools

- **Context:** The per-tool Cancel/Retry feature shipped earlier only aborted the tool's `AbortController` and waited for the tool promise to settle before flipping the part to `output-error`. A slow or hung tool therefore showed zero feedback on Cancel, and the tiny ghost buttons had no press affordance, so both actions read as broken. Meanwhile agent-run tool blocks could show the same buttons, but agent tools execute inside the Rust backend: `handleCancelToolCall` had no controller to abort and `handleRetryToolCall` re-ran agent tools (`read_file`, `write_file`, …) through the RAG/MCP services, surfacing "Tool not found in any service".
- **Decision:**
  - Cancel now flips the tool part to `output-error` ("Tool execution cancelled by user") immediately via `addToolOutput` and aborts the controller, so Retry appears instantly regardless of whether the underlying call ever settles.
  - In `executeChatToolCalls`, the post-execution "cancelled" write is only emitted when the controller stored for that `toolCallId` is still the controller the loop captured — so a cancelled tool's late completion cannot clobber a result produced by a retry that replaced the controller.
  - Retry returns its settlement promise; the Retry button shows a spinner, disables itself, and reads "Retrying…" until the re-run settles.
  - Cancel/Retry buttons gain a press animation (`active:scale`), hover, cursor and disabled styling via the shared action classes.
  - Agent-run tool blocks (`block.agentSummary` present) no longer pass Cancel/Retry, hiding the buttons where the JS handlers cannot work.
- **Consequences:** Per-tool cancel is now visibly responsive in normal chats and single-tool retry is observable with a busy state; the cancelled tool's background promise still runs to completion but can no longer overwrite a retried result. Agent-mode blocks no longer offer dead controls; wiring real per-tool cancel/retry for agent runs would require a Rust IPC endpoint and is deferred.
- **Owner:** team
- **Links:** `web-app/src/routes/threads/$threadId.tsx`, `web-app/src/lib/execute-chat-tool-calls.ts`, `web-app/src/components/ai-elements/tools/tool.tsx`, `web-app/src/containers/MessageItem.tsx`