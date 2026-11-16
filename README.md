# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/febridewa/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/febridewa/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks every pre-token protocol in a sealed DefiLlama snapshot by implied launch value — what its token would be worth if the protocol's record stayed as it is — and gives each one a concrete farm plan. The board covers all 40 watchlist protocols plus 158 early candidates below the $50M floor (198 rows), sets the live-token protocols aside with their market caps, and shows the calibration behind every number: each category's multiple is the median market-cap / TVL of that category's live-token protocols in the same snapshot, shrunk toward the global median. No protocol name is special-cased; the dashboard recomputes every row live and ships a model sandbox so the ranking can be stress-tested.

## Reading the board

The headline number is an implied value: TVL times a category multiple calibrated from the live-token protocols in the same snapshot, adjusted for seven-day growth, for how long the protocol has run with no token, and for how many chains it reaches. The multiple is the median market-cap per TVL dollar of that category's live protocols, shrunk toward the global median when the category has few live comps, so a thin category cannot set its own price.

Every row also carries a plausible range. It re-scores the same protocol at the two ends of the calibration — the global median on one side, the category's raw median on the other — through the same growth, maturity and chain terms. Read the range as the model's honesty about itself: a narrow range means the rank stands on the protocol's own record, a wide range means it leans on the calibration. The dashboard shows the range beside the headline in every row and in every protocol's detail view, and the Model tab lists every calibrated multiple with its comp count so the whole chain of reasoning can be checked.

Each range carries a label — narrow under 2x, wide from 2x, very wide from 4x — and the board can be filtered to wide bands only, so the rows whose headline is mostly calibration are one click away.

The Model tab counts how many rows fall in each band, so the board's overall dependence on calibration is visible next to the multiples themselves.

A protocol is on the board because the snapshot records no token for it and it is not a wrapped, staked or bridged product of a token that already trades. That is a statement about the record, not about the world: a token can exist that this snapshot does not carry. The farm plan on each row is a concrete position — fresh wallet, one qualifying action a week, a hold of thirty to sixty days — sized from the protocol's own TVL, and no step ever pays to claim anything.

## Checking the model

The dashboard recomputes every row from the snapshot figures and checks the number against board.json, so the page and the data are visibly the same arithmetic. The Model tab's sandbox lets the weights move — growth, maturity, chain reach — and the board re-ranks live, so the ranking can be stress-tested instead of taken on trust. The live-token protocols are set aside on their own tab with their market caps, which is where the calibration comes from in the first place.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=6etrfz79&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
<sub>Referral code 6etrfz79 is @febridewa's code, confirmed via the make.fun CLI.</sub>
