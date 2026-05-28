/**
 * ruleset.js — load & merge apinotes ruleset config.
 *
 * Search order (first found wins):
 *   1. --ruleset <path>
 *   2. apinotes.config.{js,mjs,cjs,yaml,yml,json} in cwd
 *   3. .apinotesrc.{yaml,yml,json} in cwd
 *   4. "apinotes" key in package.json
 *
 * Supported config schema:
 *   extends: recommended
 *   rules:
 *     rule-id: error | warn | info | off
 *   ignore:
 *     - "paths./internal/**"
 */

import { readFile } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import yaml from 'js-yaml';

// ---------------------------------------------------------------------------
// Built-in preset: "recommended" — mirrors server defaults
// ---------------------------------------------------------------------------
const PRESETS = {
  recommended: {
    rules: {
      'new-endpoint':                         'info',
      'endpoint-removed':                     'error',
      'response-required-property-removed':   'error',
      'response-required-property-added':     'info',
      'response-optional-property-removed':   'warn',
      'response-optional-property-added':     'info',
      'new-required-request-property':        'error',
      'required-request-property-removed':    'warn',
      'optional-request-property-removed':    'warn',
      'optional-request-property-added':      'info',
      'parameter-required-changed':           'warn',
      'parameter-removed':                    'error',
      'parameter-added-required':             'error',
      'parameter-added-optional':             'info',
      'response-type-changed':                'error',
      'request-type-changed':                 'error',
      'response-status-removed':              'error',
      'response-status-added':                'info',
      'enum-value-removed':                   'error',
      'enum-value-added':                     'info',
      'default-value-changed':                'warn',
      'constraint-changed':                   'warn',
      'format-changed':                       'warn',
      'nullable-changed':                     'warn',
      'operationId-changed':                  'warn',
      'description-changed':                  'info',
      'response-property-type-changed':       'error',
      'request-property-type-changed':        'error',
    },
    ignore: [],
  },
};

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

const CANDIDATE_FILES = [
  'apinotes.config.js',
  'apinotes.config.mjs',
  'apinotes.config.cjs',
  'apinotes.config.yaml',
  'apinotes.config.yml',
  'apinotes.config.json',
  '.apinotesrc.yaml',
  '.apinotesrc.yml',
  '.apinotesrc.json',
];

async function readConfigFile(filePath) {
  const content = await readFile(filePath, 'utf8');
  if (filePath.endsWith('.json')) return JSON.parse(content);
  if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) return yaml.load(content);
  // .js/.mjs/.cjs — dynamic import
  const { default: mod } = await import(filePath);
  return mod;
}

async function findConfigInPackageJson(cwd) {
  const pkgPath = resolvePath(cwd, 'package.json');
  if (!existsSync(pkgPath)) return null;
  try {
    const content = await readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(content);
    return pkg.apinotes ?? null;
  } catch {
    return null;
  }
}

/**
 * Load and merge the ruleset config.
 * @param {string|null} rulesetPath  explicit --ruleset path (or null)
 * @param {string}      [cwd]        working directory to search
 * @returns {Promise<{ rules: object, ignore: string[] }>}
 */
export async function loadRuleset(rulesetPath = null, cwd = process.cwd()) {
  let raw = null;

  if (rulesetPath) {
    const abs = resolvePath(cwd, rulesetPath);
    raw = await readConfigFile(abs);
  } else {
    // Search candidate files
    for (const name of CANDIDATE_FILES) {
      const candidate = resolvePath(cwd, name);
      if (existsSync(candidate)) {
        raw = await readConfigFile(candidate);
        break;
      }
    }
    // Fallback: package.json "apinotes" key
    if (!raw) {
      raw = await findConfigInPackageJson(cwd);
    }
  }

  if (!raw) {
    // Default to "recommended" preset
    return mergeWithPreset({ extends: 'recommended', rules: {}, ignore: [] });
  }

  return mergeWithPreset(raw);
}

function mergeWithPreset(config) {
  const preset = PRESETS[config.extends] ?? PRESETS.recommended;
  return {
    rules: { ...preset.rules, ...(config.rules || {}) },
    ignore: [...(preset.ignore || []), ...(config.ignore || [])],
  };
}
