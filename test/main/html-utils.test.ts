import { describe, it, expect } from 'vitest'
import { wpContentToHtml } from '../../src/main/html-utils'

describe('wpContentToHtml', () => {
  it('falls back to rendered when the site gave us no raw content', () => {
    expect(wpContentToHtml({ rendered: '<p>Body</p>' })).toBe('<p>Body</p>')
  })

  it('keeps a shortcode intact instead of using its rendered expansion', () => {
    const html = wpContentToHtml({
      raw: '[my_timeline]',
      rendered: '<div class="acf-timeline"><div class="item">2019</div></div>'
    })

    expect(html).toBe('<p>[my_timeline]</p>')
  })

  it('preserves shortcode attributes and closing tags', () => {
    const html = wpContentToHtml({
      raw: '[timeline id="5" theme=\'dark\']inner[/timeline]',
      rendered: '<div></div>'
    })

    expect(html).toContain('[timeline id="5" theme=\'dark\']inner[/timeline]')
  })

  it('restores paragraphs in classic content that relies on wpautop', () => {
    const html = wpContentToHtml({ raw: 'First para.\n\nSecond para.', rendered: '' })

    expect(html).toBe('<p>First para.</p>\n<p>Second para.</p>')
  })

  it('converts single newlines within a paragraph to line breaks', () => {
    const html = wpContentToHtml({ raw: 'Line one\nLine two', rendered: '' })

    expect(html).toBe('<p>Line one<br />Line two</p>')
  })

  it('leaves existing block-level markup unwrapped', () => {
    const html = wpContentToHtml({ raw: '<h2>Title</h2>\n\n<p>Body</p>', rendered: '' })

    expect(html).toBe('<h2>Title</h2>\n<p>Body</p>')
  })

  it('strips Gutenberg block delimiters but keeps the block content', () => {
    const raw = [
      '<!-- wp:paragraph --><p>Intro</p><!-- /wp:paragraph -->',
      '',
      '<!-- wp:shortcode -->[my_timeline]<!-- /wp:shortcode -->'
    ].join('\n')

    const html = wpContentToHtml({ raw, rendered: '<p>Intro</p><div class="timeline"></div>' })

    expect(html).not.toContain('wp:')
    expect(html).toContain('<p>Intro</p>')
    expect(html).toContain('[my_timeline]')
  })

  it('strips self-closing block delimiters', () => {
    const raw = '<!-- wp:spacer {"height":"32px"} /-->\n\n<p>After</p>'

    expect(wpContentToHtml({ raw, rendered: '' })).toBe('<p>After</p>')
  })

  it('returns an empty string for an empty raw post', () => {
    expect(wpContentToHtml({ raw: '', rendered: '' })).toBe('')
  })
})
