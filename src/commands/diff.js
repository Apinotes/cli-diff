/**
 * diff.js — `apinotes diff` command handler.
 */

import { writeFile } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import process from 'node:process';
import { loadSpec } from '../core/loader.js';
import { diffSpecs } from '../core/diffEngine.js';
import { readSpecAtRef } from '../core/gitBaseline.js';
import { loadRuleset } from '../config/ruleset.js';
import { formatText } from '../formatters/text.js';
import { formatJson } from '../formatters/json.js';
import { formatSarif } from '../formatters/sarif.js';
import { formatJunit } from '../formatters/junit.js';
import { computeExitCode, ExitCode, exitWithError } from '../utils/exit.js';
import logger from '../utils/logger.js';

const FORMATTERS = {
  text: formatText,
  json: formatJson,
  sarif: formatSarif,
  junit: formatJunit,
};

/**
 * Run the diff command.
 * @param {string} oldSpec  path or URL to old spec
 * @param {string|undefined} newSpec  path or URL to new spec
 * @param {object} options  commander options
 */
export async function runDiff(oldSpec, newSpec, options) {
  try {
    // -- Load specs ---------------------------------------------------------
    let specASource, specBSource;

    // Load spec A (old)
    const { spec: specA, sourcePath: pathA } = await loadSpec(oldSpec).catch(err => {
      exitWithError(`Cannot load spec "${oldSpec}": ${err.message}`, ExitCode.USAGE_ERROR);
    });

    // Load spec B (new) — either newSpec arg or --base git ref
    if (options.base) {
      const { spec: specB, sourcePath: pathB } = await readSpecAtRef(options.base, oldSpec).catch(err => {
        exitWithError(`Cannot read git baseline "${options.base}:${oldSpec}": ${err.message}`, ExitCode.USAGE_ERROR);
      });
      // When using --base, specA is current (new) and specB is git ref (old)
      specASource = pathB;
      specBSource = pathA;
      return await _runDiff(specB, specA, pathB, pathA, options);
    } else if (newSpec) {
      const { spec: specB, sourcePath: pathB } = await loadSpec(newSpec).catch(err => {
        exitWithError(`Cannot load spec "${newSpec}": ${err.message}`, ExitCode.USAGE_ERROR);
      });
      return await _runDiff(specA, specB, pathA, pathB, options);
    } else {
      exitWithError('Provide a second spec file or use --base <ref> to compare against a git ref.', ExitCode.USAGE_ERROR);
    }
  } catch (err) {
    if (err.__apinotes_exit) throw err;
    logger.error(err.message);
    process.exit(ExitCode.INTERNAL_ERROR);
  }
}

async function _runDiff(specA, specB, pathA, pathB, options) {
  // Load ruleset
  const ruleset = await loadRuleset(options.ruleset ?? null).catch(err => {
    exitWithError(`Cannot load ruleset: ${err.message}`, ExitCode.USAGE_ERROR);
  });

  // Run the diff engine
  const { changes, summary } = diffSpecs(specA, specB, {
    rules: ruleset.rules,
    ignore: ruleset.ignore,
  });

  // Check for remote mode (paid feature hook)
  // TODO: if APINOTES_API_KEY is set and --remote flag is passed,
  //   POST to https://api.apinotes.io/api/v1/diff instead of local engine.

  const meta = {
    specA: pathA,
    specB: pathB,
    generatedAt: new Date().toISOString(),
    tool: 'apinotes',
    toolVersion: '0.1.0',
  };

  const result = { changes, summary, meta };

  // Format output
  const fmt = options.format ?? 'text';
  const formatter = FORMATTERS[fmt];
  if (!formatter) {
    exitWithError(`Unknown format "${fmt}". Valid formats: text, json, sarif, junit`, ExitCode.USAGE_ERROR);
  }

  const output = formatter(result, { color: options.color !== false });

  // Write output
  if (options.output) {
    await writeFile(resolvePath(process.cwd(), options.output), output, 'utf8');
    logger.info(`Report written to ${options.output}`);
  } else {
    process.stdout.write(output + '\n');
  }

  // Exit code
  const exitCode = computeExitCode(summary, options.failOn ?? 'none');
  process.exit(exitCode);
}
