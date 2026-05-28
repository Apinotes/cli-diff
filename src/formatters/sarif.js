/**
 * sarif.js — SARIF 2.1.0 formatter for GitHub code-scanning.
 *
 * Spec: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
 * GitHub code-scanning ingestion requirements followed.
 */

const SARIF_SCHEMA = 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json';
const SARIF_VERSION = '2.1.0';

function severityToSarifLevel(severity, breaking) {
  if (severity === 'ERR' || breaking) return 'error';
  if (severity === 'WARN') return 'warning';
  return 'note';
}

function buildRules(items) {
  const ruleMap = new Map();
  for (const item of items) {
    if (!ruleMap.has(item.ruleId)) {
      ruleMap.set(item.ruleId, {
        id: item.ruleId,
        name: item.ruleId,
        shortDescription: { text: item.ruleId },
        properties: {
          tags: ['openapi', item.kind ?? 'general'].filter(Boolean),
        },
      });
    }
  }
  return [...ruleMap.values()];
}

function buildResults(items, specUri) {
  return items.map(item => {
    const uri = specUri ?? 'openapi.yaml';
    return {
      ruleId: item.ruleId,
      level: severityToSarifLevel(item.severity, item.breaking),
      message: {
        text: item.message ?? item.ruleId,
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: {
              uri,
              uriBaseId: '%SRCROOT%',
            },
          },
        },
      ],
      properties: {
        ...(item.path ? { apiPath: item.path } : {}),
        ...(item.method ? { method: item.method } : {}),
        ...(item.breaking != null ? { breaking: item.breaking } : {}),
      },
    };
  });
}

/**
 * Format a diff or lint result as SARIF 2.1.0.
 * @param {object} result
 * @returns {string}
 */
export function formatSarif(result) {
  const isDiff = Array.isArray(result.changes);
  const items = isDiff ? (result.changes ?? []) : (result.issues ?? []);
  const specUri = result.meta?.specA ?? result.meta?.spec ?? 'openapi.yaml';

  const sarif = {
    $schema: SARIF_SCHEMA,
    version: SARIF_VERSION,
    runs: [
      {
        tool: {
          driver: {
            name: 'apinotes',
            version: result.meta?.toolVersion ?? '0.1.0',
            informationUri: 'https://apinotes.io/openapi-diff',
            rules: buildRules(items),
          },
        },
        results: buildResults(items, specUri),
        artifacts: [
          {
            location: { uri: specUri, uriBaseId: '%SRCROOT%' },
          },
          ...(result.meta?.specB
            ? [{ location: { uri: result.meta.specB, uriBaseId: '%SRCROOT%' } }]
            : []),
        ],
        invocations: [
          {
            executionSuccessful: true,
            endTimeUtc: result.meta?.generatedAt ?? new Date().toISOString(),
          },
        ],
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}
