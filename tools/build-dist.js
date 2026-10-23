/* Składa katalog dist/ — dokładnie to, co trafia na hosting, bez zrzutów
   z Tournify, narzędzi i historii gita. Gotowe do przeciągnięcia na
   Netlify Drop albo skopiowania na dowolny serwer statyczny.

   node tools/build-dist.js
*/
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const INCLUDE = ['index.html', 'src'];

function copy(from, to) {
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    fs.readdirSync(from).forEach(name => copy(path.join(from, name), path.join(to, name)));
    return;
  }
  fs.copyFileSync(from, to);
}

function measure(dir) {
  let bytes = 0;
  let files = 0;
  (function walk(current) {
    fs.readdirSync(current).forEach(name => {
      const full = path.join(current, name);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else { bytes += stat.size; files++; }
    });
  })(dir);
  return { bytes: bytes, files: files };
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
INCLUDE.forEach(name => copy(path.join(ROOT, name), path.join(DIST, name)));

const build = (fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .match(/window\.TRYTON_BUILD\s*=\s*'([^']+)'/) || [])[1];
const size = measure(DIST);

console.log('dist/ gotowy — wersja', build);
console.log('plików:', size.files, '| rozmiar:', (size.bytes / 1024).toFixed(0), 'KB');
console.log('ścieżka:', DIST);
