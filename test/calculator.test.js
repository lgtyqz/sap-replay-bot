const test = require('node:test');
const assert = require('node:assert/strict');

const {
  generateCalculatorLink,
  parseReplayForCalculator
} = require('../lib/calculator');

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
