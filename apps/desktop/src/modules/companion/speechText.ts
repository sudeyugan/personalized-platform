export function toSpokenText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~`#>]/g, '')
    .replace(/^\s*(?:[-+] |\d+[.)]\s+)/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
