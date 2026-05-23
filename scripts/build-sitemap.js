#!/usr/bin/env node
/**
 * Evora Finance — Sitemap Builder
 * Scans the repo for all HTML files and generates sitemap.xml
 * Run: node scripts/build-sitemap.js
 * Or:  npm run sitemap
 */

const fs   = require('fs');
const path = require('path');

const BASE_URL   = 'https://mfo-finance.github.io';
const ROOT       = path.resolve(__dirname, '..');
const OUTPUT     = path.join(ROOT, 'sitemap.xml');
const IGNORE_DIRS = new Set(['node_modules', '.git', 'scripts', 'src']);

/* Priority / changefreq rules by path depth & prefix */
function getPriority(urlPath) {
  if (urlPath === '/') return '1.0';
  const depth = urlPath.split('/').filter(Boolean).length;
  if (depth === 1) return '0.9'; // /karty/, /rko/, etc.
  if (depth === 2) return '0.7'; // /blog/article-slug/
  return '0.5';
}

function getChangefreq(urlPath) {
  if (urlPath === '/') return 'daily';
  if (urlPath.startsWith('/blog/')) return 'monthly';
  return 'weekly';
}

/* Recursive HTML file scanner */
function scanHtmlFiles(dir, found = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanHtmlFiles(fullPath, found);
    } else if (entry.isFile() && entry.name === 'index.html') {
      found.push(fullPath);
    }
  }
  return found;
}

/* Convert absolute file path → URL path */
function fileToUrl(filePath) {
  const relative = path.relative(ROOT, filePath).replace(/\\/g, '/');
  // Remove trailing "index.html"
  const urlPath = '/' + relative.replace(/index\.html$/, '');
  return urlPath;
}

/* Build sitemap XML */
function buildSitemap(urlPaths) {
  const today = new Date().toISOString().slice(0, 10);
  const urls  = urlPaths.map(urlPath => {
    const loc        = BASE_URL + urlPath;
    const priority   = getPriority(urlPath);
    const changefreq = getChangefreq(urlPath);
    return `  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">
${urls.join('\n')}
</urlset>`;
}

/* Main */
function main() {
  console.log('🗺  Scanning HTML files…');
  const htmlFiles = scanHtmlFiles(ROOT);
  const urlPaths  = htmlFiles
    .map(fileToUrl)
    .sort(); // sort for stability

  console.log(`   Found ${urlPaths.length} pages:`);
  urlPaths.forEach(p => console.log(`   • ${p}`));

  const xml = buildSitemap(urlPaths);
  fs.writeFileSync(OUTPUT, xml, 'utf8');
  console.log(`\n✅ sitemap.xml written → ${OUTPUT}`);
  console.log(`   ${urlPaths.length} URLs, last modified: ${new Date().toISOString().slice(0, 10)}`);
}

main();
