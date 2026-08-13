import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'

import type { HarnessFactory } from './manager.js'

export interface HarnessSdkFactoryOptions {
  command: string
  args: string[]
  runtimeCwd: string
  workspaceCwd: string
  env: NodeJS.ProcessEnv
  provider: string
  model: string
  maxTokens: number
}

export function createHarnessSdkFactory(options: HarnessSdkFactoryOptions): HarnessFactory {
  return () => new DeepSeekHarness({
    launch: {
      command: options.command,
      args: [...options.args],
      cwd: options.runtimeCwd,
      env: { ...options.env },
      requestTimeoutMs: 30_000,
    },
    cwd: options.workspaceCwd,
    provider: options.provider,
    model: options.model,
    maxTokens: options.maxTokens,
  })
}
