/**
 * The preview's own state: the pages it has read, and how the reader views them.
 *
 * The `file` resource carries metadata only, so the text is this type's to fetch
 * and keep — page by page, keyed by the 1-based line each page starts at. The
 * view state (scroll offset, wrap, the navigation already answered) must outlive
 * the body: a tab switched away from unmounts its body and must come back where
 * it was rather than re-read or jump to its opening line again. Bucketed by tab
 * id because two tabs of one file scroll independently.
 *
 * A bucket lives as long as its tab record: the face's first read of a tab arms
 * one listener on the owner's `signal` that forgets the bucket when the record
 * ends, and a tab that never read has no bucket to forget.
 */
import type { RemoteFailure } from '@deepseek-ai/dsh-api-remotes/client'
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { WorkspaceFileFindRequest, WorkspaceFileMatch, WorkspaceFileText } from '@deepseek-ai/dsh-api-workspace-files/types'
import type { DocumentFileBytes } from './rpc.ts'
import type { DocumentLoadMode } from './document/registry.ts'

/**
 * One page as the store keeps it: its text and the Host's line count, which
 * tells a page past the file's last line (`lines: 0`) from a page holding one
 * empty line (`lines: 1`, `text: ''`).
 */
export interface TextPage {
  readonly text: string
  readonly lines: number
}

/** One find query's live state: the query, its settled outcome, and the current match. */
export interface FindState {
  /** The query the bar holds; results answer it with the flags below. */
  query: string
  /** Whether the query matches case-sensitively. */
  caseSensitive: boolean
  /** Whether the query is a regular expression. */
  regex: boolean
  /** Matches in file order; empty before the first run and after an edit. */
  matches: readonly WorkspaceFileMatch[]
  /** Whether the Host's result cap cut the scan. */
  truncated: boolean
  /** Index into `matches` of the current match; −1 with none. */
  index: number
  /** Index the body already scrolled to, so unrelated writes do not re-land it. */
  landed: number
  /** A find is in flight. */
  loading: boolean
  /** Why the last find failed; cleared by the next edit or run. */
  failure: RemoteFailure | undefined
}

/** A find state before anything was asked. */
function freshFind(): FindState {
  return {
    query: '', caseSensitive: false, regex: false, matches: [], truncated: false,
    index: -1, landed: -1, loading: false, failure: undefined,
  }
}

/** One tab's pages and view. */
export interface TextTabState {
  autoRefresh: boolean
  resourcesDirty: boolean
  /** Explicit viewer choice for this tab; absence follows automatic matching. */
  rendererId?: string
  /** Current display-loading mode; absent before the first read. */
  mode?: DocumentLoadMode
  /** Implementation owning source loading; absent for ordinary file reads. */
  contentRendererId?: string
  /** Current content revision, incremented whenever loaded content is discarded. */
  loadRevision: number
  /** Full byte result used by complete-file renderers. */
  complete?: DocumentFileBytes
  /** The file version the loaded pages belong to; absent before the first page. */
  version: string | undefined
  /** Metadata version observed when this tab began its current read generation. */
  observedVersion: string | undefined
  /** Pages by the 1-based line each starts at. */
  pages: Record<number, TextPage>
  /** Whether the last loaded page reached the end of the file. */
  eof: boolean
  /** A page read is in flight. */
  loading: boolean
  /** Why the last page read failed; cleared by the next page. */
  failure: RemoteFailure | undefined
  /** Scroll offset of the body, in px. */
  scrollTop: number
  /** Whether long lines wrap instead of scrolling horizontally; on until the reader turns it off. */
  wrap: boolean
  /** The `navigation.revision` the body already answered; absent before the first. */
  revision: number | undefined
  /** Whether the find bar is open over the body. */
  findOpen: boolean
  /** The find bar's live query state; absent until the bar first opens. */
  find: FindState | undefined
}

/** Every tab's state, keyed by tab id. */
export interface TextState {
  byTab: Record<TabId, TextTabState>
}

