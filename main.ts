// A working token-radar-01 entry (Node 22, standard library only).
//
// The program reads the sealed snapshot from /input/snapshot.json (or --input <file|dir>), scores every
// pre-token protocol with the model in dashboard/model.js — the same file the dashboard runs in the
// browser, so the page's recomputation is the same code as the build — writes the ranked board to
// /output/board.json, and copies this repository's dashboard/ and screenshots/ to /output. Last, it
// writes /output/dossier.json, the summary the judge reads, with the vendored make.fun library.
//
// The dashboard is a static page, no framework and no network: dashboard/index.html, dashboard/app.css,
// dashboard/app.js and dashboard/model.js read /output/data.js, which this program writes from the
// same board. Change the model, the page or the plan; keep the gate's shape.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { buildDossier } from './vendor/makefun-board.ts';

const require = createRequire(import.meta.url);
const M = require('./dashboard/model.js');

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = M.parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = M.buildRadar(snapshot);
const issue = M.boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), M.dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

const bt = radar.backtest;
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.universe.set_aside['excluded category'] ?? 0} set aside by category, ${radar.universe.set_aside['versioned name'] ?? 0} versioned, ${radar.universe.set_aside['wrapped/staked name'] ?? 0} wrapped/staked)\n` +
    `token radar: model ${radar.model_version}, size curve log10(mcap) = ${radar.curve.intercept} + ${radar.curve.slope} x log10(TVL) from ${radar.curve.comps} live comps, board implied value $${board.reduce((n, r) => n + r.implied_value_usd, 0).toLocaleString('en-US')}\n` +
    `token radar: blind leave-one-out ladder multiple x${bt.loo_ladder.multiple.curve_miss} -> curve x${bt.loo_ladder.curve.curve_miss} -> family x${bt.loo_ladder.family.curve_miss} -> full x${bt.loo.curve_miss} (flat x${bt.loo.flat_miss}, ${bt.loo.curve_within3}% within 3x vs ${bt.loo.flat_within3}%); time split x${bt.time_split.curve_miss} vs x${bt.time_split.flat_miss} flat; category holdout x${bt.holdout.curve_miss} vs x${bt.holdout.flat_miss} flat (${bt.holdout.curve_within3}% within 3x vs ${bt.holdout.flat_within3}%); fold rank correlation ${bt.fold_rank_corr}\n` +
    `token radar: bootstrap band spans 2x or more for ${board.filter((r) => r.value_range_usd.high_usd >= 2 * r.value_range_usd.low_usd).length} of ${board.length} rows, 4x or more for ${board.filter((r) => r.value_range_usd.band_ratio >= 4).length}\n` +
    `token radar: farm verdicts: ${radar.verdict_counts.farm} FARM / ${radar.verdict_counts.thin} THIN / ${radar.verdict_counts.skip} SKIP; best on the watchlist ${radar.best_per_hour[0]?.name ?? 'none'} at $${radar.best_per_hour[0]?.net_per_hour_usd ?? 0}/hour\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (4 files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
