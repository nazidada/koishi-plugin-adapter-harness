import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const runtimePath = resolve(projectRoot, 'dist/runtime.js')

const harness = new DeepSeekHarness({
  launch: {
    command: process.execPath,
    args: [runtimePath],
    cwd: projectRoot,
    requestTimeoutMs: 15_000,
  },
  cwd: projectRoot,
  provider: 'deepseek-official',
  model: 'deepseek-v4-flash',
  maxTokens: 128,
})

try {
  await harness.start()
  process.stdout.write('Harness runtime handshake passed.\n')
} finally {
  await harness.close()
}
