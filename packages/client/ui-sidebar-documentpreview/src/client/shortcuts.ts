/**
 * The find command's request source: one counter every mounted text body
 * observes, and only the body holding focus answers. The command itself knows
 * nothing about tabs or focus routing; the DOM decides.
 */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'

/** The counter the focused text body opens its find bar on. */
export type FindRequest = SnapshotStore<number>

/**
 * Create the find request source.
 * @returns the store the command bumps and every text body observes.
 */
export function createFindRequest(): FindRequest {
  return createSnapshotStore(0)
}

/**
 * Bump the find request once.
 * @param request - the store the command and the bodies share.
 */
export function requestFind(request: FindRequest): void {
  request.set(request.getSnapshot() + 1)
}
