import type { Schema as SchemaType } from 'koishi'

import { Schema } from './koishi.js'

export type TriggerMode = 'direct-and-mention' | 'mention' | 'all'
export type SessionScope = 'channel' | 'user' | 'channel-user'

export interface ChannelRule {
  platform: string
  channelId: string
  isDirect?: boolean
}

export interface Config {
  provider: string
  model: string
  apiKey?: string
  baseURL?: string
  maxTokens: number
  systemPrompt: string
  trigger: TriggerMode
  sessionScope: SessionScope
  includeSenderInGroups: boolean
  allowedChannels: ChannelRule[]
  maxInputChars: number
  turnTimeoutMs: number
  maxPendingTurns: number
  eagerStart: boolean
  workspacePath: string
  runtimeCommand: string
  runtimeArgs: string[]
  runtimeCwd: string
  emptyReply: string
  busyReply: string
  inputTooLongReply: string
  errorReply: string
}

const triggerSchema = Schema.union([
  Schema.const('direct-and-mention').description('私聊全部响应，群聊仅在被点名时响应'),
  Schema.const('mention').description('私聊和群聊都仅在被点名时响应'),
  Schema.const('all').description('响应所有收到的文本消息'),
]) as SchemaType<TriggerMode>

const sessionScopeSchema = Schema.union([
  Schema.const('channel').description('群聊共享上下文，私聊按频道隔离'),
  Schema.const('user').description('同一用户跨频道共享上下文'),
  Schema.const('channel-user').description('每位用户在每个频道独立上下文'),
]) as SchemaType<SessionScope>

export const Config: SchemaType<Config> = Schema.intersect([
  Schema.object({
    provider: Schema.string().default('deepseek-official').description('Harness Provider 路由'),
    model: Schema.string().default('deepseek-v4-flash').description('Harness 模型 ID'),
    apiKey: Schema.string().role('secret').description('DeepSeek API Key；留空时继承 DEEPSEEK_API_KEY'),
    baseURL: Schema.string().description('DeepSeek API Base URL；留空时继承 DEEPSEEK_BASE_URL'),
    maxTokens: Schema.number().min(1).max(Number.MAX_SAFE_INTEGER).default(8192).description('单次模型输出 Token 上限'),
    systemPrompt: Schema.string()
      .role('textarea')
      .default('你是一个由 DeepSeek Harness 驱动的 Koishi 聊天助手。请直接、准确且友善地回答。')
      .description('内置 Runtime 的系统提示词'),
  }).description('模型'),
  Schema.object({
    trigger: triggerSchema.default('direct-and-mention').description('消息触发方式'),
    sessionScope: sessionScopeSchema.default('channel').description('Harness 会话隔离范围'),
    includeSenderInGroups: Schema.boolean().default(true).description('群聊提示中附带发送者显示名'),
    allowedChannels: Schema.array(
      Schema.object({
        platform: Schema.string().required().description('平台名称；* 匹配任意平台'),
        channelId: Schema.string().required().description('频道 ID；* 匹配任意频道'),
        isDirect: Schema.boolean().description('是否仅匹配私聊；留空表示不限制'),
      }),
    )
      .role('table')
      .default([])
      .description('允许的频道；空数组表示不额外限制'),
    maxInputChars: Schema.number().min(1).default(12_000).description('单条输入字符上限'),
  }).description('消息路由'),
  Schema.object({
    turnTimeoutMs: Schema.number().min(1000).role('ms').default(180_000).description('整轮超时；超时会重建 Runtime'),
    maxPendingTurns: Schema.number().min(1).default(16).description('活跃轮次和排队轮次总上限'),
    eagerStart: Schema.boolean().default(true).description('Koishi ready 时启动并验证 Runtime'),
    workspacePath: Schema.path({ filters: ['directory'] }).default('.').description('记录到 Harness Session 的工作目录'),
  }).description('运行策略'),
  Schema.object({
    runtimeCommand: Schema.string().default('').description('自定义 Runtime 命令；留空使用内置 Runtime'),
    runtimeArgs: Schema.array(Schema.string()).default([]).description('自定义 Runtime 参数'),
    runtimeCwd: Schema.path({ filters: ['directory'] }).default('.').description('Runtime 子进程工作目录'),
  }).description('Runtime'),
  Schema.object({
    emptyReply: Schema.string().default('Harness 没有返回可发送的文本。').description('模型无文本输出时的回复'),
    busyReply: Schema.string().default('Harness 当前排队已满，请稍后再试。').description('队列已满时的回复'),
    inputTooLongReply: Schema.string().default('消息过长，当前最多接受 {limit} 个字符。').description('输入超过限制时的回复'),
    errorReply: Schema.string().default('Harness 暂时不可用，请稍后再试。').description('运行失败时的回复'),
  }).description('反馈文本'),
]) as SchemaType<Config>

const DEFAULTS: Config = {
  provider: 'deepseek-official',
  model: 'deepseek-v4-flash',
  maxTokens: 8192,
  systemPrompt: '你是一个由 DeepSeek Harness 驱动的 Koishi 聊天助手。请直接、准确且友善地回答。',
  trigger: 'direct-and-mention',
  sessionScope: 'channel',
  includeSenderInGroups: true,
  allowedChannels: [],
  maxInputChars: 12_000,
  turnTimeoutMs: 180_000,
  maxPendingTurns: 16,
  eagerStart: true,
  workspacePath: '.',
  runtimeCommand: '',
  runtimeArgs: [],
  runtimeCwd: '.',
  emptyReply: 'Harness 没有返回可发送的文本。',
  busyReply: 'Harness 当前排队已满，请稍后再试。',
  inputTooLongReply: '消息过长，当前最多接受 {limit} 个字符。',
  errorReply: 'Harness 暂时不可用，请稍后再试。',
}

/** Apply defaults even when the service is constructed outside Koishi's Schema loader. */
export function resolveConfig(input: Partial<Config> | undefined): Config {
  const config = input ?? {}
  return {
    ...DEFAULTS,
    ...config,
    provider: nonEmpty(config.provider, DEFAULTS.provider),
    model: nonEmpty(config.model, DEFAULTS.model),
    maxTokens: positiveInteger(config.maxTokens, DEFAULTS.maxTokens),
    maxInputChars: positiveInteger(config.maxInputChars, DEFAULTS.maxInputChars),
    turnTimeoutMs: positiveInteger(config.turnTimeoutMs, DEFAULTS.turnTimeoutMs),
    maxPendingTurns: positiveInteger(config.maxPendingTurns, DEFAULTS.maxPendingTurns),
    allowedChannels: (config.allowedChannels ?? DEFAULTS.allowedChannels).map(rule => ({ ...rule })),
    runtimeArgs: [...(config.runtimeArgs ?? DEFAULTS.runtimeArgs)],
  }
}

function nonEmpty(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value as number : fallback
}
