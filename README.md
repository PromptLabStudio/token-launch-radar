# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/PromptLabStudio/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/PromptLabStudio/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A ranked board of protocols that have no token yet, scored by implied value from a sealed DefiLlama snapshot, with a concrete eight-step farm plan per protocol. Entry for make.fun's "Build the best token launch radar" bounty ($1,325 in USDC, 10 places).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=fv5fdg4h&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

## Token Radar v2

Token Radar is a ranked board of protocols that have no token yet. It reads one sealed snapshot of
758 protocol records, keeps every protocol that records no token, market cap or CoinGecko id, sets
the exchanges, the wrapped, staked and bridged products of protocols whose token already trades,
and the versioned pools aside, scores the rest with one stated model, and publishes the
ranking as a static dashboard with a per-protocol detail drawer and an eight-step farm plan.

Nothing in the entry fetches anything. `main.ts` reads the snapshot from disk, writes `board.json`,
`data.js` and `dossier.json`, and copies `dashboard/` and `screenshots/` into the output directory.
The page reads `data.js` and renders from it.

## What it produces

- **198 ranked rows**: 40 watchlist protocols (every slug on the watchlist, TVL at or above the $50M
  floor) plus 158 early-radar protocols — pre-token, not an exchange, not a wrapped, staked or
  bridged product of a protocol whose token already trades, not a versioned pool — below
  the floor and above it alike. The floor is the watchlist's rule, never the board's ceiling.
- **24 live-token protocols set aside** in their own tab, shown with the market's own market caps,
  never mixed into the ranked board.
- **One farm plan per row**, eight steps derived from the row's own category, chains, TVL and age:
  a fresh wallet, a gas check for the chain the protocol actually runs on, the category's action, a
  weekly qualifying action, a hold window, an eligibility check, a claim from the protocol's own
  published link, and a farm log.

## The model (radar-2)

```
scale      = 0.25 x tvl_usd^0.75 x tvl_max^0.25      tvl_max = 116,083,653,379
growth     = clamp(change_7d, -60, 150) per cent
growthMult = 1 + (growth / 100) x 0.75
maturity   = 0.6 + min(age_days, 1095) / 1095 x 0.4  age_days unknown -> 365
implied    = max(1, round(scale x growthMult x maturity))
```

`tvl_max` is computed from the snapshot itself — the largest `tvl_usd` over all 758 protocol records
— and passed to the model as `model.tvl_max_usd`. It is never written into the formula as a literal
on the scoring side, and the dashboard reads it back from the data.

The scale is log-compressed on purpose. At `tvl_max` it equals `0.25 x tvl_max`, exactly what a flat
multiple would give, but a smaller protocol is lifted toward that level, so seven-day growth and age
can move its rank. Without the compression the largest protocol would simply win every time.

Age is the whole days from `listed_at` to the snapshot's `as_of`. A protocol with no listing date is
scored at 365 days rather than being dropped.

## Running it

Node 22, standard library only, no dependencies and no network:

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Expected output:

```
token radar: 758 protocols, 40 on the watchlist, 198 rows scored (158 early, 24 live set aside)
```

Open `out/dashboard/index.html` through any static file server rooted at `out/` (the page loads
`../data.js`). `board.json` holds the same rows with their farm steps as strings; `dossier.json` is
the summary written last.

## The dashboard

A static page: `dashboard/index.html`, `dashboard/app.css`, `dashboard/app.js`. No framework, no web
font, no network request of any kind.

- **Ranked table** of all 198 rows: rank, protocol (with category and chains), TVL, seven-day
  change, age with no token, and implied value with a bar. The header is sticky.
- **Search** across name, slug, category and chain; a **category filter** built from the rows
  themselves; and **Pre-token / Live token** tabs, where the live tab shows the 24 protocols that
  already trade, with their market caps.
- **Sortable columns** — rank/implied, protocol, TVL, seven-day change and age — each toggling
  ascending and descending.
- **Detail drawer** for any row: the inputs (TVL, growth, age), the two multipliers, the implied
  value, the page's own recomputation of that value against `board.json`, and the full eight-step
  farm plan with each step's cost and time.
- **Hash routing** so a view can be linked: `#q=<search>`, `#category=<category>`,
  `#p=<slug>` (opens that protocol's drawer). The page rewrites the hash as you search and select.
- **Model sandbox** at the foot of the page: seven number inputs (base multiple, TVL exponent,
  growth weight, growth floor and cap, maturity floor and range) that re-score every row in the
  browser, re-sort by implied value and re-number the ranks. It changes the display only —
  `board.json` is never touched — and a **Reset to radar-2** button restores the sealed constants.
  `maturity_days`, `unknown_age_days` and `tvl_max_usd` are fixed and shown read-only.

The dashboard's `impliedOf` is the same arithmetic as `lib/model.ts`: it recomputes every row from
the raw `tvl_usd`, `change_7d` and `age_days` plus the model constants, never from the rounded
multipliers that `board.json` carries for display.

## How it was verified

- `main.ts` runs clean and prints the summary line above.
- A board check reads `out/board.json` and asserts twelve properties: 198 rows, all 40 watchlist
  slugs present, ranks 1..198 with no gap, implied values non-increasing down the board, no two
  rows sharing the board's whole implied range, and eight farm steps per row, each between 124 and
  237 characters.
- An implied-value sync check extracts `impliedOf` from `dashboard/app.js` and recomputes all 198
  rows against `out/board.json`: the delta is zero on every row.
- A farm-step sync check extracts the page's farm-plan functions and compares all 1,584 step
  strings (198 rows x 8 steps) with `board.json`: identical on every one, across both gas classes
  (33 Ethereum-mainnet-heavy protocols, 165 with a low-fee chain).
- `grade-local` from the kit's CLI is run against this directory with `--driver process --worktree
  --check`.
- The three screenshots are 1440x900 captures of this dashboard: the board, the rank-1 detail
  drawer (Steakhouse Financial), and the Lending filter.

## Layout

```
main.ts              reads the snapshot, writes board.json, data.js, dossier.json, copies the page
lib/model.ts         the model, the board, the farm plan, the snapshot parser and the board check
vendor/makefun-board.ts  the kit's dossier library (unmodified)
dashboard/           index.html, app.css, app.js — the static page
screenshots/         1-board.png, 2-detail.png, 3-filtered.png at 1440x900
out/                 generated: board.json, data.js, dossier.json, dashboard/, screenshots/
```
