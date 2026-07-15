const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseAnalysisArgument,
  selectTurnIndexes,
  requestCalculatorAnalysis
} = require('../lib/analysis');

test('parseAnalysisArgument supports raw IDs and defaults', () => {
  assert.deepEqual(
    parseAnalysisArgument('abc-123', { command: '!strength' }),
    {
      participationId: 'abc-123',
      turnNumber: null,
      precision: 'quick',
      side: 'player'
    }
  );
});

test('parseAnalysisArgument reads positioning options', () => {
  assert.deepEqual(
    parseAnalysisArgument(
      '{"Pid":"abc","T":8,"Precision":"high","Side":"opponent"}',
      { command: '!positioning', allowSide: true }
    ),
    {
      participationId: 'abc',
      turnNumber: 8,
      precision: 'high',
      side: 'opponent'
    }
  );
});

test('parseAnalysisArgument rejects unsupported values', () => {
  assert.throws(
    () => parseAnalysisArgument('{"Pid":"abc","Precision":"ultra"}', { command: '!strength' }),
    /Precision must be/
  );
  assert.throws(
    () => parseAnalysisArgument('{"Pid":"abc","Side":"both"}', { command: '!positioning', allowSide: true }),
    /Side must be/
  );
});

test('selectTurnIndexes supports all turns or one requested turn', () => {
  assert.deepEqual(selectTurnIndexes(3, null), [0, 1, 2]);
  assert.deepEqual(selectTurnIndexes(3, 2), [1]);
  assert.throws(() => selectTurnIndexes(3, 4), /Max turns: 3/);
});

test('requestCalculatorAnalysis sends the documented positioning payload', async () => {
  let request;
  const result = await requestCalculatorAnalysis({
    replay: { Actions: [] },
    turnNumber: 4,
    mode: 'positioning',
    precision: 'standard',
    side: 'opponent',
    apiBase: 'http://calculator.test/',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        json: async () => ({ turnNumber: 4 })
      };
    }
  });

  assert.deepEqual(result, { turnNumber: 4 });
  assert.equal(request.url, 'http://calculator.test/api/replay/positioning');
  assert.deepEqual(JSON.parse(request.options.body), {
    replay: { Actions: [] },
    turnNumber: 4,
    precision: 'standard',
    side: 'opponent'
  });
});

test('requestCalculatorAnalysis omits side from strength payloads', async () => {
  let requestBody;
  await requestCalculatorAnalysis({
    replay: { Actions: [] },
    turnNumber: 2,
    mode: 'strength',
    precision: 'quick',
    apiBase: 'http://calculator.test',
    fetchImpl: async (url, options) => {
      requestBody = JSON.parse(options.body);
      return { ok: true, json: async () => ({ turnNumber: 2 }) };
    }
  });
  assert.deepEqual(requestBody, {
    replay: { Actions: [] },
    turnNumber: 2,
    precision: 'quick'
  });
});
