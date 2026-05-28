/**
 * junit.js — JUnit XML formatter.
 * Compatible with Jenkins, GitLab, CircleCI test report widgets.
 *
 * One <testsuite> per rule ID, one <testcase> per finding.
 * Failures emit <failure> with the message.
 */

function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Format a diff or lint result as JUnit XML.
 * @param {object} result
 * @returns {string}
 */
export function formatJunit(result) {
  const isDiff = Array.isArray(result.changes);
  const items = isDiff ? (result.changes ?? []) : (result.issues ?? []);
  const timestamp = result.meta?.generatedAt ?? new Date().toISOString();
  const tool = result.meta?.tool ?? 'apinotes';

  // Group items by ruleId
  const byRule = new Map();
  for (const item of items) {
    const id = item.ruleId ?? 'unknown';
    if (!byRule.has(id)) byRule.set(id, []);
    byRule.get(id).push(item);
  }

  const failures = items.filter(i => i.severity === 'ERR' || i.breaking).length;
  const warnings = items.filter(i => i.severity === 'WARN').length;
  const total = items.length;

  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<testsuites name="${escapeXml(tool)}" tests="${total}" failures="${failures}" errors="0" time="0" timestamp="${escapeXml(timestamp)}">`);

  for (const [ruleId, ruleItems] of byRule) {
    const ruleFailures = ruleItems.filter(i => i.severity === 'ERR' || i.breaking).length;
    lines.push(`  <testsuite name="${escapeXml(ruleId)}" tests="${ruleItems.length}" failures="${ruleFailures}" errors="0" time="0">`);

    for (const item of ruleItems) {
      const name = isDiff
        ? `${(item.method ?? '').toUpperCase()} ${item.path ?? ''} — ${item.message ?? ''}`
        : (item.message ?? ruleId);
      const isFailure = item.severity === 'ERR' || item.breaking;

      lines.push(`    <testcase name="${escapeXml(name)}" classname="${escapeXml(ruleId)}">`);
      if (isFailure) {
        lines.push(`      <failure type="${escapeXml(item.severity ?? 'ERR')}" message="${escapeXml(item.message ?? '')}"/>`);
      }
      lines.push(`    </testcase>`);
    }

    lines.push('  </testsuite>');
  }

  // If no issues, emit a passing test case
  if (items.length === 0) {
    lines.push(`  <testsuite name="apinotes" tests="1" failures="0" errors="0" time="0">`);
    lines.push(`    <testcase name="no issues found" classname="apinotes"/>`);
    lines.push(`  </testsuite>`);
  }

  lines.push('</testsuites>');
  return lines.join('\n');
}
