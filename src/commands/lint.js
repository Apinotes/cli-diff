/**
 * lint.js — `apinotes lint` command handler.
 */

import { writeFile } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import process from 'node:process';
import { loadSpec } from '../core/loader.js';
import { lintSpec } from '../core/linter.js';
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
 * Run the lint command.
 * @param {string} specPath  path or URL to spec
 * @param {object} options   commander options
 */
export async function runLint(specPath, options) {
  try {
    // Load spec
    const { spec, sourcePath } = await loadSpec(specPath).catch(err => {
      exitWithError(`Cannot load spec "${specPath}": ${err.message}`, ExitCode.USAGE_ERROR);
    });

    // Load ruleset
    const ruleset = await loadRuleset(options.ruleset ?? null).catch(err => {
      exitWithError(`Cannot load ruleset: ${err.message}`, ExitCode.USAGE_ERROR);
    });

    // Run linter
    const { issues, summary } = lintSpec(spec, { rules: ruleset.rules });

    const meta = {
      spec: sourcePath,
      generatedAt: new Date().toISOString(),
      tool: 'apinotes',
      toolVersion: '0.1.0',
    };

    const result = { issues, summary, meta };

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

    // Exit code — map lint severity to diff summary shape
    const diffSummary = {
      breaking: summary.errors,
      warnings: summary.warnings,
      info: summary.info,
    };

    const exitCode = computeExitCode(diffSummary, options.failOn ?? 'none');
    process.exit(exitCode);
  } catch (err) {
    if (err.__apinotes_exit) throw err;
    logger.error(err.message);
    process.exit(ExitCode.INTERNAL_ERROR);
  }
}
