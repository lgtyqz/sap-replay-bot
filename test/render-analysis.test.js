const test = require('node:test');
const assert = require('node:assert/strict');
const Canvas = require('canvas');
const { renderReplayImage } = require('../lib/render');

function makePet(name, imageName) {
  return {
    name,
    attack: 10,
    health: 12,
    tempAttack: 0,
    tempHealth: 0,
    level: 2,
    xp: 3,
    perk: null,
    imagePath: `Sprite/Pets/${imageName}.png`,
    perkImagePath: null
  };
}

function makeBattle() {
  return {
    outcome: 1,
    opponentName: 'Opponent',
    playerBoard: {
      boardPets: [makePet('Aardvark', 'Aardvark')],
      toy: { imagePath: null, level: 0 }
    },
    oppBoard: {
      boardPets: [makePet('African Penguin', 'AfricanPenguin')],
      toy: { imagePath: null, level: 0 }
    }
  };
}

const commonOptions = {
  battles: [makeBattle()],
  battleOpponentInfo: [[]],
  maxLives: 5,
  includeOdds: false,
  winPercentResults: [],
  playerName: 'Player',
  headerOpponentName: 'Opponent',
  turnNumbers: [8],
  startingLives: 3
};

test('renders positioning analysis with its result column and footer', async () => {
  const buffer = await renderReplayImage({
    ...commonOptions,
    analysisMode: 'positioning',
    analysisOptions: { precision: 'quick', side: 'player' },
    analysisResults: [{
      baselineOdds: { winPercent: 40, drawPercent: 10, lossPercent: 50 },
      optimizedOdds: { winPercent: 55, drawPercent: 10, lossPercent: 35 },
      scoreDelta: 15,
      simulationsPerformed: { total: 7400 }
    }]
  });
  const image = await Canvas.loadImage(buffer);
  assert.equal(image.width, 1610);
  assert.equal(image.height, 221);
});

test('renders strength analysis in the center of the replay board', async () => {
  const buffer = await renderReplayImage({
    ...commonOptions,
    analysisMode: 'strength',
    analysisOptions: { precision: 'quick' },
    analysisResults: [{
      player: { score: 37.2, rangeTruncated: false },
      opponent: { score: 41.8, rangeTruncated: true },
      battleCounts: { total: 8675 }
    }]
  });
  const image = await Canvas.loadImage(buffer);
  assert.equal(image.width, 1250);
  assert.equal(image.height, 221);
});
