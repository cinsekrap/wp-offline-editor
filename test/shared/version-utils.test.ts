import { describe, it, expect } from 'vitest'
import {
  getMinorVersion,
  isPluginVersionMismatch,
  pluginMismatchMessage
} from '@shared/version-utils'

describe('getMinorVersion', () => {
  it('extracts major.minor from a plain semver', () => {
    expect(getMinorVersion('1.2.3')).toBe('1.2')
  })

  it('ignores build metadata and patch', () => {
    expect(getMinorVersion('0.7.5-build.4')).toBe('0.7')
  })

  it('returns the input unchanged when it has no leading version', () => {
    expect(getMinorVersion('not-a-version')).toBe('not-a-version')
  })
})

describe('isPluginVersionMismatch', () => {
  it('is false when major.minor match despite differing patch/build', () => {
    expect(isPluginVersionMismatch('1.1.0', '1.1.52')).toBe(false)
    expect(isPluginVersionMismatch('0.7.5-build.4', '0.7.9')).toBe(false)
  })

  it('is true when minor differs', () => {
    expect(isPluginVersionMismatch('1.0.0', '1.1.0')).toBe(true)
  })

  it('is true when major differs', () => {
    expect(isPluginVersionMismatch('1.9.0', '2.0.0')).toBe(true)
  })
})

describe('pluginMismatchMessage', () => {
  it('names the expected major.minor of the app', () => {
    expect(pluginMismatchMessage('1.1.52')).toContain('v1.1')
  })
})
