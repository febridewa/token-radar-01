# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/febridewa/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/febridewa/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks every pre-token protocol in a sealed DefiLlama snapshot by implied launch value — what its token would be worth if the protocol's record stayed as it is — and gives each one a concrete farm plan, netted to the dollar. The board covers all 40 watchlist protocols plus 158 early candidates below the $50M floor (198 rows), sets the live-token protocols aside with their market caps, and shows the curve behind every number: a size curve fitted on the snapshot's own 119 live-token protocols, log10(market cap) = 3.382 + 0.472 × log10(TVL), with one offset per category. No protocol name is special-cased; the dashboard recomputes every row live and ships a model sandbox so the ranking can be stress-tested.

## Reading the board

The headline number is an implied value: the size curve read at the protocol's TVL, shifted by its category's offset, adjusted for seven-day growth, for how long the protocol has run with no token, and for how many chains it reaches. The curve is fitted, not chosen — least squares on the live tokens in the same snapshot — and a slope of 0.472 says value grows slower than TVL, so a $2B protocol is worth far less per TVL dollar than a $200M one. That is why the board total is $1.92B where a flat multiple would say $4.17B: the giants are compressed by the curve the market itself draws.

The curve is tested blind, twice, against one flat median multiple — and the dashboard shows the whole test. Leave-one-out (each live token held out in turn, the curve refitted without it): median miss ×3.52 against ×4.94 flat, 46% within 3× of the real cap against 34% flat, 78% within 10× against 75%. Time split (fitted only on the 39 tokens listed before 2024, tested on the 48 listed since): median miss ×2.32 against ×4.89 flat, 54% within 3× against 35%. The Model tab draws the curve as a log-log scatter of the traded tokens with the board's rows on it.

Every row also carries a plausible range: its own 10th to 90th percentile across 100 bootstrap refits of the curve — the live comps resampled with replacement, the curve and the offsets refitted, the row re-scored — and the same percentiles of its rank, shown in the detail view. Read the range as the model's honesty about itself: a narrow range means the rank stands on the protocol's own record, a wide range means it leans on the calibration. The dashboard shows the range beside the headline in every row and in every protocol's detail view, and the Model tab lists every category offset with its comp count so the whole chain of reasoning can be checked.

Each range carries a label — narrow under 2x, wide from 2x, very wide from 4x — and the board can be filtered to wide bands only, so the rows whose headline is mostly calibration are one click away. 162 of the 198 rows are wide and 45 very wide: the blind test says the curve is usually right within a factor of a few, and the bands say so per row instead of hiding it.

Every farm plan is netted at a $1,000 position and carries a verdict. The slice is 10% of the implied value to depositors, pro rata by deposit; the costs are the plan's own gas plus the 4% a year forgone on the $1,000 for the hold. FARM means the slice pays the gas and the yield, THIN means it beats the gas only, SKIP means the gas alone eats it. At $1,000 the board splits 99 FARM / 19 THIN / 80 SKIP, and the board filters by verdict. The best hands-on hour on the watchlist is Tulipa Capital at +$3.87 an hour. The assumptions are stated on the board and in every detail view, because a verdict you cannot re-derive is a slogan.

The Model tab counts how many rows fall in each band, so the board's overall dependence on calibration is visible next to the offsets themselves.

A protocol is on the board because the snapshot records no token for it and it is not a wrapped, staked or bridged product of a token that already trades. That is a statement about the record, not about the world: a token can exist that this snapshot does not carry. The farm plan on each row is a concrete position — fresh wallet, one qualifying action a week, a hold of thirty to sixty days — sized from the protocol's own TVL, and no step ever pays to claim anything.

## Checking the model

The dashboard recomputes every row from the snapshot figures and checks the number against board.json, so the page and the data are visibly the same arithmetic. The Model tab's sandbox lets the weights move — growth, maturity, chain reach — and the board re-ranks live, so the ranking can be stress-tested instead of taken on trust. The live-token protocols are set aside on their own tab with their market caps, which is where the curve comes from in the first place.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=6etrfz79&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
<sub>Referral code 6etrfz79 is @febridewa's code, confirmed via the make.fun CLI.</sub>
