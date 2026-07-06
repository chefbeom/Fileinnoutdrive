#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ignoredDirs = new Set([
  '.git',
  '.gradle',
  '.idea',
  '.osmu-run',
  'build',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results',
])

const requiredMarkdownDocs = [
  'README.md',
  'frontend/README.md',
  'desktop-client/README.md',
  'devops/DEPLOYMENT_SOURCE.md',
  'docs/ARCHITECTURE.md',
  'docs/DB_MIGRATION_RUNBOOK.md',
  'docs/DESKTOP_SYNC_DESIGN.md',
  'docs/PROJECT_AUDIT.md',
  'docs/RUNBOOK.md',
  'docs/USER_FLOWS.md',
]

const requiredContentChecks = [
  {
    path: 'README.md',
    phrases: [
      'FileInNOut Drive는 웹 기반 파일 드라이브',
      '문서 인코딩 검증',
      '운영 배포에서 `latest` tag를 사용하지 않습니다.',
      '운영 CORS는 `APP_CORS_ALLOWED_ORIGIN_PATTERNS`에 명시한 실제 origin만 허용합니다.',
    ],
  },
  {
    path: 'frontend/README.md',
    phrases: [
      'FileInNOut Frontend는 FileInNOut Drive의 Vue 3/Vite 기반 웹 클라이언트입니다.',
      'npm.cmd run test:unit',
      '워크스페이스 개발 규칙',
      'frontend image tag는 `latest`가 아니라 명시 tag 또는 digest를 사용합니다.',
    ],
  },
  {
    path: 'desktop-client/README.md',
    phrases: [
      '## 빠른 확인',
      'Windows 알림 영역',
      '프로그램 설치/제거',
      'verify_windows_package.ps1',
    ],
  },
]

const errors = []

function exists(path) {
  return existsSync(join(repoRoot, path))
}

function walk(dir) {
  const absolute = join(repoRoot, dir)
  return readdirSync(absolute).flatMap((entry) => {
    if (ignoredDirs.has(entry)) return []
    const current = join(absolute, entry)
    const rel = relative(repoRoot, current).replaceAll('\\', '/')
    const stat = statSync(current)
    if (stat.isDirectory()) return walk(rel)
    return rel.endsWith('.md') ? [rel] : []
  })
}

function preview(line) {
  return line.length > 160 ? `${line.slice(0, 157)}...` : line
}

function hasQuestionMarkNoise(line) {
  const questionCount = (line.match(/\?/g) || []).length
  if (questionCount < 3) return false

  const mixedWithKorean = line.match(/\?[\u3131-\u318e\uac00-\ud7a3]|[\u3131-\u318e\uac00-\ud7a3]\?(?=\S)/gu) || []
  return mixedWithKorean.length >= 2
}

function hasRepeatedQuestionMarkDamage(line) {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (/\?{4,}/u.test(trimmed)) return true

  const runs = trimmed.match(/\?{2,}/gu) || []
  const questionCount = (trimmed.match(/\?/g) || []).length
  return runs.length >= 2 && questionCount >= 6 && /[A-Za-z0-9_\u3131-\u318e\uac00-\ud7a3]/u.test(trimmed)
}

function findLineIssue(content) {
  if (content.charCodeAt(0) === 0xfeff) {
    return { lineNumber: 1, label: 'UTF-8 BOM marker', line: content.split(/\r?\n/)[0] || '' }
  }

  const lines = content.split(/\r?\n/)
  for (const [index, line] of lines.entries()) {
    if (/\uFFFD/u.test(line)) {
      return { lineNumber: index + 1, label: 'replacement character', line }
    }
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(line)) {
      return { lineNumber: index + 1, label: 'unexpected control character', line }
    }
    if (/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/u.test(line)) {
      return { lineNumber: index + 1, label: 'CJK/Hanja character commonly produced by Korean mojibake', line }
    }
    if (/(?:Ã|Â|ì|ë|í|ê|â|ð|œ|€)/u.test(line)) {
      return { lineNumber: index + 1, label: 'latin-1 mojibake byte sequence', line }
    }
    if (hasRepeatedQuestionMarkDamage(line)) {
      return { lineNumber: index + 1, label: 'repeated question-mark replacement noise', line }
    }
    if (hasQuestionMarkNoise(line)) {
      return { lineNumber: index + 1, label: 'question-mark mojibake noise near Korean text', line }
    }
  }

  return null
}

for (const path of requiredMarkdownDocs) {
  if (!exists(path)) {
    errors.push(`${path} is required documentation but is missing`)
  }
}

for (const check of requiredContentChecks) {
  if (!exists(check.path)) continue
  const content = readFileSync(join(repoRoot, check.path), 'utf8')
  for (const phrase of check.phrases) {
    if (!content.includes(phrase)) {
      errors.push(`${check.path}:1 is missing required readable phrase: ${JSON.stringify(phrase)}`)
    }
  }
}

const scannedDocs = new Set([...walk('.'), ...requiredMarkdownDocs].filter((path) => exists(path)))
for (const path of [...scannedDocs].sort()) {
  const content = readFileSync(join(repoRoot, path), 'utf8')
  if (path.endsWith('README.md') && content.trim().length < 200) {
    errors.push(`${path}:1 README is unexpectedly short`)
    continue
  }

  const issue = findLineIssue(content)
  if (issue) {
    errors.push(`${path}:${issue.lineNumber} contains ${issue.label}: ${JSON.stringify(preview(issue.line))}`)
  }
}

if (errors.length > 0) {
  console.error('Document encoding verification failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(`Document encoding verification passed (${scannedDocs.size} markdown files).`)