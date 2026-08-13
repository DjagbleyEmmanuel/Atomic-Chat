---
date: 2026-08-12
title: "Render code blocks in their own window frame and wrap long lines"
---

# 2026-08-12 — Render code blocks in their own window frame and wrap long lines

- **Context:** Code blocks rendered as a plain bordered rectangle whose body scrolled both directions. A single long line (bundled URL, minified rule, generated code) overflowed horizontally and popped a bottom scrollbar, forcing the reader to scroll sideways to see the line, and there was no visual "window" affordance or copy control. This hit two render paths: `CodeBlock` (tool inputs/outputs, HTML-preview, artifacts) and Streamdown's code-block plugin, which renders almost every chat code fence. The shared `markdown.css` `pre { overflow-x: auto }` rule forced a horizontal scrollbar on Streamdown's `pre` no matter what the wrapper did.
- **Decision:**
  - Every `CodeBlock` now renders a window chrome: a header bar with macOS-style traffic-light dots, a language label, and the (previously unused) copy button.
  - Long lines wrap inside the block instead of scrolling: the highlighted Shiki `pre` and the plain streaming fallback both get `whitespace-pre-wrap` + `wrap-break-word`, and the body layers switch from `overflow-auto` to `overflow-y-auto`, so no horizontal scrollbar can appear below the frame. Vertical scrolling for very tall blocks is unchanged.
  - The dead absolute-positioned `children` slot moved into the header's right side (nothing passes children today; the copy button fills it).
  - Streamdown chat code blocks get the same containment in `markdown.css`: `[data-streamdown="code-block-body"]` overrides the generic `pre` rule with `white-space: pre-wrap`, `overflow-wrap: break-word` and `overflow-x: hidden`. Their existing header (language + controls) already provides the window frame.
- **Consequences:** Long code lines stay fully readable inside the frame without horizontal scrolling on both render paths, and every code block now looks like its own window with a working copy button where it uses `CodeBlock`. The header adds ~36px of height to every `CodeBlock`; wrapping changes how some gutter/line-number alignment renders for very long lines. HTML artifacts keep their existing custom line-wrap styling.
- **Owner:** team
- **Links:** `web-app/src/components/ai-elements/code-block.tsx`, `web-app/src/styles/markdown.css`