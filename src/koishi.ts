import { createRequire } from 'node:module'

import type * as Koishi from 'koishi'

// Koishi's public ESM entry also loads its application config loader. A plugin
// only needs the runtime exports, and loading the CommonJS entry keeps the
// package usable from both ESM and CommonJS hosts.
const koishi = createRequire(import.meta.url)('koishi') as typeof Koishi

export const { Schema, Service } = koishi
