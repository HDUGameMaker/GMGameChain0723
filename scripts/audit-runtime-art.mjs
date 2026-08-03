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

function firstExisting(...paths) {
  return paths.filter(Boolean).find(relativePath => existsSync(resolve(projectRoot, relativePath)))
    || paths.find(Boolean)
    || '';
}

function buildRecord({ contentType, contentId, configPath, resolvedPath, runtimeSurface, minSize, allowedExtensions = null }) {
  const inspected = inspectAsset(resolvedPath);
  let status = 'ok';
  if (!inspected.exists) status = 'missing';
  else if (!inspected.decodes) status = 'corrupt';
  else if (allowedExtensions && !allowedExtensions.includes(extname(resolvedPath).toLowerCase())) status = 'fallback';
  else if (extname(resolvedPath).toLowerCase() !== '.svg' && Math.min(inspected.width, inspected.height) < minSize) status = 'too-small';
  return { contentType, contentId, configPath, resolvedPath, ...inspected, runtimeSurface, status };
}

export async function auditRuntimeArt({ militaryOnly = false } = {}) {
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

  let records = [
    ...buildings.map(({ record, configPath }) => buildRecord({
      contentType: 'building', contentId: record.id, configPath,
      resolvedPath: record.imageDetail || '', runtimeSurface: 'building-detail', minSize: 256,
      allowedExtensions: ['.png', '.webp']
    })),
    ...units.map(({ record, configPath }) => buildRecord({
      contentType: 'unit', contentId: record.id, configPath,
      resolvedPath: record.cardArt || `assets/unit-cards/${record.id}.png`,
      runtimeSurface: 'training-card', minSize: 200, allowedExtensions: ['.png', '.webp']
    })),
    ...Object.entries(resourceTypes).map(([id, definition]) => buildRecord({
      contentType: 'resource', contentId: id, configPath: 'config/resource-nodes.json',
      resolvedPath: definition.mapArt || '', runtimeSurface: 'map-resource-node', minSize: 128,
      allowedExtensions: ['.png', '.webp']
    }))
  ];

  if (militaryOnly) {
    const militaryBuildings = buildings.filter(({ record }) => {
      const fn = record.uniqueFunction || {};
      return (Array.isArray(fn.trainsBranches) && fn.trainsBranches.length > 0)
        || (Array.isArray(fn.armyAssemblyDomains) && fn.armyAssemblyDomains.length > 0)
        || Number(fn.garrisonCapacity) > 0;
    });
    const buildingArt = record => firstExisting(
      record.imageDetail,
      `assets/buildings/historical-details/${record.id}.png`,
      record.mapIcon,
      `assets/historical-icons/buildings/${record.id}.svg`
    );
    const buildingIcon = record => firstExisting(
      record.mapIcon,
      `assets/historical-icons/buildings/${record.id}.svg`,
      record.imageDetail,
      `assets/buildings/historical-details/${record.id}.png`
    );
    const unitCard = record => firstExisting(record.cardArt, `assets/unit-cards/${record.id}.png`);
    const unitIcon = record => firstExisting(
      String(record.icon || '').includes('/') ? record.icon : '',
      `assets/historical-icons/units/${record.id}.svg`,
      record.cardArt,
      `assets/unit-cards/${record.id}.png`
    );
    records = [];
    for (const { record, configPath } of militaryBuildings) {
      const fn = record.uniqueFunction || {};
      const roles = [];
      if (fn.trainsBranches?.length) roles.push(['training-building', 'training-building-map']);
      if (fn.armyAssemblyDomains?.length) roles.push(['assembly-header', 'assembly-spawn-rule']);
      if (Number(fn.garrisonCapacity) > 0) roles.push(['garrison-building', 'garrison-building-map']);
      for (const [detailSurface, mapSurface] of roles) {
        records.push(buildRecord({
          contentType: 'military-building', contentId: record.id, configPath,
          resolvedPath: buildingArt(record), runtimeSurface: detailSurface, minSize: 1,
          allowedExtensions: ['.png', '.webp', '.svg']
        }));
        records.push(buildRecord({
          contentType: 'military-building', contentId: record.id, configPath,
          resolvedPath: buildingIcon(record), runtimeSurface: mapSurface, minSize: 1,
          allowedExtensions: ['.png', '.webp', '.svg']
        }));
      }
    }
    for (const { record, configPath } of units) {
      for (const runtimeSurface of ['training-card', 'reserve-card', 'army-composition-card']) {
        records.push(buildRecord({
          contentType: 'military-unit', contentId: record.id, configPath,
          resolvedPath: unitCard(record), runtimeSurface, minSize: 200,
          allowedExtensions: ['.png', '.webp']
        }));
      }
      records.push(buildRecord({
        contentType: 'military-unit', contentId: record.id, configPath,
        resolvedPath: unitIcon(record), runtimeSurface: 'map-army-token', minSize: 1,
        allowedExtensions: ['.png', '.webp', '.svg']
      }));
    }
  }

  if (!militaryOnly) {
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
  }

  const statuses = {};
  for (const record of records) statuses[record.status] = (statuses[record.status] || 0) + 1;
  if (statuses.corrupt) statuses.decode_error = statuses.corrupt;
  const surfaces = {};
  for (const record of records) surfaces[record.runtimeSurface] = (surfaces[record.runtimeSurface] || 0) + 1;
  return {
    generated: new Date().toISOString(),
    summary: { total: records.length, statuses },
    statuses,
    surfaces,
    records
  };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const report = await auditRuntimeArt({ militaryOnly: process.argv.includes('--military-only') });
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex >= 0 && process.argv[outputIndex + 1]) {
    writeFileSync(resolve(projectRoot, process.argv[outputIndex + 1]), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  const output = process.argv.includes('--compact')
    ? { generated: report.generated, summary: report.summary, statuses: report.statuses, surfaces: report.surfaces }
    : report;
  console.log(JSON.stringify(output, null, process.argv.includes('--compact') ? 0 : 2));
  if (Object.keys(report.summary.statuses).some(status => status !== 'ok')) process.exitCode = 1;
}
