#!/usr/bin/env node
/* ============================================================
   Drafter — Pipeline scraping LOGOS / écussons de clubs
   Récupère les vrais écussons depuis Wikipedia (MediaWiki API)
   et les stocke localement dans assets/logos/.

   Pourquoi local et pas hotlink ?
   - Pas de dépendance réseau au runtime (le jeu marche hors-ligne)
   - Wikimedia n'aime pas le hotlink massif (rate-limit)
   - Le lien de visualisation reste stable : tout est commité.

   Utilisation :
     node tools/scrape-logos.js            # télécharge la liste curée
     node tools/scrape-logos.js --check    # dry-run : résout les URLs, n'écrit rien
     node tools/scrape-logos.js --force    # re-télécharge même si déjà présent

   Sortie :
   - assets/logos/<slug>.(svg|png)   les écussons
   - scripts/club-logos.js            window.CLUB_LOGOS = { "Club": "assets/logos/.." }

   Source : https://en.wikipedia.org/w/api.php (prop=pageimages, piprop=original)
   L'image principale d'un article de club = son écusson dans 99% des cas.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const LOGOS_DIR = path.join(ROOT, 'assets', 'logos');
const MAP_PATH = path.join(ROOT, 'scripts', 'club-logos.js');

const ARGS = process.argv.slice(2);
const DRY = ARGS.includes('--check');
const FORCE = ARGS.includes('--force');

const UA = 'DrafterLogoBot/1.0 (https://github.com/ndiayetaha918-ux/claude; football drafter game)';
const DELAY_MS = 800;

// -------- Liste curée : nom utilisé dans players.js -> titre Wikipédia + alias éventuels --------
// (couvre les clubs des compos de "Guess The Team" + clubs des stars Ronaldo/Messi/etc.)
const CLUBS = [
  { name: 'Real Madrid',       title: 'Real Madrid CF' },
  { name: 'FC Barcelona',      title: 'FC Barcelona' },
  { name: 'Atlético Madrid',   title: 'Atlético Madrid' },
  { name: 'Athletic Bilbao',   title: 'Athletic Bilbao' },
  { name: 'Real Sociedad',     title: 'Real Sociedad' },
  { name: 'Manchester City',   title: 'Manchester City F.C.' },
  { name: 'Manchester United', title: 'Manchester United F.C.' },
  { name: 'Arsenal',           title: 'Arsenal F.C.' },
  { name: 'Liverpool',         title: 'Liverpool F.C.' },
  { name: 'Chelsea',           title: 'Chelsea F.C.' },
  { name: 'Tottenham',         title: 'Tottenham Hotspur F.C.' },
  { name: 'Newcastle',         title: 'Newcastle United F.C.' },
  { name: 'Aston Villa',       title: 'Aston Villa F.C.' },
  { name: 'West Ham',          title: 'West Ham United F.C.' },
  { name: 'Crystal Palace',    title: 'Crystal Palace F.C.' },
  { name: 'Burnley FC',        title: 'Burnley F.C.', aliases: ['Burnley'] },
  { name: 'Paris SG',          title: 'Paris Saint-Germain F.C.', aliases: ['PSG', 'Paris Saint-Germain'] },
  { name: 'Marseille',         title: 'Olympique de Marseille', aliases: ['Olympique Marseille'] },
  { name: 'Lyon',              title: 'Olympique Lyonnais' },
  { name: 'Bayern Munich',     title: 'FC Bayern Munich', aliases: ['Bayern München'] },
  { name: 'Bayer Leverkusen',  title: 'Bayer 04 Leverkusen' },
  { name: 'RB Leipzig',        title: 'RB Leipzig' },
  { name: 'Borussia Dortmund', title: 'Borussia Dortmund' },
  { name: 'Inter',             title: 'Inter Milan', aliases: ['Inter Milan', 'Internazionale'] },
  { name: 'AC Milan',          title: 'AC Milan' },
  { name: 'Juventus',          title: 'Juventus FC' },
  { name: 'Atalanta',          title: 'Atalanta BC' },
  { name: 'Lazio',             title: 'S.S. Lazio' },
  { name: 'Napoli',            title: 'S.S.C. Napoli' },
  { name: 'AS Roma',           title: 'A.S. Roma', aliases: ['Roma'] },
  { name: 'Como 1907',         title: 'Como 1907' },
  { name: 'FC Porto',          title: 'FC Porto', aliases: ['Porto'] },
  { name: 'Sporting CP',       title: 'Sporting CP' },
  { name: 'Benfica',           title: 'S.L. Benfica' },
  { name: 'Al-Nassr',          title: 'Al-Nassr FC', aliases: ['Al Nassr', 'Al-Nassr FC'] },
  { name: 'Al-Hilal',          title: 'Al-Hilal SFC', aliases: ['Al Hilal'] },
  { name: 'Inter Miami',       title: 'Inter Miami CF', aliases: ['Inter Miami CF'] },
  // — couverture étendue (variante Sélection : club de chaque international) —
  { name: 'Tottenham',         title: 'Tottenham Hotspur F.C.', aliases: ['Tottenham Hotspur'] },
  { name: 'Everton',           title: 'Everton F.C.' },
  { name: 'Brighton',          title: 'Brighton & Hove Albion F.C.', aliases: ['Brighton & Hove Albion'] },
  { name: 'Brentford',         title: 'Brentford F.C.' },
  { name: 'Fulham',            title: 'Fulham F.C.' },
  { name: 'Nottingham Forest', title: 'Nottingham Forest F.C.' },
  { name: 'Wolverhampton',     title: 'Wolverhampton Wanderers F.C.', aliases: ['Wolves'] },
  { name: 'Bournemouth',       title: 'A.F.C. Bournemouth', aliases: ['AFC Bournemouth'] },
  { name: 'Leeds United',      title: 'Leeds United F.C.', aliases: ['Leeds'] },
  { name: 'Sunderland',        title: 'Sunderland A.F.C.', aliases: ['Sunderland AFC'] },
  { name: 'Villarreal',        title: 'Villarreal CF' },
  { name: 'Real Betis',        title: 'Real Betis' },
  { name: 'Sevilla',           title: 'Sevilla FC' },
  { name: 'Valencia',          title: 'Valencia CF' },
  { name: 'Girona',            title: 'Girona FC' },
  { name: 'UD Almería',        title: 'UD Almería', aliases: ['Almería'] },
  { name: 'Stuttgart',         title: 'VfB Stuttgart' },
  { name: 'Eintracht Frankfurt', title: 'Eintracht Frankfurt' },
  { name: 'Fiorentina',        title: 'ACF Fiorentina' },
  { name: 'Bologna',           title: 'Bologna FC 1909' },
  { name: 'Torino',            title: 'Torino F.C.' },
  { name: 'Lille',             title: 'Lille OSC' },
  { name: 'Nice',              title: 'OGC Nice' },
  { name: 'Lens',              title: 'RC Lens' },
  { name: 'Rennes',            title: 'Stade Rennais F.C.' },
  { name: 'Monaco',            title: 'AS Monaco FC', aliases: ['AS Monaco'] },
  { name: 'Ajax Amsterdam',    title: 'AFC Ajax', aliases: ['Ajax'] },
  { name: 'PSV',               title: 'PSV Eindhoven', aliases: ['PSV Eindhoven'] },
  { name: 'Feyenoord',         title: 'Feyenoord' },
  { name: 'Fenerbahçe',        title: 'Fenerbahçe S.K. (football)', aliases: ['Fenerbahce'] },
  { name: 'Galatasaray',       title: 'Galatasaray S.K. (football)' },
  { name: 'Al-Ittihad',        title: 'Al-Ittihad Club (Jeddah)', aliases: ['Al Ittihad'] },
  { name: 'Al-Ahli',           title: 'Al-Ahli Saudi FC', aliases: ['Al Ahli'] },
  { name: 'Flamengo',          title: 'CR Flamengo' },
  { name: 'São Paulo',         title: 'São Paulo FC', aliases: ['Sao Paulo'] },
  { name: 'Corinthians',       title: 'Sport Club Corinthians Paulista' },
  { name: 'River Plate',       title: 'Club Atlético River Plate' },
  { name: 'Boca Juniors',      title: 'Boca Juniors' },
  { name: 'Celtic',            title: 'Celtic F.C.' },
  { name: 'Rangers',           title: 'Rangers F.C.' },
];

// -------- helpers --------
function slugify(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function get(url, binary = false) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': UA, 'Accept': binary ? '*/*' : 'application/json' },
      timeout: 20000,
    }, (res) => {
      // suivre les redirections (upload.wikimedia renvoie parfois 301/302)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(res.headers.location, binary));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(binary ? Buffer.concat(chunks) : Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout ' + url)));
  });
}

