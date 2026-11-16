// The token radar's model, radar-3: one snapshot of the protocol universe in, one ranked board out.
//
// WHAT THE BOARD IS
// The board ranks every launch candidate the snapshot can name: a protocol that records no token
// (no market cap, no CoinGecko id, no symbol) and is not a wrapped, staked or bridged product of a
// token that already trades. That is the house watchlist's own rule, applied to the whole snapshot
// instead of only above the $50M floor: the watchlist's 40 slugs are the floor, never the ceiling,
// and the board carries all 198 protocols that pass the rule. A protocol the watchlist leaves out
// is no worse a subject — the list is built from a parent record the snapshot does not carry, so
// the board re-derives candidacy from the ten fields it does carry and says so per row.
//
// IMPLIED VALUE, FROM THE SNAPSHOT'S OWN FIGURES ONLY
//   implied = 10 ^ (3.382 + 0.472 x log10(tvl_usd)) x category_factor x growth_mult x maturity_mult x chain_mult
// The size curve is fitted, not chosen: least squares on log10(market cap) against log10(TVL)
// over the 119 live-token protocols in this same snapshot (exchanges excluded, zero market caps
// excluded — a zero has no logarithm). A slope of 0.472 says value grows slower than TVL, so a
// $2B protocol is worth far less per TVL dollar than a $200M one. Each category then gets an
// offset — the shrunk median of its live comps' residuals from the curve, weight n / (n + 4) —
// so Prediction Market trades rich for its size and Liquid Staking trades cheap. No protocol
// name is ever special-cased: the same function scores every row, and the dashboard recomputes
// every row from the same inputs.
//
//   growth_mult   = 1 + clamp(change_7d, -50, 150) / 100 x 0.45   (null growth counts as 0)
//   maturity_mult = 0.65 + 0.35 x min(age_days, 1095) / 1095      (unknown age counts as 365 days)
//   chain_mult    = 1 + 0.015 x min(chains - 1, 6)
//
// Why each term: TVL is the protocol's scale, read through the curve the market itself draws;
// the category offset is what that kind of protocol trades at for its size; seven-day growth is
// momentum; age with no token is durability; chain count is reach. The model is a claim about
// value if the record stayed as it is — it does not predict whether or when any token is issued,
// and "records no token" is never "has no token".
//
// THE BLIND TEST (snapshot 2026-11-14, 119 live-token comps)
// The curve is tested blind, twice, against one flat median multiple. Leave-one-out: each live
// comp held out in turn, the curve refitted without it — median miss x3.52 against x4.94 flat,
// 46% within 3x of the real cap against 34% flat, 78% within 10x against 75%. Time split: fitted
// only on the 39 comps listed before 2024, tested on the 48 listed since — median miss x2.32
// against x4.89 flat, 54% within 3x against 35%. The curve earns its keep on launches it never
// saw. The dashboard shows the whole test, the curve's scatter and the offsets table.
//
// THE PLAUSIBLE RANGE
// The headline is one refit of the curve. So every row also carries the range its own value
// takes across 100 bootstrap refits — the live comps resampled with replacement, the curve and
// the offsets refitted, the row re-scored — 10th to 90th percentile, and the same percentiles
// of its rank. A narrow band means the rank survives the resampling; a wide band means the
// calibration decides it, and the dashboard shows the band beside the headline so the reader
// can see which.
//
// FARM ECONOMICS, NETTED TO THE DOLLAR
// Every row is netted at a $1,000 position: the slice is 10% of the implied value to depositors,
// pro rata, minus the plan's own gas and the 4% a year forgone on the $1,000 for the hold.
// FARM pays the fees and the yield, THIN beats the fees only, SKIP is eaten by the fees. At
// $1,000 the board splits 99 FARM / 19 THIN / 80 SKIP — the giants' slices are thin because
// the slice is a share of TVL, and a $2B TVL dilutes any deposit.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  chain_step: number;
  chain_cap: number;
  shrink_prior: number;
  multiple_floor: number;
  multiple_cap: number;
  winsor_low: number;
  winsor_high: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.45,
  growth_floor: -50,
  growth_cap: 150,
  maturity_floor: 0.65,
  maturity_range: 0.35,
  maturity_days: 1095,
  unknown_age_days: 365,
  chain_step: 0.015,
  chain_cap: 6,
  shrink_prior: 4,
  multiple_floor: 0.02,
  multiple_cap: 1.25,
  winsor_low: 0.005,
  winsor_high: 5,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** The size curve: log10(market cap) = intercept + slope x log10(TVL), fitted by least squares over the live-token comps. A slope under 1 says a token's value grows slower than its protocol's TVL: giants are worth less per TVL dollar than minnows, which a flat multiple cannot say. */
