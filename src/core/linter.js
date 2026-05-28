/**
 * linter.js — Basic OpenAPI validation / linting.
 *
 * Architecture: rules are pluggable — an array of { id, severity, check(spec): Issue[] }.
 * Future: support spectral rule import (see TODO below).
 *
 * Public API:
 *   lintSpec(spec, options?) → { issues: Issue[], summary }
 *
 * Issue shape:
 * {
 *   ruleId:   string,
 *   severity: 'ERR'|'WARN'|'INFO',
 *   message:  string,
 *   path:     string|null,  // JSON pointer to location in the spec
 * }
 */

import { resolveRef } from './loader.js';

// ---------------------------------------------------------------------------
// Built-in rules
// ---------------------------------------------------------------------------

/** @type {Array<{id: string, severity: 'ERR'|'WARN'|'INFO', check: (spec: object) => Issue[]}>} */
const BUILT_IN_RULES = [
  {
    id: 'valid-openapi-version',
    severity: 'ERR',
    check(spec) {
      const version = spec.openapi || spec.swagger;
      if (!version) {
        return [{ message: 'Missing `openapi` (or `swagger`) version field.' }];
      }
      const supported = /^(2\.\d+|3\.\d+\.\d+)$/;
      if (!supported.test(String(version))) {
        return [{ message: `Unsupported OpenAPI/Swagger version: \`${version}\`` }];
      }
      return [];
    },
  },
  {
    id: 'required-info-fields',
    severity: 'ERR',
    check(spec) {
      const issues = [];
      if (!spec.info) issues.push({ message: 'Missing required top-level field `info`.' });
      else {
        if (!spec.info.title) issues.push({ message: 'Missing required field `info.title`.' });
        if (!spec.info.version) issues.push({ message: 'Missing required field `info.version`.' });
      }
      if (!spec.paths && !spec.components) {
        issues.push({ message: 'Missing `paths` object — spec has no endpoints.' });
      }
      return issues;
    },
  },
  {
    id: 'paths-are-objects',
    severity: 'ERR',
    check(spec) {
      const issues = [];
      const paths = spec.paths || {};
      if (typeof paths !== 'object' || Array.isArray(paths)) {
        return [{ message: '`paths` must be an object.' }];
      }
      for (const [p, item] of Object.entries(paths)) {
        if (!p.startsWith('/')) {
          issues.push({ message: `Path \`${p}\` must start with \`/\`.`, path: `/paths/${p}` });
        }
        if (typeof item !== 'object' || Array.isArray(item)) {
          issues.push({ message: `Path item \`${p}\` must be an object.`, path: `/paths/${p}` });
        }
      }
      return issues;
    },
  },
  {
    id: 'operations-have-responses',
    severity: 'ERR',
    check(spec) {
      const issues = [];
      const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];
      for (const [p, item] of Object.entries(spec.paths || {})) {
        for (const method of methods) {
          const op = item?.[method];
          if (!op) continue;
          if (!op.responses || Object.keys(op.responses).length === 0) {
            issues.push({
              message: `Operation ${method.toUpperCase()} ${p} has no responses.`,
              path: `/paths/${p}/${method}/responses`,
            });
          }
        }
      }
      return issues;
    },
  },
  {
    id: 'no-duplicate-operation-ids',
    severity: 'ERR',
    check(spec) {
      const issues = [];
      const seen = new Map();
      const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];
      for (const [p, item] of Object.entries(spec.paths || {})) {
        for (const method of methods) {
          const op = item?.[method];
          if (!op?.operationId) continue;
          const id = op.operationId;
          if (seen.has(id)) {
            issues.push({
              message: `Duplicate operationId \`${id}\` (first at ${seen.get(id)}, again at ${method.toUpperCase()} ${p}).`,
              path: `/paths/${p}/${method}/operationId`,
            });
          } else {
            seen.set(id, `${method.toUpperCase()} ${p}`);
          }
        }
      }
      return issues;
    },
  },
  {
    id: 'refs-resolve',
    severity: 'ERR',
    check(spec) {
      const issues = [];
      const visited = new Set();
      collectRefs(spec, spec, '', issues, visited);
      return issues;
    },
  },
  {
    id: 'operation-has-summary-or-description',
    severity: 'INFO',
    check(spec) {
      const issues = [];
      const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];
      for (const [p, item] of Object.entries(spec.paths || {})) {
        for (const method of methods) {
          const op = item?.[method];
          if (!op) continue;
          if (!op.summary && !op.description) {
            issues.push({
              message: `Operation ${method.toUpperCase()} ${p} has no summary or description.`,
              path: `/paths/${p}/${method}`,
            });
          }
        }
      }
      return issues;
    },
  },
  {
    id: 'security-schemes-used',
    severity: 'WARN',
    check(spec) {
      // Warn if top-level security is defined but securitySchemes are not
      if (!spec.security) return [];
      const schemes = spec.components?.securitySchemes || spec.securityDefinitions;
      if (!schemes || Object.keys(schemes).length === 0) {
        return [{ message: 'Top-level `security` is defined but no security schemes are declared.' }];
      }
      return [];
    },
  },
];

function collectRefs(node, spec, jsonPath, issues, visited) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((item, i) => collectRefs(item, spec, `${jsonPath}/${i}`, issues, visited));
    return;
  }

  if (node.$ref) {
    const ref = node.$ref;
    if (!visited.has(ref)) {
      visited.add(ref);
      if (ref.startsWith('#/')) {
        const resolved = resolveRef(spec, ref);
        if (resolved === null) {
          issues.push({
            message: `$ref \`${ref}\` cannot be resolved.`,
            path: jsonPath,
          });
        } else {
          collectRefs(resolved, spec, ref.slice(1), issues, visited);
        }
      }
      // External refs: skip for now (v1 scope)
    }
    return;
  }

  for (const [key, val] of Object.entries(node)) {
    collectRefs(val, spec, `${jsonPath}/${key}`, issues, visited);
  }
}

// ---------------------------------------------------------------------------
// TODO: Spectral ruleset import hook (future v2 feature)
// When implemented, load Spectral rulesets here and merge with built-in rules.
// Extension point: push additional rule objects into the rules array before running.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Main public function
// ---------------------------------------------------------------------------

/**
 * @param {object} spec    parsed OpenAPI spec
 * @param {object} [options]
 * @param {object} [options.rules]  rule id → 'error'|'warn'|'info'|'off'
 * @param {Array}  [options.extraRules]  additional pluggable rule objects
 * @returns {{ issues: Issue[], summary: { errors: number, warnings: number, info: number } }}
 */
export function lintSpec(spec, options = {}) {
  const rules = [...BUILT_IN_RULES, ...(options.extraRules || [])];
  const allIssues = [];

  for (const rule of rules) {
    let severity = rule.severity;
    const override = options.rules?.[rule.id];
    if (override === 'off' || override === false) continue;
    if (override === 'error') severity = 'ERR';
    else if (override === 'warn' || override === 'warning') severity = 'WARN';
    else if (override === 'info') severity = 'INFO';

    const rawIssues = rule.check(spec) ?? [];
    for (const issue of rawIssues) {
      allIssues.push({ ruleId: rule.id, severity, ...issue });
    }
  }

  const summary = {
    errors: allIssues.filter(i => i.severity === 'ERR').length,
    warnings: allIssues.filter(i => i.severity === 'WARN').length,
    info: allIssues.filter(i => i.severity === 'INFO').length,
  };

  return { issues: allIssues, summary };
}
