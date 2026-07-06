#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = join(frontendRoot, '..')
const publicRoot = join(frontendRoot, 'public')
const errors = []
const publicFolderBudgets = [
  {
    rel: 'public/legup/ladder',
    maxFiles: 5,
    maxBytes: 100_000,
  },
]
const nextGeneratedFileNames = new Set([
  '_buildManifest.js',
  '_ssgManifest.js',
  'BUILD_ID',
  'build-manifest.json',
  'prerender-manifest.json',
  'react-loadable-manifest.json',
  'required-server-files.json',
  'routes-manifest.json',
])
const nextContentMarkers = [
  '/_next/',
  '_next/static',
  '__BUILD_MANIFEST',
  '__NEXT_DATA__',
]

function normalizedGitIgnoreLines() {
  return readFileSync(join(repoRoot, '.gitignore'), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
}

function verifyGeneratedDownloadPolicy() {
  const lines = normalizedGitIgnoreLines()
  const ignoresPublicDownloads = lines.some((line) => {
    const normalized = line.replaceAll('\\', '/').replace(/^\/+/, '').replace(/\/+$/, '')
    return normalized === 'frontend/public/downloads'
  })

  if (!ignoresPublicDownloads) {
    errors.push('frontend/public/downloads must be ignored because desktop installer files are generated release artifacts.')
  }
}

function folderStats(dir) {
  return readdirSync(dir).reduce(
    (stats, entry) => {
      const path = join(dir, entry)
      const stat = statSync(path)
      if (stat.isDirectory()) {
        const nested = folderStats(path)
        return {
          files: stats.files + nested.files,
          bytes: stats.bytes + nested.bytes,
        }
      }
      return {
        files: stats.files + 1,
        bytes: stats.bytes + stat.size,
      }
    },
    { files: 0, bytes: 0 },
  )
}

function verifyPublicFolderBudgets() {
  for (const budget of publicFolderBudgets) {
    const path = join(frontendRoot, budget.rel)
    if (!existsSync(path)) continue

    const stats = folderStats(path)
    if (stats.files > budget.maxFiles || stats.bytes > budget.maxBytes) {
      errors.push(
        `${budget.rel} is too large for a checked-in static asset folder (${stats.files} files, ${stats.bytes} bytes). Keep generated exports out of public/.`,
      )
    }
  }
}

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    const rel = relative(frontendRoot, path).replaceAll('\\', '/')
    const stat = statSync(path)
    if (stat.isDirectory()) {
      if (entry === '_next') {
        errors.push(`${rel} is a checked-in Next.js build output. Move generated exports out of public/.`)
      }
      return walk(path)
    }
    if (nextGeneratedFileNames.has(entry)) {
      errors.push(`${rel} is a Next.js generated manifest/runtime file. Keep generated exports out of public/.`)
    }
    return rel
  })
}

verifyGeneratedDownloadPolicy()
verifyPublicFolderBudgets()

for (const rel of walk(publicRoot)) {
  if (!/\.(html|js|css|json)$/i.test(rel)) continue
  const content = readFileSync(join(frontendRoot, rel), 'utf8')
  const marker = nextContentMarkers.find((candidate) => content.includes(candidate))
  if (marker) {
    errors.push(`${rel} references Next.js generated assets via ${marker}.`)
  }
}

if (errors.length > 0) {
  console.error('Public asset verification failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log('Public asset verification passed.')
