import { describe, it, expect } from 'vitest';
import { lintSpec } from '../src/core/linter.js';
import { loadSpec } from '../src/core/loader.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixDir = path.join(__dirname, 'fixtures');

async function loadFixture(name) {
  const { spec } = await loadSpec(path.join(fixDir, name));
  return spec;
}

describe('linter.lintSpec', () => {
  it('passes a valid spec with no issues', async () => {
    const spec = await loadFixture('valid.yaml');
    const { issues, summary } = lintSpec(spec);
    expect(summary.errors).toBe(0);
  });

  it('detects missing info.version', () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'Test' },
      paths: {},
    };
    const { issues } = lintSpec(spec);
    const issue = issues.find(i => i.ruleId === 'required-info-fields');
    expect(issue).toBeDefined();
    expect(issue.severity).toBe('ERR');
  });

  it('detects missing openapi version', () => {
    const spec = { info: { title: 'Test', version: '1.0' }, paths: {} };
    const { issues } = lintSpec(spec);
    const issue = issues.find(i => i.ruleId === 'valid-openapi-version');
    expect(issue).toBeDefined();
  });

  it('detects paths not starting with /', () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'T', version: '1' },
      paths: { 'noslash': {} },
    };
    const { issues } = lintSpec(spec);
    const issue = issues.find(i => i.ruleId === 'paths-are-objects');
    expect(issue).toBeDefined();
  });

  it('detects operations with no responses', () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'T', version: '1' },
      paths: {
        '/foo': { get: { responses: {} } },
      },
    };
    const { issues } = lintSpec(spec);
    const issue = issues.find(i => i.ruleId === 'operations-have-responses');
    expect(issue).toBeDefined();
  });

  it('detects duplicate operationIds', async () => {
    const spec = await loadFixture('invalid.yaml');
    const { issues } = lintSpec(spec);
    const dupeIssue = issues.find(i => i.ruleId === 'no-duplicate-operation-ids');
    expect(dupeIssue).toBeDefined();
  });

  it('detects unresolvable $ref', async () => {
    const spec = await loadFixture('invalid.yaml');
    const { issues } = lintSpec(spec);
    const refIssue = issues.find(i => i.ruleId === 'refs-resolve');
    expect(refIssue).toBeDefined();
    expect(refIssue.message).toContain('Missing');
  });

  it('summary counts are correct', async () => {
    const spec = await loadFixture('invalid.yaml');
    const { summary } = lintSpec(spec);
    expect(summary.errors).toBeGreaterThan(0);
  });

  it('respects rule overrides: turning a rule off', async () => {
    const spec = await loadFixture('invalid.yaml');
    const { issues } = lintSpec(spec, { rules: { 'no-duplicate-operation-ids': 'off' } });
    const dupeIssue = issues.find(i => i.ruleId === 'no-duplicate-operation-ids');
    expect(dupeIssue).toBeUndefined();
  });

  it('supports pluggable extra rules', () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'T', version: '1' },
      paths: {},
    };
    const extraRule = {
      id: 'custom-rule',
      severity: 'WARN',
      check: () => [{ message: 'custom issue triggered' }],
    };
    const { issues } = lintSpec(spec, { extraRules: [extraRule] });
    const custom = issues.find(i => i.ruleId === 'custom-rule');
    expect(custom).toBeDefined();
    expect(custom.message).toBe('custom issue triggered');
  });
});