const API = 'https://en.wikipedia.org/w/api.php?format=json&redirects=1&';
const norm = s => (s || '').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/^file:/, '').replace(/[^a-z0-9]+/g, ' ').trim();
// mots qui DISQUALIFIENT un fichier (pas un écusson)
const BAD = ['stadium', 'kit', 'map', 'flag', 'locator', 'uefa', 'premier league', 'la liga',
  'bundesliga', 'serie a', 'ligue 1', 'champions league', 'commons', 'wikimedia', 'wikipedia',
  'edit icon', 'pog', 'pictogram', 'football pitch', 'soccer', 'question', 'padlock', 'ambox',
  'wiki letter', 'red x', 'green check', 'sound', 'speaker', 'star full', 'folder', 'nuvola',
  'magnify', 'increase', 'decrease', 'arrow', 'symbol', 'disambig', 'p football', 'p vip'];
const GOOD = ['crest', 'logo', 'badge', 'escudo', 'wappen', 'stemma', 'emblem'];

// Liste les fichiers d'une page, choisit le meilleur candidat "écusson", renvoie son URL.
async function resolveImage(title, clubName) {
  // mots distinctifs du club (>=4 lettres, hors génériques)
  const generic = new Set(['club', 'football', 'futbol', 'calcio', 'fussball', 'sport', 'sporting', 'real', 'olympique']);
  const words = norm(clubName).split(' ').filter(w => w.length >= 4 && !generic.has(w));

  const listJson = JSON.parse(await get(API + 'action=query&prop=images&imlimit=80&titles=' + encodeURIComponent(title)));
  const pages = listJson.query && listJson.query.pages;
  const page = pages && Object.values(pages)[0];
  const images = (page && page.images) || [];

  let best = null, bestScore = 0;
  for (const im of images) {
    const t = im.title; // "File:Arsenal FC.svg"
    if (!/\.(svg|png)$/i.test(t)) continue;     // écussons = svg/png
    const n = norm(t);
    if (BAD.some(b => n.includes(b))) continue;
    let score = /\.svg$/i.test(t) ? 2 : 1;
    if (GOOD.some(g => n.includes(g))) score += 4;
    if (words.some(w => n.includes(w))) score += 3;
    if (score > bestScore) { bestScore = score; best = t; }
  }

  let fileTitle = best;
  // fallback : image principale de la page (logos libres)
  if (!fileTitle) {
    const pj = JSON.parse(await get(API + 'action=query&prop=pageimages&piprop=name&titles=' + encodeURIComponent(title)));
    const p = pj.query && pj.query.pages && Object.values(pj.query.pages)[0];
    if (p && p.pageimage) fileTitle = 'File:' + p.pageimage;
  }
  if (!fileTitle) return null;

  // URL directe du fichier
  const infoJson = JSON.parse(await get(API + 'action=query&prop=imageinfo&iiprop=url&titles=' + encodeURIComponent(fileTitle)));
  const ip = infoJson.query && infoJson.query.pages && Object.values(infoJson.query.pages)[0];
  const info = ip && ip.imageinfo && ip.imageinfo[0];
  return info ? info.url : null;
}

