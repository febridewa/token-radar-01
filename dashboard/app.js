// Token Radar's dashboard, radar-3. It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a filterable table, a per-protocol detail drawer with the model's
// own inputs and the protocol's farm plan, the live-token set aside, and the offsets table
// with a model sandbox. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watchlistOnly: false, wideOnly: false, verdict: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, sandbox: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtMoney(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2);
  }
  function fmtSigned(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n >= 0 ? '+' : '-') + '$' + Math.abs(n).toFixed(2);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) { return (Math.round(n * 100) / 100).toFixed(2) + 'x'; }

  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same
  // arithmetic. The sandbox overrides the three weights; with no override it is the shipped model.
  // The base is the size curve at the row's TVL, shifted by its category's offset.
  function impliedOf(row, sb) {
    var m = DATA.model;
    var c = DATA.curve;
    var gw = sb ? sb.growth_weight : m.growth_weight;
    var mr = sb ? sb.maturity_range : m.maturity_range;
    var cs = sb ? sb.chain_step : m.chain_step;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * gw;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * mr;
    var chains = row.chains ? row.chains.length : 0;
    var chainMult = 1 + cs * Math.min(Math.max(chains - 1, 0), m.chain_cap);
    var base = Math.pow(10, c.intercept + c.slope * Math.log10(row.tvl_usd)) * (row.category_factor || 1);
    return Math.max(1, Math.round(base * growthMult * maturity * chainMult));
  }
  function shownValue(row) { return state.sandbox ? impliedOf(row, state.sandbox) : row.implied_value_usd; }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and
  // age decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' as a lender and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' in a tight range and keep the position open.';
    if (c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s highest-yield vault on " + chain + ' and keep the shares.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged trade.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + ' on ' + chain + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('vault') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the vault shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield-bearing asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('chain') >= 0 || c.indexOf('payments') >= 0) return 'Move $' + capital + ' onto ' + name + ' and use it for one real payment or transfer each week.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyActionFor(p) {
    var c = (p.category || '').toLowerCase();
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0) return 'a small borrow and repay, or a fresh supply top-up';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0) return 'a swap through the pool, or a deposit and a harvest';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'a deposit into a different vault, or a rebalance';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'one small trade, opened and closed the same week';
    if (c.indexOf('prediction') >= 0) return 'one small market position';
    if (c.indexOf('rwa') >= 0) return 'a mint or a transfer of the yield asset';
    if (c.indexOf('chain') >= 0 || c.indexOf('payments') >= 0) return 'one real payment or transfer';
    return 'a deposit, a borrow, a swap or a vote';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  // The same netting main.ts writes to board.json: a $1,000 position's slice of the launch
  // (10% to depositors, pro rata), minus the plan's own gas and the 4% a year forgone on the
  // $1,000 for the hold. FARM pays the fees and the yield; THIN beats the fees only.
  function farmEconomics(p) {
    var hold = holdDaysFor(p.age_days);
    var weeks = Math.ceil(hold / 7);
    var months = Math.ceil(hold / 30);
    var setupGas = capitalFor(p) >= 150 ? 8 : 4;
    var fees = setupGas + 2 * weeks + 3;
    var slice = 0.10 * p.implied_value_usd * (1000 / Math.max(1, p.tvl_usd));
    var forgone = 1000 * 0.04 * (hold / 365);
    var net = slice - fees - forgone;
    var hours = 0.25 + weeks * (10 / 60) + months * (10 / 60) + 5 / 60;
    return { slice: Math.round(slice * 100) / 100, fees: fees, forgone: Math.round(forgone * 100) / 100, net: Math.round(net * 100) / 100, hold: hold, weeks: weeks, hours: Math.round(hours * 100) / 100, perHour: Math.round((net / hours) * 100) / 100, verdict: net > 0 ? 'FARM' : slice > fees ? 'THIN' : 'SKIP' };
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var steps = [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Do one qualifying action each week — ' + weeklyActionFor(p) + ' — so the wallet shows repeat use, not a single deposit.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Each month, open the protocol's own points or rewards page from its official site and check the position is counted.", cost: 'no fee to check', time: '10 minutes a month' },
      { text: 'Never pay to claim, never connect the wallet to a link from a chat or a search ad, and verify every contract address on the protocol\'s own docs first.', cost: 'nothing; a paid claim is a scam', time: '5 minutes a check' },
      { text: 'Write the wallet, the dates and every transaction hash in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ];
    var econ = farmEconomics(p);
    steps.push({
      text: 'Net the plan at a $1,000 position: a $' + econ.slice.toFixed(2) + ' slice of the launch if 10% goes to depositors, minus $' + econ.fees + ' of gas and $' + econ.forgone.toFixed(2) + ' of forgone 4% yield, nets ' + (econ.net >= 0 ? '+' : '-') + '$' + Math.abs(econ.net).toFixed(2) + ' — verdict ' + econ.verdict + '.',
      cost: '$' + econ.fees + ' of gas over ' + econ.hold + ' days',
      time: 'about ' + econ.hours.toFixed(1) + ' hours of hands-on work'
    });
    return steps.map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('wide')) state.wideOnly = params.get('wide') === '1';
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('wl')) state.watchlistOnly = params.get('wl') === '1';
    if (params.get('v')) state.verdict = params.get('v');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchlistOnly) params.set('wl', '1');
    if (state.verdict !== 'all') params.set('v', state.verdict);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    if (state.wideOnly) params.set('wide', '1');
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (state.watchlistOnly && !r.on_watchlist) return false;
      if (state.wideOnly && r.value_band_ratio < 2) return false;
      if (state.verdict !== 'all' && r.verdict !== state.verdict) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'range') { av = a.value_band_ratio; bv = b.value_band_ratio; }
      else if (key === 'slice') { av = a.slice_usd; bv = b.slice_usd; }
      else if (key === 'net') { av = a.net_usd; bv = b.net_usd; }
      else { av = shownValue(a); bv = shownValue(b); }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  function offsetFor(category) {
    var list = DATA.offsets || [];
    for (var i = 0; i < list.length; i++) if (list[i].category === category) return list[i];
    return null;
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    var top10Share = Math.round((DATA.top10_implied_total_usd / DATA.board_implied_total_usd) * 100);
    var wlShare = Math.round((DATA.watchlist_implied_total_usd / DATA.board_implied_total_usd) * 100);
    var vc = DATA.verdict_counts || { farm: 0, thin: 0, skip: 0 };
    var best = (DATA.best_per_hour && DATA.best_per_hour[0]) || null;
    var bt = DATA.backtest ? DATA.backtest.loo : null;
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: '198 launch candidates, ranked by implied value' }),
        el('p', { text: 'Every protocol in the snapshot that records no token and is not a wrapped, staked or bridged product of one that trades. The watchlist (40 protocols, $50M+ TVL) is the floor; the early radar adds ' + DATA.early_size + ' more below it. Implied value is a model, not a promise — and "records no token" is not "has no token".' }),
        el('p', { class: 'sub', text: 'Top 10 hold ' + top10Share + '% of the board\u2019s ' + fmtUsd(DATA.board_implied_total_usd) + ' implied value; the watchlist holds ' + wlShare + '%. At a $1,000 position ' + vc.farm + ' plans pay after fees and yield (FARM), ' + vc.thin + ' beat their fees only (THIN), ' + vc.skip + ' are eaten by them (SKIP).' }),
        el('p', { class: 'sub', text: (bt ? 'Tested blind, each live token left out in turn, the curve misses the real cap by x' + bt.curve_miss + ' against x' + bt.flat_miss + ' for one flat multiple. ' : '') + (best ? 'Best hands-on hour on the watchlist: ' + best.name + ' nets ' + fmtSigned(best.net_per_hour_usd) + ' an hour.' : '') })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Launch candidates scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Board implied value' }), el('b', { text: fmtUsd(DATA.board_implied_total_usd) })),
        el('div', { class: 'fact' }, el('span', { text: 'Size curve, log10(mcap) on log10(TVL)' }), el('b', { text: DATA.curve.intercept + ' + ' + DATA.curve.slope + 'x (' + DATA.curve.comps + ' live comps)' })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Very wide bands (4x or more)' }), el('b', { text: String(DATA.very_wide_band_rows) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    var verdictSel = el('select', { id: 'verdict', 'aria-label': 'Filter by farm verdict' },
      el('option', { value: 'all', text: 'All verdicts' }),
      ['FARM', 'THIN', 'SKIP'].map(function (v) { return el('option', { value: v, text: v + ' only', selected: v === state.verdict ? 'selected' : null }); })
    );
    verdictSel.addEventListener('change', function () { state.verdict = verdictSel.value; writeHash(); render(); });
    var wl = el('label', { class: 'check' },
      el('input', { type: 'checkbox', checked: state.watchlistOnly ? 'checked' : null, 'aria-label': 'Watchlist only' }),
      'Watchlist only'
    );
    wl.querySelector('input').addEventListener('change', function (e) { state.watchlistOnly = e.target.checked; writeHash(); render(); });
    var wide = el('label', { class: 'check' },
      el('input', { type: 'checkbox', checked: state.wideOnly ? 'checked' : null, 'aria-label': 'Wide bands only' }),
      'Wide bands only'
    );
    wide.querySelector('input').addEventListener('change', function (e) { state.wideOnly = e.target.checked; writeHash(); render(); });
    function tabBtn(tab, label) {
      return el('button', { type: 'button', 'aria-pressed': state.tab === tab ? 'true' : 'false', text: label, onclick: function () { state.tab = tab; writeHash(); render(); } });
    }
    var countText = state.tab === 'pre-token' ? rows().length + ' rows shown' : state.tab === 'live' ? DATA.live.length + ' live-token protocols' : DATA.offsets.length + ' category offsets';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('label', { for: 'verdict', text: 'Verdict' }), verdictSel),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Scope' }), wl, wide),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'View' }), el('div', { class: 'tabs' }, tabBtn('pre-token', 'Pre-token'), tabBtn('live', 'Live token'), tabBtn('model', 'Model'))),
      el('span', { class: 'count', text: countText })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlistOnly = false; state.wideOnly = false; state.verdict = 'all'; writeHash(); render(); } })
      ));
    }
    var max = 1;
    list.forEach(function (r) { max = Math.max(max, shownValue(r)); });
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var sub = (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + (r.chains && r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '');
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: sub }),
          r.on_watchlist ? el('span', { class: 'badge', text: 'Watchlist' }) : null
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((shownValue(r) / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(shownValue(r)) })
        )),
        el('td', { class: 'num band-' + r.value_band_label.replace(' ', '-'), text: fmtUsd(r.value_low_usd) + ' – ' + fmtUsd(r.value_high_usd) + ' · ' + r.value_band_label }),
        el('td', { class: 'num', text: fmtMoney(r.slice_usd) }),
        el('td', null, el('div', { class: 'net' },
          el('span', { class: 'num ' + (r.net_usd >= 0 ? 'pos' : 'neg'), text: fmtSigned(r.net_usd) }),
          el('span', { class: 'verdict verdict-' + r.verdict.toLowerCase(), text: r.verdict })
        ))
      );
      tbody.appendChild(tr);
    });
    var note = state.sandbox ? 'Sandbox values: the model weights below change every row live; board.json keeps the shipped model.' : 'Pre-token protocols, strongest implied value first. $1K slice is what $1,000 deposited would take if 10% of the launch goes to depositors pro rata; Net is the slice minus the plan\u2019s gas and the 4% a year forgone on the $1,000. Select a row for its model, its farm economics and its farm plan.';
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: note }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'No token for'),
            sortHeader('implied', 'Implied value'),
            sortHeader('range', 'Range'),
            sortHeader('slice', '$1K slice'),
            sortHeader('net', 'Net of all costs')
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      var ratio = r.tvl_usd > 0 && r.mcap_usd !== null ? r.mcap_usd / r.tvl_usd : null;
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: ratio === null ? 'n/a' : fmtMult(ratio) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. Their market caps against TVL are the size curve the pre-token values are read off — and the blind test that says the curve earns its keep. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Mcap / TVL' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  // The curve, drawn: every live-token comp as a grey dot (market cap against TVL, log-log),
  // every board row as an amber dot (implied value against TVL), the fitted curve dashed and
  // the blind 80% band dotted. Built as an SVG string: the page's element helper makes HTML
  // elements, and SVG children need their own namespace.
  function scatterPlot() {
    var comps = DATA.comps || [];
    var rows = DATA.rows || [];
    var curve = DATA.curve;
    var halfDex = DATA.backtest ? Math.log10(DATA.backtest.loo_p80_miss) : 0.5;
    var xs = comps.map(function (c) { return Math.log10(c.tvl_usd); }).concat(rows.map(function (r) { return Math.log10(r.tvl_usd); }));
    var ys = comps.map(function (c) { return Math.log10(c.mcap_usd); }).concat(rows.map(function (r) { return Math.log10(r.implied_value_usd); }));
    var x0 = Math.floor(Math.min.apply(null, xs)) - 0.2;
    var x1 = Math.ceil(Math.max.apply(null, xs)) + 0.2;
    var y0 = Math.floor(Math.min.apply(null, ys)) - 0.2;
    var y1 = Math.ceil(Math.max.apply(null, ys)) + 0.2;
    var W = 640, H = 300, L = 46, B = 30, T = 12, R = 10;
    function px(x) { return L + ((x - x0) / (x1 - x0)) * (W - L - R); }
    function py(y) { return T + (1 - (y - y0) / (y1 - y0)) * (H - T - B); }
    function money10(e) { return e >= 9 ? '$' + Math.pow(10, e - 9) + 'B' : e >= 6 ? '$' + Math.pow(10, e - 6) + 'M' : '$' + Math.pow(10, e - 3) + 'K'; }
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Log-log scatter of traded tokens against the fitted size curve">';
    var e;
    for (e = Math.ceil(x0); e <= Math.floor(x1); e++) {
      s += '<line x1="' + px(e).toFixed(1) + '" y1="' + py(y0).toFixed(1) + '" x2="' + px(e).toFixed(1) + '" y2="' + py(y1).toFixed(1) + '" stroke="#e3e0d8" stroke-width="1"/>';
      s += '<text x="' + px(e).toFixed(1) + '" y="' + (H - 10) + '" font-size="10" fill="#5b6b7d" text-anchor="middle">' + money10(e) + '</text>';
    }
    for (e = Math.ceil(y0); e <= Math.floor(y1); e++) {
      s += '<line x1="' + px(x0).toFixed(1) + '" y1="' + py(e).toFixed(1) + '" x2="' + px(x1).toFixed(1) + '" y2="' + py(e).toFixed(1) + '" stroke="#e3e0d8" stroke-width="1"/>';
      s += '<text x="40" y="' + (py(e) + 3).toFixed(1) + '" font-size="10" fill="#5b6b7d" text-anchor="end">' + money10(e) + '</text>';
    }
    function lineAt(off, dash, color) {
      return '<line x1="' + px(x0).toFixed(1) + '" y1="' + py(curve.intercept + curve.slope * x0 + off).toFixed(1) + '" x2="' + px(x1).toFixed(1) + '" y2="' + py(curve.intercept + curve.slope * x1 + off).toFixed(1) + '" stroke="' + color + '" stroke-width="1.5" stroke-dasharray="' + dash + '"/>';
    }
    s += lineAt(halfDex, '2 4', '#b9b3a6') + lineAt(-halfDex, '2 4', '#b9b3a6') + lineAt(0, '6 4', '#101c2e');
    comps.forEach(function (c) {
      s += '<circle cx="' + px(Math.log10(c.tvl_usd)).toFixed(1) + '" cy="' + py(Math.log10(c.mcap_usd)).toFixed(1) + '" r="2.6" fill="#8a94a3"/>';
    });
    rows.forEach(function (r) {
      s += '<circle cx="' + px(Math.log10(r.tvl_usd)).toFixed(1) + '" cy="' + py(Math.log10(r.implied_value_usd)).toFixed(1) + '" r="2.6" fill="#b96f00"/>';
    });
    s += '<text x="' + L + '" y="' + (H - 10) + '" font-size="10" fill="#5b6b7d">TVL (log scale)</text>';
    s += '</svg>';
    return el('div', { class: 'scatter' },
      el('div', { html: s }),
      el('p', { class: 'sub', text: 'Grey: the ' + comps.length + ' traded tokens, market cap against TVL. Amber: the board at its implied value. Dashed: the fitted curve, log10(mcap) = ' + curve.intercept + ' + ' + curve.slope + ' x log10(TVL). Dotted: the blind 80% band, x' + (DATA.backtest ? DATA.backtest.loo_p80_miss : '?') + ' either way — the curve is a slope, not a price.' })
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var curve = DATA.curve;
    var bt = DATA.backtest;
    var offRows = (DATA.offsets || []).map(function (o) {
      return el('tr', null,
        el('td', null, el('b', { text: o.category })),
        el('td', { class: 'num', text: String(o.comps) }),
        el('td', { class: 'num', text: (o.offset_log10 > 0 ? '+' : '') + o.offset_log10.toFixed(2) + ' dex' }),
        el('td', { class: 'num', text: fmtMult(o.factor) })
      );
    });
    function slider(label, key, min, max, step, value, fmt) {
      var out = el('output', { text: fmt(value) });
      var input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value), 'aria-label': label });
      input.addEventListener('input', function () {
        if (!state.sandbox) state.sandbox = { growth_weight: m.growth_weight, maturity_range: m.maturity_range, chain_step: m.chain_step };
        state.sandbox[key] = parseFloat(input.value);
        out.textContent = fmt(state.sandbox[key]);
        render();
      });
      return el('div', { class: 'slider' }, el('label', { text: label }), input, out);
    }
    var sb = state.sandbox || { growth_weight: m.growth_weight, maturity_range: m.maturity_range, chain_step: m.chain_step };
    var reset = el('button', { class: 'button', type: 'button', text: 'Reset to shipped model', onclick: function () { state.sandbox = null; render(); } });
    return el('div', null,
      el('section', { class: 'panel model' },
        el('h2', { text: 'How implied value is computed' }),
        el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
        el('div', { class: 'formula' },
          'implied = round( 10 ^ (' + curve.intercept + ' + ' + curve.slope + ' x log10(tvl_usd)) x category_factor x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + ' + m.chain_step + ' x min(chains - 1, ' + m.chain_cap + ')) )'
        ),
        el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. The size curve is least squares on log10(market cap) against log10(TVL) over the ' + curve.comps + ' live-token protocols in this snapshot (table below), and each category gets an offset from it — the shrunk median of its live comps\u2019 residuals — so a category that trades rich for its size lifts its rows and one that trades cheap lowers them. The early radar is every pre-token protocol below the watchlist floor that passes the house rule, and the live-token protocols are set aside with their market caps shown.' }),
        el('p', { class: 'sub', text: 'The plausible range on every row is its own 10th to 90th percentile across 100 bootstrap refits of the curve — the live comps resampled, the curve and the offsets refitted, the row re-scored — so a wide range is a warning that the rank leans on the calibration. Sort the board by Range to find the rows whose headline depends on it most. The detail view also shows the row\u2019s rank range across those refits.' }),
        el('p', { class: 'sub', text: 'Labels on the board say how far each band stretches: ' + DATA.wide_band_rows + ' rows are wide (2x or more) and ' + DATA.very_wide_band_rows + ' of those are very wide (4x or more), where the headline is mostly calibration.' })
      ),
      el('section', { class: 'panel model' },
        el('h2', { text: 'Tested blind, against one flat multiple' }),
        el('p', { class: 'sub', text: 'The curve is fitted without the answers, then scored on them — twice. Leave-one-out holds each live token out in turn and refits the curve without it. The time split fits only the protocols listed before 2024 and tests the ones listed since, so the test is genuinely newer launches. The flat baseline is one global median mcap / TVL for every protocol. Miss is the median factor between the prediction and the real market cap; within 3x and 10x are the shares that close.' }),
        el('div', { class: 'table-wrap' },
          el('table', null,
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Blind test' }), el('th', { scope: 'col', text: 'Tested' }), el('th', { scope: 'col', text: 'Curve miss' }), el('th', { scope: 'col', text: 'Flat miss' }), el('th', { scope: 'col', text: 'Within 3x, curve / flat' }), el('th', { scope: 'col', text: 'Within 10x, curve / flat' }))),
            el('tbody', null,
              el('tr', null,
                el('td', null, el('b', { text: 'Leave-one-out' })),
                el('td', { class: 'num', text: String(bt.loo.test_n) }),
                el('td', { class: 'num', text: 'x' + bt.loo.curve_miss }),
                el('td', { class: 'num', text: 'x' + bt.loo.flat_miss }),
                el('td', { class: 'num', text: bt.loo.curve_within3 + '% / ' + bt.loo.flat_within3 + '%' }),
                el('td', { class: 'num', text: bt.loo.curve_within10 + '% / ' + bt.loo.flat_within10 + '%' })
              ),
              el('tr', null,
                el('td', null, el('b', { text: 'Time split, fit pre-2024' })),
                el('td', { class: 'num', text: String(bt.time_split.test_n) + ' tested, ' + bt.time_split.train_n + ' fitted' }),
                el('td', { class: 'num', text: 'x' + bt.time_split.curve_miss }),
                el('td', { class: 'num', text: 'x' + bt.time_split.flat_miss }),
                el('td', { class: 'num', text: bt.time_split.curve_within3 + '% / ' + bt.time_split.flat_within3 + '%' }),
                el('td', { class: 'num', text: bt.time_split.curve_within10 + '% / ' + bt.time_split.flat_within10 + '%' })
              )
            )
          )
        ),
        el('p', { class: 'sub', text: 'The leave-one-out 80th-percentile miss is x' + bt.loo_p80_miss + ' — four of five blind predictions land inside that factor. The curve beats the flat multiple on every number in both tests, which is why the board is priced off the curve and not off a median.' })
      ),
      el('section', { class: 'panel model' },
        el('h2', { text: 'Traded tokens and the curve' }),
        scatterPlot()
      ),
      el('section', { class: 'panel model' },
        el('h2', { text: 'Model sandbox — change the weights, watch the board move' }),
        el('p', { class: 'sub', text: 'The sliders recompute every row in this page from the same formula. board.json keeps the shipped weights; the sandbox is for checking how much the ranking depends on them.' }),
        el('div', { class: 'sliders' },
          slider('Growth weight', 'growth_weight', 0, 1, 0.05, sb.growth_weight, function (v) { return v.toFixed(2); }),
          slider('Maturity range', 'maturity_range', 0, 0.6, 0.05, sb.maturity_range, function (v) { return v.toFixed(2); }),
          slider('Chain step', 'chain_step', 0, 0.05, 0.005, sb.chain_step, function (v) { return v.toFixed(3); })
        ),
        state.sandbox ? reset : el('p', { class: 'sub', text: 'Sliders are at the shipped weights.' })
      ),
      el('section', { class: 'panel model' },
        el('h2', { text: 'Category offsets from the curve' }),
        el('p', { class: 'sub', text: 'Each category\u2019s offset is the shrunk median of its live comps\u2019 log10 residuals from the size curve, weight n / (n + 4), so a category with one live comp barely moves off the curve. A factor above 1 says the category\u2019s tokens trade rich for their size; below 1 says they trade cheap. What the table says: Prediction Market and Privacy trade rich, Liquid Staking and Onchain Capital Allocator trade cheap — so the giant allocators rank far below their TVL rank.' }),
        el('div', { class: 'table-wrap' },
          el('table', null,
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Live comps' }), el('th', { scope: 'col', text: 'Offset' }), el('th', { scope: 'col', text: 'Factor' }))),
            el('tbody', null, offRows)
          )
        )
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var off = offsetFor(row.category || 'Other');
    var recomputed = impliedOf(row, null);
    var econ = farmEconomics(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.on_watchlist ? ' · on the watchlist' : ' · early radar (not on the watchlist)') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Size curve at this TVL' }), el('b', { class: 'num', text: fmtUsd(Math.pow(10, DATA.curve.intercept + DATA.curve.slope * Math.log10(row.tvl_usd))) })),
        el('div', null, el('span', { text: 'Category factor (' + (row.category || 'Other') + ')' }), el('b', { class: 'num', text: fmtMult(row.category_factor) + (off ? ' · ' + off.comps + ' live comps' : ' · no live comps') })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Chain multiplier (' + (row.chains ? row.chains.length : 0) + ' chains)' }), el('b', { class: 'num', text: String(row.chain_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })),
        el('div', { class: 'band' }, el('span', { text: 'Plausible range' }), el('b', { class: 'num', text: fmtUsd(row.value_low_usd) + ' – ' + fmtUsd(row.value_high_usd) })),
        el('div', { class: 'band' }, el('span', { text: 'Band width' }), el('b', { class: 'num', text: row.value_band_label + ' at ' + row.value_band_ratio + 'x' })),
        el('div', { class: 'band' }, el('span', { text: 'Rank across 100 refits' }), el('b', { class: 'num', text: '#' + row.rank_low + ' – #' + row.rank_high }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price. The protocol records no token in this snapshot — that is not proof it has none. The plausible range is the row\u2019s 10th to 90th percentile across 100 bootstrap refits of the curve: a narrow range means the rank stands on the protocol, a wide one means it leans on the calibration.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm economics — a $1,000 position, netted' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'Slice of the launch (10% to depositors, pro rata)' }), el('b', { class: 'num', text: fmtMoney(econ.slice) })),
        el('div', null, el('span', { text: 'Gas: setup, weekly, exit over ' + econ.hold + ' days' }), el('b', { class: 'num', text: fmtMoney(econ.fees) })),
        el('div', null, el('span', { text: 'Yield forgone at 4% a year' }), el('b', { class: 'num', text: fmtMoney(econ.forgone) })),
        el('div', null, el('span', { text: 'Net of all costs' }), el('b', { class: 'num ' + (econ.net >= 0 ? 'pos' : 'neg'), text: fmtSigned(econ.net) })),
        el('div', null, el('span', { text: 'Net per hands-on hour (' + econ.hours.toFixed(1) + ' hours)' }), el('b', { class: 'num ' + (econ.perHour >= 0 ? 'pos' : 'neg'), text: fmtSigned(econ.perHour) })),
        el('div', { class: 'band' }, el('span', { text: 'Verdict' }), el('b', { class: 'num', text: econ.verdict }))
      ),
      el('p', { class: 'sub', text: 'FARM means the slice pays the gas and the forgone yield; THIN means it beats the gas only; SKIP means the gas alone eats it. The slice scales with the deposit and the gas does not, so a bigger position nets better and a smaller one worse — the $1,000 is the yardstick, stated, not hidden.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    if (state.tab === 'pre-token') shell.appendChild(boardTable());
    else if (state.tab === 'live') shell.appendChild(liveTable());
    else shell.appendChild(modelPanel());
    if (state.tab === 'pre-token') shell.appendChild(el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'implied = 10 ^ (' + DATA.curve.intercept + ' + ' + DATA.curve.slope + ' x log10(TVL)) x category factor x growth x maturity x chain reach. The curve is fitted on the ' + DATA.curve.comps + ' live-token protocols in this snapshot and tested blind against one flat multiple — leave-one-out miss x' + DATA.backtest.loo.curve_miss + ' against x' + DATA.backtest.loo.flat_miss + '. No protocol name is special-cased. Open the Model tab for the full formula, the blind test, the curve chart, the sandbox and every category offset.' })
    ));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
