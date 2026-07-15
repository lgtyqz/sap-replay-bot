const Canvas = require('canvas');
const { drawPet, drawToy } = require('./drawing');
const { parsePercentValue, calcLuckPoints } = require('./luck');
const {
  BASE_CANVAS_WIDTH,
  CANVAS_WIDTH,
  FOOTER_HEIGHT,
  PET_WIDTH,
  BATTLE_HEIGHT,
  BATTLE_OUTCOMES,
  PLACEHOLDER_SPRITE,
  PLACEHOLDER_PERK
} = require('./config');

async function renderCustomPackImage(title, petNames, foodNames) {
  const spaceBetweenPets = 10;
  const spaceBetweenTiers = 25;
  const petDisplayWidth = (PET_WIDTH + spaceBetweenPets) * 10 + 50 + 50;
  const customPackCanvasWidth = petDisplayWidth + (PET_WIDTH + spaceBetweenPets) * 3 + 50;
  const customPackCanvasHeight = (PET_WIDTH + spaceBetweenTiers) * 6 + 100;
  const canvas = Canvas.createCanvas(customPackCanvasWidth, customPackCanvasHeight);
  const ctx = canvas.getContext("2d");

  ctx.textAlign = "center";
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, customPackCanvasWidth, customPackCanvasHeight);
  ctx.font = "24px Arial";
  ctx.fillStyle = "#000000";
  ctx.fillText(title, customPackCanvasWidth / 2, 40);
  
  for (let i = 0; i < petNames.length; i++) {
    for(let j = 0; j < petNames[i].length; j++){
      const imagePath = `Sprite/Pets/${petNames[i][j]}.png`;
      const x = j * (PET_WIDTH + spaceBetweenPets) + 25;
      const y = i * (PET_WIDTH + spaceBetweenTiers) + 75;
      let petImage;
      try {
        petImage = await Canvas.loadImage(imagePath);
      } catch(e){
        petImage = await Canvas.loadImage(PLACEHOLDER_SPRITE);
      }
      ctx.drawImage(
        petImage,
        x,
        y,
        PET_WIDTH,
        PET_WIDTH
      );
    }
  }

  for (let i = 0; i < foodNames.length; i++) {
    for(let j = 0; j < foodNames[i].length; j++){
      const imagePath = `Sprite/Food/${foodNames[i][j]}.png`;
      const x = petDisplayWidth + 25 + j * (PET_WIDTH + spaceBetweenPets);
      const y = i * (PET_WIDTH + spaceBetweenTiers) + 75;
      let foodImage;
      try {
        foodImage = await Canvas.loadImage(imagePath);
      } catch(e){
        foodImage = await Canvas.loadImage(PLACEHOLDER_SPRITE);
      }
      ctx.drawImage(
        foodImage,
        x,
        y,
        PET_WIDTH,
        PET_WIDTH
      );
    }
  }

  return canvas.toBuffer();
}

