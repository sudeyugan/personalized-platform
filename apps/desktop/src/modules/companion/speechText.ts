export function toSpokenText(markdown: string) {
  const escaped: string[] = []
  const protectedText = markdown.replace(/\\([\\`*[\]#>_~.+()-])/g, (_match, character: string) => { escaped.push(character); return `\uE000${escaped.length - 1}\uE001` })
  return protectedText
    .replace(/^(`{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~`#>]/g, '')
    .replace(/^\s*(?:[-+] |\d+[.)]\s+)/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\uE000(\d+)\uE001/g, (match, index: string) => escaped[Number(index)] ?? match)
    .trim()
}
