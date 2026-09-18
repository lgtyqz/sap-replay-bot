const { PETS, PERKS, TOYS } = require('./data');
const { PACK_MAP } = require('./config');
const ABILITY_PET_MAP = require('./ability-pet-map');

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

function getCopiedPets(petJson, copyingPetId, limit) {
  const copiedPets = [];
  const copiedByPetId = new Map();

  for (const ability of petJson?.Abil || []) {
    const copiedPetId = ABILITY_PET_MAP[String(ability?.Enu)];
    const isTemporarySelfCopy = copiedPetId === copyingPetId && Number(ability?.Dur) > 0;
    if (copiedPetId === undefined || (copiedPetId === copyingPetId && !isTemporarySelfCopy)) {
      continue;
    }

    const petInfo = PETS[String(copiedPetId)];
    if (!petInfo) {
      continue;
    }

    const rawLevel = Number(ability?.Lvl);
    const level = Number.isFinite(rawLevel)
      ? Math.min(3, Math.max(1, Math.round(rawLevel)))
      : 1;
    const existing = copiedByPetId.get(copiedPetId);
    if (existing) {
      existing.level = Math.max(existing.level, level);
      continue;
    }

    const copiedPet = { name: petInfo.Name, level };
    copiedByPetId.set(copiedPetId, copiedPet);
    copiedPets.push(copiedPet);
    if (copiedPets.length === limit) {
      break;
    }
  }

  return copiedPets;
}

function parseReplayForCalculator(battleJson, buildModel) {
  const userBoard = battleJson.UserBoard;
  const opponentBoard = battleJson.OpponentBoard;

  const getTimesHurt = (petJson) => {
    const value = petJson?.Pow?.SabertoothTigerAbility;
    return Number.isFinite(value) ? value : null;
  };

  const getBattlesFought = (petJson) => {
    const abilityKey = {
      "375": "SlimeAbility",
      "781": "EagleOwlAbility"
    }[String(petJson?.Enu)];
    const value = abilityKey ? petJson?.Pow?.[abilityKey] : null;
    return Number.isFinite(value) ? value : 0;
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
    const abominationSwallowedPets = petId === "373"
      ? getCopiedPets(petJson, 373, 3)
      : [];
    const parrotCopyPet = petId === "53"
      ? getCopiedPets(petJson, 53, 1)[0]?.name ?? null
      : null;
    const timesHurt = getTimesHurt(petJson);
    const triggersConsumed = getTriggersConsumed(petJson);
    const plainCopy = petJson.AbDi === true &&
      Array.isArray(petJson.Abil) &&
      petJson.Abil.length === 0;
    const parsedPet = {
      name: PETS[petId] ? PETS[petId].Name : null,
      attack: petJson.At?.Perm + petTempAtk || 0,
      health: petJson.Hp?.Perm + petTempHp || 0,
      exp: petJson.Exp || 0,
      equipment: petJson.Perk ? { name: PERKS[petJson.Perk]?.Name || "Unknown Perk" } : null,
      mana: petJson.Mana || 0,
      plainCopy: plainCopy,
      belugaSwallowedPet: belugaSwallowedPet,
      parrotCopyPet: parrotCopyPet,
      abominationSwallowedPet1: null,
      abominationSwallowedPet2: null,
      abominationSwallowedPet3: null,
      abominationSwallowedPet1Level: null,
      abominationSwallowedPet2Level: null,
      abominationSwallowedPet3Level: null,
      battlesFought: getBattlesFought(petJson)
    };
    abominationSwallowedPets.forEach((swallowedPet, index) => {
      const slot = index + 1;
      parsedPet[`abominationSwallowedPet${slot}`] = swallowedPet.name;
      parsedPet[`abominationSwallowedPet${slot}Level`] = swallowedPet.level;
    });
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
  const playerPets = parseBoardPets(userBoard);
  const opponentPets = parseBoardPets(opponentBoard);
  const plainCopies = [...playerPets, ...opponentPets].some((pet) => pet?.plainCopy);

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
    playerPets: playerPets,
    opponentPets: opponentPets,
    // Default UI settings for a clean calculator state
    angler: false, allPets: false, logFilter: null, fontSize: 13, customPacks: customPacks,
    oldStork: false, tokenPets: false, komodoShuffle: false, mana: true, plainCopies: plainCopies,
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
  if (state.plainCopies) strippedState.plainCopies = true;
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
    if (pet.plainCopy) newPet.plainCopy = true;
    if (pet.equipment) newPet.equipment = pet.equipment;
    if (pet.belugaSwallowedPet !== null) newPet.belugaSwallowedPet = pet.belugaSwallowedPet;
    if (pet.parrotCopyPet !== null) newPet.parrotCopyPet = pet.parrotCopyPet;
    if (pet.timesHurt) newPet.timesHurt = pet.timesHurt;
    if (Number.isFinite(pet.battlesFought) && pet.battlesFought !== 0) {
      newPet.battlesFought = pet.battlesFought;
    }
    if (Number.isFinite(pet.triggersConsumed) && pet.triggersConsumed !== 0) {
      newPet.triggersConsumed = pet.triggersConsumed;
    }
    for (let slot = 1; slot <= 3; slot++) {
      const swallowedPetKey = `abominationSwallowedPet${slot}`;
      const swallowedPetLevelKey = `${swallowedPetKey}Level`;
      if (pet[swallowedPetKey]) {
        newPet[swallowedPetKey] = pet[swallowedPetKey];
      }
      if (Number.isFinite(pet[swallowedPetLevelKey])) {
        newPet[swallowedPetLevelKey] = pet[swallowedPetLevelKey];
      }
    }

    // All other pet properties like `foodsEaten`, etc.,
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
  oldStork: "os", tokenPets: "tp", komodoShuffle: "ks", mana: "m", plainCopies: "pCs",
  showAdvanced: "sa", ailmentEquipment: "ae", playerTransformationAmount: "pTA", opponentTransformationAmount: "oTA",
  // Pet Object Keys
  name: "n", attack: "a", health: "h", exp: "e", plainCopy: "pC", equipment: "eq", belugaSwallowedPet: "bSP", parrotCopyPet: "pCP", timesHurt: "tH",
  battlesFought: "bF",
  abominationSwallowedPet1: "aSP1", abominationSwallowedPet2: "aSP2", abominationSwallowedPet3: "aSP3",
  abominationSwallowedPet1Level: "aSP1L", abominationSwallowedPet2Level: "aSP2L", abominationSwallowedPet3Level: "aSP3L"
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
  const baseUrl = "https://lgtyqz.github.io/SAP-Calculator/";

  const strippedState = stripDefaultValues(calculatorState);

  const truncatedState = truncateKeys(strippedState);

  const stateString = JSON.stringify(truncatedState);
  const base64Data = Buffer.from(stateString).toString('base64');

  return `${baseUrl}?c=${base64Data}`;
}

module.exports = {
  parseReplayForCalculator,
  generateCalculatorLink
};
