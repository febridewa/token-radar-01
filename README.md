# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/febridewa/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/febridewa/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks every pre-token protocol in a sealed DefiLlama snapshot by implied launch value — what its token would be worth if the protocol's record stayed as it is — and gives each one a concrete farm plan. The board covers all 40 watchlist protocols plus 158 early candidates below the $50M floor (198 rows), sets the live-token protocols aside with their market caps, and shows the calibration behind every number: each category's multiple is the median market-cap / TVL of that category's live-token protocols in the same snapshot, shrunk toward the global median. No protocol name is special-cased; the dashboard recomputes every row live and ships a model sandbox so the ranking can be stress-tested.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=js4249ts&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
