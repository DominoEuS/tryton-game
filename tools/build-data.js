/* Zamienia zrzuty z Tournify (XX Kappa Business League) na src/data/kappa-data.js.
   Uruchomienie: node tools/build-data.js            — bez pobierania herbów
                 node tools/build-data.js --crests   — dodatkowo pobiera herby
*/
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'src', 'data', 'kappa-data.js');
const CRESTS = path.join(ROOT, 'src', 'assets', 'crests');

const MONTHS = {
  stycznia: 1, lutego: 2, marca: 3, kwietnia: 4, maja: 5, czerwca: 6,
  lipca: 7, sierpnia: 8, 'września': 9, wrzesnia: 9, 'października': 10,
  pazdziernika: 10, listopada: 11, grudnia: 12
};

const DATE_RE = /^(poniedziałek|wtorek|środa|czwartek|piątek|sobota|niedziela)\s+(\d{1,2})\s+(\S+)\s+(\d{4})$/i;
const LEAGUE_RE = /^(\d)\s*-\s*\d\s*Liga$/i;
const PITCH_RE = /^Boisko\s+(\d+)$/i;
const TIME_RE = /^(\d{1,2}):(\d{2})$/;
const REFEREE_RE = /^[A-ZŁŚŻŹĆĄĘÓŃ]{2,3}$/;

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

