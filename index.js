require('dotenv').config();
const { Client, Events, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const { A_DAY_IN_MS } = require('./lib/config');
const { login, fetchReplay } = require('./lib/api');
const { getBattleInfo } = require('./lib/battle');
const DEBUG_MODE = String(process.env.DEBUG_MODE || '').toLowerCase() === 'true';
const {
  buildWinPercentReport,
  buildWinPercentReportHeadless,
  getDebugBattle,
  getDebugSequence,
  parseReplayForCalculator,
  generateCalculatorLink
} = require('./lib/calculator');
const { renderReplayImage } = require('./lib/render');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once(Events.ClientReady, async readyClient => {
  await login();
  setInterval(login, A_DAY_IN_MS);
});

client.on('messageCreate', async (message) => {
  const trimmedContent = message.content.trim();
  const lowerContent = trimmedContent.toLowerCase();

  if (lowerContent.startsWith('!calc ')) {
    const jsonArgument = message.content.slice('!calc '.length).trim();

    let replayData;
    try {
      replayData = JSON.parse(jsonArgument);
    } catch (e) {
      return message.reply("Invalid JSON format. Please provide the data like this: `!calc {\"Pid\":\"...\",\"T\":...}`");
    }

    const participationId = replayData.Pid;
    console.log(`!calc Participation Id: ${participationId}`);
    const turnNumber = replayData.T;

    // --- Argument Validation ---
    if (!participationId || turnNumber === undefined) {
      return message.reply("The provided JSON is missing the required `Pid` or `T` (turn number) field.");
    }
    if (isNaN(turnNumber) || turnNumber <= 0) {
      return message.reply("Please provide a valid, positive turn number in the `T` field.");
    }

    try {
      // --- Fetch Replay Data ---
      const rawReplay = await fetchReplay(participationId);
      if (!rawReplay.ok) {
        throw new Error(`API returned status ${rawReplay.status}`);
      }
      const replay = await rawReplay.json();
      let buildModel = null;
      if (replay.GenesisModeModel) {
        try {
          buildModel = JSON.parse(replay.GenesisModeModel);
        } catch (error) {
          console.warn("Failed to parse GenesisModeModel for calculator link:", error);
        }
      }

      // --- Find the Specific Battle ---
      const battles = replay.Actions.filter(action => action.Type === 0).map(action => JSON.parse(action.Battle));
      const targetBattle = battles[turnNumber - 1];

      if (!targetBattle) {
        return message.reply(`Sorry, I couldn't find a battle for Turn ${turnNumber}. The replay might not be that long.`);
      }

      // --- Generate and Send Link ---
      const calculatorState = parseReplayForCalculator(targetBattle, buildModel);
      const calculatorLink = generateCalculatorLink(calculatorState);

      if (calculatorLink.length > 1800) {
        const linkText = `Sap Calculator URL for Turn ${turnNumber}:\n${calculatorLink}\n`;
        const buffer = Buffer.from(linkText, 'utf-8');
        return message.reply({
          content: `The generated link for this turn is too long for a link. I've attached it as a text file.`,
          files: [{ attachment: buffer, name: `sap_calculator_turn_${turnNumber}.txt` }]
        });
      } else if (calculatorLink.length > 512) {
        console.warn(`Generated URL is too long (${calculatorLink.length}) and was skipped.`);
        return message.reply(`The generated link for this turn is too long for a button. Here it is directly:\n[Sap Calculator](${calculatorLink})`);
      }
      const button = new ButtonBuilder();
      button.data = {
        type: 2, // 2 is the type for a Button
        style: 5, // 5 is the style for a Link button
        label: `Analyze Turn ${turnNumber} in SAP Calculator`,
        url: calculatorLink
      };

      // Create the Action Row and add the manually created button object.
      const row = new ActionRowBuilder().addComponents(button);

      // Send the reply. The structure is now guaranteed to be what Discord expects.
      message.reply({
        content: `Here is the analysis link for **Turn ${turnNumber}** of the requested replay:`,
        components: [row]
      });

    } catch (error) {
      console.error("Failed to process !calc command:", error);
      message.reply("Sorry, I couldn't fetch or process that replay. Please double-check the ID.");
    }
    return;
  }

  // check whether message contains the code format
  let participationId;
  let includeOdds = false;
  let useHeadless = false;
  let processingMessage = null;
  if (trimmedContent.startsWith('{') && trimmedContent.endsWith('}')) {
    try {
      let replayObject = JSON.parse(message.content);
      participationId = replayObject["Pid"];
      console.log(`Participation Id: ${participationId}`);
    } catch (e) {
      return;
    }

    if (!participationId) {
      message.reply("Replay Pid not found.");
      return;
    }
  } else if (lowerContent.startsWith('!odds ')) {
    const oddsArg = trimmedContent.slice('!odds '.length).trim();
    includeOdds = true;
    useHeadless = true;
    if (!oddsArg) {
      return message.reply("Please provide a replay ID. Example: `!odds {\"Pid\":ABC123}`");
    }
    if (oddsArg.startsWith('{') && oddsArg.endsWith('}')) {
      try {
        const replayObject = JSON.parse(oddsArg);
        participationId = replayObject["Pid"];
      } catch (e) {
        return message.reply("Invalid JSON format. Please provide the data like this: `!odds {\"Pid\":\"...\",\"T\":...}`");
      }
    } else {
      participationId = oddsArg;
    }
    if (!participationId) {
      return message.reply("Replay Pid not found.");
    }
    console.log(`!odds Participation Id: ${participationId}`);
  } else if (lowerContent.startsWith('!debug ')) {
    if (!DEBUG_MODE) return;
    const jsonArgument = message.content.slice('!debug '.length).trim();

    let replayData;
    try {
      replayData = JSON.parse(jsonArgument);
    } catch (e) {
      return message.reply("Invalid JSON format. Please provide the data like this: `!debug {\"Pid\":\"...\",\"T\":...}`");
    }

    const participationId = replayData.Pid;
    const turnNumber = replayData.T;

    if (!participationId || turnNumber === undefined) {
      return message.reply("The provided JSON is missing the required `Pid` or `T` (turn number) field.");
    }
    if (isNaN(turnNumber) || turnNumber <= 0) {
      return message.reply("Please provide a valid, positive turn number in the `T` field.");
    }

    try {
      message.reply(`Fetching replay ${participationId} and calculating logs for Turn ${turnNumber}...`);
      const rawReplay = await fetchReplay(participationId);
      const replay = await rawReplay.json();
      let buildModel = null;
      if (replay.GenesisModeModel) {
        try {
          buildModel = JSON.parse(replay.GenesisModeModel);
        } catch (error) {
          console.warn("Failed to parse GenesisModeModel for debug:", error);
        }
      }

      const battles = replay["Actions"].filter(action => action["Type"] === 0).map(action => JSON.parse(action["Battle"]));
      const targetBattle = battles[turnNumber - 1];

      if (!targetBattle) {
        return message.reply(`Turn ${turnNumber} not found in this replay. Max turns: ${battles.length}`);
      }

      const debugResult = getDebugBattle(targetBattle, buildModel);
      if (debugResult) {
        const logContent = debugResult.logs.map(log => {
          if (typeof log === 'string') return log;
          return log.message || '[Log Object]';
        }).join('\n');
        const buffer = Buffer.from(logContent, 'utf-8');
        await message.reply({
          content: `**Debug Result for Turn ${turnNumber} (250 Simulations)**\n` +
            `Player Win: ${debugResult.winrate.player}\n` +
            `Opponent Win: ${debugResult.winrate.opponent}\n` +
            `Draw: ${debugResult.winrate.draw}\n` +
            `\nAttached: Logs from the first simulated battle.`,
          files: [{ attachment: buffer, name: `battle_logs_turn_${turnNumber}.txt` }]
        });
      } else {
        message.reply("Failed to generate debug logs.");
      }
    } catch (err) {
      console.error(err);
      message.reply("Error running debug calculation.");
    }
    return;
  } else if (lowerContent.startsWith('!debugseq ')) {
    if (!DEBUG_MODE) return;
    const jsonArgument = message.content.slice('!debugseq '.length).trim();

    let replayData;
    try {
      replayData = JSON.parse(jsonArgument);
    } catch (e) {
      return message.reply("Invalid JSON format. Please provide the data like this: `!debugSeq {\"Pid\":\"...\",\"T\":...}`");
    }

    const participationId = replayData.Pid;
    const turnNumber = replayData.T;

    if (!participationId || turnNumber === undefined) {
      return message.reply("The provided JSON is missing the required `Pid` or `T` (turn number) field.");
    }
    if (isNaN(turnNumber) || turnNumber <= 0) {
      return message.reply("Please provide a valid, positive turn number in the `T` field.");
    }

    try {
      message.reply(`Fetching replay ${participationId} and calculating sequence logs up to Turn ${turnNumber}...`);
      const rawReplay = await fetchReplay(participationId);
      const replay = await rawReplay.json();
      let buildModel = null;
      if (replay.GenesisModeModel) {
        try {
          buildModel = JSON.parse(replay.GenesisModeModel);
        } catch (error) {
          console.warn("Failed to parse GenesisModeModel for debug sequence:", error);
        }
      }

      const battles = replay["Actions"].filter(action => action["Type"] === 0).map(action => JSON.parse(action["Battle"]));
      const targetBattle = battles[turnNumber - 1];

      if (!targetBattle) {
        return message.reply(`Turn ${turnNumber} not found in this replay. Max turns: ${battles.length}`);
      }

      // Slice battles up to the target turn for sequential simulation
      const battleSequence = battles.slice(0, turnNumber);

      const debugResult = getDebugSequence(battleSequence, turnNumber - 1, buildModel);

      if (debugResult) {
        // build summary string
        let summary = `**Debug Sequence (1..${turnNumber})**\n`;
        debugResult.results.forEach(r => {
          summary += `Turn ${r.turn}: Player ${r.player} | Opponent ${r.opponent} | Draw ${r.draw}\n`;
        });

        const logContent = debugResult.logs.map(log => {
          if (typeof log === 'string') return log;
          return log.message || '[Log Object]';
        }).join('\n');
        const buffer = Buffer.from(logContent, 'utf-8');

        await message.reply({
          content: summary + `\nAttached: Logs for Turn ${turnNumber}.`,
          files: [{ attachment: buffer, name: `battle_logs_turn_${turnNumber}.txt` }]
        });
      } else {
        message.reply("Failed to generate debug logs.");
      }
    } catch (err) {
      console.error(err);
      message.reply("Error running debug calculation.");
    }
    return;
  } else if (lowerContent.startsWith('!sim ')) {
    if (!DEBUG_MODE) return;
    const simArg = trimmedContent.slice('!sim '.length).trim();
    includeOdds = true;
    if (!simArg) {
      return message.reply("Please provide a replay ID. Example: `!sim ABC123`");
    }
    if (simArg.startsWith('{') && simArg.endsWith('}')) {
      try {
        const replayObject = JSON.parse(simArg);
        participationId = replayObject["Pid"];
      } catch (e) {
        return message.reply("Invalid JSON format. Please provide the data like this: `!sim {\"Pid\":\"...\",\"T\":...}`");
      }
    } else {
      participationId = simArg;
    }
    if (!participationId) {
      return message.reply("Replay Pid not found.");
    }
  } else {
    return;
  }

  if (includeOdds) {
    if (useHeadless) {
      processingMessage = await message.reply("Calculating odds (~1 min), please wait...");
    } else {
      processingMessage = await message.reply("Calculating odds (~1 min), please wait...");
    }
  }

  // Request replay data from server
  const rawReplay = await fetchReplay(participationId);
  const replay = await rawReplay.json();
  const actions = replay["Actions"];
  let buildModel = null;
  if (replay.GenesisModeModel) {
    try {
      buildModel = JSON.parse(replay.GenesisModeModel);
    } catch (error) {
      console.warn("Failed to parse GenesisModeModel:", error);
    }
  }
  const maxLives = buildModel?.MaxLives ?? 5;
  const battles = [];
  const calcBattles = [];
  const battleOpponentInfo = [];
  let playerName = null;

  const numberOfBattles = actions.filter(action => action["Type"] === 0).length;
  if (numberOfBattles > 30) {
    message.reply(`Max number of turns is 30. Your replay has ${numberOfBattles} turns.`);
    return;
  }
  for (let i = 0; i < actions.length; i++) {
    if (actions[i]["Type"] === 0) {
      const battle = JSON.parse(actions[i]["Battle"]);
      battles.push(getBattleInfo(battle));
      if (!playerName) {
        playerName = battle["User"] ? battle["User"]["DisplayName"] : null;
      }
      calcBattles.push(battle);
    }
    if (actions[i]["Type"] === 1) {
      const opponentInfo = JSON.parse(actions[i]["Mode"])["Opponents"];
      battleOpponentInfo.push(opponentInfo);
    }
  }
  let winPercentResults = [];
  if (includeOdds) {
    try {
      if (useHeadless) {
        winPercentResults = await buildWinPercentReportHeadless(calcBattles, buildModel);
      } else {
        winPercentResults = await buildWinPercentReport(calcBattles, buildModel);
      }
    } catch (error) {
      console.error("Auto-calc failed:", error);
    }
  }

  const headerOpponentName = battles.length ? battles[0].opponentName : null;
  const imageBuffer = await renderReplayImage({
    battles,
    battleOpponentInfo,
    maxLives,
    includeOdds,
    winPercentResults,
    playerName,
    headerOpponentName
  });

  if (processingMessage) {
    await processingMessage.edit({ content: null, files: [{ attachment: imageBuffer, name: "replay.png" }] });
  } else {
    await message.reply({ files: [{ attachment: imageBuffer, name: "replay.png" }] });
  }
});

client.login(process.env.DISCORD_TOKEN);
