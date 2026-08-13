#!/usr/bin/env node

import { Context } from '@deepseek-ai/cordis'
import * as AgentSpine from '@deepseek-ai/dsh-agent-spine-demo'
import * as LlmDeepSeek from '@deepseek-ai/dsh-llm-deepseek'
import * as JsonRpcServer from '@deepseek-ai/dsh-sdk-jsonrpc-server'

const DEFAULT_PERSONA = '你是一个由 DeepSeek Harness 驱动的 Koishi 聊天助手。请直接、准确且友善地回答。'

const ctx = new Context()
let stopTask: Promise<void> | undefined

function stop(code: number): Promise<void> {
  stopTask ??= (async () => {
    await ctx.fiber.dispose()
    process.exit(code)
  })()
  return stopTask
}

process.stdin.once('end', () => {
  void stop(0)
})
process.once('SIGINT', () => {
  void stop(130)
})
process.once('SIGTERM', () => {
  void stop(0)
})

try {
  await ctx.plugin(AgentSpine, {
    includeHarnessIdentity: false,
    includeRuntimeContext: false,
    persona: process.env.DSH_SYSTEM_PROMPT?.trim() || DEFAULT_PERSONA,
    workspaceContext: false,
    skills: { enabled: false },
    toolBash: false,
    toolJobs: false,
    goals: false,
  })
  await ctx.plugin(LlmDeepSeek, {
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    ...(process.env.DEEPSEEK_BASE_URL ? { baseURL: process.env.DEEPSEEK_BASE_URL } : {}),
  })
  await ctx.plugin(JsonRpcServer, { maxTokensAsSuccess: true })
} catch (error) {
  process.stderr.write(`koishi-harness-runtime: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  await ctx.fiber.dispose()
  process.exit(1)
}
