const { chromium } = require('playwright');
const { PETS, PERKS, TOYS } = require('./data');
const { PACK_MAP } = require('./config');

const PETS_META_BY_ID = new Map();
Object.values(PETS).forEach((pet) => {
  const tierValue = Number(pet?.Tier);
  if (!pet?.Id) {
    return;
  }
  if (Number.isFinite(tierValue)) {
    PETS_META_BY_ID.set(String(pet.Id), { name: pet.Name, tier: tierValue });
  }
});

function buildCustomPacksFromGenesis(buildModel, battleJson) {
  const decks = [
    buildModel?.Bor?.Deck,
    battleJson?.UserBoard?.Deck,
    battleJson?.OpponentBoard?.Deck
  ].filter((deck) => deck && Array.isArray(deck.Minions));

  const packs = [];
  const seenDeckIds = new Set();
  const usedNames = new Set();

  for (const deck of decks) {
    const deckId = deck?.Id ? String(deck.Id) : null;
    if (deckId && seenDeckIds.has(deckId)) {
      continue;
    }
    if (deckId) {
      seenDeckIds.add(deckId);
    }

    const pack = buildCustomPackFromDeck(deck, usedNames);
    if (pack) {
      packs.push({ ...pack, deckId });
    }
  }

  return packs;
}

function buildCustomPackFromDeck(deck, usedNames) {
  if (!deck || !Array.isArray(deck.Minions)) {
    return null;
  }

  const minions = deck.Minions.map((id) => String(id));
  const tierPets = {
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: []
  };

  for (const minionId of minions) {
    const petMeta = PETS_META_BY_ID.get(minionId);
    if (!petMeta) {
      continue;
    }
    if (tierPets[petMeta.tier]) {
      tierPets[petMeta.tier].push(petMeta.name);
    }
  }

  const normalizeTierPets = (pets) => {
    const normalized = pets.slice(0, 10);
    while (normalized.length < 10) {
      normalized.push(null);
    }
    return normalized;
  };

  let deckName = deck.Title || "Custom Pack";
  if (usedNames.has(deckName)) {
    let suffix = 2;
    while (usedNames.has(`${deckName} (${suffix})`)) {
      suffix += 1;
    }
    deckName = `${deckName} (${suffix})`;
  }
  usedNames.add(deckName);

  return {
    name: deckName,
    tier1Pets: normalizeTierPets(tierPets[1]),
    tier2Pets: normalizeTierPets(tierPets[2]),
    tier3Pets: normalizeTierPets(tierPets[3]),
    tier4Pets: normalizeTierPets(tierPets[4]),
    tier5Pets: normalizeTierPets(tierPets[5]),
    tier6Pets: normalizeTierPets(tierPets[6])
  };
}

function findCustomPackFromDeck(customPacks, deck) {
  if (!deck) {
    return null;
  }
  const deckId = deck?.Id ? String(deck.Id) : null;
  if (deckId) {
    const byId = customPacks.find((pack) => pack.deckId === deckId);
    if (byId) {
      return byId;
    }
  }
  const deckName = deck?.Title;
  if (deckName) {
    return customPacks.find((pack) => pack.name === deckName) || null;
  }
  return null;
}

function clearCalculatorCache() {
  const cacheKeys = Object.keys(require.cache);
  for (const key of cacheKeys) {
    if (key.includes('sap-calculator')) {
      delete require.cache[key];
    }
  }
}

async function buildWinPercentReportHeadless(battleJsonList, buildModel) {
  const results = [];
  for (let i = 0; i < battleJsonList.length; i++) {
    try {
      const calculatorState = parseReplayForCalculator(battleJsonList[i], buildModel);

      const config = {
        ...calculatorState,
        playerToyLevel: Number(calculatorState.playerToyLevel) || 1,
        opponentToyLevel: Number(calculatorState.opponentToyLevel) || 1,
        simulationCount: 250
      };

      clearCalculatorCache();
      const { runSimulation } = require('sap-calculator');
      const result = runSimulation(config);

      const total = config.simulationCount;
      const pWin = ((result.playerWins / total) * 100).toFixed(1) + '%';
      const oWin = ((result.opponentWins / total) * 100).toFixed(1) + '%';
      const draw = ((result.draws / total) * 100).toFixed(1) + '%';

      const line = `Turn ${i + 1}: Player ${pWin} | Opponent ${oWin} | Draw ${draw}`;

      results.push({
        line,
        player: pWin,
        opponent: oWin,
        draw: draw
      });
    } catch (error) {
      console.error(`Failed to calculate win% for turn ${i + 1}:`, error);
      results.push({
        line: `Turn ${i + 1}: Error calculating win%.`,
        player: null,
        opponent: null,
        draw: null
      });
    }
  }
  return results;
}



