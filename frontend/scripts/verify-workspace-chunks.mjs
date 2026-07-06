import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const assetsDir = join(process.cwd(), 'dist', 'assets')

const fail = (message) => {
  console.error(message)
  process.exit(1)
}

if (!existsSync(assetsDir)) {
  fail('dist/assets does not exist. Run npm run build before workspace chunk verification.')
}

const files = readdirSync(assetsDir)
const jsFiles = files.filter((file) => file.endsWith('.js'))

const findChunk = (prefix) => {
  const matches = jsFiles.filter((file) => file.startsWith(prefix))
  if (matches.length !== 1) {
    fail(`expected exactly one ${prefix}*.js chunk, found ${matches.length}`)
  }
  return matches[0]
}

const assertMaxSize = (file, maxKiB) => {
  const sizeBytes = statSync(join(assetsDir, file)).size
  const sizeKiB = sizeBytes / 1024
  if (sizeKiB > maxKiB) {
    fail(`${file} is ${sizeKiB.toFixed(2)} KiB, over ${maxKiB} KiB budget`)
  }
  return sizeKiB
}

const budgets = [
  ['WorkSpace-', 120],
  ['workspace-composables-', 330],
  ['workspace-components-', 380],
  ['workspace-services-', 120],
]

const results = budgets.map(([prefix, maxKiB]) => {
  const chunk = findChunk(prefix)
  return [chunk, assertMaxSize(chunk, maxKiB)]
})

for (const [chunk, sizeKiB] of results) {
  console.log(`${chunk}: ${sizeKiB.toFixed(2)} KiB`)
}

console.log('Workspace chunk verification passed.')
