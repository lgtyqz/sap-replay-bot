# SAP Replay Bot

Discord bot that renders Super Auto Pets replay summaries and pulls SAP Calculator win/loss/draw percentages per turn.

## Setup

1) Install dependencies:
```powershell
npm install
```

2) Install Playwright browsers:
```powershell
npx playwright install
```

3) Create `.env` in the repo root:
```env
DISCORD_TOKEN=your_discord_bot_token
SAP_EMAIL=your_sap_email
SAP_PASSWORD=your_sap_password
DEBUG_MODE=false
SAP_CALCULATOR_API_BASE=http://127.0.0.1:3000
# Optional; defaults to 10 minutes per analyzed turn
SAP_CALCULATOR_API_TIMEOUT_MS=600000
```

4) Enable Discord intents:
- Developer Portal -> Bot -> Privileged Gateway Intents -> Message Content Intent

5) Run the bot:
```powershell
node index.js
```

## Usage

- Send a replay JSON object directly in a channel (starts with `{` and ends with `}`).
- Use calculator link for a specific turn:
```
!calc {"Pid":"<participation_id>","T":<turn_number>}
```
- Calculate win rates for each turn (Headless Node.js):
```
!sim {"Pid":"<participation_id>","T":<turn_number>}
```
- Calculate win rates for each turn (Playwright Browser - Slow):
```
!odds {"Pid":"<participation_id>","T":<turn_number>}
```
- Optimize positioning for every replay turn (quick/player defaults):
```
!positioning <participation_id>
```
- Optimize one turn, with optional side and precision (`quick`, `standard`, or `high`):
```
!positioning {"Pid":"<participation_id>","T":8,"Side":"player","Precision":"quick"}
```
  `!position` is also accepted as a shorter alias.
- Calculate BS1 board strength for every replay turn:
```
!strength <participation_id>
```
- Calculate BS1 board strength for one turn:
```
!strength {"Pid":"<participation_id>","T":8,"Precision":"quick"}
```
## Output

- The replay image includes win/loss/draw percentages for each turn.
- Positioning images replace the selected side with its optimized lineup and show baseline-to-optimized odds.
- Strength images show the player and opponent BS1 scores between the boards.
- Row background colors:
  - Win: light green
  - Loss: light red
  - Draw: light gray
  - Easter egg: find out!
- Footer luck stats (per turn, then averaged across turns):
  - Total Luck = sum of (actual score - expected score), where actual is 1 (win), 0.5 (draw), 0 (loss), and expected is pWin + 0.5 * pDraw.
  - Average Luck = mean of luck points across turns (skips turns with a 100% outcome).

## Notes

- `canvas` may require build tools on Windows. If install fails, install the Windows Build Tools or use a prebuilt environment.
- Playwright requires a one-time browser download (`npx playwright install`).
- Positioning and strength require the SAP Calculator replay server and use its
  `/api/replay/positioning` and `/api/replay/strength` endpoints. Requests run
  sequentially to avoid multiplying calculator load. Use `T` to restrict expensive
  analysis to one replay turn.