async function renderReplayImage({
  battles,
  battleOpponentInfo,
  maxLives,
  includeOdds,
  winPercentResults,
  playerName,
  headerOpponentName,
  analysisMode = null,
  analysisResults = [],
  analysisOptions = {},
  turnNumbers = null,
  startingLives = null
}) {
  const mode = analysisMode || (includeOdds ? 'odds' : 'replay');
  const displayedTurns = turnNumbers || battles.map((_, index) => index + 1);
  const missingTurns = mode === 'odds'
    ? (winPercentResults || [])
      .map((result, index) => {
        if (!result || !result.player || !result.opponent || !result.draw) {
          return displayedTurns[index] ?? index + 1;
        }
        return null;
      })
      .filter((value) => value !== null)
    : mode === 'positioning' || mode === 'strength'
      ? analysisResults
        .map((result, index) => result?.error ? displayedTurns[index] ?? index + 1 : null)
        .filter((value) => value !== null)
    : [];
  const hasUnknownData = battles.some((battle) => {
    const allPets = [
      ...(battle.playerBoard?.boardPets || []),
      ...(battle.oppBoard?.boardPets || [])
    ];
    return allPets.some((pet) => {
      if (!pet) {
        return false;
      }
      if (pet.name === "Token Pet") {
        return false;
      }
      const hasUnknownSprite = pet.imagePath === PLACEHOLDER_SPRITE;
      const hasUnknownPerk = pet.perkImagePath === PLACEHOLDER_PERK || pet.perk === "UNKNOWN PERK";
      return hasUnknownSprite || hasUnknownPerk;
    });
  });

  const canvasWidth = mode === 'odds'
    ? CANVAS_WIDTH
    : mode === 'positioning'
      ? BASE_CANVAS_WIDTH + 360
      : BASE_CANVAS_WIDTH;
  const footerHeight = mode === 'odds' || mode === 'positioning' || mode === 'strength'
    ? FOOTER_HEIGHT
    : 0;
  const headerHeight = (playerName && headerOpponentName) ? 36 : 0;
  const canvas = Canvas.createCanvas(canvasWidth, headerHeight + battles.length * BATTLE_HEIGHT + footerHeight);
  const ctx = canvas.getContext("2d");

  ctx.textAlign = "center";
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvasWidth, headerHeight + battles.length * BATTLE_HEIGHT + footerHeight);
  ctx.font = "18px Arial";

  const headerOffset = headerHeight;
  if (headerHeight) {
    ctx.fillStyle = "#000000";
    ctx.font = "18px Arial";
    ctx.textAlign = "center";
    const suffix = mode === 'positioning'
      ? ' (Optimized Positioning)'
      : mode === 'strength'
        ? ' (Board Strength)'
        : '';
    ctx.fillText(`${playerName} vs ${headerOpponentName}${suffix}`, canvasWidth / 2, 24);
  }

  const turnNumberIconSize = (25 + PET_WIDTH) * 2;
  const livesIconSize = 15 + PET_WIDTH;

  const hourglassIcon = await Canvas.loadImage("hourglass-twemoji.png");
  const heartIcon = await Canvas.loadImage("heart-twemoji.png");
  let totalLuckPoints = 0;
  let luckSamples = 0;
  let currentLives = startingLives ?? maxLives;

  const findOpponentInfo = (index, opponentName) => {
    for (let idx = index; idx >= 0; idx--) {
      const infoList = battleOpponentInfo[idx];
      if (!infoList) {
        continue;
      }
      const match = infoList.find(opponent => opponent.DisplayName === opponentName);
      if (match) {
        return match;
      }
    }
    return null;
  };

  for (let i = 0; i < battles.length; i++) {
    // Turn 3 (shows up turn 4) life regain
    if (startingLives === null && i === 2 && currentLives < maxLives) {
      currentLives++;
    }
    const rowStartY = headerOffset + i * BATTLE_HEIGHT;
    const baseYPosition = rowStartY + 25;
    const winPercent = (winPercentResults || [])[i] || null;
    const winValue = winPercent ? parsePercentValue(winPercent.player) : null;
    const isGaped = battles[i].outcome === BATTLE_OUTCOMES.WIN && winValue !== null && winValue <= 5;
    ctx.fillStyle = "#FFFFFF";
    if (isGaped) {
      ctx.fillStyle = "#F4D35E";
    } else {
      switch (battles[i].outcome) {
        case BATTLE_OUTCOMES.WIN:
          ctx.fillStyle = "#E6F4EA";
          break;
        case BATTLE_OUTCOMES.LOSS:
          ctx.fillStyle = "#FDECEA";
          break;
        case BATTLE_OUTCOMES.TIE:
          ctx.fillStyle = "#F2F2F2";
          break;
        default:
          ctx.fillStyle = "#FFFFFF";
      }
    }
    ctx.fillRect(0, rowStartY, canvasWidth, BATTLE_HEIGHT);

    // Draw Turn
    ctx.drawImage(hourglassIcon, 25, baseYPosition, PET_WIDTH, PET_WIDTH);
    ctx.fillStyle = "black";
    ctx.font = "24px Arial";
    ctx.fillText(displayedTurns[i] ?? i + 1, 25 + PET_WIDTH + 15, baseYPosition + PET_WIDTH / 2 + 6);

    // Draw Player Lives
    ctx.drawImage(heartIcon, turnNumberIconSize, baseYPosition, PET_WIDTH, PET_WIDTH);
    ctx.fillStyle = "white";
    ctx.font = "24px Arial";
    ctx.fillText(currentLives, turnNumberIconSize + PET_WIDTH / 2, baseYPosition + (PET_WIDTH - 24) + 6);
    ctx.fillStyle = "black";
    ctx.font = "18px Arial";
    let resultText;
    switch (battles[i].outcome) {
      case BATTLE_OUTCOMES.LOSS:
        resultText = "LOSS";
        currentLives--;
        break;
      case BATTLE_OUTCOMES.WIN:
        resultText = "WIN";
        break;
      case BATTLE_OUTCOMES.TIE:
        resultText = "TIE";
        break;
      default:
        resultText = "ERROR IDK";
    }
    ctx.fillText(resultText, turnNumberIconSize + PET_WIDTH / 2, baseYPosition + PET_WIDTH + 18 + 6);

    for (let x = 0; x < battles[i].playerBoard.boardPets.length; x++) {
      const baseXPosition = x * (PET_WIDTH + 25) + 25 + turnNumberIconSize + livesIconSize;
      const petJSON = battles[i].playerBoard.boardPets[x];
      await drawPet(ctx, petJSON, baseXPosition, baseYPosition, true);
    }

    if (battles[i].playerBoard.toy.imagePath) {
      await drawToy(
        ctx,
        battles[i].playerBoard.toy,
        (5) * (PET_WIDTH + 25) + turnNumberIconSize + livesIconSize,
        baseYPosition
      );
    }

    // Draw opponent lives
    let opponentLivesOffset = 0;
    if (battleOpponentInfo[i] || i > 0) {
      const opponent = findOpponentInfo(i, battles[i].opponentName);
      let opponentLives = opponent ? opponent.Lives : null;
      if (opponentLives !== null && opponentLives !== undefined) {
        if (battles[i].outcome === BATTLE_OUTCOMES.WIN) {
          opponentLives++;
        }
        ctx.drawImage(heartIcon, BASE_CANVAS_WIDTH - PET_WIDTH - 25, baseYPosition, PET_WIDTH, PET_WIDTH);
        ctx.fillStyle = "white";
        ctx.font = "24px Arial";
        ctx.fillText(opponentLives, BASE_CANVAS_WIDTH - PET_WIDTH - 25 + PET_WIDTH / 2, baseYPosition + (PET_WIDTH - 24) + 6);
        opponentLivesOffset = livesIconSize + 25;
      }
    }

    for (let x = 0; x < battles[i].oppBoard.boardPets.length; x++) {
      const baseXPosition = BASE_CANVAS_WIDTH - (x * (PET_WIDTH + 25) + PET_WIDTH + 25 + opponentLivesOffset);
      const petJSON = battles[i].oppBoard.boardPets[x];
      await drawPet(ctx, petJSON, baseXPosition, baseYPosition, false);
    }

    if (battles[i].oppBoard.toy.imagePath) {
      await drawToy(
        ctx,
        battles[i].oppBoard.toy,
        BASE_CANVAS_WIDTH - ((5 + 1) * (PET_WIDTH + 25) + opponentLivesOffset),
        baseYPosition
      );
    }

    if (mode === 'odds') {
      ctx.textAlign = "left";
      if (winPercent && winPercent.player && winPercent.opponent && winPercent.draw) {
        const lossValue = parsePercentValue(winPercent.opponent);
        const drawValue = parsePercentValue(winPercent.draw);
        const maxValue = Math.max(winValue ?? -1, lossValue ?? -1, drawValue ?? -1);
        const hasCertainOutcome = [winValue, lossValue, drawValue].some((value) => value === 100);

        const columnX = BASE_CANVAS_WIDTH + 10;
        const textStartY = baseYPosition + 8;
        const lineHeight = 18;
        const expectedScore = (winValue / 100) + 0.5 * (drawValue / 100);

        if (!hasCertainOutcome || winValue === 100) {
          ctx.fillStyle = "#137333";
          ctx.font = (winValue === maxValue ? "bold 16px Arial" : "16px Arial");
          ctx.fillText(`Win ${winPercent.player}`, columnX, textStartY);
        }

        if (!hasCertainOutcome || lossValue === 100) {
          const lossY = hasCertainOutcome ? textStartY : textStartY + lineHeight;
          ctx.fillStyle = "#B00020";
          ctx.font = (lossValue === maxValue ? "bold 16px Arial" : "16px Arial");
          ctx.fillText(`Loss ${winPercent.opponent}`, columnX, lossY);
        }

        if (!hasCertainOutcome || drawValue === 100) {
          const drawY = hasCertainOutcome ? textStartY : textStartY + lineHeight * 2;
          ctx.fillStyle = "#000000";
          ctx.font = (drawValue === maxValue ? "bold 16px Arial" : "16px Arial");
          ctx.fillText(`Draw ${winPercent.draw}`, columnX, drawY);
        }

        if (!hasCertainOutcome) {
          const luckPoints = calcLuckPoints(winPercent, battles[i].outcome);
          if (luckPoints) {
            totalLuckPoints += luckPoints.raw;
            luckSamples += 1;
        }
        }

        const expectedY = textStartY + lineHeight * 3;
        ctx.fillStyle = "#444444";
        ctx.font = "14px Arial";
        ctx.fillText(`Expected: ${expectedScore.toFixed(3)}`, columnX, expectedY);

        if (isGaped) {
          ctx.fillStyle = "#7A5C00";
          ctx.font = "bold 16px Arial";
          const gapedY = expectedY + lineHeight;
          ctx.fillText("GAPED", columnX, gapedY);
        }
      } else {
        ctx.fillStyle = "#000000";
        ctx.font = "16px Arial";
        ctx.fillText("Win% unavailable", BASE_CANVAS_WIDTH + 10, baseYPosition + PET_WIDTH / 2 + 6);
      }
      ctx.textAlign = "center";
    }

    if (mode === 'positioning') {
      drawPositioningResult(ctx, analysisResults[i], baseYPosition);
    }

    if (mode === 'strength') {
      drawStrengthResult(ctx, analysisResults[i], baseYPosition);
    }
  }

  if (footerHeight) {
    const footerTop = headerOffset + battles.length * BATTLE_HEIGHT;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, footerTop, canvasWidth, FOOTER_HEIGHT);
    ctx.fillStyle = "#000000";
    ctx.textAlign = "left";
    if (mode === 'odds') {
      ctx.font = "18px Arial";
      const averageLuck = luckSamples > 0 ? (totalLuckPoints / luckSamples) : null;
      const totalLuckText = luckSamples > 0
        ? `Total Luck: ${totalLuckPoints.toFixed(2)} | Average Luck: ${averageLuck.toFixed(2)}`
        : "Luck score unavailable";
      ctx.fillText(totalLuckText, 25, footerTop + 35);
    } else if (mode === 'positioning') {
      const completed = analysisResults.filter((result) => result && !result.error);
      const totalDelta = completed.reduce((sum, result) => sum + (Number(result.scoreDelta) || 0), 0);
      const simulations = completed.reduce(
        (sum, result) => sum + (Number(result.simulationsPerformed?.total) || 0),
        0
      );
      ctx.font = "14px Arial";
      ctx.fillText(
        `Precision: ${formatLabel(analysisOptions.precision || 'quick')} | Optimization side: ${analysisOptions.side || 'player'} | Simulations: ${simulations.toLocaleString()}`,
        25,
        footerTop + 24
      );
      ctx.fillText(`Total score delta across turns: ${formatDelta(totalDelta)}%`, 25, footerTop + 45);
    } else if (mode === 'strength') {
      const completed = analysisResults.filter((result) => result && !result.error);
      const battlesRun = completed.reduce(
        (sum, result) => sum + (Number(result.battleCounts?.total) || 0),
        0
      );
      ctx.font = "14px Arial";
      ctx.fillText(
        `BS1 | ${formatLabel(analysisOptions.precision || 'quick')} precision | Benchmark battles: ${battlesRun.toLocaleString()}`,
        25,
        footerTop + 27
      );
    }
    if (missingTurns.length || hasUnknownData) {
      const warningParts = [];
      if (missingTurns.length) {
        const shown = missingTurns.slice(0, 5).join(", ");
        const suffix = missingTurns.length > 5 ? ", ..." : "";
        warningParts.push(`${formatLabel(mode)} missing turns: ${shown}${suffix}`);
      }
      if (hasUnknownData) {
        warningParts.push("Unknown pet/perk data detected");
      }
      ctx.font = "14px Arial";
      ctx.fillStyle = "#444444";
      ctx.fillText(`Warnings: ${warningParts.join(" | ")}`, 25, footerTop + 55);
    }
    ctx.textAlign = "center";
  }

  return canvas.toBuffer();
}

