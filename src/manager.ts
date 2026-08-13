export interface HarnessRunResult {
  finalResponse: string
  sessionId: string
}

export interface HarnessClient {
  start(): Promise<void>
  run(input: string, options: { sessionId: string }): Promise<HarnessRunResult>
  close(): Promise<void>
}

export type HarnessFactory = () => HarnessClient

export class HarnessBusyError extends Error {
  public constructor(limit: number) {
    super(`Harness pending-turn limit reached (${limit})`)
    this.name = 'HarnessBusyError'
  }
}

export class HarnessTurnTimeoutError extends Error {
  public constructor(timeoutMs: number) {
    super(`Harness turn exceeded ${timeoutMs} ms`)
    this.name = 'HarnessTurnTimeoutError'
  }
}

/** Own one Harness subprocess and serialize turns so timeout recovery has a bounded blast radius. */
export class HarnessRuntimeManager {
  private harness: HarnessClient | undefined
  private tail: Promise<void> = Promise.resolve()
  private pendingTurns = 0
  private closed = false

  public constructor(
    private readonly factory: HarnessFactory,
    private readonly turnTimeoutMs: number,
    private readonly maxPendingTurns: number,
  ) {}

  public async start(): Promise<void> {
    this.assertOpen()
    await this.ensureHarness().start()
  }

  public run(input: string, sessionId: string): Promise<HarnessRunResult> {
    this.assertOpen()
    if (this.pendingTurns >= this.maxPendingTurns) {
      return Promise.reject(new HarnessBusyError(this.maxPendingTurns))
    }

    this.pendingTurns += 1
    const task = this.tail.then(() => this.runNow(input, sessionId))
    this.tail = task.then(
      () => undefined,
      () => undefined,
    )
    return task.finally(() => {
      this.pendingTurns -= 1
    })
  }

  public async restart(): Promise<void> {
    this.assertOpen()
    const current = this.harness
    this.harness = undefined
    if (current) await current.close()
  }

  public async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    const current = this.harness
    this.harness = undefined
    await Promise.allSettled([
      this.tail,
      ...(current ? [current.close()] : []),
    ])
  }

  private async runNow(input: string, sessionId: string): Promise<HarnessRunResult> {
    this.assertOpen()
    const harness = this.ensureHarness()
    try {
      return await this.withTimeout((async () => {
        await harness.start()
        return harness.run(input, { sessionId })
      })())
    } catch (error) {
      await this.discard(harness)
      throw error
    }
  }

  private ensureHarness(): HarnessClient {
    return this.harness ??= this.factory()
  }

  private async discard(harness: HarnessClient): Promise<void> {
    if (this.harness === harness) this.harness = undefined
    try {
      await harness.close()
    } catch {
      // Preserve the turn failure. The failed instance is already detached.
    }
  }

  private async withTimeout<T>(operation: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new HarnessTurnTimeoutError(this.turnTimeoutMs)), this.turnTimeoutMs)
    })
    try {
      return await Promise.race([operation, timeout])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('Harness runtime manager is closed')
  }
}
