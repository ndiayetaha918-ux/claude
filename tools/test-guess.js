#!/usr/bin/env node
/* Test de cohérence du mode Guess The Team :
   - chaque nom de joueur des compos doit se résoudre dans PLAYERS
   - chaque club d'un joueur résolu doit avoir un écusson dans CLUB_LOGOS
   Usage : node tools/test-guess.js  (exit 1 si problème) */
const fs = require('fs');
const path = require('path');

global.window = {};
require(path.join(__dirname, '..', 'scripts', 'players.js'));
require(path.join(__dirname, '..', 'scripts', 'club-logos.js'));
const PLAYERS = global.window.PLAYERS;
const LOGOS = global.window.CLUB_LOGOS || {};

// — réplique de normName/findGuessPlayer de main.js —
function normName(s) {
  return (s || '').replace(/\([^)]*\)/g, ' ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ø/gi, 'o').replace(/å/gi, 'a').replace(/[æ]/gi, 'ae')
    .replace(/ł/gi, 'l').replace(/[đð]/gi, 'd').replace(/ı/gi, 'i')
    .replace(/ß/gi, 'ss').toLowerCase().replace(/\s+/g, ' ').trim();
}
function findGuessPlayer(name) {
  const q = normName(name);
  if (!q) return null;
  let p = PLAYERS.find(x => normName(x.name) === q);
  if (p) return p;
  p = PLAYERS.find(x => { const n = normName(x.name); return n.endsWith(' ' + q) || n === q; });
  if (p) return p;
  const ql = q.split(' ').pop();
  p = PLAYERS.find(x => normName(x.name).split(' ').pop() === ql);
  return p || null;
}
function clubLogoSrc(club) {
  if (!club) return null;
  return LOGOS[club] || LOGOS[club.replace(/\b[FA]\.?C\.?\b/gi, '').trim()] || null;
}

// — extraction des compos depuis main.js —
const main = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'main.js'), 'utf8');
function extract(blockName, endMark) {
  const start = main.indexOf(blockName);
  const end = main.indexOf(endMark, start);
  return main.slice(start, end);
}
const clubBlock = extract('GUESS_CLUB_LINEUPS = [', 'GUESS_NATION_LINEUPS');
const nationBlock = extract('GUESS_NATION_LINEUPS = [', 'let guessState');
const names = (block) => [...block.matchAll(/name:\s*'((?:[^'\\]|\\.)+)'/g)].map(m => m[1].replace(/\\'/g, "'"));

// overrides GUESS_DB_FIX déclarés dans main.js : { 'Nom': { nat: 'X', club: 'Y' } }
const fixBlock = extract('GUESS_DB_FIX = {', '};');
const FIX = {};
for (const m of fixBlock.matchAll(/'((?:[^'\\]|\\.)+)':\s*\{\s*nat:\s*'([^']+)',\s*club:\s*'([^']+)'/g)) {
  FIX[m[1].replace(/\\'/g, "'")] = { nat: m[2], club: m[3] };
}
function guessMeta(name) { return findGuessPlayer(name) || FIX[name] || null; }

let fail = 0;
const missingClubs = new Set();
for (const [label, block] of [['CLUB', clubBlock], ['NATION', nationBlock]]) {
  for (const n of names(block)) {
    const p = guessMeta(n);
    if (!p) { console.log(`✗ [${label}] joueur introuvable : ${n}`); fail++; continue; }
    if (label === 'NATION' && p.club && !clubLogoSrc(p.club)) missingClubs.add(p.club);
    if (label === 'CLUB' && !p.nat) { console.log(`✗ [CLUB] pas de nationalité : ${n}`); fail++; }
  }
}
if (missingClubs.size) {
  console.log(`\n⚠ clubs sans écusson (fallback initiales) : ${[...missingClubs].sort().join(' · ')}`);
}
console.log(fail === 0 ? '\n✓ tous les joueurs des compos se résolvent' : `\n${fail} problèmes`);
process.exit(fail ? 1 : 0);
