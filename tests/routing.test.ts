import type { Session } from 'koishi'
import { describe, expect, it } from 'vitest'

import { resolveConfig } from '../src/config.js'
import {
  ConversationIds,
  conversationKey,
  matchesAllowedChannel,
  prepareIncomingMessage,
} from '../src/routing.js'

function session(overrides: Record<string, unknown> = {}): Session {
  return {
    type: 'message-created',
    platform: 'test',
    selfId: 'bot-1',
    channelId: 'room-1',
    userId: 'user-1',
    isDirect: false,
    content: 'hello',
    stripped: {
      content: 'hello',
      appel: false,
      atSelf: false,
      hasAt: false,
      prefix: null,
    },
    author: { name: 'Alice' },
    event: { user: { id: 'user-1', name: 'Alice' } },
    ...overrides,
  } as unknown as Session
}

describe('message routing', () => {
  it('accepts direct messages and requires an appeal in groups by default', () => {
    const config = resolveConfig(undefined)
    expect(prepareIncomingMessage(session({ isDirect: true }), config)).toEqual({ kind: 'run', prompt: 'hello' })
    expect(prepareIncomingMessage(session(), config)).toEqual({ kind: 'skip' })
    expect(prepareIncomingMessage(session({
      stripped: { content: 'hello', appel: true, atSelf: true, hasAt: true, prefix: null },
    }), config)).toEqual({
      kind: 'run',
      prompt: '[Koishi 群聊消息，发送者：Alice]\nhello',
    })
  })

  it('supports all and mention-only trigger modes', () => {
    const all = resolveConfig({ trigger: 'all', includeSenderInGroups: false })
    expect(prepareIncomingMessage(session(), all)).toEqual({ kind: 'run', prompt: 'hello' })

    const mention = resolveConfig({ trigger: 'mention' })
    expect(prepareIncomingMessage(session({ isDirect: true }), mention)).toEqual({ kind: 'skip' })
  })

  it('applies allow rules only when rules are configured', () => {
    const current = session()
    expect(matchesAllowedChannel(current, [])).toBe(true)
    expect(matchesAllowedChannel(current, [{ platform: 'test', channelId: 'room-1' }])).toBe(true)
    expect(matchesAllowedChannel(current, [{ platform: '*', channelId: '*', isDirect: true }])).toBe(false)
  })

  it('rejects oversized input with the configured limit', () => {
    const config = resolveConfig({ trigger: 'all', maxInputChars: 4 })
    expect(prepareIncomingMessage(session({
      content: '12345',
      stripped: { content: '12345', appel: false, atSelf: false, hasAt: false, prefix: null },
    }), config)).toEqual({
      kind: 'reject',
      reply: '消息过长，当前最多接受 4 个字符。',
    })
  })

  it('ignores non-message events, self messages, and empty text', () => {
    const config = resolveConfig({ trigger: 'all' })
    expect(prepareIncomingMessage(session({ type: 'reaction-added' }), config)).toEqual({ kind: 'skip' })
    expect(prepareIncomingMessage(session({ userId: 'bot-1' }), config)).toEqual({ kind: 'skip' })
    expect(prepareIncomingMessage(session({
      content: '  ',
      stripped: { content: '  ', appel: false, atSelf: false, hasAt: false, prefix: null },
    }), config)).toEqual({ kind: 'skip' })
  })
})

describe('conversation identity', () => {
  it('builds keys according to the selected scope', () => {
    const current = session()
    expect(conversationKey(current, 'channel')).toContain('\u0000channel\u0000room-1')
    expect(conversationKey(current, 'user')).toContain('\u0000user\u0000user-1')
    expect(conversationKey(current, 'channel-user')).toContain('\u0000channel-user\u0000room-1\u0000user-1')
  })

  it('derives stable opaque ids and rotates them on reset', () => {
    const ids = new ConversationIds('channel')
    const current = session()
    const first = ids.get(current)
    expect(first).toMatch(/^koishi-[a-f0-9]{40}$/)
    expect(ids.get(current)).toBe(first)
    const next = ids.reset(current)
    expect(next).not.toBe(first)
    expect(ids.get(current)).toBe(next)
    expect(first).not.toContain('room-1')
  })

  it('isolates users under channel-user scope', () => {
    const ids = new ConversationIds('channel-user')
    expect(ids.get(session({ userId: 'user-1' }))).not.toBe(ids.get(session({ userId: 'user-2' })))
  })
})
