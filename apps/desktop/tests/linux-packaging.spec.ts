/** Unsigned Linux packaging configuration resolves without release infrastructure. */

import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createElectronBuilderConfig } from '../scripts/electron-builder-config.mjs'
import { validateDesktopPackageEnvironment } from '../scripts/desktop-package-environment.mjs'

const UNSIGNED_LINUX = {
  DSH_DESKTOP_APP_ID: 'com.example.linux',
  DSH_DESKTOP_UNSIGNED: '1',
} as const

describe('unsigned Linux packaging configuration', () => {
  it('resolves with only an application identifier and publishes no update feed', () => {
    const config = createElectronBuilderConfig(UNSIGNED_LINUX, 'linux', 'x64')
    expect(config.publish).toBeNull()
    expect(config.extraMetadata).not.toHaveProperty('dshMandatoryUpdatePolicy')
    expect(config.linux).toMatchObject({ executableName: 'deepseek-harness', target: ['AppImage', 'deb'] })
    expect(existsSync(config.linux.icon)).toBe(true)
    expect(() => {
      validateDesktopPackageEnvironment(UNSIGNED_LINUX, { platform: 'linux', arch: 'x64' }, { unsigned: true })
    }).not.toThrow()
  })

  it('ships the dsh tree as physical resources instead of application archive members', () => {
    const config = createElectronBuilderConfig(UNSIGNED_LINUX, 'linux', 'x64')
    const dshMember = (entry: unknown): boolean => {
      if (typeof entry !== 'object' || entry === null) return false
      const to = (entry as { to?: unknown }).to
      return to === 'dsh' || to === 'dsh/node_modules'
    }
    expect(config.files.some(dshMember)).toBe(false)
    // The standalone Node reads plain files, so both the tree and its node_modules land in resources.
    expect(config.extraResources.filter(dshMember)).toHaveLength(2)
  })

  it('resolves an unsigned macOS build without policy settings on the same rule', () => {
    expect(() => createElectronBuilderConfig({ DSH_DESKTOP_APP_ID: 'com.example.mac', DSH_DESKTOP_UNSIGNED: '1' }, 'darwin', 'arm64'))
      .not.toThrow()
  })

  it('rejects a signed Linux build at its missing update feed', () => {
    const signedLinux = {
      DSH_DESKTOP_APP_ID: 'com.example.linux',
      DSH_DESKTOP_MANDATORY_UPDATE_TEST_ORIGIN: 'https://policy.example.com',
      DSH_DESKTOP_MANDATORY_UPDATE_CONFIG: JSON.stringify({ allowedAuthOrigins: ['https://login.example.com'] }),
    }
    expect(() => createElectronBuilderConfig(signedLinux, 'linux', 'x64'))
      .toThrow('desktop auto-update: unsupported target linux-x64')
  })
})
