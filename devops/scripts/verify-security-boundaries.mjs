#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const errors = []

function read(path) {
  return readFileSync(join(repoRoot, path), 'utf8')
}

function fail(message) {
  errors.push(message)
}

function requireContains(path, content, fragment, label = fragment) {
  if (!content.includes(fragment)) {
    fail(`${path} must contain ${label}`)
  }
}

function requireNotContains(path, content, fragment, label = fragment) {
  if (content.includes(fragment)) {
    fail(`${path} must not contain ${label}`)
  }
}

const appConfigPaths = [
  'backend/src/main/resources/application.yml',
  'backend/src/main/resources/application-prod.yml',
]
const forbiddenCorsDefaults = [
  [/localhost:\*/i, 'localhost wildcard CORS default'],
  [/127\.0\.0\.1:\*/i, 'loopback wildcard CORS default'],
  [/192\.168\.(?:\*|\d+\.\*)/i, '192.168 private wildcard CORS default'],
  [/\b10\.(?:\*|\d+\.\*)/i, '10.x private wildcard CORS default'],
  [/172\.(?:1[6-9]|2\d|3[0-1])\.(?:\*|\d+\.\*)/i, '172.16-31 private wildcard CORS default'],
  [/allowed-origin-patterns:\s*[^\n]*\*/i, 'wildcard value in allowed-origin-patterns default'],
]

for (const path of appConfigPaths) {
  const content = read(path)
  requireContains(path, content, 'allowed-origin-patterns: ${APP_CORS_ALLOWED_ORIGIN_PATTERNS:}')
  requireContains(path, content, 'allow-development-origin-patterns: ${APP_CORS_ALLOW_DEVELOPMENT_ORIGIN_PATTERNS:false}')

  requireContains(path, content, 'public-openapi: ${APP_DOCS_PUBLIC_OPENAPI:false}')
  if (path.endsWith('application.yml')) {
    requireContains(path, content, 'include: health', 'actuator exposure limited to health')
  }
  requireNotContains(path, content, 'include: *', 'wildcard actuator endpoint exposure')
  requireNotContains(path, content, 'include: "*"', 'quoted wildcard actuator endpoint exposure')
  requireNotContains(path, content, 'APP_HEALTH_PUBLIC_TEST_VERSION')
  requireNotContains(path, content, 'public-test-version')
  requireNotContains(path, content, 'APP_HEALTH_EXPOSE_VERSION')
  requireNotContains(path, content, 'expose-version:')
  for (const [pattern, label] of forbiddenCorsDefaults) {
    if (pattern.test(content)) {
      fail(`${path} must not contain ${label}`)
    }
  }
}

const securityConfigPath = 'backend/src/main/java/com/example/WaffleBear/config/SecurityConfig.java'
const securityConfig = read(securityConfigPath)
for (const fragment of [
  '@Value("${app.cors.allowed-origin-patterns:}")',
  '@Value("${app.cors.allow-development-origin-patterns:false}")',

  '@Value("${app.docs.public-openapi:false}")',
  'configuration.setAllowCredentials(true)',
  'configuration.setAllowedOriginPatterns(resolveAllowedOriginPatterns())',
  'validateAllowedOriginPatterns(patterns)',
  'CORS wildcard origin patterns require app.cors.allow-development-origin-patterns=true',
]) {
  requireContains(securityConfigPath, securityConfig, fragment)
}
for (const [pattern, label] of forbiddenCorsDefaults) {
  if (pattern.test(securityConfig)) {
    fail(`${securityConfigPath} must not contain ${label}`)
  }
}
const publicOpenApiIndex = securityConfig.indexOf('if (publicOpenApi)')
const openApiMatcherIndex = securityConfig.indexOf('auth.requestMatchers("/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs/**").permitAll();')

const anyRequestIndex = securityConfig.indexOf('.anyRequest().authenticated()')
if (!(publicOpenApiIndex >= 0 && publicOpenApiIndex < openApiMatcherIndex && openApiMatcherIndex < anyRequestIndex)) {
  fail(`${securityConfigPath} must gate OpenAPI public access behind app.docs.public-openapi`)
}
requireNotContains(securityConfigPath, securityConfig, 'publicTestVersion')
requireNotContains(securityConfigPath, securityConfig, 'app.health.public-test-version')
requireNotContains(securityConfigPath, securityConfig, 'auth.requestMatchers("/test/version").permitAll();')
requireNotContains(securityConfigPath, securityConfig, '"/test/version"')

const testControllerPath = 'backend/src/main/java/com/example/WaffleBear/test/TestController.java'
if (existsSync(join(repoRoot, testControllerPath))) {
  fail(`${testControllerPath} must be removed. Use /actuator/health for public health checks.`)
}

const corsTestPath = 'backend/src/test/java/com/example/WaffleBear/config/SecurityConfigCorsTest.java'
const corsTest = read(corsTestPath)
for (const fragment of [
  'rejectsDevelopmentWildcardPatternsUnlessExplicitlyEnabled',
  'rejectsNestedPrivateWildcardPatternsInProductionMode',
  'rejectsGlobalWildcardPatternsWithCredentialsInProductionMode',
  'allowsExplicitOriginAllowlistWithoutDevelopmentWildcardFlag',
  'doesNotFallbackToFrontendUrlWhenPatternListIsEmpty',
  'productionProfileKeepsDevelopmentCorsAndOptionalPublicDocsDisabledByDefault',
]) {
  requireContains(corsTestPath, corsTest, fragment)
}

const corsPreflightTestPath = 'backend/src/test/java/com/example/WaffleBear/config/SecurityCorsPreflightTest.java'
const corsPreflightTest = read(corsPreflightTestPath)
requireContains(corsPreflightTestPath, corsPreflightTest, 'rejectsUnconfiguredPrivateNetworkOriginPreflight')
requireContains(corsPreflightTestPath, corsPreflightTest, 'http://192.168.35.151:5173')

const emptyCorsPreflightTestPath = 'backend/src/test/java/com/example/WaffleBear/config/SecurityCorsEmptyAllowlistPreflightTest.java'
const emptyCorsPreflightTest = read(emptyCorsPreflightTestPath)
requireContains(emptyCorsPreflightTestPath, emptyCorsPreflightTest, 'doesNotEmitCorsAllowOriginWhenAllowlistIsEmptyInsteadOfFallingBackToFrontendUrl')
requireContains(emptyCorsPreflightTestPath, emptyCorsPreflightTest, 'app.cors.allowed-origin-patterns=')

const boundaryTestPath = 'backend/src/test/java/com/example/WaffleBear/config/SecurityBoundaryTest.java'
const boundaryTest = read(boundaryTestPath)
requireContains(boundaryTestPath, boundaryTest, 'administratorEndpointsRejectAuthenticatedNonAdminUsers')
requireContains(boundaryTestPath, boundaryTest, 'actuatorHealthEndpointRemainsPublic')
requireContains(boundaryTestPath, boundaryTest, 'actuatorNonHealthEndpointsAreNotPubliclyAvailable')
requireContains(boundaryTestPath, boundaryTest, 'actuatorNonHealthEndpointsAreNotMappedEvenForAuthenticatedUsers')
requireContains(boundaryTestPath, boundaryTest, 'testVersionEndpointRejectsAnonymousRequestsByDefault')
requireContains(boundaryTestPath, boundaryTest, 'testVersionEndpointIsNotMappedForAuthenticatedRequests')
requireContains(boundaryTestPath, boundaryTest, 'openApiDocsRejectAnonymousRequestsByDefault')


if (errors.length > 0) {
  console.error('Security boundary verification failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log('Security boundary verification passed.')