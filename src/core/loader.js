/**
 * loader.js — load an OpenAPI spec from a file path or http(s) URL.
 * Supports .yaml, .yml, .json. Inline $ref resolution included.
 */

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve as resolvePath, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

/**
 * Load and parse a spec from a file path or URL.
 * Returns the raw parsed object (refs NOT yet resolved).
 * @param {string} source  file path or http(s) URL
 * @returns {Promise<object>}
 */
export async function loadSpec(source) {
  let content;
  let sourcePath = source;

  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${source}`);
    content = await res.text();
    sourcePath = source;
  } else {
    // Treat as local file
    const absPath = resolvePath(process.cwd(), source);
    content = await readFile(absPath, 'utf8');
    sourcePath = absPath;
  }

  const parsed = parseContent(content, sourcePath);
  return { spec: parsed, sourcePath };
}

function parseContent(content, sourcePath) {
  if (sourcePath.endsWith('.json')) {
    return JSON.parse(content);
  }
  // yaml/yml or URL — try YAML first (superset of JSON)
  return yaml.load(content);
}

/**
 * Resolve a $ref pointer within a spec document.
 * Supports local (#/...) refs only (external file refs are v2).
 * @param {object} spec  the full parsed spec
 * @param {string} ref   e.g. "#/components/schemas/Foo"
 * @returns {object|null}
 */
export function resolveRef(spec, ref) {
  if (!ref || !ref.startsWith('#/')) return null;
  const parts = ref.slice(2).split('/').map(p => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  let node = spec;
  for (const part of parts) {
    if (node == null || typeof node !== 'object') return null;
    node = node[part];
  }
  return node ?? null;
}

/**
 * Deeply resolve all $ref entries in an object, returning the dereferenced copy.
 * Handles circular refs by tracking seen refs.
 * @param {object} obj   object to resolve
 * @param {object} spec  root spec document (for local $ref lookup)
 * @param {Set}    [seen] internal cycle tracker
 * @returns {object}
 */
export function resolveSchema(obj, spec, seen = new Set()) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => resolveSchema(item, spec, seen));

  if (obj.$ref) {
    if (seen.has(obj.$ref)) return {}; // break cycle
    seen = new Set([...seen, obj.$ref]);
    const resolved = resolveRef(spec, obj.$ref);
    return resolved ? resolveSchema(resolved, spec, seen) : obj;
  }

  const result = {};
  for (const [key, val] of Object.entries(obj)) {
    result[key] = resolveSchema(val, spec, seen);
  }
  return result;
}
