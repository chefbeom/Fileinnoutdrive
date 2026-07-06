import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/views/workspace/workspaceReadOnlyViewModel.js', import.meta.url), 'utf8')
const component = readFileSync(new URL('../src/views/workspace/WorkSpaceReadOnly.vue', import.meta.url), 'utf8')

assert.match(source, /export const escapeReadOnlyHtml = /, 'escapeHtml helper must exist')
assert.match(source, /export function safeReadOnlyUrl/, 'safeUrl helper must exist')
assert.match(component, /renderReadOnlyContent\(rawContent\.value\)/, 'read-only component must render through sanitized view model output')
assert.doesNotMatch(source, /return\s+raw\b/, 'raw content must not be rendered as HTML')
assert.doesNotMatch(source, /startsWith\(['"]<['"]\)/, 'raw HTML passthrough must stay disabled')
assert.match(source, /escapeReadOnlyHtml\(data\.text\)/, 'text blocks must be escaped')
assert.match(source, /escapeReadOnlyHtml\(item\.text\)/, 'checklist items must be escaped')
assert.match(source, /safeReadOnlyUrl\(data\.file\?\.url \|\| data\.url\)/, 'image URLs must be protocol-checked')
assert.match(source, /escapeReadOnlyHtml\(raw\)/, 'fallback string content must be escaped')

console.log('workspace readonly XSS verification passed')
