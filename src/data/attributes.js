/* Katalog atrybutów pod futsal 4+1 oraz wagi pozycyjne.
   Skala pojedynczego atrybutu: 1–20. OVR liczony w core.js na skali 1–99. */
(function (global) {
  'use strict';

  const ROWS = [
    // klucz            etykieta                 grupa
    ['pace', 'Szybkość', 'fiz'],
    ['acceleration', 'Przyspieszenie', 'fiz'],
    ['agility', 'Zwinność', 'fiz'],
    ['stamina', 'Wytrzymałość', 'fiz'],
    ['strength', 'Siła', 'fiz'],
    ['balance', 'Równowaga', 'fiz'],

    ['finishing', 'Wykańczanie', 'tech'],
    ['passing', 'Podania', 'tech'],
    ['dribbling', 'Drybling', 'tech'],
    ['technique', 'Technika', 'tech'],
    ['tackling', 'Odbiór', 'tech'],
    ['marking', 'Krycie', 'tech'],
    ['longShots', 'Strzały z dystansu', 'tech'],
    ['setPieces', 'Stałe fragmenty', 'tech'],

    ['decisions', 'Decyzje', 'men'],
    ['anticipation', 'Przewidywanie', 'men'],
    ['creativity', 'Kreatywność', 'men'],
    ['determination', 'Determinacja', 'men'],
    ['offTheBall', 'Gra bez piłki', 'men'],
    ['workRate', 'Pracowitość', 'men'],
    ['teamwork', 'Współpraca', 'men'],
    ['positioning', 'Ustawianie', 'men'],

    ['handling', 'Chwyt', 'br'],
    ['reflexes', 'Refleks', 'br']
  ];

  const GROUPS = {
    fiz: { key: 'fiz', label: 'Fizyczne' },
    tech: { key: 'tech', label: 'Techniczne' },
    men: { key: 'men', label: 'Mentalne' },
    br: { key: 'br', label: 'Bramkarskie' }
  };

  const ATTRIBUTES = {};
  const KEYS = [];
  ROWS.forEach(([key, label, group], index) => {
    ATTRIBUTES[key] = { key, label, group, index };
    KEYS.push(key);
  });

  /* Pozycje futsalowe. Piątka na parkiecie to 1 BR + 1 OBR + 2 UNI + 1 NAP. */
  const POSITIONS = {
    BR: {
      key: 'BR',
      label: 'Bramkarz',
      short: 'BR',
      onCourt: 1,
      critical: ['handling', 'reflexes', 'positioning', 'anticipation'],
      supporting: ['agility', 'balance', 'decisions', 'passing', 'determination']
    },
    OBR: {
      key: 'OBR',
      label: 'Obrońca',
      short: 'OBR',
      onCourt: 1,
      critical: ['marking', 'tackling', 'positioning', 'anticipation'],
      supporting: ['strength', 'passing', 'decisions', 'longShots', 'workRate', 'balance']
    },
    UNI: {
      key: 'UNI',
      label: 'Uniwersalny',
      short: 'UNI',
      onCourt: 2,
      critical: ['stamina', 'workRate', 'passing', 'technique', 'offTheBall'],
      supporting: ['pace', 'acceleration', 'dribbling', 'tackling', 'teamwork', 'decisions', 'finishing']
    },
    NAP: {
      key: 'NAP',
      label: 'Napastnik',
      short: 'NAP',
      onCourt: 1,
      critical: ['finishing', 'technique', 'dribbling', 'offTheBall'],
      supporting: ['strength', 'balance', 'creativity', 'acceleration', 'longShots', 'determination']
    }
  };

  const POSITION_ORDER = ['BR', 'OBR', 'UNI', 'NAP'];

  /* Startowa piątka: ile zawodników na jakiej pozycji. */
  const LINEUP_SHAPE = [
    { position: 'BR', count: 1 },
    { position: 'OBR', count: 1 },
    { position: 'UNI', count: 2 },
    { position: 'NAP', count: 1 }
  ];

  global.TrytonAttributes = {
    VERSION: '1.0.0',
    ATTRIBUTES,
    KEYS,
    GROUPS,
    GROUP_ORDER: ['fiz', 'tech', 'men', 'br'],
    POSITIONS,
    POSITION_ORDER,
    LINEUP_SHAPE,
    keysInGroup(group) {
      return KEYS.filter(key => ATTRIBUTES[key].group === group);
    },
    label(key) {
      return (ATTRIBUTES[key] || {}).label || key;
    }
  };
})(window);
