/**
 * text.js — colorized human-readable formatter (default).
 * Uses chalk v5 (ESM).
 */

import chalk, { Chalk } from 'chalk';
import process from 'node:process';

const USE_COLOR = process.stdout.isTTY !== false;

function sev(change) {
  return change.severity ?? (change.breaking ? 'ERR' : 'INFO');
}

/**
 * Format a diff result as colorized text.
 *
 * @param {{
 *   changes?: import('../core/diffEngine.js').Change[],
 *   issues?:  object[],
 *   summary:  object,
 *   meta:     { specA?: string, specB?: string, spec?: string, generatedAt: string, tool: string }
 * }} result
 * @param {{ color?: boolean }} [opts]
 * @returns {string}
 */
export function formatText(result, opts = {}) {
  const useColor = opts.color !== false && USE_COLOR;
  const c = useColor ? chalk : new Chalk({ level: 0 });

  const lines = [];
  const isDiff = Array.isArray(result.changes);

  // Header
  if (isDiff) {
    const a = result.meta?.specA ?? 'old';
    const b = result.meta?.specB ?? 'new';
    lines.push(c.bold(`Comparing ${a} → ${b}`));
  } else {
    lines.push(c.bold(`Linting ${result.meta?.spec ?? 'spec'}`));
  }
  lines.push('');

  // Items
  const items = isDiff ? (result.changes || []) : (result.issues || []);
  if (items.length === 0) {
    lines.push(c.green('✓ No issues found.'));
  } else {
    for (const item of items) {
      const severity = item.severity ?? (item.breaking ? 'ERR' : 'INFO');
      const breaking = item.breaking;
      const ruleId = item.ruleId ?? '';
      const message = item.message ?? '';
      const location = isDiff
        ? `${(item.method ?? '').toUpperCase()} ${item.path ?? ''}`
        : (item.path ?? '');

      let icon, label, color;
      if (severity === 'ERR' || breaking) {
        icon = '✗'; label = breaking ? 'BREAKING' : 'ERROR  '; color = c.red.bold;
      } else if (severity === 'WARN') {
        icon = '⚠'; label = 'WARNING '; color = c.yellow;
      } else {
        icon = '✓'; label = 'ADDED   '; color = c.green;
        if (severity === 'INFO' && !message.toLowerCase().includes('add') && !message.toLowerCase().includes('new')) {
          label = 'INFO    ';
        }
      }

      const iconStr = color(`${icon} ${label}`);
      const locationStr = c.cyan(location.padEnd(30));
      const msgStr = message;
      const ruleStr = c.gray(`[${ruleId}]`);

      lines.push(`${iconStr}  ${locationStr}  ${msgStr.padEnd(45)}  ${ruleStr}`);
    }
  }

  lines.push('');

  // Summary
  if (isDiff) {
    const s = result.summary;
    const parts = [];
    if (s.breaking > 0) parts.push(c.red.bold(`${s.breaking} breaking`));
    if (s.warnings > 0) parts.push(c.yellow(`${s.warnings} warning${s.warnings !== 1 ? 's' : ''}`));
    if (s.info > 0) parts.push(c.green(`${s.info} info`));
    if (parts.length === 0) parts.push(c.green('no issues'));
    lines.push(`Summary: ${parts.join(', ')}`);
  } else {
    const s = result.summary;
    const parts = [];
    if (s.errors > 0) parts.push(c.red.bold(`${s.errors} error${s.errors !== 1 ? 's' : ''}`));
    if (s.warnings > 0) parts.push(c.yellow(`${s.warnings} warning${s.warnings !== 1 ? 's' : ''}`));
    if (s.info > 0) parts.push(c.green(`${s.info} info`));
    if (parts.length === 0) parts.push(c.green('no issues'));
    lines.push(`Summary: ${parts.join(', ')}`);
  }

  return lines.join('\n');
}
