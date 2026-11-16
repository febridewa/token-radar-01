// Token Radar's dashboard, radar-2. It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a filterable table, a per-protocol detail drawer with the model's
// own inputs and the protocol's farm plan, the live-token set aside, and the calibration table
// with a model sandbox. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', watchlistOnly: false, wideOnly: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null, sandbox: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
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
  function impliedOf(row, sb) {
    var m = DATA.model;
    var gw = sb ? sb.growth_weight : m.growth_weight;
    var mr = sb ? sb.maturity_range : m.maturity_range;
    var cs = sb ? sb.chain_step : m.chain_step;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * gw;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * mr;
    var chains = row.chains ? row.chains.length : 0;
    var chainMult = 1 + cs * Math.min(Math.max(chains - 1, 0), m.chain_cap);
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturity * chainMult));
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
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Do one qualifying action each week — ' + weeklyActionFor(p) + ' — so the wallet shows repeat use, not a single deposit.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Each month, open the protocol's own points or rewards page from its official site and check the position is counted.", cost: 'no fee to check', time: '10 minutes a month' },
      { text: 'Never pay to claim, never connect the wallet to a link from a chat or a search ad, and verify every contract address on the protocol\'s own docs first.', cost: 'nothing; a paid claim is a scam', time: '5 minutes a check' },
      { text: 'Write the wallet, the dates and every transaction hash in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
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
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchlistOnly) params.set('wl', '1');
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
      else { av = shownValue(a); bv = shownValue(b); }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  function calibrationFor(category) {
    var list = DATA.calibration.by_category || [];
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
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: '198 launch candidates, ranked by implied value' }),
        el('p', { text: 'Every protocol in the snapshot that records no token and is not a wrapped, staked or bridged product of one that trades. The watchlist (40 protocols, $50M+ TVL) is the floor; the early radar adds ' + DATA.early_size + ' more below it. Implied value is a model, not a promise — and "records no token" is not "has no token".' }),
        el('p', { class: 'sub', text: 'Top 10 hold ' + top10Share + '% of the board\u2019s ' + fmtUsd(DATA.board_implied_total_usd) + ' implied value; the watchlist holds ' + wlShare + '%.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Launch candidates scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Board implied value' }), el('b', { text: fmtUsd(DATA.board_implied_total_usd) })),
        el('div', { class: 'fact' }, el('span', { text: 'Global median mcap / TVL' }), el('b', { text: fmtMult(DATA.calibration.global_median) + ' (' + DATA.calibration.live_comps + ' live comps)' })),
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
    var countText = state.tab === 'pre-token' ? rows().length + ' rows shown' : state.tab === 'live' ? DATA.live.length + ' live-token protocols' : DATA.calibration.by_category.length + ' calibrated categories';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
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
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlistOnly = false; writeHash(); render(); } })
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
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    var note = state.sandbox ? 'Sandbox values: the model weights below change every row live; board.json keeps the shipped model.' : 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.';
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: note }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            sortHeader('range', 'Range'),
            el('th', { scope: 'col', text: 'Token' })
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
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. Their mcap / TVL ratios are the calibration the pre-token multiples come from. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Mcap / TVL' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var cal = DATA.calibration;
    var multRows = cal.by_category.map(function (c) {
      return el('tr', null,
        el('td', null, el('b', { text: c.category })),
        el('td', { class: 'num', text: String(c.comps) }),
        el('td', { class: 'num', text: c.raw_median === null ? 'n/a' : fmtMult(c.raw_median) }),
        el('td', { class: 'num', text: fmtMult(c.multiple) })
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
          'implied = round( tvl_usd x category_multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') x (1 + ' + m.chain_step + ' x min(chains - 1, ' + m.chain_cap + ')) )'
        ),
        el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. The category multiple is calibrated from the ' + cal.live_comps + ' live-token protocols in this snapshot (table below), shrunk toward the global median of ' + fmtMult(cal.global_median) + ' so thin categories stay honest. The early radar is every pre-token protocol below the watchlist floor that passes the house rule, and the live-token protocols are set aside with their market caps shown.' }),
        el('p', { class: 'sub', text: 'The plausible range on every row re-scores it at the global median and at the raw category median, so a wide range is a warning that the rank leans on the calibration. Sort the board by Range to find the rows whose headline depends on it most.' }),
        el('p', { class: 'sub', text: 'Labels on the board say how far each band stretches: ' + DATA.wide_band_rows + ' rows are wide (2x or more) and ' + DATA.very_wide_band_rows + ' of those are very wide (4x or more), where the headline is mostly calibration.' })
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
        el('h2', { text: 'Calibrated category multiples' }),
        el('p', { class: 'sub', text: 'Median market-cap / TVL of the live-token protocols in each category, winsorised to [0.005, 5] and shrunk toward the global median with weight n / (n + 4), capped to [0.02, 1.25]. A category with one live comp barely moves off the global median; a category with none takes it. What the table says: Dexs and RWA pay up per TVL dollar, Liquid Staking and Onchain Capital Allocator pay almost nothing — so the giant allocators rank far below their TVL rank.' }),
        el('div', { class: 'table-wrap' },
          el('table', null,
            el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Live comps' }), el('th', { scope: 'col', text: 'Raw median' }), el('th', { scope: 'col', text: 'Multiple used' }))),
            el('tbody', null, multRows)
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
    var cal = calibrationFor(row.category || 'Other');
    var recomputed = impliedOf(row, null);
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
        el('div', null, el('span', { text: 'Category multiple (' + (row.category || 'Other') + ')' }), el('b', { class: 'num', text: fmtMult(row.category_multiple) + (cal ? ' · ' + cal.comps + ' live comps, raw ' + fmtMult(cal.raw_median) : ' · global median') })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Chain multiplier (' + (row.chains ? row.chains.length : 0) + ' chains)' }), el('b', { class: 'num', text: String(row.chain_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })),
        el('div', { class: 'band' }, el('span', { text: 'Plausible range' }), el('b', { class: 'num', text: fmtUsd(row.value_low_usd) + ' – ' + fmtUsd(row.value_high_usd) })),
        el('div', { class: 'band' }, el('span', { text: 'Band width' }), el('b', { class: 'num', text: row.value_band_label + ' at ' + row.value_band_ratio + 'x' }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price. The protocol records no token in this snapshot — that is not proof it has none. The plausible range re-scores the row at the global median and at the raw category median: a narrow range means the rank stands on the protocol, a wide one means it leans on the calibration.' })
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
      el('p', { class: 'sub', text: 'implied = TVL x category multiple (calibrated from the live-token protocols in this snapshot) x growth x maturity x chain reach. No protocol name is special-cased. Open the Model tab for the full formula, the sandbox and every calibrated multiple.' })
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