function parseReplayForCalculator(battleJson, buildModel) {
  const userBoard = battleJson.UserBoard;
  const opponentBoard = battleJson.OpponentBoard;

  const getTimesHurt = (petJson) => {
    const value = petJson?.Pow?.SabertoothTigerAbility;
    return Number.isFinite(value) ? value : null;
  };

  const getTriggersConsumed = (petJson) => {
    const findValueIn = (obj) => {
      if (!obj || typeof obj !== "object") {
        return null;
      }
      for (const [key, value] of Object.entries(obj)) {
        if (!Number.isFinite(value)) {
          continue;
        }
        const normalized = String(key).toLowerCase();
        const hasTrigger = normalized.includes("trigger") || normalized.includes("trig");
        const hasConsumed = normalized.includes("consum");
        const isAbbrev = ["trgc", "trgcn", "trc", "trcn", "trco"].includes(normalized);
        if ((hasTrigger && hasConsumed) || isAbbrev) {
          return value;
        }
      }
      return null;
    };

    const abilityValues = (petJson?.Abil || [])
      .map((ability) => findValueIn(ability))
      .filter((value) => Number.isFinite(value));
    const abilityValue = abilityValues.length > 0 ? Math.max(...abilityValues) : null;

    return (
      findValueIn(petJson) ??
      findValueIn(petJson?.Pow) ??
      abilityValue
    );
  };

  const parsePet = (petJson) => {
    if (!petJson) return null;
    const petId = String(petJson.Enu ?? 0);
    const petInfo = PETS[petId];
    if (!petInfo) {
      console.error(`[!!!] UNKNOWN PET ID FOUND: ${petId}. Please update pets.json.`);
    }
    const petTempAtk = petJson["At"]["Temp"] ?? 0;
    const petTempHp = petJson["Hp"]["Temp"] ?? 0;
    let belugaSwallowedPet = null;
    if (petId == 182) {
      const swallowedPets = petJson?.MiMs?.Lsts?.WhiteWhaleAbility || [];
      if (swallowedPets && swallowedPets.length > 0) {
        const swallowedPetId = swallowedPets[0].Enu;
        const swallowedPetName = PETS[String(swallowedPetId)]?.Name || `Pet #${swallowedPetId}`;
        belugaSwallowedPet = swallowedPetName;
      }
    }
    const timesHurt = getTimesHurt(petJson);
    const triggersConsumed = getTriggersConsumed(petJson);
    const parsedPet = {
      name: PETS[petId] ? PETS[petId].Name : null,
      attack: petJson.At?.Perm + petTempAtk || 0,
      health: petJson.Hp?.Perm + petTempHp || 0,
      exp: petJson.Exp || 0,
      equipment: petJson.Perk ? { name: PERKS[petJson.Perk]?.Name || "Unknown Perk" } : null,
      mana: petJson.Mana || 0,
      belugaSwallowedPet: belugaSwallowedPet,
      abominationSwallowedPet1: null,
      abominationSwallowedPet2: null,
      abominationSwallowedPet3: null,
      battlesFought: 0
    };
    if (timesHurt !== null) {
      parsedPet.timesHurt = timesHurt;
    }
    if (triggersConsumed !== null) {
      parsedPet.triggersConsumed = triggersConsumed;
    }
    return parsedPet;
  };

  const parseBoardPets = (boardJson) => {
    const pets = (boardJson?.Mins?.Items || []).filter(Boolean);
    const petArray = Array(5).fill(null);

    pets.forEach((pet, index) => {
      // Use optional chaining to safely get the position.
      let pos = pet.Poi?.x;

      // If 'Poi' or 'Poi.x' is missing, assume the position based on its
      // order in the 'Items' array. The first pet is at position 0.
      if (pos === undefined) {
        pos = index;
      }

      if (pos >= 0 && pos < 5) {
        petArray[pos] = parsePet(pet);
      }
    });

    return petArray.reverse();
  };

  const getToy = (boardJson) => {
    const toyItem = (boardJson?.Rel?.Items || []).find(item => item && item.Enu);
    if (toyItem) {
      const toyId = String(toyItem.Enu);
      return {
        name: TOYS[toyId] ? TOYS[toyId].Name : null,
        level: toyItem.Lvl || 1
      };
    }
    return { name: null, level: 1 };
  };

  const playerToy = getToy(userBoard);
  const opponentToy = getToy(opponentBoard);

  const customPacks = buildCustomPacksFromGenesis(buildModel, battleJson);
  const playerCustomPack = findCustomPackFromDeck(customPacks, userBoard?.Deck);
  const opponentCustomPack = findCustomPackFromDeck(customPacks, opponentBoard?.Deck);
  const playerPackName = PACK_MAP[userBoard.Pack] || playerCustomPack?.name || "Turtle";
  const opponentPackName = PACK_MAP[opponentBoard.Pack] || opponentCustomPack?.name || "Turtle";

  return {
    playerPack: playerPackName,
    opponentPack: opponentPackName,
    playerToy: playerToy.name,
    playerToyLevel: String(playerToy.level),
    opponentToy: opponentToy.name,
    opponentToyLevel: String(opponentToy.level),
    turn: userBoard.Tur || 1,
    playerGoldSpent: userBoard.GoSp || 0,
    opponentGoldSpent: opponentBoard.GoSp || 0,
    playerRollAmount: userBoard.Rold || 0,
    opponentRollAmount: opponentBoard.Rold || 0,
    playerSummonedAmount: userBoard.MiSu || 0,
    opponentSummonedAmount: opponentBoard.MiSu || 0,
    playerLevel3Sold: userBoard.MSFL || 0,
    opponentLevel3Sold: opponentBoard.MSFL || 0,
    playerTransformationAmount: userBoard.TrTT || 0,
    opponentTransformationAmount: opponentBoard.TrTT || 0,
    playerPets: parseBoardPets(userBoard),
    opponentPets: parseBoardPets(opponentBoard),
    // Default UI settings for a clean calculator state
    angler: false, allPets: false, logFilter: null, fontSize: 13, customPacks: customPacks,
    oldStork: false, tokenPets: false, komodoShuffle: false, mana: true,
    showAdvanced: true, ailmentEquipment: false
  };
}

