import { describe, it, expect } from 'vitest'
import { parseAcfDate } from '../../src/renderer/src/components/editor/acf/acf-date'

describe('parseAcfDate', () => {
  it('parses the Ymd form ACF stores', () => {
    const date = parseAcfDate('20190221')
    expect(date?.getFullYear()).toBe(2019)
    expect(date?.getMonth()).toBe(1)
    expect(date?.getDate()).toBe(21)
  })

  it.each([
    ['a display-formatted date', '21 February'],
    ['an ISO date', '2019-02-21'],
    ['a slashed date', '21/02/2019'],
    ['free text', 'sometime last year']
  ])('returns undefined for %s rather than an Invalid Date', (_label, value) => {
    // date-fns parse() yields a truthy Invalid Date for these, which then makes
    // format() throw and takes the whole ACF panel down.
    expect(parseAcfDate(value)).toBeUndefined()
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['an empty string', ''],
    ['a number', 20190221],
    ['an array', ['20190221']],
    ['an object', { date: '20190221' }]
  ])('returns undefined for %s', (_label, value) => {
    expect(parseAcfDate(value)).toBeUndefined()
  })
})