function isoDate(line) {
  const m = line.match(DATE_RE);
  if (!m) return null;
  const month = MONTHS[m[3].toLowerCase()];
  if (!month) return null;
  return `${m[4]}-${String(month).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
}

/* ---- drużyny i składy ---- */

function buildTeams(raw) {
  const teams = (raw.teams || raw).map(entry => ({
    id: entry.id,
    name: entry.name.trim(),
    league: Number((entry.league.match(/\d/) || [4])[0]),
    crest: entry.logo || null,
    players: entry.players
      .map(p => ({ nr: p.nr ? String(p.nr) : null, name: p.name.trim() }))
      .filter(p => p.name)
  }));
  const seen = new Set();
  return teams.filter(t => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  }).sort((a, b) => a.league - b.league || a.name.localeCompare(b.name, 'pl'));
}

/* ---- terminarz ---- */

function buildSchedule(lines, nameToId) {
  const fixtures = [];
  let date = null;
  let i = 0;

  const resolve = name => {
    const key = name.trim();
    if (nameToId.has(key)) return nameToId.get(key);
    const squashed = key.replace(/\s+/g, '');
    for (const [full, id] of nameToId) {
      if (full.replace(/\s+/g, '') === squashed) return id;
    }
    return null;
  };

  while (i < lines.length) {
    const line = lines[i];
    const asDate = isoDate(line);
    if (asDate) { date = asDate; i++; continue; }

    const league = line.match(LEAGUE_RE);
    if (!league) { i++; continue; }

    const pitch = (lines[i + 1] || '').match(PITCH_RE);
    if (!pitch) { i++; continue; }

    let j = i + 2;
    const homeParts = [];
    while (j < lines.length && !TIME_RE.test(lines[j]) && !/^\d{1,3}$/.test(lines[j])) {
      homeParts.push(lines[j]); j++;
      if (j - i > 8) break;
    }
    if (j >= lines.length) break;

    const timeMatch = lines[j].match(TIME_RE);
    const time = timeMatch ? lines[j] : null;
    const homeGoals = timeMatch ? null : Number(lines[j]);
    j++;

    const awayParts = [];
    while (j < lines.length) {
      const l = lines[j];
      if (isoDate(l) || LEAGUE_RE.test(l) || REFEREE_RE.test(l)) break;
      if (!timeMatch && /^\d{1,3}$/.test(l) && awayParts.length) break;
      awayParts.push(l); j++;
      if (awayParts.length > 6) break;
    }

    let awayGoals = null;
    if (!timeMatch && j < lines.length && /^\d{1,3}$/.test(lines[j])) {
      awayGoals = Number(lines[j]); j++;
    }
    if (j < lines.length && REFEREE_RE.test(lines[j])) j++;

    const home = resolve(homeParts.join(' '));
    const away = resolve(awayParts.join(' '));
    if (home && away) {
      fixtures.push({
        date,
        league: Number(league[1]),
        pitch: Number(pitch[1]),
        time,
        home,
        away,
        homeGoals: Number.isFinite(homeGoals) ? homeGoals : null,
        awayGoals: Number.isFinite(awayGoals) ? awayGoals : null
      });
    }
    i = j;
  }
  return fixtures;
}

/* ---- herby ---- */

function download(url, file) {
  return new Promise(resolve => {
    https.get(url, res => {
      if (res.statusCode !== 200) { res.resume(); return resolve(false); }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        fs.writeFileSync(file, Buffer.concat(chunks));
        resolve(true);
      });
    }).on('error', () => resolve(false));
  });
}

/* Ścieżki do herbów ustawiamy zawsze, gdy plik leży już na dysku; pobieramy
   tylko na żądanie. Inaczej przebudowa danych bez --crests gubiła herby. */
async function fetchCrests(teams, allowDownload) {
  fs.mkdirSync(CRESTS, { recursive: true });
  let have = 0;
  for (const team of teams) {
    if (!team.crest) continue;
    const ext = /\.jpe?g/i.test(team.crest.split('?')[0]) ? 'jpg' : 'png';
    const file = path.join(CRESTS, `${team.id}.${ext}`);
    let ok = fs.existsSync(file);
    if (!ok && allowDownload) ok = await download(team.crest, file);
    team.crestFile = ok ? `src/assets/crests/${team.id}.${ext}` : null;
    if (ok) have++;
  }
  console.log('herby:', have, 'z', teams.length);
}

/* ---- zapis ---- */

async function main() {
  const teams = buildTeams(readJson('scrape-teams.json'));
  const nameToId = new Map(teams.map(t => [t.name, t.id]));
  const fixtures = buildSchedule(readJson('scrape-schedule.json').lines, nameToId);

  /* Terminarz na Tournify pokazuje tylko mecze jeszcze nierozegrane, więc wyniki
     pierwszych kolejek dociągamy osobno ze stron drużyn. */
  const playedFile = path.join(ROOT, 'played-fixtures.json');
  let played = [];
  if (fs.existsSync(playedFile)) {
    const known = new Set(fixtures.map(f => f.home + '|' + f.away));
    played = JSON.parse(fs.readFileSync(playedFile, 'utf8'))
      .filter(f => !known.has(f.home + '|' + f.away));
    fixtures.unshift.apply(fixtures, played);
  }

  await fetchCrests(teams, process.argv.includes('--crests'));

  const payload = {
    tournament: 'XX Kappa Business League',
    seasonLabel: '2026/27',
    seasonStart: '2026-10-16',
    seasonEnd: '2027-03-07',
    homeTeamId: (teams.find(t => t.name === 'Tryton Actoom Szczecin') || {}).id,
    leagues: [1, 2, 3, 4],
    teams: teams.map(t => ({
      id: t.id,
      name: t.name,
      league: t.league,
      crest: t.crestFile || null,
      players: t.players
    })),
    fixtures
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    '/* Wygenerowane przez tools/build-data.js — nie edytuj ręcznie. */\n' +
    'window.KAPPA_DATA = ' + JSON.stringify(payload, null, 1) + ';\n',
    'utf8'
  );

  const perLeague = {};
  teams.forEach(t => { perLeague[t.league] = (perLeague[t.league] || 0) + 1; });
  const fixturesPerLeague = {};
  fixtures.forEach(f => { fixturesPerLeague[f.league] = (fixturesPerLeague[f.league] || 0) + 1; });

  console.log('drużyny:', teams.length, perLeague);
  console.log('mecze:', fixtures.length, fixturesPerLeague, '| w tym rozegranych:', played.length);
  console.log('bez składu:', teams.filter(t => t.players.length < 5).map(t => `${t.name} (${t.players.length})`).join(', ') || 'brak');
  console.log('zapisano:', path.relative(ROOT, OUT));
}

main();
