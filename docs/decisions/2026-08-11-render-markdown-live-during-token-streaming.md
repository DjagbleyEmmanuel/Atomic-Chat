---
date: 2026-08-11
title: "Render markdown live during token streaming via Streamdown streaming mode"
---

# 2026-08-11 — Render markdown live during token streaming via Streamdown streaming mode

- **Context:** Reported as 3.0.0 bugs: hash tags and asterisks appeared as literal text while a reply generated (only rendered after the stream finished), fenced code was blank until completion, and the app felt laggy during code generation. An uncommitted "raw-text streaming" shortcut had been added to `RenderMarkdown.tsx`: while `isStreaming`, it skipped the markdown pipeline entirely and showed the plain text, highlighting only fenced code through the standalone `CodeBlock`. That hid live headings/bold/lists and — combined with a 180 ms debounce — left code blocks empty for the whole stream.
- **Decision:** Remove the raw-text shortcut and always render through Streamdown with `mode={isStreaming ? 'streaming' : 'static'}`. Streamdown's streaming mode parses incrementally, defers the block parse behind `useTransition` so it never blocks the main thread, memoizes unchanged blocks, and its async code plugin shows code as plain text first then swaps in highlighted tokens via callback (cache keyed on content, highlighter reused). Standalone `CodeBlock` (used for HTML-preview blocks) renders plain `<pre>` text while its 180 ms debounced highlight is pending, so it is never blank mid-stream.
- **Consequences:** Headings, bold, lists, inline code and code blocks all appear in real time while the model is speaking, matching the pre-3.0.0 experience. Per-token cost is a deferred markdown parse (grows with message length; `useTransition` keeps the UI responsive) plus content-cached code tokenization. Watch for long messages where the incremental re-parse cost rises, and for streamdown's lazy code block relying on a CDN for grammar downloads — offline it falls back to plain-text tokens (pre-existing behaviour, unchanged here).
- **Owner:** team
- **Links:** `web-app/src/containers/RenderMarkdown.tsx`, `web-app/src/components/ai-elements/code-block.tsx`, streamdown `mode="streaming"` + `@streamdown/code`
