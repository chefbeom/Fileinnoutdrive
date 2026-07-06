#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const errors = [];

function read(path) {
  return readFileSync(join(repoRoot, path), 'utf8');
}

function exists(path) {
  return existsSync(join(repoRoot, path));
}

function fail(message) {
  errors.push(message);
}

const expectedMigrations = [
  'V20260704_01__add_refresh_token_session_columns.sql',
  'V20260704_02__add_file_share_password_column.sql',
  'V20260704_03__add_file_share_policy_columns.sql',
  'V20260704_04__add_file_share_audit_log.sql',
  'V20260704_05__add_file_version_table.sql',
];

const buildGradle = read('backend/build.gradle');
if (!buildGradle.includes("implementation 'org.flywaydb:flyway-core'")) {
  fail('backend/build.gradle must include Flyway core');
}
if (!buildGradle.includes("implementation 'org.flywaydb:flyway-mysql'")) {
  fail('backend/build.gradle must include Flyway MySQL/MariaDB support');
}

const applicationYaml = read('backend/src/main/resources/application.yml');
for (const required of [
  'flyway:',
  'enabled: ${SPRING_FLYWAY_ENABLED:false}',
  'locations: classpath:db/migration',
  'baseline-on-migrate: ${SPRING_FLYWAY_BASELINE_ON_MIGRATE:true}',
  'validate-on-migrate: ${SPRING_FLYWAY_VALIDATE_ON_MIGRATE:true}',
]) {
  if (!applicationYaml.includes(required)) {
    fail(`application.yml must configure Spring Flyway setting: ${required}`);
  }
}

const migrationDir = 'backend/src/main/resources/db/migration';
if (!exists(migrationDir)) {
  fail(`${migrationDir} must exist`);
} else {
  const migrations = readdirSync(join(repoRoot, migrationDir)).filter((name) => name.endsWith('.sql')).sort();
  for (const expected of expectedMigrations) {
    if (!migrations.includes(expected)) {
      fail(`${migrationDir}/${expected} is required`);
    }
  }
  for (const migration of migrations) {
    if (/drop|remove|delete/i.test(migration)) {
      fail(`${migration} looks destructive and must stay out of automatic Flyway migrations`);
    }
  }
}

for (const helmValuesPath of [
  'devops/Helm/values.yaml',
  'devops/Helm/values.production.example.yaml',
]) {
  const values = read(helmValuesPath);
  for (const envName of [
    'SPRING_FLYWAY_ENABLED',
    'SPRING_FLYWAY_BASELINE_ON_MIGRATE',
    'SPRING_FLYWAY_VALIDATE_ON_MIGRATE',
    'SPRING_FLYWAY_OUT_OF_ORDER',
  ]) {
    if (!values.includes(envName)) {
      fail(`${helmValuesPath} must expose ${envName}`);
    }
  }
}

const runbook = read('docs/DB_MIGRATION_RUNBOOK.md');
for (const required of ['Flyway', 'SPRING_FLYWAY_ENABLED', 'db/migration', 'manual-drop-unused-columns.sql']) {
  if (!runbook.includes(required)) {
    fail(`docs/DB_MIGRATION_RUNBOOK.md must document ${required}`);
  }
}

if (errors.length > 0) {
  console.error('DB migration verification failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('DB migration verification passed.');