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
GAPED_BATTLE_WEBHOOK_URL=your_discord_webhook_url
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
## Output

- The replay image includes win/loss/draw percentages for each turn.
- Wins with a calculated win chance of 5% or less are uploaded as JSON attachments to `GAPED_BATTLE_WEBHOOK_URL`. Weekly/custom-pack attachments include the player's full deck contents from the replay metadata.
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
