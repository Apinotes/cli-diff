/**
 * gitBaseline.js — read a spec from a specific git ref.
 * Uses `git show <ref>:<path>` via child_process (no extra deps).
 */

import { spawnSync } from 'node:child_process';
import { resolve as resolvePath, relative } from 'node:path';
import yaml from 'js-yaml';

/**
 * Read the content of a file at a specific git ref.
 * @param {string} ref   git ref, e.g. "main", "HEAD~1", "v1.0.0"
 * @param {string} filePath  path to the spec file (absolute or relative to cwd)
 * @returns {Promise<{ spec: object, sourcePath: string }>}
 */
export async function readSpecAtRef(ref, filePath) {
  const absPath = resolvePath(process.cwd(), filePath);
  // git show expects a path relative to the repo root
  const relPath = relative(process.cwd(), absPath).replace(/\\/g, '/');

  // Use spawnSync with an args array to avoid any shell injection risk —
  // ref and relPath are passed as discrete arguments, not interpolated into
  // a shell string.
  const result = spawnSync('git', ['show', `${ref}:${relPath}`], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const msg = result.stderr ? result.stderr.trim() : (result.error?.message ?? 'unknown error');
    throw new Error(`git show "${ref}:${relPath}" failed: ${msg}`);
  }

  const content = result.stdout;
  const spec = parseContent(content, relPath);
  return { spec, sourcePath: `${ref}:${relPath}` };
}

function parseContent(content, filePath) {
  if (filePath.endsWith('.json')) {
    return JSON.parse(content);
  }
  return yaml.load(content);
}
