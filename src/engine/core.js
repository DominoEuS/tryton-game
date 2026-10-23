/* Rdzeń: losowość z ziarnem, OVR, generowanie zawodników i rozwój.
   Wymaga wcześniej wczytanych: window.TrytonAttributes, window.KAPPA_DATA. */
(function (global) {
  'use strict';

  const A = global.TrytonAttributes;

  /* ---------- losowość ---------- */

  function makeRng(seed) {
    let state = (seed >>> 0) || 1;
    const next = () => {
      state ^= state << 13; state >>>= 0;
      state ^= state >>> 17;
      state ^= state << 5; state >>>= 0;
      return state / 4294967296;
    };
    return {
      next,
      int: (min, max) => min + Math.floor(next() * (max - min + 1)),
      pick: list => list[Math.floor(next() * list.length)],
      chance: p => next() < p,
      /* rozkład dzwonowy 0..1 — trzy próbki uśrednione */
      bell: () => (next() + next() + next()) / 3,
      shuffle(list) {
        const out = list.slice();
        for (let i = out.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
        }
        return out;
      }
    };
  }

  function hashString(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const avg = list => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);

  /* ---------- OVR ---------- */

  function overall(player, positionKey) {
    const position = A.POSITIONS[positionKey || player.position] || A.POSITIONS.UNI;
    const attrs = player.attributes;
    const critical = position.critical.map(k => attrs[k] || 1);
    const supporting = position.supporting.map(k => attrs[k] || 1);
    const used = new Set(position.critical.concat(position.supporting));
    const rest = A.KEYS
      .filter(k => !used.has(k) && A.ATTRIBUTES[k].group !== 'br')
      .map(k => attrs[k] || 1);
    const weighted = (3 * avg(critical) + 2 * avg(supporting) + 1 * avg(rest)) / 6;
    return clamp(Math.round(weighted * 5), 1, 99);
  }

  function peakAge(player) {
    return player.position === 'BR' ? 33 : 29;
  }

  /* ---------- siła lig ---------- */

  /* 1 Liga jest najmocniejsza, 4 Liga najsłabsza. Wartość na skali atrybutu 1–20. */
  const LEAGUE_BASE = { 1: 13.2, 2: 11.6, 3: 10.1, 4: 8.6 };

  function leagueBase(league) {
    return LEAGUE_BASE[league] || 9;
  }

  /* ---------- generowanie zawodników ---------- */

  const FILLER_FIRST = ['Adam', 'Bartosz', 'Damian', 'Filip', 'Grzegorz', 'Jakub', 'Kamil',
    'Krzysztof', 'Łukasz', 'Marcin', 'Mateusz', 'Michał', 'Paweł', 'Piotr', 'Rafał',
    'Sebastian', 'Tomasz', 'Wojciech', 'Dawid', 'Patryk'];
  const FILLER_LAST = ['Baran', 'Cichy', 'Dudek', 'Gajda', 'Jarosz', 'Kaczmarek', 'Lewandowski',
    'Maj', 'Nowak', 'Olejnik', 'Pawlak', 'Rutkowski', 'Sikora', 'Szulc', 'Urban',
    'Wesołowski', 'Zając', 'Zieliński', 'Czech', 'Mazur'];

  function fillerName(rng) {
    return rng.pick(FILLER_LAST).toUpperCase() + ' ' + rng.pick(FILLER_FIRST).toUpperCase();
  }

  /* Rozdaje pozycje tak, aby każdy zespół miał co najmniej 2 BR, 2 OBR, 4 UNI, 2 NAP. */
  function assignPositions(count, rng) {
    const plan = [];
    const minimum = [['BR', 2], ['OBR', 2], ['UNI', 4], ['NAP', 2]];
    minimum.forEach(pair => {
      for (let i = 0; i < pair[1] && plan.length < count; i++) plan.push(pair[0]);
    });
    /* bez 'BR' — dwóch bramkarzy gwarantuje już minimum powyżej, a losowanie
       potrafiło zrobić z dwudziestoosobowej kadry pięciu golkiperów */
    const weighted = ['OBR', 'OBR', 'UNI', 'UNI', 'UNI', 'NAP'];
    while (plan.length < count) plan.push(rng.pick(weighted));
    return rng.shuffle(plan).slice(0, count);
  }

  function makeAttributes(rng, base, position) {
    const shape = A.POSITIONS[position] || A.POSITIONS.UNI;
    const critical = new Set(shape.critical);
    const supporting = new Set(shape.supporting);
    const attrs = {};
    A.KEYS.forEach(key => {
      const group = A.ATTRIBUTES[key].group;
      let centre = base;
      if (critical.has(key)) centre += 2.4;
      else if (supporting.has(key)) centre += 0.8;
      else centre -= 1.2;
      if (group === 'br' && position !== 'BR') centre = base * 0.35;
      if (group !== 'br' && position === 'BR' && !critical.has(key) && !supporting.has(key)) centre -= 1.4;
      const value = centre + (rng.bell() - 0.5) * 4.2;
      attrs[key] = clamp(Math.round(value), 1, 20);
    });
    return attrs;
  }

  function makeAge(rng) {
    /* Liga firmowa: dorośli, od 19 do 46 lat, szczyt rozkładu około 30. */
    return clamp(Math.round(19 + rng.bell() * 27), 19, 46);
  }

  /* Starszy zawodnik w amatorskiej lidze jest zwykle lepiej ułożony, ale słabszy fizycznie. */
  function applyAgeShape(attrs, age) {
    const drop = age <= 29 ? 0 : (age - 29) * 0.28;
    const gain = Math.min((age - 19) * 0.16, 2.6);
    A.keysInGroup('fiz').forEach(key => { attrs[key] = clamp(Math.round(attrs[key] - drop), 1, 20); });
    A.keysInGroup('men').forEach(key => { attrs[key] = clamp(Math.round(attrs[key] + gain), 1, 20); });
    return attrs;
  }

  let playerSeq = 0;

  function emptySeasonStats() {
    return {
      apps: 0, goals: 0, assists: 0, shots: 0, onTarget: 0,
      passes: 0, passesOk: 0, dribbles: 0, dribblesOk: 0,
      tackles: 0, losses: 0, saves: 0, conceded: 0,
      ratingSum: 0, motm: 0, minutes: 0
    };
  }

  function makePlayer(options) {
    const rng = options.rng;
    const age = Number.isFinite(options.age) ? options.age : makeAge(rng);
    const attributes = applyAgeShape(makeAttributes(rng, options.base, options.position), age);
    const player = {
      id: 'p' + (++playerSeq),
      name: options.name,
      nr: options.nr || null,
      position: options.position,
      age: age,
      attributes: attributes,
      potential: clamp(Math.round(options.base * 5 + 8 + rng.bell() * 22), 20, 99),
      form: 0,
      condition: 100,
      isUser: false,
      season: emptySeasonStats(),
      career: emptySeasonStats()
    };
    player.ovr = overall(player);
    player.potential = Math.max(player.potential, player.ovr);
    return player;
  }

  function buildSquad(team, rng) {
    const base = leagueBase(team.league);
    const names = team.players.length ? team.players.slice() : [];
    const target = Math.max(10, Math.min(16, names.length || 12));
    while (names.length < target) names.push({ nr: null, name: fillerName(rng) });

    const positions = assignPositions(names.length, rng);
    const used = new Set(names.map(n => Number(n.nr)).filter(Number.isFinite));
    let spare = 2;
    return names.map((entry, index) => {
      let nr = entry.nr;
      if (!nr) {
        while (used.has(spare)) spare++;
        used.add(spare);
        nr = String(spare);
      }
      return makePlayer({ rng: rng, name: entry.name, nr: nr, position: positions[index], base: base });
    });
  }

  function teamStrength(squad) {
    const best = squad.slice().sort((a, b) => b.ovr - a.ovr).slice(0, 8);
    return avg(best.map(p => p.ovr));
  }

  /* ---------- rozwój między sezonami ---------- */

  /* Rozdziela zmianę OVR na konkretne atrybuty, zgodnie z wiekiem i pozycją. */
  function nudgeAttributes(player, steps, rng) {
    const shape = A.POSITIONS[player.position] || A.POSITIONS.UNI;
    const favoured = rng.shuffle(shape.critical.concat(shape.supporting));
    const physical = A.keysInGroup('fiz');
    const direction = steps > 0 ? 1 : -1;
    const changes = Math.min(Math.abs(steps) * 2 + 1, 7);
    for (let i = 0; i < changes; i++) {
      const key = direction > 0
        ? favoured[i % favoured.length]
        : (rng.chance(0.6) && player.age > 32 ? rng.pick(physical) : favoured[i % favoured.length]);
      if (A.ATTRIBUTES[key].group === 'br' && player.position !== 'BR') continue;
      player.attributes[key] = clamp(player.attributes[key] + direction, 1, 20);
    }
  }

  function developPlayer(player, rng, context) {
    const minutes = (context && context.minutes) || 0;
    const teamLeague = (context && context.teamLeague) || 4;
    player.age += 1;
    const peak = peakAge(player);
    const headroom = player.potential - player.ovr;
    const playTime = clamp(minutes / 900, 0, 1.3);

    let delta;
    if (player.age <= peak) {
      delta = (0.35 + headroom * 0.045) * (0.45 + playTime) * (1 + (5 - teamLeague) * 0.04);
      delta += (rng.bell() - 0.5) * 1.6;
    } else {
      const over = player.age - peak;
      delta = -(0.4 + over * 0.22) + (rng.bell() - 0.5) * 1.2 + playTime * 0.3;
    }

    const steps = Math.round(delta);
    const before = player.ovr;
    if (steps !== 0) nudgeAttributes(player, steps, rng);
    player.ovr = overall(player);
    player.potential = Math.max(player.potential, player.ovr);
    return player.ovr - before;
  }

  /* ---------- zapis ---------- */

  const SAVE_KEY = 'tryton-kappa-save';
  /* Podbij, gdy zmieni się struktura stanu gry. Starszy zapis nie zostanie
     wczytany — tester dostanie czytelny komunikat zamiast rozsypanej gry. */
  const SAVE_VERSION = 3;

  const storage = {
    save(state) {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(state));
        return true;
      } catch (error) {
        console.warn('Nie udało się zapisać gry:', error);
        return false;
      }
    },
    /* Zwraca {state} albo {error: 'brak' | 'wersja' | 'uszkodzony'}. */
    load() {
      let raw = null;
      try {
        raw = localStorage.getItem(SAVE_KEY);
      } catch (error) {
        return { error: 'brak' };
      }
      if (!raw) return { error: 'brak' };
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        return { error: 'uszkodzony' };
      }
      if (!parsed || parsed.version !== SAVE_VERSION) {
        return { error: 'wersja', found: parsed ? parsed.version : null };
      }
      return { state: parsed };
    },

    /* Krótki opis zapisu na ekran startowy. */
    describe() {
      const result = this.load();
      if (!result.state) return result;
      return {
        state: result.state,
        label: result.state.seasonLabel,
        season: (result.state.history || []).length + 1
      };
    },
    clear() {
      try { localStorage.removeItem(SAVE_KEY); } catch (error) { /* brak dostępu */ }
    },
    has() {
      try { return !!localStorage.getItem(SAVE_KEY); } catch (error) { return false; }
    }
  };

  global.TrytonCore = {
    makeRng: makeRng,
    hashString: hashString,
    clamp: clamp,
    avg: avg,
    overall: overall,
    peakAge: peakAge,
    leagueBase: leagueBase,
    buildSquad: buildSquad,
    makePlayer: makePlayer,
    makeAttributes: makeAttributes,
    makeAge: makeAge,
    applyAgeShape: applyAgeShape,
    emptySeasonStats: emptySeasonStats,
    teamStrength: teamStrength,
    developPlayer: developPlayer,
    storage: storage,
    SAVE_KEY: SAVE_KEY,
    SAVE_VERSION: SAVE_VERSION
  };
})(window);
