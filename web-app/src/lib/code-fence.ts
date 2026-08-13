/**
 * Some models end their reply inside a code block without closing the fence
 * (the closing ``` never arrives). If the content has an odd number of fence
 * lines, append a matching closing fence so the block renders instead of
 * swallowing the rest of the message as unparsed text.
 */
export function closeUnclosedCodeFence(content: string): string {
  const fenceRegex = /^ {0,3}(`{3,}|~{3,})[^\n]*$/gm
  const matches = content.match(fenceRegex)
  const count = matches ? matches.length : 0
  if (!matches || count % 2 === 0) return content

  const last = matches[matches.length - 1]
  const marker = last.trimStart().match(/^(`{3,}|~{3,})/)?.[1] ?? '```'
  return `${content.replace(/\s*$/, '')}\n\n${marker}`
}
