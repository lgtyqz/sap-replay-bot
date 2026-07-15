const DEFAULT_API_BASE = 'http://127.0.0.1:3000';
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const VALID_PRECISIONS = new Set(['quick', 'standard', 'high']);
const VALID_SIDES = new Set(['player', 'opponent']);

function parseAnalysisArgument(argument, { command, allowSide = false }) {
  const trimmed = String(argument || '').trim();
  if (!trimmed) {
    throw new Error(`Please provide a replay ID. Example: \`${command} {"Pid":"..."}\``);
  }

  let payload;
  if (trimmed.startsWith('{')) {
    try {
      payload = JSON.parse(trimmed);
    } catch (error) {
      throw new Error(`Invalid JSON format. Example: \`${command} {"Pid":"...","T":8}\``);
    }
  } else {
    payload = { Pid: trimmed };
  }

  const participationId = payload.Pid ?? payload.pid;
  if (!participationId) {
    throw new Error('Replay Pid not found.');
  }

  const rawTurn = payload.T ?? payload.turnNumber ?? payload.turn;
  let turnNumber = null;
  if (rawTurn !== undefined && rawTurn !== null && rawTurn !== '') {
    const parsedTurn = Number(rawTurn);
    if (!Number.isFinite(parsedTurn) || parsedTurn <= 0) {
      throw new Error('Please provide a valid, positive turn number in the `T` field.');
    }
    turnNumber = Math.trunc(parsedTurn);
  }

  const precision = String(payload.Precision ?? payload.precision ?? 'quick').toLowerCase();
  if (!VALID_PRECISIONS.has(precision)) {
    throw new Error('Precision must be `quick`, `standard`, or `high`.');
  }

  let side = 'player';
  if (allowSide) {
    side = String(payload.Side ?? payload.side ?? 'player').toLowerCase();
    if (!VALID_SIDES.has(side)) {
      throw new Error('Side must be `player` or `opponent`.');
    }
  }

  return {
    participationId: String(participationId),
    turnNumber,
    precision,
    side
  };
}

function selectTurnIndexes(numberOfBattles, requestedTurn) {
  if (requestedTurn === null || requestedTurn === undefined) {
    return Array.from({ length: numberOfBattles }, (_, index) => index);
  }
  if (requestedTurn > numberOfBattles) {
    throw new Error(`Turn ${requestedTurn} not found in this replay. Max turns: ${numberOfBattles}`);
  }
  return [requestedTurn - 1];
}

async function requestCalculatorAnalysis({
  replay,
  turnNumber,
  mode,
  precision = 'quick',
  side = 'player',
  apiBase = process.env.SAP_CALCULATOR_API_BASE || DEFAULT_API_BASE,
  timeoutMs = Number(process.env.SAP_CALCULATOR_API_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  fetchImpl = fetch
}) {
  if (mode !== 'positioning' && mode !== 'strength') {
    throw new Error(`Unsupported calculator analysis mode: ${mode}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body = { replay, turnNumber, precision };
    if (mode === 'positioning') {
      body.side = side;
    }
    const response = await fetchImpl(
      `${String(apiBase).replace(/\/+$/, '')}/api/replay/${mode}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      }
    );

    if (!response.ok) {
      let detail = '';
      try {
        const errorBody = await response.json();
        detail = errorBody?.error ? `: ${errorBody.error}` : '';
      } catch (error) {
        // The status code still provides a useful error if the body is not JSON.
      }
      throw new Error(`SAP Calculator returned status ${response.status}${detail}`);
    }
    return response.json();
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`SAP Calculator ${mode} request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function buildReplayAnalysis({ replay, turnNumbers, mode, precision, side, onProgress }) {
  const results = [];
  for (let index = 0; index < turnNumbers.length; index += 1) {
    const turnNumber = turnNumbers[index];
    try {
      results.push(await requestCalculatorAnalysis({
        replay,
        turnNumber,
        mode,
        precision,
        side
      }));
    } catch (error) {
      console.error(`Calculator ${mode} API failed for turn ${turnNumber}:`, error);
      results.push({ turnNumber, error: error.message });
    }
    if (onProgress) {
      await onProgress(index + 1, turnNumbers.length, turnNumber);
    }
  }
  return results;
}

module.exports = {
  DEFAULT_API_BASE,
  parseAnalysisArgument,
  selectTurnIndexes,
  requestCalculatorAnalysis,
  buildReplayAnalysis
};
