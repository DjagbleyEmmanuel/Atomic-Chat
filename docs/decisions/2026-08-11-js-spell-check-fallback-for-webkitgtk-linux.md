---
date: 2026-08-11
title: "JS spell-check fallback because wry/WebKitGTK exposes no spell-check API"
---

# 2026-08-11 — JS spell-check fallback because wry/WebKitGTK exposes no spell-check API

- **Context:** Reported as 3.0.0 bug "spell-check does nothing" on Linux. The chat input set `spellCheck={true}` per the existing `spellCheckChatInput` setting, but the shipped stack — Tauri 2.9.3 → tauri-runtime-wry 2.10.1 → wry 0.54.4 on WebKitGTK — has no spell-check path: wry builds its own private `WebContext`, and the WebKitGTK spell-check switch (`set_spell_checking_enabled`) lives on `WebContext`, which wry never exposes or sets. The browser-side `spellcheck` attribute is therefore inert on Linux.
- **Decision:** Keep the native `spellcheck` attribute (harmless, works where the webview honours it) and layer a pure-JS fallback so Linux gets squiggles too: a dictionary of ~64.8k lowercase words generated from the system `american-english` wordlist (`SPELL_WORDS` in `spell-dictionary.ts`, loaded as a `Set` at import), heuristic `findMisspelled` that skips URLs/emails, proper nouns, camelCase, affix-suffixed forms and contractions, and a `SpellCheckTextarea` that overlays a transparent-caret textarea on a backdrop rendering misspelled tokens with a red wavy underline, scroll-synced and disabled during IME composition.
- **Consequences:** Spelling works on all platforms including Linux. Costs ~557 kB (raw) / ~140 kB gzip of dictionary in a lazily-loaded chunk (bundle split pulls it away from the main entry). Heuristics are approximate — capitalized lowercase typos like "Ths" are treated as proper nouns and skipped, and unknown-but-valid English words outside the dictionary are flagged. Watch for the dictionary never being rebuilt from a newer system wordlist and for the bundle staying code-split.
- **Owner:** team
- **Links:** `web-app/src/lib/spell-check.ts`, `web-app/src/lib/spell-dictionary.ts`, `web-app/src/components/ai-elements/spell-check-textarea.tsx`, `web-app/src/containers/ChatInput.tsx`