function stripDefaultValues(state) {
  const strippedState = {};

  // --- Top-Level Properties ---
  // Only include properties if they differ from the calculator's default state.
  if (state.playerPack !== "Turtle") strippedState.playerPack = state.playerPack;
  if (state.opponentPack !== "Turtle") strippedState.opponentPack = state.opponentPack;
  if (state.playerToy) strippedState.playerToy = state.playerToy;
  if (state.playerToyLevel && state.playerToyLevel !== "1") strippedState.playerToyLevel = state.playerToyLevel;
  if (state.opponentToy) strippedState.opponentToy = state.opponentToy;
  if (state.opponentToyLevel && state.opponentToyLevel !== "1") strippedState.opponentToyLevel = state.opponentToyLevel;
  if (state.turn !== 11) strippedState.turn = state.turn;
  if (state.playerGoldSpent !== 10) strippedState.playerGoldSpent = state.playerGoldSpent;
  if (state.opponentGoldSpent !== 10) strippedState.opponentGoldSpent = state.opponentGoldSpent;
  if (state.playerRollAmount !== 4) strippedState.playerRollAmount = state.playerRollAmount;
  if (state.opponentRollAmount !== 4) strippedState.opponentRollAmount = state.opponentRollAmount;
  if (state.playerSummonedAmount !== 0) strippedState.playerSummonedAmount = state.playerSummonedAmount;
  if (state.opponentSummonedAmount !== 0) strippedState.opponentSummonedAmount = state.opponentSummonedAmount;
  if (state.playerLevel3Sold !== 0) strippedState.playerLevel3Sold = state.playerLevel3Sold;
  if (state.opponentLevel3Sold !== 0) strippedState.opponentLevel3Sold = state.opponentLevel3Sold;
  if (state.playerTransformationAmount !== 0) strippedState.playerTransformationAmount = state.playerTransformationAmount;
  if (state.opponentTransformationAmount !== 0) strippedState.opponentTransformationAmount = state.opponentTransformationAmount;

  // --- UI Flags (only include if they are `true`) ---
  if (state.angler) strippedState.angler = true;
  if (state.allPets) strippedState.allPets = true;
  if (state.oldStork) strippedState.oldStork = true;
  if (state.tokenPets) strippedState.tokenPets = true;
  if (state.komodoShuffle) strippedState.komodoShuffle = true;
  if (state.mana) strippedState.mana = true;
  if (state.showAdvanced) strippedState.showAdvanced = true;
  if (state.ailmentEquipment) strippedState.ailmentEquipment = true;

  // --- Other properties with non-boolean/null defaults ---
  if (state.logFilter) strippedState.logFilter = state.logFilter;
  if (state.fontSize !== 13) strippedState.fontSize = state.fontSize;
  if (state.customPacks && state.customPacks.length > 0) strippedState.customPacks = state.customPacks;


  // --- Nested Helper Function for Pets ---
  const stripPetDefaults = (pet) => {
    if (!pet || !pet.name) return null; // If the pet is null or has no name, it's an empty slot.

    const newPet = { name: pet.name };

    if (pet.attack !== 0) newPet.attack = pet.attack;
    if (pet.health !== 0) newPet.health = pet.health;
    if (pet.exp !== 0) newPet.exp = pet.exp;
    if (pet.mana !== 0) newPet.mana = pet.mana;
    if (pet.equipment) newPet.equipment = pet.equipment;
    if (pet.belugaSwallowedPet !== null) newPet.belugaSwallowedPet = pet.belugaSwallowedPet;
    if (pet.timesHurt) newPet.timesHurt = pet.timesHurt;
    if (Number.isFinite(pet.triggersConsumed) && pet.triggersConsumed !== 0) {
      newPet.triggersConsumed = pet.triggersConsumed;
    }

    // All other pet properties like `belugaSwallowedPet`, `battlesFought`, etc.,
    // are omitted because their default is null or 0.

    return newPet;
  };

  // --- Process Pet Arrays ---
  // We process both arrays and then check if the entire array is just nulls.
  // If so, we can omit the whole key to save space.
  const strippedPlayerPets = state.playerPets.map(stripPetDefaults);
  if (strippedPlayerPets.some(p => p !== null)) { // Check if there's at least one non-null pet
    strippedState.playerPets = strippedPlayerPets;
  }

  const strippedOpponentPets = state.opponentPets.map(stripPetDefaults);
  if (strippedOpponentPets.some(p => p !== null)) { // Check if there's at least one non-null pet
    strippedState.opponentPets = strippedOpponentPets;
  }

  return strippedState;
}

