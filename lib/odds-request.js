const { parseReplayForCalculator } = require('./calculator');

function buildOddsRequest(battleJsonList, buildModel) {
  return {
    battleJsonList,
    buildModel,
    // The Lambda can use these parsed states to retain shop counters that
    // its raw battle parser cannot recover from its current input shape.
    calculatorStateList: battleJsonList.map((battle) =>
      parseReplayForCalculator(battle, buildModel)
    )
  };
}

module.exports = { buildOddsRequest };