export interface SizeCurve {
  intercept: number;
  slope: number;
  comps: number;
}

/** One category's offset from the curve, in log10: the shrunk median residual of its live comps. A factor above 1 says the category's tokens trade rich for their size; below 1 says they trade cheap. */
export interface CategoryOffset {
  category: string;
  comps: number;
  offset_log10: number;
  factor: number;
}

/** One blind test of the curve: the model fitted without the answers, then scored on them. */
export interface BacktestSplit {
  name: string;
  train_n: number;
  test_n: number;
  curve_miss: number;
  flat_miss: number;
  curve_within3: number;
  flat_within3: number;
  curve_within10: number;
  flat_within10: number;
}

/** The whole blind test: leave-one-out over every live comp, plus a time split that fits only the protocols listed before 2024 and tests the newer ones. The flat baseline in both is one global median mcap / TVL for every protocol. */
export interface BacktestReport {
  loo: BacktestSplit;
  time_split: BacktestSplit;
  loo_p80_miss: number;
  live_with_listed_at: number;
}

/** What a $1,000 farm position nets, in dollars, under stated assumptions: 10% of the launch goes to depositors pro rata, gas is the plan's own schedule, and the forgone yield is 4% a year on the $1,000 for the hold. */
export interface FarmEconomics {
  capital_usd: number;
  slice_usd: number;
  fees_usd: number;
  forgone_usd: number;
  net_usd: number;
  hold_days: number;
  weeks: number;
  hours: number;
  net_per_hour_usd: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  on_watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  value_range_usd: {
    low_usd: number;
    high_usd: number;
    band_ratio: number;
  };
  model: {
    category_factor: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  economics: FarmEconomics;
  rank_low: number;
  rank_high: number;
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  on_watchlist: boolean;
  implied_value_usd: number;
  value_low_usd: number;
  value_high_usd: number;
  value_band_ratio: number;
  value_band_label: string;
  category_factor: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  slice_usd: number;
  fees_usd: number;
  net_usd: number;
  net_per_hour_usd: number;
  rank_low: number;
  rank_high: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, the curve, the blind test and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  board_implied_total_usd: number;
  watchlist_implied_total_usd: number;
  top10_implied_total_usd: number;
  wide_band_rows: number;
  very_wide_band_rows: number;
  curve: SizeCurve;
  offsets: CategoryOffset[];
  backtest: BacktestReport;
  verdict_counts: { farm: number; thin: number; skip: number };
  best_per_hour: { slug: string; name: string; net_usd: number; net_per_hour_usd: number }[];
  comps: { slug: string; name: string; category: string | null; tvl_usd: number; mcap_usd: number }[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The live-token comps the curve is fitted on: a market cap and a TVL, both positive, and not an exchange. An exchange's market cap is not a per-TVL price for a protocol's token, and a zero market cap has no logarithm. */
export function liveComps(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX');
}

/**
 * Fit the size curve by least squares on log10(market cap) against log10(TVL): the line
 * through the live comps. A slope below 1 is the data saying value grows slower than TVL,
 * so the curve, unlike a flat multiple, does not hand the biggest TVL the biggest value
 * on size alone.
 */
export function fitSizeCurve(comps: SnapshotProtocol[]): SizeCurve {
  const xs = comps.map((p) => Math.log10(p.tvl_usd));
  const ys = comps.map((p) => Math.log10(p.mcap_usd!));
  const meanX = xs.reduce((n, x) => n + x, 0) / xs.length;
  const meanY = ys.reduce((n, y) => n + y, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i]! - meanX) * (ys[i]! - meanY);
    den += (xs[i]! - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  return { intercept: Math.round((meanY - slope * meanX) * 1000) / 1000, slope: Math.round(slope * 1000) / 1000, comps: comps.length };
}

/**
 * One category's offset from the curve: the median log10 residual of its live comps,
 * shrunk toward zero with weight n / (n + shrink_prior), so a category with one live comp
 * barely moves off the curve. A category with no live comp takes no offset at all.
 */
export function categoryOffsets(comps: SnapshotProtocol[], curve: SizeCurve, model: ModelConstants = MODEL): CategoryOffset[] {
  const residuals = new Map<string, number[]>();
  for (const p of comps) {
    const residual = Math.log10(p.mcap_usd!) - (curve.intercept + curve.slope * Math.log10(p.tvl_usd));
    const key = p.category ?? 'Other';
    const list = residuals.get(key) ?? [];
    list.push(residual);
    residuals.set(key, list);
  }
  return [...residuals.entries()]
    .map(([category, values]) => {
      const weight = values.length / (values.length + model.shrink_prior);
      const offset = weight * median(values);
      return { category, comps: values.length, offset_log10: Math.round(offset * 1000) / 1000, factor: Math.round(10 ** offset * 1000) / 1000 };
    })
    .sort((a, b) => b.offset_log10 - a.offset_log10 || a.category.localeCompare(b.category));
}

/** A protocol's base value off the curve: the curve at its TVL, times its category's factor. The factor — not the log offset — is what the dashboard carries, so the page's recomputation is the same arithmetic to the dollar. */
export function curveValue(tvlUsd: number, category: string | null, curve: SizeCurve, offsets: CategoryOffset[]): number {
  const found = offsets.find((o) => o.category === (category ?? 'Other'));
  return 10 ** (curve.intercept + curve.slope * Math.log10(tvlUsd)) * (found === undefined ? 1 : found.factor);
}

/** The flat baseline's prediction: the median mcap / TVL of the training comps, times TVL. */
function flatPrediction(tvlUsd: number, train: SnapshotProtocol[]): number {
  return median(train.map((p) => p.mcap_usd! / p.tvl_usd)) * tvlUsd;
}

/** One blind test scored: median miss factor and the share within 3x and 10x, curve against flat. */
function scoreSplit(name: string, train: SnapshotProtocol[], test: SnapshotProtocol[]): BacktestSplit {
  const curveErrors: number[] = [];
  const flatErrors: number[] = [];
  for (const held of test) {
    const rest = train.filter((p) => p !== held);
    const fit = fitSizeCurve(rest);
    const offs = categoryOffsets(rest, fit);
    curveErrors.push(Math.abs(Math.log10(curveValue(held.tvl_usd, held.category, fit, offs) / held.mcap_usd!)));
    flatErrors.push(Math.abs(Math.log10(flatPrediction(held.tvl_usd, rest) / held.mcap_usd!)));
  }
  const within = (errors: number[], factor: number): number =>
    Math.round((errors.filter((e) => 10 ** e <= factor).length / errors.length) * 100);
  return {
    name,
    train_n: train.length,
    test_n: test.length,
    curve_miss: Math.round(10 ** median(curveErrors) * 100) / 100,
    flat_miss: Math.round(10 ** median(flatErrors) * 100) / 100,
    curve_within3: within(curveErrors, 3),
    flat_within3: within(flatErrors, 3),
    curve_within10: within(curveErrors, 10),
    flat_within10: within(flatErrors, 10),
  };
}

/**
 * The blind test, run two ways. Leave-one-out: every live comp in turn is held out, the curve
 * is refitted without it, and the prediction is scored against the market cap the model never
 * saw. Time split: the curve is fitted only on the comps listed before 2024 and tested on the
 * ones listed since, so the test is genuinely newer launches. Both are scored against the same
 * flat multiple, so the curve has to earn its keep twice.
 */
export function backtestCurve(snapshot: Snapshot): BacktestReport {
  const comps = liveComps(snapshot);
  const loo = scoreSplit('leave-one-out', comps, comps);
  const train = comps.filter((p) => p.listed_at !== null && p.listed_at < '2024-01-01');
  const test = comps.filter((p) => p.listed_at !== null && p.listed_at >= '2024-01-01');
  const timeSplit = scoreSplit('time split, fit pre-2024', train, test);
  const looErrors = comps
    .map((held) => {
      const rest = comps.filter((p) => p !== held);
      const fit = fitSizeCurve(rest);
      const offs = categoryOffsets(rest, fit);
      return Math.abs(Math.log10(curveValue(held.tvl_usd, held.category, fit, offs) / held.mcap_usd!));
    })
    .sort((a, b) => a - b);
  const p80 = looErrors[Math.min(looErrors.length - 1, Math.floor(looErrors.length * 0.8))];
  return { loo, time_split: timeSplit, loo_p80_miss: Math.round(10 ** p80! * 100) / 100, live_with_listed_at: comps.filter((p) => p.listed_at !== null).length };
}

/** A small seeded generator, so the bootstrap refits are the same on every run. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A percentile of sorted numbers, by linear position between the two nearest ranks. */
function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const at = q * (sorted.length - 1);
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo);
}

/**
 * The bootstrap band: resample the live comps with replacement, refit the curve and the
 * offsets, and re-score every candidate, 100 times. Each row's plausible range is the
 * 10th to 90th percentile of its own refitted values, and its rank range is the 10th to
 * 90th percentile of its refitted ranks — so a row whose rank holds across refits has earned
 * it, and a row whose rank wanders says so in the open.
 */
export function bootstrapBands(
  snapshot: Snapshot,
  candidates: SnapshotProtocol[],
  model: ModelConstants = MODEL,
): Map<string, { low: number; high: number; rankLow: number; rankHigh: number }> {
  const comps = liveComps(snapshot);
  const draw = mulberry32(20261114);
  const refits = 100;
  const values = new Map<string, number[]>();
  const ranks = new Map<string, number[]>();
  for (const c of candidates) {
    values.set(c.slug, []);
    ranks.set(c.slug, []);
  }
  for (let r = 0; r < refits; r++) {
    const sample: SnapshotProtocol[] = [];
    for (let i = 0; i < comps.length; i++) sample.push(comps[Math.floor(draw() * comps.length)]!);
    const fit = fitSizeCurve(sample);
    const offs = categoryOffsets(sample, fit, model);
    const scored = candidates
      .map((p) => ({ slug: p.slug, implied: impliedValue(p, snapshot.as_of, model, fit, offs).implied }))
      .sort((a, b) => b.implied - a.implied || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
    scored.forEach((s, i) => {
      values.get(s.slug)!.push(s.implied);
      ranks.get(s.slug)!.push(i + 1);
    });
  }
  const bands = new Map<string, { low: number; high: number; rankLow: number; rankHigh: number }>();
  for (const c of candidates) {
    const vs = [...values.get(c.slug)!].sort((a, b) => a - b);
    const rs = [...ranks.get(c.slug)!].sort((a, b) => a - b);
    bands.set(c.slug, {
      low: Math.max(1, Math.round(percentile(vs, 0.1))),
      high: Math.max(1, Math.round(percentile(vs, 0.9))),
      rankLow: Math.max(1, Math.round(percentile(rs, 0.1))),
      rankHigh: Math.max(1, Math.round(percentile(rs, 0.9))),
    });
  }
  return bands;
}

/** The multipliers and the implied value one protocol gets under `model`, the size curve and its category's offset. The curve sets the scale; growth, maturity and chain reach adjust it the way radar-2 did. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  curve: SizeCurve,
  offsets: CategoryOffset[],
): { implied: number; categoryFactor: number; growthPct: number; growthMult: number; maturityMult: number; chainMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const chainMult = 1 + model.chain_step * Math.min(Math.max(protocol.chains.length - 1, 0), model.chain_cap);
  const found = offsets.find((o) => o.category === (protocol.category ?? 'Other'));
  const categoryFactor = found === undefined ? 1 : found.factor;
  const base = curveValue(protocol.tvl_usd, protocol.category, curve, offsets);
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * chainMult));
  return { implied, categoryFactor, growthPct, growthMult, maturityMult, chainMult, age };
}

// A band's width, in words, so the dashboard can label every row with it and a reader can tell at
// a glance whether the headline stands on the protocol or on the calibration. Fourfold or more
// means the bootstrap refits disagree so much about the row that the headline is mostly a guess.
export function bandLabel(bandRatio: number): 'narrow' | 'wide' | 'very wide' {
  if (bandRatio >= 4) return 'very wide';
  if (bandRatio >= 2) return 'wide';
  return 'narrow';
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word wrapped, staked or staking anywhere in the name: a product of a traded token. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Exchange names: a protocol beginning with one is the exchange's own product. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)(\s|$)/;

/** Categories the house watchlist rule excludes outright: bridges, liquid staking and exchanges. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is a launch candidate: pre-token, and not a wrapped, staked or bridged
 * product of a protocol whose token already trades — the house watchlist's rule, applied to the
 * whole snapshot. Every watchlist slug passes it; the board adds every other protocol that does.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const comps = liveComps(snapshot);
  const curve = fitSizeCurve(comps);
  const offsets = categoryOffsets(comps, curve, model);
  const watchlist = new Set(snapshot.watchlist);
  const chosen = snapshot.protocols.filter((p) => isRankable(p));
  // The watchlist is the floor: every slug on it is ranked even if the rule above ever missed
  // one (it cannot on this snapshot, but coverage is the gate's row and is never gambled).
  const index = bySlug(snapshot.protocols);
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined && !chosen.includes(p)) chosen.push(p);
  }
  const bands = bootstrapBands(snapshot, chosen, model);
  const scored = chosen.map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, curve, offsets);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => {
    const band = bands.get(s.p.slug) ?? { low: s.implied, high: s.implied, rankLow: i + 1, rankHigh: i + 1 };
    const econ = farmEconomics(s.p, s.age, s.implied);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      on_watchlist: watchlist.has(s.p.slug),
      age_days: s.age,
      implied_value_usd: s.implied,
      value_range_usd: { low_usd: band.low, high_usd: band.high, band_ratio: Math.round((band.high / band.low) * 100) / 100 },
      model: {
        category_factor: round4(s.categoryFactor),
        growth_pct: s.growthPct,
        growth_multiplier: round4(s.growthMult),
        maturity_multiplier: round4(s.maturityMult),
        chain_multiplier: round4(s.chainMult),
        age_days: s.age,
      },
      economics: econ,
      rank_low: band.rankLow,
      rank_high: band.rankHigh,
      farm_steps: farmSteps(s.p, s.age, s.implied).map(stepText),
    };
  });
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} as a lender and keep the position open.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} in a tight range and keep the position open.`;
  if (c.includes('yield') || c.includes('farm')) return `Deposit $${capital} of USDC into ${name}'s highest-yield vault on ${chain} and keep the shares.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged trade.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name} on ${chain}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('vault')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('chain') || c.includes('payments')) return `Move $${capital} onto ${name} and use it for one real payment or transfer each week.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The weekly qualifying action that keeps a farm alive, by category. */
function weeklyActionFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp')) return 'a small borrow and repay, or a fresh supply top-up';
  if (c.includes('dex') || c.includes('yield') || c.includes('farm')) return 'a swap through the pool, or a deposit and a harvest';
  if (c.includes('curator') || c.includes('allocator')) return 'a deposit into a different vault, or a rebalance';
  if (c.includes('perpetual') || c.includes('derivative')) return 'one small trade, opened and closed the same week';
  if (c.includes('prediction')) return 'one small market position';
  if (c.includes('rwa')) return 'a mint or a transfer of the yield asset';
  if (c.includes('chain') || c.includes('payments')) return 'one real payment or transfer';
  return 'a deposit, a borrow, a swap or a vote';
}

/** The position the economics are netted at: $1,000 deposited. The slice scales with the deposit; the fees do not, which is the whole point of netting it. */
export const FARM_CAPITAL_USD = 1000;
/** The share of a launch assumed to go to depositors, pro rata by deposit. */
export const AIRDROP_SHARE = 0.1;
/** The yield forgone by locking the $1,000 in the farm instead of a T-bill, per year. */
export const FORGONE_YIELD = 0.04;

/**
 * What a $1,000 position in this protocol nets, in dollars. The slice is the protocol's
 * implied value times the depositors' 10%, times the position's share of TVL. The fees are
 * the plan's own gas: setup, $2 a week for the hold, and $3 to exit. The forgone yield is
 * 4% a year on the $1,000 for the hold. FARM means the slice pays the fees and the yield;
 * THIN means it beats the fees only; SKIP means the fees alone eat it. The assumptions are
 * stated, not hidden: change the share or the yield and the verdicts move, which is why the
 * dashboard states both beside every verdict.
 */
export function farmEconomics(p: SnapshotProtocol, age: number | null, implied: number): FarmEconomics {
  const hold = holdDaysFor(age);
  const weeks = Math.ceil(hold / 7);
  const months = Math.ceil(hold / 30);
  const setupGas = capitalFor(p) >= 150 ? 8 : 4;
  const fees = setupGas + 2 * weeks + 3;
  const slice = AIRDROP_SHARE * implied * (FARM_CAPITAL_USD / Math.max(1, p.tvl_usd));
  const forgone = FARM_CAPITAL_USD * FORGONE_YIELD * (hold / 365);
  const net = slice - fees - forgone;
  const hours = 0.25 + weeks * (10 / 60) + months * (10 / 60) + 5 / 60;
  const verdict = net > 0 ? 'FARM' : slice > fees ? 'THIN' : 'SKIP';
  const round2 = (n: number): number => Math.round(n * 100) / 100;
  return {
    capital_usd: FARM_CAPITAL_USD,
    slice_usd: round2(slice),
    fees_usd: fees,
    forgone_usd: round2(forgone),
    net_usd: round2(net),
    hold_days: hold,
    weeks,
    hours: round2(hours),
    net_per_hour_usd: round2(net / hours),
    verdict,
  };
}

/**
 * A protocol's farm plan: eight steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names. It farms the protocol as it is today; if the protocol issues a token later, the same
 * position is the one an airdrop would read — and no step ever pays to claim anything. The
 * eighth step nets the plan at a $1,000 position, so the verdict is a number, not a slogan.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, implied?: number): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const weekly = weeklyActionFor(p);
  const steps: FarmStep[] = [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Do one qualifying action each week — ${weekly} — so the wallet shows repeat use, not a single deposit.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Each month, open the protocol's own points or rewards page from its official site and check the position is counted.`,
      cost: 'no fee to check',
      time: '10 minutes a month',
    },
    {
      text: `Never pay to claim, never connect the wallet to a link from a chat or a search ad, and verify every contract address on the protocol's own docs first.`,
      cost: 'nothing; a paid claim is a scam',
      time: '5 minutes a check',
    },
    {
      text: `Write the wallet, the dates and every transaction hash in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
  if (implied !== undefined) {
    const econ = farmEconomics(p, age, implied);
    const sign = econ.net_usd >= 0 ? '+' : '-';
    steps.push({
      text: `Net the plan at a $1,000 position: a $${econ.slice_usd.toFixed(2)} slice of the launch if 10% goes to depositors, minus $${econ.fees_usd} of gas and $${econ.forgone_usd.toFixed(2)} of forgone 4% yield, nets ${sign}$${Math.abs(econ.net_usd).toFixed(2)} — verdict ${econ.verdict}.`,
      cost: `$${econ.fees_usd} of gas over ${econ.hold_days} days`,
      time: `about ${econ.hours.toFixed(1)} hours of hands-on work`,
    });
  }
  return steps;
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    on_watchlist: row.on_watchlist,
    implied_value_usd: row.implied_value_usd,
    value_low_usd: row.value_range_usd.low_usd,
    value_high_usd: row.value_range_usd.high_usd,
    value_band_ratio: row.value_range_usd.band_ratio,
    value_band_label: bandLabel(row.value_range_usd.band_ratio),
    category_factor: row.model.category_factor,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    verdict: row.economics.verdict,
    slice_usd: row.economics.slice_usd,
    fees_usd: row.economics.fees_usd,
    net_usd: row.economics.net_usd,
    net_per_hour_usd: row.economics.net_per_hour_usd,
    rank_low: row.rank_low,
    rank_high: row.rank_high,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const comps = liveComps(snapshot);
  const curve = fitSizeCurve(comps);
  const offsets = categoryOffsets(comps, curve, model);
  const backtest = backtestCurve(snapshot);
  const live = liveRows(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const early = board.filter((r) => !watchlist.has(r.slug)).length;
  const boardTotal = board.reduce((n, r) => n + r.implied_value_usd, 0);
  const watchlistTotal = board.filter((r) => watchlist.has(r.slug)).reduce((n, r) => n + r.implied_value_usd, 0);
  const top10Total = board.slice(0, 10).reduce((n, r) => n + r.implied_value_usd, 0);
  const wideBand = board.filter((r) => r.value_range_usd.high_usd >= 2 * r.value_range_usd.low_usd).length;
  const veryWideBand = board.filter((r) => r.value_range_usd.band_ratio >= 4).length;
  const verdictCounts = {
    farm: board.filter((r) => r.economics.verdict === 'FARM').length,
    thin: board.filter((r) => r.economics.verdict === 'THIN').length,
    skip: board.filter((r) => r.economics.verdict === 'SKIP').length,
  };
  const bestPerHour = board
    .filter((r) => watchlist.has(r.slug))
    .sort((a, b) => b.economics.net_per_hour_usd - a.economics.net_per_hour_usd)
    .slice(0, 3)
    .map((r) => ({ slug: r.slug, name: r.name, net_usd: r.economics.net_usd, net_per_hour_usd: r.economics.net_per_hour_usd }));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    board_implied_total_usd: boardTotal,
    watchlist_implied_total_usd: watchlistTotal,
    top10_implied_total_usd: top10Total,
    wide_band_rows: wideBand,
    very_wide_band_rows: veryWideBand,
    curve,
    offsets,
    backtest,
    verdict_counts: verdictCounts,
    best_per_hour: bestPerHour,
    comps: comps.map((p) => ({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd! })),
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
