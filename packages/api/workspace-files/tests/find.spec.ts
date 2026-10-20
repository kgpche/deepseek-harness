/** The `find` endpoint: its request gates and the matches the scan reports. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { failureOf, openWorkspace, signal, type Harness } from './harness.ts'

let harness: Harness
let workspace: string

beforeEach(async () => {
  harness = await openWorkspace('dsh-workspace-files-find-')
  workspace = harness.workspace
})

afterEach(async () => {
  await harness.dispose()
})

describe('workspaceFiles.find — the happy path', () => {
  it('reports literal matches with line numbers, in-line spans, and line previews in file order', async () => {
    await writeFile(join(workspace, 'search.txt'), 'alpha\nno hit\nbeta alpha\nalpha', 'utf8')
    const found = await harness.endpoint().find(harness.scope, 'search.txt', { query: 'alpha' }, signal())
    expect(found.matches).toEqual([
      { lineNumber: 1, start: 0, end: 5, line: 'alpha' },
      { lineNumber: 3, start: 5, end: 10, line: 'beta alpha' },
      { lineNumber: 4, start: 0, end: 5, line: 'alpha' },
    ])
    expect(found.truncated).toBe(false)
    expect(found.absolutePath.endsWith('search.txt')).toBe(true)
  })

  it('matches case-insensitively by default and exactly when asked', async () => {
    await writeFile(join(workspace, 'case.txt'), 'Word word WORD\n', 'utf8')
    const service = harness.endpoint()
    expect((await service.find(harness.scope, 'case.txt', { query: 'word' }, signal())).matches).toHaveLength(3)
    const exact = await service.find(harness.scope, 'case.txt', { query: 'word', caseSensitive: true }, signal())
    expect(exact.matches).toEqual([{ lineNumber: 1, start: 5, end: 9, line: 'Word word WORD' }])
  })

  it('treats the query as a regular expression when asked, with every occurrence reported', async () => {
    await writeFile(join(workspace, 're.txt'), 'ab abab\n', 'utf8')
    const found = await harness.endpoint().find(harness.scope, 're.txt', { query: 'ab+', regex: true }, signal())
    // The two overlapping 'ab's of 'abab' both match: matchAll resumes at the
    // previous match's end.
    expect(found.matches.map(match => [match.start, match.end])).toEqual([[0, 2], [3, 5], [5, 7]])
  })

  it('finds matches in a byte-order-marked UTF-16 file with correct code-unit offsets', async () => {
    await writeFile(join(workspace, 'u16.env'), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('KEY=值\nxKEY\n', 'utf16le')]))
    const found = await harness.endpoint().find(harness.scope, 'u16.env', { query: 'KEY' }, signal())
    expect(found.matches.map(match => [match.lineNumber, match.start])).toEqual([[1, 0], [2, 1]])
  })

  it('finds nothing in a file without a hit and previews a long matched line', async () => {
    await writeFile(join(workspace, 'none.txt'), 'nothing here\n', 'utf8')
    const found = await harness.endpoint().find(harness.scope, 'none.txt', { query: 'zzz' }, signal())
    expect(found.matches).toEqual([])
    expect(found.truncated).toBe(false)
    const long = `${'x'.repeat(300)}needle${'y'.repeat(50)}\n`
    await writeFile(join(workspace, 'long.txt'), long, 'utf8')
    const previewed = await harness.endpoint().find(harness.scope, 'long.txt', { query: 'needle' }, signal())
    expect(previewed.matches[0]?.line).toHaveLength(200)
    expect(previewed.matches[0]?.start).toBe(300)
  })
})

describe('workspaceFiles.find — gates and caps', () => {
  it('rejects an empty query and an invalid regular expression before opening any file', async () => {
    const service = harness.endpoint()
    expect((await failureOf(service.find(harness.scope, 'any.txt', { query: '' }, signal()))).code).toBe('gateway/bad-request')
    expect((await failureOf(service.find(harness.scope, 'any.txt', { query: 'a(', regex: true }, signal()))).code).toBe('gateway/bad-request')
  })

  it('keeps the shared gates: missing file, directory, and undecodable text', async () => {
    const service = harness.endpoint()
    expect((await failureOf(service.find(harness.scope, 'nope.txt', { query: 'a' }, signal()))).code).toBe('workspace-file/not-found')
    expect((await failureOf(service.find(harness.scope, '.', { query: 'a' }, signal()))).code).toBe('workspace-file/not-regular-file')
    await writeFile(join(workspace, 'bin.dat'), Buffer.from([0x61, 0x00, 0x62]))
    expect((await failureOf(service.find(harness.scope, 'bin.dat', { query: 'a' }, signal()))).code).toBe('workspace-file/not-text')
  })

  it('stops at the result cap and reports the scan cut', async () => {
    await writeFile(join(workspace, 'many.txt'), Array.from({ length: 20 }, () => 'hit').join('\n'), 'utf8')
    const found = await harness.endpoint({ maxFindResults: 5 }).find(harness.scope, 'many.txt', { query: 'hit' }, signal())
    expect(found.matches).toHaveLength(5)
    expect(found.matches[4]?.lineNumber).toBe(5)
    expect(found.truncated).toBe(true)
  })
})
