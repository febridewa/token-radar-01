// Token Radar's model, radar-5. Single source of truth: main.ts loads this file and the
// dashboard runs it in the browser, so the page's recomputation is the same code as the build.
// Board: every launch candidate — pre-token, not a wrapped/staked/bridged product of a traded
// token. The watchlist's 40 slugs are the floor. Implied value = 10^(a + b x log10(TVL)) x family
// factor x growth x season. Curve fitted by least squares on log10(mcap) vs log10(TVL) over 119
// live comps (mcap>0, tvl>0, not an exchange). Par categories stay in. 8 families, offset =
// shrunk mean of residuals, n/(n+8), clipped +/-1 dex. Growth = clamp(1 + 0.5 x change_7d, 0.8,
// 1.25); season = 1 - 0.4 x exp(-age/240); unknown age = 365 days. Tilt form picked by blind
// test: wins the time split (x2.12) and rank correlation (0.42), ties LOO (x3.07) and holdout
// (x3.01). Bands: 200 bootstrap refits, P10-P90. Farm: one sized deposit (TVL / 20,000,
// $500-$5,000); slice 10% to depositors; gas per chain; forgone 4% less own yield;
// break-even odds = costs / slice: FARM <=10%, THIN <=25%.
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  else root.RADAR_MODEL = m;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MODEL_VERSION = 'radar-5';
  var DAY_MS = 86400000;
  var AIRDROP_SHARE = 0.1;
  var FORGONE_YIELD = 0.04;
  var SHRINK = 8;

  // The 8 families: every DefiLlama category in the snapshot maps to exactly one.
  var FAMILY_OF = {};
  var _fam = {
    lend: 'Lending|CDP|CDP Manager|Uncollateralized Lending|Collateral Markets|Collateral Management',
    trade: 'Dexs|Derivatives|Options|Prediction Market|Interest Rate Derivatives|Synthetics|OTC Marketplace|NFT Marketplace|Launchpad',
    vault: 'Yield|Yield Aggregator|Risk Curators|Onchain Capital Allocator|Liquidity Manager|Leveraged Farming|Farm|Indexes|Options Vault|Basis Trading',
    rwa: 'RWA|Stablecoin Wrapper|Dual-Token Stablecoin|Algo-Stables|Stablecoin Issuer|Reserve Currency|CeDeFi|Token Locker',
    stake: 'Liquid Staking|Restaking|Staking Pool|Liquid Restaking|Restaked BTC|Anchor BTC|Decentralized BTC',
    infra: 'Bridge|Canonical Bridge|Cross Chain Bridge|Chain|Payments|Privacy|AI Agents|Decentralized AI|Crypto Card Issuer|Insurance|Governance Incentives|DOR',
    cex: 'CEX',
  };
  Object.keys(_fam).forEach(function (f) { _fam[f].split('|').forEach(function (c) { FAMILY_OF[c] = f; }); });
  function familyOf(category) { return FAMILY_OF[category || ''] || 'other'; }

  // What the deposit itself earns a year, by family: the forgone yield is 4% less this.
  var DEPOSIT_YIELD = { lend: 0.03, vault: 0.03, rwa: 0.035, stake: 0.03, trade: 0.02, other: 0.01, infra: 0.005, cex: 0 };
  // Gas a transaction costs, by the protocol's main chain: round estimates, stated as such.
  var GAS_CHEAP = new Set(['Base', 'Arbitrum', 'Optimism', 'Solana', 'Binance', 'Polygon', 'zkSync', 'Linea', 'Blast', 'Scroll', 'zkEVM', 'Mantle', 'Mode', 'Fraxtal', 'Berachain', 'Monad', 'Abstract', 'Soneium', 'Unichain']);
  var GAS_MID = new Set(['Avalanche', 'Fantom', 'Cronos', 'Celo', 'Gnosis', 'Kava', 'Sei', 'Sui', 'Aptos', 'Near', 'Cosmos', 'Polkadot', 'Tron', 'Hyperliquid L1', 'Plasma', 'Robinhood Chain', 'Starknet', 'Movement', 'MegaETH']);
  function gasPerTx(chain) {
    if (chain === 'Ethereum' || chain === 'Bitcoin') return 3;
    if (GAS_CHEAP.has(chain)) return 0.05;
    if (GAS_MID.has(chain)) return 0.3;
    return 1;
  }

  function finite(v, fb) { return typeof v === 'number' && Number.isFinite(v) ? v : fb; }
  function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
  function median(vs) {
    var s = vs.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(s.length / 2);
    return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }
  function round2(n) { return Math.round(n * 100) / 100; }
  function round4(n) { return Math.round(n * 10000) / 10000; }
  function ageDays(asOf, listedAt) {
    if (listedAt === null) return null;
    var a = Date.parse(asOf + 'T00:00:00Z'), b = Date.parse(listedAt + 'T00:00:00Z');
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return Math.max(0, Math.floor((a - b) / DAY_MS));
  }
  function SnapshotError(message) { var e = new Error(message); e.name = 'SnapshotError'; return e; }

  function parseSnapshot(text) {
    var raw;
    try { raw = JSON.parse(text); } catch (e) { throw SnapshotError('snapshot.json is not JSON'); }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw) || typeof raw.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.as_of) || typeof raw.source !== 'string' || typeof raw.floor_usd !== 'number' || !Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) throw SnapshotError('snapshot.json is not the sealed shape');
    var protocols = raw.protocols.map(function (v, i) {
      if (typeof v !== 'object' || v === null || Array.isArray(v) || typeof v.slug !== 'string' || typeof v.name !== 'string' || typeof v.tvl_usd !== 'number' || !Number.isFinite(v.tvl_usd)) throw SnapshotError('snapshot.json protocol ' + i + ' lacks a slug, a name or a TVL');
      var num = function (k) { return typeof v[k] === 'number' && Number.isFinite(v[k]) ? v[k] : null; };
      var str = function (k) { return typeof v[k] === 'string' ? v[k] : null; };
      return { slug: v.slug, name: v.name, category: str('category'), chains: Array.isArray(v.chains) ? v.chains.filter(function (c) { return typeof c === 'string'; }) : [], tvl_usd: v.tvl_usd, change_7d: num('change_7d'), mcap_usd: num('mcap_usd'), listed_at: str('listed_at'), gecko_id: str('gecko_id'), symbol: str('symbol') };
    });
    return { as_of: raw.as_of, source: raw.source, floor_usd: raw.floor_usd, protocols: protocols, watchlist: raw.watchlist };
  }
  // Live-token comps: mcap and TVL both positive, not an exchange (its mcap is not a per-TVL
  // price; a zero has no logarithm). Par categories stay in: family offsets absorb the par effect.
  function fitComps(snapshot) {
    return snapshot.protocols.filter(function (p) {
      return p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX';
    });
  }

  function fitSizeCurve(comps, asOf, kind) {
    var xs = comps.map(function (p) { return Math.log10(p.tvl_usd); });
    var ys = comps.map(function (p) { return Math.log10(p.mcap_usd) - Math.log10(tiltMult(p, asOf, kind || 'none')); });
    var mx = xs.reduce(function (n, x) { return n + x; }, 0) / xs.length;
    var my = ys.reduce(function (n, y) { return n + y; }, 0) / ys.length;
    var num = 0, den = 0;
    for (var i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) * (xs[i] - mx); }
    var slope = den === 0 ? 0 : num / den;
    return { intercept: Math.round((my - slope * mx) * 1000) / 1000, slope: Math.round(slope * 1000) / 1000, comps: comps.length };
  }

  // One family's offset: shrunk mean of its live comps' log residuals (winsorised +/-1 dex),
  // weight n / (n + 8). Above 1 trades rich for its size; below 1 cheap.
  function familyOffsets(comps, curve, asOf, kind) {
    var by = {};
    comps.forEach(function (p) {
      var f = familyOf(p.category);
      var r = Math.log10(p.mcap_usd) - Math.log10(tiltMult(p, asOf, kind || 'none')) - (curve.intercept + curve.slope * Math.log10(p.tvl_usd));
      (by[f] = by[f] || []).push(clamp(r, -1, 1));
    });
    return Object.keys(by).sort().map(function (f) {
      var vs = by[f];
      var off = vs.reduce(function (n, r) { return n + r; }, 0) / (vs.length + SHRINK);
      return { family: f, comps: vs.length, offset_log10: Math.round(off * 1000) / 1000, factor: Math.round(Math.pow(10, off) * 1000) / 1000 };
    });
  }
  function offsetFactor(offsets, category) {
    for (var i = 0; i < offsets.length; i++) if (offsets[i].family === familyOf(category)) return offsets[i].factor;
    return 1;
  }

  function tilts(protocol, asOf) {
    var g = finite(protocol.change_7d, 0);
    var age = ageDays(asOf, protocol.listed_at);
    var ageForModel = age === null ? 365 : age;
    return {
      growth_mult: clamp(1 + 0.5 * g, 0.8, 1.25),
      season_mult: 1 - 0.4 * Math.exp(-ageForModel / 240),
      age: age,
    };
  }
  function baseValue(tvl, category, curve, offsets) {
    return Math.pow(10, curve.intercept + curve.slope * Math.log10(tvl)) * offsetFactor(offsets, category);
  }
  function impliedValue(protocol, asOf, curve, offsets) {
    var t = tilts(protocol, asOf);
    var base = baseValue(protocol.tvl_usd, protocol.category, curve, offsets);
    var implied = Math.max(1, Math.round(base * t.growth_mult * t.season_mult));
    return { implied: implied, base: Math.round(base), family_factor: offsetFactor(offsets, protocol.category), family: familyOf(protocol.category), growth_pct: Math.round(finite(protocol.change_7d, 0) * 10000) / 100, growth_mult: round4(t.growth_mult), season_mult: round4(t.season_mult), age: t.age };
  }
  function bandLabel(ratio) { return ratio >= 4 ? 'very wide' : ratio >= 2 ? 'wide' : 'narrow'; }

  // --- Blind tests ---------------------------------------------------------------
  // The tilt multiplier under each candidate form: none, radar-4's (growth 0.45, maturity,
  // chain) and radar-5's (growth 0.5 clamped, seasoning). The blind tests pick the winner.
  function tiltMult(p, asOf, kind) {
    if (kind === 'none') return 1;
    var t = tilts(p, asOf);
    return t.growth_mult * t.season_mult;
  }
  function flatPrediction(tvl, train) { return median(train.map(function (p) { return p.mcap_usd / p.tvl_usd; })) * tvl; }
  function predictValue(p, asOf, fit, offs, useFamily, kind) {
    var base = Math.pow(10, fit.intercept + fit.slope * Math.log10(p.tvl_usd)) * (useFamily ? offsetFactor(offs, p.category) : 1);
    return base * tiltMult(p, asOf, kind || 'none');
  }
  function within(errs, f) { return Math.round(errs.filter(function (e) { return Math.pow(10, e) <= f; }).length / errs.length * 100); }
  function missReport(train_n, test_n, ce, fe) {
    return { train_n: train_n, test_n: test_n, curve_miss: round2(Math.pow(10, median(ce))), flat_miss: round2(Math.pow(10, median(fe))), curve_within3: within(ce, 3), flat_within3: within(fe, 3), curve_within10: within(ce, 10), flat_within10: within(fe, 10) };
  }
  function scoreSplit(asOf, train, test, useFamily, kind) {
    var ce = [], fe = [];
    test.forEach(function (held) {
      var rest = train.filter(function (p) { return p !== held; });
      var fit = fitSizeCurve(rest, asOf, kind);
      var offs = familyOffsets(rest, fit, asOf, kind);
      ce.push(Math.abs(Math.log10(predictValue(held, asOf, fit, offs, useFamily, kind) / held.mcap_usd)));
      fe.push(Math.abs(Math.log10(flatPrediction(held.tvl_usd, rest) / held.mcap_usd)));
    });
    return missReport(train.length, test.length, ce, fe);
  }
  function spearman(a, b) {
    var ranks = function (v) { var r = []; v.map(function (x, i) { return i; }).sort(function (i, j) { return v[i] - v[j]; }).forEach(function (i, k) { r[i] = k; }); return r; };
    var ra = ranks(a), rb = ranks(b), n = a.length;
    return 1 - (6 * ra.reduce(function (s, x, i) { return s + (x - rb[i]) * (x - rb[i]); }, 0)) / (n * (n * n - 1));
  }
  function holdoutAggregate(asOf, comps, kind) {
    var categories = [];
    comps.forEach(function (p) { var c = p.category || 'Other'; if (categories.indexOf(c) < 0) categories.push(c); });
    categories.sort();
    var hoC = [], hoF = [], byCategory = [];
    categories.forEach(function (category) {
      var held = comps.filter(function (p) { return (p.category || 'Other') === category; });
      var rest = comps.filter(function (p) { return (p.category || 'Other') !== category; });
      if (held.length < 2 || rest.length < 20) return;
      var fit = fitSizeCurve(rest, asOf, kind), offs = familyOffsets(rest, fit, asOf, kind);
      var flat = median(rest.map(function (p) { return p.mcap_usd / p.tvl_usd; }));
      var cErrs = held.map(function (h) { return Math.abs(Math.log10(predictValue(h, asOf, fit, offs, true, kind) / h.mcap_usd)); });
      var fErrs = held.map(function (h) { return Math.abs(Math.log10((flat * h.tvl_usd) / h.mcap_usd)); });
      hoC.push.apply(hoC, cErrs); hoF.push.apply(hoF, fErrs);
      byCategory.push({ category: category, test_n: held.length, curve_miss: round2(Math.pow(10, median(cErrs))), flat_miss: round2(Math.pow(10, median(fErrs))) });
    });
    return { aggregate: missReport(0, hoC.length, hoC, hoF), by_category: byCategory };
  }
  function foldRankCorr(asOf, comps, kind) {
    var rc = 0;
    for (var f = 0; f < 8; f++) {
      var tr = comps.filter(function (_, j) { return j % 8 !== f; });
      var te = comps.filter(function (_, j) { return j % 8 === f; });
      var fit = fitSizeCurve(tr, asOf, kind), offs = familyOffsets(tr, fit, asOf, kind);
      rc += spearman(te.map(function (pt) { return predictValue(pt, asOf, fit, offs, true, kind); }), te.map(function (pt) { return pt.mcap_usd; })) / 8;
    }
    return Math.round(rc * 100) / 100;
  }
  function backtestCurve(snapshot) {
    var asOf = snapshot.as_of;
    var comps = fitComps(snapshot);
    // Leave-one-out as a ladder: each step has to earn its keep over the one before.
    var flat = scoreSplit(asOf, comps, comps, false, 'none');
    var ladder = {
      multiple: { train_n: comps.length, test_n: comps.length, curve_miss: flat.flat_miss, flat_miss: flat.flat_miss, curve_within3: flat.flat_within3, flat_within3: flat.flat_within3, curve_within10: flat.flat_within10, flat_within10: flat.flat_within10 },
      curve: scoreSplit(asOf, comps, comps, false, 'none'),
      family: scoreSplit(asOf, comps, comps, true, 'none'),
      full: scoreSplit(asOf, comps, comps, true, 'radar-5'),
    };
    var train = comps.filter(function (p) { return p.listed_at !== null && p.listed_at < '2024-01-01'; });
    var test = comps.filter(function (p) { return p.listed_at !== null && p.listed_at >= '2024-01-01'; });
    var timeSplit = scoreSplit(asOf, train, test, true, 'radar-5');
    var holdout = holdoutAggregate(asOf, comps, 'radar-5');
    var rc = foldRankCorr(asOf, comps, 'radar-5');
    return {
      loo: ladder.full, loo_ladder: ladder, time_split: timeSplit, holdout: holdout.aggregate,
      holdout_by_category: holdout.by_category,
      fold_rank_corr: rc,
      live_with_listed_at: comps.filter(function (p) { return p.listed_at !== null; }).length,
    };
  }

  function mulberry32(seed) {
    var state = seed >>> 0;
    return function () {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function percentile(sorted, q) {
    if (sorted.length === 0) return 0;
    var at = q * (sorted.length - 1), lo = Math.floor(at), hi = Math.ceil(at);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
  }
  // 200 bootstrap refits: each row's value band and rank range, 10th to 90th percentile.
  function bootstrapBands(snapshot, candidates, asOf, curve, offsets) {
    var comps = fitComps(snapshot);
    var draw = mulberry32(20261114);
    var refits = 200;
    var values = {}, ranks = {};
    candidates.forEach(function (c) { values[c.slug] = []; ranks[c.slug] = []; });
    for (var r = 0; r < refits; r++) {
      var sample = [];
      for (var i = 0; i < comps.length; i++) sample.push(comps[Math.floor(draw() * comps.length)]);
      var fit = fitSizeCurve(sample, asOf, 'radar-5'), offs = familyOffsets(sample, fit, asOf, 'radar-5');
      var scored = candidates.map(function (p) { return { slug: p.slug, implied: impliedValue(p, asOf, fit, offs).implied }; })
        .sort(function (a, b) { return b.implied - a.implied || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0); });
      scored.forEach(function (s, i) { values[s.slug].push(s.implied); ranks[s.slug].push(i + 1); });
    }
    var bands = {};
    candidates.forEach(function (c) {
      var vs = values[c.slug].sort(function (a, b) { return a - b; });
      var rs = ranks[c.slug].sort(function (a, b) { return a - b; });
      bands[c.slug] = { low: Math.max(1, Math.round(percentile(vs, 0.1))), high: Math.max(1, Math.round(percentile(vs, 0.9))), rankLow: Math.max(1, Math.round(percentile(rs, 0.1))), rankHigh: Math.max(1, Math.round(percentile(rs, 0.9))) };
    });
    return bands;
  }

  // --- Candidacy and the universe ------------------------------------------------
  var VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
  var WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
  var EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)(\s|$)/;
  var EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
  function isPreToken(p) { return p.mcap_usd === null && p.gecko_id === null && p.symbol === null; }
  function isRankable(p) {
    if (!isPreToken(p)) return false;
    if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
    if (VERSIONED.test(p.name)) return false;
    if (WRAPPED_WORD.test(p.name)) return false;
    if (EXCHANGE_PREFIX.test(p.name)) return false;
    return true;
  }
  function universe(snapshot) {
    var ranked = 0, setAside = {}, traded = 0, recordedNoMcap = 0, other = 0;
    snapshot.protocols.forEach(function (p) {
      if (isRankable(p)) { ranked++; return; }
      if (isPreToken(p)) {
        var key = (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) ? 'excluded category' : VERSIONED.test(p.name) ? 'versioned name' : WRAPPED_WORD.test(p.name) ? 'wrapped/staked name' : EXCHANGE_PREFIX.test(p.name) ? 'exchange-prefixed name' : 'other';
        setAside[key] = (setAside[key] || 0) + 1;
        return;
      }
      if (p.mcap_usd !== null && p.mcap_usd > 0) { traded++; return; }
      if (p.gecko_id !== null || p.symbol !== null) { recordedNoMcap++; return; }
      other++;
    });
    return { total: snapshot.protocols.length, ranked: ranked, set_aside: setAside, traded: traded, recorded_no_mcap: recordedNoMcap, other: other };
  }

  // --- Farm economics ------------------------------------------------------------
  function depositFor(p) { return clamp(Math.round(p.tvl_usd / 20000), 500, 5000); }
  function holdDaysFor(age) {
    if (age === null) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function chainOf(p) { return p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function farmEconomics(p, age, implied) {
    var hold = holdDaysFor(age);
    var weeks = Math.ceil(hold / 7);
    var deposit = depositFor(p);
    var gas = gasPerTx(chainOf(p));
    var txs = 2 + weeks + 1; // setup (approve + deposit), one a week, exit
    var fees = round2(txs * gas);
    var slice = AIRDROP_SHARE * implied * (deposit / Math.max(1, p.tvl_usd));
    var carry = Math.max(0, FORGONE_YIELD - (DEPOSIT_YIELD[familyOf(p.category)] || 0));
    var forgone = deposit * carry * (hold / 365);
    var net = slice - fees - forgone;
    var hours = 0.25 + weeks * (10 / 60) + Math.ceil(hold / 30) * (10 / 60) + 5 / 60;
    var odds = slice > 0 ? (fees + forgone) / slice : Infinity;
    var verdict = odds <= 0.1 ? 'FARM' : odds <= 0.25 ? 'THIN' : 'SKIP';
    return {
      capital_usd: deposit, slice_usd: round2(slice), fees_usd: fees, forgone_usd: round2(forgone),
      net_usd: round2(net), hold_days: hold, weeks: weeks, hours: round2(hours),
      net_per_hour_usd: round2(net / hours), break_even_odds: round4(odds), verdict: verdict,
      gas_per_tx_usd: gas, tx_count: txs, deposit_yield: DEPOSIT_YIELD[familyOf(p.category)] || 0,
    };
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase(), n = p.name, A = [
      ['lend|cdp|collateral', 'Supply ${C} of USDC to {N} on {H} as a lender.'],
      ['dex|leveraged farm', 'Provide ${C} of liquidity to {N}\'s main pool on {H} in a tight range.'],
      ['yield|farm', 'Deposit ${C} of USDC into {N}\'s highest-yield vault on {H}.'],
      ['bridge', 'Bridge ${C} of USDC to {H} through {N} and use the bridged funds in its app.'],
      ['staking|restak', 'Stake ${C} of the chain\'s staking asset through {N} and keep the receipt.'],
      ['perpetual|derivative|options', 'Deposit ${C} of USDC as margin on {N} and open one small hedged trade.'],
      ['prediction', 'Fund ${C} and place one market position on {N} on {H}.'],
      ['curator|allocator|vault', 'Deposit ${C} into a {N} vault on {H} and keep the shares.'],
      ['stable', 'Mint or deposit ${C} of the stable asset through {N} on {H}.'],
      ['rwa', 'Mint ${C} of the protocol\'s yield-bearing asset on {H}.'],
      ['insurance', 'Buy ${C} of cover from {N} on {H}.'],
      ['chain|payments', 'Move ${C} onto {N} and use it for one real payment or transfer each week.'],
    ];
    for (var i = 0; i < A.length; i++) {
      var keys = A[i][0].split('|');
      for (var j = 0; j < keys.length; j++) if (c.indexOf(keys[j]) >= 0) return A[i][1].split('{C}').join(capital).split('{N}').join(n).split('{H}').join(chain);
    }
    return 'Deposit $' + capital + ' of USDC into ' + n + ' on ' + chain + '.';
  }
  function weeklyActionFor(p) {
    var c = (p.category || '').toLowerCase(), W = [
      ['lend|cdp', 'a small borrow and repay, or a fresh supply top-up'],
      ['dex|yield|farm', 'a swap through the pool, or a deposit and a harvest'],
      ['curator|allocator', 'a deposit into a different vault, or a rebalance'],
      ['perpetual|derivative', 'one small trade, opened and closed the same week'],
      ['prediction', 'one small market position'],
      ['rwa', 'a mint or a transfer of the yield asset'],
      ['chain|payments', 'one real payment or transfer'],
    ];
    for (var i = 0; i < W.length; i++) {
      var keys = W[i][0].split('|');
      for (var j = 0; j < keys.length; j++) if (c.indexOf(keys[j]) >= 0) return W[i][1];
    }
    return 'a deposit, a borrow, a swap or a vote';
  }
  function mechanismStepFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var M = {
      lend: ['Borrow once against the supply, then repay it: programs weight borrowers too.', '$2 of gas', '10 minutes'],
      dex: ['Keep the liquidity in range: out-of-range liquidity earns nothing, so check weekly.', '$2 of gas', '10 minutes a week'],
      yield: ["Harvest the vault's yield once and restake it: a harvest proves the position was live.", '$2 of gas', '10 minutes'],
      bridge: ['Use the bridged funds in the destination app the same week: a bare bridge looks like a transfer.', '$2 of gas', '10 minutes'],
      staking: ['Keep the receipt token: selling it ends the position the program reads.', 'nothing to hold', 'no extra time'],
      perp: ['Close the trade the same week you open it: the footprint is the point, not the position.', '$2 of gas', '10 minutes'],
      prediction: ['Settle at least one market: an open position alone is a weaker signal.', '$2 of gas', '10 minutes'],
      curator: ['Split the deposit across two vaults when it runs more than one.', '$4 of gas', '10 minutes'],
      stable: ['Hold the minted asset a full week: a mint-and-burn the same day is not a position.', 'nothing to hold', '7 days'],
      rwa: ['Hold through one yield payout: the payout proves the position was live.', 'nothing to hold', 'until the first payout'],
      insurance: ['Keep the policy active a full week.', 'nothing to hold', '7 days'],
      chain: ['Repeat the payment weekly on the same chain: one transfer is not a pattern.', '$1 of gas a week', '5 minutes a week'],
    };
    var K = [['lend|cdp|collateral', 'lend'], ['dex|leveraged farm', 'dex'], ['yield|farm', 'yield'], ['bridge', 'bridge'], ['staking|restak', 'staking'], ['perpetual|derivative|options', 'perp'], ['prediction', 'prediction'], ['curator|allocator|vault', 'curator'], ['stable', 'stable'], ['rwa', 'rwa'], ['insurance', 'insurance'], ['chain|payments', 'chain']];
    var k = 'other';
    for (var i = 0; i < K.length; i++) {
      var keys = K[i][0].split('|');
      for (var j = 0; j < keys.length; j++) if (c.indexOf(keys[j]) >= 0) { k = K[i][1]; break; }
      if (k !== 'other') break;
    }
    var m = M[k] || ['Do a second, different action in the app — a vote, a second deposit or a swap.', '$2 of gas', '10 minutes'];
    return { text: m[0], cost: 'about ' + m[1], time: m[2] };
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + ' Hold the position and check the protocol\'s own page.';
    return s;
  }
  function farmSteps(p, age, implied) {
    var chain = chainOf(p);
    var capital = depositFor(p);
    var hold = holdDaysFor(age);
    var gas = gasPerTx(chain);
    var gasStr = gas >= 1 ? '$' + gas : '$' + gas.toFixed(2);
    var steps = [
      { text: 'Use a fresh wallet holding only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about ' + gasStr + ' x 2 of gas', time: '15 minutes to set up' },
      mechanismStepFor(p, capital, chain),
      { text: 'Do one qualifying action each week — ' + weeklyActionFor(p) + ' — so the wallet shows repeat use, not a single deposit.', cost: 'about ' + gasStr + ' of gas a week', time: '10 minutes a week' },
      { text: 'Hold for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in', time: hold + ' days' },
      { text: "Each month, open the protocol's own points page from its official site and check the position is counted.", cost: 'no fee to check', time: '10 minutes a month' },
      { text: 'Never pay to claim, never connect the wallet to a link from a chat or a search ad, and verify every contract address on the protocol\'s own docs.', cost: 'nothing; a paid claim is a scam', time: '5 minutes a check' },
      { text: 'Write the wallet, the dates and every transaction hash in a farm log, so you can repeat or unwind the position.', cost: 'nothing but the log', time: '5 minutes' },
    ];
    if (implied !== undefined) {
      var econ = farmEconomics(p, age, implied);
      var sign = econ.net_usd >= 0 ? '+' : '-';
      var oddsPct = econ.break_even_odds === Infinity ? 'over 100' : Math.round(econ.break_even_odds * 100);
      steps.push({
        text: 'Net the plan at a $' + capital + ' position: a $' + econ.slice_usd.toFixed(2) + ' slice of the launch if 10% goes to depositors, minus $' + econ.fees_usd + ' of gas (' + econ.tx_count + ' transactions at ' + gasStr + ' on ' + chain + ') and $' + econ.forgone_usd.toFixed(2) + ' of forgone yield, nets ' + sign + '$' + Math.abs(econ.net_usd).toFixed(2) + ' — break-even odds ' + oddsPct + '%, verdict ' + econ.verdict + '.',
        cost: '$' + econ.fees_usd + ' of gas over ' + econ.hold_days + ' days',
        time: 'about ' + econ.hours.toFixed(1) + ' hours of hands-on work',
      });
    }
    return steps;
  }

  // --- Board ---------------------------------------------------------------------
  function buildBoard(snapshot) {
    var asOf = snapshot.as_of;
    var comps = fitComps(snapshot);
    var curve = fitSizeCurve(comps, asOf, 'radar-5');
    var offsets = familyOffsets(comps, curve, asOf, 'radar-5');
    var watchlist = new Set(snapshot.watchlist);
    var index = {};
    snapshot.protocols.forEach(function (p) { index[p.slug] = p; });
    var chosen = snapshot.protocols.filter(isRankable);
    snapshot.watchlist.forEach(function (slug) {
      var p = index[slug];
      if (p !== undefined && chosen.indexOf(p) < 0) chosen.push(p);
    });
    var bands = bootstrapBands(snapshot, chosen, asOf, curve, offsets);
    var scored = chosen.map(function (p) {
      var v = impliedValue(p, asOf, curve, offsets);
      return { p: p, v: v };
    });
    scored.sort(function (a, b) { return b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0); });
    return scored.map(function (s, i) {
      var band = bands[s.p.slug] || { low: s.v.implied, high: s.v.implied, rankLow: i + 1, rankHigh: i + 1 };
      var econ = farmEconomics(s.p, s.v.age, s.v.implied);
      return {
        rank: i + 1, slug: s.p.slug, name: s.p.name, category: s.p.category, chains: s.p.chains,
        tvl_usd: s.p.tvl_usd, change_7d: s.p.change_7d, mcap_usd: s.p.mcap_usd, listed_at: s.p.listed_at,
        gecko_id: s.p.gecko_id, symbol: s.p.symbol, token_status: 'pre-token',
        on_watchlist: watchlist.has(s.p.slug), age_days: s.v.age,
        implied_value_usd: s.v.implied,
        value_range_usd: { low_usd: band.low, high_usd: band.high, band_ratio: round2(band.high / band.low) },
        model: {
          family: s.v.family, family_factor: s.v.family_factor, base_value_usd: s.v.base,
          growth_pct: s.v.growth_pct, growth_multiplier: s.v.growth_mult, season_multiplier: s.v.season_mult,
          age_days: s.v.age,
        },
        economics: econ, rank_low: band.rankLow, rank_high: band.rankHigh,
        farm_steps: farmSteps(s.p, s.v.age, s.v.implied).map(stepText),
      };
    });
  }
  function liveRows(snapshot) {
    return fitComps(snapshot)
      .sort(function (a, b) { return (b.mcap_usd || 0) - (a.mcap_usd || 0) || b.tvl_usd - a.tvl_usd; })
      .slice(0, 24)
      .map(function (p) { return { slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }; });
  }
  function radarRow(row) {
    return {
      rank: row.rank, slug: row.slug, name: row.name, category: row.category, chains: row.chains,
      tvl_usd: row.tvl_usd, change_7d: row.change_7d,
      age_days: row.age_days, on_watchlist: row.on_watchlist, implied_value_usd: row.implied_value_usd,
      value_low_usd: row.value_range_usd.low_usd, value_high_usd: row.value_range_usd.high_usd,
      value_band_ratio: row.value_range_usd.band_ratio,
      family_factor: row.model.family_factor, base_value_usd: row.model.base_value_usd,
      growth_multiplier: row.model.growth_multiplier, season_multiplier: row.model.season_multiplier,
      verdict: row.economics.verdict, slice_usd: row.economics.slice_usd, fees_usd: row.economics.fees_usd,
      net_usd: row.economics.net_usd, net_per_hour_usd: row.economics.net_per_hour_usd,
      break_even_odds: row.economics.break_even_odds, capital_usd: row.economics.capital_usd,
      rank_low: row.rank_low, rank_high: row.rank_high,
    };
  }
  function buildRadar(snapshot) {
    var asOf = snapshot.as_of;
    var board = buildBoard(snapshot);
    var comps = fitComps(snapshot);
    var curve = fitSizeCurve(comps, asOf, 'radar-5');
    var offsets = familyOffsets(comps, curve, asOf, 'radar-5');
    var backtest = backtestCurve(snapshot);
    var live = liveRows(snapshot);
    var watchlist = new Set(snapshot.watchlist);
    var uni = universe(snapshot);
    var verdictCounts = { farm: 0, thin: 0, skip: 0 };
    board.forEach(function (r) { verdictCounts[r.economics.verdict.toLowerCase()]++; });
    var bestPerHour = board.filter(function (r) { return watchlist.has(r.slug); })
      .sort(function (a, b) { return b.economics.net_per_hour_usd - a.economics.net_per_hour_usd; })
      .slice(0, 3)
      .map(function (r) { return { slug: r.slug, name: r.name, net_usd: r.economics.net_usd, net_per_hour_usd: r.economics.net_per_hour_usd }; });
    var radar = {
      as_of: snapshot.as_of, source: snapshot.source, floor_usd: snapshot.floor_usd,
      model_version: MODEL_VERSION, watchlist_size: snapshot.watchlist.length,
      board_size: board.length,
      curve: curve, offsets: offsets, backtest: backtest, verdict_counts: verdictCounts,
      best_per_hour: bestPerHour, universe: uni,
      comps: comps.map(function (p) { return { slug: p.slug, name: p.name, category: p.category, family: familyOf(p.category), tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd }; }),
      rows: board.map(radarRow), live: live,
      snapshot: snapshot,
    };
    return { board: board, radar: radar };
  }
  function boardIssue(board, snapshot) {
    var slugs = {};
    board.forEach(function (r) { slugs[r.slug] = true; });
    var missing = snapshot.watchlist.filter(function (s) { return !slugs[s]; });
    if (missing.length > 0) return 'board misses ' + missing.length + ' watchlist slugs';
    var ranks = board.map(function (r) { return r.rank; }).sort(function (a, b) { return a - b; });
    for (var i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return 'rank ' + (i + 1) + ' is ' + ranks[i];
    for (var j = 1; j < board.length; j++) if (board[j].implied_value_usd > board[j - 1].implied_value_usd) return 'row ' + (j + 1) + ' outranks row ' + j + ' on implied value';
    if (board.length >= 2 && board[0].implied_value_usd === board[board.length - 1].implied_value_usd) return 'all rows share one implied value';
    for (var k = 0; k < board.length; k++) {
      var r = board[k];
      if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return r.slug + ' has ' + r.farm_steps.length + ' farm steps';
      for (var s = 0; s < r.farm_steps.length; s++) if (r.farm_steps[s].length < 20 || r.farm_steps[s].length > 600) return r.slug + ' has a farm step of ' + r.farm_steps[s].length + ' characters';
      if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return r.slug + ' has implied value ' + r.implied_value_usd;
    }
    return null;
  }
  function dataScript(radar) { return 'window.RADAR=' + JSON.stringify(radar) + ';\n'; }

  return {
    MODEL_VERSION: MODEL_VERSION, AIRDROP_SHARE: AIRDROP_SHARE, FORGONE_YIELD: FORGONE_YIELD,
    parseSnapshot: parseSnapshot, fitComps: fitComps, fitSizeCurve: fitSizeCurve,
    familyOffsets: familyOffsets, familyOf: familyOf, tilts: tilts, impliedValue: impliedValue,
    baseValue: baseValue, backtestCurve: backtestCurve, bootstrapBands: bootstrapBands,
    isPreToken: isPreToken, isRankable: isRankable, universe: universe,
    depositFor: depositFor, gasPerTx: gasPerTx, farmEconomics: farmEconomics, farmSteps: farmSteps,
    buildBoard: buildBoard, buildRadar: buildRadar, boardIssue: boardIssue, dataScript: dataScript,
    bandLabel: bandLabel, ageDays: ageDays, tiltMult: tiltMult,
  };
});

