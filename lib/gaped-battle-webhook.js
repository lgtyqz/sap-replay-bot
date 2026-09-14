function safeFilenamePart(value) {
  return String(value || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function addCustomPackContents(battle, customPack) {
  if (!customPack || !battle?.UserBoard) {
    return battle;
  }

  return {
    ...battle,
    UserBoard: {
      ...battle.UserBoard,
      Deck: {
        ...battle.UserBoard.Deck,
        ...customPack
      }
    }
  };
}

async function sendGapedBattleToWebhook({
  webhookUrl,
  battle,
  customPack,
  participationId,
  turnNumber,
  winPercent,
  fetchImpl = fetch
}) {
  if (!webhookUrl) {
    return false;
  }

  const filename = `gaped-battle-${safeFilenamePart(participationId)}-turn-${turnNumber}.json`;
  const battleJson = JSON.stringify(addCustomPackContents(battle, customPack), null, 2);
  const formData = new FormData();

  formData.append('payload_json', JSON.stringify({
    content: [
      `Gaped battle: replay ${participationId}, turn ${turnNumber}`,
      `Win ${winPercent.player} | Loss ${winPercent.opponent} | Draw ${winPercent.draw}`
    ].join('\n'),
    allowed_mentions: { parse: [] }
  }));
  formData.append(
    'files[0]',
    new Blob([battleJson], { type: 'application/json' }),
    filename
  );

  let response;
  try {
    response = await fetchImpl(webhookUrl, {
      method: 'POST',
      body: formData
    });
  } catch (error) {
    throw new Error('Discord webhook request failed.');
  }

  if (!response.ok) {
    throw new Error(`Discord webhook returned ${response.status} ${response.statusText}`.trim());
  }

  return true;
}

module.exports = {
  addCustomPackContents,
  sendGapedBattleToWebhook
};
