# @apinotes/cli

> **OpenAPI diff & lint CLI** — detect breaking changes locally and in CI.  
> The actively-maintained alternative to the now-archived Optic CLI.

[![CI](https://github.com/Misterthomas/ApiNotes_diff_cli_main/actions/workflows/ci.yml/badge.svg)](https://github.com/Misterthomas/ApiNotes_diff_cli_main/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Website:** https://apinotes.io/openapi-diff

---

## Install

```bash
# Global install
npm install -g @apinotes/cli

# Or run without installing
npx @apinotes/cli --help
```

**Requirements:** Node.js >= 18

---

## Quickstart

```bash
# Compare two local OpenAPI files
apinotes diff ./specs/v1.yaml ./specs/v2.yaml

# Compare current spec against the main branch (Git-aware)
apinotes diff ./openapi.yaml --base main

# Output machine-readable JSON for CI pipelines
apinotes diff old.yaml new.yaml --format json > report.json

# Fail the build if breaking changes are found
apinotes diff old.yaml new.yaml --fail-on breaking

# Use a custom ruleset
apinotes diff old.yaml new.yaml --ruleset ./apinotes.config.yaml

# Lint a single spec (no diff)
apinotes lint ./openapi.yaml
```

### Example output

```
Comparing v1.yaml -> v2.yaml

BREAKING  GET /users           response field `email` removed       [response-required-property-removed]
WARNING   POST /orders         parameter `currency` made required    [parameter-required-changed]
ADDED     GET /products/{id}   new endpoint                          [new-endpoint]

Summary: 1 breaking, 1 warning, 1 added
```

---

## Commands

### `apinotes diff <oldSpec> [newSpec]`

Compare two OpenAPI specs and report changes.

| Option | Description | Default |
|---|---|---|
| `-b, --base <ref>` | Compare `<oldSpec>` against the same path at git `<ref>` (e.g. `main`) | |
| `-f, --format <fmt>` | Output format: `text`, `json`, `sarif`, `junit` | `text` |
| `-r, --ruleset <path>` | Path to a ruleset config file | auto-detected |
| `--fail-on <level>` | Exit non-zero: `none`, `info`, `warning`, `breaking` | `none` |
| `--no-color` | Disable ANSI colors (also auto-disabled when not a TTY) | |
| `-o, --output <path>` | Write report to a file instead of stdout | |

### `apinotes lint <spec>`

Lint a single OpenAPI spec for structural and semantic issues.

| Option | Description | Default |
|---|---|---|
| `-f, --format <fmt>` | Output format: `text`, `json`, `sarif`, `junit` | `text` |
| `-r, --ruleset <path>` | Path to a ruleset config file | auto-detected |
| `--fail-on <level>` | Exit non-zero: `none`, `info`, `warning`, `breaking` | `none` |
| `--no-color` | Disable ANSI colors | |
| `-o, --output <path>` | Write report to a file instead of stdout | |

---

## Output formats

| Format | Description | Use case |
|---|---|---|
| `text` | Colorized, human-readable (default) | Terminal / code review |
| `json` | Stable JSON schema (`schemaVersion: 1`) | Custom CI pipelines, dashboards |
| `sarif` | SARIF 2.1.0 | GitHub code-scanning (upload as artifact) |
| `junit` | JUnit XML | Jenkins, GitLab, CircleCI test reports |

### JSON schema

```json
{
  "schemaVersion": 1,
  "generatedAt": "2024-01-01T00:00:00.000Z",
  "tool": "apinotes",
  "specA": "v1.yaml",
  "specB": "v2.yaml",
  "summary": { "breaking": 1, "warnings": 0, "info": 2, "added": 1 },
  "changes": [
    {
      "ruleId": "response-required-property-removed",
      "kind": "property-removed",
      "breaking": true,
      "severity": "ERR",
      "path": "/users",
      "method": "get",
      "direction": "response",
      "location": "response body email",
      "message": "response field `email` removed"
    }
  ]
}
```

---

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Clean — no findings, or all below `--fail-on` threshold |
| `1` | Findings at or above threshold (warnings / info) |
| `2` | Breaking changes present and `--fail-on=breaking` |
| `3` | Usage / input / parse error |
| `4` | Internal / unexpected error |

---

## Configuration file

Create one of the following (first found wins):

1. `--ruleset <path>`
2. `apinotes.config.{js,mjs,cjs,yaml,yml,json}` in working directory
3. `.apinotesrc.{yaml,yml,json}` in working directory
4. `"apinotes"` key in `package.json`

### Config schema

```yaml
# apinotes.config.yaml
extends: recommended   # built-in preset (default)

rules:
  # Override severity: error | warn | info | off
  new-required-request-property: error
  response-required-property-removed: error
  default-value-changed: off

ignore:
  - "paths./internal/**"    # ignore all paths starting with /internal/
  - "paths./health"         # ignore a specific path
```

### Available rules

| Rule ID | Default Severity | Breaking |
|---|---|---|
| `new-endpoint` | INFO | No |
| `endpoint-removed` | ERR | Yes |
| `response-required-property-removed` | ERR | Yes |
| `response-required-property-added` | INFO | No |
| `response-optional-property-removed` | WARN | No |
| `response-optional-property-added` | INFO | No |
| `new-required-request-property` | ERR | Yes |
| `required-request-property-removed` | WARN | No |
| `optional-request-property-removed` | WARN | No |
| `optional-request-property-added` | INFO | No |
| `parameter-required-changed` | WARN | Yes |
| `parameter-removed` | ERR | Yes |
| `parameter-added-required` | ERR | Yes |
| `parameter-added-optional` | INFO | No |
| `response-type-changed` | ERR | Yes |
| `request-type-changed` | ERR | Yes |
| `response-status-removed` | ERR | Yes |
| `response-status-added` | INFO | No |
| `enum-value-removed` | ERR | Yes |
| `enum-value-added` | INFO | No |
| `default-value-changed` | WARN | No |
| `constraint-changed` | WARN | No |
| `format-changed` | WARN | Yes |
| `nullable-changed` | WARN | No |
| `operationId-changed` | WARN | No |
| `description-changed` | INFO | No |
| `response-property-type-changed` | ERR | Yes |
| `request-property-type-changed` | ERR | Yes |

---

## Using in GitHub Actions

Point to the existing `apinotes/openapi-validate` action:

```yaml
# .github/workflows/api-diff.yml
name: API Diff

on: [pull_request]

jobs:
  diff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # required for --base comparison

      - name: Validate OpenAPI changes
        uses: apinotes/openapi-validate@v1
        with:
          spec: ./openapi.yaml
          base: main
          fail-on: breaking
```

Or use the CLI directly in any workflow:

```yaml
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npx @apinotes/cli diff openapi.yaml --base origin/main --fail-on breaking --format sarif -o results.sarif

      - name: Upload SARIF to GitHub code scanning
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: results.sarif
```

---

## Offline / privacy

**No telemetry by default.** All diff and lint logic runs locally on your machine. Your specs never leave your network.

The CLI optionally connects to `https://api.apinotes.io/api/v1` only when **both** conditions are met:
- `APINOTES_API_KEY` environment variable is set
- `--remote` flag is explicitly passed

This hook is reserved for future paid-tier features (hosted history, AI-powered change explanations). The default offline-only mode is always free.

---

## Development

```bash
git clone https://github.com/Misterthomas/ApiNotes_diff_cli_main.git
cd ApiNotes_diff_cli_main
npm install
npm test
node bin/apinotes.js diff test/fixtures/v1.yaml test/fixtures/v2.yaml
```

---

## License

[MIT](LICENSE) — free to use, modify, and distribute.

---

## Links

- Web tool: https://apinotes.io/openapi-diff
- Issues: https://github.com/Misterthomas/ApiNotes_diff_cli_main/issues
