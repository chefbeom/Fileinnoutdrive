#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const canonicalDeploymentRoot = 'devops/Helm';
const legacyDeploymentRoots = ['backend/helm', 'devops/Kubes', 'frontend/k8s'];
const deploymentRoots = [canonicalDeploymentRoot, ...legacyDeploymentRoots];
const publicAutomationRoots = ['deploy/two-vm', 'backend/ngrinder'];
const legacyReferenceScanRoots = ['backend', 'deploy', 'devops', 'frontend', 'scripts'];
const composeDeploymentFiles = ['backend/docker-compose.yml', 'devops/Docker/docker-compose.yml'];
const composeInfrastructureFiles = [...composeDeploymentFiles, 'deploy/two-vm/docker-compose.vm152.yml'];
const appImages = [
  'chefbeom/fileinnoutdrive-backend',
  'chefbeom/fileinnoutdrive-frontend',
  'chefbeom/fileinnoutdrive-websocket',
];
const forbiddenPublicDefaults = [
  [/fweiuhfge2232n12/i, 'old committed nGrinder login password'],
  [/qwer1234/i, 'example infrastructure password'],
  [/Local(?:Admin|Db|Minio|Shared)Password1!/i, 'static local smoke password'],
  [/ScenarioPassword1!/i, 'static desktop scenario password'],
  [/Blocked(?:Signup|Shared)Password1!/i, 'static negative-test password'],
  [/dummy-(?:google|naver|kakao)-client-(?:id|secret)/i, 'dummy OAuth client setting'],
  [/lumisia\/frontend:latest/i, 'old frontend image'],
];
const errors = [];
const nonAsciiDeploymentContent = /[^\x09\x0A\x0D\x20-\x7E]/;

function read(path) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

function exists(path) {
  try {
    statSync(join(repoRoot, path));
    return true;
  } catch {
    return false;
  }
}

function walk(dir) {
  if (!exists(dir)) return [];
  const absolute = join(repoRoot, dir);
  return readdirSync(absolute).flatMap((entry) => {
    const current = join(absolute, entry);
    const rel = relative(repoRoot, current).replaceAll('\\', '/');
    if (statSync(current).isDirectory()) return walk(rel);
    return rel;
  });
}

function fail(message) {
  errors.push(message);
}

