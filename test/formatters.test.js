import { describe, it, expect } from 'vitest';
import { diffSpecs } from '../src/core/diffEngine.js';
import { lintSpec } from '../src/core/linter.js';
import { loadSpec } from '../src/core/loader.js';
import { formatText } from '../src/formatters/text.js';
import { formatJson } from '../src/formatters/json.js';
import { formatSarif } from '../src/formatters/sarif.js';
import { formatJunit } from '../src/formatters/junit.js';
import { computeExitCode } from '../src/utils/exit.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixDir = path.join(__dirname, 'fixtures');

async function loadFixture(name) {
  const { spec, sourcePath } = await loadSpec(path.join(fixDir, name));
  return { spec, sourcePath };
}

async function getDiffResult() {
  const { spec: v1, sourcePath: p1 } = await loadFixture('v1.yaml');
  const { spec: v2, sourcePath: p2 } = await loadFixture('v2.yaml');
  const { changes, summary } = diffSpecs(v1, v2);
  const meta = { specA: p1, specB: p2, generatedAt: '2024-01-01T00:00:00.000Z', tool: 'apinotes', toolVersion: '0.1.0' };
  return { changes, summary, meta };
}

async function getLintResult() {
  const { spec, sourcePath } = await loadFixture('valid.yaml');
  const { issues, summary } = lintSpec(spec);
  const meta = { spec: sourcePath, generatedAt: '2024-01-01T00:00:00.000Z', tool: 'apinotes', toolVersion: '0.1.0' };
  return { issues, summary, meta };
}

// ---------------------------------------------------------------------------
// Text formatter
// ---------------------------------------------------------------------------
describe('formatText (diff)', () => {
  it('renders summary line', async () => {
    const result = await getDiffResult();
    const out = formatText(result, { color: false });
    expect(out).toContain('Summary:');
    expect(out).toContain('breaking');
  });

  it('renders Comparing header', async () => {
    const result = await getDiffResult();
    const out = formatText(result, { color: false });
    expect(out).toContain('Comparing');
  });

  it('renders rule ids', async () => {
    const result = await getDiffResult();
    const out = formatText(result, { color: false });
    expect(out).toContain('[');
  });
});

describe('formatText (lint)', () => {
  it('renders Linting header', async () => {
    const result = await getLintResult();
    const out = formatText(result, { color: false });
    expect(out).toContain('Linting');
  });

  it('renders no issues message for clean spec', async () => {
    const result = await getLintResult();
    const out = formatText(result, { color: false });
    expect(out).toContain('no issues');
  });
});