function formatLabel(value) {
  const text = String(value || '');
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

function formatDelta(value) {
  const number = Number(value) || 0;
  return `${number > 0 ? '+' : ''}${number.toFixed(1)}`;
}

function drawPositioningResult(ctx, result, baseYPosition) {
  const x = BASE_CANVAS_WIDTH + 10;
  ctx.textAlign = 'left';
  if (!result || result.error) {
    ctx.fillStyle = '#000000';
    ctx.font = '16px Arial';
    ctx.fillText('Positioning unavailable', x, baseYPosition + PET_WIDTH / 2 + 6);
    ctx.textAlign = 'center';
    return;
  }

  const baseline = result.baselineOdds || {};
  const optimized = result.optimizedOdds || {};
  const lines = [
    ['#137333', 'Win', baseline.winPercent, optimized.winPercent],
    ['#000000', 'Draw', baseline.drawPercent, optimized.drawPercent],
    ['#B00020', 'Loss', baseline.lossPercent, optimized.lossPercent]
  ];
  lines.forEach(([color, label, before, after], index) => {
    const delta = (Number(after) || 0) - (Number(before) || 0);
    ctx.fillStyle = color;
    ctx.font = index === 0 ? 'bold 15px Arial' : '15px Arial';
    ctx.fillText(
      `${label} ${(Number(before) || 0).toFixed(1)}% -> ${(Number(after) || 0).toFixed(1)}% (${formatDelta(delta)}%)`,
      x,
      baseYPosition + 8 + index * 20
    );
  });
  ctx.fillStyle = '#444444';
  ctx.font = '14px Arial';
  ctx.fillText(`Score delta: ${formatDelta(result.scoreDelta)}%`, x, baseYPosition + 68);
  ctx.textAlign = 'center';
}

function drawStrengthResult(ctx, result, baseYPosition) {
  ctx.strokeStyle = '#BCC5D0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(720, baseYPosition - 8);
  ctx.lineTo(720, baseYPosition + 76);
  ctx.stroke();

  if (!result || result.error) {
    ctx.fillStyle = '#000000';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Strength unavailable', 720, baseYPosition + 35);
    return;
  }

  const player = result.player || {};
  const opponent = result.opponent || {};
  ctx.textAlign = 'center';
  ctx.font = 'bold 10px Arial';
  ctx.fillStyle = '#2563EB';
  ctx.fillText('PLAYER', 680, baseYPosition + 3);
  ctx.fillStyle = '#C62828';
  ctx.fillText('OPPONENT', 760, baseYPosition + 3);
  ctx.font = 'bold 25px Arial';
  ctx.fillStyle = '#174EA6';
  ctx.fillText(`${(Number(player.score) || 0).toFixed(1)}${player.rangeTruncated ? '+' : ''}`, 680, baseYPosition + 35);
  ctx.fillStyle = '#B00020';
  ctx.fillText(`${(Number(opponent.score) || 0).toFixed(1)}${opponent.rangeTruncated ? '+' : ''}`, 760, baseYPosition + 35);
  ctx.font = '10px Arial';
  ctx.fillStyle = '#5F6368';
  ctx.fillText('strength', 680, baseYPosition + 51);
  ctx.fillText('strength', 760, baseYPosition + 51);
}

module.exports = {
  renderReplayImage,
  renderCustomPackImage
};
