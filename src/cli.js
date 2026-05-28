/**
 * cli.js — commander setup, registers all commands.
 */

import { Command } from 'commander';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { runDiff } from './commands/diff.js';
import { runLint } from './commands/lint.js';

// Read version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8'));

const program = new Command();

program
  .name('apinotes')
  .description('OpenAPI diff & lint CLI — detect breaking changes locally and in CI.')
  .version(pkg.version, '-v, --version');

// ---------------------------------------------------------------------------
// diff command
// ---------------------------------------------------------------------------
program
  .command('diff <oldSpec> [newSpec]')
  .description('Compare two OpenAPI specs and report changes.')
  .option('-b, --base <ref>',        'Compare <oldSpec> (current) against the same path at git <ref> (e.g. main)')
  .option('-f, --format <fmt>',      'Output format: text (default), json, sarif, junit', 'text')
  .option('-r, --ruleset <path>',    'Path to a ruleset config file')
  .option('--fail-on <level>',       'Exit with non-zero code: none | info | warning | breaking', 'none')
  .option('--no-color',              'Disable ANSI colors')
  .option('-o, --output <path>',     'Write report to file instead of stdout')
  .action(async (oldSpec, newSpec, options) => {
    await runDiff(oldSpec, newSpec, options);
  });

// ---------------------------------------------------------------------------
// lint command
// ---------------------------------------------------------------------------
program
  .command('lint <spec>')
  .description('Lint a single OpenAPI spec for structural and semantic issues.')
  .option('-f, --format <fmt>',      'Output format: text (default), json, sarif, junit', 'text')
  .option('-r, --ruleset <path>',    'Path to a ruleset config file')
  .option('--fail-on <level>',       'Exit with non-zero code: none | info | warning | breaking', 'none')
  .option('--no-color',              'Disable ANSI colors')
  .option('-o, --output <path>',     'Write report to file instead of stdout')
  .action(async (spec, options) => {
    await runLint(spec, options);
  });

program.parse(process.argv);
