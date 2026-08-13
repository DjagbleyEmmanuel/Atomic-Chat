---
date: 2026-08-11
title: "Expose thread scroll presets and message render modes as interface settings"
---

# 2026-08-11 — Expose thread scroll presets and message render modes as interface settings

- **Context:** While debugging live markdown/code rendering, users flagged two UX gaps: (1) the chat viewport followed streaming replies in hard page-jumps because `Conversation` pinned `use-stick-to-bottom` with `resize="instant"`, and (2) there was no way to view a raw token stream — assistant replies could only render as rendered markdown. The `THREAD_SCROLL_BEHAVIOR` constants and their locale strings existed in the tree but were dead code (never wired to a setting or to the scroll component).
- **Decision:**
  - Wire a new persisted `threadScroll` interface setting (`flow` | `sticky` | `smooth`, default `smooth`) into `Conversation`. `smooth` maps to a spring customisation (`damping 0.9`, `stiffness 0.045`, `mass 1.35`) passed as `use-stick-to-bottom`'s `resize` animation, turning content growth into a continuous glide; `sticky` restores `resize="instant"`; `flow` uses `"instant"` plus a `ConversationFollow` control that calls `stopScroll()` when a reply starts streaming so the reply scrolls into view instead of the viewport chasing it.
  - Add a second persisted `messageDisplayMode` interface setting (`markdown` | `plain` | `monospace`, default `markdown`). Non-markdown modes short-circuit `RenderMarkdown` to render the raw message text verbatim (`whitespace-pre-wrap`, plus `font-mono` for monospace), skipping the pipeline entirely.
  - Both live in `useInterfaceSettings.ts` (with rehydrate fallbacks to the defaults), are exposed in the interface settings page via dropdown pickers (`ThreadScrollPicker`, `MessageDisplayModePicker`), and have translated strings in every locale that ships an `interface` block.
- **Consequences:** Streaming replies scroll smoothly by default; users who preferred the old jumpy follow or ChatGPT-style anchoring can opt back in. Plain/monospace modes give a literal view of the model output for debugging or reading unparsed stream text — these modes intentionally skip highlighting, math and links. Two more persisted settings to migrate in `resetInterface`/rehydrate; `flow` relies on `ConversationFollow` calling `stopScroll` at stream start, which also surfaces the scroll-to-bottom button while a reply streams.
- **Owner:** team
- **Links:** `web-app/src/constants/threadScroll.ts`, `web-app/src/hooks/useInterfaceSettings.ts`, `web-app/src/components/ai-elements/conversation.tsx`, `web-app/src/containers/RenderMarkdown.tsx`, `web-app/src/routes/settings/interface.tsx`