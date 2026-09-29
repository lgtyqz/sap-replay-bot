const test = require('node:test');
const assert = require('node:assert/strict');

const {
  generateCalculatorLink,
  parseReplayForCalculator
} = require('../lib/calculator');
const { buildOddsRequest } = require('../lib/odds-request');

function board(items) {
  return {
    Pack: 0,
    Tur: 8,
    Mins: { Items: items },
    Rel: { Items: [] }
  };
}

function pet(Enu, x, extra = {}) {
  return {
    Enu,
    Poi: { x },
    At: { Perm: 5 },
    Hp: { Perm: 6 },
    Lvl: 3,
    ...extra
  };
}

test('maps Abomination copied ability enums to distinct swallowed pets and levels', () => {
  const battle = {
    UserBoard: board([
      pet(373, 4, {
        Abil: [
          { Enu: 403, Lvl: 3 },
          { Enu: 13, Lvl: 2 },
          { Enu: 313, Lvl: 2 },
          { Enu: 371, Lvl: 3 },
          { Enu: 379, Lvl: 1 }
        ]
      })
    ]),
    OpponentBoard: board([])
  };

  const state = parseReplayForCalculator(battle);
  const abomination = state.playerPets[0];

  assert.equal(abomination.abominationSwallowedPet1, 'Cow');
  assert.equal(abomination.abominationSwallowedPet1Level, 2);
  assert.equal(abomination.abominationSwallowedPet2, 'Drop Bear');
  assert.equal(abomination.abominationSwallowedPet2Level, 3);
  assert.equal(abomination.abominationSwallowedPet3, 'Brain Cramp');
  assert.equal(abomination.abominationSwallowedPet3Level, 1);
});

test('keeps Abomination swallow data in generated calculator links', () => {
  const battle = {
    UserBoard: board([
      pet(373, 4, { Abil: [{ Enu: 411, Lvl: 2 }] })
    ]),
    OpponentBoard: board([])
  };

  const link = generateCalculatorLink(parseReplayForCalculator(battle));
  const encodedState = link.slice(link.indexOf('?c=') + 3);
  const linkedState = JSON.parse(Buffer.from(encodedState, 'base64').toString('utf8'));

  assert.equal(linkedState.p[0].aSP1, 'Vampire Bat');
  assert.equal(linkedState.p[0].aSP1L, 2);
});

test('maps Parrot copied ability enums to the copied pet', () => {
  const battle = {
    UserBoard: board([
      pet(53, 4, {
        Abil: [
          { Enu: 45, Lvl: 3, Nat: true },
          { Enu: 17, Lvl: 1, Dur: 1 }
        ]
      })
    ]),
    OpponentBoard: board([])
  };

  const state = parseReplayForCalculator(battle);

  assert.equal(state.playerPets[0].parrotCopyPet, 'Deer');
});

test('distinguishes a temporary Parrot copy from its native ability', () => {
  const nativeBattle = {
    UserBoard: board([
      pet(53, 4, { Abil: [{ Enu: 45, Lvl: 1, Nat: true }] })
    ]),
    OpponentBoard: board([])
  };
  const copiedBattle = {
    UserBoard: board([
      pet(53, 4, { Abil: [{ Enu: 45, Lvl: 1, Dur: 1 }] })
    ]),
    OpponentBoard: board([])
  };

  assert.equal(parseReplayForCalculator(nativeBattle).playerPets[0].parrotCopyPet, null);
  assert.equal(parseReplayForCalculator(copiedBattle).playerPets[0].parrotCopyPet, 'Parrot');
});

test('keeps Parrot copied ability data in generated calculator links', () => {
  const battle = {
    UserBoard: board([
      pet(53, 4, { Abil: [{ Enu: 17, Lvl: 1, Dur: 1 }] })
    ]),
    OpponentBoard: board([])
  };

  const link = generateCalculatorLink(parseReplayForCalculator(battle));
  const encodedState = link.slice(link.indexOf('?c=') + 3);
  const linkedState = JSON.parse(Buffer.from(encodedState, 'base64').toString('utf8'));

  assert.equal(linkedState.p[0].pCP, 'Deer');
});