/**
 * A tab's state before it reads, scrolls, toggles, or answers anything.
 * @returns the empty bucket.
 */
export function fresh(): TextTabState {
  return {
    autoRefresh: true,
    resourcesDirty: false,
    loadRevision: 0,
    version: undefined,
    observedVersion: undefined,
    pages: {},
    eof: false,
    loading: false,
    failure: undefined,
    scrollTop: 0,
    wrap: true,
    revision: undefined,
    findOpen: false,
    find: undefined,
  }
}

/** The bucket for one tab, created on first write. */
function bucket(state: TextState, tabId: TabId): TextTabState {
  return state.byTab[tabId] ??= fresh()
}

/** The preview store's write set; every action names the tab it writes. */
type TextActions = {
  toggledAutoRefresh: (draft: TextState, tabId: TabId) => void
  resourceChanged: (draft: TextState, tabId: TabId) => void
  selected: (draft: TextState, tabId: TabId, rendererId: string | undefined) => void
  loading: (draft: TextState, tabId: TabId, mode?: DocumentLoadMode, observedVersion?: string, contentRendererId?: string) => void
  rendered: (draft: TextState, tabId: TabId, revision: number, version: string) => void
  rendererFailed: (draft: TextState, tabId: TabId, revision: number) => void
  complete: (draft: TextState, tabId: TabId, file: DocumentFileBytes) => void
  page: (draft: TextState, tabId: TabId, page: WorkspaceFileText) => void
  failed: (draft: TextState, tabId: TabId, failure: RemoteFailure) => void
  reset: (draft: TextState, tabId: TabId) => void
  scrolled: (draft: TextState, tabId: TabId, scrollTop: number) => void
  toggledWrap: (draft: TextState, tabId: TabId) => void
  navigated: (draft: TextState, tabId: TabId, revision: number) => void
  findOpened: (draft: TextState, tabId: TabId) => void
  findClosed: (draft: TextState, tabId: TabId) => void
  findEdited: (draft: TextState, tabId: TabId, query: string) => void
  findToggled: (draft: TextState, tabId: TabId, flag: 'caseSensitive' | 'regex') => void
  findLoading: (draft: TextState, tabId: TabId) => void
  findSettled: (
    draft: TextState, tabId: TabId, request: FindRequestKey,
    result: { readonly matches: readonly WorkspaceFileMatch[]; readonly truncated: boolean },
  ) => void
  findFailed: (draft: TextState, tabId: TabId, request: FindRequestKey, failure: RemoteFailure) => void
  findStepped: (draft: TextState, tabId: TabId, delta: 1 | -1) => void
  findLanded: (draft: TextState, tabId: TabId) => void
  forget: (draft: TextState, tabId: TabId) => void
}

/** The request identity a settlement must still match to be kept. */
export type FindRequestKey = Pick<WorkspaceFileFindRequest, 'query' | 'caseSensitive' | 'regex'>

/**
 * Declare the preview's store.
 *
 * Constructed once in apply and shared by the body and the tools registrations,
 * which the slot runtime allows because both are session-scoped.
 * @returns the store handle to declare on both registrations.
 */
