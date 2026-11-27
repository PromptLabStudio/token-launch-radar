// Token Radar's plain dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail drawer with the model's own
// inputs and the protocol's farm plan. No network: every byte it shows is in data.js.
//
// Mirror rule: impliedOf, actionFor, gasFor, stepText, capitalFor and holdDaysFor must stay the same
// derivation as lib/model.ts, line for line in effect. The page recomputes every row from the raw
// figures and the farm plan from the row's own record, and the sync checks prove it — 198 implied
// values and 1,584 farm-step strings, identical on both sides. Change one side without the other
// and the detail drawer will say the board is stale.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, sandbox: null };
  // The model the table displays: radar-2 as sealed, unless the sandbox has moved a constant. The
  // sandbox never writes to DATA.model and never touches board.json — it only changes this display.
  function currentModel() { return state.sandbox || DATA.model; }
  function impliedFor(r) { return state.sandbox ? impliedOf(r, state.sandbox) : r.implied_value_usd; }

  // Money is shown as $1.38B, $961.3M or $444.8M — two decimals for billions, one for millions — so
  // the implied-value bars and the table figures read at the same precision the screenshots show.
  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  // Percentages carry a sign and two decimals; a null growth is 'n/a', never zero — zero growth is
  // a measurement, and showing it as n/a would hide a protocol that simply did not move.
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  // The detail drawer shows the recomputation next to the board's own figure, and says so when they
  // differ — a stale data.js is visible the moment a row is opened, not hidden behind the table.
  // The scale is log-compressed: at tvl_max it equals base_multiple x tvl_max, as a flat multiple would,
  // but smaller protocols are lifted toward it so growth and age can move their rank.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var tvlMax = model.tvl_max_usd && model.tvl_max_usd > 0 ? model.tvl_max_usd : row.tvl_usd;
    return Math.max(1, Math.round(model.base_multiple * Math.pow(row.tvl_usd, model.tvl_exponent) * Math.pow(tvlMax, 1 - model.tvl_exponent) * growthMult * maturity));
  }

  // The one element helper: attrs carry class, text, html, on* handlers and plain attributes, and
  // any further arguments are children — strings become text nodes, arrays are flattened, the rest
  // are appended as nodes. Every piece of the page is built through it, so there is no innerHTML
  // template anywhere except the single explicit 'html' attr.
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

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
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
  // Chains where a transaction costs well under a dollar, so a farm plan can afford many small moves.
  var LOW_FEE_CHAINS = { Arbitrum: 1, Base: 1, Optimism: 1, zkSync: 1, Polygon: 1, Linea: 1, Scroll: 1, Blast: 1, Mantle: 1, Mode: 1, Starknet: 1, Solana: 1, Avalanche: 1, Binance: 1, Tron: 1, 'Hyperliquid L1': 1 };
  function firstLowFee(chains) {
    for (var i = 0; i < (chains || []).length; i++) if (LOW_FEE_CHAINS[chains[i]]) return chains[i];
    return null;
  }
  // The gas figures a plan states, from the protocol's own chains: mainnet-only plans cost real money.
  function gasFor(p) {
    var lowFee = firstLowFee(p.chains);
    var mainnetHeavy = p.chains && p.chains.length > 0 && p.chains[0] === 'Ethereum' && !lowFee;
    if (mainnetHeavy) return { gas: 'about $5 to $15 of gas per transaction on Ethereum mainnet', weekly: 'about $5 to $15 of gas a week', where: 'Ethereum mainnet' };
    return { gas: 'under $1 of gas per transaction on a low-fee chain', weekly: 'under $1 of gas a week', where: lowFee || chainOf(p) };
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    // Specific record types first: each of these contains a general branch's keyword, so it must be
    // matched before that branch rather than after it. The branch order mirrors lib/model.ts exactly.
    // A branch added here without its twin in lib/model.ts makes the page's plan differ from the
    // board's plan for that category, and the farm-step sync check will catch it.
    if (c.indexOf('uncollateralized lending') >= 0) return 'Lend $' + capital + ' of USDC unsecured through ' + name + ' on ' + chain + ' in one small, short-dated position.';
    if (c.indexOf('cdp manager') >= 0) return 'Open a $' + capital + ' CDP on ' + chain + ' through ' + name + ' and mint only part of the debt ceiling.';
    if (c.indexOf('collateral markets') >= 0) return 'Supply $' + capital + ' of collateral to ' + name + ' on ' + chain + ' and borrow a small amount against it.';
    if (c.indexOf('collateral management') >= 0) return 'Deposit $' + capital + ' of collateral into ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('basis trading') >= 0) return 'Deposit $' + capital + ' of USDC on ' + name + ' on ' + chain + ' and take one small basis position.';
    if (c.indexOf('synthetics') >= 0) return 'Mint $' + capital + ' of a synthetic asset on ' + name + ' on ' + chain + ' and hold it.';
    if (c.indexOf('options vault') >= 0) return 'Deposit $' + capital + ' of USDC into a ' + name + ' options vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('interest rate') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s rate market on " + chain + ' and hold one position.';
    if (c.indexOf('options') >= 0) return 'Buy $' + capital + ' of one short-dated option on ' + name + ' on ' + chain + ' and hold it to expiry.';
    if (c.indexOf('otc marketplace') >= 0) return 'Quote $' + capital + ' of USDC on ' + name + ' on ' + chain + ' and settle one small trade.';
    if (c.indexOf('nft marketplace') >= 0) return 'Buy one small NFT for about $' + capital + ' on ' + name + ' on ' + chain + ' and hold it.';
    if (c.indexOf('liquid restaking') >= 0) return 'Restake $' + capital + ' of ETH through ' + name + ' on ' + chain + ' and keep the liquid receipt.';
    if (c.indexOf('restaked btc') >= 0) return 'Deposit $' + capital + ' of BTC into ' + name + ' on ' + chain + ' and keep the restaked receipt.';
    if (c.indexOf('staking pool') >= 0) return 'Delegate $' + capital + " of the staking asset to " + name + "'s pool on " + chain + ' and keep the receipt.';
    if (c.indexOf('cross chain bridge') >= 0) return 'Bridge $' + capital + ' of USDC over ' + name + ' to ' + chain + ' and use the funds in its app.';
    if (c.indexOf('canonical bridge') >= 0) return 'Bridge $' + capital + ' of USDC through ' + name + "'s canonical route to " + chain + ' and keep the receipt.';
    if (c.indexOf('launchpad') >= 0) return 'Lock $' + capital + ' of USDC in ' + name + "'s next sale on " + chain + ' and hold the allocation.';
    if (c.indexOf('payments') >= 0) return 'Route $' + capital + ' of USDC through ' + name + ' on ' + chain + ' and keep the receipt.';
    if (c.indexOf('privacy') >= 0) return 'Move $' + capital + ' of USDC through ' + name + ' on ' + chain + ' and keep the withdrawal note.';
    if (c.indexOf('indexes') >= 0) return 'Mint $' + capital + ' of the ' + name + ' index on ' + chain + ' and hold the basket.';
    if (c.indexOf('token locker') >= 0) return "Lock $" + capital + " of the protocol's token in " + name + ' on ' + chain + ' for the shortest term it offers.';
    if (c.indexOf('stablecoin issuer') >= 0) return 'Mint $' + capital + ' of ' + name + "'s stablecoin on " + chain + ' against collateral and hold it.';
    if (c.indexOf('algo-stables') >= 0) return 'Mint $' + capital + ' of ' + name + "'s algorithmic stable on " + chain + ' and hold it.';
    if (c.indexOf('dual-token') >= 0) return 'Mint $' + capital + ' of ' + name + "'s stable leg on " + chain + ' and hold it.';
    if (c.indexOf('stablecoin wrapper') >= 0) return 'Wrap $' + capital + ' of USDC into ' + name + "'s wrapped stable on " + chain + ' and hold it.';
    if (c.indexOf('liquidity manager') >= 0) return 'Deposit $' + capital + ' of USDC into a managed ' + name + ' range on ' + chain + ' and keep the position.';
    if (c.indexOf('anchor btc') >= 0) return 'Deposit $' + capital + ' of BTC into ' + name + ' on ' + chain + ' and keep the yield receipt.';
    if (c.indexOf('decentralized btc') >= 0) return 'Mint $' + capital + ' of ' + name + "'s BTC-backed asset on " + chain + ' and hold it.';
    if (c.indexOf('cedefi') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s CeDeFi vault on " + chain + ' and keep the receipt.';
    if (c.indexOf('crypto card') >= 0) return 'Load $' + capital + ' of USDC onto ' + name + "'s card on " + chain + ' and spend it once.';
    if (c.indexOf('governance incentives') >= 0) return 'Lock $' + capital + ' of the governance token in ' + name + ' on ' + chain + ' and vote once.';
    if (c.indexOf('ai agents') >= 0 || c.indexOf('decentralized ai') >= 0) return 'Fund $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and run one agent task.';
    if (c.indexOf('reserve currency') >= 0) return 'Mint $' + capital + ' of ' + name + "'s reserve asset on " + chain + ' and hold it.';
    if (c === 'dor') return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
    if (c === 'chain') return 'Bridge $' + capital + ' of USDC onto ' + chain + ' and make one transaction in ' + name + "'s ecosystem.";
    if (c === 'farm') return "Stake $" + capital + " of USDC in " + name + "'s farm on " + chain + ' and keep the receipt.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
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
    var gas = gasFor(p);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: 'Check the gas cost on ' + gas.where + ' before you start: ' + gas.gas + '.', cost: gas.gas, time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: gas.weekly, time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Open the protocol's own points or rewards page and check the eligibility rules — which actions count, the minimum hold, and the snapshot dates — before you change anything.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to claim from the official link', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  // The hash carries the view — search, category and the open protocol — so a filtered board or an
  // open detail drawer can be linked and reloaded without losing the reader's place.
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  // Nulls sort last on purpose: a protocol with no seven-day growth or no age is never ranked above
  // one the snapshot actually measured, whichever direction the column is sorted in.
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = impliedFor(a); bv = impliedFor(b); }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  // The header carries the snapshot date, the sealed-snapshot note and the model version, so every
  // screenshot of the board states what data it shows and which model scored it.
  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'Sealed snapshot, no network' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols outside the watchlist. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows outside the watchlist' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  // The category list is built from the rows themselves, so a category the snapshot never names
  // can never appear as a filter, and one it does name always can.
  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', 'aria-live': 'polite', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
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
    var sandboxOn = !!state.sandbox;
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; writeHash(); render(); } })
      ));
    }
    // With the sandbox on, the ranks are re-derived from the sandbox's own implied values, so the
    // table shows the sandbox's ordering while the sealed ranks stay in board.json untouched.
    var rankOf = {};
    var max = 1;
    if (sandboxOn) {
      list.slice().sort(function (a, b) {
        var d = impliedFor(b) - impliedFor(a);
        return d !== 0 ? d : a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
      }).forEach(function (r, i) { rankOf[r.slug] = i + 1; });
    }
    list.forEach(function (r) { var v = impliedFor(r); if (v > max) max = v; });
    var tbody = el('tbody');
    list.forEach(function (r, i) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(sandboxOn ? rankOf[r.slug] : r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((impliedFor(r) / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(impliedFor(r)) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  // The live table shows market cap where the pre-token table shows implied value: a protocol that
  // already trades is priced by the market, and putting a model figure beside it would invite
  // exactly the comparison the board is built to avoid.
  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  // The model's statement, built from the model's own fields so the words follow the numbers the
  // table is using — sealed radar-2 by default, the sandbox's copy when the sandbox is open. The
  // formula is the only place the model's constants are printed as text, and it is rebuilt from
  // the same object the table scores with, so the two can never drift apart.
  function formulaText(m) {
    return 'implied = round( ' + m.base_multiple + ' x tvl_usd^' + m.tvl_exponent + ' x tvl_max^' + (1 - m.tvl_exponent) + ' x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )';
  }
  var SANDBOX_FIELDS = [
    ['base_multiple', 'Base multiple', '0.01'],
    ['tvl_exponent', 'TVL exponent', '0.01'],
    ['growth_weight', 'Growth weight', '0.01'],
    ['growth_floor', 'Growth floor %', '1'],
    ['growth_cap', 'Growth cap %', '1'],
    ['maturity_floor', 'Maturity floor', '0.01'],
    ['maturity_range', 'Maturity range', '0.01']
  ];

  // The sandbox re-scores every row in the browser from the seven editable constants and re-sorts
  // the table, but it never writes to DATA.model and never touches board.json — it is a what-if
  // view of the same rows, and Reset to radar-2 restores the sealed constants.
  function sandboxPanel() {
    var sm = currentModel();
    var fields = SANDBOX_FIELDS.map(function (f) {
      var input = el('input', { type: 'number', id: 'sb-' + f[0], step: f[2], value: String(sm[f[0]]), 'aria-label': f[1] });
      input.addEventListener('input', function () {
        var next = {};
        Object.keys(DATA.model).forEach(function (k) { next[k] = DATA.model[k]; });
        SANDBOX_FIELDS.forEach(function (g) {
          var node = document.getElementById('sb-' + g[0]);
          var v = node ? parseFloat(node.value) : NaN;
          if (isFinite(v)) next[g[0]] = v;
        });
        state.sandbox = next;
        state.sort = 'implied';
        state.dir = -1;
        render();
        var again = document.getElementById('sb-' + f[0]);
        if (again) again.focus();
      });
      return el('label', { class: 'sandbox-field' }, el('span', { text: f[1] }), input);
    });
    var fixed = 'Fixed: maturity_days ' + DATA.model.maturity_days + ', unknown_age_days ' + DATA.model.unknown_age_days + ', tvl_max_usd $' + Math.round(DATA.model.tvl_max_usd).toLocaleString('en-US') + ' (the largest TVL in the snapshot).';
    return el('div', { class: 'sandbox' },
      el('div', { class: 'sandbox-head' },
        el('b', { text: 'Sandbox — changes the display only, not board.json' }),
        el('button', { class: 'button', type: 'button', text: 'Reset to radar-2', onclick: function () { state.sandbox = null; state.sort = 'implied'; state.dir = -1; render(); } })
      ),
      el('div', { class: 'sandbox-grid' }, fields),
      el('p', { class: 'sub', text: fixed })
    );
  }

  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula', text: formulaText(currentModel()) }),
      el('p', { class: 'sub', text: 'The scale is log-compressed: at tvl_max it equals ' + m.base_multiple + ' x tvl_max, as a flat multiple would, but smaller protocols are lifted toward it, so growth and age can move their rank. tvl_max is the largest TVL in the snapshot, $' + Math.round(m.tvl_max_usd).toLocaleString('en-US') + ', passed through from the data rather than written into the formula.' }),
      el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. The early radar is every pre-token protocol outside the watchlist that passes the board\'s exclusion rule, ranked by implied value, and the live-token protocols are set aside with their market caps shown.' }),
      sandboxPanel()
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
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    // The equation shows the model's inputs and both multipliers, then the page's own recomputation
    // of the row, so the reader can check the arithmetic instead of taking the number on trust.
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(impliedOf(row, DATA.model)) + (impliedOf(row, DATA.model) === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + (state.sandbox ? ' With the sandbox applied the display value is ' + fmtUsd(impliedOf(row, state.sandbox)) + '; board.json still carries the sealed figure.' : '') + ' This is an estimate, not a price.' })
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
      // showModal is the dialog's own way in: it traps focus and Escape for free, and the close
      // event clears the selection and the hash, so the back button and the Close button agree.
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  // One render rebuilds the whole shell from state: a search, a filter, a tab or a sort re-renders
  // the same way, and the detail dialog is re-attached after the shell so it survives the rebuild.
  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
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