test('marks ability-disabled pets with an explicit empty ability list as plain copies', () => {
  const battle = {
    UserBoard: board([
      pet(803, 4, {
        AbDi: true,
        Abil: [],
        At: { Perm: 7, Temp: 2 },
        Hp: { Perm: 8, Temp: 1 },
        Perk: 9
      }),
      pet(0, 3, { AbDi: true })
    ]),
    OpponentBoard: board([
      pet(32, 4, { AbDi: true, Abil: [{ Enu: 29, Lvl: 1 }] }),
      pet(17, 3, { AbDi: false, Abil: [] })
    ])
  };

  const state = parseReplayForCalculator(battle);

  assert.equal(state.playerPets[0].name, 'Shima Enaga');
  assert.equal(state.playerPets[0].plainCopy, true);
  assert.equal(state.playerPets[0].attack, 9);
  assert.equal(state.playerPets[0].health, 9);
  assert.deepEqual(state.playerPets[0].equipment, { name: 'Garlic' });
  assert.equal(state.playerPets[1].plainCopy, false);
  assert.equal(state.opponentPets[0].plainCopy, false);
  assert.equal(state.opponentPets[1].plainCopy, false);
  assert.equal(state.plainCopies, true);
});

test('keeps plain-copy controls and pet flags in generated calculator links', () => {
  const battle = {
    UserBoard: board([]),
    OpponentBoard: board([
      pet(803, 4, { AbDi: true, Abil: [] })
    ])
  };

  const link = generateCalculatorLink(parseReplayForCalculator(battle));
  const encodedState = link.slice(link.indexOf('?c=') + 3);
  const linkedState = JSON.parse(Buffer.from(encodedState, 'base64').toString('utf8'));

  assert.equal(linkedState.pCs, true);
  assert.equal(linkedState.o[0].pC, true);
});

test('maps Slime and Eagle Owl power counters to battles fought', () => {
  const battle = {
    UserBoard: board([
      pet(375, 4, { Pow: { SlimeAbility: 4 } })
    ]),
    OpponentBoard: board([
      pet(781, 4, { Pow: { EagleOwlAbility: 1 } })
    ])
  };

  const state = parseReplayForCalculator(battle);

  assert.equal(state.playerPets[0].name, 'Slime');
  assert.equal(state.playerPets[0].battlesFought, 4);
  assert.equal(state.opponentPets[0].name, 'Eagle Owl');
  assert.equal(state.opponentPets[0].battlesFought, 1);
});

test('keeps battles fought in generated calculator links', () => {
  const battle = {
    UserBoard: board([
      pet(375, 4, { Pow: { SlimeAbility: 4 } })
    ]),
    OpponentBoard: board([
      pet(781, 4, { Pow: { EagleOwlAbility: 1 } })
    ])
  };

  const link = generateCalculatorLink(parseReplayForCalculator(battle));
  const encodedState = link.slice(link.indexOf('?c=') + 3);
  const linkedState = JSON.parse(Buffer.from(encodedState, 'base64').toString('utf8'));

  assert.equal(linkedState.p[0].bF, 4);
  assert.equal(linkedState.o[0].bF, 1);
});

test('parses shop progress, hurt counts, and food counts on both boards', () => {
  const battle = {
    UserBoard: board([
      pet(696, 4, { SpCT: 1, Abil: [{ Enu: 742, Nat: true, Char: 1 }] }),
      pet(269, 3, { Abil: [{ Enu: 294, Nat: true, Char: 3 }] }),
      pet(572, 2, { HrtC: 2 })
    ]),
    OpponentBoard: board([
      pet(148, 4, { Pow: { SabertoothTigerAbility: 4 } }),
      pet(721, 3, { SpCT: 3 }),
      pet(774, 2, { SpCT: 2 })
    ])
  };

  const state = parseReplayForCalculator(battle);
  assert.equal(state.playerPets[0].foodsEaten, 1);
  assert.equal(state.playerPets[1].friendsHurtBeforeBattle, 3);
  assert.equal(state.playerPets[2].timesHurt, 2);
  assert.equal(state.opponentPets[0].timesHurt, 4);
  assert.equal(state.opponentPets[1].foodsEaten, 3);
  assert.equal(state.opponentPets[2].foodsEaten, 2);
});

