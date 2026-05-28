import { describe, it, expect } from 'vitest';
import { diffSpecs } from '../src/core/diffEngine.js';
import { loadSpec } from '../src/core/loader.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixDir = path.join(__dirname, 'fixtures');

async function loadFixture(name) {
  const { spec } = await loadSpec(path.join(fixDir, name));
  return spec;
}

describe('diffEngine.diffSpecs', () => {
  it('detects a new endpoint', async () => {
    const v1 = await loadFixture('v1.yaml');
    const v2 = await loadFixture('v2.yaml');
    const { changes } = diffSpecs(v1, v2);
    const newEndpoint = changes.find(c => c.ruleId === 'new-endpoint');
    expect(newEndpoint).toBeDefined();
    expect(newEndpoint.path).toBe('/products/{id}');
    expect(newEndpoint.method).toBe('get');
    expect(newEndpoint.breaking).toBe(false);
  });

  it('detects a removed required response field', async () => {
    const v1 = await loadFixture('v1.yaml');
    const v2 = await loadFixture('v2.yaml');
    const { changes } = diffSpecs(v1, v2);
    const removed = changes.find(
      c => c.ruleId === 'response-required-property-removed' && c.message?.includes('email')
    );
    expect(removed).toBeDefined();
    expect(removed.breaking).toBe(true);
    expect(removed.severity).toBe('ERR');
  });

  it('detects a new required request property', async () => {
    const v1 = await loadFixture('v1.yaml');
    const v2 = await loadFixture('v2.yaml');
    const { changes } = diffSpecs(v1, v2);
    // currency becomes required in v2
    const breaking = changes.find(
      c => c.ruleId === 'new-required-request-property' && c.message?.includes('currency')
    );
    expect(breaking).toBeDefined();
    expect(breaking.breaking).toBe(true);
  });

  it('detects enum value removed', async () => {
    const v1 = await loadFixture('v1.yaml');
    const v2 = await loadFixture('v2.yaml');
    const { changes } = diffSpecs(v1, v2);
    const enumChange = changes.find(c => c.ruleId === 'enum-value-removed');
    expect(enumChange).toBeDefined();
    expect(enumChange.breaking).toBe(true);
  });

  it('detects default value changed', async () => {
    const v1 = await loadFixture('v1.yaml');
    const v2 = await loadFixture('v2.yaml');
    const { changes } = diffSpecs(v1, v2);
    const defChange = changes.find(c => c.ruleId === 'default-value-changed');
    expect(defChange).toBeDefined();
  });

  it('detects optional parameter added', async () => {
    const v1 = await loadFixture('v1.yaml');
    const v2 = await loadFixture('v2.yaml');
    const { changes } = diffSpecs(v1, v2);
    const paramAdded = changes.find(
      c => c.ruleId === 'parameter-added-optional' && c.message?.includes('filter')
    );
    expect(paramAdded).toBeDefined();
    expect(paramAdded.breaking).toBe(false);
  });

  it('summary counts are correct', async () => {
    const v1 = await loadFixture('v1.yaml');
    const v2 = await loadFixture('v2.yaml');
    const { summary } = diffSpecs(v1, v2);
    expect(summary.breaking).toBeGreaterThan(0);
    expect(typeof summary.warnings).toBe('number');
    expect(typeof summary.info).toBe('number');
  });

  it('returns empty changes for identical specs', () => {
    const spec = {
      openapi: '3.0.3',
      info: { title: 'A', version: '1' },
      paths: {
        '/foo': {
          get: {
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    };
    const { changes, summary } = diffSpecs(spec, spec);
    expect(changes.length).toBe(0);
    expect(summary.breaking).toBe(0);
  });

  it('detects endpoint removed', () => {
    const specA = {
      openapi: '3.0.3',
      info: { title: 'A', version: '1' },
      paths: {
        '/foo': { get: { responses: { '200': { description: 'ok' } } } },
        '/bar': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    const specB = {
      openapi: '3.0.3',
      info: { title: 'A', version: '1' },
      paths: {
        '/foo': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    const { changes } = diffSpecs(specA, specB);
    const removed = changes.find(c => c.ruleId === 'endpoint-removed' && c.path === '/bar');
    expect(removed).toBeDefined();
    expect(removed.breaking).toBe(true);
  });

  it('follows $ref in schemas', () => {
    const specA = {
      openapi: '3.0.3',
      info: { title: 'A', version: '1' },
      components: {
        schemas: {
          User: {
            type: 'object',
            required: ['id', 'email'],
            properties: { id: { type: 'string' }, email: { type: 'string' } },
          },
        },
      },
      paths: {
        '/users': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/User' } },
                },
              },
            },
          },
        },
      },
    };
    const specB = {
      openapi: '3.0.3',
      info: { title: 'A', version: '1' },
      components: {
        schemas: {
          User: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string' } }, // email removed
          },
        },
      },
      paths: {
        '/users': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/User' } },
                },
              },
            },
          },
        },
      },
    };
    const { changes } = diffSpecs(specA, specB);
    const removed = changes.find(
      c => c.ruleId === 'response-required-property-removed' && c.message?.includes('email')
    );
    expect(removed).toBeDefined();
  });

  it('applies rule overrides from options', () => {
    const specA = {
      openapi: '3.0.3',
      info: { title: 'A', version: '1' },
      paths: {
        '/foo': { get: { responses: { '200': { description: 'ok' } } } },
        '/bar': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    const specB = {
      openapi: '3.0.3',
      info: { title: 'A', version: '1' },
      paths: {
        '/foo': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    const { changes } = diffSpecs(specA, specB, {
      rules: { 'endpoint-removed': 'off' },
    });
    const removed = changes.find(c => c.ruleId === 'endpoint-removed');
    expect(removed).toBeUndefined();
  });

  it('respects ignore patterns', () => {
    const specA = {
      openapi: '3.0.3',
      info: { title: 'A', version: '1' },
      paths: {
        '/internal/health': { get: { responses: { '200': { description: 'ok' } } } },
        '/public/users': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    const specB = {
      openapi: '3.0.3',
      info: { title: 'A', version: '1' },
      paths: {
        '/public/users': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    const { changes } = diffSpecs(specA, specB, {
      ignore: ['paths./internal/**'],
    });
    const internal = changes.find(c => c.path === '/internal/health');
    expect(internal).toBeUndefined();
  });
});

describe('diffEngine exit-code matrix', () => {
  it('breaking change → breaking:true on change', async () => {
    const v1 = await loadFixture('v1.yaml');
    const v2 = await loadFixture('v2.yaml');
    const { changes } = diffSpecs(v1, v2);
    const hasBreaking = changes.some(c => c.breaking);
    expect(hasBreaking).toBe(true);
  });
});
