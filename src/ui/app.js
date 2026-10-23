/* Interfejs gry: ekran startowy, wybór zawodnika, edytor statystyk, hub sezonu,
   mecz 4+1 z pauzą na decyzję, raport i podsumowanie sezonu. */
(function (global) {
  'use strict';

  const A = global.TrytonAttributes;
  const C = global.TrytonCore;
  const S = global.TrytonSeason;
  const M = global.TrytonMatch;

  const root = document.getElementById('app');

  const ui = {
    screen: 'start',
    tab: 'terminarz',
    tableLeague: null,
    state: null,
    match: null,
    matchFixture: null,
    pendingFixture: null,
    lineupDraft: null,
    lineupSlot: null,
    speed: 'normalnie',
    playTimer: null,
    lastSeen: 0,
    report: null,
    seasonSummary: null,
    draft: null,
    editorPlayerId: null
  };

  /* ---------- pomocnicze ---------- */

  const esc = text => String(text == null ? '' : text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const pretty = name => String(name || '').split(/\s+/).map(part =>
    part.charAt(0) + part.slice(1).toLowerCase()).join(' ');

  function ovrClass(value) {
    if (value >= 62) return 'hi';
    if (value >= 44) return 'md';
    return 'lo';
  }

  function pctClass(chance) {
    if (chance >= 0.65) return 'hi';
    if (chance >= 0.38) return 'md';
    return 'lo';
  }

  /* Krótka forma nazwy na wąski ekran: tyle pierwszych słów, ile zmieści się
     w kilkunastu znakach, żeby nie zostało samo „Tr…". */
  function shortTeamName(name) {
    const words = String(name).split(/\s+/);
    let out = words[0] || name;
    for (let i = 1; i < words.length && out.length < 9; i++) {
      if (words[i] === '|' || words[i] === '/' || words[i] === '-') break;
      out += ' ' + words[i];
    }
    return out;
  }

  function leagueName(league) {
    return league + ' Liga';
  }

  function dateLabel(iso) {
    if (!iso) return '';
    const months = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
      'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
    const parts = iso.split('-');
    return Number(parts[2]) + ' ' + months[Number(parts[1]) - 1] + ' ' + parts[0];
  }

  function teamOf(id) {
    return ui.state.teams[id];
  }

  function userTeam() {
    return teamOf(ui.state.userTeamId);
  }

  function userPlayer() {
    const team = userTeam();
    return team.squad.find(p => p.id === ui.state.userPlayerId) || null;
  }

  function crestTag(team, cls) {
    if (!team || !team.crest) return '';
    return '<img class="' + (cls || 'crest-sm') + '" src="' + esc(team.crest) + '" alt="">';
  }

  function render(html) {
    root.innerHTML = html;
    bind();
  }

  /* Deleguje kliknięcia: każdy element z data-act wywołuje actions[nazwa]. */
  function bind() {
    root.querySelectorAll('[data-act]').forEach(node => {
      node.addEventListener('click', event => {
        const name = node.getAttribute('data-act');
        const handler = actions[name];
        if (handler) handler(node.dataset, event, node);
      });
    });
    root.querySelectorAll('[data-change]').forEach(node => {
      node.addEventListener('input', event => {
        const handler = actions[node.getAttribute('data-change')];
        if (handler) handler(node.dataset, event, node);
      });
    });
  }

  /* ================= ekran startowy ================= */

  function buildLabel() {
    return 'wersja ' + (global.TRYTON_BUILD || '—');
  }

  function screenStart() {
    const save = C.storage.describe();

    let saveBox = '';
    if (save.state) {
      saveBox = '<div class="row" style="justify-content:center">' +
        '<button data-act="loadGame">WCZYTAJ — SEZON ' + esc(save.label) + '</button>' +
        '<button class="danger small" data-act="wipeSave">SKASUJ ZAPIS</button></div>';
    } else if (save.error === 'wersja') {
      saveBox = '<div class="panel" style="border-color:rgba(243,221,132,.4)">' +
        '<div class="label">Zapis ze starszej wersji</div>' +
        '<div class="muted" style="margin:6px 0 12px;font-size:13px">' +
        'Gra zmieniła się na tyle, że tamtej kariery nie da się już wczytać. ' +
        'Skasuj zapis i zacznij od nowa — to normalne na etapie testów.</div>' +
        '<button class="danger" data-act="wipeSave">SKASUJ STARY ZAPIS</button></div>';
    } else if (save.error === 'uszkodzony') {
      saveBox = '<div class="row" style="justify-content:center">' +
        '<button class="danger" data-act="wipeSave">SKASUJ USZKODZONY ZAPIS</button></div>';
    }

    return '<div class="hero">' +
      '<div class="kicker">XX KAPPA BUSINESS LEAGUE · SZCZECIN</div>' +
      '<h1>Tryton Actoom Szczecin</h1>' +
      '<p>Prowadzisz cały zespół na parkiecie 4+1: ustawiasz piątkę, wybierasz taktykę ' +
      'i podejmujesz dziesięć decyzji na mecz. Prawdziwe drużyny, prawdziwe składy, ' +
      'prawdziwy terminarz od 16 października 2026.</p>' +
      '</div>' +
      '<div class="panel stack center">' +
      '<div class="row" style="justify-content:center">' +
      '<button class="primary" data-act="newGame">NOWA KARIERA</button>' +
      '</div>' + saveBox +
      '<div class="faint" style="font-size:12px">' +
      esc(global.KAPPA_DATA.teams.length) + ' drużyn · 4 ligi · ' +
      esc(global.KAPPA_DATA.fixtures.length) + ' meczów w pierwszym sezonie · ' +
      esc(buildLabel()) +
      '</div></div>';
  }

  /* ================= wybór zawodnika ================= */

  function screenPick() {
    const team = userTeam();
    const draft = ui.draft;
    const squad = team.squad.slice().sort((a, b) => Number(a.nr) - Number(b.nr));

    const cards = squad.map(player =>
      '<button class="player-card' + (draft.playerId === player.id ? ' selected' : '') + '" ' +
      'data-act="pickPlayer" data-id="' + player.id + '">' +
      '<span class="shirt' + (draft.playerId === player.id ? ' gold' : '') + '">' + esc(player.nr) + '</span>' +
      '<span class="grow"><b>' + esc(pretty(player.name)) + '</b>' +
      '<span class="sub faint" style="display:block;font-size:11px">' +
      esc(A.POSITIONS[player.position].label) + ' · ' + player.age + ' lat</span></span>' +
      '<span class="ovr ' + ovrClass(player.ovr) + '">' + player.ovr + '</span>' +
      '</button>').join('');

    const chosen = draft.playerId ? team.squad.find(p => p.id === draft.playerId) : null;

    const form = !chosen ? '<div class="faint">Wskaż zawodnika z listy po lewej.</div>' :
      '<div class="stack">' +
      '<div><div class="label">Twój zawodnik</div><h3>' + esc(pretty(chosen.name)) +
      ' <span class="faint">#' + esc(chosen.nr) + '</span></h3></div>' +
      '<label class="field"><span class="label">Pozycja</span>' +
      '<select data-change="setDraftPosition">' +
      A.POSITION_ORDER.map(key => '<option value="' + key + '"' +
        (draft.position === key ? ' selected' : '') + '>' +
        esc(A.POSITIONS[key].label) + '</option>').join('') +
      '</select></label>' +
      '<label class="field"><span class="label">Wiek — ' + draft.age + ' lat</span>' +
      '<input type="range" min="16" max="46" value="' + draft.age + '" data-change="setDraftAge">' +
      '</label>' +
      '<label class="field"><span class="label">Punkt startowy</span>' +
      '<select data-change="setDraftStart">' +
      START_POINTS.map((entry, index) => '<option value="' + index + '"' +
        (draft.startIndex === index ? ' selected' : '') + '>' +
        esc(entry.label) + ' — ' + entry.base * 5 + ' OVR</option>').join('') +
      '</select></label>' +
      '<button class="primary" data-act="confirmPlayer">DALEJ — EDYCJA SKŁADU</button>' +
      '</div>';

    return topbarSimple('Kim grasz?', 'Skład Trytona z Tournify — dwadzieścia prawdziwych nazwisk') +
      '<div class="grid-2">' +
      '<div class="panel stack">' +
      '<div class="label">Skład Trytona</div>' +
      '<div class="stack" style="max-height:60vh;overflow-y:auto">' + cards + '</div>' +
      '</div>' +
      '<div class="panel">' + form + '</div>' +
      '</div>';
  }

  const START_POINTS = [
    { label: 'Dopiero zaczynam', base: 5 },
    { label: 'Grywam w weekend', base: 7 },
    { label: 'Solidny ligowiec', base: 9 },
    { label: 'Najlepszy w drużynie', base: 11.5 },
    { label: 'Klasa ponad ligę', base: 14 }
  ];

  /* ================= edytor statystyk ================= */

  function screenEditor() {
    const team = userTeam();
    const squad = team.squad.slice().sort((a, b) => Number(a.nr) - Number(b.nr));
    const current = squad.find(p => p.id === ui.editorPlayerId) || squad[0];
    ui.editorPlayerId = current.id;

    const list = squad.map(player =>
      '<button class="player-card' + (player.id === current.id ? ' selected' : '') + '" ' +
      'data-act="editPlayer" data-id="' + player.id + '">' +
      '<span class="shirt' + (player.id === ui.state.userPlayerId ? ' gold' : '') + '">' + esc(player.nr) + '</span>' +
      '<span class="grow"><b>' + esc(pretty(player.name)) + '</b>' +
      '<span class="faint" style="display:block;font-size:11px">' +
      esc(A.POSITIONS[player.position].short) + ' · ' + player.age + ' lat' +
      (player.id === ui.state.userPlayerId ? ' · TY' : '') + '</span></span>' +
      '<span class="ovr ' + ovrClass(player.ovr) + '">' + player.ovr + '</span>' +
      '</button>').join('');

    return topbarSimple('Edycja składu', 'Przed pierwszym sezonem możesz poprawić statystyki — tylko w Trytonie') +
      '<div class="grid-2">' +
      '<div class="panel stack"><div class="label">Zawodnicy</div>' +
      '<div class="stack" style="max-height:58vh;overflow-y:auto">' + list + '</div></div>' +
      '<div class="panel stack">' + editorForm(current) + '</div>' +
      '</div>' +
      '<div class="panel row between wrap">' +
      '<div class="faint" style="font-size:12px">Statystyki możesz zmieniać tylko teraz. Po starcie sezonu rosną już same.</div>' +
      '<div class="row">' +
      '<button data-act="randomiseSquad">LOSUJ PONOWNIE</button>' +
      '<button class="primary" data-act="startSeason">ZACZNIJ SEZON</button>' +
      '</div></div>';
  }

  function editorForm(player) {
    const position = A.POSITIONS[player.position];
    const critical = new Set(position.critical);

    const groups = A.GROUP_ORDER.map(group => {
      const keys = A.keysInGroup(group);
      /* bramkarskie pokazujemy zawsze — przy uniwersalnym składzie ktoś i tak staje w bramce */
      const rows = keys.map(key =>
        '<div class="attr' + (critical.has(key) ? ' crit' : '') + '">' +
        '<span class="name">' + esc(A.label(key)) + '</span>' +
        '<input type="range" min="1" max="20" value="' + player.attributes[key] + '" ' +
        'data-change="setAttr" data-key="' + key + '">' +
        '<span class="val">' + player.attributes[key] + '</span>' +
        '</div>').join('');
      return '<div><div class="label" style="margin:12px 0 7px">' +
        esc(A.GROUPS[group].label) + '</div><div class="attr-grid">' + rows + '</div></div>';
    }).join('');

    return '<div class="row between">' +
      '<div><div class="label">' + esc(position.label) + ' · ' + player.age + ' lat</div>' +
      '<h3>' + esc(pretty(player.name)) + ' <span class="faint">#' + esc(player.nr) + '</span></h3></div>' +
      '<span class="ovr ' + ovrClass(player.ovr) + '" style="font-size:20px">' + player.ovr + '</span>' +
      '</div>' +
      '<label class="field"><span class="label">Pozycja</span>' +
      '<select data-change="setEditorPosition">' +
      A.POSITION_ORDER.map(key => '<option value="' + key + '"' +
        (player.position === key ? ' selected' : '') + '>' + esc(A.POSITIONS[key].label) +
        '</option>').join('') +
      '</select></label>' +
      groups;
  }

  /* ================= hub sezonu ================= */

  function topbar() {
    const team = userTeam();
    const me = userPlayer();
    const fixture = S.nextUserFixture(ui.state);
    return '<div class="topbar">' +
      crestTag(team, 'crest') +
      '<div class="grow"><h1>' + esc(team.name) + '</h1>' +
      '<div class="sub">' + esc(leagueName(team.league)) + ' · sezon ' + esc(ui.state.seasonLabel) +
      (me ? ' · ' + esc(pretty(me.name)) + ' #' + esc(me.nr) + ' (' +
        esc(A.POSITIONS[me.position].short) + ', ' + me.age + ' lat)' : '') +
      '</div></div>' +
      (me ? '<span class="ovr ' + ovrClass(me.ovr) + '" style="font-size:20px">' + me.ovr + '</span>' : '') +
      '<button class="small" data-act="save">ZAPISZ</button>' +
      (fixture ? '' : '<span class="badge gold">SEZON ZAKOŃCZONY</span>') +
      '<span class="faint build">' + esc(buildLabel()) + '</span>' +
      '</div>';
  }

  function topbarSimple(title, subtitle) {
    return '<div class="topbar"><div class="grow"><h1>' + esc(title) + '</h1>' +
      '<div class="sub">' + esc(subtitle) + '</div></div></div>';
  }

  function screenHub() {
    const tabs = [
      ['terminarz', 'TERMINARZ'],
      ['tabela', 'TABELA'],
      ['sklad', 'SKŁAD'],
      ['historia', 'HISTORIA']
    ];
    const nav = '<div class="tabs">' + tabs.map(entry =>
      '<button class="' + (ui.tab === entry[0] ? 'active' : '') + '" ' +
      'data-act="setTab" data-tab="' + entry[0] + '">' + entry[1] + '</button>').join('') + '</div>';

    let body = '';
    if (ui.tab === 'terminarz') body = tabFixtures();
    else if (ui.tab === 'tabela') body = tabTable();
    else if (ui.tab === 'sklad') body = tabSquad();
    else body = tabHistory();

    return topbar() + nav + body;
  }

  function tabFixtures() {
    const next = S.nextUserFixture(ui.state);
    const mine = ui.state.fixtures.filter(f =>
      f.home === ui.state.userTeamId || f.away === ui.state.userTeamId);

    const action = next
      ? '<button class="primary" data-act="playMatch">ZAGRAJ MECZ</button>' +
        '<button data-act="simMatch">SYMULUJ TEN MECZ</button>'
      : '<button class="primary" data-act="finishSeason">PODSUMUJ SEZON</button>';

    const nextCard = next ? '<div class="panel">' +
      '<div class="label">Najbliższy mecz · ' + esc(dateLabel(next.date)) +
      (next.time ? ', ' + esc(next.time) : '') + ' · Boisko ' + next.pitch + '</div>' +
      '<div class="row between wrap" style="margin-top:10px">' +
      '<h2>' + crestTag(teamOf(next.home)) + esc(teamOf(next.home).name) +
      ' <span class="faint">vs</span> ' + crestTag(teamOf(next.away)) + esc(teamOf(next.away).name) + '</h2>' +
      '<div class="row">' + action + '</div>' +
      '</div></div>'
      : '<div class="panel row between wrap"><h2>Wszystkie mecze rozegrane</h2><div class="row">' + action + '</div></div>';

    const rows = mine.map(fixture => {
      const home = teamOf(fixture.home);
      const away = teamOf(fixture.away);
      const isHome = fixture.home === ui.state.userTeamId;
      const result = fixture.played
        ? fixture.homeGoals + ' : ' + fixture.awayGoals
        : (fixture.time || '—');
      let mark = '';
      if (fixture.played) {
        const my = isHome ? fixture.homeGoals : fixture.awayGoals;
        const their = isHome ? fixture.awayGoals : fixture.homeGoals;
        mark = my > their ? '<span class="badge green">W</span>'
          : my < their ? '<span class="badge red">P</span>'
          : '<span class="badge">R</span>';
      }
      return '<tr' + (fixture === next ? ' class="me"' : '') + '>' +
        '<td class="faint nowrap">' + esc(dateLabel(fixture.date)) + '</td>' +
        '<td>' + crestTag(home) + esc(home.name) + '</td>' +
        '<td class="num mono">' + esc(result) + '</td>' +
        '<td>' + crestTag(away) + esc(away.name) + '</td>' +
        '<td class="num">' + mark + '</td></tr>';
    }).join('');

    return nextCard + '<div class="panel"><div class="label">Terminarz Trytona</div>' +
      '<table><thead><tr><th>Data</th><th>Gospodarz</th><th class="num">Wynik</th>' +
      '<th>Gość</th><th class="num"></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function tabTable() {
    const league = ui.tableLeague || userTeam().league;
    const rows = S.table(ui.state, league);
    const count = rows.length;

    const picker = '<div class="tabs">' + [1, 2, 3, 4].map(value =>
      '<button class="' + (value === league ? 'active' : '') + '" ' +
      'data-act="setLeague" data-league="' + value + '">' + value + ' LIGA</button>').join('') + '</div>';

    const body = rows.map((row, index) => {
      const classes = [];
      if (row.teamId === ui.state.userTeamId) classes.push('me');
      if (league > 1 && index < S.PROMOTED) classes.push('promo');
      if (league < 4 && index >= count - S.RELEGATED) classes.push('releg');
      return '<tr class="' + classes.join(' ') + '">' +
        '<td class="num faint">' + (index + 1) + '</td>' +
        '<td>' + crestTag(teamOf(row.teamId)) + esc(row.name) + '</td>' +
        '<td class="num">' + row.played + '</td>' +
        '<td class="num">' + row.won + '</td>' +
        '<td class="num">' + row.drawn + '</td>' +
        '<td class="num">' + row.lost + '</td>' +
        '<td class="num mono">' + row.goalsFor + ':' + row.goalsAgainst + '</td>' +
        '<td class="num mono">' + (row.goalsFor - row.goalsAgainst > 0 ? '+' : '') +
        (row.goalsFor - row.goalsAgainst) + '</td>' +
        '<td class="num"><b>' + row.points + '</b></td></tr>';
    }).join('');

    return picker + '<div class="panel">' +
      '<table><thead><tr><th class="num">#</th><th>Drużyna</th><th class="num">M</th>' +
      '<th class="num">W</th><th class="num">R</th><th class="num">P</th>' +
      '<th class="num">Gole</th><th class="num">+/-</th><th class="num">Pkt</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table>' +
      '<div class="faint" style="font-size:11.5px;margin-top:10px">' +
      (league > 1 ? 'Zielony pasek — awans do ' + leagueName(league - 1) + '. ' : '') +
      (league < 4 ? 'Czerwony — spadek do ' + leagueName(league + 1) + '.' : '') +
      '</div></div>';
  }

  function tabSquad() {
    const team = userTeam();
    const squad = team.squad.slice().sort((a, b) =>
      A.POSITION_ORDER.indexOf(a.position) - A.POSITION_ORDER.indexOf(b.position) || b.ovr - a.ovr);

    const rows = squad.map(player => {
      const stats = player.season;
      const rating = stats.apps ? (stats.ratingSum / stats.apps).toFixed(2) : '—';
      return '<tr' + (player.id === ui.state.userPlayerId ? ' class="me"' : '') + '>' +
        '<td class="num faint">' + esc(player.nr) + '</td>' +
        '<td>' + esc(pretty(player.name)) + (player.id === ui.state.userPlayerId ? ' <span class="badge gold">TY</span>' : '') + '</td>' +
        '<td class="faint">' + esc(A.POSITIONS[player.position].short) + '</td>' +
        '<td class="num">' + player.age + '</td>' +
        '<td class="num"><span class="ovr ' + ovrClass(player.ovr) + '">' + player.ovr + '</span></td>' +
        '<td class="num">' + Math.round(player.condition) + '%</td>' +
        '<td class="num">' + stats.apps + '</td>' +
        '<td class="num">' + stats.goals + '</td>' +
        '<td class="num">' + stats.assists + '</td>' +
        '<td class="num mono">' + rating + '</td></tr>';
    }).join('');

    return '<div class="panel"><div class="label">Skład ' + esc(team.name) + '</div>' +
      '<table><thead><tr><th class="num">#</th><th>Zawodnik</th><th>Poz</th>' +
      '<th class="num">Wiek</th><th class="num">OVR</th><th class="num">Kond.</th>' +
      '<th class="num">M</th><th class="num">G</th><th class="num">A</th>' +
      '<th class="num">Ocena</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function tabPlayer() {
    const me = userPlayer();
    if (!me) return '<div class="panel">Brak zawodnika.</div>';
    const s = me.season;
    const c = me.career;

    const tile = (key, value) => '<div class="tile"><div class="k">' + key + '</div><div class="v">' + value + '</div></div>';
    const rating = s.apps ? (s.ratingSum / s.apps).toFixed(2) : '—';

    const attrs = A.GROUP_ORDER.map(group => {
      /* to samo w karcie zawodnika: chwyt i refleks mogą się przydać każdemu */
      const critical = new Set(A.POSITIONS[me.position].critical);
      const rows = A.keysInGroup(group).map(key =>
        '<div class="attr' + (critical.has(key) ? ' crit' : '') + '">' +
        '<span class="name">' + esc(A.label(key)) + '</span>' +
        '<span class="bar"><i style="width:' + (me.attributes[key] / 20 * 100) + '%"></i></span>' +
        '<span class="val">' + me.attributes[key] + '</span></div>').join('');
      return '<div><div class="label" style="margin:14px 0 7px">' + esc(A.GROUPS[group].label) +
        '</div><div class="attr-grid">' + rows + '</div></div>';
    }).join('');

    return '<div class="panel stack">' +
      '<div class="row between wrap">' +
      '<div><div class="label">' + esc(A.POSITIONS[me.position].label) + ' · ' + me.age + ' lat · ' +
      'potencjał ' + me.potential + '</div><h2>' + esc(pretty(me.name)) + ' #' + esc(me.nr) + '</h2></div>' +
      '<span class="ovr ' + ovrClass(me.ovr) + '" style="font-size:26px;padding:8px 14px">' + me.ovr + '</span>' +
      '</div>' +
      '<div class="label">Ten sezon</div>' +
      '<div class="tiles">' +
      tile('Mecze', s.apps) + tile('Gole', s.goals) + tile('Asysty', s.assists) +
      tile('Ocena', rating) + tile('Strzały', s.shots) + tile('Celne', s.onTarget) +
      tile('Dryblingi', s.dribblesOk + '/' + s.dribbles) +
      tile('Podania', s.passesOk + '/' + s.passes) +
      (me.position === 'BR' ? tile('Obrony', s.saves) : tile('Odbiory', s.tackles)) +
      tile('MVP', s.motm) +
      '</div>' +
      '<div class="label">Kariera</div>' +
      '<div class="tiles">' +
      tile('Mecze', c.apps) + tile('Gole', c.goals) + tile('Asysty', c.assists) +
      tile('MVP', c.motm) +
      '</div>' + attrs + '</div>';
  }

  function tabHistory() {
    if (!ui.state.history.length) {
      return '<div class="panel faint">Jeszcze żadnego zakończonego sezonu.</div>';
    }
    const rows = ui.state.history.map(entry =>
      '<tr><td>' + esc(entry.seasonLabel) + '</td>' +
      '<td>' + esc(leagueName(entry.league)) + '</td>' +
      '<td class="num">' + entry.position + '</td>' +
      '<td class="num mono">' + (entry.row ? entry.row.points : '—') + '</td>' +
      '<td>' + (entry.promoted ? '<span class="badge green">AWANS</span>' :
        entry.relegated ? '<span class="badge red">SPADEK</span>' : '') + '</td></tr>').join('');
    return '<div class="panel"><div class="label">Twoja kariera</div>' +
      '<table><thead><tr><th>Sezon</th><th>Liga</th><th class="num">Miejsce</th>' +
      '<th class="num">Pkt</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  /* ================= ustawienie piątki ================= */

  /* Zwraca piątkę w kolejności M.LINEUP_SLOTS, uzupełniając braki automatycznie. */
  function currentLineup() {
    const team = userTeam();
    const rng = C.makeRng(C.hashString(team.id + ui.state.seasonIndex));
    const picked = M.pickLineup(team.squad, rng, ui.state.userPlayerId, ui.state.lineup);
    return picked.onCourt.map(spot => ({ slot: spot.slot, player: spot.player }));
  }

  function screenLineup() {
    const team = userTeam();
    const fixture = ui.pendingFixture;
    const lineup = ui.lineupDraft;
    const onCourtIds = new Set(lineup.map(entry => entry.player.id));
    const opponent = teamOf(fixture.home === team.id ? fixture.away : fixture.home);

    const slots = lineup.map((entry, index) => {
      const player = entry.player;
      const isMe = player.id === ui.state.userPlayerId;
      const offPosition = player.position !== entry.slot;
      return '<button class="player-card' + (ui.lineupSlot === index ? ' selected' : '') + '" ' +
        'data-act="pickSlot" data-index="' + index + '">' +
        '<span class="shirt' + (isMe ? ' gold' : '') + '">' + esc(player.nr) + '</span>' +
        '<span class="grow"><b>' + esc(pretty(player.name)) + '</b>' +
        '<span class="faint" style="display:block;font-size:11px">' +
        esc(A.POSITIONS[entry.slot].label) +
        (offPosition ? ' <span style="color:var(--amber)">(nominalnie ' +
          esc(A.POSITIONS[player.position].short) + ')</span>' : '') +
        ' · kondycja ' + Math.round(player.condition) + '%' +
        (isMe ? ' · TY' : '') + '</span></span>' +
        '<span class="ovr ' + ovrClass(C.overall(player, entry.slot)) + '">' +
        C.overall(player, entry.slot) + '</span></button>';
    }).join('');

    const bench = team.squad
      .filter(player => !onCourtIds.has(player.id))
      .sort((a, b) => b.ovr - a.ovr)
      .map(player =>
        '<button class="player-card" data-act="placePlayer" data-id="' + player.id + '"' +
        (ui.lineupSlot === null ? ' disabled style="opacity:.45"' : '') + '>' +
        '<span class="shirt">' + esc(player.nr) + '</span>' +
        '<span class="grow"><b>' + esc(pretty(player.name)) + '</b>' +
        '<span class="faint" style="display:block;font-size:11px">' +
        esc(A.POSITIONS[player.position].label) + ' · ' + player.age + ' lat · kondycja ' +
        Math.round(player.condition) + '%</span></span>' +
        '<span class="ovr ' + ovrClass(player.ovr) + '">' + player.ovr + '</span></button>').join('');

    const strength = Math.round(C.avg(lineup.map(entry => C.overall(entry.player, entry.slot))));

    return topbarSimple('Ustaw piątkę',
      team.name + ' — ' + opponent.name + ' · ' + dateLabel(fixture.date) +
      (fixture.time ? ', ' + fixture.time : '') + ' · Boisko ' + fixture.pitch) +
      '<div class="grid-2">' +
      '<div class="panel stack">' +
      '<div class="row between"><div class="label">Pierwsza piątka</div>' +
      '<span class="badge gold">SIŁA ' + strength + '</span></div>' +
      slots +
      '<div class="faint" style="font-size:12px">Kliknij miejsce w piątce, potem zawodnika z ławki. ' +
      'Twojego zawodnika nie da się posadzić — to nim grasz.</div>' +
      '</div>' +
      '<div class="panel stack"><div class="label">Ławka</div>' +
      '<div class="stack" style="max-height:52vh;overflow-y:auto">' + bench + '</div></div>' +
      '</div>' +
      '<div class="panel stack"><div class="label">Taktyka na mecz</div>' + tacticsPanel() + '</div>' +
      '<div class="panel row between wrap">' +
      '<button data-act="autoLineup">USTAW NAJMOCNIEJSZYCH</button>' +
      '<div class="row">' +
      '<button data-act="cancelLineup">WRÓĆ</button>' +
      '<button class="primary" data-act="kickOff">PIERWSZY GWIZDEK</button>' +
      '</div></div>';
  }

  /* ================= mecz ================= */

  function screenMatch() {
    const match = ui.match;
    const home = match.home;
    const away = match.away;

    const nameTag = team =>
      '<span class="abbr full">' + esc(team.name) + '</span>' +
      '<span class="abbr short">' + esc(shortTeamName(team.name)) + '</span>';

    const board = '<div class="board">' +
      '<div class="side">' + crestTag(teamOf(home.teamId), 'crest') +
      nameTag(home) + '</div>' +
      '<div><div class="digits">' + home.goals + ':' + away.goals + '</div>' +
      '<div class="meta">' + esc(M.timeLabel(match.clock)) + ' · ' + match.half + ' POŁOWA · ' +
      'AKCJA ' + match.decisionsUsed + '/' + match.decisionBudget + '</div></div>' +
      '<div class="side b">' + nameTag(away) +
      crestTag(teamOf(away.teamId), 'crest') + '</div>' +
      '</div>';

    const speeds = ['wolno', 'normalnie', 'szybko'].map(name =>
      '<button class="' + (ui.speed === name ? 'on' : '') + '" data-act="setSpeed" data-speed="' +
      name + '">' + name.toUpperCase() + '</button>').join('');

    const controls = '<div class="controls">' +
      '<span class="label">tempo</span><span class="speed">' + speeds + '</span>' +
      '<span class="spacer"></span>' +
      (match.finished
        ? '<button class="primary" data-act="closeMatch">RAPORT MECZOWY</button>'
        : match.atBreak
          ? '<span class="faint" style="font-size:12px">Przerwa</span>'
          : match.pending
            ? '<span class="faint" style="font-size:12px">Czekam na twoją decyzję</span>'
            : '<button data-act="skipAhead">PRZEWIŃ DO MOJEJ AKCJI</button>') +
      '</div>';

    const panel = match.atBreak ? breakPanel(match)
      : match.pending ? digestHtml(match) + callPanel(match) : '';

    ui.lastTickerCount = match.events.length;

    return '<div class="stage"><div>' +
      board +
      '<div class="court-wrap">' + courtSvg(match) + controls + '</div>' +
      panel +
      '</div>' + tickerHtml(match) + '</div>';
  }

  /* Parkiet do futsalu 40 × 20 m: pole bramkowe z dwóch ćwiartek koła o promieniu
     6 m, punkty karne na 6 i 10 metrze, koło środkowe o promieniu 3 m. */
  const COURT = { x0: 16, y0: 18, w: 428, h: 214, mid: 230, cy: 125, metre: 10.7 };

  const courtX = x => COURT.x0 + x * (COURT.w / 100);
  const courtY = y => COURT.y0 + y * (COURT.h / 100);

  function courtMarkings() {
    const post = 16;
    const six = 64;
    const L = COURT.x0, R = COURT.x0 + COURT.w, T = COURT.y0, B = COURT.y0 + COURT.h;
    const line = 'fill="none" stroke="rgba(255,255,255,.72)" stroke-width="2"';
    return '<rect x="0" y="0" width="460" height="250" fill="#14485e"/>' +
      '<rect x="' + L + '" y="' + T + '" width="' + COURT.w + '" height="' + COURT.h + '" fill="#2a7fa8"/>' +
      '<rect x="' + L + '" y="' + T + '" width="' + COURT.w + '" height="' + COURT.h + '" ' + line + '/>' +
      '<line x1="' + COURT.mid + '" y1="' + T + '" x2="' + COURT.mid + '" y2="' + B + '" ' + line + '/>' +
      '<circle cx="' + COURT.mid + '" cy="' + COURT.cy + '" r="32" ' + line + '/>' +
      '<circle cx="' + COURT.mid + '" cy="' + COURT.cy + '" r="2.5" fill="rgba(255,255,255,.72)"/>' +
      '<path d="M' + L + ',' + (COURT.cy - post - six) + ' A' + six + ',' + six + ' 0 0 1 ' +
        (L + six) + ',' + (COURT.cy - post) + ' L' + (L + six) + ',' + (COURT.cy + post) +
        ' A' + six + ',' + six + ' 0 0 1 ' + L + ',' + (COURT.cy + post + six) + '" ' + line + '/>' +
      '<path d="M' + R + ',' + (COURT.cy - post - six) + ' A' + six + ',' + six + ' 0 0 0 ' +
        (R - six) + ',' + (COURT.cy - post) + ' L' + (R - six) + ',' + (COURT.cy + post) +
        ' A' + six + ',' + six + ' 0 0 0 ' + R + ',' + (COURT.cy + post + six) + '" ' + line + '/>' +
      '<circle cx="' + (L + six) + '" cy="' + COURT.cy + '" r="2.5" fill="rgba(255,255,255,.72)"/>' +
      '<circle cx="' + (R - six) + '" cy="' + COURT.cy + '" r="2.5" fill="rgba(255,255,255,.72)"/>' +
      '<circle cx="' + (L + 107) + '" cy="' + COURT.cy + '" r="2.5" fill="rgba(255,255,255,.55)"/>' +
      '<circle cx="' + (R - 107) + '" cy="' + COURT.cy + '" r="2.5" fill="rgba(255,255,255,.55)"/>' +
      '<rect x="' + (L - 7) + '" y="' + (COURT.cy - post) + '" width="7" height="' + (post * 2) + '" fill="#eef4f6"/>' +
      '<rect x="' + R + '" y="' + (COURT.cy - post) + '" width="7" height="' + (post * 2) + '" fill="#eef4f6"/>';
  }

  function surnameOf(player) {
    const first = String(player.name || '').split(/\s+/)[0] || '';
    return first.charAt(0) + first.slice(1).toLowerCase();
  }

  /* Każdy zawodnik to jedna grupa przesuwana transformacją. Zawartość grupy jest
     stała, więc przy kolejnym zagraniu wystarczy zmienić transform i przeglądarka
     sama płynnie dowiezie go na nowe miejsce — zamiast przerysowania klatka po klatce. */
  /* Etykiety naszych idą nad kropkę, rywali pod nią — dzięki temu nazwiska
     dwóch zwartych zawodników nie lądują jedno na drugim. */
  function playerChip(spot, colour, options) {
    const opts = options || {};
    const full = surnameOf(spot.player);
    const name = full.length > 10 ? full.slice(0, 9) + '.' : full;
    const width = name.length * 4.4 + 10;
    const radius = 10.5;
    /* co drugi zawodnik dostaje tabliczkę nieco dalej od kropki — przy ciasnocie
       nazwiska mijają się zamiast nachodzić */
    const tier = (opts.tier || 0) % 2 ? 10 : 0;
    const tagY = opts.below ? radius + 4 + tier : -radius - 16 - tier;

    const classes = 'chip' + (opts.hasBall ? ' has-ball' : '') +
      (opts.saving ? ' saving' : '') + (opts.leaving ? ' leaving' : '');
    return '<g class="' + classes + '" data-pid="' + esc(spot.player.id) + '" style="transform:translate(' +
      courtX(spot.x) + 'px,' + courtY(spot.y) + 'px)">' +
      '<g class="body">' +
      '<circle cx="0" cy="1.5" r="' + radius + '" fill="rgba(0,0,0,.32)"/>' +
      '<circle class="ink" cx="0" cy="0" r="' + radius + '" fill="' + colour + '" ' +
      'stroke="rgba(255,255,255,.85)" stroke-width="1.4"/>' +
      '<text class="num" x="0" y="3.4">' + esc(spot.player.nr) + '</text>' +
      '</g>' +
      '<rect x="' + (-width / 2) + '" y="' + tagY + '" width="' + width + '" height="13" rx="3" ' +
      'fill="rgba(6,14,11,.8)" stroke="rgba(255,255,255,.2)" stroke-width="0.8"/>' +
      '<text class="tag" x="0" y="' + (tagY + 9.4) + '">' + esc(name) + '</text>' +
      '</g>';
  }

  function carrierIsOurs(match) {
    return !!(match.carrier && match.userTeam && match.carrier.side === match.userTeam);
  }

  function courtSvg(match) {
    const chips = [];
    const carrierId = match.carrier ? match.carrier.player.id : null;
    const savingId = match.pending && match.pending.kind === 'save' && match.pending.player
      ? match.pending.player.id : null;
    [match.home, match.away].forEach(side => {
      const colour = side.isUser ? '#16366b' : '#a81f1f';
      side.onCourt.forEach((spot, index) => {
        chips.push(playerChip(spot, colour, {
          below: !side.isUser,
          tier: index,
          hasBall: spot.player.id === carrierId,
          saving: savingId === spot.player.id
        }));
      });
    });
    (match.leaving || []).forEach(entry => {
      chips.push(playerChip(entry, entry.side.isUser ? '#16366b' : '#a81f1f', {
        below: !entry.side.isUser, leaving: true
      }));
    });

    const carrier = match.carrier;
    const ring = '<g class="ring" style="opacity:' + (carrierIsOurs(match) ? 1 : 0) +
      ';transform:translate(' + courtX(carrier ? carrier.x : 50) + 'px,' +
      courtY(carrier ? carrier.y : 50) + 'px)">' +
      '<circle cx="0" cy="0" r="17" fill="none" stroke="#f5c518" stroke-width="2" stroke-dasharray="3 4"/>' +
      '</g>';

    /* piłka leży obok zawodnika, żeby nie zasłaniała numeru */
    const ball = '<g class="ball" style="transform:translate(' +
      (courtX(match.ball.x) + 13) + 'px,' + (courtY(match.ball.y) - 11) + 'px)">' +
      '<circle cx="0" cy="1.5" r="5" fill="rgba(0,0,0,.35)"/>' +
      '<circle cx="0" cy="0" r="5" fill="#fff" stroke="#0d1b14" stroke-width="1.4"/></g>';

    return '<svg class="court" viewBox="0 0 460 250" data-leaving="' +
      ((match.leaving || []).length) + '" style="--glide:' +
      (SPEEDS[ui.speed] || SPEEDS.normalnie) + 'ms">' +
      courtMarkings() + ring + chips.join('') + ball + '</svg>';
  }

  /* Przesuwa to, co już jest na ekranie, zamiast budować widok od nowa. */
  function syncMatch() {
    const match = ui.match;
    const svg = root.querySelector('.court');
    if (!svg) { draw(); return; }

    /* zmiana dokłada albo zabiera zawodnika — wtedy widok trzeba zbudować od nowa */
    if (Number(svg.getAttribute('data-leaving')) !== ((match.leaving || []).length)) {
      draw(); return;
    }

    const carrierId = match.carrier ? match.carrier.player.id : null;
    let complete = true;
    [match.home, match.away].forEach(side => side.onCourt.forEach(spot => {
      const node = svg.querySelector('.chip[data-pid="' + spot.player.id + '"]');
      if (!node) { complete = false; return; }
      node.style.transform = 'translate(' + courtX(spot.x) + 'px,' + courtY(spot.y) + 'px)';
      node.classList.toggle('has-ball', spot.player.id === carrierId);
    }));
    if (!complete) { draw(); return; }

    (match.leaving || []).forEach(entry => {
      const node = svg.querySelector('.chip[data-pid="' + entry.player.id + '"]');
      if (node) node.style.transform = 'translate(' + courtX(entry.x) + 'px,' + courtY(entry.y) + 'px)';
    });

    const ring = svg.querySelector('.ring');
    if (ring) {
      ring.style.opacity = carrierIsOurs(match) ? 1 : 0;
      if (match.carrier) {
        ring.style.transform = 'translate(' + courtX(match.carrier.x) + 'px,' +
          courtY(match.carrier.y) + 'px)';
      }
    }

    const ball = svg.querySelector('.ball');
    if (ball) {
      ball.style.transform = 'translate(' + (courtX(match.ball.x) + 13) + 'px,' +
        (courtY(match.ball.y) - 11) + 'px)';
    }

    const digits = root.querySelector('.board .digits');
    if (digits) digits.textContent = match.home.goals + ':' + match.away.goals;
    const meta = root.querySelector('.board .meta');
    if (meta) {
      meta.textContent = M.timeLabel(match.clock) + ' · ' + match.half + ' POŁOWA · AKCJA ' +
        match.decisionsUsed + '/' + match.decisionBudget;
    }
    /* przebieg przebudowujemy tylko wtedy, gdy naprawdę coś doszło — inaczej
       podświetlenie najnowszego wpisu migałoby przy każdym zagraniu */
    const body = root.querySelector('.ticker .body');
    if (body && ui.lastTickerCount !== match.events.length) {
      ui.lastTickerCount = match.events.length;
      const atTop = body.scrollTop < 40;
      body.innerHTML = tickerRows(match);
      if (atTop) body.scrollTop = 0;
    }
  }

  /* ---------- taktyka ---------- */

  const TACTIC_LABELS = {
    pressing: ['Pressing', 'Jak wysoko odbieracie piłkę. Wysoki dusi rywala, ale zjada siły.'],
    marking: ['Krycie', 'Strefa trzyma ustawienie. Krycie 1v1 trudniej minąć, lecz kto minie, ma pole.'],
    tempo: ['Tempo', 'Szybkie oznacza więcej strzałów i więcej strat. Spokojne — odwrotnie.']
  };

  function currentTactics() {
    return Object.assign({}, M.DEFAULT_TACTICS, ui.state.tactics || {});
  }

  function tacticsPanel(active) {
    const tactics = active || currentTactics();
    const lines = Object.keys(M.TACTIC_CHOICES).map(key => {
      const buttons = M.TACTIC_CHOICES[key].map(value =>
        '<button class="' + (tactics[key] === value ? 'on' : '') + '" data-act="setTactic" ' +
        'data-key="' + key + '" data-value="' + esc(value) + '">' +
        esc(value.toUpperCase()) + '</button>').join('');
      return '<div class="line"><span class="label what">' + esc(TACTIC_LABELS[key][0]) + '</span>' +
        '<span class="seg">' + buttons + '</span>' +
        '<span class="hint grow">' + esc(TACTIC_LABELS[key][1]) + '</span></div>';
    }).join('');
    return '<div class="tactics">' + lines + '</div>';
  }

  /* ---------- przerwa ---------- */

  function breakPanel(match) {
    const side = match.userTeam;
    const ours = side === match.home;
    const our = ours ? match.home : match.away;
    const their = ours ? match.away : match.home;

    const tired = side ? side.onCourt.slice()
      .sort((a, b) => a.player.condition - b.player.condition)
      .slice(0, 3)
      .map(spot => esc(pretty(spot.player.name).split(' ')[0]) + ' ' +
        Math.round(spot.player.condition) + '%').join(' · ') : '';

    return '<div class="call">' +
      '<div class="kicker">PRZERWA</div>' +
      '<h3>' + our.goals + ' : ' + their.goals + ' po pierwszej połowie</h3>' +
      '<div class="ctx">Strzały <b>' + our.shots + ':' + their.shots + '</b>, celne <b>' +
      our.onTarget + ':' + their.onTarget + '</b>.' +
      (tired ? ' Najbardziej zmęczeni: ' + tired + '.' : '') +
      ' Zawodnicy odpoczęli — teraz możesz zmienić skład i taktykę.</div>' +
      tacticsPanel() +
      '<div class="controls" style="margin-top:16px">' +
      '<button data-act="openSubs">ZMIANY</button>' +
      '<span class="spacer"></span>' +
      '<button class="primary" data-act="resumeMatch">DRUGA POŁOWA</button>' +
      '</div></div>';
  }

  /* ---------- panel decyzji ---------- */

  function callPanel(match) {
    const pending = match.pending;
    const ctx = pending.context;
    const isSave = pending.kind === 'save';
    const options = pending.options.slice().sort((a, b) => b.chance - a.chance);

    const acts = options.map(option =>
      '<button class="act" data-act="choose" data-id="' + esc(option.id) + '">' +
      '<span class="top"><span>' + esc(option.label) + '</span>' +
      '<span class="pct ' + pctClass(option.chance) + '">' + Math.round(option.chance * 100) + '%</span></span>' +
      '<span class="sub">' + esc(option.detail) +
      (isSave ? ' · dobitka ' + Math.round(option.rebound * 100) + '%' : '') + '</span>' +
      '<span class="meter ' + pctClass(option.chance) + '" style="width:' +
      Math.round(option.chance * 100) + '%"></span>' +
      '</button>').join('');

    const head = isSave
      ? '<div class="kicker keep">BRONISZ ' + esc(String(ctx.keeper || '').toUpperCase()) + '</div>' +
        '<h3>' + esc(ctx.shooter) + ' uderza z ' + ctx.distance + ' metrów</h3>' +
        '<div class="ctx">Decydujesz <b>za swojego bramkarza</b>, nie za zawodnika z pola. ' +
        esc(ctx.clock) + ' · ' + esc(ctx.scoreLine) + ' · atakuje <b>' + esc(ctx.shooterTeam) +
        '</b>. Procent mówi, ile szans, że piłka nie wpadnie.</div>'
      : '<div class="kicker">PIŁKA U ' + esc(String(ctx.carrier || '').toUpperCase()) + '</div>' +
        '<h3>' + (ctx.marker ? 'Kryje go ' + esc(ctx.marker) : 'Ma wolne pole') + '</h3>' +
        '<div class="ctx">' + esc(ctx.clock) + ' · ' + esc(ctx.scoreLine) + ' · <b>' + ctx.distance +
        ' m</b> od bramki · presja ' + ctx.pressure + '% · siły <b>' + ctx.condition + '%</b></div>';

    return '<div class="call">' + head + '<div class="acts">' + acts + '</div></div>';
  }

  /* ---------- co się działo, gdy gra toczyła się sama ---------- */

  function digestHtml(match) {
    const from = ui.lastSeen || 0;
    const events = match.events.slice(from);
    if (events.length < 3) return '';

    const us = ui.state.userTeamId;
    let ours = 0, theirs = 0, shots = 0, saves = 0;
    events.forEach(event => {
      if (event.kind === 'goal') { if (event.teamId === us) ours++; else theirs++; }
      if (event.kind === 'save') { shots++; saves++; }
      if (event.kind === 'miss') shots++;
    });

    const span = Math.max(1, Math.round((events[events.length - 1].clock - events[0].clock) / 60));
    const lastGoal = events.filter(event => event.kind === 'goal').pop();

    const chips = [
      '<span class="chip">bez ciebie <b>' + span + ' min</b></span>',
      '<span class="chip">strzały <b>' + shots + '</b></span>',
      '<span class="chip">obrony <b>' + saves + '</b></span>'
    ];
    if (ours || theirs) {
      chips.unshift('<span class="chip">bramki <b>' + ours + ':' + theirs + '</b></span>');
    }

    return '<div class="digest">' +
      '<div class="kicker">ZANIM WRÓCIŁA DO CIEBIE</div>' +
      '<div class="line">' + (lastGoal
        ? esc(lastGoal.text)
        : 'Gra toczyła się bez rozstrzygnięcia.') + '</div>' +
      '<div class="chips">' + chips.join('') + '</div></div>';
  }

  /* ---------- ticker obok parkietu ---------- */

  /* Najnowsze zdarzenia są największe i najjaśniejsze, starsze stopniowo gasną —
     dzięki temu od razu widać, co się właśnie wydarzyło. */
  function tickerRows(match) {
    const ours = match.userTeam ? match.userTeam.teamId : null;
    return match.events.slice().reverse().slice(0, 80).map((event, index) => {
      const mine = ours && event.teamId === ours;
      const age = index === 0 ? ' fresh' : index < 3 ? ' recent' : '';
      return '<div class="row ' + esc(event.kind) + age + (mine ? ' mine' : '') + '">' +
        '<span class="t">' + esc(M.timeLabel(event.clock)) + '</span>' +
        '<span>' + esc(event.text) + '</span></div>';
    }).join('');
  }

  function tickerHtml(match) {
    const rows = tickerRows(match);

    return '<div class="ticker">' +
      '<div class="head"><div class="label">Przebieg meczu</div>' +
      '<button class="small" data-act="openSubs">ZMIANY</button></div>' +
      '<div class="body">' + (rows || '<div class="row"><span class="t"></span>' +
        '<span class="faint">Zaraz się zacznie.</span></div>') + '</div></div>';
  }

  function subsOverlay() {
    const match = ui.match;
    const side = match.userTeam;
    if (!side) return '';
    const onCourt = side.onCourt.map(spot =>
      '<tr><td>' + esc(A.POSITIONS[spot.slot].short) + '</td>' +
      '<td>' + esc(pretty(spot.player.name)) + ' #' + esc(spot.player.nr) + '</td>' +
      '<td class="num">' + spot.player.ovr + '</td>' +
      '<td class="num">' + Math.round(spot.player.condition) + '%</td>' +
      '<td class="num"><button class="small" data-act="selectOut" data-id="' + spot.player.id + '"' +
      (ui.subOut === spot.player.id ? ' style="border-color:var(--gold)"' : '') + '>ZDEJMIJ</button></td></tr>').join('');

    const bench = side.bench.map(player =>
      '<tr><td>' + esc(A.POSITIONS[player.position].short) + '</td>' +
      '<td>' + esc(pretty(player.name)) + ' #' + esc(player.nr) + '</td>' +
      '<td class="num">' + player.ovr + '</td>' +
      '<td class="num">' + Math.round(player.condition) + '%</td>' +
      '<td class="num"><button class="small" data-act="doSub" data-id="' + player.id + '"' +
      (ui.subOut ? '' : ' disabled') + '>WPUŚĆ</button></td></tr>').join('');

    return '<div class="overlay"><div class="box stack">' +
      '<div class="row between"><h2>Zmiany</h2><button class="small" data-act="closeSubs">ZAMKNIJ</button></div>' +
      '<div class="label">Na parkiecie</div>' +
      '<table><tbody>' + onCourt + '</tbody></table>' +
      '<div class="label">Ławka</div>' +
      '<table><tbody>' + bench + '</tbody></table>' +
      '<div class="faint" style="font-size:12px">Najpierw zdejmij zawodnika, potem wpuść tego z ławki.</div>' +
      '</div></div>';
  }

  /* ================= raport ================= */

  function screenReport() {
    const report = ui.report;
    const squad = report.squad || [];
    const tile = (key, value) => '<div class="tile"><div class="k">' + key + '</div><div class="v">' + value + '</div></div>';

    const sum = key => squad.reduce((total, row) => total + (row.stats[key] || 0), 0);
    const rows = squad.map(row =>
      '<tr><td class="num faint">' + esc(row.nr) + '</td>' +
      '<td>' + esc(pretty(row.name)) + '</td>' +
      '<td class="faint">' + esc(A.POSITIONS[row.position].short) + '</td>' +
      '<td class="num">' + row.stats.minutes + '</td>' +
      '<td class="num">' + row.stats.goals + '</td>' +
      '<td class="num">' + row.stats.assists + '</td>' +
      '<td class="num">' + row.stats.shots + '/' + row.stats.onTarget + '</td>' +
      '<td class="num">' + row.stats.passesOk + '/' + row.stats.passes + '</td>' +
      '<td class="num">' + (row.position === 'BR' ? row.stats.saves : row.stats.tackles) + '</td>' +
      '<td class="num mono"><b>' + row.stats.rating.toFixed(2) + '</b></td></tr>').join('');

    return topbarSimple('Raport meczowy', report.homeName + ' ' + report.homeGoals + ' : ' +
      report.awayGoals + ' ' + report.awayName) +
      '<div class="panel stack">' +
      '<div class="row between wrap">' +
      '<h2>' + esc(report.homeName) + ' <span class="mono">' + report.homeGoals + ' : ' +
      report.awayGoals + '</span> ' + esc(report.awayName) + '</h2>' +
      '<span class="badge ' + (report.outcome === 'W' ? 'green' : report.outcome === 'P' ? 'red' : '') + '">' +
      (report.outcome === 'W' ? 'WYGRANA' : report.outcome === 'P' ? 'PRZEGRANA' : 'REMIS') + '</span>' +
      '</div>' +
      (report.motm ? '<div class="faint">Zawodnik meczu: <b>' + esc(pretty(report.motm)) + '</b></div>' : '') +
      '<div class="label">Bilans drużyny</div>' +
      '<div class="tiles">' +
      tile('Strzały', sum('shots')) + tile('Celne', sum('onTarget')) +
      tile('Podania', sum('passesOk') + '/' + sum('passes')) +
      tile('Dryblingi', sum('dribblesOk') + '/' + sum('dribbles')) +
      tile('Odbiory', sum('tackles')) + tile('Straty', sum('losses')) +
      tile('Obrony', sum('saves')) +
      '</div>' +
      '<div class="label">Kto grał</div>' +
      '<table><thead><tr><th class="num">#</th><th>Zawodnik</th><th>Poz</th>' +
      '<th class="num">Min</th><th class="num">G</th><th class="num">A</th>' +
      '<th class="num">Strzały</th><th class="num">Podania</th><th class="num">Odb/Obr</th>' +
      '<th class="num">Ocena</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="label">Przebieg</div>' +
      '<div class="ticker" style="max-height:320px"><div class="body">' + report.feed + "</div></div>" +
      '<div class="row" style="justify-content:flex-end">' +
      '<button class="primary" data-act="backToHub">DALEJ</button></div>' +
      '</div>';
  }

  /* ================= koniec sezonu ================= */

  function screenSeasonEnd() {
    const summary = ui.seasonSummary;
    const promoted = summary.movements.up.some(m => m.teamId === ui.state.userTeamId);
    const relegated = summary.movements.down.some(m => m.teamId === ui.state.userTeamId);

    const rows = summary.tables[summary.userLeague].map((row, index) =>
      '<tr class="' + (row.teamId === ui.state.userTeamId ? 'me' : '') + '">' +
      '<td class="num faint">' + (index + 1) + '</td>' +
      '<td>' + esc(row.name) + '</td>' +
      '<td class="num">' + row.played + '</td>' +
      '<td class="num mono">' + row.goalsFor + ':' + row.goalsAgainst + '</td>' +
      '<td class="num"><b>' + row.points + '</b></td></tr>').join('');

    const development = summary.development
      .slice().sort((a, b) => b.change - a.change)
      .map(entry =>
        '<tr' + (entry.id === ui.state.userPlayerId ? ' class="me"' : '') + '>' +
        '<td class="num faint">' + esc(entry.nr) + '</td>' +
        '<td>' + esc(pretty(entry.name)) + '</td>' +
        '<td class="faint">' + esc(A.POSITIONS[entry.position].short) + '</td>' +
        '<td class="num">' + entry.age + '</td>' +
        '<td class="num">' + entry.ovr + '</td>' +
        '<td class="num ' + (entry.change > 0 ? '' : '') + '">' +
        (entry.change > 0 ? '<span class="badge green">+' + entry.change + '</span>' :
          entry.change < 0 ? '<span class="badge red">' + entry.change + '</span>' :
          '<span class="faint">0</span>') + '</td></tr>').join('');

    return topbarSimple('Koniec sezonu ' + summary.seasonLabel,
      leagueName(summary.userLeague) + ' · miejsce ' + summary.userPosition) +
      '<div class="panel stack center">' +
      '<h2>' + (promoted ? 'AWANS DO ' + leagueName(summary.userLeague - 1).toUpperCase() :
        relegated ? 'SPADEK DO ' + leagueName(summary.userLeague + 1).toUpperCase() :
        'ZOSTAJEMY W ' + leagueName(summary.userLeague).toUpperCase()) + '</h2>' +
      '<div class="muted">Miejsce ' + summary.userPosition + ' z ' +
      summary.tables[summary.userLeague].length + ' · ' +
      (summary.userRow ? summary.userRow.points + ' pkt, bramki ' +
        summary.userRow.goalsFor + ':' + summary.userRow.goalsAgainst : '') + '</div>' +
      '</div>' +
      '<div class="grid-2">' +
      '<div class="panel"><div class="label">Tabela końcowa</div><table><tbody>' + rows + '</tbody></table></div>' +
      '<div class="panel"><div class="label">Rozwój zawodników</div>' +
      '<table><thead><tr><th class="num">#</th><th>Zawodnik</th><th>Poz</th>' +
      '<th class="num">Wiek</th><th class="num">OVR</th><th class="num">Zmiana</th>' +
      '</tr></thead><tbody>' + development + '</tbody></table></div>' +
      '</div>' +
      '<div class="panel row" style="justify-content:flex-end">' +
      '<button class="primary" data-act="nextSeason">' +
      (summary.userRetired ? 'KONIEC KARIERY ZAWODNIKA' : 'NASTĘPNY SEZON — ' + esc(ui.state.seasonLabel)) +
      '</button></div>';
  }

  /* ================= koniec kariery zawodnika ================= */

  function screenRetired() {
    const summary = ui.seasonSummary;
    const retired = summary.retiredPlayer;
    const c = retired.career;
    const team = userTeam();
    const tile = (key, value) => '<div class="tile"><div class="k">' + key + '</div><div class="v">' + value + '</div></div>';
    const rating = c.apps ? (c.ratingSum / c.apps).toFixed(2) : '—';

    const successors = team.squad
      .filter(player => player.id !== ui.state.userPlayerId)
      .sort((a, b) => b.ovr - a.ovr)
      .map(player =>
        '<button class="player-card" data-act="continueAs" data-id="' + player.id + '">' +
        '<span class="shirt">' + esc(player.nr) + '</span>' +
        '<span class="grow"><b>' + esc(pretty(player.name)) + '</b>' +
        '<span class="faint" style="display:block;font-size:11px">' +
        esc(A.POSITIONS[player.position].label) + ' · ' + player.age + ' lat</span></span>' +
        '<span class="ovr ' + ovrClass(player.ovr) + '">' + player.ovr + '</span></button>').join('');

    const seasons = ui.state.history.map(entry =>
      '<tr><td>' + esc(entry.seasonLabel) + '</td><td>' + esc(leagueName(entry.league)) + '</td>' +
      '<td class="num">' + entry.position + '</td>' +
      '<td>' + (entry.promoted ? '<span class="badge green">AWANS</span>' :
        entry.relegated ? '<span class="badge red">SPADEK</span>' : '') + '</td></tr>').join('');

    return topbarSimple('Koniec kariery', esc(pretty(retired.name)) + ' kończy grę w wieku ' + retired.age + ' lat') +
      '<div class="panel stack center">' +
      '<h2>' + esc(pretty(retired.name)) + ' #' + esc(retired.nr) + ' odwiesza buty</h2>' +
      '<div class="muted">' + esc(A.POSITIONS[retired.position].label) + ' · ' +
      retired.age + ' lat · ostatni OVR ' + retired.ovr + '</div>' +
      '<div class="tiles" style="margin-top:8px">' +
      tile('Sezony', c.seasons || ui.state.history.length) +
      tile('Mecze', c.apps) + tile('Gole', c.goals) + tile('Asysty', c.assists) +
      tile('Średnia', rating) + tile('MVP', c.motm) +
      '</div></div>' +
      '<div class="grid-2">' +
      '<div class="panel"><div class="label">Przebieg kariery</div>' +
      '<table><thead><tr><th>Sezon</th><th>Liga</th><th class="num">Miejsce</th><th></th></tr></thead>' +
      '<tbody>' + seasons + '</tbody></table></div>' +
      '<div class="panel stack"><div class="label">Grasz dalej kimś innym z Trytona</div>' +
      '<div class="stack" style="max-height:48vh;overflow-y:auto">' + successors + '</div>' +
      '<button class="danger" data-act="endCareer">ZAKOŃCZ GRĘ</button>' +
      '</div></div>';
  }

  /* ================= akcje ================= */

  const actions = {
    newGame() {
      /* prowadzisz cały zespół, więc nie wybieramy już jednego zawodnika */
      ui.state = S.newGame({ seed: C.hashString(String(Date.now())) });
      ui.state.userPlayerId = null;
      ui.editorPlayerId = null;
      ui.screen = 'editor';
      draw();
    },

    loadGame() {
      const result = C.storage.load();
      if (!result.state) {
        flash(result.error === 'wersja'
          ? 'Zapis pochodzi ze starszej wersji gry.'
          : 'Nie udało się wczytać zapisu.');
        draw();
        return;
      }
      ui.state = result.state;
      ui.screen = 'hub';
      ui.tab = 'terminarz';
      draw();
    },

    wipeSave() {
      C.storage.clear();
      ui.state = null;
      flash('Zapis skasowany.');
      draw();
    },

    save() {
      const ok = C.storage.save(ui.state);
      flash(ok ? 'Zapisano.' : 'Nie udało się zapisać.');
    },

    pickPlayer(data) {
      const player = userTeam().squad.find(p => p.id === data.id);
      ui.draft.playerId = data.id;
      ui.draft.position = player.position;
      ui.draft.age = player.age;
      draw();
    },

    setDraftPosition(data, event) {
      ui.draft.position = event.target.value;
      draw();
    },

    setDraftAge(data, event) {
      ui.draft.age = Number(event.target.value);
      draw();
    },

    setDraftStart(data, event) {
      ui.draft.startIndex = Number(event.target.value);
      draw();
    },

    confirmPlayer() {
      const draft = ui.draft;
      if (!draft.playerId) return;
      const team = userTeam();
      const player = team.squad.find(p => p.id === draft.playerId);
      const rng = C.makeRng(C.hashString(player.id + draft.position + draft.age));
      const base = START_POINTS[draft.startIndex].base;

      player.position = draft.position;
      player.age = draft.age;
      player.attributes = C.applyAgeShape(C.makeAttributes(rng, base, draft.position), draft.age);
      player.isUser = true;
      player.potential = C.clamp(Math.round(base * 5 + 14 + rng.bell() * 20), 25, 99);
      player.ovr = C.overall(player);
      player.potential = Math.max(player.potential, player.ovr);

      ui.state.userPlayerId = player.id;
      ui.editorPlayerId = player.id;
      ui.screen = 'editor';
      draw();
    },

    editPlayer(data) {
      ui.editorPlayerId = data.id;
      draw();
    },

    setEditorPosition(data, event) {
      const player = userTeam().squad.find(p => p.id === ui.editorPlayerId);
      player.position = event.target.value;
      player.ovr = C.overall(player);
      draw();
    },

    setAttr(data, event) {
      const player = userTeam().squad.find(p => p.id === ui.editorPlayerId);
      player.attributes[data.key] = Number(event.target.value);
      player.ovr = C.overall(player);
      const row = event.target.parentNode.querySelector('.val');
      if (row) row.textContent = player.attributes[data.key];
      refreshEditorHeader(player);
    },

    randomiseSquad() {
      const team = userTeam();
      const rng = C.makeRng(C.hashString(String(Date.now())));
      team.squad.forEach(player => {
        if (player.isUser) return;
        const base = C.leagueBase(team.league);
        player.attributes = C.applyAgeShape(C.makeAttributes(rng, base, player.position), player.age);
        player.ovr = C.overall(player);
      });
      draw();
    },

    startSeason() {
      ui.screen = 'hub';
      ui.tab = 'terminarz';
      C.storage.save(ui.state);
      draw();
    },

    setTab(data) {
      ui.tab = data.tab;
      draw();
    },

    setLeague(data) {
      ui.tableLeague = Number(data.league);
      draw();
    },

    playMatch() {
      const fixture = S.nextUserFixture(ui.state);
      if (!fixture) return;
      S.simulateUntil(ui.state, fixture);
      ui.pendingFixture = fixture;
      ui.lineupDraft = currentLineup();
      ui.lineupSlot = null;
      ui.screen = 'lineup';
      draw();
    },

    pickSlot(data) {
      const index = Number(data.index);
      if (ui.lineupDraft[index].player.id === ui.state.userPlayerId) {
        flash('Tym zawodnikiem grasz — zostaje w piątce.');
        return;
      }
      ui.lineupSlot = ui.lineupSlot === index ? null : index;
      draw();
    },

    placePlayer(data) {
      if (ui.lineupSlot === null) return;
      const player = userTeam().squad.find(p => p.id === data.id);
      if (!player) return;
      ui.lineupDraft[ui.lineupSlot].player = player;
      ui.lineupSlot = null;
      draw();
    },

    autoLineup() {
      ui.state.lineup = null;
      ui.lineupDraft = currentLineup();
      ui.lineupSlot = null;
      draw();
    },

    cancelLineup() {
      ui.pendingFixture = null;
      ui.screen = 'hub';
      draw();
    },

    kickOff() {
      const fixture = ui.pendingFixture;
      if (!fixture) return;
      ui.state.lineup = ui.lineupDraft.map(entry => entry.player.id);

      const home = teamOf(fixture.home);
      const away = teamOf(fixture.away);
      const rng = C.makeRng(C.hashString(fixture.id + ui.state.seasonIndex));

      ui.match = M.create({
        rng: rng,
        userPlayerId: ui.state.userPlayerId,
        home: {
          teamId: home.id, name: home.name, crest: home.crest,
          squad: home.squad, isUser: home.id === ui.state.userTeamId,
          lineup: home.id === ui.state.userTeamId ? ui.state.lineup : null,
          tactics: home.id === ui.state.userTeamId ? currentTactics() : null
        },
        away: {
          teamId: away.id, name: away.name, crest: away.crest,
          squad: away.squad, isUser: away.id === ui.state.userTeamId,
          lineup: away.id === ui.state.userTeamId ? ui.state.lineup : null,
          tactics: away.id === ui.state.userTeamId ? currentTactics() : null
        },
        meta: { fixtureId: fixture.id }
      });
      ui.matchFixture = fixture;
      ui.pendingFixture = null;
      ui.screen = 'match';
      ui.lastSeen = 0;
      playOn();
    },

    simMatch() {
      const fixture = S.nextUserFixture(ui.state);
      if (!fixture) return;
      S.simulateUntil(ui.state, fixture);
      const rng = C.makeRng(C.hashString('sim' + fixture.id));
      const isHome = fixture.home === ui.state.userTeamId;
      const match = M.create({
        rng: rng,
        userPlayerId: null,
        forceLineupId: ui.state.userPlayerId,
        /* isUser zostaje na false — mecz ma przelecieć sam, bez czekania na decyzje */
        home: {
          teamId: fixture.home, name: teamOf(fixture.home).name,
          squad: teamOf(fixture.home).squad, isUser: false,
          lineup: isHome ? ui.state.lineup : null
        },
        away: {
          teamId: fixture.away, name: teamOf(fixture.away).name,
          squad: teamOf(fixture.away).squad, isUser: false,
          lineup: isHome ? null : ui.state.lineup
        }
      });
      let guard = 0;
      while (!match.finished && guard++ < 4000) M.step(match);
      const result = M.finalise(match);
      S.recordUserResult(ui.state, fixture.id, result.homeGoals, result.awayGoals);
      recover();
      C.storage.save(ui.state);
      draw();
    },

    setSpeed(data) {
      ui.speed = data.speed;
      draw();
      if (!ui.match.pending && !ui.match.finished && !ui.subsOpen) playOn();
    },

    skipAhead() {
      stopPlayback();
      M.step(ui.match);
      draw();
    },

    setTactic(data) {
      ui.state.tactics = Object.assign(currentTactics(), { [data.key]: data.value });
      /* zmiana działa od razu, także w trakcie meczu */
      if (ui.match && ui.match.userTeam) {
        ui.match.userTeam.tactics = Object.assign({}, ui.state.tactics);
      }
      draw();
    },

    resumeMatch() {
      M.resume(ui.match);
      playOn();
    },

    choose(data) {
      stopPlayback();
      ui.lastSeen = ui.match.events.length;
      M.choose(ui.match, data.id);
      playOn();
    },

    openSubs() { stopPlayback(); ui.subsOpen = true; ui.subOut = null; draw(); },
    closeSubs() {
      ui.subsOpen = false; ui.subOut = null;
      if (!ui.match.pending && !ui.match.finished) playOn(); else draw();
    },
    selectOut(data) { ui.subOut = data.id; draw(); },
    doSub(data) {
      if (!ui.subOut) return;
      const result = M.substitute(ui.match, ui.subOut, data.id);
      if (result && result.blocked) { flash(result.blocked); return; }
      ui.subOut = null;
      draw();
    },

    closeMatch() {
      stopPlayback();
      const match = ui.match;
      const fixture = ui.matchFixture;
      const side = match.userTeam;
      const result = M.finalise(match);
      S.recordUserResult(ui.state, fixture.id, result.homeGoals, result.awayGoals);

      const isHome = fixture.home === ui.state.userTeamId;
      const mine = isHome ? result.homeGoals : result.awayGoals;
      const theirs = isHome ? result.awayGoals : result.homeGoals;

      /* raport dotyczy teraz całej drużyny, bo nią grasz */
      const played = side
        ? side.squad.filter(p => p.matchStats && p.matchStats.minutes > 0)
            .sort((a, b) => b.matchStats.rating - a.matchStats.rating)
        : [];

      ui.report = {
        homeName: teamOf(fixture.home).name,
        awayName: teamOf(fixture.away).name,
        homeGoals: result.homeGoals,
        awayGoals: result.awayGoals,
        outcome: mine > theirs ? 'W' : mine < theirs ? 'P' : 'R',
        motm: result.motm ? result.motm.name : null,
        squad: played.map(p => ({
          nr: p.nr, name: p.name, position: p.position,
          stats: Object.assign({}, p.matchStats)
        })),
        feed: match.events.slice().reverse().slice(0, 80).map(event =>
          '<div class="row ' + esc(event.kind) + '">' +
          '<span class="t">' + esc(M.timeLabel(event.clock)) + '</span>' +
          '<span>' + esc(event.text) + '</span></div>').join('')
      };

      recover();
      ui.match = null;
      ui.screen = 'report';
      C.storage.save(ui.state);
      draw();
    },

    backToHub() {
      ui.screen = 'hub';
      draw();
    },

    finishSeason() {
      if (!S.seasonFinished(ui.state)) {
        S.simulateUntil(ui.state, null, { includeUser: true });
      }
      ui.seasonSummary = S.endSeason(ui.state);
      ui.screen = 'seasonEnd';
      C.storage.save(ui.state);
      draw();
    },

    nextSeason() {
      if (ui.seasonSummary && ui.seasonSummary.userRetired) {
        ui.screen = 'retired';
        draw();
        return;
      }
      ui.seasonSummary = null;
      ui.tableLeague = null;
      ui.screen = 'hub';
      ui.tab = 'terminarz';
      C.storage.save(ui.state);
      draw();
    },

    continueAs(data) {
      const team = userTeam();
      const old = team.squad.find(p => p.id === ui.state.userPlayerId);
      if (old) {
        old.isUser = false;
        team.squad = team.squad.filter(p => p.id !== old.id);
      }
      const next = team.squad.find(p => p.id === data.id);
      if (!next) return;
      next.isUser = true;
      ui.state.userPlayerId = next.id;
      ui.seasonSummary = null;
      ui.tableLeague = null;
      ui.screen = 'hub';
      ui.tab = 'terminarz';
      C.storage.save(ui.state);
      draw();
    },

    endCareer() {
      C.storage.clear();
      ui.state = null;
      ui.seasonSummary = null;
      ui.screen = 'start';
      draw();
    }
  };

  /* Odświeża nagłówek edytora bez przerysowania suwaków. */
  function refreshEditorHeader(player) {
    const panels = root.querySelectorAll('.panel');
    const header = panels[panels.length - 1] && panels[panels.length - 1].querySelector('.ovr');
    if (header) {
      header.textContent = player.ovr;
      header.className = 'ovr ' + ovrClass(player.ovr) + '';
      header.style.fontSize = '20px';
    }
    const card = root.querySelector('.player-card.selected .ovr');
    if (card) {
      card.textContent = player.ovr;
      card.className = 'ovr ' + ovrClass(player.ovr);
    }
  }

  /* Odtwarzanie meczu zagranie po zagraniu, żeby akcja była ciągła. */
  const SPEEDS = { wolno: 760, normalnie: 400, szybko: 170 };

  function stopPlayback() {
    if (ui.playTimer) { clearTimeout(ui.playTimer); ui.playTimer = null; }
  }

  function playOn() {
    stopPlayback();
    const match = ui.match;
    if (!match || match.finished || match.pending || match.atBreak || ui.subsOpen) { draw(); return; }
    const result = M.tick(match);
    if (result.type === 'decision' || result.type === 'end' || result.type === 'break') {
      draw(); return;
    }
    syncMatch();
    ui.playTimer = setTimeout(playOn, SPEEDS[ui.speed] || SPEEDS.normalnie);
  }

  /* Regeneracja po meczu. */
  function recover() {
    Object.values(ui.state.teams).forEach(team => {
      team.squad.forEach(player => {
        player.condition = C.clamp(player.condition + 38, 25, 100);
      });
    });
  }

  function flash(text) {
    const note = document.createElement('div');
    note.textContent = text;
    note.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);' +
      'background:#1a2a22;border:1px solid rgba(255,255,255,.25);color:#eaf4ee;' +
      'padding:10px 18px;border-radius:9px;font-weight:700;z-index:60';
    document.body.appendChild(note);
    setTimeout(() => note.remove(), 1600);
  }

  /* ================= rysowanie ================= */

  function draw() {
    let html = '';
    if (ui.screen === 'start') html = screenStart();
    else if (ui.screen === 'pick') html = screenPick();
    else if (ui.screen === 'editor') html = screenEditor();
    else if (ui.screen === 'hub') html = screenHub();
    else if (ui.screen === 'lineup') html = screenLineup();
    else if (ui.screen === 'match') html = screenMatch() + (ui.subsOpen ? subsOverlay() : '');
    else if (ui.screen === 'report') html = screenReport();
    else if (ui.screen === 'seasonEnd') html = screenSeasonEnd();
    else if (ui.screen === 'retired') html = screenRetired();
    render(html);
  }

  global.TrytonApp = { ui: ui, draw: draw, actions: actions };
  draw();
})(window);
