import assert from 'node:assert/strict';
import test from 'node:test';

import { auditRuntimeArt } from '../../scripts/audit-runtime-art.mjs';

test('all runtime buildings, units and common resource nodes resolve to unique usable art', async () => {
  const report = await auditRuntimeArt();
  const byType = {};
  for (const record of report.records) (byType[record.contentType] ||= []).push(record);

  assert.equal(byType.building.length, 111);
  assert.equal(byType.unit.length, 138);
  assert.equal(byType.resource.length, 4);
  assert.deepEqual(report.summary.statuses, { ok: 253 });

  for (const record of report.records) {
    assert.equal(record.status, 'ok', `${record.contentType}:${record.contentId} -> ${record.status}`);
    assert.equal(record.exists, true, record.resolvedPath);
    assert.equal(record.decodes, true, record.resolvedPath);
    assert.match(record.sha256, /^[a-f0-9]{64}$/);
  }
});
