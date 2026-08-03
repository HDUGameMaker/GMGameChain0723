#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const loadJson = relativePath => JSON.parse(readFileSync(resolve(projectRoot, relativePath), 'utf8'));

function mergeUniqueWithSource(collections) {
  const merged = new Map();
  for (const [configPath, records] of collections) {
    for (const record of records || []) {
      if (!merged.has(record.id)) merged.set(record.id, { record, configPath });
    }
  }
  return [...merged.values()];
}

function readPngSize(bytes) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value)) return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

function readSvgSize(bytes) {
  const source = bytes.toString('utf8', 0, Math.min(bytes.length, 16_384));
  if (!/<svg\b/i.test(source) || !/<\/svg>/i.test(source)) return null;
  const viewBox = source.match(/viewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/i);
  if (viewBox) return { width: Number(viewBox[1]), height: Number(viewBox[2]) };
  const width = source.match(/\bwidth\s*=\s*["']([\d.]+)/i);
  const height = source.match(/\bheight\s*=\s*["']([\d.]+)/i);
  return width && height ? { width: Number(width[1]), height: Number(height[1]) } : null;
}

function inspectAsset(relativePath) {
  if (!relativePath) return { exists: false, decodes: false, width: 0, height: 0, sha256: '' };
  const absolutePath = resolve(projectRoot, relativePath);
  if (!existsSync(absolutePath)) return { exists: false, decodes: false, width: 0, height: 0, sha256: '' };
  const bytes = readFileSync(absolutePath);
  const extension = extname(absolutePath).toLowerCase();
  const size = extension === '.png' ? readPngSize(bytes) : extension === '.svg' ? readSvgSize(bytes) : null;
  return {
    exists: true,
    decodes: Boolean(size),
    width: size?.width || 0,
    height: size?.height || 0,
    sha256: createHash('sha256').update(bytes).digest('hex')
  };
}

function buildRecord({ contentType, contentId, configPath, resolvedPath, runtimeSurface, minSize }) {
  const inspected = inspectAsset(resolvedPath);
  let status = 'ok';
  if (!inspected.exists) status = 'missing';
  else if (!inspected.decodes) status = 'corrupt';
  else if (extname(resolvedPath).toLowerCase() !== '.svg' && Math.min(inspected.width, inspected.height) < minSize) status = 'too-small';
  return { contentType, contentId, configPath, resolvedPath, ...inspected, runtimeSurface, status };
}

export async function auditRuntimeArt() {
  const buildings = mergeUniqueWithSource([
    ['config/buildings.json', loadJson('config/buildings.json')],
    ['config/ea_integration.json', loadJson('config/ea_integration.json').buildings],
    ['config/historical_content.json', loadJson('config/historical_content.json').buildings]
  ]);
  const units = mergeUniqueWithSource([
    ['config/enemies.json', loadJson('config/enemies.json').units],
    ['config/ea_integration.json', loadJson('config/ea_integration.json').units],
    ['config/historical_content.json', loadJson('config/historical_content.json').units]
  ]);
  const resourceTypes = loadJson('config/resource-nodes.json').types;

  const records = [
    ...buildings.map(({ record, configPath }) => buildRecord({
      contentType: 'building', contentId: record.id, configPath,
      resolvedPath: record.imageDetail || '', runtimeSurface: 'building-detail', minSize: 256
    })),
    ...units.map(({ record, configPath }) => buildRecord({
      contentType: 'unit', contentId: record.id, configPath,
      resolvedPath: record.cardArt || `assets/unit-cards/${record.id}.png`,
      runtimeSurface: 'training-card', minSize: 200
    })),
    ...Object.entries(resourceTypes).map(([id, definition]) => buildRecord({
      contentType: 'resource', contentId: id, configPath: 'config/resource-nodes.json',
      resolvedPath: definition.mapArt || '', runtimeSurface: 'map-resource-node', minSize: 128
    }))
  ];

  const duplicateKeys = new Map();
  for (const record of records.filter(candidate => candidate.status === 'ok')) {
    const key = `${record.contentType}:${record.sha256}`;
    if (!duplicateKeys.has(key)) duplicateKeys.set(key, []);
    duplicateKeys.get(key).push(record);
  }
  for (const duplicates of duplicateKeys.values()) {
    if (duplicates.length < 2) continue;
    for (const record of duplicates) record.status = 'duplicate';
  }

  const statuses = {};
  for (const record of records) statuses[record.status] = (statuses[record.status] || 0) + 1;
  return {
    generated: new Date().toISOString(),
    summary: { total: records.length, statuses },
    records
  };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const report = await auditRuntimeArt();
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex >= 0 && process.argv[outputIndex + 1]) {
    writeFileSync(resolve(projectRoot, process.argv[outputIndex + 1]), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify(report, null, process.argv.includes('--compact') ? 0 : 2));
  if (Object.keys(report.summary.statuses).some(status => status !== 'ok')) process.exitCode = 1;
}
