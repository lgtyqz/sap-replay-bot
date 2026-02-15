require('dotenv').config();
const { login, fetchReplay } = require('../lib/api');

async function main() {
  const [, , pid, turnArg] = process.argv;
  if (!pid) {
    console.error('Usage: node scripts/print-boards.js <Pid> [turn]');
    process.exit(1);
  }
  const turn = Number(turnArg || 1);
  await login();
  const raw = await fetchReplay(pid);
  if (!raw.ok) {
    console.error(`Replay fetch failed: ${raw.status}`);
    process.exit(1);
  }
  const replay = await raw.json();
  const battles = replay.Actions.filter(a => a.Type === 0).map(a => JSON.parse(a.Battle));
  const battle = battles[turn - 1];
  if (!battle) {
    console.error(`Turn ${turn} not found. Total turns: ${battles.length}`);
    process.exit(1);
  }
  console.log(JSON.stringify({
    turn,
    userBoard: battle.UserBoard,
    opponentBoard: battle.OpponentBoard
  }, null, 2));
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
