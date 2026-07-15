const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getPetInfoFromCalculatorConfig,
  applyOptimizedLineup
} = require('../lib/battle');

test('converts calculator pet configs into replay render pets', () => {
  const pet = getPetInfoFromCalculatorConfig({
    name: 'Aardvark',
    attack: 17,
    health: 23,
    exp: 5,
    equipment: { name: 'Ambrosia' }
  });
  assert.equal(pet.imagePath, 'Sprite/Pets/Aardvark.png');
  assert.equal(pet.perkImagePath, 'Sprite/Food/Ambrosia.png');
  assert.equal(pet.level, 3);
  assert.equal(pet.attack, 17);
  assert.equal(pet.health, 23);
});

test('applies the simulated optimized lineup to the requested side', () => {
  const original = {
    playerBoard: { boardPets: [{ name: 'Original player' }], toy: {} },
    oppBoard: { boardPets: [{ name: 'Original opponent' }], toy: {} }
  };
  const updated = applyOptimizedLineup(original, {
    side: 'opponent',
    optimizedLineup: [],
    simulationLineup: [{ name: 'Aardvark', attack: 9, health: 10, exp: 0 }]
  });
  assert.equal(updated.playerBoard.boardPets[0].name, 'Original player');
  assert.equal(updated.oppBoard.boardPets[0].name, 'Aardvark');
  assert.equal(original.oppBoard.boardPets[0].name, 'Original opponent');
});
