/* Silnik meczu futsalowego 4+1 z pauzą na decyzję gracza.
   Boisko: x od 0 (bramka gospodarzy) do 100 (bramka gości), y od 0 do 100 w poprzek. */
(function (global) {
  'use strict';

  const A = global.TrytonAttributes;
  const C = global.TrytonCore;
  const clamp = C.clamp;

  const HALF_SECONDS = 25 * 60;
  const HALVES = 2;

  /* Punkty zaczepienia pozycji dla drużyny atakującej w stronę x = 100.
     Ustawienia obronne są celowo przesunięte w pionie, żeby obrońcy nie stawali
     dokładnie na atakujących — inaczej presja byłaby stale maksymalna. */
  const ANCHORS = {
    attack: { BR: [16, 50], OBR: [48, 46], UNI: [[66, 20], [66, 80]], NAP: [80, 50] },
    defend: { BR: [6, 50], OBR: [26, 58], UNI: [[44, 32], [44, 68]], NAP: [60, 42] }
  };

  /* W futsalu czwórka w polu rotuje, więc miejsca w ataku rozdajemy na nowo przy
     każdej akcji — inaczej wszystkie strzały bierze jeden napastnik. */
  /* Ustawienia taktyczne drużyny. Każde przekłada się na konkretną liczbę
     w silniku, więc wybór naprawdę zmienia przebieg meczu. */
  const DEFAULT_TACTICS = { pressing: 'normalny', marking: 'strefa', tempo: 'normalne' };
  const PRESS_SHIFT = { niski: -9, normalny: 0, wysoki: 10 };
  const PRESS_DRAIN = { niski: 0.82, normalny: 1, wysoki: 1.34 };
  const PRESS_PASS = { niski: 0.05, normalny: 0, wysoki: -0.08 };
  const MARK_PRESSURE = { strefa: 1, '1v1': 1.16 };
  const MARK_BEATEN = { strefa: 1, '1v1': 0.9 };
  /* kryjąc 1v1 trudniej dać się minąć, ale za plecami zostaje więcej miejsca */
  const MARK_SPACE = { strefa: 1, '1v1': 1.8 };
  const TEMPO_SHOT = { spokojne: 0.68, normalne: 1, szybkie: 1.5 };
  const TEMPO_GAIN = { spokojne: 0.055, normalne: 0.09, szybkie: 0.135 };

  function tacticsOf(side) {
    return (side && side.tactics) || DEFAULT_TACTICS;
  }

  const ATTACK_SPOTS = [[48, 46], [66, 20], [66, 80], [80, 50]];
  const PIVOT_WEIGHT = { NAP: 3.2, UNI: 1.6, OBR: 0.6, BR: 0.1 };

  function rotateAttack(side, rng) {
    const outfield = side.onCourt.filter(spot => spot.slot !== 'BR');
    const free = [0, 1, 2, 3];
    /* najpierw rozstrzygamy, kto staje najwyżej (miejsce 3) */
    const weights = outfield.map(spot => PIVOT_WEIGHT[spot.slot] || 1);
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = rng.next() * total;
    let pivot = outfield[outfield.length - 1];
    for (let i = 0; i < outfield.length; i++) {
      roll -= weights[i];
      if (roll <= 0) { pivot = outfield[i]; break; }
    }
    pivot.rot = 3;
    free.splice(free.indexOf(3), 1);
    rng.shuffle(outfield.filter(spot => spot !== pivot)).forEach((spot, index) => {
      spot.rot = free[index];
    });
  }

  function effective(player, key) {
    const raw = player.attributes[key] || 1;
    if (A.ATTRIBUTES[key].group !== 'fiz') return raw;
    const condition = clamp(player.condition, 30, 100);
    return raw * (0.72 + 0.28 * condition / 100);
  }

  function sum(player, keys) {
    return keys.reduce((total, key) => total + effective(player, key), 0) / keys.length;
  }

  /* ---------- ustawianie piątki ---------- */

  /* preset to lista identyfikatorów w kolejności LINEUP_SHAPE (BR, OBR, UNI, UNI, NAP) —
     tak gracz narzuca własną piątkę przed pierwszym gwizdkiem. */
  function pickLineup(squad, rng, forceId, preset) {
    const available = squad.filter(p => !p.suspended);
    const chosen = [];
    const taken = new Set();
    const wanted = Array.isArray(preset) ? preset.slice() : null;
    let presetIndex = 0;
    /* zawodnik gracza zawsze zaczyna — inaczej przesiedziałby mecz na ławce
       i nie dostałby ani jednej decyzji */
    const forced = forceId ? available.find(p => p.id === forceId) : null;
    /* przy zadanej piątce nie rezerwujemy mu miejsca z góry — inaczej własny
       preset nie mógłby go wstawić i wpadałby tu dopiero awaryjną podmianą */
    if (forced && !wanted) taken.add(forced.id);

    A.LINEUP_SHAPE.forEach(slot => {
      const candidates = available
        .filter(p => !taken.has(p.id) && p.position === slot.position)
        .sort((a, b) => (b.ovr + b.condition * 0.12) - (a.ovr + a.condition * 0.12));
      let index = 0;
      if (forced && forced.position === slot.position && !wanted) {
        chosen.push({ player: forced, slot: slot.position, index: index++ });
      }
      while (index < slot.count) {
        let player = null;
        if (wanted) {
          const id = wanted[presetIndex];
          player = available.find(p => p.id === id && !taken.has(p.id)) || null;
        }
        if (!player) {
          player = candidates.shift();
        }
        if (!player) {
          /* awaryjnie bierzemy najlepszego wolnego, ale do pola nie wstawiamy
             zapasowego bramkarza, dopóki jest ktokolwiek inny */
          const spare = available.filter(p => !taken.has(p.id))
            .sort((a, b) => b.ovr - a.ovr);
          const outfield = spare.filter(p => p.position !== 'BR');
          player = (slot.position === 'BR' ? spare[0] : (outfield[0] || spare[0])) || null;
        }
        if (wanted) presetIndex++;
        if (!player) break;
        taken.add(player.id);
        chosen.push({ player: player, slot: slot.position, index: index++ });
      }
    });

    /* gdyby jego pozycji zabrakło w ustawieniu, wchodzi za najsłabszego w polu */
    if (forced && !chosen.some(spot => spot.player.id === forced.id)) {
      const weakest = chosen.filter(spot => spot.slot !== 'BR')
        .sort((a, b) => a.player.ovr - b.player.ovr)[0];
      if (weakest) {
        taken.delete(weakest.player.id);
        weakest.player = forced;
      }
    }
    const bench = available.filter(p => !taken.has(p.id))
      .sort((a, b) => b.ovr - a.ovr);
    return { onCourt: chosen, bench: bench };
  }

  function anchorFor(spot, phase) {
    if (phase === 'attack' && spot.slot !== 'BR') {
      return ATTACK_SPOTS[spot.rot === undefined ? 0 : spot.rot];
    }
    const entry = ANCHORS[phase][spot.slot];
    if (Array.isArray(entry[0])) return entry[spot.index % entry.length];
    return entry;
  }

  /* Zawodnicy dochodzą do swoich miejsc stopniowo, ułamek drogi na zagranie.
     Bez tego każde zagranie przestawiało całą dziesiątkę i mecz wyglądał
     na ciąg losowych ustawień zamiast na jedną płynną akcję. */
  const GLIDE = 0.55;

  /* Dziesięciu zawodników na małym parkiecie potrafi zbić się w jeden punkt
     i wtedy na mapie nie widać nic. Jedno przejście rozpychające wystarczy,
     żeby każdy był czytelny — zawodnika z piłką zostawiamy w miejscu. */
  function separate(match, pinned) {
    const all = match.home.onCourt.concat(match.away.onCourt);
    const minimum = 7;
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i];
        const b = all[j];
        let dx = b.x - a.x;
        let dy = (b.y - a.y) * 0.5;
        const distance = Math.hypot(dx, dy);
        if (distance >= minimum) continue;
        if (distance === 0) { dx = 1; dy = 0; }
        const length = distance || 1;
        const push = (minimum - distance) / 2;
        const ux = dx / length;
        const uy = dy / length;
        if (a !== pinned) {
          a.x = clamp(a.x - ux * push, 3, 97);
          a.y = clamp(a.y - uy * push * 2, 6, 94);
        }
        if (b !== pinned) {
          b.x = clamp(b.x + ux * push, 3, 97);
          b.y = clamp(b.y + uy * push * 2, 6, 94);
        }
      }
    }
  }

  function placeSide(side, attacking, ballX) {
    const phase = attacking ? 'attack' : 'defend';
    side.onCourt.forEach(spot => {
      const anchor = anchorFor(spot, phase);
      let targetX = anchor[0];
      const targetY = anchor[1];
      const pull = spot.slot === 'BR' ? 0.04 : 0.22;
      const ownBallX = side.isHome ? ballX : 100 - ballX;
      targetX = targetX + (ownBallX - targetX) * pull;
      /* pressing wypycha linię obrony wyżej albo cofa ją pod własną bramkę */
      if (!attacking && spot.slot !== 'BR') {
        targetX += PRESS_SHIFT[tacticsOf(side).pressing] || 0;
      }
      if (!side.isHome) targetX = 100 - targetX;

      if (spot.x === undefined) { spot.x = targetX; spot.y = targetY; }
      spot.x = clamp(spot.x + (targetX - spot.x) * GLIDE, 3, 97);
      spot.y = clamp(spot.y + (targetY - spot.y) * GLIDE, 6, 94);
    });
  }

  /* ---------- tworzenie meczu ---------- */

  function makeSide(entry, isHome, rng, forceId) {
    const lineup = pickLineup(entry.squad, rng, forceId, entry.lineup);
    const side = {
      teamId: entry.teamId,
      name: entry.name,
      crest: entry.crest || null,
      squad: entry.squad,
      onCourt: lineup.onCourt,
      bench: lineup.bench,
      isHome: isHome,
      isUser: !!entry.isUser,
      tactics: Object.assign({}, DEFAULT_TACTICS, entry.tactics || {}),
      goals: 0,
      shots: 0,
      onTarget: 0,
      possessionTicks: 0,
      fouls: 0
    };
    side.onCourt.forEach(spot => { spot.side = side; });
    return side;
  }

  function create(options) {
    const rng = options.rng || C.makeRng(Date.now());
    /* forceLineupId pozwala wymusić miejsce w piątce bez oddawania sterowania —
       dzięki temu symulowany mecz Trytona też wystawia twojego zawodnika */
    const force = options.userPlayerId || options.forceLineupId || null;
    const home = makeSide(options.home, true, rng, options.home.isUser ? force : null);
    const away = makeSide(options.away, false, rng, options.away.isUser ? force : null);

    [home, away].forEach(side => {
      side.squad.forEach(p => { p.matchStats = freshMatchStats(); });
      /* od której sekundy zawodnik jest na parkiecie — stąd realne minuty */
      side.onCourt.forEach(spot => { spot.player.matchStats.since = 0; });
    });

    const match = {
      rng: rng,
      home: home,
      away: away,
      userTeam: home.isUser ? home : (away.isUser ? away : null),
      userPlayerId: options.userPlayerId || null,
      clock: 0,
      half: 1,
      finished: false,
      events: [],
      ball: { x: 50, y: 50 },
      possession: rng.chance(0.5) ? home : away,
      carrier: null,
      pending: null,
      lastAssist: null,
      /* ile razy w meczu gra ma cię o coś zapytać — reszta toczy się sama */
      decisionBudget: options.decisionBudget || 10,
      decisionsUsed: 0,
      actionsThisPossession: 0,
      meta: options.meta || {}
    };

    match.userPlayer = findUserPlayer(match);
    kickOff(match, match.possession, 'Rozpoczynamy.');
    return match;
  }

  function freshMatchStats() {
    return {
      minutes: 0, goals: 0, assists: 0, shots: 0, onTarget: 0,
      passes: 0, passesOk: 0, dribbles: 0, dribblesOk: 0,
      tackles: 0, losses: 0, saves: 0, conceded: 0, rating: 6,
      since: null
    };
  }

  function findUserPlayer(match) {
    if (!match.userPlayerId) return null;
    const all = match.home.squad.concat(match.away.squad);
    return all.find(p => p.id === match.userPlayerId) || null;
  }

  function onCourtPlayer(side, player) {
    return side.onCourt.find(spot => spot.player.id === player.id) || null;
  }

  function opponentOf(match, side) {
    return side === match.home ? match.away : match.home;
  }

  /* ---------- przebieg ---------- */

  /* Nowa akcja tej samej drużyny: zerujemy licznik, przetasowujemy role w ataku,
     ale nikogo nie teleportujemy — zawodnicy dojdą na miejsce płynnie. */
  function newPossession(match, side) {
    match.possession = side;
    match.actionsThisPossession = 0;
    match.lastAssist = null;
    match.userActedThisPossession = false;
    match.userAskedThisPossession = false;
    rotateAttack(side, match.rng);
  }

  function setCarrier(match, spot, x, y) {
    match.carrier = spot;
    match.ball.x = x === undefined ? spot.x : x;
    match.ball.y = y === undefined ? spot.y : y;
    spot.x = match.ball.x;
    spot.y = match.ball.y;
  }

  /* Piłkę przejmuje ten, kto jest najbliżej — akcja toczy się dalej z tego
     samego miejsca, zamiast zaczynać od nowa w przypadkowym punkcie. */
  function nearestTo(side, x, y, skipKeeper) {
    const pool = side.onCourt.filter(spot => !skipKeeper || spot.slot !== 'BR');
    const list = pool.length ? pool : side.onCourt;
    let best = list[0];
    let bestDistance = Infinity;
    list.forEach(spot => {
      const distance = Math.hypot(spot.x - x, spot.y - y);
      if (distance < bestDistance) { bestDistance = distance; best = spot; }
    });
    return best;
  }

  function handTo(match, side, x, y, skipKeeper) {
    newPossession(match, side);
    const taker = nearestTo(side, x, y, skipKeeper);
    setCarrier(match, taker, x, y);
  }

  /* Wznowienie od środka — po golu i na początku połowy. */
  function kickOff(match, side, reason) {
    newPossession(match, side);
    const taker = nearestTo(side, 50, 50, true);
    setCarrier(match, taker, 50, 50);
    placeSide(side, true, 50);
    placeSide(opponentOf(match, side), false, 50);
    if (reason) log(match, reason, 'info');
  }

  function log(match, text, kind, extra) {
    if (!text) return;
    match.events.push(Object.assign({
      clock: match.clock,
      half: match.half,
      text: text,
      kind: kind || 'info',
      score: match.home.goals + ':' + match.away.goals
    }, extra || {}));
  }

  function timeLabel(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  /* Dystans do bramki przeciwnika, w metrach (boisko 40 m). */
  function distanceToGoal(match, spot) {
    const attackingRight = spot.side.isHome;
    const dx = attackingRight ? (100 - spot.x) : spot.x;
    const dy = Math.abs(spot.y - 50);
    return Math.sqrt(Math.pow(dx * 0.4, 2) + Math.pow(dy * 0.2, 2));
  }

  function nearestDefender(match, spot) {
    const defenders = opponentOf(match, spot.side).onCourt.filter(d => d.slot !== 'BR');
    let best = null;
    let bestDistance = Infinity;
    defenders.forEach(d => {
      const distance = Math.hypot((d.x - spot.x) * 0.4, (d.y - spot.y) * 0.2);
      if (distance < bestDistance) { bestDistance = distance; best = d; }
    });
    return { defender: best, distance: bestDistance };
  }

  function pressure(match, spot) {
    const near = nearestDefender(match, spot);
    if (!near.defender) return 0;
    const marking = tacticsOf(near.defender.side).marking;
    return clamp((1 - near.distance / 7) * (MARK_PRESSURE[marking] || 1), 0, 1);
  }

  function goalkeeperOf(side) {
    return side.onCourt.find(spot => spot.slot === 'BR') || side.onCourt[0];
  }

  /* ---------- szanse akcji ---------- */

  function shotChance(match, spot) {
    const player = spot.player;
    const distance = distanceToGoal(match, spot);
    const press = pressure(match, spot);
    const gk = goalkeeperOf(opponentOf(match, spot.side));
    const skill = distance > 12
      ? sum(player, ['longShots', 'technique', 'strength'])
      : sum(player, ['finishing', 'technique', 'balance']);
    const keeping = sum(gk.player, ['reflexes', 'handling', 'positioning']);
    const base = 0.66 - distance * 0.021 - press * 0.14;
    const edge = (skill - keeping) * 0.019;
    return clamp(base + edge, 0.03, 0.74);
  }

  function dribbleChance(match, spot) {
    const near = nearestDefender(match, spot);
    if (!near.defender) return 0.92;
    const attack = sum(spot.player, ['dribbling', 'agility', 'balance', 'technique']);
    const defence = sum(near.defender.player, ['tackling', 'marking', 'anticipation', 'strength']);
    const room = clamp(near.distance / 10, 0, 1);
    /* krycie 1v1 trudniej minąć, ale kto minie, ma potem więcej miejsca */
    const marking = MARK_BEATEN[tacticsOf(near.defender.side).marking] || 1;
    return clamp((0.5 + (attack - defence) * 0.03 + room * 0.17) * marking, 0.12, 0.94);
  }

  function passChance(match, spot, target) {
    const distance = Math.hypot((target.x - spot.x) * 0.4, (target.y - spot.y) * 0.2);
    const press = pressure(match, spot);
    const lanePress = pressure(match, target);
    const skill = sum(spot.player, ['passing', 'technique', 'decisions']);
    const reception = sum(target.player, ['offTheBall', 'technique', 'teamwork']);
    const rivals = spot.side === match.home ? match.away : match.home;
    const pressing = PRESS_PASS[tacticsOf(rivals).pressing] || 0;
    const base = 0.97 - distance * 0.007 - press * 0.13 - lanePress * 0.08 + pressing;
    return clamp(base + (skill + reception - 20) * 0.009, 0.42, 0.985);
  }

  /* Rodzaj podania bierze się z geometrii: komu, jak daleko i czy w zamkniętą
     przestrzeń. Każdy niesie inne ryzyko i inny zysk na boisku. */
  function passStyle(match, spot, target) {
    const distance = Math.hypot((target.x - spot.x) * 0.4, (target.y - spot.y) * 0.2);
    if (!isForward(spot, target)) {
      return { id: 'back', label: 'Cofnięcie', detail: 'bezpieczne, resetuje akcję', mul: 1.06, advance: 0 };
    }
    if (distance >= 17) {
      return { id: 'lob', label: 'Lob', detail: 'ponad obroną, trudny do złapania', mul: 0.72, advance: 5 };
    }
    if (pressure(match, target) > 0.45) {
      return { id: 'through', label: 'Prostopadłe', detail: 'między obrońców, prosto pod bramkę', mul: 0.76, advance: 9 };
    }
    return { id: 'short', label: 'Podanie', detail: 'po ziemi, pewne', mul: 1, advance: 0 };
  }

  function isForward(spot, target) {
    return spot.side.isHome ? target.x > spot.x + 4 : target.x < spot.x - 4;
  }

  function buildOptions(match, spot) {
    const options = [];
    const distance = distanceToGoal(match, spot);

    options.push({
      id: 'shot',
      label: distance > 12 ? 'Strzał z dystansu' : 'Strzał',
      detail: Math.round(distance) + ' m od bramki',
      chance: shotChance(match, spot),
      kind: 'shot'
    });

    options.push({
      id: 'dribble',
      label: 'Drybling',
      detail: (function () {
        const near = nearestDefender(match, spot);
        return near.defender ? 'mija ' + shortName(near.defender.player) : 'wolne pole';
      })(),
      chance: dribbleChance(match, spot),
      kind: 'dribble'
    });

    spot.side.onCourt
      .filter(mate => mate.player.id !== spot.player.id && mate.slot !== 'BR')
      .forEach(mate => {
        const style = passStyle(match, spot, mate);
        options.push({
          id: 'pass:' + mate.player.id,
          label: style.label + ' do ' + shortName(mate.player),
          detail: style.detail,
          chance: clamp(passChance(match, spot, mate) * style.mul, 0.1, 0.98),
          kind: 'pass',
          style: style.id,
          advance: style.advance,
          targetId: mate.player.id
        });
      });

    const gk = goalkeeperOf(spot.side);
    if (gk && gk.player.id !== spot.player.id) {
      options.push({
        id: 'pass:' + gk.player.id,
        label: 'Cofnij do ' + shortName(gk.player),
        detail: 'reset akcji · BR',
        chance: clamp(passChance(match, spot, gk) + 0.08, 0.3, 0.99),
        kind: 'pass',
        targetId: gk.player.id
      });
    }

    return options;
  }

  function shortName(player) {
    const parts = player.name.split(/\s+/);
    const surname = parts[0] || player.name;
    const pretty = surname.charAt(0) + surname.slice(1).toLowerCase();
    return '(' + (player.nr || '-') + ') ' + pretty;
  }

  /* ---------- wykonanie akcji ---------- */

  function spendCondition(match, side, carrierSpot) {
    const drain = (sideToDrain, base) => {
      const factor = PRESS_DRAIN[tacticsOf(sideToDrain).pressing] || 1;
      sideToDrain.onCourt.forEach(spot => {
        const cost = spot === carrierSpot ? 0.55 : base;
        const endurance = effective(spot.player, 'stamina') / 20;
        spot.player.condition = clamp(
          spot.player.condition - cost * (1.4 - endurance * 0.7) * factor, 25, 100);
      });
    };
    drain(side, 0.22);
    /* kryjący też się męczą, a wysoki pressing kosztuje najwięcej */
    drain(side === match.home ? match.away : match.home, 0.18);
  }

  function advanceClock(match, seconds) {
    match.clock += seconds;
    const limit = HALF_SECONDS * match.half;
    if (match.clock >= limit) {
      if (match.half >= HALVES) {
        match.clock = HALF_SECONDS * HALVES;
        match.finished = true;
        log(match, 'Koniec meczu. ' + match.home.name + ' ' + match.home.goals + ':' + match.away.goals + ' ' + match.away.name, 'end');
      } else {
        match.clock = limit;
        log(match, 'Przerwa. ' + match.home.goals + ':' + match.away.goals, 'half');
        /* mecz staje — zmiany i taktyka na drugą połowę */
        match.atBreak = true;
      }
    }
  }

  function restAtHalf(match) {
    [match.home, match.away].forEach(side => {
      side.squad.forEach(p => { p.condition = clamp(p.condition + 14, 25, 100); });
    });
  }

  function stat(player, key, amount) {
    player.matchStats[key] += (amount === undefined ? 1 : amount);
  }

  function rate(player, amount) {
    player.matchStats.rating = clamp(player.matchStats.rating + amount, 1, 10);
  }

  function scoreGoal(match, spot) {
    const side = spot.side;
    side.goals += 1;
    stat(spot.player, 'goals');
    rate(spot.player, 0.45);
    const assist = match.lastAssist;
    if (assist && assist.id !== spot.player.id) {
      stat(assist, 'assists');
      rate(assist, 0.3);
    }
    const gk = goalkeeperOf(opponentOf(match, side));
    stat(gk.player, 'conceded');
    rate(gk.player, -0.1);
    log(match, 'GOL! ' + shortName(spot.player) + ' dla ' + side.name +
      (assist && assist.id !== spot.player.id ? ' po podaniu ' + shortName(assist) : '') +
      ' — ' + match.home.goals + ':' + match.away.goals, 'goal', { teamId: side.teamId });
    advanceClock(match, match.rng.int(14, 26));
    if (!match.finished) kickOff(match, opponentOf(match, side), null);
  }

  function turnover(match, spot, text) {
    stat(spot.player, 'losses');
    rate(spot.player, -0.16);
    log(match, text, 'turnover');
    advanceClock(match, match.rng.int(4, 9));
    if (match.finished) return;
    handTo(match, opponentOf(match, spot.side), match.ball.x, match.ball.y, true);
  }

  /* Warianty interwencji bramkarza. Każdy inaczej zmienia szansę gola
     i inaczej odbija piłkę, więc bramkarz ma realny wybór, a nie jeden guzik. */
  const SAVE_MOVES = [
    {
      id: 'dive', label: 'Rzut w róg', detail: 'refleks i zwinność',
      keys: ['reflexes', 'agility'], goalFactor: 0.82, rebound: 0.30, closeBonus: 1
    },
    {
      id: 'line', label: 'Zostań na linii', detail: 'ustawienie, mało dobitek',
      keys: ['positioning', 'handling'], goalFactor: 0.94, rebound: 0.10, closeBonus: 1
    },
    {
      id: 'rush', label: 'Wyjście do piłki', detail: 'skraca kąt, ryzykowne',
      keys: ['anticipation', 'decisions'], goalFactor: 1.4, rebound: 0.34, closeBonus: 0.42
    },
    {
      id: 'legs', label: 'Blok nogą', detail: 'futsalowa obrona z bliska',
      keys: ['agility', 'handling'], goalFactor: 1.08, rebound: 0.44, closeBonus: 0.62
    }
  ];

  function saveOptions(match, shooterSpot, chance, gk) {
    const distance = distanceToGoal(match, shooterSpot);
    const close = distance < 9;
    return SAVE_MOVES.map(move => {
      const skill = sum(gk.player, move.keys);
      const factor = move.goalFactor * (close ? move.closeBonus : 1);
      const goalChance = clamp(chance * factor * (1 - (skill - 10) * 0.016), 0.01, 0.95);
      return {
        id: 'save:' + move.id,
        kind: 'save',
        move: move.id,
        label: move.label,
        detail: move.detail,
        chance: 1 - goalChance,
        goalChance: goalChance,
        rebound: move.rebound
      };
    });
  }

  function resolveShot(match, spot, chance, saveOption) {
    const side = spot.side;
    const gk = goalkeeperOf(opponentOf(match, side));

    /* jeżeli bronisz ty, przerywamy akcję i pytamy o interwencję — ale tylko
       przy strzale, który naprawdę zagraża, i w ramach limitu decyzji */
    if (!saveOption && match.userTeam && gk.side === match.userTeam &&
        chance > 0.2 && budgetOpen(match)) {
      match.decisionsUsed += 1;
      match.pending = {
        kind: 'save',
        player: gk.player,
        shooter: spot,
        baseChance: chance,
        options: saveOptions(match, spot, chance, gk),
        context: describeSaveContext(match, spot, gk)
      };
      return;
    }

    side.shots += 1;
    stat(spot.player, 'shots');
    if (saveOption) chance = saveOption.goalChance;
    const reboundChance = saveOption ? saveOption.rebound : 0.22;
    const roll = match.rng.next();
    if (roll < chance) {
      side.onTarget += 1;
      stat(spot.player, 'onTarget');
      scoreGoal(match, spot);
      return;
    }
    const onTargetChance = clamp(chance + 0.26, 0.1, 0.9);
    if (match.rng.next() < onTargetChance) {
      side.onTarget += 1;
      stat(spot.player, 'onTarget');
      stat(gk.player, 'saves');
      rate(gk.player, 0.12);
      rate(spot.player, 0.04);
      log(match, 'Strzał ' + shortName(spot.player) + ' — broni ' + shortName(gk.player) +
        (saveOption ? ' (' + saveOption.label.toLowerCase() + ')' : '') + '.', 'save');
      advanceClock(match, match.rng.int(7, 13));
      if (match.finished) return;
      if (match.rng.chance(reboundChance)) {
        /* dobitka — piłka odbija się przed bramką i zostaje w grze */
        handTo(match, side, gk.x, gk.y, true);
        log(match, 'Dobitka zostaje przy ' + side.name + '.', 'info');
      } else {
        /* bramkarz łapie i wyprowadza */
        newPossession(match, opponentOf(match, side));
        setCarrier(match, gk);
      }
      return;
    }
    rate(spot.player, -0.08);
    log(match, 'Strzał ' + shortName(spot.player) + ' obok bramki.', 'miss');
    advanceClock(match, match.rng.int(7, 12));
    if (match.finished) return;
    /* wznowienie od bramki */
    newPossession(match, opponentOf(match, side));
    setCarrier(match, gk);
  }

  function resolveDribble(match, spot, chance) {
    stat(spot.player, 'dribbles');
    const near = nearestDefender(match, spot);
    if (match.rng.next() < chance) {
      stat(spot.player, 'dribblesOk');
      rate(spot.player, 0.05);
      const push = spot.side.isHome ? 1 : -1;
      const space = near.defender ? (MARK_SPACE[tacticsOf(near.defender.side).marking] || 1) : 1;
      spot.x = clamp(spot.x + push * match.rng.int(8, 18) * space, 4, 96);
      spot.y = clamp(spot.y + (match.rng.next() - 0.5) * 16, 8, 92);
      match.ball.x = spot.x;
      match.ball.y = spot.y;
      log(match, shortName(spot.player) + ' mija rywala i wchodzi w pole.', 'dribble');
      advanceClock(match, match.rng.int(4, 8));
      match.actionsThisPossession += 1;
      return true;
    }
    if (near.defender) {
      stat(near.defender.player, 'tackles');
      rate(near.defender.player, 0.12);
    }
    turnover(match, spot, shortName(spot.player) + ' traci piłkę w dryblingu' +
      (near.defender ? ' — odbiera ' + shortName(near.defender.player) : '') + '.');
    return false;
  }

  function resolvePass(match, spot, target, option) {
    const chance = option.chance;
    stat(spot.player, 'passes');
    if (match.rng.next() < chance) {
      stat(spot.player, 'passesOk');
      rate(spot.player, 0.006);
      match.lastAssist = spot.player;
      /* prostopadłe i lob wypuszczają kolegę bliżej bramki */
      if (option.advance) {
        const push = spot.side.isHome ? option.advance : -option.advance;
        target.x = clamp(target.x + push, 4, 96);
      }
      match.carrier = target;
      match.ball.x = target.x;
      match.ball.y = target.y;
      advanceClock(match, match.rng.int(3, 6));
      match.actionsThisPossession += 1;
      return true;
    }
    turnover(match, spot, 'Podanie ' + shortName(spot.player) + ' przechwycone.');
    return false;
  }

  function applyOption(match, spot, option) {
    spendCondition(match, spot.side, spot);
    if (option.kind === 'shot') { resolveShot(match, spot, option.chance); return; }
    if (option.kind === 'dribble') { resolveDribble(match, spot, option.chance); return; }
    const target = spot.side.onCourt.find(s => s.player.id === option.targetId);
    if (!target) { turnover(match, spot, 'Zgubiona piłka.'); return; }
    resolvePass(match, spot, target, option);
  }

  /* ---------- wybór komputera ---------- */

  function chooseForAi(match, spot, options) {
    const distance = distanceToGoal(match, spot);
    const press = pressure(match, spot);
    const player = spot.player;
    const aggression = (sum(player, ['determination', 'creativity']) / 20);

    const scored = options.map(option => {
      let value = option.chance;
      if (option.kind === 'shot') {
        value *= (distance < 10 ? 9 : distance < 15 ? 4.5 : distance < 22 ? 1.1 : 0.4) *
          (1 + aggression * 0.35) * (TEMPO_SHOT[tacticsOf(spot.side).tempo] || 1);
        if (match.actionsThisPossession < 1) value *= 0.4;
        if (match.actionsThisPossession >= 5) value *= 1.7;
      } else if (option.kind === 'dribble') {
        value *= press > 0.5 ? 1.1 : 0.8;
        if (distance < 10) value *= 0.6;
      } else {
        const target = spot.side.onCourt.find(s => s.player.id === option.targetId);
        if (target) {
          /* podanie jest tym cenniejsze, im bardziej zbliża piłkę do bramki */
          const gain = distance - distanceToGoal(match, target);
          value *= 1 + Math.max(0, gain) * (TEMPO_GAIN[tacticsOf(spot.side).tempo] || 0.09);
          if (target.slot === 'BR') {
            /* w futsalu bramkarz jest piątym rozgrywającym — cofka do niego to
               normalny element akcji, a nie ostateczność pod presją */
            let back = 0.4;
            if (press > 0.55) back = 1.1;
            if (match.actionsThisPossession < 2) back += 0.25;
            value *= back;
          }
        }
        if (match.actionsThisPossession > 4) value *= 0.7;
      }
      return { option: option, value: Math.max(value, 0.001) };
    });

    const total = scored.reduce((t, s) => t + s.value, 0);
    let roll = match.rng.next() * total;
    for (const entry of scored) {
      roll -= entry.value;
      if (roll <= 0) return entry.option;
    }
    return scored[scored.length - 1].option;
  }

  /* ---------- pętla ---------- */

  /* Gra pyta tylko o sytuacje, które coś znaczą, i pilnuje, żeby limit decyzji
     rozłożył się na cały mecz, a nie wyczerpał w pierwszym kwadransie. */
  function budgetOpen(match) {
    if (match.decisionsUsed >= match.decisionBudget) return false;
    const timeShare = match.clock / (HALF_SECONDS * HALVES);
    const usedShare = match.decisionsUsed / match.decisionBudget;
    return usedShare <= timeShare + 0.22;
  }

  /* Limit liczy akcje, nie kliknięcia. Gdy akcja już jest twoja — bo właśnie
     minąłeś rywala dryblingiem — pytamy dalej w jej ramach za darmo. */
  function worthAsking(match, spot, options) {
    if (match.userAskedThisPossession) return true;
    if (!budgetOpen(match)) return false;
    const distance = distanceToGoal(match, spot);
    if (distance < 16) return true;
    const shot = options.find(option => option.kind === 'shot');
    return !!(shot && shot.chance > 0.22);
  }

  /* Wykonuje dokładnie jedną akcję, żeby interfejs mógł pokazać mecz płynnie,
     zagranie po zagraniu, zamiast przeskakiwać od decyzji do decyzji. */
  /* Wznowienie po przerwie. */
  function resume(match) {
    if (!match.atBreak) return false;
    match.atBreak = false;
    match.half += 1;
    restAtHalf(match);
    kickOff(match, match.rng.chance(0.5) ? match.home : match.away, 'Druga połowa.');
    return true;
  }

  function tick(match) {
    if (match.finished) return { type: 'end' };
    if (match.atBreak) return { type: 'break' };
    if (match.pending) return { type: 'decision', decision: match.pending };

    /* zawodnicy schodzący z parkietu dobiegają do linii i znikają */
    if (match.leaving && match.leaving.length) {
      match.leaving.forEach(entry => {
        entry.ticks -= 1;
        entry.y = entry.y + (entry.side.isHome ? 102 - entry.y : 102 - entry.y) * 0.6;
      });
      match.leaving = match.leaving.filter(entry => entry.ticks > 0);
    }

    const spot = match.carrier;
    if (!spot) {
      kickOff(match, match.possession, null);
      return { type: 'action' };
    }

    spot.side.possessionTicks += 1;
    placeSide(spot.side, true, match.ball.x, match.rng);
    placeSide(opponentOf(match, spot.side), false, match.ball.x, match.rng);
    /* zawodnik z piłką zostaje tam, gdzie piłka */
    spot.x = match.ball.x;
    spot.y = match.ball.y;
    separate(match, spot);

    const options = buildOptions(match, spot);

    /* Pytamy raz na akcję: gdy już zagrałeś podanie, reszta tej akcji toczy się
       bez ciebie — aż piłka wróci do ciebie w nowej sytuacji. */
    const mine = match.userTeam && spot.side === match.userTeam;
    if (mine && !match.userActedThisPossession && worthAsking(match, spot, options)) {
      if (!match.userAskedThisPossession) {
        match.userAskedThisPossession = true;
        match.decisionsUsed += 1;
      }
      match.pending = {
        kind: 'ball',
        player: spot.player,
        options: options,
        context: describeContext(match, spot)
      };
      return { type: 'decision', decision: match.pending };
    }

    const picked = chooseForAi(match, spot, options);
    applyOption(match, spot, picked);
    /* strzał rywala mógł wywołać decyzję twojego bramkarza */
    if (match.pending) return { type: 'decision', decision: match.pending };

    if (match.actionsThisPossession > 9 && !match.finished) {
      advanceClock(match, match.rng.int(5, 12));
      if (!match.finished) handTo(match, opponentOf(match, spot.side), match.ball.x, match.ball.y, true);
    }
    return { type: match.finished ? 'end' : 'action' };
  }

  /* Przesuwa mecz do najbliższej decyzji gracza albo do końca spotkania. */
  function step(match) {
    let guard = 0;
    let result = tick(match);
    while (result.type === 'action' && guard++ < 4000) result = tick(match);
    return result;
  }

  function describeContext(match, spot) {
    const near = nearestDefender(match, spot);
    const distance = distanceToGoal(match, spot);
    return {
      clock: timeLabel(match.clock),
      half: match.half,
      distance: Math.round(distance),
      carrier: shortName(spot.player),
      slot: spot.slot,
      marker: near.defender ? shortName(near.defender.player) : null,
      pressure: Math.round(pressure(match, spot) * 100),
      condition: Math.round(spot.player.condition),
      scoreLine: match.home.goals + ' : ' + match.away.goals
    };
  }

  function describeSaveContext(match, shooterSpot, gk) {
    return {
      clock: timeLabel(match.clock),
      half: match.half,
      distance: Math.round(distanceToGoal(match, shooterSpot)),
      keeper: gk ? shortName(gk.player) : null,
      shooter: shortName(shooterSpot.player),
      shooterTeam: shooterSpot.side.name,
      scoreLine: match.home.goals + ' : ' + match.away.goals
    };
  }

  function choose(match, optionId) {
    if (!match.pending) return step(match);
    const pending = match.pending;
    const option = pending.options.find(o => o.id === optionId) || pending.options[0];
    match.pending = null;

    if (pending.kind === 'save') {
      resolveShot(match, pending.shooter, pending.baseChance, option);
      return { type: match.finished ? 'end' : 'action' };
    }

    /* po własnym podaniu oddajesz akcję drużynie i tylko ją oglądasz */
    if (option.kind === 'pass') match.userActedThisPossession = true;

    applyOption(match, match.carrier, option);
    if (match.pending) return { type: 'decision', decision: match.pending };
    return { type: match.finished ? 'end' : 'action' };
  }

  /* ---------- zmiany ---------- */

  function substitute(match, outPlayerId, inPlayerId) {
    const side = match.userTeam;
    if (!side) return false;
    const spot = side.onCourt.find(s => s.player.id === outPlayerId);
    const incoming = side.bench.find(p => p.id === inPlayerId);
    if (!spot || !incoming) return false;
    /* nie da się zmienić zawodnika, który właśnie ma piłkę */
    if (match.carrier && match.carrier.player.id === outPlayerId) {
      return { blocked: 'Ten zawodnik ma piłkę — najpierw rozegraj akcję.' };
    }
    const outgoing = spot.player;
    outgoing.matchStats.minutes += Math.max(0, match.clock - (outgoing.matchStats.since || 0)) / 60;
    outgoing.matchStats.since = null;
    incoming.matchStats.since = match.clock;

    /* schodzący zostaje chwilę na mapie i dobiega do linii, wchodzący startuje
       z bocznej linii — widać, jak jeden zbiega, a drugi wbiega */
    match.leaving = (match.leaving || []).concat([{
      player: outgoing, side: side, x: spot.x, y: spot.y, ticks: 3
    }]);
    spot.player = incoming;
    spot.x = spot.x;
    spot.y = 99;
    side.bench = side.bench.filter(p => p.id !== inPlayerId).concat([outgoing]);
    log(match, 'Zmiana w ' + side.name + ': ' + shortName(incoming) + ' za ' + shortName(outgoing) + '.', 'sub');
    return true;
  }

  /* ---------- rozliczenie ---------- */

  function finalise(match) {
    const fullTime = HALF_SECONDS * HALVES;
    [match.home, match.away].forEach(side => {
      side.onCourt.forEach(spot => {
        const ms = spot.player.matchStats;
        ms.minutes += Math.max(0, fullTime - (ms.since || 0)) / 60;
        ms.since = null;
      });
      side.squad.forEach(player => {
        if (player.matchStats) player.matchStats.minutes = Math.round(player.matchStats.minutes);
      });
      side.squad.forEach(player => {
        const ms = player.matchStats;
        if (!ms) return;
        const played = ms.minutes > 0;
        if (played) {
          player.season.apps += 1;
          player.career.apps += 1;
          player.season.ratingSum += ms.rating;
          player.career.ratingSum += ms.rating;
        }
        ['goals', 'assists', 'shots', 'onTarget', 'passes', 'passesOk',
          'dribbles', 'dribblesOk', 'tackles', 'losses', 'saves', 'conceded', 'minutes']
          .forEach(key => {
            player.season[key] += ms[key];
            player.career[key] += ms[key];
          });
      });
    });

    const all = match.home.onCourt.concat(match.away.onCourt)
      .sort((a, b) => b.player.matchStats.rating - a.player.matchStats.rating);
    if (all.length) {
      all[0].player.matchStats.motm = true;
      all[0].player.season.motm += 1;
      all[0].player.career.motm += 1;
    }

    return {
      homeGoals: match.home.goals,
      awayGoals: match.away.goals,
      motm: all.length ? all[0].player : null,
      events: match.events
    };
  }

  global.TrytonMatch = {
    create: create,
    step: step,
    tick: tick,
    resume: resume,
    DEFAULT_TACTICS: DEFAULT_TACTICS,
    TACTIC_CHOICES: {
      pressing: ['niski', 'normalny', 'wysoki'],
      marking: ['strefa', '1v1'],
      tempo: ['spokojne', 'normalne', 'szybkie']
    },
    choose: choose,
    substitute: substitute,
    finalise: finalise,
    pickLineup: pickLineup,
    LINEUP_SLOTS: ['BR', 'OBR', 'UNI', 'UNI', 'NAP'],
    shortName: shortName,
    timeLabel: timeLabel,
    HALF_SECONDS: HALF_SECONDS,
    HALVES: HALVES,
    fullTime: HALF_SECONDS * HALVES
  };
})(window);
