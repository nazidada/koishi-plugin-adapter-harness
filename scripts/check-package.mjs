import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8'))
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const failures = []
const npmExecutable = process.env.npm_execpath
  ? { command: process.execPath, args: [process.env.npm_execpath] }
  : { command: npmCommand, args: [] }

const packed = spawnSync(npmExecutable.command, [...npmExecutable.args, 'pack', '--dry-run', '--ignore-scripts', '--json'], {
  cwd: projectRoot,
  encoding: 'utf8',
  env: {
    ...process.env,
    npm_config_loglevel: 'error',
  },
})

if (packed.status !== 0) {
  const detail = packed.stderr.trim() || `npm exited with status ${packed.status}`
  console.error(`Package permission check failed: ${detail}`)
  process.exit(1)
}

let reports
try {
  reports = JSON.parse(packed.stdout)
} catch (error) {
  console.error(`Package permission check failed: npm returned invalid JSON: ${error.message}`)
  process.exit(1)
}

if (!Array.isArray(reports) || reports.length !== 1) {
  console.error(`Package permission check failed: expected one npm pack report, received ${reports?.length ?? 'invalid output'}`)
  process.exit(1)
}

const [report] = reports
if (report.version !== packageJson.version) {
  failures.push(`package version ${report.version} does not match package.json ${packageJson.version}`)
}

if (!Array.isArray(report.files) || report.files.length === 0) {
  failures.push('npm package contains no files')
} else {
  const paths = new Set(report.files.map((file) => file.path))
  if (!paths.has('dist/runtime.js')) {
    failures.push('dist/runtime.js is missing from the npm package')
  }

  for (const file of report.files) {
    const expectedMode = file.path === 'dist/runtime.js' ? 0o755 : 0o644
    if (file.mode !== expectedMode) {
      failures.push(
        `${file.path} has package mode ${(file.mode ?? 0).toString(8)}; expected ${expectedMode.toString(8)}`,
      )
    }

    if (file.path.startsWith('/') || file.path.split('/').includes('..')) {
      failures.push(`${file.path} is not a safe relative package path`)
    }
  }
}

if (failures.length > 0) {
  console.error('Package permission check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(
  `Package permission check passed: ${report.files.length} files in ${report.filename}; only dist/runtime.js is executable.`,
)
