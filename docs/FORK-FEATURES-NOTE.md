# Features added in this fork — Atomic Chat (DjagbleyEmmanuel/Atomic-Chat)

This note lists the work currently present in this fork but not in the original
[`AtomicBot-ai/Atomic-Chat`](https://github.com/AtomicBot-ai/Atomic-Chat)
repo. It is written so it can be sent to the upstream maintainer verbatim.

> Scope: the uncommitted working-tree changes on top of `main`
> (`75e413d Merge upstream v2.0.7`). The fork has intentionally **not** been
> committed or pushed yet, so none of this is upstream history. Each item lists
> the primary files touched so the maintainer can locate the code.

---

## 1. Thread scroll & rendering UX

A new auto-scroll engine plus user-selectable scroll behaviour, replacing the
default "stick to bottom while streaming" with three modes.

- **`useAutoScrollToBottom` hook** (`web-app/src/hooks/useAutoScrollToBottom.ts`)
  — per-frame exponential-easing scroll glide that pins the viewport to the
  bottom during streaming without ever falling behind: it snaps instantly when
  lag exceeds a catch-up threshold, reads `ref.current` fresh every frame
  (handles collapse/un-collapse remounts), and skips pinning while the element
  is `display:none`.
- **Thread scroll presets** (`web-app/src/constants/threadScroll.ts`, settings
  UI, `ThreadScrollPicker`) — three behaviours the user can choose in Interface
  settings:
  - `FLOW` — ChatGPT-style "keep the viewport anchored near the latest message"
    once a reply starts streaming.
  - `STICKY` — instant auto-follow as tokens resolve.
  - `SMOOTH` (default) — auto-follow with a spring-like glide; the spring
    re-aims and pins to instant during active streaming so the main thread is
    not stalled every token.
- Applied consistently across `conversation.tsx`, `MessageItem.tsx`,
  `$threadId.tsx`, `tool.tsx`, `markdown.css`, and `HtmlArtifact.tsx`.

## 2. Message render modes

- **Message display mode** (`MessageDisplayModePicker`, `useInterfaceSettings`,
  `MessageItem.tsx`) — assistant messages can be rendered as **Markdown**
  (default), **Plaintext**, or **Monospace**, selectable in Interface settings.

## 3. Chat background presets & custom wallpaper

- **Preset chat backgrounds** (`ChatBackgroundPicker`, `useInterfaceSettings`) —
  five gradient presets (Dusk, Forest, Midnight, Ocean, Sakura) plus the default
  background.
- **Custom wallpaper** — upload an image as the chat background, persisted as a
  base64 data URL with a quota-safe `localStorage` write (large images degrade
  gracefully to "wallpaper not remembered" instead of throwing).
- Added settings i18n for all 12 locales (`chatBackground`, `customWallpaper`,
  `uploadWallpaper`, `removeWallpaper`, `invalidWallpaperType`,
  `wallpaperTooLarge`, `wallpaperReadError`).

## 4. Reply-to / quote a message

- **Reply to a message** (`useReplyTo`, `MessageItem.tsx`, `ChatInput.tsx`) —
  select text inside a message to show a floating "reply" chip; clicking it
  quotes the selected text (or the full message) into the composer as a
  markdown blockquote. A reply badge appears on the message, the quoted snippet
  is extracted for the badge, and the quote is stripped from the rendered body
  so it is not duplicated.

## 5. Per-thread input drafts

- **Per-thread draft persistence** (`usePrompt.ts`) — the composer keeps a
  draft per active thread (`atomic-chat.prompt-drafts.v1`); switching threads
  saves the in-flight text under the previous thread and restores the draft for
  the thread being opened. Temporary/new chats have no persistent draft.

## 6. Cross-thread message search

- **Cross-thread full-text search** (`useCrossThreadSearch`, `SearchDialog.tsx`)
  — search results include message matches from all threads; selecting one
  navigates to that thread and scrolls to the specific `messageId`.

## 7. Per-thread notification muting

- **Per-thread mute for completion notifications** (`useThreadNotifications.ts`)
  — the global desktop-notification switch stays, but individual threads can be
  muted so they do not fire a reply-completion notification.

## 8. Token speed variance chart

- **TPS variance chart** (`TokenSpeedIndicator.tsx`,
  `custom-chat-transport.ts`) — decode throughput is sampled every 500 ms during
  streaming; once the reply finishes, a small sparkline chart shows how the
  tokens/second fluctuated over the stream instead of a single scalar.

## 9. Code blocks: window frame, wrapping, live highlighting

- **Window-frame chrome** (`code-block.tsx`) — every code block renders a header
  bar with macOS-style traffic-light dots, the language label, and the copy
  button.
- **Long-line wrapping** — highlighted Shiki `pre` and the plain streaming
  fallback both wrap long lines (`whitespace-pre-wrap` + `wrap-break-word`),
  eliminating the horizontal scrollbar; vertical scrolling is unchanged.
- **Live code-colour highlighting while streaming**
  (`code-block.tsx`, `useGeneralSetting`) — debounced final pass (350 ms) plus
  a live cadence (fast 150 ms / smooth 250 ms / relaxed 400 ms) while tokens
  stream; only one Shiki pass runs at a time (`highlightInFlight` guard), stale
  results are discarded via a highlight token, and blocks > 1500 chars render
  plain text while streaming with a single settle pass so the main thread is
  never starved.
- **Settings** — new "Code Rendering & Streaming" card with a `Live code
  colours` toggle and `Live colour cadence` selector, i18n added for all
  locales.

## 10. Live markdown rendering during streaming

- **Streamdown streaming mode** (`RenderMarkdown.tsx`) — markdown is now always
  rendered through Streamdown with `streaming` mode while the model is speaking:
  incremental parse deferred behind `useTransition`, unchanged blocks memoized,
  and async code highlighting swapped in via callback. Headings, bold, lists,
  inline code and code blocks all appear in real time.
- **Unclosed code-fence repair** (`lib/code-fence.ts`) — if a model ends its
  reply inside a code block without closing the fence, an odd fence count is
  detected and a matching closing fence is appended so the rest of the message
  is not swallowed as unparsed text.
- **Language safety** — Shiki highlighting is only attempted for language ids
  that resolve to a real bundled Shiki language (unknown ids render safely).

## 11. JS spell-check fallback (Linux / WebKitGTK)

- **Pure-JS spell-check** (`SpellCheckTextarea`,
  `lib/spell-check.ts`, `lib/spell-dictionary.ts`) — the native `spellcheck`
  attribute is inert on Linux (wry/WebKitGTK exposes no spell-check API), so a
  ~64.8k-word dictionary (generated from the system `american-english` wordlist)
  drives a transparent-caret textarea that overlays a backdrop rendering
  misspelled tokens with a red wavy underline. Heuristics skip URLs/emails,
  proper nouns, camelCase, affix-suffixed forms and contractions, and the
  overlay is disabled during IME composition. The dictionary is code-split into
  a lazily-loaded chunk.

## 12. Instant per-tool cancellation

- **Per-tool-call cancel** (`execute-chat-tool-calls.ts`, `tool.tsx`) — each
  tool call owns its `AbortController` so the user can cancel a single running
  tool without stopping the whole request; the tool part flips to
  `output-error` ("Tool execution cancelled by user") immediately, so Retry
  appears instantly. A cancelled tool's late completion cannot clobber the
  result of a retry that replaced the controller.
- **Hide cancel/retry on agent-run tools** — actions are hidden on tools
  launched by the agent loop, where JS cancel/retry handlers cannot reach them.

## 13. Assistant instructions: direct-answer behaviour

- **Assistant extension migration v3** (`extensions/assistant-extension`) — the
  default assistant no longer instructs the model to "articulate your complete
  thought process"; models that follow that instruction dump their reasoning as
  plain text (outside the reasoning UI) and crowd out the answer. The new
  default instructions keep reasoning internal and output only the final answer,
  respond in the language of the latest user message, and use tools for current
  / external information. A migration rewrites existing assistants that still
  carry the old format.

## 14. llama.cpp upstream backend: Linux CUDA alias support

- **`linux-*` ↔ `ubuntu-*` backend aliasing**
  (`extensions/llamacpp-upstream-extension/src/backend.ts`) — imported custom
  archives are kept discoverable as the same backend type regardless of archive
  prefix. CUDA is not auto-offered on Linux (upstream publishes no
  `ubuntu-cuda-*` assets), but a manually imported `ubuntu-cuda-*` (or
  `linux-cuda-*`) build is preserved as `linux-cuda-*` and stays selectable
  instead of collapsing to CPU.

## 15. Theme / visual polish

- **Additional dark theme variants** (`services/theme/default.ts`,
  `services/theme/types.ts`, `index.css`) — theme class handling now manages a
  set of dark-variant themes (removes stale classes on switch), with additional
  background/muted palette variants.
- **Loader styles** (`loader.css`) — new loading animation styles.
- **Auto thread titles** (`lib/thread-title.ts`) — after the first assistant
  reply, a clean one-line title is derived from the exchange by stripping
  markdown (code fences, headers, blockquotes/reply quotes, list markers, link
  labels, emphasis) and collapsing whitespace, deterministically and without a
  model call.

---

### Files (summary)

New files: `useAutoScrollToBottom.ts`, `useReplyTo.ts`, `useCrossThreadSearch.ts`,
`spell-check.ts`, `spell-dictionary.ts`, `spell-check-textarea.tsx`,
`code-fence.ts`, `thread-title.ts`, `ChatBackgroundPicker.tsx`,
`MessageDisplayModePicker.tsx`, `ThreadScrollPicker.tsx`, plus their tests.

Modified (main areas): `$threadId.tsx`, `MessageItem.tsx`, `ChatInput.tsx`,
`conversation.tsx`, `tool.tsx`, `markdown.css`, `code-block.tsx`,
`RenderMarkdown.tsx`, `SearchDialog.tsx`, `TokenSpeedIndicator.tsx`,
`usePrompt.ts`, `useThreadNotifications.ts`, `useGeneralSetting.ts`,
`useInterfaceSettings.ts`, `custom-chat-transport.ts`, `execute-chat-tool-calls.ts`,
`index.css`, `loader.css`, theme services, settings routes (general/interface),
all locale files, `extensions/assistant-extension/src/index.ts`,
`extensions/llamacpp-upstream-extension/src/backend.ts` / `index.ts`.

### Tests added

`RenderMarkdown.test.tsx`, `conversation.test.tsx`,
`TokenSpeedIndicator.test.tsx`, `useCrossThreadSearch.test.ts`,
`spell-check.test.ts`, `interface.test.tsx` (settings).
