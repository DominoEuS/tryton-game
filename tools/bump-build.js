/* Podbija numer kompilacji w index.html — w jednym miejscu i we wszystkich
   adresach plików naraz, żeby testerzy nigdy nie grali na starym kodzie.

   node tools/bump-build.js          — podbija ostatnią cyfrę (0.9.1 -> 0.9.2)
   node tools/bump-build.js 1.0.0    — ustawia konkretny numer
*/
'use strict';

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(FILE, 'utf8');

const current = (html.match(/window\.TRYTON_BUILD\s*=\s*'([^']+)'/) || [])[1];
if (!current) {
  console.error('Nie znalazłem numeru kompilacji w index.html');
  process.exit(1);
}

let next = process.argv[2];
if (!next) {
  const parts = current.split('.');
  parts[parts.length - 1] = String(Number(parts[parts.length - 1]) + 1);
  next = parts.join('.');
}

const updated = html
  .split("window.TRYTON_BUILD = '" + current + "'").join("window.TRYTON_BUILD = '" + next + "'")
  .split('?b=' + current).join('?b=' + next);

fs.writeFileSync(FILE, updated, 'utf8');
console.log(current, '->', next);
