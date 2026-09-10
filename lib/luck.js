const { BATTLE_OUTCOMES } = require('./config');

function parsePercentValue(percentText) {
  if (!percentText) {
    return null;
  }
  const value = Number(String(percentText).replace('%', ''));
  return Number.isFinite(value) ? value : null;
}

function getOutcomeChance(winPercent, outcome) {
  if (!winPercent) {
    return null;
  }
  if (outcome === BATTLE_OUTCOMES.WIN) {
    return parsePercentValue(winPercent.player);
  }
  if (outcome === BATTLE_OUTCOMES.LOSS) {
    return parsePercentValue(winPercent.opponent);
  }
  if (outcome === BATTLE_OUTCOMES.TIE) {
    return parsePercentValue(winPercent.draw);
  }
  return null;
}

function isGapedBattle(battle, winPercent) {
  const winValue = parsePercentValue(winPercent?.player);
  const lossValue = parsePercentValue(winPercent?.opponent);
  const drawValue = parsePercentValue(winPercent?.draw);
  return (battle?.outcome === BATTLE_OUTCOMES.WIN && winValue !== null && winValue <= 5) ||
    (battle?.outcome === BATTLE_OUTCOMES.LOSS && lossValue !== null && lossValue <= 5) ||
    (battle?.outcome === BATTLE_OUTCOMES.TIE && drawValue !== null && (drawValue <= 5));
}

function calcLuckPoints(winPercent, outcome) {
  if (!winPercent) {
    return null;
  }

  const winValue = parsePercentValue(winPercent.player);
  const lossValue = parsePercentValue(winPercent.opponent);
  const drawValue = parsePercentValue(winPercent.draw);

  if (winValue === null || lossValue === null || drawValue === null) {
    return null;
  }

  const pWin = winValue / 100;
  const pLoss = lossValue / 100;
  const pDraw = drawValue / 100;

  const expectedScore = pWin + 0.5 * pDraw;
  let actualScore = null;
  if (outcome === BATTLE_OUTCOMES.WIN) {
    actualScore = 1;
  } else if (outcome === BATTLE_OUTCOMES.LOSS) {
    actualScore = 0;
  } else if (outcome === BATTLE_OUTCOMES.TIE) {
    actualScore = 0.5;
  }

  if (actualScore === null) {
    return null;
  }

  const rawPoints = actualScore - expectedScore;
  return {
    raw: rawPoints
  };
}

module.exports = {
  parsePercentValue,
  getOutcomeChance,
  isGapedBattle,
  calcLuckPoints
};