test('uses native partial progress only for the relevant pets', () => {
  const battle = {
    UserBoard: board([
      pet(696, 4, { SpCT: 3, Abil: [
        { Enu: 17, Nat: true, Char: 2 },
        { Enu: 742, Nat: true, Char: 1 }
      ] }),
      pet(269, 3, { Abil: [
        { Enu: 17, Nat: true, Char: 1 },
        { Enu: 294, Nat: true, Char: 2 }
      ] })
    ]),
    OpponentBoard: board([
      pet(17, 4, { Abil: [{ Enu: 15, Nat: true, Char: 2 }] }),
      pet(269, 3, { Abil: [{ Enu: 294, Nat: false, Char: 3 }] })
    ])
  };

  const state = parseReplayForCalculator(battle);
  assert.equal(state.playerPets[0].foodsEaten, 1);
  assert.equal(state.playerPets[1].friendsHurtBeforeBattle, 2);
  assert.equal(state.opponentPets[0].friendsHurtBeforeBattle, undefined);
  assert.equal(state.opponentPets[1].friendsHurtBeforeBattle, undefined);
});

test('keeps the new counters in calculator links and Lambda request states', () => {
  const battle = {
    UserBoard: board([
      pet(269, 4, { Abil: [{ Enu: 294, Nat: true, Char: 2 }] }),
      pet(572, 3, { HrtC: 3 }),
      pet(721, 2, { SpCT: 2 })
    ]),
    OpponentBoard: board([pet(774, 4, { SpCT: 1 })])
  };

  const request = buildOddsRequest([battle], null);
  assert.equal(request.battleJsonList[0], battle);
  assert.equal(request.calculatorStateList[0].playerPets[0].friendsHurtBeforeBattle, 2);
  assert.equal(request.calculatorStateList[0].playerPets[1].timesHurt, 3);
  assert.equal(request.calculatorStateList[0].playerPets[2].foodsEaten, 2);
  assert.equal(request.calculatorStateList[0].opponentPets[0].foodsEaten, 1);

  const link = generateCalculatorLink(request.calculatorStateList[0]);
  const linkedState = JSON.parse(Buffer.from(link.split('?c=')[1], 'base64').toString('utf8'));
  assert.equal(linkedState.p[0].fHBB, 2);
  assert.equal(linkedState.p[1].tH, 3);
  assert.equal(linkedState.p[2].fE, 2);
  assert.equal(linkedState.o[0].fE, 1);
});

test('keeps swallowed Fringehead memory and Gelada charge in odds and calculator links', () => {
  const battle = {
    UserBoard: board([
      pet(696, 4, { Abil: [{ Enu: 742, Nat: true, Char: 1 }] })
    ]),
    OpponentBoard: board([
      pet(763, 4, {
        MiMs: { Lsts: { SarcasticFringeheadAbility: [{ Enu: 751, At: 4, Hp: 6, Lvl: 1 }] }, Count: 1 }
      })
    ])
  };

  const request = buildOddsRequest([battle], null);
  const state = request.calculatorStateList[0];
  assert.equal(state.playerPets[0].foodsEaten, 1);
  assert.equal(state.opponentPets[0].sarcasticFringeheadSwallowedPet, 'Quetzalcoatlus');

  const link = generateCalculatorLink(state);
  const linkedState = JSON.parse(Buffer.from(link.split('?c=')[1], 'base64').toString('utf8'));
  assert.equal(linkedState.p[0].fE, 1);
  assert.equal(linkedState.o[0].sFSP, 'Quetzalcoatlus');
});
