/** Electron Node-mode startup, with private shell launchers scoped to package installation. */

import { delimiter, join } from 'node:path'

/**
 * Select Electron's Node mode and the shell launcher used by package scripts.
 * @param executable - Electron executable running the application.
 * @param bin - Directory containing the node shell launcher.
 * @param environment - Caller environment preserved for plugin execution.
 * @returns Environment for a Node-mode child process.
 */
export function desktopNodeEnvironment(executable: string, bin: string | undefined, environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...environment,
    ELECTRON_RUN_AS_NODE: '1',
    ...(bin === undefined ? {} : { DSH_DESKTOP_NODE_EXECUTABLE: executable, PATH: `${bin}${delimiter}${environment.PATH ?? ''}` }),
  }
}

/**
 * Select the Node executable the bundled dsh tree runs under.
 * Linux uses the primary-runtime Node binary because the Electron executable loads its
 * GTK-linked libraries even in Node mode, and the leaked system glib symbols crash
 * glib-linked native modules such as sharp's libvips ([electron#46323](https://github.com/electron/electron/issues/46323)).
 * Every other platform reuses the installed Electron runtime.
 * @param electron - Electron executable of the installation or build checkout.
 * @param runtimeRoot - Runtime directory whose `primary-runtime` subtree ships the standalone Node.
 * @param platform - Platform of the prepared payload; defaults to the running host.
 * @returns Executable for Host, CLI, and smoke processes to run Node under.
 */
export function desktopHostNodeExecutable(electron: string, runtimeRoot: string, platform: NodeJS.Platform = process.platform): string {
  if (platform !== 'linux') return electron
  return join(runtimeRoot, 'primary-runtime', 'dependencies', 'node', 'bin', 'node')
}
