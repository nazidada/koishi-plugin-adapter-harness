import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { Context } = require('koishi')
const { default: HarnessAdapterService } = await import('../dist/index.mjs')

const ctx = new Context()

try {
  ctx.plugin(HarnessAdapterService, { eagerStart: false })
  await ctx.start()

  if (!ctx.harnessAdapter) {
    throw new Error('harnessAdapter service was not exposed')
  }
  if (!ctx.$commander.resolve('harness.reset')) {
    throw new Error('harness.reset command was not registered')
  }

  process.stdout.write('Koishi plugin lifecycle passed.\n')
} finally {
  await ctx.stop()
}