const KEY_MAP = {
  playerPack: "pP", opponentPack: "oP", playerToy: "pT", playerToyLevel: "pTL",
  opponentToy: "oT", opponentToyLevel: "oTL", turn: "t", playerGoldSpent: "pGS",
  opponentGoldSpent: "oGS", playerRollAmount: "pRA", opponentRollAmount: "oRA",
  playerSummonedAmount: "pSA", opponentSummonedAmount: "oSA", playerLevel3Sold: "pL3",
  opponentLevel3Sold: "oL3", playerPets: "p", opponentPets: "o", angler: "an",
  allPets: "ap", logFilter: "lf", fontSize: "fs", customPacks: "cp",
  oldStork: "os", tokenPets: "tp", komodoShuffle: "ks", mana: "m",
  showAdvanced: "sa", ailmentEquipment: "ae", playerTransformationAmount: "pTA", opponentTransformationAmount: "oTA",
  // Pet Object Keys
  name: "n", attack: "a", health: "h", exp: "e", equipment: "eq", belugaSwallowedPet: "bSP", timesHurt: "tH"
};

function truncateKeys(data) {
  if (Array.isArray(data)) {
    return data.map(item => truncateKeys(item));
  }
  if (data !== null && typeof data === 'object') {
    const newObj = {};
    for (const key in data) {
      const newKey = KEY_MAP[key] || key; // Use short key if it exists, otherwise keep original
      newObj[newKey] = truncateKeys(data[key]);
    }
    return newObj;
  }
  return data; // Return primitives (strings, numbers, null) as-is
}

function generateCalculatorLink(calculatorState) {
  const baseUrl = "https://sap-calculator.com/";

  const strippedState = stripDefaultValues(calculatorState);

  const truncatedState = truncateKeys(strippedState);

  const stateString = JSON.stringify(truncatedState);
  const base64Data = Buffer.from(stateString).toString('base64');

  return `${baseUrl}?c=${base64Data}`;
}

function parseWinPercentText(rawText) {
  if (!rawText) {
    return null;
  }

  const normalized = rawText.replace(/\s+/g, ' ').trim();
  const match = normalized.match(/Player Wins:\s*\d+\s*-\s*([0-9.]+%)\s*Opponent Wins:\s*\d+\s*-\s*([0-9.]+%)\s*Draws:\s*\d+\s*-\s*([0-9.]+%)/i);
  if (!match) {
    return {
      rawLine: normalized,
      player: null,
      opponent: null,
      draw: null
    };
  }

  return {
    rawLine: normalized,
    player: match[1],
    opponent: match[2],
    draw: match[3]
  };
}

