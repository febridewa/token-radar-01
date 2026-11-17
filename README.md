# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/febridewa/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/febridewa/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar ranks every pre-token protocol in a sealed DefiLlama snapshot by implied launch value — what its token would be worth if the protocol's record stayed as it is — and gives each one a concrete farm plan, netted to the dollar. The board covers all 40 watchlist protocols plus 158 early candidates below the $50M floor (198 rows), sets the live-token protocols aside with their market caps, and shows the curve behind every number: a size curve fitted on the snapshot's own 119 live-token protocols, log10(market cap) = 3.438 + 0.478 × log10(TVL), with one offset per family. No protocol name is special-cased. The model is one file, `dashboard/model.js` — the same file the build runs and the dashboard runs in the browser — so the page recomputes every row live and checks the number against board.json (198/198 match).

## Reading the board

The headline number is an implied value: the size curve read at the protocol's TVL, shifted by its family's offset, adjusted for seven-day growth and for how long the protocol has run with no token. The curve is fitted, not chosen — least squares on the live tokens in the same snapshot — and a slope of 0.478 says value grows slower than TVL, so a $2B protocol is worth far less per TVL dollar than a $200M one. That is why the board total is $2.14B where a flat multiple would say more: the giants are compressed by the curve the market itself draws. The comps are only the tokens that can price a launch at all: exchanges are out. Par categories stay in — the family offsets absorb the par effect, and the blind tests say so.

The curve is tested blind, three times, against one flat median multiple — and the dashboard shows the whole test. Leave-one-out (each live token held out in turn, the curve refitted without it): median miss ×3.07 against ×4.94 flat, 50% within 3× of the real cap against 34% flat. Time split (fitted only on the 39 tokens listed before 2024, tested on the 48 listed since): median miss ×2.12 against ×4.89 flat, 54% within 3× against 35%. Category holdout (each kind of protocol held out whole, the curve fitted on every other kind): median miss ×3.01 against ×4.75 flat, 50% within 3× against 36% — and the dashboard names, kind by kind, where the curve wins and where it loses (Lending, Liquid Restaking, Payments, Staking Pool and Token Locker are the kinds where the flat multiple does better). The Method tab draws the curve as a log-log scatter of the traded tokens. The leave-one-out ladder shows each piece earning its keep: flat multiple ×4.94, size curve only ×3.38, curve plus family offsets ×3.18, full model with tilts ×3.07. The tilt form was picked by the same blind tests — three candidates run through the same code before the tilt was chosen — and the shipped form wins the time split and the rank correlation (8-fold Spearman 0.42).

Every row also carries a plausible range: its own 10th to 90th percentile across 200 bootstrap refits of the curve — the live comps resampled with replacement, the curve and the offsets refitted, the row re-scored — and the same percentiles of its rank, shown in the detail view. Read the range as the model's honesty about itself: a narrow range means the rank stands on the protocol's own record, a wide range means it leans on the calibration. The dashboard shows the range beside the headline in every row and in every protocol's detail view, and the Method tab lists every family offset with its comp count so the whole chain of reasoning can be checked.

Every range carries a label — narrow under 2×, wide from 2×, very wide from 4×. 108 of the 198 rows are wide and none very wide: the blind test says the curve is usually right within a factor of a few, and the bands say so per row instead of hiding it.

Every farm plan is netted at one sized deposit — the protocol's TVL ÷ 20,000, between $500 and $5,000 — and carries a verdict. The slice is 10% of the implied value to depositors, pro rata by deposit; the costs are the plan's own gas (per chain: $0.05 cheap, $0.30 mid, $3.00 Ethereum/Bitcoin, $1.00 elsewhere) plus the 4% a year forgone on the deposit, less the deposit's own yield, for the hold. FARM means the break-even odds (costs ÷ slice) are 10% or less, THIN 25% or less, else SKIP. The board splits 61 FARM / 39 THIN / 98 SKIP, and the board filters by verdict. The best hands-on hour on the watchlist is Lofty at +$64.18 an hour. The assumptions are stated on the board and in every detail view, because a verdict you cannot re-derive is a slogan. Each plan also carries steps for the protocol's own mechanism — what a lending program, a DEX, a vault or a bridge actually reads beyond the deposit — so the plan is about the protocol's kind, not a slogan that fits every row.

A protocol is on the board because the snapshot records no token for it and it is not a wrapped, staked or bridged product of a token that already trades. That is a statement about the record, not about the world: a token can exist that this snapshot does not carry. The farm plan on each row is a concrete position — fresh wallet, one qualifying action a week, a hold of thirty days — sized from the protocol's own TVL, and no step ever pays to claim anything.

## Checking the model

The dashboard recomputes every row from the snapshot figures and checks the number against board.json, so the page and the data are visibly the same arithmetic — the green line at the top of the board says 198/198 ranks, values, verdicts and nets match. The Method tab shows every blind test, the leave-one-out ladder, the tilt candidates, the family offsets and the per-category holdout, so the whole chain of reasoning can be checked. The live-token protocols are set aside on their own tab with their market caps (the top 24 by market cap), which is where the curve comes from in the first place.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=6etrfz79&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
<sub>Referral code 6etrfz79 is @febridewa's code, confirmed via the make.fun CLI.</sub>
