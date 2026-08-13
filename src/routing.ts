import { createHash } from 'node:crypto'

import type { Session } from 'koishi'

import type { ChannelRule, Config, SessionScope } from './config.js'

export type PreparedMessage =
  | { kind: 'skip' }
  | { kind: 'reject'; reply: string }
  | { kind: 'run'; prompt: string }

export function prepareIncomingMessage(session: Session, config: Config): PreparedMessage {
  if (session.type !== 'message-created') return { kind: 'skip' }
  if (session.userId && session.userId === session.selfId) return { kind: 'skip' }
  if (!matchesAllowedChannel(session, config.allowedChannels)) return { kind: 'skip' }

  const stripped = strippedMessage(session)
  const appealed = stripped?.appel === true || stripped?.atSelf === true
  if (config.trigger === 'mention' && !appealed) return { kind: 'skip' }
  if (config.trigger === 'direct-and-mention' && !session.isDirect && !appealed) return { kind: 'skip' }

  const content = (stripped?.content ?? session.content ?? '').trim()
  if (!content) return { kind: 'skip' }
  if (content.length > config.maxInputChars) {
    return {
      kind: 'reject',
      reply: config.inputTooLongReply.replaceAll('{limit}', String(config.maxInputChars)),
    }
  }

  if (session.isDirect || !config.includeSenderInGroups) return { kind: 'run', prompt: content }
  const sender = senderName(session)
  return { kind: 'run', prompt: `[Koishi 群聊消息，发送者：${sender}]\n${content}` }
}

export function matchesAllowedChannel(session: Session, rules: readonly ChannelRule[]): boolean {
  if (rules.length === 0) return true
  return rules.some(rule =>
    (rule.platform === '*' || rule.platform === session.platform)
    && (rule.channelId === '*' || rule.channelId === session.channelId)
    && (rule.isDirect === undefined || rule.isDirect === session.isDirect),
  )
}

export function conversationKey(session: Session, scope: SessionScope): string {
  const platform = session.platform || 'unknown-platform'
  const selfId = session.selfId || 'unknown-bot'
  const channelId = session.channelId || 'unknown-channel'
  const userId = session.userId || 'unknown-user'
  const root = `${platform}\u0000${selfId}`
  switch (scope) {
    case 'channel':
      return `${root}\u0000channel\u0000${channelId}`
    case 'user':
      return `${root}\u0000user\u0000${userId}`
    case 'channel-user':
      return `${root}\u0000channel-user\u0000${channelId}\u0000${userId}`
  }
}

export class ConversationIds {
  private readonly generations = new Map<string, number>()

  public constructor(private readonly scope: SessionScope) {}

  public get(session: Session): string {
    const key = conversationKey(session, this.scope)
    return sessionId(key, this.generations.get(key) ?? 0)
  }

  public reset(session: Session): string {
    const key = conversationKey(session, this.scope)
    const generation = (this.generations.get(key) ?? 0) + 1
    this.generations.set(key, generation)
    return sessionId(key, generation)
  }
}

function sessionId(key: string, generation: number): string {
  const digest = createHash('sha256')
    .update('koishi-plugin-adapter-harness\u0000')
    .update(key)
    .update('\u0000')
    .update(String(generation))
    .digest('hex')
  return `koishi-${digest.slice(0, 40)}`
}

function strippedMessage(session: Session): Session['stripped'] | undefined {
  try {
    return session.stripped
  } catch {
    return undefined
  }
}

function senderName(session: Session): string {
  const candidate = session.author?.nick
    || session.author?.name
    || session.event.user?.name
    || session.userId
    || 'unknown'
  return candidate.replaceAll(/\s+/g, ' ').trim().slice(0, 80) || 'unknown'
}
