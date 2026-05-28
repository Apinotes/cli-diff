/**
 * json.js — machine-readable JSON formatter.
 * Schema version 1.
 */

/**
 * @param {object} result
 * @returns {string}
 */
export function formatJson(result) {
  const output = {
    schemaVersion: 1,
    generatedAt: result.meta?.generatedAt ?? new Date().toISOString(),
    tool: result.meta?.tool ?? 'apinotes',
    ...(result.meta?.specA != null ? { specA: result.meta.specA } : {}),
    ...(result.meta?.specB != null ? { specB: result.meta.specB } : {}),
    ...(result.meta?.spec != null ? { spec: result.meta.spec } : {}),
    summary: result.summary,
    ...(result.changes != null ? { changes: result.changes } : {}),
    ...(result.issues != null ? { issues: result.issues } : {}),
  };
  return JSON.stringify(output, null, 2);
}
