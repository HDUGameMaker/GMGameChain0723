/**
 * generate-asset-manifest.js
 * 递归扫描 assets/ 目录，生成 assets/manifest.json
 * 用法: node scripts/generate-asset-manifest.js
 *
 * 浏览器端 JavaScript 无法直接扫描文件系统，
 * 通过此脚本生成清单文件供游戏/编辑器在运行时读取。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const OUTPUT_FILE = path.join(ASSETS_DIR, 'manifest.json');

// 支持的图片扩展名
const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.bmp'
]);

/**
 * 递归扫描目录，返回所有文件路径（相对于 assets/ 根目录）
 */
function scanDir(dir, baseDir, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(fullPath, baseDir, results);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (IMAGE_EXTENSIONS.has(ext)) {
        // 存储相对于 assets/ 的路径
        const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
        results.push(relPath);
      }
    }
  }
  return results;
}

/**
 * 按子目录分类
 */
function categorize(files) {
  const categories = {};
  for (const file of files) {
    const dir = path.dirname(file) || '_root';
    if (!categories[dir]) {
      categories[dir] = [];
    }
    categories[dir].push(file);
  }
  return categories;
}

function generate() {
  if (!fs.existsSync(ASSETS_DIR)) {
    console.error(`❌ assets/ 目录不存在: ${ASSETS_DIR}`);
    process.exit(1);
  }

  const allFiles = scanDir(ASSETS_DIR, ASSETS_DIR);
  const categories = categorize(allFiles);

  const manifest = {
    generated: new Date().toISOString(),
    basePath: 'assets/',
    totalFiles: allFiles.length,
    categories,
    files: allFiles
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`✅ 资源清单已生成: ${OUTPUT_FILE}`);
  console.log(`   共 ${allFiles.length} 个图片文件`);
  for (const [cat, files] of Object.entries(categories)) {
    console.log(`   ${cat}/ — ${files.length} 个文件`);
    for (const f of files) {
      console.log(`     • ${f}`);
    }
  }
}

generate();
