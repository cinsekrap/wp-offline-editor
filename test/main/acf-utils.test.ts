import { describe, it, expect } from 'vitest'
import { normalizeAcf, resolvePulledAcf } from '../../src/main/acf-utils'

describe('normalizeAcf', () => {
  it('keeps a populated object', () => {
    expect(normalizeAcf({ timelines: [{ title: 'a' }] })).toEqual({ timelines: [{ title: 'a' }] })
  })

  it.each([
    ['WP\'s empty-array form', []],
    ['an empty object', {}],
    ['null', null],
    ['undefined', undefined],
    ['a string', 'nope']
  ])('treats %s as no values', (_label, input) => {
    expect(normalizeAcf(input)).toBeNull()
  })
})

describe('resolvePulledAcf', () => {
  it('prefers the plugin field over ACF\'s own', () => {
    // wpoe_acf is the superset: ACF's field only carries groups that opted in.
    const resolved = resolvePulledAcf({
      acf: { subtitle: 'from acf' },
      wpoe_acf: { subtitle: 'from plugin', timelines: [{ title: 'x' }] }
    })

    expect(resolved).toEqual({
      known: true,
      values: { subtitle: 'from plugin', timelines: [{ title: 'x' }] }
    })
  })

  it('falls back to ACF\'s field when the plugin is older than 1.2.0', () => {
    expect(resolvePulledAcf({ acf: { subtitle: 'a' } })).toEqual({
      known: true,
      values: { subtitle: 'a' }
    })
  })

  it('falls through when the plugin declines to answer', () => {
    // null means "cannot answer" — no permission, or exposure filtered off.
    expect(resolvePulledAcf({ wpoe_acf: null, acf: { subtitle: 'a' } })).toEqual({
      known: true,
      values: { subtitle: 'a' }
    })
  })

  it('reports unknown when neither field is present', () => {
    // The caller must keep whatever it already has. Reading this as "empty" is
    // what destroys local custom field data.
    expect(resolvePulledAcf({})).toEqual({ known: false })
  })

  it('reports unknown when the plugin declines and ACF has no field either', () => {
    expect(resolvePulledAcf({ wpoe_acf: null })).toEqual({ known: false })
  })

  it('distinguishes a genuinely empty post from an uninformative response', () => {
    expect(resolvePulledAcf({ wpoe_acf: {} })).toEqual({ known: true, values: null })
    expect(resolvePulledAcf({ acf: [] })).toEqual({ known: true, values: null })
    expect(resolvePulledAcf({})).toEqual({ known: false })
  })
})
