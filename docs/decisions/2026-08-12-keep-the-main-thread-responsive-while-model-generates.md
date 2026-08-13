---
date: 2026-08-12
title: "Keep the main thread responsive while the model generates"
---

# 2026-08-12 — Keep the main thread responsive while the model generates

- **Context:** Reported: "the app UI lags, freezes and slows down drastically during code or token generation; when an AI writes long code inside a tool's UI frame the app freezes until generation finishes and no button responds." Three main-thread costs stacked up while a reply or tool output streams:
  - `ToolTextBlock` (the tool input frame showing a file write) re-highlighted the tail window on *every* chunk — back-to-back Shiki passes (`codeToHtml` light + dark are synchronous, main-thread CPU), so a long write saturated the thread.
  - `CodeBlock`'s live cadence interval re-highlighted the *full* snapshot every 150–400 ms (up to 6000 chars), and overlapping passes could pile up.
  - The conversation's `smooth` spring scroll re-aimed a multi-frame scroll animation on every resize, and the tool scroller used the same `smooth` spring, so content growth kept a spring animation running every animation frame.
  - The stream update throttle (16 ms) forced near-60fps React re-renders of the whole conversation for every token.
- **Decision:**
  - `ToolTextBlock`: while `input-streaming`, render the current tail as plain `<pre>` text — instant and free — and run exactly one highlight pass once the stream settles. `html` is only shown when the block is not streaming, so the preview never shows stale content.
  - `CodeBlock`: cap the live-progressive pass to small blocks (≤1500 chars); larger blocks render plain text while streaming and get a single settle pass. A shared `highlightInFlight` guard lets only one Shiki pass run at a time (settle + interval), and the settle debounce is 350 ms.
  - Scroll: `Conversation` flips its `resize` to `instant` whenever a request is active (`streaming` prop), so no spring animation frames are spent while content streams; the configured `smooth` spring reapplies once generation settles. The tool scroller's `StickToBottom` does the same (`resize={streaming ? 'instant' : 'smooth'}`).
  - Bump the AI SDK stream throttle from 16 ms to 50 ms, cutting React/Streamdown/highlight work per second during token generation.
- **Consequences:** The UI stays responsive during long writes and token generation — buttons, menus and scroll respond instead of freezing — at the cost of live syntax colours: large streamed code blocks (and all tool-frame writes) show plain text while streaming and gain colours once they settle, while tiny blocks keep live colours. A single full-buffer Shiki pass at settle can still block the main thread briefly (~hundreds of ms for very large buffers); moving Shiki to a Web Worker is the deferred follow-up.
- **Owner:** team
- **Links:** `web-app/src/components/ai-elements/tools/tool.tsx`, `web-app/src/components/ai-elements/code-block.tsx`, `web-app/src/components/ai-elements/conversation.tsx`, `web-app/src/routes/threads/$threadId.tsx`