import { delimiter, join } from 'node:path'
import { expect, it } from 'vitest'
import { desktopHostNodeExecutable, desktopNodeEnvironment } from '../src/node-environment.ts'

it('keeps private Desktop launchers out of the Host environment inherited by PTC', () => {
  const environment = { PATH: '/user/bin', HOME: '/user' }
  expect(desktopNodeEnvironment('/desktop/electron', undefined, environment)).toEqual({
    ...environment, ELECTRON_RUN_AS_NODE: '1',
  })
  expect(environment).toEqual({ PATH: '/user/bin', HOME: '/user' })
})

it('provides private launchers only to package installation processes', () => {
  expect(desktopNodeEnvironment('/desktop/electron', '/desktop/bin', { PATH: '/user/bin' })).toEqual({
    ELECTRON_RUN_AS_NODE: '1',
    DSH_DESKTOP_NODE_EXECUTABLE: '/desktop/electron',
    PATH: `/desktop/bin${delimiter}/user/bin`,
  })
})

it.each(['darwin', 'win32'] as const)('reuses the installed Electron runtime on %s', (platform) => {
  expect(desktopHostNodeExecutable('/desktop/electron', '/desktop/runtime', platform)).toBe('/desktop/electron')
})

it('runs the bundled dsh tree under the standalone Node on Linux', () => {
  expect(desktopHostNodeExecutable('/desktop/electron', '/desktop/runtime', 'linux'))
    .toBe(join('/desktop/runtime', 'primary-runtime', 'dependencies', 'node', 'bin', 'node'))
})