function hashNormalizedText(content) {
  return createHash('sha256').update(content.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

function verifyLegacyDeploymentLock() {
  const lockPath = 'devops/LEGACY_DEPLOYMENT_LOCK.json';
  const legacyFiles = legacyDeploymentRoots.flatMap(walk).sort();
  if (legacyFiles.length === 0) return;
  if (!exists(lockPath)) {
    fail('devops/LEGACY_DEPLOYMENT_LOCK.json must exist while legacy deployment roots remain in the repository');
    return;
  }

  let lock;
  try {
    lock = JSON.parse(read(lockPath));
  } catch (error) {
    fail('devops/LEGACY_DEPLOYMENT_LOCK.json must be valid JSON: ' + error.message);
    return;
  }

  const lockedFiles = Array.isArray(lock.files) ? lock.files : [];
  const lockedByPath = new Map(lockedFiles.map((entry) => [entry.path, entry]));
  for (const path of legacyFiles) {
    const entry = lockedByPath.get(path);
    if (!entry) {
      fail(path + ' is an unreviewed legacy deployment artifact; delete the legacy root or update the quarantine lock intentionally');
      continue;
    }
    const actualHash = hashNormalizedText(read(path));
    if (entry.sha256NormalizedText !== actualHash) {
      fail(path + ' drifted from devops/LEGACY_DEPLOYMENT_LOCK.json; do not edit legacy deployment artifacts outside an explicit migration');
    }
  }

  const actualFiles = new Set(legacyFiles);
  for (const entry of lockedFiles) {
    if (!actualFiles.has(entry.path)) {
      fail(entry.path + ' is listed in devops/LEGACY_DEPLOYMENT_LOCK.json but is missing; remove the whole legacy root or refresh the lock intentionally');
    }
  }
}

function isInside(path, root) {
  return path === root || path.startsWith(`${root}/`);
}

function uniqueSorted(paths) {
  return [...new Set(paths)].sort();
}

function isTextAutomationFile(path) {
  return /(?:^README\.md$|\.md$|\.mjs$|\.js$|\.cjs$|\.groovy$|\.ps1$|\.sh$|\.ya?ml$|\.json$|\.env$|\.example$|Jenkinsfile$)/.test(path);
}

function verifyLegacyRootsAreNotDeploymentInputs() {
  const scanFiles = uniqueSorted([
    ...(exists('README.md') ? ['README.md'] : []),
    ...legacyReferenceScanRoots.flatMap(walk),
  ]).filter((path) =>
    isTextAutomationFile(path) &&
    !legacyDeploymentRoots.some((legacyRoot) => isInside(path, legacyRoot)) &&
    path !== 'devops/scripts/verify-deployment-source.mjs' &&
    path !== 'devops/LEGACY_DEPLOYMENT_LOCK.json',
  );

  for (const path of scanFiles) {
    const content = read(path).replaceAll('\\', '/');
    for (const legacyRoot of legacyDeploymentRoots) {
      const legacyPathInput = `["']?\\.?/?${legacyRoot}["']?`;
      const deployCommandPattern = new RegExp(
        `(?:kubectl\\s+(?:apply|create|replace|delete)\\b[^\\n]*(?:-f|-k|--filename|--kustomize)\\s+${legacyPathInput}|` +
        `kustomize\\s+build\\s+${legacyPathInput}|` +
        `helm\\s+(?:install|upgrade|template|lint)\\b[^\\n]*${legacyPathInput})`,
      );
      if (deployCommandPattern.test(content)) {
        fail(`${path} must not use ${legacyRoot} as a deployment input; use devops/Helm instead`);
      }
    }
  }
}
const helmValues = read('devops/Helm/values.yaml');
for (const image of appImages) {
  if (!helmValues.includes(`repository: ${image}`)) {
    fail(`devops/Helm/values.yaml must use canonical repository ${image}`);
  }
}

const appImageDefaultBlocks = [
  ['backend', /backend:[\s\S]*?image:[\s\S]*?repository: chefbeom\/fileinnoutdrive-backend[\s\S]*?tag: ""[\s\S]*?digest: ""/],
  ['frontend', /frontend:[\s\S]*?image:[\s\S]*?repository: chefbeom\/fileinnoutdrive-frontend[\s\S]*?tag: ""[\s\S]*?digest: ""/],
  ['websocket', /websocket:[\s\S]*?image:[\s\S]*?repository: chefbeom\/fileinnoutdrive-websocket[\s\S]*?tag: ""[\s\S]*?digest: ""/],
];
for (const [component, pattern] of appImageDefaultBlocks) {
  if (!pattern.test(helmValues)) {
    fail(`devops/Helm ${component}.image.tag and ${component}.image.digest must default to empty explicit override slots`);
  }
}
if (!helmValues.includes('APP_VERSION: \'{{ include "wafflebear.requiredImageReference"')) {
  fail('devops/Helm backend APP_VERSION must use the same required image reference helper as the deployment image');
}

const productionValuesPath = 'devops/Helm/values.production.example.yaml';
if (!exists(productionValuesPath)) {
  fail('devops/Helm must include values.production.example.yaml for explicit production tag or digest deploys');
} else {
  const productionValues = read(productionValuesPath);
  for (const component of ['backend', 'frontend', 'websocket']) {
    const productionBlock = new RegExp(`${component}:[\\s\\S]*?image:[\\s\\S]*?tag: "vREPLACE_WITH_BUILD_TAG"[\\s\\S]*?digest: ""`);
    if (!productionBlock.test(productionValues)) {
      fail(`${productionValuesPath} must document ${component}.image.tag and ${component}.image.digest override slots`);
    }
  }
}

const helpers = read('devops/Helm/templates/_helpers.tpl');
if (!helpers.includes('wafflebear.requiredImageReference') || !helpers.includes('latest is not allowed') || !helpers.includes('sha256:<64 lowercase hex chars>')) {
  fail('devops/Helm must enforce explicit non-latest application image tags or sha256 digest references');
}

const legacyHelmBlockerPath = 'backend/helm/templates/legacy-blocker.yaml';
if (!exists(legacyHelmBlockerPath)) {
  fail('backend/helm must include templates/legacy-blocker.yaml so it cannot render as a deployable chart');
} else {
  const blocker = read(legacyHelmBlockerPath);
  if (!blocker.includes('fail ') || !blocker.includes('Use devops/Helm as the deployment source of truth')) {
    fail('backend/helm/templates/legacy-blocker.yaml must fail rendering and point operators to devops/Helm');
  }
}

verifyLegacyDeploymentLock();
verifyLegacyRootsAreNotDeploymentInputs();

for (const legacyRoot of legacyDeploymentRoots) {
  const readmePath = `${legacyRoot}/README.md`;
  if (!exists(readmePath)) {
    fail(`${legacyRoot} must include README.md declaring it as a legacy deployment artifact`);
    continue;
  }
  const readme = read(readmePath);
  if (!readme.includes('Do not deploy') || !readme.includes('devops/Helm')) {
    fail(`${readmePath} must state that devops/Helm is the deployment source of truth`);
  }
}

const requiredTemplates = [
  ['backend', 'devops/Helm/templates/backend-deployment.yaml'],
  ['frontend', 'devops/Helm/templates/frontend-deployment.yaml'],
  ['websocket', 'devops/Helm/templates/websocket-server-deployment.yaml'],
];
for (const [component, path] of requiredTemplates) {
  const template = read(path);
  const expected = `include "wafflebear.requiredImageReference" (list "${component}" .Values.${component}.image.repository .Values.${component}.image.tag .Values.${component}.image.digest)`;
  if (!template.includes(expected)) {
    fail(`${path} must render ${component} image through wafflebear.requiredImageReference`);
  }
}

const backendJenkinsfile = read('devops/Jenkins/backend.Jenkinsfile');
for (const component of ['FRONTEND', 'WEBSOCKET']) {
  const emptyDefaultPattern = new RegExp(`name: '${component}_IMAGE_TAG',[^\n]*defaultValue: ''`);
  if (!emptyDefaultPattern.test(backendJenkinsfile)) {
    fail(`devops/Jenkins/backend.Jenkinsfile ${component}_IMAGE_TAG must default to an empty required override slot`);
  }
}
if (/IMAGE_TAG'\s*,\s*defaultValue:\s*'latest'/.test(backendJenkinsfile)) {
  fail('devops/Jenkins/backend.Jenkinsfile must not default deploy image tag parameters to latest');
}
if (!backendJenkinsfile.includes("stage('Validate Deployment Image Tags')") || !backendJenkinsfile.includes("normalized == 'latest'")) {
  fail('devops/Jenkins/backend.Jenkinsfile must validate non-empty non-latest deployment image tags before Helm deploy');
}
if (!/helm lint "\$CHART_DIR" \$HELM_TAG_ARGS/.test(backendJenkinsfile) || !/helm template "\$RELEASE_NAME" "\$CHART_DIR"[\s\S]*\$HELM_TAG_ARGS/.test(backendJenkinsfile)) {
  fail('devops/Jenkins/backend.Jenkinsfile Helm sanity check must render with explicit application image tags');
}

const frontendJenkinsfile = read('devops/Jenkins/frontend.Jenkinsfile');
const frontendCiCommands = ['npm run test:unit', 'npm run build', 'npm run test:workspace-chunks'];
for (const command of frontendCiCommands) {
  if (!frontendJenkinsfile.includes(command)) {
    fail(`devops/Jenkins/frontend.Jenkinsfile must run ${command} before publishing frontend images`);
  }
}
if (frontendJenkinsfile.indexOf('npm run test:unit') > frontendJenkinsfile.indexOf('npm run build')) {
  fail('devops/Jenkins/frontend.Jenkinsfile must run unit tests before the frontend production build');
}
if (frontendJenkinsfile.indexOf('npm run build') > frontendJenkinsfile.indexOf('npm run test:workspace-chunks')) {
  fail('devops/Jenkins/frontend.Jenkinsfile must verify workspace chunks after the frontend production build');
}

const requiredComposeTag = '${COMPOSE_IMAGE_TAG:?COMPOSE_IMAGE_TAG must be set to an explicit non-latest tag}';
const requiredMinioTag = '${MINIO_IMAGE_TAG:?MINIO_IMAGE_TAG must be set to an explicit non-latest tag}';
for (const path of composeDeploymentFiles) {
  const content = read(path);
  for (const image of appImages) {
    if (content.includes(`${image}:latest`) || content.includes(`${image}:\${COMPOSE_IMAGE_TAG:-latest}`)) {
      fail(`${path} must not default ${image} to latest`);
    }
    if (!content.includes(`${image}:${requiredComposeTag}`)) {
      fail(`${path} must require COMPOSE_IMAGE_TAG for ${image}`);
    }
  }
  if (/image:\s+(?:redis|mariadb):latest\b/.test(content)) {
    fail(`${path} must pin infrastructure images instead of using latest`);
  }
}
for (const path of composeInfrastructureFiles) {
  const content = read(path);
  if (/image:\s+minio\/minio(?::latest)?\s*(?:#.*)?$/m.test(content)) {
    fail(`${path} must not use implicit or explicit latest for minio/minio`);
  }
  if (!content.includes(`minio/minio:${requiredMinioTag}`)) {
    fail(`${path} must require MINIO_IMAGE_TAG for minio/minio`);
  }
}

for (const path of deploymentRoots.flatMap(walk).filter((p) => /\.(ya?ml|tpl)$/.test(p))) {
  const content = read(path);
  const asciiCheckContent = content.replace(/^\uFEFF/, '');
  if (nonAsciiDeploymentContent.test(asciiCheckContent)) {
    fail(path + ' contains non-ASCII deployment YAML/TPL content; keep deployment comments ASCII to avoid mojibake');
  }
  for (const image of appImages) {
    if (content.includes(`${image}:latest`)) {
      fail(`${path} must not reference ${image}:latest`);
    }
  }
  if (/repository:\s+lumisia\//.test(content) || /image:\s+lumisia\//.test(content)) {
    fail(`${path} must not reference old lumisia images`);
  }
}

function isLegacyDeployableYaml(path) {
  if (!/\.ya?ml$/.test(path)) return false;
  const fileName = path.split('/').pop();
  return !['Chart.yaml', 'values.yaml'].includes(fileName);
}

for (const legacyRoot of legacyDeploymentRoots) {
  for (const path of walk(legacyRoot).filter(isLegacyDeployableYaml)) {
    const content = read(path);
    if (!content.includes('Legacy deployment artifact: do not deploy directly.')) {
      fail(`${path} must declare that it is a legacy deployment artifact`);
    }
    if (path.endsWith('/kustomization.yaml') && !/resources:\s*\[\]/.test(content)) {
      fail(`${path} must keep resources empty so kubectl apply -k cannot deploy legacy artifacts`);
    }
    if (/image:\s+chefbeom\/fileinnoutdrive-[^\s:]+:(?!REPLACE_WITH_EXPLICIT_TAG)/.test(content)) {
      fail(`${path} must keep placeholder application image tags`);
    }
  }
}

for (const path of publicAutomationRoots
  .flatMap(walk)
  .filter((p) => /\.(py|groovy|ps1|ya?ml|env|example|md)$/.test(p))) {
  const content = read(path);
  for (const [pattern, label] of forbiddenPublicDefaults) {
    if (pattern.test(content)) {
      fail(`${path} must not contain ${label}`);
    }
  }
}
if (errors.length > 0) {
  console.error('Deployment source verification failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Deployment source verification passed.');
