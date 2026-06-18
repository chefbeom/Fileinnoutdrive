import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/views/workspace/WorkSpaceReadOnly.vue', import.meta.url), 'utf8')

assert.match(source, /const escapeHtml = /, 'escapeHtml helper must exist')
assert.match(source, /const safeUrl = /, 'safeUrl helper must exist')
assert.doesNotMatch(source, /return\s+raw\b/, 'raw content must not be rendered as HTML')
assert.doesNotMatch(source, /startsWith\(['"]<['"]\)/, 'raw HTML passthrough must stay disabled')
assert.match(source, /escapeHtml\(d\.text\)/, 'text blocks must be escaped')
assert.match(source, /escapeHtml\(item\.text\)/, 'checklist items must be escaped')
assert.match(source, /safeUrl\(d\.file\?\.url \|\| d\.url\)/, 'image URLs must be protocol-checked')
assert.match(source, /escapeHtml\(raw\)/, 'fallback string content must be escaped')

console.log('workspace readonly XSS verification passed')
