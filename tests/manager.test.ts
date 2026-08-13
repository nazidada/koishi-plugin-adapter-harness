import { describe, expect, it, vi } from 'vitest'

import {
  HarnessBusyError,
  HarnessRuntimeManager,
  HarnessTurnTimeoutError,
  type HarnessClient,
  type HarnessRunResult,
} from '../src/manager.js'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function result(text: string, sessionId = 'session'): HarnessRunResult {
  return { finalResponse: text, sessionId }
}

describe('HarnessRuntimeManager', () => {
  it('serializes turns in arrival order', async () => {
    const first = deferred<HarnessRunResult>()
    const second = deferred<HarnessRunResult>()
    const run = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const harness: HarnessClient = {
      start: vi.fn(async () => undefined),
      run,
      close: vi.fn(async () => undefined),
    }
    const manager = new HarnessRuntimeManager(() => harness, 1000, 4)

    const one = manager.run('one', 's1')
    const two = manager.run('two', 's2')
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    first.resolve(result('first', 's1'))
    await expect(one).resolves.toEqual(result('first', 's1'))
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2))
    second.resolve(result('second', 's2'))
    await expect(two).resolves.toEqual(result('second', 's2'))
    expect(run.mock.calls.map(call => call[0])).toEqual(['one', 'two'])

    await manager.close()
  })

  it('rejects work beyond the pending-turn limit', async () => {
    const pending = deferred<HarnessRunResult>()
    const harness: HarnessClient = {
      start: vi.fn(async () => undefined),
      run: vi.fn(() => pending.promise),
      close: vi.fn(async () => undefined),
    }
    const manager = new HarnessRuntimeManager(() => harness, 1000, 1)

    const accepted = manager.run('one', 's1')
    await expect(manager.run('two', 's2')).rejects.toBeInstanceOf(HarnessBusyError)
    pending.resolve(result('done', 's1'))
    await accepted
    await manager.close()
  })

  it('discards a failed runtime and creates a fresh one for the next turn', async () => {
    const first: HarnessClient = {
      start: vi.fn(async () => undefined),
      run: vi.fn(async () => { throw new Error('runtime died') }),
      close: vi.fn(async () => undefined),
    }
    const second: HarnessClient = {
      start: vi.fn(async () => undefined),
      run: vi.fn(async () => result('recovered', 's2')),
      close: vi.fn(async () => undefined),
    }
    const factory = vi.fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second)
    const manager = new HarnessRuntimeManager(factory, 1000, 2)

    await expect(manager.run('one', 's1')).rejects.toThrow('runtime died')
    await expect(manager.run('two', 's2')).resolves.toEqual(result('recovered', 's2'))
    expect(first.close).toHaveBeenCalledOnce()
    expect(factory).toHaveBeenCalledTimes(2)
    await manager.close()
  })

  it('closes and detaches a runtime after a whole-turn timeout', async () => {
    const harness: HarnessClient = {
      start: vi.fn(async () => undefined),
      run: vi.fn(() => new Promise<HarnessRunResult>(() => undefined)),
      close: vi.fn(async () => undefined),
    }
    const manager = new HarnessRuntimeManager(() => harness, 10, 1)

    await expect(manager.run('slow', 's1')).rejects.toBeInstanceOf(HarnessTurnTimeoutError)
    expect(harness.close).toHaveBeenCalledOnce()
    await manager.close()
  })

  it('includes runtime startup in the whole-turn timeout', async () => {
    const harness: HarnessClient = {
      start: vi.fn(() => new Promise<void>(() => undefined)),
      run: vi.fn(async () => result('unused')),
      close: vi.fn(async () => undefined),
    }
    const manager = new HarnessRuntimeManager(() => harness, 10, 1)

    await expect(manager.run('slow start', 's1')).rejects.toBeInstanceOf(HarnessTurnTimeoutError)
    expect(harness.run).not.toHaveBeenCalled()
    expect(harness.close).toHaveBeenCalledOnce()
    await manager.close()
  })

  it('refuses new work after close', async () => {
    const harness: HarnessClient = {
      start: vi.fn(async () => undefined),
      run: vi.fn(async () => result('unused')),
      close: vi.fn(async () => undefined),
    }
    const manager = new HarnessRuntimeManager(() => harness, 1000, 1)
    await manager.close()

    expect(() => manager.run('late', 's1')).toThrow('closed')
  })
})