// ---------------------------------------------------------------------------
// JSON formatter
// ---------------------------------------------------------------------------
describe('formatJson', () => {
  it('produces valid JSON', async () => {
    const result = await getDiffResult();
    const out = formatJson(result);
    expect(() => JSON.parse(out)).not.toThrow();
  });

  it('contains schemaVersion: 1', async () => {
    const result = await getDiffResult();
    const parsed = JSON.parse(formatJson(result));
    expect(parsed.schemaVersion).toBe(1);
  });

  it('contains changes array', async () => {
    const result = await getDiffResult();
    const parsed = JSON.parse(formatJson(result));
    expect(Array.isArray(parsed.changes)).toBe(true);
  });

  it('contains summary', async () => {
    const result = await getDiffResult();
    const parsed = JSON.parse(formatJson(result));
    expect(typeof parsed.summary).toBe('object');
    expect(typeof parsed.summary.breaking).toBe('number');
  });

  it('lint result contains issues array', async () => {
    const result = await getLintResult();
    const parsed = JSON.parse(formatJson(result));
    expect(Array.isArray(parsed.issues)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SARIF formatter
// ---------------------------------------------------------------------------
describe('formatSarif', () => {
  it('produces valid JSON', async () => {
    const result = await getDiffResult();
    const out = formatSarif(result);
    expect(() => JSON.parse(out)).not.toThrow();
  });

  it('has correct SARIF version', async () => {
    const result = await getDiffResult();
    const parsed = JSON.parse(formatSarif(result));
    expect(parsed.version).toBe('2.1.0');
  });

  it('has one run with tool.driver.name = "apinotes"', async () => {
    const result = await getDiffResult();
    const parsed = JSON.parse(formatSarif(result));
    expect(parsed.runs).toHaveLength(1);
    expect(parsed.runs[0].tool.driver.name).toBe('apinotes');
  });

  it('each result has ruleId, level, message', async () => {
    const result = await getDiffResult();
    const parsed = JSON.parse(formatSarif(result));
    for (const r of parsed.runs[0].results) {
      expect(r.ruleId).toBeTruthy();
      expect(['error', 'warning', 'note']).toContain(r.level);
      expect(r.message.text).toBeTruthy();
    }
  });

  it('results have locations', async () => {
    const result = await getDiffResult();
    const parsed = JSON.parse(formatSarif(result));
    for (const r of parsed.runs[0].results) {
      expect(r.locations).toHaveLength(1);
      expect(r.locations[0].physicalLocation.artifactLocation.uri).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// JUnit formatter
// ---------------------------------------------------------------------------
describe('formatJunit', () => {
  it('produces XML string', async () => {
    const result = await getDiffResult();
    const out = formatJunit(result);
    expect(out).toContain('<?xml');
    expect(out).toContain('<testsuites');
  });

  it('contains testcase elements', async () => {
    const result = await getDiffResult();
    const out = formatJunit(result);
    expect(out).toContain('<testcase');
  });

  it('breaking changes produce failure elements', async () => {
    const result = await getDiffResult();
    const out = formatJunit(result);
    expect(out).toContain('<failure');
  });

  it('clean result emits no-failure testcase', async () => {
    const emptyResult = {
      changes: [],
      summary: { breaking: 0, warnings: 0, info: 0 },
      meta: { specA: 'a.yaml', specB: 'b.yaml', generatedAt: '2024-01-01T00:00:00.000Z', tool: 'apinotes' },
    };
    const out = formatJunit(emptyResult);
    expect(out).toContain('no issues found');
    expect(out).not.toContain('<failure');
  });
});

// ---------------------------------------------------------------------------
// Exit code matrix
// ---------------------------------------------------------------------------
describe('computeExitCode', () => {
  const summaryBreaking = { breaking: 2, warnings: 1, info: 3 };
  const summaryWarn = { breaking: 0, warnings: 1, info: 3 };
  const summaryInfo = { breaking: 0, warnings: 0, info: 1 };
  const summaryClean = { breaking: 0, warnings: 0, info: 0 };

  it('returns 0 for none (regardless of findings)', () => {
    expect(computeExitCode(summaryBreaking, 'none')).toBe(0);
  });

  it('returns 2 for breaking changes + --fail-on breaking', () => {
    expect(computeExitCode(summaryBreaking, 'breaking')).toBe(2);
  });

  it('returns 0 for no breaking + --fail-on breaking', () => {
    expect(computeExitCode(summaryWarn, 'breaking')).toBe(0);
  });

  it('returns 1 for warnings + --fail-on warning', () => {
    expect(computeExitCode(summaryWarn, 'warning')).toBe(1);
  });

  it('returns 1 for info + --fail-on info', () => {
    expect(computeExitCode(summaryInfo, 'info')).toBe(1);
  });

  it('returns 0 for clean summary + any fail-on', () => {
    expect(computeExitCode(summaryClean, 'breaking')).toBe(0);
    expect(computeExitCode(summaryClean, 'warning')).toBe(0);
    expect(computeExitCode(summaryClean, 'info')).toBe(0);
  });

  it('returns 1 for breaking + --fail-on warning', () => {
    expect(computeExitCode(summaryBreaking, 'warning')).toBe(1);
  });
});
