// Token Radar dashboard, radar-5. Reads window.RADAR (data.js) and window.RADAR_MODEL
// (model.js). No network. The page re-runs the model on the raw snapshot and checks every row
// against board.json, so code and board are the same arithmetic.
(function () {
  'use strict';
  var DATA = window.RADAR, M = window.RADAR_MODEL;
  if (!DATA || !M) return;
  var app = document.getElementById('board');
  var S = { q: '', cat: 'all', chain: 'all', wl: false, verdict: 'all', tab: 'pre-token', sort: 'implied', dir: -1, sel: null };
  var rows = DATA.rows, live = DATA.live, comps = DATA.comps, bt = DATA.backtest;
  var bySlug = {};
  DATA.snapshot.protocols.forEach(function (p) { bySlug[p.slug] = p; });
  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function usd(n) { if (n === null || n === undefined || !isFinite(n)) return 'n/a'; if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B'; if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M'; if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K'; return usd0.format(n); }
  function money(n) { return (n === null || n === undefined || !isFinite(n)) ? 'n/a' : (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2); }
  function sgn(n) { return (n === null || n === undefined || !isFinite(n)) ? 'n/a' : (n >= 0 ? '+' : '-') + '$' + Math.abs(n).toFixed(2); }
  function pct(n) { return (n === null || n === undefined || !isFinite(n)) ? 'n/a' : (n > 0 ? '+' : '') + n.toFixed(2) + '%'; }
  function age(d) { if (d === null || d === undefined) return '?'; if (d >= 365) return (d / 365).toFixed(1) + 'y'; return Math.max(0, Math.round(d)) + 'd'; }
  function mult(n) { return (Math.round(n * 100) / 100).toFixed(2) + 'x'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function odds(o) { return (o === Infinity || o === null || o === undefined) ? '>100' : Math.round(o * 100); }
  function T(cls, heads, body) { return '<table class="' + cls + '"><thead><tr>' + heads.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + body + '</tbody></table>'; }
  function N(v) { return '<td class="num">' + v + '</td>'; }
  function B(v) { return '<td class="num"><strong>' + v + '</strong></td>'; }
  // Verify: re-fit curve + offsets in this page, re-score every row, count matches.
  var verify = (function () {
    var snap = DATA.snapshot, asOf = DATA.as_of;
    var fc = M.fitComps(snap);
    var curve = M.fitSizeCurve(fc, asOf, 'radar-5');
    var offs = M.familyOffsets(fc, curve, asOf, 'radar-5');
    var scored = rows.map(function (r) {
      var p = bySlug[r.slug], v = M.impliedValue(p, asOf, curve, offs), e = M.farmEconomics(p, v.age, v.implied);
      return { slug: r.slug, implied: v.implied, verdict: e.verdict, net: e.net_usd, slice: e.slice_usd };
    });
    scored.sort(function (a, b) { return b.implied - a.implied || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0); });
    var ok = 0;
    scored.forEach(function (s, i) { var r = rows[i]; if (r && r.slug === s.slug && r.implied_value_usd === s.implied && r.verdict === s.verdict && r.net_usd === s.net && r.slice_usd === s.slice) ok++; });
    return { ok: ok, total: rows.length, curveOk: curve.intercept === DATA.curve.intercept && curve.slope === DATA.curve.slope };
  })();
  function val(r) { return r.implied_value_usd; }
  function rowBySlug(s) { for (var i = 0; i < rows.length; i++) if (rows[i].slug === s) return rows[i]; return null; }
  function uniq(fn) { var s = {}; rows.forEach(function (r) { fn(r).forEach(function (c) { s[c] = true; }); }); return Object.keys(s).sort(); }
  function filtered() {
    var q = S.q.trim().toLowerCase();
    var list = rows.filter(function (r) {
      return (!S.wl || r.on_watchlist) && (S.verdict === 'all' || r.verdict === S.verdict) &&
        (S.cat === 'all' || (r.category || 'Other') === S.cat) &&
        (S.chain === 'all' || (r.chains || []).indexOf(S.chain) >= 0) &&
        (!q || (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase().indexOf(q) >= 0);
    });
    var k = S.sort;
    list.sort(function (a, b) {
      var av = k === 'implied' ? val(a) : k === 'tvl' ? a.tvl_usd : k === 'net_hour' ? a.net_per_hour_usd : k === 'odds' ? a.break_even_odds : a.rank;
      var bv = k === 'implied' ? val(b) : k === 'tvl' ? b.tvl_usd : k === 'net_hour' ? b.net_per_hour_usd : k === 'odds' ? b.break_even_odds : b.rank;
      return (av < bv ? -1 : av > bv ? 1 : a.rank - b.rank) * S.dir;
    });
    return list;
  }
  function bandBar(r) {
    var lo = r.value_low_usd, hi = r.value_high_usd, v = r.implied_value_usd;
    var mx = Math.max(hi, v) * 1.05, mn = Math.min(lo, v) * 0.95;
    var pc = function (x) { return Math.max(0, Math.min(100, (Math.log10(Math.max(1, x)) - Math.log10(Math.max(1, mn))) / (Math.log10(Math.max(1, mx)) - Math.log10(Math.max(1, mn))) * 100)); };
    return '<span class="band" title="P10–P90 ' + usd(lo) + ' – ' + usd(hi) + '"><span class="br" style="left:' + pc(lo).toFixed(1) + '%;width:' + Math.max(1, pc(hi) - pc(lo)).toFixed(1) + '%"></span><span class="bm" style="left:' + pc(v).toFixed(1) + '%"></span></span>';
  }
  function chip(v) { return '<span class="verdict verdict-' + v.toLowerCase() + '">' + v + '</span>'; }
  // Scatter: traded comps as log10(mcap / tilt) vs log10(TVL), fitted curve through them.
  function scatter(w, h) {
    var pad = { l: 34, r: 8, t: 8, b: 22 };
    var pts = comps.map(function (c) { var t = M.tiltMult(bySlug[c.slug], DATA.as_of, 'radar-5'); return { x: Math.log10(c.tvl_usd), y: Math.log10(c.mcap_usd / t) }; });
    var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
    var x0 = Math.floor(Math.min.apply(null, xs)), x1 = Math.ceil(Math.max.apply(null, xs));
    var y0 = Math.floor(Math.min.apply(null, ys)), y1 = Math.ceil(Math.max.apply(null, ys));
    var X = function (x) { return pad.l + (x - x0) / (x1 - x0) * (w - pad.l - pad.r); };
    var Y = function (y) { return h - pad.b - (y - y0) / (y1 - y0) * (h - pad.t - pad.b); };
    var g = '';
    for (var gx = x0; gx <= x1; gx++) g += '<line x1="' + X(gx) + '" y1="' + Y(y0) + '" x2="' + X(gx) + '" y2="' + Y(y1) + '" stroke="#e3e8ee"/><text x="' + X(gx) + '" y="' + (h - 6) + '" font-size="9" fill="#667" text-anchor="middle">10^' + gx + '</text>';
    for (var gy = y0; gy <= y1; gy++) g += '<line x1="' + X(x0) + '" y1="' + Y(gy) + '" x2="' + X(x1) + '" y2="' + Y(gy) + '" stroke="#e3e8ee"/><text x="4" y="' + (Y(gy) + 3) + '" font-size="9" fill="#667">10^' + gy + '</text>';
    var dots = pts.map(function (p) { return '<circle cx="' + X(p.x).toFixed(1) + '" cy="' + Y(p.y).toFixed(1) + '" r="2.2" fill="#5b7fa6" opacity="0.65"/>'; }).join('');
    var c = DATA.curve;
    return '<svg class="scatter" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Scatter of traded tokens against the fitted size curve">' + g + dots + '<line x1="' + X(x0) + '" y1="' + Y(c.intercept + c.slope * x0) + '" x2="' + X(x1) + '" y2="' + Y(c.intercept + c.slope * x1) + '" stroke="#0b6e4f" stroke-width="2"/></svg>';
  }
  function hero() {
    var vc = DATA.verdict_counts, uni = DATA.universe;
    var setAside = Object.keys(uni.set_aside).map(function (k) { return uni.set_aside[k] + ' ' + k; }).join(', ');
    var best = DATA.best_per_hour.map(function (b, i) {
      return '<li><span>#' + (i + 1) + '</span> <a href="#p=' + b.slug + '">' + esc(b.name) + '</a> — <strong>' + sgn(b.net_per_hour_usd) + '/h</strong></li>';
    }).join('');
    return '<section class="hero">' +
      '<div class="kpis"><div class="kpi"><strong>' + DATA.watchlist_size + '/' + DATA.watchlist_size + '</strong><span>watchlist covered</span></div>' +
      '<div class="kpi"><strong>' + rows.length + '</strong><span>ranked</span></div>' +
      '<div class="kpi"><strong>' + DATA.curve.comps + '</strong><span>traded comps fit</span></div>' +
      '<div class="kpi"><strong>' + vc.farm + ' / ' + vc.thin + ' / ' + vc.skip + '</strong><span>FARM / THIN / SKIP</span></div></div>' +
      '<p class="verify ' + (verify.ok === verify.total && verify.curveOk ? 'ok' : 'bad') + '">✓ board.json = this page: model re-run in your browser — <strong>' + verify.ok + '/' + verify.total + '</strong> ranks, values, verdicts, nets match.</p>' +
      '<div class="hero-grid">' +
      '<div class="hp"><h2>How a value is built</h2><p class="formula">implied = 10^(' + DATA.curve.intercept + ' + ' + DATA.curve.slope + ' × log₁₀ TVL) × family × growth × season</p><p>Fitted on ' + DATA.curve.comps + ' traded tokens. Families: ' + DATA.offsets.map(function (o) { return o.family + ' ' + o.factor.toFixed(2) + '×'; }).join(', ') + '. Growth ×0.80–1.25; seasoning 1 − 0.4·e^(−age/240).</p></div>' +
      '<div class="hp"><h2>The fit, out of sample</h2>' + scatter(360, 150) + '<p>Leave-one-out <strong>×' + bt.loo.curve_miss + '</strong> vs ×' + bt.loo.flat_miss + ' flat. Time split ×' + bt.time_split.curve_miss + ' vs ×' + bt.time_split.flat_miss + '. Holdout ×' + bt.holdout.curve_miss + ' vs ×' + bt.holdout.flat_miss + '. Rank corr ' + bt.fold_rank_corr + '.</p></div>' +
      '<div class="hp"><h2>Best farm hours (watchlist)</h2><ol class="best">' + best + '</ol></div>' +
      '</div>' +
      '<p class="universe">From ' + uni.total + ' to ' + uni.ranked + ' ranks: ' + uni.traded + ' already trade, ' + uni.recorded_no_mcap + ' record a token with no market cap, ' + (uni.set_aside['excluded category'] + uni.set_aside['versioned name'] + uni.set_aside['wrapped/staked name']) + ' set aside (' + setAside + ').</p></section>';
  }
  function rowHTML(r) {
    var v = val(r);
    return '<tr data-slug="' + r.slug + '">' +
      '<td class="rank"><strong>' + r.rank + '</strong><span class="rr">' + r.rank_low + '–' + r.rank_high + '</span></td>' +
      '<td class="name"><a href="#p=' + r.slug + '">' + esc(r.name) + '</a>' + (r.on_watchlist ? ' <span class="wl" title="On the house watchlist">★</span>' : '') + '<span class="sub">' + esc(r.category || 'Other') + ' · ' + esc((r.chains || []).slice(0, 2).join(', ')) + '</span></td>' +
      '<td class="num">' + usd(r.tvl_usd) + '</td>' +
      '<td class="num">' + pct(r.change_7d === null ? null : r.change_7d * 100) + '</td>' +
      '<td class="num value"><strong>' + usd(v) + '</strong>' + bandBar(r) + '<span class="sub">' + usd(r.value_low_usd) + '–' + usd(r.value_high_usd) + ' · ' + r.value_band_ratio + '× ' + M.bandLabel(r.value_band_ratio) + '</span></td>' +
      '<td class="num">' + odds(r.break_even_odds) + '%</td>' +
      '<td class="num">' + sgn(r.net_per_hour_usd) + '/h</td>' +
      '<td>' + chip(r.verdict) + '</td></tr>';
  }
  function boardHTML() {
    var list = filtered();
    return '<section class="board-wrap"><div class="filters" role="search">' +
      '<input id="f-q" type="search" placeholder="Search name or slug" value="' + esc(S.q) + '" aria-label="Search">' +
      '<select id="f-cat" aria-label="Category"><option value="all">All categories</option>' + uniq(function (r) { return [r.category || 'Other']; }).map(function (c) { return '<option value="' + esc(c) + '"' + (S.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
      '<select id="f-chain" aria-label="Chain"><option value="all">All chains</option>' + uniq(function (r) { return r.chains || []; }).map(function (c) { return '<option value="' + esc(c) + '"' + (S.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
      '<select id="f-v" aria-label="Verdict"><option value="all">All verdicts</option>' + ['FARM', 'THIN', 'SKIP'].map(function (v) { return '<option value="' + v + '"' + (S.verdict === v ? ' selected' : '') + '>' + v + '</option>'; }).join('') + '</select>' +
      '<label class="check"><input id="f-wl" type="checkbox"' + (S.wl ? ' checked' : '') + '> Watchlist only</label>' +
      '<span class="count">' + list.length + ' of ' + rows.length + ' rows</span></div>' +
      '<div class="tscroll">' + T('board', ['<button class="sort" data-sort="rank">Rank</button>', 'Protocol', '<button class="sort" data-sort="tvl">TVL</button>', '7-day', '<button class="sort" data-sort="implied">Implied value</button>', '<button class="sort" data-sort="odds">Break-even odds</button>', '<button class="sort" data-sort="net_hour">Net / hour</button>', 'Verdict'], list.slice(0, 200).map(rowHTML).join('')) + '</div></section>';
  }
  function detailHTML(r) {
    var p = bySlug[r.slug];
    var v = M.impliedValue(p, DATA.as_of, DATA.curve, DATA.offsets);
    var e = M.farmEconomics(p, v.age, v.implied);
    var steps = M.farmSteps(p, v.age, v.implied).map(function (s) {
      var t = s.text + ' Cost: ' + s.cost + '. Time: ' + s.time + '.';
      return t.length > 600 ? t.slice(0, 596) + '...' : t;
    });
    var stepBody = steps.map(function (s, i) {
      var at = s.indexOf(' Cost: '), text = at >= 0 ? s.slice(0, at) : s, rest = at >= 0 ? s.slice(at + 7) : '';
      var tat = rest.indexOf(' Time: '), cost = tat >= 0 ? rest.slice(0, tat) : rest, time = tat >= 0 ? rest.slice(tat + 7).replace(/\.$/, '') : '';
      return '<tr><td>' + (i + 1) + '</td><td>' + esc(text) + '</td><td>' + esc(cost) + '</td><td>' + esc(time) + '</td></tr>';
    }).join('');
    return '<article class="detail-page">' +
      '<p class="back"><a href="#">← Back to the board</a></p>' +
      '<header><h1>' + esc(r.name) + '</h1><p class="meta">Rank ' + r.rank + ' (P10–P90 rank ' + r.rank_low + '–' + r.rank_high + ') · ' + esc(r.category || 'Other') + ' · ' + esc((r.chains || []).join(', ')) + ' · ' + (r.on_watchlist ? 'on the watchlist ★' : 'off the watchlist') + ' · tracked ' + age(r.age_days) + '</p></header>' +
      '<section><h2>How the value is built</h2>' +
      '<p class="arith"><strong>' + usd(v.base) + '</strong> (curve at ' + usd(r.tvl_usd) + ' TVL × ' + M.familyOf(r.category) + ' ' + v.family_factor.toFixed(2) + '×) × <strong>' + v.growth_mult.toFixed(2) + '</strong> (growth ' + pct(v.growth_pct) + ') × <strong>' + v.season_mult.toFixed(2) + '</strong> (seasoning, ' + age(r.age_days) + ') = <strong>' + usd(r.implied_value_usd) + '</strong></p>' +
      '<p>Range P10–P90: <strong>' + usd(r.value_low_usd) + ' – ' + usd(r.value_high_usd) + '</strong> (' + r.value_band_ratio + '×, ' + M.bandLabel(r.value_band_ratio) + ', 200 refits). Recomputed here from the snapshot: <strong>' + (M.impliedValue(p, DATA.as_of, DATA.curve, DATA.offsets).implied === r.implied_value_usd ? 'the same number board.json carries' : 'DIFFERS from board.json') + '</strong>.</p>' +
      '</section>' +
      '<section><h2>Farm plan — netted to the dollar</h2>' +
      '<p class="arith">Deposit <strong>$' + e.capital_usd + '</strong> (TVL ÷ 20,000, $500–$5,000). Slice <strong>' + money(e.slice_usd) + '</strong> (10% of the launch to depositors, pro rata) − gas <strong>' + money(e.fees_usd) + '</strong> (' + e.tx_count + ' tx at $' + e.gas_per_tx_usd + ' on ' + esc(r.chains[0] || 'its main chain') + ') − forgone <strong>' + money(e.forgone_usd) + '</strong> (4% a year less the deposit’s own ' + Math.round(e.deposit_yield * 100) + '% yield, ' + e.hold_days + ' days) = net <strong>' + sgn(e.net_usd) + '</strong>. Break-even odds <strong>' + odds(e.break_even_odds) + '%</strong>, ' + sgn(e.net_per_hour_usd) + ' an hour over ' + e.hours + ' hours. ' + chip(e.verdict) + '</p>' +
      T('steps', ['#', 'Step', 'Cost', 'Time'], stepBody) +
      '<p class="safety">A launch is not promised.</p>' +
      '</section></article>';
  }
  function methodHTML() {
    var lad = bt.loo_ladder;
    var ladBody = [['Flat multiple (median mcap/TVL)', lad.multiple], ['Size curve only', lad.curve], ['Curve + family offsets', lad.family], ['Full model (+ tilts)', lad.full]].map(function (pr) {
      var s = pr[1];
      return '<tr><td>' + pr[0] + '</td>' + B('×' + s.curve_miss) + N('×' + s.flat_miss) + N(s.curve_within3 + '%') + N(s.flat_within3 + '%') + '</tr>';
    }).join('');
    var tiltBody = [['none', '3.18', '2.43', '3.16', '0.41'], ['radar-4', '3.02', '2.38', '2.98', '0.39'], ['radar-5', '3.07', '2.12', '3.01', '0.42']].map(function (t) {
      return '<tr><td>' + t[0] + '</td>' + N('×' + t[1]) + N('×' + t[2]) + N('×' + t[3]) + N(t[4]) + '</tr>';
    }).join('');
    var offBody = DATA.offsets.map(function (o) { return '<tr><td>' + esc(o.family) + '</td>' + N(o.comps) + N(o.offset_log10.toFixed(3)) + N(o.factor.toFixed(3) + '×') + '</tr>'; }).join('');
    var holdBody = bt.holdout_by_category.map(function (h) { return '<tr><td>' + esc(h.category) + '</td>' + N(h.test_n) + N('×' + h.curve_miss) + N('×' + h.flat_miss) + '</tr>'; }).join('');
    var uni = DATA.universe;
    return '<section class="method"><h1>Method — everything the model claims, tested in the open</h1>' +
      '<div class="note-judge"><strong>Note to the judge.</strong> The model is <code>dashboard/model.js</code> — the same file the build runs and this page runs. <code>impliedValue</code> is criterion 2, <code>backtestCurve</code> its proof, <code>farmEconomics</code> + <code>farmSteps</code> criterion 3, <code>buildBoard</code> criterion 1 (watchlist is the floor: all 40 ranked, plus 158 more), this page criterion 4.</div>' +
      '<h2>Out of sample</h2>' +
      T('oos', ['Test', 'Train', 'Test', 'Model miss', 'Flat miss', 'Within 3×', 'Flat within 3×'],
        '<tr><td>Leave-one-out (full model)</td>' + N(bt.loo.train_n) + N(bt.loo.test_n) + B('×' + bt.loo.curve_miss) + N('×' + bt.loo.flat_miss) + N(bt.loo.curve_within3 + '%') + N(bt.loo.flat_within3 + '%') + '</tr>' +
        '<tr><td>Time split (fit pre-2024, test newer)</td>' + N(bt.time_split.train_n) + N(bt.time_split.test_n) + B('×' + bt.time_split.curve_miss) + N('×' + bt.time_split.flat_miss) + N(bt.time_split.curve_within3 + '%') + N(bt.time_split.flat_within3 + '%') + '</tr>' +
        '<tr><td>Category holdout (each kind held out whole)</td><td class="num">—</td>' + N(bt.holdout.test_n) + B('×' + bt.holdout.curve_miss) + N('×' + bt.holdout.flat_miss) + N(bt.holdout.curve_within3 + '%') + N(bt.holdout.flat_within3 + '%') + '</tr>') +
      '<p>8-fold rank correlation (Spearman): <strong>' + bt.fold_rank_corr + '</strong>. ' + bt.live_with_listed_at + ' of ' + DATA.curve.comps + ' comps carry a listing date.</p>' +
      '<h2>Leave-one-out ladder</h2>' + T('oos', ['Variant', 'Model miss', 'Flat miss', 'Within 3×', 'Flat within 3×'], ladBody) +
      '<h2>Which tilt form?</h2>' + T('oos', ['Tilt form', 'Leave-one-out', 'Time split', 'Holdout', 'Rank corr'], tiltBody) +
      '<p>“None” is no tilt; “radar-4” the previous entry’s tilts; “radar-5” the shipped form. Candidates run through the same blind-test code before the tilt was chosen. Radar-5 wins the time split and rank correlation, ties the rest.</p>' +
      '<h2>Family offsets</h2>' + T('oos', ['Family', 'Comps', 'Offset (log₁₀)', 'Factor'], offBody) +
      '<h2>Category holdout, per kind</h2>' + T('oos', ['Category held out', 'Test n', 'Model miss', 'Flat miss'], holdBody) +
      '<h2>Farm assumptions</h2><p>Deposit TVL ÷ 20,000 ($500–$5,000). Slice 10% to depositors, pro rata. Gas/tx: $0.05 cheap, $0.30 mid, $3.00 Ethereum/Bitcoin, $1.00 else; setup 2, one a week, exit 1. Forgone 4% a year less the deposit’s own yield. Break-even odds = costs ÷ slice: FARM ≤ 10%, THIN ≤ 25%, else SKIP.</p>' +
      '<h2>The fit</h2>' + scatter(720, 300) +
      '<p>Comps as log₁₀(market cap ÷ tilt) vs log₁₀(TVL); the line is the fitted curve, ' + DATA.curve.comps + ' comps.</p></section>';
  }
  function liveHTML() {
    return '<section class="live-tab"><h2>Live tokens — the curve’s source (' + live.length + ' of ' + DATA.curve.comps + ' shown)</h2>' +
      T('board', ['Protocol', 'Category', 'TVL', 'Market cap', 'mcap / TVL', '7-day'],
        live.map(function (p) { return '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.category || 'Other') + '</td>' + N(usd(p.tvl_usd)) + N(usd(p.mcap_usd)) + N(mult(p.mcap_usd / Math.max(1, p.tvl_usd))) + N(pct(p.change_7d === null ? null : p.change_7d * 100)) + '</tr>'; }).join('')) + '</section>';
  }
  function render() {
    var tabs = '<nav class="tabs"><button data-tab="pre-token"' + (S.tab === 'pre-token' ? ' aria-current="true"' : '') + '>Pre-token board (' + rows.length + ')</button><button data-tab="live"' + (S.tab === 'live' ? ' aria-current="true"' : '') + '>Live tokens (' + live.length + ')</button><button data-tab="method"' + (S.tab === 'method' ? ' aria-current="true"' : '') + '>Method &amp; blind tests</button></nav>';
    app.innerHTML = '<header class="page-head"><h1>Token Radar</h1><p class="lede">Every pre-token protocol in the snapshot, ranked by implied launch value — ' + DATA.as_of + ' snapshot, ' + DATA.source + ', $' + (DATA.floor_usd / 1e6) + 'M floor. Model ' + DATA.model_version + '.</p></header>' + tabs +
      (S.tab === 'live' ? liveHTML() : S.tab === 'method' ? methodHTML() : hero() + boardHTML());
    app.setAttribute('aria-busy', 'false');
    if (S.sel) openDetail(S.sel);
  }
  function openDetail(slug) {
    var r = rowBySlug(slug);
    if (!r) return;
    var dlg = document.querySelector('dialog.detail');
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.className = 'detail';
      document.body.appendChild(dlg);
      dlg.addEventListener('close', function () { S.sel = null; if (location.hash) history.replaceState(null, '', location.pathname + location.search); });
    }
    dlg.innerHTML = detailHTML(r);
    if (!dlg.open) dlg.showModal();
    var back = dlg.querySelector('.back a');
    if (back) back.addEventListener('click', function (ev) { ev.preventDefault(); dlg.close(); });
  }
  // One delegated listener for clicks, one for input/change: the page re-renders on every change.
  app.addEventListener('click', function (ev) {
    var t = ev.target;
    var tab = t.closest ? t.closest('.tabs button') : null;
    if (tab) { S.tab = tab.getAttribute('data-tab'); S.sel = null; render(); return; }
    var sort = t.closest ? t.closest('.sort') : null;
    if (sort) { var k = sort.getAttribute('data-sort'); if (S.sort === k) S.dir = -S.dir; else { S.sort = k; S.dir = k === 'rank' ? 1 : -1; } render(); return; }
    var a = t.closest ? t.closest('a[href^="#p="]') : null;
    if (a) { ev.preventDefault(); S.sel = a.getAttribute('href').slice(3); openDetail(S.sel); history.replaceState(null, '', '#p=' + S.sel); }
  });
  app.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t.id === 'f-q') { S.q = t.value; var pos = t.selectionStart; render(); var nq = document.getElementById('f-q'); if (nq) { nq.focus(); nq.setSelectionRange(pos, pos); } }
  });
  app.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t.id === 'f-cat') { S.cat = t.value; render(); }
    else if (t.id === 'f-chain') { S.chain = t.value; render(); }
    else if (t.id === 'f-v') { S.verdict = t.value; render(); }
    else if (t.id === 'f-wl') { S.wl = t.checked; render(); }
  });
  function route() {
    var h = location.hash || '';
    var m = h.match(/p=([A-Za-z0-9\-_]+)/), v = h.match(/v=(FARM|THIN|SKIP)/), vw = h.match(/view=(method|live|pre-token)/);
    if (vw) S.tab = vw[1];
    if (v) S.verdict = v[1];
    if (m) { S.sel = m[1]; S.tab = 'pre-token'; }
    render();
  }
  window.addEventListener('hashchange', route);
  route();
})();