async function getWinPercentText(page, calculatorLink) {
  await page.goto(calculatorLink, { waitUntil: 'domcontentloaded' });

  const simulateButton = page.getByRole('button', { name: 'Simulate 100 Times' });
  await simulateButton.waitFor({ state: 'visible', timeout: 15000 });
  await simulateButton.click();

  const resultLocator = page.locator('text=Player Wins').first();
  await resultLocator.waitFor({ timeout: 20000 });

  const rawText = await resultLocator.evaluate((node) => {
    if (node && node.parentElement) {
      return node.parentElement.textContent;
    }
    return node ? node.textContent : '';
  });

  return parseWinPercentText(rawText);
}

async function buildWinPercentReport(battleJsonList, buildModel) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const results = [];
  for (let i = 0; i < battleJsonList.length; i++) {
    const calculatorState = parseReplayForCalculator(battleJsonList[i], buildModel);
    const calculatorLink = generateCalculatorLink(calculatorState);
    try {
      const resultData = await getWinPercentText(page, calculatorLink);
      const line = resultData && resultData.player
        ? `Turn ${i + 1}: Player ${resultData.player} | Opponent ${resultData.opponent} | Draw ${resultData.draw}`
        : `Turn ${i + 1}: ${resultData && resultData.rawLine ? resultData.rawLine : 'No result found.'}`;
      results.push({
        line,
        player: resultData ? resultData.player : null,
        opponent: resultData ? resultData.opponent : null,
        draw: resultData ? resultData.draw : null
      });
    } catch (error) {
      console.error(`Failed to fetch win% for turn ${i + 1}:`, error);
      results.push({
        line: `Turn ${i + 1}: Error fetching win%.`,
        player: null,
        opponent: null,
        draw: null
      });
    }
  }

  await browser.close();
  return results;
}


function getDebugBattle(battleJson, buildModel) {
  const calculatorState = parseReplayForCalculator(battleJson, buildModel);
  const config = {
    ...calculatorState,
    playerToyLevel: Number(calculatorState.playerToyLevel) || 1,
    opponentToyLevel: Number(calculatorState.opponentToyLevel) || 1,
    simulationCount: 250,
    logFilter: null
  };

  clearCalculatorCache();
  const { runSimulation } = require('sap-calculator');
  const result = runSimulation(config);

  const total = config.simulationCount;
  const pWin = ((result.playerWins / total) * 100).toFixed(1) + '%';
  const oWin = ((result.opponentWins / total) * 100).toFixed(1) + '%';
  const draw = ((result.draws / total) * 100).toFixed(1) + '%';

  const firstLog = (result.battles && result.battles.length > 0) ? result.battles[0].logs : [];

  return {
    winrate: {
      player: pWin,
      opponent: oWin,
      draw: draw
    },
    logs: firstLog
  };
}


function getDebugSequence(battleJsonList, targetIndex, buildModel) {
  const results = [];
  let targetLogs = [];

  for (let i = 0; i < battleJsonList.length; i++) {
    const calculatorState = parseReplayForCalculator(battleJsonList[i], buildModel);
    const config = {
      ...calculatorState,
      playerToyLevel: Number(calculatorState.playerToyLevel) || 1,
      opponentToyLevel: Number(calculatorState.opponentToyLevel) || 1,
      simulationCount: 250,
      logFilter: null
    };

    clearCalculatorCache();
    const { runSimulation } = require('sap-calculator');
    const result = runSimulation(config);

    const total = config.simulationCount;
    const pWin = ((result.playerWins / total) * 100).toFixed(1) + '%';
    const oWin = ((result.opponentWins / total) * 100).toFixed(1) + '%';
    const draw = ((result.draws / total) * 100).toFixed(1) + '%';

    results.push({
      turn: i + 1,
      player: pWin,
      opponent: oWin,
      draw: draw
    });

    if (i === targetIndex) {
      targetLogs = (result.battles && result.battles.length > 0) ? result.battles[0].logs : [];
    }
  }

  return {
    results: results,
    logs: targetLogs
  };
}

module.exports = {
  parseReplayForCalculator,
  generateCalculatorLink,
  buildWinPercentReport,
  buildWinPercentReportHeadless,
  getDebugBattle,
  getDebugSequence
};
