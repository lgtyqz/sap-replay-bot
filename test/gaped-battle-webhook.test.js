const test = require('node:test');
const assert = require('node:assert/strict');

const {
  addCustomPackContents,
  sendGapedBattleToWebhook
} = require('../lib/gaped-battle-webhook');

test('adds custom pack contents to the player board without mutating the battle', () => {
  const battle = {
    Id: 'battle-id',
    UserBoard: {
      Pack: 4,
      Deck: { Id: 'pack-id', Title: 'My Pack' }
    },
    OpponentBoard: { Pack: 0 }
  };
  const customPack = {
    Id: 'pack-id',
    Title: 'My Pack',
    Minions: [1, 2, 3],
    Spells: [4, 5]
  };

  const result = addCustomPackContents(battle, customPack);

  assert.deepEqual(result.UserBoard.Deck, customPack);
  assert.deepEqual(battle.UserBoard.Deck, { Id: 'pack-id', Title: 'My Pack' });
});

test('uploads custom pack contents with the battle attachment', async () => {
  const battle = {
    Id: 'battle-id',
    UserBoard: { Pack: 4 },
    OpponentBoard: { Pack: 0 }
  };
  const customPack = {
    Id: 'pack-id',
    Title: 'RandomWeekly',
    Minions: [11, 12],
    Spells: [21]
  };
  let request;

  const sent = await sendGapedBattleToWebhook({
    webhookUrl: 'https://discord.example/webhook',
    battle,
    customPack,
    participationId: 'replay/id',
    turnNumber: 7,
    winPercent: { player: '3%', opponent: '95%', draw: '2%' },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true };
    }
  });

  assert.equal(sent, true);
  assert.equal(request.url, 'https://discord.example/webhook');
  assert.equal(request.options.method, 'POST');

  const attachment = request.options.body.get('files[0]');
  assert.equal(attachment.name, 'gaped-battle-replay_id-turn-7.json');
  const uploadedBattle = JSON.parse(await attachment.text());
  assert.deepEqual(uploadedBattle.UserBoard.Deck, customPack);
  assert.equal(uploadedBattle.Id, battle.Id);
});

test('leaves ordinary battles unchanged', () => {
  const battle = {
    Id: 'battle-id',
    UserBoard: { Pack: 0 },
    OpponentBoard: { Pack: 1 }
  };

  assert.equal(addCustomPackContents(battle), battle);
});
