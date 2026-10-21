/** Build the macOS helper for exact-path command symlink installation. */

import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Compile the command-link helper before signing Desktop resources.
 * @param destination - Physical runtime/cli directory.
 * @param arch - Desktop architecture, independent of the build host architecture.
 * @param minimumVersion - Minimum macOS version declared by Electron.
 */
export function prepareCommandLink(destination: string, arch: 'arm64' | 'x64', minimumVersion: string): void {
  if (!/^\d+\.\d+(?:\.\d+)?$/u.test(minimumVersion)) {
    throw new Error('desktop command link: Electron minimum version is required')
  }
  if (process.platform !== 'darwin') {
    // A cross-build cannot compile the helper with macOS clang; the installed
    // app links commands through its bundle binary instead of the helper.
    mkdirSync(destination, { recursive: true })
    return
  }
  mkdirSync(destination, { recursive: true })
  execFileSync('clang', ['-std=c11', '-O2', '-Wall', '-Wextra', '-Werror',
    '-arch', arch === 'arm64' ? 'arm64' : 'x86_64', '-mmacosx-version-min=' + minimumVersion,
    join(import.meta.dirname, '..', 'cli', 'link-entry.c'), '-o', join(destination, 'link-entry')], { stdio: 'inherit' })
}
