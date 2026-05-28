/**
 * Exit codes:
 *   0 – clean (no findings, or all below threshold)
 *   1 – findings at or above the --fail-on threshold (warning / info)
 *   2 – breaking changes present and --fail-on=breaking
 *   3 – usage / input / parse error
 *   4 – internal / unexpected error
 */

export const ExitCode = {
  OK: 0,
  FINDINGS: 1,
  BREAKING: 2,
  USAGE_ERROR: 3,
  INTERNAL_ERROR: 4,
};

/**
 * Compute the process exit code given a summary and the --fail-on level.
 * @param {{ breaking: number, warnings: number, info: number }} summary
 * @param {'none'|'info'|'warning'|'breaking'} failOn
 * @returns {number}
 */
export function computeExitCode(summary, failOn = 'none') {
  if (failOn === 'none') return ExitCode.OK;

  if (summary.breaking > 0 && failOn === 'breaking') return ExitCode.BREAKING;
  if (summary.breaking > 0 && (failOn === 'warning' || failOn === 'info')) return ExitCode.FINDINGS;
  if (summary.warnings > 0 && (failOn === 'warning' || failOn === 'info')) return ExitCode.FINDINGS;
  if (summary.info > 0 && failOn === 'info') return ExitCode.FINDINGS;

  return ExitCode.OK;
}

export function exitWithError(message, code = ExitCode.USAGE_ERROR) {
  console.error(`Error: ${message}`);
  process.exit(code);
}
