#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditRuntimeArt } from './audit-runtime-art.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDirectory = path.join(projectRoot, 'assets');
const outputFile = path.join(assetsDirectory, 'manifest.json');
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.bmp']);

function scanDirectory(directory, results = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) scanDirectory(absolutePath, results);
    else if (entry.isFile() && imageExtensions.has(path.extname(entry.name).toLowerCase())) {
      results.push(path.relative(assetsDirectory, absolutePath).replaceAll('\\', '/'));
    }
  }
  return results;
}

function categorize(files) {
  const categories = {};
  for (const file of files) (categories[path.posix.dirname(file)] ||= []).push(file);
  return categories;
}

function describeFile(relativePath) {
  const absolutePath = path.join(assetsDirectory, relativePath);
  const bytes = fs.readFileSync(absolutePath);
  return {
    path: relativePath,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex')
  };
}

async function generate() {
  if (!fs.existsSync(assetsDirectory)) throw new Error(`assets directory does not exist: ${assetsDirectory}`);
  const files = scanDirectory(assetsDirectory).sort();
  const runtimeArt = await auditRuntimeArt();
  const manifest = {
    generated: new Date().toISOString(),
    basePath: 'assets/',
    totalFiles: files.length,
    categories: categorize(files),
    files,
    integrity: files.map(describeFile),
    runtimeArtSummary: runtimeArt.summary
  };
  fs.writeFileSync(outputFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Asset manifest generated: ${outputFile}`);
  console.log(`Images: ${files.length}; runtime art: ${JSON.stringify(runtimeArt.summary.statuses)}`);
}

await generate();
