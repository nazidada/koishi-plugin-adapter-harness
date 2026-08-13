import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Context, Next, Session } from 'koishi'

import { Config as ConfigSchema, resolveConfig, type Config } from './config.js'
import { Service } from './koishi.js'
import { HarnessBusyError, HarnessRuntimeManager } from './manager.js'
import { ConversationIds, prepareIncomingMessage } from './routing.js'
import { createHarnessSdkFactory } from './sdk.js'

declare module 'koishi' {
  interface Context {
    harnessAdapter: HarnessAdapterService
  }
}

const BUILT_IN_RUNTIME = fileURLToPath(new URL('./runtime.js', import.meta.url))

export class HarnessAdapterService extends Service<Config> {
  public static readonly name = 'harnessAdapter'
  public static readonly Config = ConfigSchema
  public static readonly usage = '将 Koishi 文本会话桥接到 DeepSeek Harness Agent Runtime。'

  private readonly manager: HarnessRuntimeManager
  private readonly conversations: ConversationIds

  public constructor(ctx: Context, input: Partial<Config> = {}) {
    super(ctx, 'harnessAdapter')
    this.config = resolveConfig(input)
    this.conversations = new ConversationIds(this.config.sessionScope)

    const runtimeCwd = resolve(ctx.baseDir, this.config.runtimeCwd)
    const workspaceCwd = resolve(ctx.baseDir, this.config.workspacePath)
    const command = this.config.runtimeCommand.trim() || process.execPath
    const args = this.config.runtimeCommand.trim()
      ? [...this.config.runtimeArgs]
      : [BUILT_IN_RUNTIME]
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DSH_SYSTEM_PROMPT: this.config.systemPrompt,
    }
    if (this.config.apiKey) env.DEEPSEEK_API_KEY = this.config.apiKey
    if (this.config.baseURL) env.DEEPSEEK_BASE_URL = this.config.baseURL

    this.manager = new HarnessRuntimeManager(
      createHarnessSdkFactory({
        command,
        args,
        runtimeCwd,
        workspaceCwd,
        env,
        provider: this.config.provider,
        model: this.config.model,
        maxTokens: this.config.maxTokens,
      }),
      this.config.turnTimeoutMs,
      this.config.maxPendingTurns,
    )

    ctx.middleware((session, next) => this.handle(session, next))
    ctx.command('harness.reset', '重置当前 Harness 对话')
      .action(({ session }) => {
        if (!session) return '当前没有可重置的会话。'
        this.reset(session)
        return 'Harness 会话已重置。'
      })
  }

  public async run(input: string, sessionId: string): Promise<string> {
    const prompt = input.trim()
    if (!prompt) throw new TypeError('Harness input must not be empty')
    if (prompt.length > this.config.maxInputChars) {
      throw new RangeError(`Harness input exceeds ${this.config.maxInputChars} characters`)
    }
    const result = await this.manager.run(prompt, sessionId)
    return result.finalResponse
  }

  public reset(session: Session): string {
    return this.conversations.reset(session)
  }

  public restart(): Promise<void> {
    return this.manager.restart()
  }

  protected override async start(): Promise<void> {
    if (this.config.eagerStart) await this.manager.start()
  }

  protected override async stop(): Promise<void> {
    await this.manager.close()
  }

  private async handle(session: Session, next: Next): Promise<void | string> {
    if (session.argv?.command) return next() as Promise<void>
    const prepared = prepareIncomingMessage(session, this.config)
    if (prepared.kind === 'skip') return next() as Promise<void>
    if (prepared.kind === 'reject') return prepared.reply

    const sessionId = this.conversations.get(session)
    try {
      const result = await this.manager.run(prepared.prompt, sessionId)
      return result.finalResponse.trim() || this.config.emptyReply
    } catch (error) {
      if (error instanceof HarnessBusyError) return this.config.busyReply
      this.logger.warn(
        'turn failed on %s:%s: %s',
        session.platform,
        session.channelId,
        error instanceof Error ? error.message : String(error),
      )
      return this.config.errorReply
    }
  }
}

export default HarnessAdapterService
