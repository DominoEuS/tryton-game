/* Sezon: tabele, symulacja meczów komputera, awanse i spadki, nowy sezon. */
(function (global) {
  'use strict';

  const C = global.TrytonCore;
  const clamp = C.clamp;

  const PROMOTED = 2;
  const RELEGATED = 2;
  const RETIREMENT_AGE = 43;

  /* Wiek startowy składu Trytona. Klucz to nazwisko i imię tak, jak w danych
     z Tournify; reszta drużyny dostaje wartość spod 'default'. */
  const START_AGES = {
    default: 18
  };

  /* Cała drużyna zaczyna jako uniwersalni — jak na amatorskim parkiecie, gdzie
     nikt nie jest przypisany do jednej roli. Pozycje rozchodzą się dopiero
     w edytorze i przez rozwój. */
  const START_POSITION = 'UNI';

  function applyStartAges(team, rng) {
    team.squad.forEach(player => {
      const age = START_AGES[player.name.toUpperCase()] || START_AGES.default;
      player.position = START_POSITION;
      player.age = age;
      player.attributes = C.applyAgeShape(
        C.makeAttributes(rng, C.leagueBase(team.league), player.position), age);
      player.ovr = C.overall(player);
      /* osiemnastolatek musi mieć dokąd rosnąć, inaczej zostałby słaby na zawsze */
      if (age <= 20) {
        player.potential = clamp(player.ovr + 12 + Math.round(rng.bell() * 24), 25, 99);
      }
      player.potential = Math.max(player.potential, player.ovr);
    });
  }
  const TOP_LEAGUE = 1;
  const BOTTOM_LEAGUE = 4;

  /* ---------- start nowej gry ---------- */

  function newGame(options) {
    const data = global.KAPPA_DATA;
    const rng = C.makeRng(options.seed || C.hashString(String(Date.now())));

    const teams = {};
    data.teams.forEach(entry => {
      teams[entry.id] = {
        id: entry.id,
        name: entry.name,
        league: entry.league,
        crest: entry.crest,
        squad: C.buildSquad(entry, rng)
      };
    });
    if (teams[data.homeTeamId]) applyStartAges(teams[data.homeTeamId], rng);

    /* mecze, które w prawdziwej lidze już się odbyły, wchodzą do gry z wynikiem */
    const fixtures = data.fixtures.map((f, index) => {
      const done = Number.isFinite(f.homeGoals) && Number.isFinite(f.awayGoals);
      return {
        id: 'f' + index,
        date: f.date,
        league: f.league,
        pitch: f.pitch,
        time: f.time,
        home: f.home,
        away: f.away,
        homeGoals: done ? f.homeGoals : null,
        awayGoals: done ? f.awayGoals : null,
        played: done,
        historical: done
      };
    }).sort(compareFixtures);

    return {
      version: C.SAVE_VERSION,
      seed: options.seed || 0,
      rngState: rng.int(1, 2147483000),
      seasonIndex: 0,
      seasonLabel: data.seasonLabel,
      userTeamId: data.homeTeamId,
      userPlayerId: null,
      teams: teams,
      fixtures: fixtures,
      results: [],
      history: []
    };
  }

  function compareFixtures(a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const ta = a.time || '00:00';
    const tb = b.time || '00:00';
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a.league - b.league;
  }

  function rngFor(state, salt) {
    return C.makeRng(C.hashString(String(state.rngState) + '|' + salt + '|' + state.seasonIndex));
  }

  /* ---------- tabela ---------- */

  function emptyRow(team) {
    return {
      teamId: team.id, name: team.name, crest: team.crest,
      played: 0, won: 0, drawn: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, points: 0
    };
  }

  function table(state, league) {
    const rows = {};
    Object.values(state.teams)
      .filter(team => team.league === league)
      .forEach(team => { rows[team.id] = emptyRow(team); });

    state.fixtures.forEach(fixture => {
      if (!fixture.played || fixture.league !== league) return;
      const home = rows[fixture.home];
      const away = rows[fixture.away];
      if (!home || !away) return;
      home.played++; away.played++;
      home.goalsFor += fixture.homeGoals; home.goalsAgainst += fixture.awayGoals;
      away.goalsFor += fixture.awayGoals; away.goalsAgainst += fixture.homeGoals;
      if (fixture.homeGoals > fixture.awayGoals) { home.won++; home.points += 3; away.lost++; }
      else if (fixture.homeGoals < fixture.awayGoals) { away.won++; away.points += 3; home.lost++; }
      else { home.drawn++; away.drawn++; home.points++; away.points++; }
    });

    return Object.values(rows).sort((a, b) =>
      b.points - a.points ||
      (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) ||
      b.goalsFor - a.goalsFor ||
      a.name.localeCompare(b.name, 'pl')
    );
  }

  /* ---------- symulacja meczów komputera ---------- */

  function strengthOf(state, teamId) {
    const team = state.teams[teamId];
    if (!team) return 40;
    if (team.cachedStrength === undefined || team.cachedStrengthSeason !== state.seasonIndex) {
      team.cachedStrength = C.teamStrength(team.squad);
      team.cachedStrengthSeason = state.seasonIndex;
    }
    return team.cachedStrength;
  }

  /* Liga futsalowa 4+1 — wynikowo wysoka. Baza zgodna z silnikiem meczowym. */
  function simulateScore(state, fixture, rng) {
    const home = strengthOf(state, fixture.home);
    const away = strengthOf(state, fixture.away);
    const edge = (home - away) / 22;
    const homeExpected = clamp(11.7 + edge * 5.4 + 0.6, 1.5, 34);
    const awayExpected = clamp(11.7 - edge * 5.4, 1.2, 34);
    return {
      homeGoals: poisson(homeExpected, rng),
      awayGoals: poisson(awayExpected, rng)
    };
  }

  function poisson(mean, rng) {
    /* dla naszych średnich wystarczy przybliżenie przez sumę prób */
    let goals = 0;
    let left = Math.exp(-mean);
    let product = rng.next();
    while (product > left && goals < 40) {
      product *= rng.next();
      goals++;
    }
    return goals;
  }

  /* Rozdziela gole na zawodników, żeby statystyki rywali też żyły. */
  function distributeGoals(state, teamId, goals, rng) {
    const team = state.teams[teamId];
    if (!team) return;

    /* najpierw kadra meczowa, potem gole i asysty tylko z niej — inaczej
       zawodnik potrafił strzelać, nie mając ani jednego występu */
    const matchday = team.squad.slice()
      .sort((a, b) => (b.ovr + rng.next() * 6) - (a.ovr + rng.next() * 6))
      .slice(0, 10);
    matchday.forEach(p => {
      p.season.apps++; p.career.apps++;
      const minutes = rng.int(18, 50);
      p.season.minutes += minutes; p.career.minutes += minutes;
    });

    const field = matchday.filter(p => p.position !== 'BR');
    if (!field.length) return;
    const weights = field.map(p => Math.pow(p.attributes.finishing + p.attributes.offTheBall, 1.6));
    const total = weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < goals; i++) {
      let roll = rng.next() * total;
      let scorer = field[field.length - 1];
      for (let j = 0; j < field.length; j++) {
        roll -= weights[j];
        if (roll <= 0) { scorer = field[j]; break; }
      }
      scorer.season.goals++; scorer.career.goals++;
      if (rng.chance(0.55)) {
        const helper = rng.pick(field);
        if (helper.id !== scorer.id) { helper.season.assists++; helper.career.assists++; }
      }
    }
  }

  function nextUserFixture(state) {
    return state.fixtures.find(f =>
      !f.played && (f.home === state.userTeamId || f.away === state.userTeamId)) || null;
  }

  /* Rozgrywa zaległe mecze komputera aż do wskazanego terminu (włącznie z nim).
     Mecz drużyny gracza zatrzymuje pętlę, chyba że includeUser jest prawdą —
     wtedy symulujemy również jego, co kończy sezon jednym kliknięciem. */
  function simulateUntil(state, boundaryFixture, options) {
    const includeUser = !!(options && options.includeUser);
    const rng = rngFor(state, 'sim' + (boundaryFixture ? boundaryFixture.id : 'all'));
    const played = [];
    for (const fixture of state.fixtures) {
      if (fixture.played) continue;
      const isUserMatch = fixture.home === state.userTeamId || fixture.away === state.userTeamId;
      if (isUserMatch && !includeUser) {
        if (!boundaryFixture || fixture.id === boundaryFixture.id) break;
        continue;
      }
      if (boundaryFixture && compareFixtures(fixture, boundaryFixture) > 0) break;
      const score = simulateScore(state, fixture, rng);
      fixture.homeGoals = score.homeGoals;
      fixture.awayGoals = score.awayGoals;
      fixture.played = true;
      distributeGoals(state, fixture.home, score.homeGoals, rng);
      distributeGoals(state, fixture.away, score.awayGoals, rng);
      played.push(fixture);
    }
    state.rngState = rng.int(1, 2147483000);
    return played;
  }

  function recordUserResult(state, fixtureId, homeGoals, awayGoals) {
    const fixture = state.fixtures.find(f => f.id === fixtureId);
    if (!fixture) return null;
    fixture.homeGoals = homeGoals;
    fixture.awayGoals = awayGoals;
    fixture.played = true;
    return fixture;
  }

  function seasonFinished(state) {
    return state.fixtures.every(f => f.played);
  }

  /* ---------- koniec sezonu ---------- */

  function movements(state) {
    const result = { up: [], down: [] };
    [1, 2, 3, 4].forEach(league => {
      const rows = table(state, league);
      if (league > TOP_LEAGUE) {
        rows.slice(0, PROMOTED).forEach(row => result.up.push({ teamId: row.teamId, from: league, to: league - 1 }));
      }
      if (league < BOTTOM_LEAGUE) {
        rows.slice(-RELEGATED).forEach(row => result.down.push({ teamId: row.teamId, from: league, to: league + 1 }));
      }
    });
    return result;
  }

  /* Tworzy terminarz dla ligi: każdy z każdym, mecz i rewanż. */
  function roundRobin(teamIds, rng) {
    const ids = rng.shuffle(teamIds.slice());
    if (ids.length % 2) ids.push(null);
    const rounds = [];
    const half = ids.length / 2;
    let order = ids.slice();
    for (let round = 0; round < ids.length - 1; round++) {
      const pairs = [];
      for (let i = 0; i < half; i++) {
        const a = order[i];
        const b = order[order.length - 1 - i];
        if (a && b) pairs.push(round % 2 ? [b, a] : [a, b]);
      }
      rounds.push(pairs);
      const fixed = order[0];
      const rest = order.slice(1);
      rest.unshift(rest.pop());
      order = [fixed].concat(rest);
    }
    /* rewanże */
    const second = rounds.map(pairs => pairs.map(pair => [pair[1], pair[0]]));
    return rounds.concat(second);
  }

  function addDays(iso, days) {
    const date = new Date(iso + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function buildNextFixtures(state, rng) {
    /* seasonIndex jest już podniesiony, gdy tu wchodzimy, więc sezon 2027/28
       (indeks 1) musi zacząć się w październiku 2027, a nie 2028 */
    const startYear = 2026 + state.seasonIndex;
    let date = startYear + '-10-16';
    const fixtures = [];
    let counter = 0;

    const byLeague = {};
    Object.values(state.teams).forEach(team => {
      (byLeague[team.league] = byLeague[team.league] || []).push(team.id);
    });

    const schedules = {};
    let maxRounds = 0;
    [1, 2, 3, 4].forEach(league => {
      schedules[league] = roundRobin(byLeague[league] || [], rng);
      maxRounds = Math.max(maxRounds, schedules[league].length);
    });

    for (let round = 0; round < maxRounds; round++) {
      [1, 2, 3, 4].forEach(league => {
        const pairs = schedules[league][round] || [];
        pairs.forEach((pair, index) => {
          const hour = 14 + ((index + league) % 8);
          fixtures.push({
            id: 's' + (state.seasonIndex + 1) + 'f' + (counter++),
            date: date,
            league: league,
            pitch: 1 + (index % 2),
            time: String(hour).padStart(2, '0') + ':00',
            home: pair[0],
            away: pair[1],
            homeGoals: null,
            awayGoals: null,
            played: false
          });
        });
      });
      date = addDays(date, 7);
    }

    return fixtures.sort(compareFixtures);
  }

  function seasonLabelFor(index) {
    const start = 2026 + index;
    return start + '/' + String(start + 1).slice(2);
  }

  /* Niewielka rotacja składów rywali: ktoś odchodzi, ktoś dochodzi.
     Zawodnika gracza nigdy nie usuwamy po cichu — kończy karierę osobnym ekranem. */
  function churnSquad(state, team, rng) {
    const leaving = team.squad.filter(p =>
      p.id !== state.userPlayerId && (p.age > 42 || (p.ovr < 25 && rng.chance(0.3))));
    leaving.forEach(player => {
      team.squad = team.squad.filter(p => p.id !== player.id);
    });
    const base = C.leagueBase(team.league);
    const missing = clamp(12 - team.squad.length, 0, 5);
    for (let i = 0; i < missing; i++) {
      const used = new Set(team.squad.map(p => Number(p.nr)));
      let nr = 2;
      while (used.has(nr)) nr++;
      team.squad.push(C.makePlayer({
        rng: rng,
        name: rng.pick(['NOWAK', 'KOWALSKI', 'WIŚNIEWSKI', 'LEWANDOWSKI', 'KAMIŃSKI', 'ZIELIŃSKI']) +
          ' ' + rng.pick(['ADAM', 'PIOTR', 'JAKUB', 'MICHAŁ', 'TOMASZ', 'KAMIL']),
        nr: String(nr),
        position: rng.pick(['OBR', 'UNI', 'UNI', 'NAP', 'BR']),
        base: base
      }));
    }
  }

  function endSeason(state) {
    const rng = rngFor(state, 'end');
    const summary = {
      seasonLabel: state.seasonLabel,
      tables: {},
      movements: movements(state),
      development: []
    };
    [1, 2, 3, 4].forEach(league => { summary.tables[league] = table(state, league); });

    const userTeam = state.teams[state.userTeamId];
    summary.userLeague = userTeam.league;
    summary.userRow = summary.tables[userTeam.league]
      .find(row => row.teamId === state.userTeamId) || null;
    summary.userPosition = summary.tables[userTeam.league]
      .findIndex(row => row.teamId === state.userTeamId) + 1;

    /* ruchy między ligami */
    summary.movements.up.forEach(move => { state.teams[move.teamId].nextLeague = move.to; });
    summary.movements.down.forEach(move => { state.teams[move.teamId].nextLeague = move.to; });
    Object.values(state.teams).forEach(team => {
      if (team.nextLeague) { team.league = team.nextLeague; delete team.nextLeague; }
      delete team.cachedStrength;
    });

    /* rozwój zawodników */
    Object.values(state.teams).forEach(team => {
      team.squad.forEach(player => {
        const change = C.developPlayer(player, rng, {
          minutes: player.season.minutes,
          teamLeague: team.league
        });
        if (team.id === state.userTeamId) {
          summary.development.push({
            id: player.id, name: player.name, nr: player.nr,
            position: player.position, age: player.age, ovr: player.ovr, change: change
          });
        }
        player.career.seasons = (player.career.seasons || 0) + 1;
        player.season = C.emptySeasonStats();
        player.condition = 100;
      });
      churnSquad(state, team, rng);
    });

    /* usuń zawodników, którzy odwiesili buty — poza zawodnikiem gracza */
    Object.values(state.teams).forEach(team => {
      team.squad = team.squad.filter(p => p.age <= 46 || p.id === state.userPlayerId);
    });

    /* koniec kariery zawodnika gracza: decyduje wiek albo zjazd formy */
    const mine = userTeam.squad.find(p => p.id === state.userPlayerId);
    if (mine && !mine.retired && (mine.age >= RETIREMENT_AGE || (mine.age >= 38 && mine.ovr < 30))) {
      mine.retired = true;
      summary.userRetired = true;
      summary.retiredPlayer = {
        name: mine.name, nr: mine.nr, age: mine.age,
        position: mine.position, ovr: mine.ovr,
        career: Object.assign({}, mine.career)
      };
    }

    state.history.push({
      seasonLabel: state.seasonLabel,
      league: summary.userLeague,
      position: summary.userPosition,
      row: summary.userRow,
      promoted: summary.movements.up.some(m => m.teamId === state.userTeamId),
      relegated: summary.movements.down.some(m => m.teamId === state.userTeamId)
    });

    state.seasonIndex += 1;
    state.seasonLabel = seasonLabelFor(state.seasonIndex);
    state.fixtures = buildNextFixtures(state, rng);
    state.rngState = rng.int(1, 2147483000);

    return summary;
  }

  global.TrytonSeason = {
    newGame: newGame,
    table: table,
    nextUserFixture: nextUserFixture,
    simulateUntil: simulateUntil,
    recordUserResult: recordUserResult,
    seasonFinished: seasonFinished,
    endSeason: endSeason,
    strengthOf: strengthOf,
    movements: movements,
    compareFixtures: compareFixtures,
    PROMOTED: PROMOTED,
    RELEGATED: RELEGATED
  };
})(window);
