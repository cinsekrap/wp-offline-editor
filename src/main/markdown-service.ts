import TurndownService from 'turndown'
import { marked } from 'marked'

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
})

export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html)
}

export async function markdownToHtml(md: string): Promise<string> {
  return await marked.parse(md)
}
