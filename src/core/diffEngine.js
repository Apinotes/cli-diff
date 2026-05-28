/**
 * diffEngine.js — Core OpenAPI diff engine.
 *
 * Ported from apidocs_server/src/controllers/diffController.js.
 * Pure functions only — no Express, no DB.
 *
 * Public API:
 *   diffSpecs(specA, specB, options?) → { changes: Change[], summary }
 *
 * Change shape:
 * {
 *   ruleId:    string,          // e.g. "response-required-property-removed"
 *   kind:      string,          // e.g. "property-removed"
 *   breaking:  boolean,
 *   severity:  'ERR'|'WARN'|'INFO',
 *   path:      string,          // HTTP path, e.g. "/users"
 *   method:    string,          // lowercase, e.g. "get"
 *   direction: 'request'|'response'|'general',
 *   location:  string,          // human description of where
 *   message:   string,          // human-readable description
 * }
 */

import { resolveSchema } from './loader.js';

// ---------------------------------------------------------------------------
// Rule definitions — mirrors the server's default ruleset
// ---------------------------------------------------------------------------
const RULES = {
  'new-endpoint':                         { severity: 'INFO',  breaking: false, kind: 'endpoint-added' },
  'endpoint-removed':                     { severity: 'ERR',   breaking: true,  kind: 'endpoint-removed' },
  'response-required-property-removed':   { severity: 'ERR',   breaking: true,  kind: 'property-removed' },
  'response-required-property-added':     { severity: 'INFO',  breaking: false, kind: 'property-added' },
  'response-optional-property-removed':   { severity: 'WARN',  breaking: false, kind: 'property-removed' },
  'response-optional-property-added':     { severity: 'INFO',  breaking: false, kind: 'property-added' },
  'new-required-request-property':        { severity: 'ERR',   breaking: true,  kind: 'property-added' },
  'required-request-property-removed':    { severity: 'WARN',  breaking: false, kind: 'property-removed' },
  'optional-request-property-removed':    { severity: 'WARN',  breaking: false, kind: 'property-removed' },
  'optional-request-property-added':      { severity: 'INFO',  breaking: false, kind: 'property-added' },
  'parameter-required-changed':           { severity: 'WARN',  breaking: true,  kind: 'constraint-changed' },
  'parameter-removed':                    { severity: 'ERR',   breaking: true,  kind: 'property-removed' },
  'parameter-added-required':             { severity: 'ERR',   breaking: true,  kind: 'property-added' },
  'parameter-added-optional':             { severity: 'INFO',  breaking: false, kind: 'property-added' },
  'response-type-changed':                { severity: 'ERR',   breaking: true,  kind: 'constraint-changed' },
  'request-type-changed':                 { severity: 'ERR',   breaking: true,  kind: 'constraint-changed' },
  'response-status-removed':              { severity: 'ERR',   breaking: true,  kind: 'property-removed' },
  'response-status-added':                { severity: 'INFO',  breaking: false, kind: 'property-added' },
  'enum-value-removed':                   { severity: 'ERR',   breaking: true,  kind: 'constraint-changed' },
  'enum-value-added':                     { severity: 'INFO',  breaking: false, kind: 'constraint-changed' },
  'default-value-changed':                { severity: 'WARN',  breaking: false, kind: 'default-changed' },
  'constraint-changed':                   { severity: 'WARN',  breaking: false, kind: 'constraint-changed' },
  'format-changed':                       { severity: 'WARN',  breaking: true,  kind: 'constraint-changed' },
  'nullable-changed':                     { severity: 'WARN',  breaking: false, kind: 'constraint-changed' },
  'operationId-changed':                  { severity: 'WARN',  breaking: false, kind: 'constraint-changed' },
  'description-changed':                  { severity: 'INFO',  breaking: false, kind: 'constraint-changed' },
  'response-property-type-changed':       { severity: 'ERR',   breaking: true,  kind: 'constraint-changed' },
  'request-property-type-changed':        { severity: 'ERR',   breaking: true,  kind: 'constraint-changed' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChange(ruleId, extras) {
  const rule = RULES[ruleId] ?? { severity: 'INFO', breaking: false, kind: 'constraint-changed' };
  return {
    ruleId,
    kind: rule.kind,
    breaking: rule.breaking,
    severity: rule.severity,
    ...extras,
  };
}

function getSchemas(spec) {
  return (spec.components || spec.definitions) ? 
    (spec.components?.schemas || spec.definitions || {}) :
    {};
}

function resolveSchemaDef(schema, spec) {
  if (!schema) return {};
  return resolveSchema(schema, spec);
}

function getProperties(schema) {
  if (!schema) return {};
  return schema.properties || {};
}

function getRequired(schema) {
  if (!schema) return [];
  return schema.required || [];
}

function getType(schema) {
  return schema?.type ?? null;
}

function getEnum(schema) {
  return schema?.enum ?? null;
}

function getDefault(schema) {
  return schema?.default;
}

function getFormat(schema) {
  return schema?.format ?? null;
}

/**
 * Recursively diff two schema objects, producing Change records.
 * @param {object} schemaA
 * @param {object} schemaB
 * @param {object} specA   full spec A (for $ref resolution)
 * @param {object} specB   full spec B (for $ref resolution)
 * @param {string} path    HTTP path
 * @param {string} method
 * @param {'request'|'response'} direction
 * @param {string} propertyPath  dot-notation path within the schema
 * @param {number} depth   recursion depth limit
 * @returns {Change[]}
 */
function diffSchemas(schemaA, schemaB, specA, specB, path, method, direction, propertyPath = '', depth = 0) {
  if (depth > 10) return []; // prevent runaway recursion

  const a = resolveSchemaDef(schemaA, specA);
  const b = resolveSchemaDef(schemaB, specB);
  const changes = [];
  const loc = propertyPath || '(root)';

  // Type change
  const typeA = getType(a);
  const typeB = getType(b);
  if (typeA && typeB && typeA !== typeB) {
    const ruleId = direction === 'response' ? 'response-type-changed' : 'request-type-changed';
    changes.push(makeChange(ruleId, {
      path, method, direction,
      location: `${direction} body ${loc}`,
      message: `field \`${loc}\` type changed from \`${typeA}\` to \`${typeB}\``,
    }));
    return changes; // type change makes further comparison meaningless
  }

  // Format change
  const fmtA = getFormat(a);
  const fmtB = getFormat(b);
  if (fmtA !== fmtB && (fmtA || fmtB)) {
    changes.push(makeChange('format-changed', {
      path, method, direction,
      location: `${direction} body ${loc}`,
      message: `field \`${loc}\` format changed from \`${fmtA ?? 'none'}\` to \`${fmtB ?? 'none'}\``,
    }));
  }

  // Enum changes
  const enumA = getEnum(a);
  const enumB = getEnum(b);
  if (enumA || enumB) {
    const setA = new Set(enumA ?? []);
    const setB = new Set(enumB ?? []);
    for (const v of setA) {
      if (!setB.has(v)) {
        changes.push(makeChange('enum-value-removed', {
          path, method, direction,
          location: `${direction} body ${loc}`,
          message: `field \`${loc}\` enum value \`${v}\` removed`,
        }));
      }
    }
    for (const v of setB) {
      if (!setA.has(v)) {
        changes.push(makeChange('enum-value-added', {
          path, method, direction,
          location: `${direction} body ${loc}`,
          message: `field \`${loc}\` enum value \`${v}\` added`,
        }));
      }
    }
  }

  // Default change
  const defA = getDefault(a);
  const defB = getDefault(b);
  if (JSON.stringify(defA) !== JSON.stringify(defB) && (defA !== undefined || defB !== undefined)) {
    changes.push(makeChange('default-value-changed', {
      path, method, direction,
      location: `${direction} body ${loc}`,
      message: `field \`${loc}\` default changed from \`${defA}\` to \`${defB}\``,
    }));
  }

  // Numeric constraints (minimum, maximum, minLength, maxLength, etc.)
  const constraints = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minLength', 'maxLength', 'minItems', 'maxItems', 'pattern', 'multipleOf'];
  for (const c of constraints) {
    if (a[c] !== b[c] && (a[c] !== undefined || b[c] !== undefined)) {
      changes.push(makeChange('constraint-changed', {
        path, method, direction,
        location: `${direction} body ${loc}`,
        message: `field \`${loc}\` constraint \`${c}\` changed from \`${a[c]}\` to \`${b[c]}\``,
      }));
    }
  }

  // nullable changed
  if ((a.nullable ?? false) !== (b.nullable ?? false)) {
    changes.push(makeChange('nullable-changed', {
      path, method, direction,
      location: `${direction} body ${loc}`,
      message: `field \`${loc}\` nullable changed to \`${b.nullable ?? false}\``,
    }));
  }

  // Properties
  const propsA = getProperties(a);
  const propsB = getProperties(b);
  const reqA = new Set(getRequired(a));
  const reqB = new Set(getRequired(b));

  const allProps = new Set([...Object.keys(propsA), ...Object.keys(propsB)]);
  for (const prop of allProps) {
    const subPath = propertyPath ? `${propertyPath}.${prop}` : prop;
    const inA = prop in propsA;
    const inB = prop in propsB;
    const wasRequired = reqA.has(prop);
    const isRequired = reqB.has(prop);

    if (inA && !inB) {
      // Property removed
      if (direction === 'response') {
        const ruleId = wasRequired ? 'response-required-property-removed' : 'response-optional-property-removed';
        changes.push(makeChange(ruleId, {
          path, method, direction,
          location: `response body ${subPath}`,
          message: `response field \`${subPath}\` removed`,
        }));
      } else {
        const ruleId = wasRequired ? 'required-request-property-removed' : 'optional-request-property-removed';
        changes.push(makeChange(ruleId, {
          path, method, direction,
          location: `request body ${subPath}`,
          message: `request field \`${subPath}\` removed`,
        }));
      }
    } else if (!inA && inB) {
      // Property added
      if (direction === 'response') {
        const ruleId = isRequired ? 'response-required-property-added' : 'response-optional-property-added';
        changes.push(makeChange(ruleId, {
          path, method, direction,
          location: `response body ${subPath}`,
          message: `response field \`${subPath}\` added`,
        }));
      } else {
        const ruleId = isRequired ? 'new-required-request-property' : 'optional-request-property-added';
        changes.push(makeChange(ruleId, {
          path, method, direction,
          location: `request body ${subPath}`,
          message: `request field \`${subPath}\` added${isRequired ? ' (required)' : ''}`,
        }));
      }
    } else if (inA && inB) {
      // Required-ness changed
      if (wasRequired && !isRequired && direction === 'request') {
        // making optional is fine
      } else if (!wasRequired && isRequired && direction === 'request') {
        changes.push(makeChange('new-required-request-property', {
          path, method, direction,
          location: `request body ${subPath}`,
          message: `request field \`${subPath}\` made required`,
        }));
      }
      // Recurse into sub-schema
      changes.push(...diffSchemas(propsA[prop], propsB[prop], specA, specB, path, method, direction, subPath, depth + 1));
    }
  }

  // Handle allOf / oneOf / anyOf at top level (v1: just handle allOf by merging)
  // TODO: deeper allOf/oneOf/anyOf diffing in v2

  return changes;
}

/**
 * Diff query/path/header parameters between two operations.
 */
function diffParameters(paramsA = [], paramsB = [], specA, specB, path, method) {
  const changes = [];

  const indexByIn = (params) => {
    const map = {};
    for (const p of params) {
      const resolved = p.$ref ? resolveSchema(p, specA) : p;
      const key = `${resolved.in}:${resolved.name}`;
      map[key] = resolved;
    }
    return map;
  };

  const mapA = indexByIn(paramsA);
  const mapB = indexByIn(paramsB);
  const allKeys = new Set([...Object.keys(mapA), ...Object.keys(mapB)]);

  for (const key of allKeys) {
    const pA = mapA[key];
    const pB = mapB[key];
    const name = (pA || pB).name;
    const loc = `parameter \`${name}\``;

    if (pA && !pB) {
      changes.push(makeChange('parameter-removed', {
        path, method, direction: 'general',
        location: loc,
        message: `parameter \`${name}\` removed`,
      }));
    } else if (!pA && pB) {
      const ruleId = pB.required ? 'parameter-added-required' : 'parameter-added-optional';
      changes.push(makeChange(ruleId, {
        path, method, direction: 'general',
        location: loc,
        message: `parameter \`${name}\` added${pB.required ? ' (required)' : ''}`,
      }));
    } else if (pA && pB) {
      // required changed
      if (!pA.required && pB.required) {
        changes.push(makeChange('parameter-required-changed', {
          path, method, direction: 'general',
          location: loc,
          message: `parameter \`${name}\` made required`,
        }));
      } else if (pA.required && !pB.required) {
        changes.push(makeChange('parameter-required-changed', {
          path, method, direction: 'general',
          location: loc,
          message: `parameter \`${name}\` made optional`,
        }));
      }
      // schema diff for the parameter
      if (pA.schema || pB.schema) {
        changes.push(...diffSchemas(pA.schema, pB.schema, specA, specB, path, method, 'general', `param.${name}`));
      }
    }
  }
  return changes;
}

/**
 * Get the primary schema for a request body or response body.
 * Handles OpenAPI 3.x requestBody and responses structures.
 */
function extractBodySchema(bodyObj, spec) {
  if (!bodyObj) return null;

  // OpenAPI 3.x requestBody
  if (bodyObj.content) {
    const mediaTypes = Object.values(bodyObj.content);
    for (const mt of mediaTypes) {
      if (mt.schema) return mt.schema;
    }
    return null;
  }

  // Swagger 2.x in-body parameter
  if (bodyObj.schema) return bodyObj.schema;

  // Direct schema (already extracted)
  return bodyObj;
}

/**
 * Extract the primary (200/201) response schema from an operation.
 */
function extractResponseSchemas(responses, spec) {
  if (!responses) return {};
  const result = {};
  for (const [status, resp] of Object.entries(responses)) {
    const resolved = resp.$ref ? resolveSchema(resp, spec) : resp;
    result[status] = extractBodySchema(resolved, spec);
  }
  return result;
}

/**
 * Extract request body schema from an operation.
 */
function extractRequestSchema(operation, spec) {
  // OpenAPI 3.x
  if (operation.requestBody) {
    return extractBodySchema(operation.requestBody.$ref ? resolveSchema(operation.requestBody, spec) : operation.requestBody, spec);
  }
  // Swagger 2.x — look for "in: body" parameter
  if (operation.parameters) {
    const bodyParam = operation.parameters.find(p => {
      const resolved = p.$ref ? resolveSchema(p, spec) : p;
      return resolved.in === 'body';
    });
    if (bodyParam) {
      const resolved = bodyParam.$ref ? resolveSchema(bodyParam, spec) : bodyParam;
      return resolved.schema || null;
    }
  }
  return null;
}

/**
 * Merge path-level and operation-level parameters.
 */
function mergeParams(pathParams = [], operationParams = []) {
  const map = {};
  for (const p of pathParams) map[`${p.in}:${p.name}`] = p;
  for (const p of operationParams) map[`${p.in}:${p.name}`] = p;
  return Object.values(map);
}

// ---------------------------------------------------------------------------
// Main public function
// ---------------------------------------------------------------------------

/**
 * Diff two OpenAPI specs and return a list of changes plus a summary.
 *
 * @param {object} specA  parsed spec (old)
 * @param {object} specB  parsed spec (new)
 * @param {object} [options]
 * @param {object} [options.rules]   rule overrides from ruleset config
 * @param {string[]} [options.ignore] path patterns to ignore
 * @returns {{ changes: Change[], summary: { breaking: number, warnings: number, info: number, added: number } }}
 */
export function diffSpecs(specA, specB, options = {}) {
  const changes = [];

  const pathsA = specA.paths || {};
  const pathsB = specB.paths || {};

  const allPaths = new Set([...Object.keys(pathsA), ...Object.keys(pathsB)]);

  for (const path of allPaths) {
    // Apply ignore patterns
    if (options.ignore?.some(pattern => matchIgnorePattern(pattern, path))) continue;

    const pathItemA = pathsA[path];
    const pathItemB = pathsB[path];

    const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];

    const allMethods = new Set([
      ...Object.keys(pathItemA || {}).filter(k => httpMethods.includes(k)),
      ...Object.keys(pathItemB || {}).filter(k => httpMethods.includes(k)),
    ]);

    for (const method of allMethods) {
      const opA = pathItemA?.[method];
      const opB = pathItemB?.[method];

      if (opA && !opB) {
        changes.push(makeChange('endpoint-removed', {
          path, method, direction: 'general',
          location: `${method.toUpperCase()} ${path}`,
          message: `endpoint ${method.toUpperCase()} ${path} removed`,
        }));
        continue;
      }

      if (!opA && opB) {
        changes.push(makeChange('new-endpoint', {
          path, method, direction: 'general',
          location: `${method.toUpperCase()} ${path}`,
          message: `new endpoint ${method.toUpperCase()} ${path}`,
        }));
        continue;
      }

      // Both exist — diff them
      // Parameters
      const paramsA = mergeParams(pathItemA?.parameters || [], opA.parameters || []).map(p => p.$ref ? resolveSchema(p, specA) : p);
      const paramsB = mergeParams(pathItemB?.parameters || [], opB.parameters || []).map(p => p.$ref ? resolveSchema(p, specB) : p);
      changes.push(...diffParameters(paramsA, paramsB, specA, specB, path, method));

      // operationId changed
      if (opA.operationId && opB.operationId && opA.operationId !== opB.operationId) {
        changes.push(makeChange('operationId-changed', {
          path, method, direction: 'general',
          location: `${method.toUpperCase()} ${path}`,
          message: `operationId changed from \`${opA.operationId}\` to \`${opB.operationId}\``,
        }));
      }

      // Request body diff
      const reqSchemaA = extractRequestSchema(opA, specA);
      const reqSchemaB = extractRequestSchema(opB, specB);
      if (reqSchemaA || reqSchemaB) {
        changes.push(...diffSchemas(reqSchemaA, reqSchemaB, specA, specB, path, method, 'request'));
      }

      // Response diffs
      const respSchemasA = extractResponseSchemas(opA.responses, specA);
      const respSchemasB = extractResponseSchemas(opB.responses, specB);
      const allStatuses = new Set([...Object.keys(respSchemasA), ...Object.keys(respSchemasB)]);

      for (const status of allStatuses) {
        const inA = status in respSchemasA;
        const inB = status in respSchemasB;

        if (inA && !inB) {
          changes.push(makeChange('response-status-removed', {
            path, method, direction: 'response',
            location: `response ${status}`,
            message: `response status ${status} removed`,
          }));
        } else if (!inA && inB) {
          changes.push(makeChange('response-status-added', {
            path, method, direction: 'response',
            location: `response ${status}`,
            message: `response status ${status} added`,
          }));
        } else {
          if (respSchemasA[status] || respSchemasB[status]) {
            changes.push(...diffSchemas(respSchemasA[status], respSchemasB[status], specA, specB, path, method, 'response'));
          }
        }
      }
    }
  }

  // Apply rule overrides from options
  const filteredChanges = applyRuleOverrides(changes, options.rules);

  const summary = {
    breaking: filteredChanges.filter(c => c.breaking).length,
    warnings: filteredChanges.filter(c => c.severity === 'WARN').length,
    info: filteredChanges.filter(c => c.severity === 'INFO').length,
    added: filteredChanges.filter(c => c.kind === 'endpoint-added' || c.message?.includes('added')).length,
  };

  return { changes: filteredChanges, summary };
}

function matchIgnorePattern(pattern, path) {
  // Support simple glob: "paths./internal/**"
  const pathPattern = pattern.replace(/^paths\./, '');
  if (pathPattern.endsWith('**')) {
    return path.startsWith(pathPattern.slice(0, -2));
  }
  return path === pathPattern;
}

function applyRuleOverrides(changes, rules) {
  if (!rules) return changes;
  return changes.filter(c => {
    const override = rules[c.ruleId];
    if (override === 'off' || override === false) return false;
    if (override === 'error') {
      c.severity = 'ERR';
      c.breaking = true;
    } else if (override === 'warn' || override === 'warning') {
      c.severity = 'WARN';
    } else if (override === 'info') {
      c.severity = 'INFO';
    }
    return true;
  });
}
