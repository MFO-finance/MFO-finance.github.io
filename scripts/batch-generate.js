#!/usr/bin/env node
'use strict';

/**
 * Batch runner — generates specific topic IDs in a single process,
 * sharing the Anthropic ephemeral prompt cache across all articles.
 *
 * Usage: node scripts/batch-generate.js id1 id2 id3 ...
 */

const fs   = require('fs');
const path = require('path');

const ROOT         = path.resolve(__dirname, '..');
const KEYWORDS_JSON = path.join(ROOT, 'src', 'data', 'keywords.json');
const BLOG_DIR     = path.join(ROOT, 'blog');

// Check which IDs need generation (no existing article dir)
const keywordsData = JSON.parse(fs.readFileSync(KEYWORDS_JSON, 'utf8'));
const args = process.argv.slice(2);

let topics;
if (args.length > 0) {
  topics = keywordsData.clusters.filter(t => args.includes(t.id));
} else {
  // Auto: only clusters that don't have an article dir yet
  topics = keywordsData.clusters.filter(t => {
    const dir = path.join(BLOG_DIR, t.slug);
    return !fs.existsSync(dir);
  });
}

if (!topics.length) {
  console.log('✅ All topics already have articles. Nothing to generate.');
  process.exit(0);
}

console.log(`\n📋 Topics to generate: ${topics.length}`);
topics.forEach((t, i) => console.log(`  [${i+1}/${topics.length}] ${t.id}`));
console.log('');

// Reuse generate-articles internals by loading the module pieces
// The simplest approach: set process.argv and spawn child processes sequentially
const { execSync } = require('child_process');

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error('❌  Set ANTHROPIC_API_KEY before running.'); process.exit(1); }

let success = 0;
let failed  = 0;

for (const [i, topic] of topics.entries()) {
  console.log(`\n[${i+1}/${topics.length}] Генерирую: ${topic.id} ...`);
  try {
    execSync(`node scripts/generate-articles.js ${topic.id}`, {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env, ANTHROPIC_API_KEY: apiKey },
      timeout: 120000,
    });
    success++;
  } catch (err) {
    console.error(`   ❌ Failed: ${topic.id}`);
    failed++;
  }
}

console.log(`\n=== ИТОГ: ${success}/${topics.length} успешно ===`);
if (failed) console.log(`   Ошибок: ${failed}`);
