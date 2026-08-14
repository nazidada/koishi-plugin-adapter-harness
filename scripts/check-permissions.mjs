import { accessSync, constants, existsSync, lstatSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const isPosix = process.platform !== 'win32' && typeof process.getuid === 'function'
const currentUid = isPosix ? process.getuid() : undefined
const failures = []
const ownershipChecked = new Set()

function label(path) {
  const projectRelative = relative(projectRoot, path)
  return projectRelative || '.'
}

function octal(mode) {
  return (mode & 0o777).toString(8).padStart(3, '0')
}

function recordFailure(message) {
  failures.push(message)
}

function checkOwner(path) {
  if (!isPosix || ownershipChecked.has(path)) return
  ownershipChecked.add(path)

  let stat
  try {
    stat = lstatSync(path)
  } catch (error) {
    recordFailure(`${label(path)} could not be inspected: ${error.message}`)
    return
  }

  if (stat.uid !== currentUid) {
    recordFailure(`${label(path)} is owned by uid ${stat.uid}; expected uid ${currentUid}`)
  }
}

function checkWritableDirectory(path) {
  if (!isPosix || !existsSync(path)) return

  checkOwner(path)
  const stat = lstatSync(path)
  const mode = stat.mode & 0o777

  if (!stat.isDirectory()) {
    recordFailure(`${label(path)} must be a directory`)
    return
  }

  if ((mode & 0o022) !== 0) {
    recordFailure(`${label(path)} has unsafe directory mode ${octal(mode)}; group/other write access is not allowed`)
  }

  try {
    accessSync(path, constants.W_OK)
  } catch {
    recordFailure(`${label(path)} is not writable by the current user`)
  }
}

function inspectOwnershipTree(path) {
  if (!isPosix || !existsSync(path)) return

  checkOwner(path)
  const stat = lstatSync(path)
  if (!stat.isDirectory() || stat.isSymbolicLink()) return

  for (const entry of readdirSync(path)) {
    inspectOwnershipTree(resolve(path, entry))
  }
}

function inspectBuiltTree(path) {
  if (!isPosix || !existsSync(path)) return

  checkOwner(path)
  const stat = lstatSync(path)
  const mode = stat.mode & 0o777

  if (stat.isSymbolicLink()) {
    recordFailure(`${label(path)} must not be a symbolic link`)
    return
  }

  if (stat.isDirectory()) {
    if ((mode & 0o022) !== 0) {
      recordFailure(`${label(path)} has unsafe directory mode ${octal(mode)}`)
    }
    for (const entry of readdirSync(path)) {
      inspectBuiltTree(resolve(path, entry))
    }
    return
  }

  if (!stat.isFile()) {
    recordFailure(`${label(path)} must be a regular file`)
    return
  }

  const expectedMode = label(path) === 'dist/runtime.js' ? 0o755 : 0o644
  if (mode !== expectedMode) {
    recordFailure(`${label(path)} has mode ${octal(mode)}; expected ${octal(expectedMode)}`)
  }
}

const gitFiles = spawnSync('git', ['ls-files', '-s', '-z'], {
  cwd: projectRoot,
  encoding: 'utf8',
})

if (gitFiles.status !== 0) {
  const detail = gitFiles.stderr.trim() || `git exited with status ${gitFiles.status}`
  recordFailure(`tracked files could not be inspected: ${detail}`)
} else {
  const trackedDirectories = new Set([projectRoot])
  const records = gitFiles.stdout.split('\0').filter(Boolean)

  for (const record of records) {
    const separator = record.indexOf('\t')
    if (separator === -1) {
      recordFailure(`unexpected git ls-files record: ${record}`)
      continue
    }

    const mode = record.slice(0, separator).split(' ')[0]
    const trackedPath = record.slice(separator + 1)
    const absolutePath = resolve(projectRoot, trackedPath)

    if (mode !== '100644') {
      recordFailure(`${trackedPath} has Git mode ${mode}; expected 100644`)
    }

    if (!existsSync(absolutePath)) {
      recordFailure(`${trackedPath} is tracked but missing from the working tree`)
      continue
    }

    if (isPosix) {
      checkOwner(absolutePath)
      const stat = lstatSync(absolutePath)
      const fileMode = stat.mode & 0o777

      if (!stat.isFile()) {
        recordFailure(`${trackedPath} must be a regular file`)
      } else if (fileMode !== 0o644) {
        recordFailure(`${trackedPath} has working-tree mode ${octal(fileMode)}; expected 644`)
      }

      let parent = dirname(absolutePath)
      while (parent.startsWith(projectRoot)) {
        trackedDirectories.add(parent)
        if (parent === projectRoot) break
        parent = dirname(parent)
      }
    }
  }

  for (const directory of trackedDirectories) {
    checkWritableDirectory(directory)
  }

  for (const directory of ['.git', 'node_modules']) {
    inspectOwnershipTree(resolve(projectRoot, directory))
  }

  inspectBuiltTree(resolve(projectRoot, 'dist'))

  if (failures.length === 0) {
    const posixSummary = isPosix
      ? `; ownership matches uid ${currentUid} and POSIX modes are safe`
      : '; POSIX ownership checks skipped on Windows'
    console.log(`Permission check passed: ${records.length} tracked files${posixSummary}.`)
  }
}

if (failures.length > 0) {
  const shown = failures.slice(0, 30)
  console.error('Permission check failed:')
  for (const failure of shown) console.error(`- ${failure}`)
  if (failures.length > shown.length) {
    console.error(`- …and ${failures.length - shown.length} more problem(s)`)
  }
  console.error('Repair only the confirmed paths; never run npm with sudo or recursively chown your entire home directory.')
  process.exitCode = 1
}