async function main() {
  if (!DRY && !fs.existsSync(LOGOS_DIR)) fs.mkdirSync(LOGOS_DIR, { recursive: true });

  const map = {};
  let ok = 0, fail = 0;

  for (const club of CLUBS) {
    try {
      const src = await resolveImage(club.title, club.name);
      if (!src) { console.log('✗ pas d\'image  ', club.name, '(' + club.title + ')'); fail++; await sleep(DELAY_MS); continue; }

      const ext = (src.split('.').pop().split('?')[0] || 'png').toLowerCase();
      const safeExt = ['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext) ? ext : 'png';
      const rel = 'assets/logos/' + slugify(club.name) + '.' + safeExt;

      if (DRY) {
        console.log('→', club.name.padEnd(20), src);
      } else {
        const existing = path.join(ROOT, rel);
        if (FORCE || !fs.existsSync(existing)) {
          const buf = await get(src, true);
          fs.writeFileSync(existing, buf);
        }
        console.log('✓', club.name.padEnd(20), rel);
      }

      map[club.name] = rel;
      for (const a of (club.aliases || [])) map[a] = rel;
      ok++;
    } catch (e) {
      console.log('✗ erreur     ', club.name, '—', e.message);
      fail++;
    }
    await sleep(DELAY_MS);
  }

  console.log(`\n${ok} OK · ${fail} échecs`);

  if (!DRY) {
    const lines = Object.keys(map).sort().map(k => '  ' + JSON.stringify(k) + ': ' + JSON.stringify(map[k]) + ',');
    const out = '// Drafter — écussons de clubs (généré par tools/scrape-logos.js)\n'
      + '// Ne pas éditer à la main : relance `node tools/scrape-logos.js`.\n'
      + 'window.CLUB_LOGOS = {\n' + lines.join('\n') + '\n};\n';
    fs.writeFileSync(MAP_PATH, out);
    console.log('Écrit', path.relative(ROOT, MAP_PATH), '(' + Object.keys(map).length + ' entrées)');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
