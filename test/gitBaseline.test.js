import { describe, it, expect, vi, afterEach } from 'vitest';
import { readSpecAtRef } from '../src/core/gitBaseline.js';

const BASELINE_YAML = `openapi: "3.0.3"
info:
  title: Baseline API
  version: "1.0.0"
paths:
  /users:
    get:
      operationId: listUsers
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: object
                required: [id, email]
                properties:
                  id:
                    type: string
                  email:
                    type: string
`;

// ---------------------------------------------------------------------------
// Mock child_process.spawnSync for the git baseline tests
// ---------------------------------------------------------------------------
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn((cmd, args, _opts) => {
    // Simulate `git show main:test/fixtures/v1.yaml`
    const gitRef = args && args[1];
    if (gitRef && gitRef.startsWith('main:') && gitRef.includes('v1.yaml')) {
      return { status: 0, stdout: BASELINE_YAML, stderr: '' };
    }
    if (gitRef && gitRef.includes('nonexistent-ref')) {
      return {
        status: 128,
        stdout: '',
        stderr: "fatal: ambiguous argument 'nonexistent-ref'",
      };
    }
    return { status: 128, stdout: '', stderr: `Unexpected git args: ${JSON.stringify(args)}` };
  }),
}));

describe('gitBaseline.readSpecAtRef', () => {
  afterEach(() => vi.clearAllMocks());

  it('reads a spec from a git ref', async () => {
    const result = await readSpecAtRef('main', 'test/fixtures/v1.yaml');
    expect(result.spec).toBeDefined();
    expect(result.spec.openapi).toBe('3.0.3');
    expect(result.spec.info.title).toBe('Baseline API');
    expect(result.sourcePath).toContain('main');
  });

  it('throws a descriptive error for nonexistent ref', async () => {
    await expect(readSpecAtRef('nonexistent-ref', 'test/fixtures/v1.yaml'))
      .rejects.toThrow(/nonexistent-ref/);
  });

  it('sourcePath includes the ref', async () => {
    const result = await readSpecAtRef('main', 'test/fixtures/v1.yaml');
    expect(result.sourcePath).toMatch(/^main:/);
  });
});

// ---------------------------------------------------------------------------
// Integration: diff against mocked git baseline
// ---------------------------------------------------------------------------
describe('diff with git baseline (mocked)', () => {
  it('produces changes when comparing current file vs git ref', async () => {
    const { diffSpecs } = await import('../src/core/diffEngine.js');
    const { loadSpec } = await import('../src/core/loader.js');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const fixDir = path.join(__dirname, 'fixtures');

    // Load current v2.yaml
    const { spec: current } = await loadSpec(path.join(fixDir, 'v2.yaml'));
    // Load the mocked baseline
    const { spec: baseline } = await readSpecAtRef('main', 'test/fixtures/v1.yaml');

    const { changes, summary } = diffSpecs(baseline, current);
    // v2 has /products/{id} that baseline doesn't — should see new endpoint
    const newEndpoint = changes.find(c => c.ruleId === 'new-endpoint');
    expect(newEndpoint).toBeDefined();
  });
});