export function createTextStore(): EngineStoreHandle<TextState, TextActions> {
  return defineStore({
    init: (): TextState => ({ byTab: {} }),
    actions: {
      toggledAutoRefresh: (d, tabId: TabId) => {
        const state = bucket(d, tabId)
        state.autoRefresh = !state.autoRefresh
      },
      resourceChanged: (d, tabId: TabId) => { bucket(d, tabId).resourcesDirty = true },
      /** @param d - draft. @param tabId - owning tab. @param rendererId - manual choice, or automatic selection. */
      selected: (d, tabId: TabId, rendererId: string | undefined) => {
        if (rendererId === undefined) delete bucket(d, tabId).rendererId
        else bucket(d, tabId).rendererId = rendererId
      },
      /**
       * Mark a page read as in flight.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param mode - selected renderer's loading mode.
       * @param observedVersion - metadata version at read start; later pages retain the initial observation.
       * @param contentRendererId - implementation owning source loading.
       */
      loading: (d, tabId: TabId, mode?: DocumentLoadMode, observedVersion?: string, contentRendererId?: string) => {
        const state = bucket(d, tabId)
        if (state.version === undefined && !state.loading) state.observedVersion = observedVersion
        if (contentRendererId === undefined) delete state.contentRendererId
        else state.contentRendererId = contentRendererId
        state.loading = true
        state.failure = undefined
        if (mode !== undefined) state.mode = mode
      },
      /**
       * @param d - draft. @param tabId - owning tab.
       * @param revision - active content revision. @param version - displayed source version.
       */
      rendered: (d, tabId: TabId, revision: number, version: string) => {
        const state = d.byTab[tabId]
        if (state?.mode !== 'renderer' || state.loadRevision !== revision) return
        state.version = version
        state.loading = false
      },
      /** @param d - draft. @param tabId - owning tab. @param revision - failed content revision. */
      rendererFailed: (d, tabId: TabId, revision: number) => {
        const state = d.byTab[tabId]
        if (state?.mode !== 'renderer' || state.loadRevision !== revision) return
        state.loading = false
      },
      /** @param d - draft. @param tabId - owning tab. @param file - complete byte result for this view. */
      complete: (d, tabId: TabId, file: DocumentFileBytes) => {
        const state = bucket(d, tabId)
        state.complete = file
        state.version = file.version
        state.eof = true
        state.loading = false
        state.failure = undefined
      },
      /**
       * Keep one page. A page from a newer file version invalidates the pages
       * of the older one, so the body never shows two versions at once.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param page - the page the Host returned.
       */
      page: (d, tabId: TabId, page: WorkspaceFileText) => {
        const state = bucket(d, tabId)
        if (state.version !== undefined && state.version !== page.version) {
          state.pages = {}
          // The find results answered the retired version; the query stays for a re-run.
          if (state.find !== undefined) state.find = { ...state.find, matches: [], truncated: false, index: -1, landed: -1, loading: false }
        }
        state.version = page.version
        state.pages[page.offset] = { text: page.text, lines: page.lines }
        state.eof = page.eof
        state.loading = false
        state.failure = undefined
      },
      /**
       * Record why a page read failed; the pages already held stay.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param failure - the settled Remote failure.
       */
      failed: (d, tabId: TabId, failure: RemoteFailure) => {
        const state = bucket(d, tabId)
        state.loading = false
        state.failure = failure
      },
      /**
       * Drop every page, keeping the view, for a re-read from the first line.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       */
      reset: (d, tabId: TabId) => {
        const state = bucket(d, tabId)
        state.resourcesDirty = false
        state.loadRevision++
        state.pages = {}
        delete state.complete
        state.eof = false
        state.version = undefined
        state.observedVersion = undefined
        state.loading = false
        state.failure = undefined
        if (state.find !== undefined) state.find = { ...state.find, matches: [], truncated: false, index: -1, landed: -1, loading: false }
      },
      /**
       * Record where one tab's body is scrolled to.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param scrollTop - the body's scroll offset, in px.
       */
      scrolled: (d, tabId: TabId, scrollTop: number) => {
        bucket(d, tabId).scrollTop = scrollTop
      },
      /**
       * Switch one tab between wrapped and unwrapped lines.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       */
      toggledWrap: (d, tabId: TabId) => {
        const state = bucket(d, tabId)
        state.wrap = !state.wrap
      },
      /**
       * Record that the body answered one navigation, so a remount restores the
       * reader's position instead of jumping again.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param revision - the `navigation.revision` answered.
       */
      navigated: (d, tabId: TabId, revision: number) => {
        bucket(d, tabId).revision = revision
      },
      /** @param d - draft. @param tabId - owning tab. */
      findOpened: (d, tabId: TabId) => {
        const state = bucket(d, tabId)
        state.findOpen = true
        state.find ??= freshFind()
      },
      /** @param d - draft. @param tabId - owning tab. */
      findClosed: (d, tabId: TabId) => {
        bucket(d, tabId).findOpen = false
      },
      /**
       * Keep the query and retire the previous results: they answered something
       * else and must not mark lines or drive the counter until the next run.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param query - the query text the bar now holds.
       */
      findEdited: (d, tabId: TabId, query: string) => {
        const find = bucket(d, tabId).find ??= freshFind()
        find.query = query
        find.matches = []
        find.truncated = false
        find.index = -1
        find.landed = -1
        find.loading = false
        find.failure = undefined
      },
      /**
       * Flip one matching flag and retire the results with it.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param flag - the flag the bar toggled.
       */
      findToggled: (d, tabId: TabId, flag: 'caseSensitive' | 'regex') => {
        const find = bucket(d, tabId).find ??= freshFind()
        find[flag] = !find[flag]
        find.matches = []
        find.truncated = false
        find.index = -1
        find.landed = -1
        find.loading = false
        find.failure = undefined
      },
      /** @param d - draft. @param tabId - owning tab. */
      findLoading: (d, tabId: TabId) => {
        const find = bucket(d, tabId).find
        if (find !== undefined) find.loading = true
      },
      /**
       * Keep one settled find. A settlement for a request the bar has since
       * left behind — more typing, a toggled flag — writes nothing.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param request - the request the result answers.
       * @param result - the matches and cut marker the Host returned.
       */
      findSettled: (
        d, tabId: TabId, request: FindRequestKey,
        result: { readonly matches: readonly WorkspaceFileMatch[]; readonly truncated: boolean },
      ) => {
        const find = d.byTab[tabId]?.find
        if (find === undefined || find.query !== request.query
          || find.caseSensitive !== (request.caseSensitive ?? false) || find.regex !== (request.regex ?? false)) return
        find.loading = false
        find.matches = [...result.matches]
        find.truncated = result.truncated
        find.index = result.matches.length > 0 ? 0 : -1
        find.landed = -1
      },
      /**
       * Record why one find failed, under the same request identity guard.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param request - the request that failed.
       * @param failure - the settled Remote failure.
       */
      findFailed: (d, tabId: TabId, request: FindRequestKey, failure: RemoteFailure) => {
        const find = d.byTab[tabId]?.find
        if (find === undefined || find.query !== request.query
          || find.caseSensitive !== (request.caseSensitive ?? false) || find.regex !== (request.regex ?? false)) return
        find.loading = false
        find.failure = failure
      },
      /**
       * Move the current match, wrapping around like VSCode's find.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param delta - step direction: `1` forward, `-1` back.
       */
      findStepped: (d, tabId: TabId, delta: 1 | -1) => {
        const find = d.byTab[tabId]?.find
        if (find === undefined || find.matches.length === 0) return
        find.index = (find.index + delta + find.matches.length) % find.matches.length
      },
      /**
       * Record that the body scrolled to the current match.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       */
      findLanded: (d, tabId: TabId) => {
        const find = d.byTab[tabId]?.find
        if (find !== undefined && find.index !== find.landed) find.landed = find.index
      },
      /**
       * Drop one tab's state, for a tab record that is gone.
       * @param d - draft state.
       * @param tabId - the tab that went away.
       */
      forget: (d, tabId: TabId) => {
        const byTab: TextState['byTab'] = {}
        // Keys were written from tab ids; reading them back as ids is exact.
        for (const [id, state] of Object.entries(d.byTab) as [TabId, TextTabState][]) {
          if (id !== tabId) byTab[id] = state
        }
        d.byTab = byTab
      },
    },
  })
}

/** The store handle type both registrations declare. */
export type TextStore = ReturnType<typeof createTextStore>
