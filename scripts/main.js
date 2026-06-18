/* ==========================================================================
   Drafter — moteur de jeu
   ========================================================================== */
(function () {
  'use strict';

  let PLAYERS = window.PLAYERS;        // dataset actif (mutable selon mode)
  const REAL_PLAYERS = window.PLAYERS;
  const LEGENDS = window.LEGENDS || [];
  const NARUTO  = window.NARUTO  || [];
  const ANIMALS = window.ANIMALS || [];
  const DATASETS = {
    real:    { label: 'Joueurs réels',  data: REAL_PLAYERS, league: null },
    legends: { label: 'Légendes',       data: LEGENDS,      league: 'Légendes' },
    naruto:  { label: 'Naruto',         data: NARUTO,       league: 'Naruto' },
    animals: { label: 'Animaux',        data: ANIMALS,      league: 'Animaux' },
  };
  const SLOT_RULES = window.SLOT_RULES;
  const FORMATIONS = window.FORMATIONS;
  // Sauvegarde de la liste 11v11 originale pour pouvoir y revenir
  window.FORMATIONS_11 = window.FORMATIONS_11 || Object.assign({}, FORMATIONS);
  function applyFormationSet(set) {
    // mute le contenu de FORMATIONS sans casser la référence
    Object.keys(FORMATIONS).forEach(k => delete FORMATIONS[k]);
    Object.assign(FORMATIONS, set);
  }

  // ---------- Couleurs des participants & gradients par poste ----------
  const TEAM_COLORS = [
    { grad: 'linear-gradient(135deg,#ff6b3d,#ffb56b)', solid: '#ff6b3d' },
    { grad: 'linear-gradient(135deg,#00ff95,#00b86c)', solid: '#00ff95' },
    { grad: 'linear-gradient(135deg,#a98cff,#6c5ce7)', solid: '#a98cff' },
    { grad: 'linear-gradient(135deg,#ffc94e,#ff8a3d)', solid: '#ffc94e' },
  ];

  // Gradient déterministe par joueur (basé sur hash du nom)
  const CARD_GRADIENTS = [
    'linear-gradient(160deg,#1a8a4f 0%,#0d3d22 100%)',
    'linear-gradient(160deg,#0f6e8a 0%,#0a2f3a 100%)',
    'linear-gradient(160deg,#8a3d1f 0%,#3a1810 100%)',
    'linear-gradient(160deg,#6c2d8a 0%,#2d1538 100%)',
    'linear-gradient(160deg,#8a6b1f 0%,#3a2810 100%)',
    'linear-gradient(160deg,#1f4a8a 0%,#101e3a 100%)',
    'linear-gradient(160deg,#8a1f55 0%,#3a0f25 100%)',
    'linear-gradient(160deg,#3d8a1f 0%,#1a3a10 100%)',
    'linear-gradient(160deg,#1f8a8a 0%,#0f3a3a 100%)',
    'linear-gradient(160deg,#5a5a5a 0%,#1f1f1f 100%)',
  ];
  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }
  function gradientFor(player) {
    return CARD_GRADIENTS[hashStr(player.id) % CARD_GRADIENTS.length];
  }
  const initials = (player_or_name) => {
    // Pour Naruto/Animaux : si emoji défini, on l'utilise comme "initiales visuelles"
    if (typeof player_or_name === 'object' && player_or_name && player_or_name.emoji) return player_or_name.emoji;
    const name = typeof player_or_name === 'string' ? player_or_name : (player_or_name && player_or_name.name) || '';
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  };

  // Recherche insensible aux accents (Ødegaard, Konaté, Leão, Müller…)
  function normSearch(s) {
    if (!s) return '';
    return s.toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ø/g, 'o').replace(/Ø/g, 'o')
      .replace(/æ/g, 'ae').replace(/œ/g, 'oe')
      .replace(/ß/g, 'ss');
  }

  // ---------- Photo attach helper avec cascade d'URLs ----------
  // Tente photoUrl(p) → photoUrlFallback(p) → fallback gradient + initiales
  function attachPhoto(container, player, imgClass) {
    // Cascade élargie : Sofifa _240 (HD) → Sofifa _120 → Fotmob → TM medium
    const candidates = [];
    if (player.photo)  candidates.push(player.photo);
    if (player.sofifa) candidates.push(player.sofifa.replace(/_120\.png$/, '_240.png'));
    if (player.sofifa) candidates.push(player.sofifa);  // fallback _120
    if (player.fot)    candidates.push('https://images.fotmob.com/image_resources/playerimages/' + player.fot + '.png');
    if (player.tmid)   candidates.push('https://img.a.transfermarkt.technology/portrait/medium/' + player.tmid + '-1.jpg');
    if (player.sofa)   candidates.push('https://api.sofascore.app/api/v1/player/' + player.sofa + '/image');

    // Dédoublonnage
    const seen = new Set();
    const dedup = candidates.filter(u => u && !seen.has(u) && seen.add(u));
    if (!dedup.length) return;  // aucune source : on garde le fallback initiales du container

    const im = new Image();
    im.alt = player.name;
    im.referrerPolicy = 'no-referrer';
    im.decoding = 'async';
    im.className = imgClass || '';
    let idx = 0;
    im.onload = () => {
      if (im.naturalWidth > 1) container.classList.add('has-img');
    };
    im.onerror = () => {
      idx++;
      if (idx < dedup.length) {
        im.src = dedup[idx];
      } else {
        // Échec total : on retire l'image, le fallback initiales reste
        im.remove();
      }
    };
    im.src = dedup[0];
    container.appendChild(im);
  }

  // ---------- État global ----------
  // ageSlider : 0-10
  //   0..8 = U19..U27 (cap max age = 19 + index)
  //   9    = Tous âges (pas de filtre)
  //   10   = 27 ans et + (uniquement vétérans)
  const AGE_LABELS = ['U19','U20','U21','U22','U23','U24','U25','U26','U27','Tous âges','27 ans et +'];
  function passesAge(age, ageSlider) {
    if (ageSlider === 10) return age >= 27;
    if (ageSlider === 9)  return true;
    return age <= 19 + ageSlider;
  }

  const state = {
    mode: 'local',       // 'local' | 'online'
    online: { joined: false, isHost: false, myId: null, roomCode: null, shortlist: [] },
    nbPlayers: 4,
    budget: 500,
    timerSec: 45,
    gamble: true,
    onePerClub: false,
    clubMode: '',        // '' = off, sinon = nom du club
    clubModeFormer: false, // true = inclure anciens joueurs
    wcMode: false,       // Draft Coupe du Monde : pool = nations qualifiées
    leagues: new Set(),  // Championnats activés
    ageSlider: 9,        // 9 = "Tous âges" par défaut
    participants: [],
    order: [],
    round: 1,
    pickIndex: 1,
    currentParticipant: null,
    skipped: [],
    takenIds: new Set(),
    timerHandle: null,
    timerEnd: 0,
    pendingPick: null,
    gambleUsed: false,
  };

  // ---------- Détection device pour optimisations ----------
  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
  const isMobile = isTouch || window.innerWidth < 720;
  const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (isMobile) document.documentElement.classList.add('is-mobile');
  if (isTouch) document.documentElement.classList.add('is-touch');

  // ---------- DOM helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) node.setAttribute(k, v);
    });
    children.flat().forEach(c => {
      if (c == null || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  };

  // ============================================================
  // HERO POLAROID SCROLLER
  // ============================================================
  function buildHero() {
    buildHeroMosaic();
    const bento = $('#modeBento');
    if (!bento) return;

    const cards = Array.from(bento.querySelectorAll('.mode-card'));
    const order = cards.map(c => c.dataset.bento);   // ordre DOM
    let activeIdx = order.indexOf('draft');           // draft au centre au départ
    let previewedMode = null;                          // mode prévisualisé au survol
    if (activeIdx < 0) activeIdx = Math.floor(cards.length / 2);

    const MODE_AMBIANCE = { five:'five', draft:'draft', juste:'juste', under:'under', guess:'guess' };

    function applyCoverflow() {
      cards.forEach((card, i) => {
        const slot = i - activeIdx;                 // distance signée au centre
        card.style.setProperty('--slot', slot);
        card.style.setProperty('--abs', Math.abs(slot));
        card.classList.toggle('is-center', slot === 0);
      });
      // Ambiance fond selon la card centrale
      const centerMode = order[activeIdx];
      document.body.classList.remove('mode-hover-five','mode-hover-draft','mode-hover-juste','mode-hover-under','mode-hover-guess');
      if (MODE_AMBIANCE[centerMode]) document.body.classList.add('mode-hover-' + centerMode);
    }
    applyCoverflow();

    // === RÉACTIF À LA SOURIS ===
    // Survol : la carte MONTE et passe au-dessus — SANS re-centrer le carrousel
    // (le re-centrage déplaçait les cartes sous le curseur → clics vers le
    // mauvais mode + nervosité). Tilt perspective + parallaxe du sujet via rAF.
    cards.forEach((card, i) => {
      const hit = card.querySelector('.mc-inner') || card;
      const player = card.querySelector('.mc-player');
      let raf = 0;
      hit.addEventListener('mouseenter', () => {
        card.style.setProperty('--liftY', '-16px');
        card.classList.add('is-hover');
        // PRÉVIEW complète du mode survolé (thème + menu + VRAIES compos),
        // sans scroll. On ne reconstruit que si le mode prévisualisé change
        // (évite de réinitialiser les saisies pendant qu'on bouge la souris).
        if (previewedMode !== order[i]) {
          previewedMode = order[i];
          routeMode(order[i], { scroll: false });
        }
      });
      hit.addEventListener('mousemove', (ev) => {
        if (raf) return;                       // 1 update max par frame (perf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          const r = card.getBoundingClientRect();
          const nx = ((ev.clientX - r.left) / r.width - 0.5) * 2;   // -1 → 1
          const ny = ((ev.clientY - r.top) / r.height - 0.5) * 2;
          card.style.setProperty('--mrx', (nx * 8).toFixed(2) + 'deg');   // rotateY ← X
          card.style.setProperty('--mry', (-ny * 6).toFixed(2) + 'deg');  // rotateX ← Y
          if (player) {
            player.style.setProperty('--px', (-nx * 18).toFixed(1) + 'px');
            player.style.setProperty('--py', (-ny * 12).toFixed(1) + 'px');
          }
        });
      });
      hit.addEventListener('mouseleave', () => {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        card.classList.remove('is-hover');
        card.style.setProperty('--liftY', '0px');
        card.style.setProperty('--mrx', '0deg');
        card.style.setProperty('--mry', '0deg');
        if (player) { player.style.setProperty('--px', '0px'); player.style.setProperty('--py', '0px'); }
      });
      // Clic = lance LE mode de CETTE carte (et la met au centre visuellement)
      hit.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (activeIdx !== i) { activeIdx = i; applyCoverflow(); }
        previewedMode = order[i];
        routeMode(order[i], { scroll: true });
      });
    });

    // Clic hors cartes (zones latérales du bento) : navigue
    bento.addEventListener('click', (ev) => {
      if (ev.target.closest('.mc-inner')) return;     // géré par la carte
      const r = bento.getBoundingClientRect();
      const dx = ev.clientX - (r.left + r.width / 2);
      if (dx < 0 && activeIdx > 0) { activeIdx--; applyCoverflow(); }
      else if (dx > 0 && activeIdx < cards.length - 1) { activeIdx++; applyCoverflow(); }
    });

    // Flèches clavier pour naviguer
    bento.setAttribute('tabindex', '0');
    bento.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowLeft' && activeIdx > 0) { activeIdx--; applyCoverflow(); }
      if (ev.key === 'ArrowRight' && activeIdx < cards.length - 1) { activeIdx++; applyCoverflow(); }
      if (ev.key === 'Enter') routeMode(order[activeIdx]);
    });
  }

  // Mosaïque : 3 lignes de photos qui défilent (sens alternés).
  // Source = mes 53 photos (MOSAIC_IMAGES), randomisées, AUCUN doublon entre
  // les lignes (chaque photo n'apparaît que dans une seule ligne).
  function buildHeroMosaic() {
    const rows = [
      document.querySelector('.hm-row.r1'),
      document.querySelector('.hm-row.r2'),
      document.querySelector('.hm-row.r3'),
    ].filter(Boolean);
    if (!rows.length) return;

    // Source images
    let images;
    if (window.MOSAIC_IMAGES && window.MOSAIC_IMAGES.length) {
      images = window.MOSAIC_IMAGES.slice();
    } else {
      images = (window.PLAYERS || []).slice()
        .filter(p => window.photoUrl && window.photoUrl(p))
        .sort((a, b) => (b.value || 0) - (a.value || 0))
        .slice(0, 36).map(p => window.photoUrl(p));
    }
    // Mélange aléatoire (Fisher-Yates avec Math.random pour un ordre différent
    // à chaque chargement → évite les clusters de même club)
    for (let i = images.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [images[i], images[j]] = [images[j], images[i]];
    }

    // Répartition SANS chevauchement : chaque ligne reçoit un tiers distinct
    const per = Math.floor(images.length / rows.length);
    rows.forEach((row, ri) => {
      const slice = images.slice(ri * per, ri * per + per);
      // ×2 pour boucle continue (seam) — duplication interne à la ligne
      slice.concat(slice).forEach(src => {
        const card = el('div', { class: 'hm-card' });
        const img = new Image();
        img.src = src;
        img.loading = 'lazy'; img.decoding = 'async';
        img.referrerPolicy = 'no-referrer';
        card.appendChild(img);
        row.appendChild(card);
      });
    });
  }

  function squadSize() { return state.fiveMode ? 5 : 11; }
  function routeMode(mode, opts) {
    opts = opts || {};
    // ===== Pas de redirection vers d'autres pages =====
    state.activeMode = mode;
    document.body.setAttribute('data-mode', mode);
    // Theming couleur global persistant (boutons, accents, logo)
    document.body.classList.remove('mode-hover-five','mode-hover-draft','mode-hover-juste','mode-hover-under','mode-hover-guess');
    document.body.classList.add('mode-hover-' + mode);

    if (mode === 'draft') {
      state.fiveMode = false;
      state.justeMode = false;
      refreshFormationDropdown();
      renderParticipants();          // rebuild les selects avec formations 11v11
      showModeSetup('draft');
    } else if (mode === 'five') {
      state.fiveMode = true;
      state.justeMode = false;
      refreshFormationDropdown();
      renderParticipants();          // rebuild les selects avec formations 5v5
      const budget = $('#budgetInput'); if (budget) budget.value = '120';
      showModeSetup('five');
    } else if (mode === 'juste') {
      state.fiveMode = false;
      state.justeMode = true;
      showModeSetup('juste');
    } else if (mode === 'guess') {
      state.fiveMode = false;
      state.justeMode = false;
      state.guessMode = true;
      state.underMode = false;
      showModeSetup('guess');
    } else if (mode === 'under') {
      state.fiveMode = false;
      state.justeMode = false;
      state.guessMode = false;
      state.underMode = true;
      showModeSetup('under');
    }

    // Scroll seulement au CLIC (pas au survol-préview)
    if (opts.scroll !== false) {
      requestAnimationFrame(() => {
        $('#setupSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  function showModeSetup(mode) {
    // Affiche le bon panel setup selon le mode
    const draftPanel = $('#setupDraftPanel');
    const justePanel = $('#setupJustePanel');
    const guessPanel = $('#setupGuessPanel');
    const underPanel = $('#setupUnderPanel');
    if (draftPanel) draftPanel.style.display = (mode === 'draft' || mode === 'five') ? '' : 'none';
    if (justePanel) justePanel.style.display = (mode === 'juste') ? '' : 'none';
    if (guessPanel) guessPanel.style.display = (mode === 'guess') ? '' : 'none';
    if (underPanel) underPanel.style.display = (mode === 'under') ? '' : 'none';

    // Eyebrow + titre adaptés
    const eyebrow = $('#setupEyebrow');
    const title = $('#setupTitle');
    if (eyebrow && title) {
      const titles = {
        five:  { eb: '/ MODE FIVE · 5 vs 5',           t: 'Compose ton 5' },
        juste: { eb: '/ JUSTE PRIX · Estimation',      t: 'Choisis ta variante' },
        guess: { eb: '/ GUESS THE TEAM · Devine',      t: 'Choisis ton défi' },
        under: { eb: '/ UNDERCOVER FOOT · Bluff',      t: 'Salon de jeu' },
        draft: { eb: '/ MODE DRAFT · Snake draft',     t: 'Compose, simule, analyse' },
      };
      const t = titles[mode] || titles.draft;
      eyebrow.textContent = t.eb;
      title.textContent = t.t;
    }
  }

  function refreshFormationDropdown() {
    // Bascule le contenu de FORMATIONS sans casser les références — TOUJOURS,
    // même sans dropdown global (#formationSelect a été retiré du HTML ;
    // l'early-return d'avant laissait Five en formations 11v11).
    applyFormationSet(state.fiveMode ? window.FIVE_FORMATIONS : window.FORMATIONS_11);
    const sel = $('#formationSelect');
    if (!sel) return;
    const FORMS = state.fiveMode ? (window.FIVE_FORMATIONS || {}) : (window.FORMATIONS_11 || window.FORMATIONS);
    sel.innerHTML = '';
    Object.keys(FORMS).forEach((k, i) => {
      const opt = el('option', { value: k }, FORMS[k].label);
      if (i === 0) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  // ============================================================
  // SETUP
  // ============================================================
  const ALL_LEAGUES = Array.from(new Set(PLAYERS.map(p => p.league))).sort();

  // Nations de la Coupe du Monde 2026 (hôtes + qualifiées)
  const WC_NATIONS = new Set([
    'USA','United States','Canada','Mexico',
    'Argentina','Brazil','Ecuador','Colombia','Uruguay','Paraguay',
    'France','Spain','England','Germany','Portugal','Netherlands','Belgium',
    'Croatia','Italy','Norway','Scotland','Austria','Switzerland','Türkiye','Turkey',
    'Denmark','Poland','Czech Republic','Czechia','Ukraine','Wales','Slovakia','Slovenia',
    'Morocco','Senegal','Egypt','Algeria','Tunisia',"Côte d'Ivoire",'Ivory Coast',
    'Ghana','Cape Verde','South Africa','Nigeria','Cameroon',
    'Japan','South Korea','Korea Republic','Iran','Australia','Saudi Arabia',
    'Qatar','Uzbekistan','Jordan','Iraq','New Zealand',
    'Panama','Costa Rica','Haiti','Curacao','Jamaica','Honduras',
  ]);
  // Filtre de pool central : Coupe du Monde → nation qualifiée,
  // sinon → championnat activé.
  function inDraftPool(p) {
    return state.wcMode ? WC_NATIONS.has(p.nat) : state.leagues.has(p.league);
  }

  // Top 5 leagues activés par défaut (UX clearer que tout activé)
  const TOP5_LEAGUES = ['Premier League', 'La Liga', 'Bundesliga', 'Serie A', 'Ligue 1'];

  function updateLeagueCounter() {
    const lbl = $('#leagueCounter');
    if (lbl) lbl.textContent = state.leagues.size + ' / ' + ALL_LEAGUES.length + ' championnats actifs';
  }

  function bindSetup() {
    // Type de draft : classique / Coupe du Monde
    $$('#draftType .dt-box').forEach(b => {
      b.addEventListener('click', () => {
        $$('#draftType .dt-box').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        state.wcMode = b.dataset.dtype === 'wc';
        // En mode CdM : championnats + mode club n'ont plus de sens → grisés
        document.body.classList.toggle('wc-mode', state.wcMode);
      });
    });

    // Segmented buttons
    function bindSeg(id, key, type) {
      $(id).addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        $(id).querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        let val = btn.dataset.val;
        if (type === 'number') val = Number(val);
        else if (type === 'bool') val = val === '1';
        // 'string' → laisser tel quel
        state[key] = val;
        if (id === '#segPlayers') renderParticipants();
      });
    }
    bindSeg('#segPlayers', 'nbPlayers', 'number');
    bindSeg('#segTimer',   'timerSec',  'number');
    bindSeg('#segGamble',  'gamble',    'bool');
    bindSeg('#segOnePerClub', 'onePerClub', 'bool');

    // Toggle dataset (4 options : real / legends / naruto / animals)
    const segDataset = $('#segDataset');
    if (segDataset) {
      segDataset.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        segDataset.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const key = btn.dataset.val;
        const ds = DATASETS[key] || DATASETS.real;
        PLAYERS = ds.data;
        state.dataset = key;
        const chipsWrap = $('#leagueChips');
        if (ds.league) {
          // Mode thématique : forcer la ligue unique
          state.leagues = new Set([ds.league]);
          if (chipsWrap) chipsWrap.querySelectorAll('button[data-league]').forEach(b => b.classList.remove('active'));
          $('#leagueCounter') && ($('#leagueCounter').textContent = `Mode ${ds.label} : ${ds.data.length} personnages`);
        } else {
          state.leagues = new Set(TOP5_LEAGUES);
          if (chipsWrap) chipsWrap.querySelectorAll('button[data-league]').forEach(b => {
            if (TOP5_LEAGUES.includes(b.dataset.league)) b.classList.add('active');
            else b.classList.remove('active');
          });
          updateLeagueCounter();
        }
        const note = $('#datasetNote');
        if (note) note.textContent = ds.league
          ? `Mode ${ds.label} : ${ds.data.length} personnages, valeurs estimées`
          : `${REAL_PLAYERS.length} joueurs · données Transfermarkt saison 2025-26 · valeurs en temps réel`;
      });
    }

    // (Analyse IA / clé Cloudflare supprimée — moteur déterministe intégré)

    // Mode Club : segment + select
    const segClubMode = $('#segClubMode');
    if (segClubMode) {
      segClubMode.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        segClubMode.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.clubModeFormer = btn.dataset.val === 'passe';
      });
    }
    const clubSel = $('#clubModeSelect');
    if (clubSel) {
      // Populer avec tous les clubs distincts (uniquement ceux des ligues actives au boot)
      const allClubs = new Set();
      PLAYERS.forEach(p => {
        allClubs.add(p.club);
        (p.former || []).forEach(c => allClubs.add(c));
      });
      const sorted = Array.from(allClubs).sort();
      sorted.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c; opt.textContent = c;
        clubSel.appendChild(opt);
      });
      clubSel.addEventListener('change', () => {
        state.clubMode = clubSel.value;
        $('#clubModeLabel').textContent = clubSel.value || 'Désactivé';
      });
    }

    // Age slider
    const ageSlider = $('#ageSlider');
    if (ageSlider) {
      const setAge = () => {
        const v = +ageSlider.value;
        state.ageSlider = v;
        const min = +ageSlider.min, max = +ageSlider.max;
        ageSlider.style.setProperty('--p', ((v - min) / (max - min) * 100) + '%');
        $('#ageSliderVal').textContent = AGE_LABELS[v];
        $('#ageLabel').textContent = AGE_LABELS[v];
      };
      ageSlider.addEventListener('input', setAge);
      setAge();
    }

    // Budget slider
    const slider = $('#budgetSlider');
    const setSliderProgress = () => {
      const min = +slider.min, max = +slider.max, val = +slider.value;
      slider.style.setProperty('--p', ((val - min) / (max - min) * 100) + '%');
      $('#budgetVal').textContent = val;
      state.budget = val;
    };
    slider.addEventListener('input', setSliderProgress);
    setSliderProgress();

    // League chips multi-select : Top 5 ON par défaut (clearer)
    const chipsWrap = $('#leagueChips');
    state.leagues = new Set(TOP5_LEAGUES);

    // Preset buttons
    const top5Chip = el('button', { class: 'chip chip-preset', type: 'button', title: 'Top 5 européens' }, '★ TOP 5');
    top5Chip.addEventListener('click', () => {
      state.leagues = new Set(TOP5_LEAGUES);
      refreshChipStates();
    });
    const allChip = el('button', { class: 'chip chip-preset', type: 'button', title: 'Tous les championnats' }, '⊞ TOUS');
    allChip.addEventListener('click', () => {
      state.leagues = new Set(ALL_LEAGUES);
      refreshChipStates();
    });
    const noneChip = el('button', { class: 'chip chip-preset', type: 'button', title: 'Aucun (choisis manuellement)' }, '✗ AUCUN');
    noneChip.addEventListener('click', () => {
      state.leagues.clear();
      refreshChipStates();
    });
    chipsWrap.appendChild(top5Chip);
    chipsWrap.appendChild(allChip);
    chipsWrap.appendChild(noneChip);

    // Logos/drapeaux par championnat (emoji léger, pas de fetch externe)
    const LEAGUE_LOGOS = {
      'Premier League':   '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
      'La Liga':          '🇪🇸',
      'Bundesliga':       '🇩🇪',
      'Serie A':          '🇮🇹',
      'Ligue 1':          '🇫🇷',
      'Eredivisie':       '🇳🇱',
      'Saudi Pro League': '🇸🇦',
      'Süper Lig':        '🇹🇷',
    };

    // Chips individuels avec logos
    ALL_LEAGUES.forEach(l => {
      const count = PLAYERS.filter(p => p.league === l).length;
      const cls = 'chip chip-league' + (state.leagues.has(l) ? ' active' : '');
      const chip = el('button', { class: cls, 'data-league': l, type: 'button', title: count + ' joueurs' });
      chip.appendChild(el('span', { class: 'chip-logo' }, LEAGUE_LOGOS[l] || '⚽'));
      chip.appendChild(el('span', { class: 'chip-name' }, l));
      chip.appendChild(el('span', { class: 'chip-count' }, '' + count));
      chip.addEventListener('click', () => {
        if (state.leagues.has(l)) {
          state.leagues.delete(l);
          chip.classList.remove('active');
        } else {
          state.leagues.add(l);
          chip.classList.add('active');
        }
        updateLeagueCounter();
      });
      chipsWrap.appendChild(chip);
    });
    updateLeagueCounter();

    function refreshChipStates() {
      chipsWrap.querySelectorAll('button[data-league]').forEach(b => {
        if (state.leagues.has(b.dataset.league)) b.classList.add('active');
        else b.classList.remove('active');
      });
      updateLeagueCounter();
    }
  }

  function renderParticipants() {
    const list = $('#participantsList');
    list.innerHTML = '';
    const defaults = ['Alex', 'Jordan', 'Sam', 'Charlie'];
    for (let i = 0; i < state.nbPlayers; i++) {
      const grad = TEAM_COLORS[i].grad;
      const select = el('select', { 'data-pidx': i });
      Object.keys(FORMATIONS).forEach((f, idx) => {
        const opt = el('option', { value: f }, FORMATIONS[f].label);
        if (idx === 0) opt.setAttribute('selected', '');
        select.appendChild(opt);
      });
      const preview = el('div', { class: 'preview', 'data-preview': i });
      const row = el('div', { class: 'participant' },
        el('div', { class: 'participant-avatar', style: `background:${grad}` }, `J${i+1}`),
        el('input', { type: 'text', value: defaults[i], 'data-pidx': i, placeholder: 'Pseudo' }),
        select,
        preview,
      );
      list.appendChild(row);
      // Render preview initial + on change
      const renderPrev = () => renderFormationPreview(preview, select.value);
      renderPrev();
      select.addEventListener('change', renderPrev);
    }
  }

  function renderFormationPreview(mountEl, formation) {
    const F = FORMATIONS[formation];
    if (!F) return;
    mountEl.innerHTML = '';
    F.slots.forEach(slot => {
      const dot = el('div', { class: 'dot', style: `left:${slot.x}%; top:${slot.y}%` });
      mountEl.appendChild(dot);
    });
  }

  // ============================================================
  // INIT GAME
  // ============================================================
  function startGame() {
    if (state.leagues.size === 0) {
      toast('Aucun championnat sélectionné', 'Active au moins un championnat dans la configuration.');
      return;
    }

    const inputs = $$('#participantsList input');
    const selects = $$('#participantsList select');
    state.participants = [];
    state.takenIds = new Set();

    for (let i = 0; i < state.nbPlayers; i++) {
      const name = (inputs[i].value || `Joueur ${i+1}`).trim().slice(0, 24) || `Joueur ${i+1}`;
      const formation = selects[i].value;
      const slots = {};
      FORMATIONS[formation].slots.forEach(s => slots[s.id] = null);
      state.participants.push({
        id: 'p' + i,
        name,
        formation,
        color: TEAM_COLORS[i],
        slots,
        spent: 0,
      });
    }

    state.order = shuffleIndexes(state.nbPlayers);
    state.round = 1;
    state.pickIndex = 1;
    state.skipped = [];
    state.gambleUsed = false;

    showScreen('draft');
    state.currentParticipant = state.participants[state.order[0]];
    renderAll();
    startTimer();
  }

  function shuffleIndexes(n) {
    const arr = Array.from({length: n}, (_, i) => i);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function showScreen(name) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    $('#screen-' + name).classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ============================================================
  // RENDER
  // ============================================================
  function renderAll() {
    renderHeader();
    renderMyTeam();
    renderOpponents();
  }

  function renderHeader() {
    const cur = state.currentParticipant;
    if (!cur) return;
    $('#turnName').textContent = cur.name;
    $('#turnRound').textContent = `Round ${Math.min(state.round, squadSize())} / ${squadSize()}`;
    $('#turnPickIndex').textContent = `Pick ${state.pickIndex}`;

    const olist = $('#orderList');
    olist.innerHTML = '';
    state.order.forEach(idx => {
      const p = state.participants[idx];
      const cls = ['order-pill'];
      if (p.id === cur.id) cls.push('current');
      olist.appendChild(el('span', { class: cls.join(' ') }, p.name));
    });
    state.skipped.forEach(s => {
      const p = state.participants.find(pp => pp.id === s.participantId);
      olist.appendChild(el('span', { class: 'order-pill skipped', title: 'Doit piocher plus tard' }, p.name + ' (rattrapage)'));
    });
  }

  function renderMyTeam() {
    const cur = state.currentParticipant;
    if (!cur) return;
    $('#myTeamTitle').textContent = cur.name;
    const remaining = state.budget - cur.spent;
    $('#budgetRem').textContent = remaining.toFixed(0);
    $('#budgetTot').textContent = state.budget;
    const pct = Math.max(0, (remaining / state.budget) * 100);
    $('#budgetBar').style.width = pct + '%';
    const filled = Object.values(cur.slots).filter(Boolean).length;
    $('#picksLeft').textContent = 11 - filled;

    renderPitch(cur, $('#myPitch'), { interactive: true });

    // Pitch hint
    const hint = $('#pitchHint');
    if (hint) {
      const remPicks = 11 - filled;
      hint.textContent = remPicks === 0
        ? '/ Tous tes postes sont remplis'
        : '/ Clique sur un poste pour piocher un joueur (' + remPicks + ' restant·s)';
    }
  }

  function renderOpponents() {
    const wrap = $('#opponentsList');
    if (!wrap) return;
    wrap.innerHTML = '';
    // En local : tous sauf le current. En online : tous sauf moi.
    const others = state.mode === 'online'
      ? state.participants.filter(p => !p.isMe)
      : state.participants.filter(p => p.id !== state.currentParticipant?.id);
    others.forEach(p => {
      const isCurrent = state.currentParticipant && p.id === state.currentParticipant.id;
      const card = el('div', { class: 'opp-card-pitch glow' + (isCurrent ? ' is-current' : '') });
      const filled = Object.values(p.slots).filter(Boolean).length;
      // Header
      const head = el('div', { class: 'opp-head' });
      head.appendChild(el('div', { class: 'opp-avatar', style: `background:${p.color.grad}` }, initials(p.name)));
      const info = el('div', { class: 'opp-info' });
      info.appendChild(el('div', { class: 'opp-name' }, p.name));
      info.appendChild(el('div', { class: 'opp-meta' },
        `${FORMATIONS[p.formation].label} · ${filled}/${squadSize()} · ${p.spent.toFixed(0)} M€`));
      head.appendChild(info);
      card.appendChild(head);
      // Mini pitch
      const pitch = el('div', { class: 'pitch pitch-mini' });
      const wrapPitch = el('div', { class: 'pitch-wrap' }, pitch);
      card.appendChild(wrapPitch);
      wrap.appendChild(card);
      renderPitch(p, pitch, { interactive: false, mini: true });
    });
  }

  // Index global sur TOUS les datasets (réels + légendes + naruto + animaux)
  // → permet de retrouver un joueur drafté quel que soit le mode actif
  const ALL_INDEX = (() => {
    const map = new Map();
    [REAL_PLAYERS, LEGENDS, NARUTO, ANIMALS].forEach(ds => {
      (ds || []).forEach(p => { if (p && p.id) map.set(p.id, p); });
    });
    return map;
  })();
  const playerById = (id) => ALL_INDEX.get(id);

  function appendPitchFeatures(mountEl) {
    // Surfaces + petites surfaces + points pen + arcs de coin + rond central
    mountEl.appendChild(el('div', { class: 'pitch-features' }));
    mountEl.appendChild(el('div', { class: 'pitch-features-inner' }));
    mountEl.appendChild(el('div', { class: 'pitch-pen top' }));
    mountEl.appendChild(el('div', { class: 'pitch-pen bot' }));
    mountEl.appendChild(el('div', { class: 'pitch-corner tl' }));
    mountEl.appendChild(el('div', { class: 'pitch-corner tr' }));
    mountEl.appendChild(el('div', { class: 'pitch-corner bl' }));
    mountEl.appendChild(el('div', { class: 'pitch-corner br' }));
    mountEl.appendChild(el('div', { class: 'pitch-circle' }));
  }

  function renderPitch(participant, mountEl, opts) {
    opts = opts || {};
    const F = FORMATIONS[participant.formation];
    mountEl.innerHTML = '';
    appendPitchFeatures(mountEl);
    F.slots.forEach(slot => {
      const filledId = participant.slots[slot.id];
      const filledP = filledId ? playerById(filledId) : null;
      const slotEl = el('div', {
        class: 'slot' + (filledP ? ' filled' : ''),
        style: `left:${slot.x}%; top:${slot.y}%`,
        title: filledP ? `${filledP.name} (${filledP.positions.join('/')})` : slot.type,
        'data-sid': slot.id,
      });
      const bubble = el('div', { class: 'slot-bubble' });
      if (filledP) {
        const ph = el('div', {
          class: 'slot-photo',
          style: `background:${gradientFor(filledP)}`,
        });
        attachPhoto(ph, filledP, 'slot-photo-img');
        ph.appendChild(el('span', { class: 'slot-photo-fb' }, initials(filledP)));
        bubble.appendChild(ph);
      } else {
        bubble.appendChild(el('span', {}, slot.type));
      }
      slotEl.appendChild(bubble);
      slotEl.appendChild(el('div', { class: 'slot-name' },
        filledP
          ? filledP.name.split(' ').slice(-1)[0].toUpperCase() + ' · ' + filledP.value + 'M'
          : slot.type));
      // Click → ouvrir picker (slot vide) ou modal swap (slot rempli)
      const handler = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (!filledP) {
          if (opts.interactive) {
            openPicker(slot);
          } else if (state.mode === 'online') {
            const cur = state.currentParticipant;
            const whose = cur ? cur.name : 'quelqu\'un';
            toast('Patience…', `C'est au tour de ${whose} de drafter. À ton tour bientôt.`);
          }
        } else if (opts.interactive && opts.allowSwap !== false) {
          openSwapPicker(participant, slot, filledP);
        }
      };
      slotEl.addEventListener('click', handler);
      slotEl.style.cursor = (opts.interactive || (filledP && opts.allowSwap !== false)) ? 'pointer' : 'default';

      // Drag-to-swap : maintenir un joueur rempli et le lâcher sur un autre
      if (filledP && opts.interactive && opts.allowSwap !== false) {
        slotEl.classList.add('slot-draggable');
        enableDragSwap(slotEl, mountEl, participant, slot, filledP);
      }
      mountEl.appendChild(slotEl);
    });
  }

  // Drag & drop par maintien (pointer events, marche tactile + souris)
  function enableDragSwap(slotEl, mountEl, participant, slot, player) {
    slotEl.addEventListener('pointerdown', (ev) => {
      if (ev.button !== undefined && ev.button !== 0) return;
      const startX = ev.clientX, startY = ev.clientY;
      let dragging = false, ghost = null;
      const onMove = (e) => {
        const dx = e.clientX - startX, dy = e.clientY - startY;
        if (!dragging && Math.hypot(dx, dy) > 9) {
          dragging = true;
          slotEl.classList.add('slot-dragging');
          ghost = buildDragGhost(player, e.clientX, e.clientY);
        }
        if (dragging) {
          if (ghost) { ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px'; }
          highlightDropTarget(mountEl, slotEl, e.clientX, e.clientY, participant, slot);
        }
      };
      const onUp = (e) => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        if (!dragging) return; // simple clic → géré par 'click'
        slotEl.classList.remove('slot-dragging');
        if (ghost) ghost.remove();
        const tgt = dropTargetAt(mountEl, e.clientX, e.clientY);
        clearDropHighlights(mountEl);
        if (tgt && tgt !== slotEl) {
          attemptDragSwap(participant, slot.id, tgt.dataset.sid);
        }
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  }

  function buildDragGhost(player, x, y) {
    const g = el('div', { class: 'drag-ghost' });
    const ph = el('div', { class: 'dg-photo', style: `background:${gradientFor(player)}` });
    attachPhoto(ph, player, 'dg-img');
    ph.appendChild(el('span', {}, initials(player)));
    g.appendChild(ph);
    g.appendChild(el('div', { class: 'dg-name' }, player.name.split(' ').slice(-1)[0]));
    g.style.left = x + 'px'; g.style.top = y + 'px';
    document.body.appendChild(g);
    return g;
  }

  function dropTargetAt(mountEl, x, y) {
    const els = document.elementsFromPoint(x, y);
    for (const e of els) {
      const s = e.closest && e.closest('.slot');
      if (s && mountEl.contains(s)) return s;
    }
    return null;
  }

  function highlightDropTarget(mountEl, sourceEl, x, y, participant, sourceSlot) {
    clearDropHighlights(mountEl);
    const tgt = dropTargetAt(mountEl, x, y);
    if (!tgt || tgt === sourceEl) return;
    const ok = swapValid(participant, sourceSlot.id, tgt.dataset.sid);
    tgt.classList.add(ok ? 'drop-ok' : 'drop-no');
  }
  function clearDropHighlights(mountEl) {
    mountEl.querySelectorAll('.drop-ok, .drop-no').forEach(s => s.classList.remove('drop-ok', 'drop-no'));
  }

  function swapValid(participant, srcSid, tgtSid) {
    if (srcSid === tgtSid) return false;
    const F = FORMATIONS[participant.formation];
    const srcSlot = F.slots.find(s => s.id === srcSid);
    const tgtSlot = F.slots.find(s => s.id === tgtSid);
    if (!srcSlot || !tgtSlot) return false;
    const srcPl = playerById(participant.slots[srcSid]);
    const tgtPl = participant.slots[tgtSid] ? playerById(participant.slots[tgtSid]) : null;
    if (!srcPl) return false;
    // src joueur doit pouvoir jouer au poste cible
    const srcOk = slotMatch(srcPl, tgtSlot.type) !== null;
    // si cible occupée, ce joueur doit pouvoir jouer au poste source
    const tgtOk = !tgtPl || slotMatch(tgtPl, srcSlot.type) !== null;
    return srcOk && tgtOk;
  }

  function attemptDragSwap(participant, srcSid, tgtSid) {
    if (!swapValid(participant, srcSid, tgtSid)) {
      const tgtPl = participant.slots[tgtSid] ? playerById(participant.slots[tgtSid]) : null;
      toast('Échange impossible', tgtPl
        ? `Postes incompatibles entre ces deux joueurs.`
        : `Ce joueur ne peut pas jouer à ce poste.`);
      return;
    }
    const a = participant.slots[srcSid];
    participant.slots[srcSid] = participant.slots[tgtSid];
    participant.slots[tgtSid] = a;
    if (state.mode === 'online') {
      if (state.online.isHost) { Online.state.slots[participant.id] = participant.slots; Online.broadcastState(); }
      renderMyTeamForMeOnline(); renderOpponentsOnline();
    } else {
      renderMyTeam(); renderOpponents();
    }
  }

  function renderAllPitches() {
    const wrap = $('#allPitches');
    wrap.innerHTML = '';
    state.participants.forEach(p => {
      const card = el('div', {
        class: 'mini-pitch-card' + (p.id === state.currentParticipant?.id ? ' is-current' : ''),
      });
      const filled = Object.values(p.slots).filter(Boolean).length;
      card.appendChild(el('h4', {}, p.name));
      card.appendChild(el('div', { class: 'meta' },
        `${FORMATIONS[p.formation].label} · ${filled}/${squadSize()} · ${p.spent.toFixed(0)} M€`));
      const pitch = el('div', { class: 'pitch' });
      const wrapPitch = el('div', { class: 'pitch-wrap' }, pitch);
      card.appendChild(wrapPitch);
      wrap.appendChild(card);
      renderPitch(p, pitch);
    });
  }

  // ============================================================
  // PICKER (slot-based)
  // ============================================================
  let pickerState = {
    slot: null,
    search: '',
    age: 'all',
    league: '',
    club: '',
    affordable: true,
  };
  let renderToken = 0;

  function openSlotsForParticipant(p) {
    return FORMATIONS[p.formation].slots.filter(s => !p.slots[s.id]);
  }

  // Helper central : retourne 'main' (poste naturel), 'sec' (poste secondaire,
  // joueur reste éligible mais avec un malus dans la sim), ou null (impossible).
  function slotMatch(player, slotType) {
    if (!player) return null;
    const accepted = SLOT_RULES[slotType] || [];
    const main = player.posMain || (player.positions || []).slice(0, 1);
    const sec  = player.posSec  || (player.positions || []).slice(1);
    if (main.some(p => accepted.includes(p))) return 'main';
    if (sec.some(p => accepted.includes(p)))  return 'sec';
    return null;
  }
  // expose pour les autres modules
  window.slotMatch = slotMatch;

  function eligibleSlotsFor(player, participant) {
    return openSlotsForParticipant(participant).filter(slot => slotMatch(player, slot.type) !== null);
  }

  // Modal d'échange : pour un slot rempli, propose les autres slots où on
  // peut le déplacer (+ swap avec un autre joueur déjà placé)
  function openSwapPicker(participant, sourceSlot, sourcePlayer) {
    const F = FORMATIONS[participant.formation];
    // Slots cibles : tout slot DIFFÉRENT où sourcePlayer peut jouer
    const targets = F.slots.filter(s => s.id !== sourceSlot.id &&
      slotMatch(sourcePlayer, s.type) !== null
    );
    if (targets.length === 0) {
      return toast('Pas d\'échange possible', `${sourcePlayer.name} ne peut jouer qu'au poste ${sourceSlot.type}.`);
    }

    $('#pickerEyebrow').textContent = '/ ÉCHANGE · DÉPLACER ' + sourcePlayer.name.toUpperCase();
    $('#pickerTitle').textContent = `Déplacer ${sourcePlayer.name} (${sourceSlot.type})`;

    // Reset filtres
    $('#pickerSearch').value = '';
    $('#pickerSearch').placeholder = 'Rechercher un slot ou un joueur...';
    pickerState.target = 'swap';
    pickerState.swapSource = { participant, sourceSlot, sourcePlayer };

    // Construire la liste : pour chaque slot cible, montrer le slot vide ou le joueur à swap
    const grid = $('#pickerGrid');
    grid.innerHTML = '';
    $('#pickerStats').textContent = `${targets.length} POSTES COMPATIBLES`;

    targets.forEach(target => {
      const occupantId = participant.slots[target.id];
      const occupant = occupantId ? playerById(occupantId) : null;
      // Si occupant existe, on doit aussi vérifier qu'il peut jouer au slot source
      if (occupant) {
        const canSwap = slotMatch(occupant, sourceSlot.type) !== null;
        if (!canSwap) return; // ce swap n'est pas valide
      }
      const row = el('div', { class: 'player-row glow' });
      // Avatar : poste cible
      const photo = el('div', { class: 'pr-photo', style: `background: var(--surface-2)` });
      photo.appendChild(el('span', {}, target.type));
      row.appendChild(photo);
      const info = el('div', { class: 'pr-info' });
      info.appendChild(el('div', { class: 'pr-name' }, 'POSTE ' + target.type));
      const meta = el('div', { class: 'pr-meta' });
      if (occupant) {
        meta.appendChild(el('span', { class: 'club' }, '⇄ Échanger avec ' + occupant.name));
      } else {
        meta.appendChild(el('span', { class: 'club' }, 'Slot libre'));
      }
      info.appendChild(meta);
      row.appendChild(info);
      const action = el('div', { class: 'pr-price' }, occupant ? '⇄' : '→');
      row.appendChild(action);
      row.addEventListener('click', () => performSwap(participant, sourceSlot, target));
      grid.appendChild(row);
    });

    if (grid.children.length === 0) {
      grid.appendChild(el('div', { class: 'muted', style: 'padding:20px;text-align:center' }, 'Aucun échange possible : aucun autre joueur de l\'équipe ne peut jouer à ce poste.'));
    }
    // Hide les filtres pendant un swap
    $('.picker-toolbar').style.display = 'none';
    openModal('#modalPicker');
  }

  function performSwap(participant, sourceSlot, targetSlot) {
    const sourceId = participant.slots[sourceSlot.id];
    const targetId = participant.slots[targetSlot.id];
    participant.slots[sourceSlot.id] = targetId;
    participant.slots[targetSlot.id] = sourceId;
    closeModal('#modalPicker');
    $('.picker-toolbar').style.display = ''; // restore for next time
    // Re-render the pitch
    if (state.mode === 'online') {
      // En online, broadcast l'état modifié si je suis l'hôte
      if (state.online.isHost) {
        Online.state.slots[participant.id] = participant.slots;
        Online.broadcastState();
      }
      renderMyTeamForMeOnline();
      renderOpponentsOnline();
    } else {
      renderMyTeam();
      renderOpponents();
    }
  }

  // Postes longs FR pour titre du picker
  const POS_LABEL_FR = {
    GK: 'Gardien', CB: 'Défenseur central', LB: 'Latéral gauche', RB: 'Latéral droit',
    DM: 'Milieu défensif', CM: 'Milieu central', AM: 'Milieu offensif',
    LW: 'Ailier gauche', RW: 'Ailier droit', SS: 'Second attaquant',
    CF: 'Avant-centre', ST: 'Buteur',
  };

  function openPicker(slot) {
    pickerState.slot = slot;
    pickerState.target = 'slot';
    pickerState.acceptedPositionsOverride = null;
    pickerState.search = '';
    pickerState.age = 'all';
    pickerState.league = '';
    pickerState.club = '';
    pickerState.affordable = true;
    // Restore toolbar (caché par swap picker)
    const toolbar = $('.picker-toolbar');
    if (toolbar) toolbar.style.display = '';
    const search = $('#pickerSearch');
    if (search) search.placeholder = 'Rechercher un joueur...';

    const cur = state.currentParticipant;
    const filled = Object.values(cur.slots).filter(Boolean).length;
    $('#pickerEyebrow').textContent = `/ POSTE ${slot.type} · ${filled} / ${squadSize()} picks faits`;
    $('#pickerTitle').textContent = `Choisir un ${POS_LABEL_FR[slot.type] || slot.type}`;

    // Reset UI
    $('#pickerSearch').value = '';
    $$('#pickerAge .chip').forEach(c => c.classList.remove('active'));
    $$('#pickerAge .chip')[0].classList.add('active');
    $('#pickerAffordable').checked = true;

    // League/Club selects scoped to allowed leagues + accepted positions
    const accepted = SLOT_RULES[slot.type];
    const candidates = PLAYERS.filter(p =>
      inDraftPool(p) &&
      !state.takenIds.has(p.id) &&
      p.positions.some(pos => accepted.includes(pos))
    );
    const leagues = Array.from(new Set(candidates.map(p => p.league))).sort();
    $('#pickerLeague').innerHTML = '<option value="">Tous championnats</option>' +
      leagues.map(l => `<option>${l}</option>`).join('');
    $('#pickerLeague').value = '';
    const clubsSet = new Set();
    candidates.forEach(p => { clubsSet.add(p.club); (p.former || []).forEach(c => clubsSet.add(c)); });
    const clubs = Array.from(clubsSet).sort();
    $('#pickerClub').innerHTML = '<option value="">Tous clubs</option>' +
      clubs.map(c => `<option>${c}</option>`).join('');
    $('#pickerClub').value = '';

    openModal('#modalPicker');
    setTimeout(() => $('#pickerSearch').focus(), 60);
    renderPicker();
  }

  function pickerCandidates() {
    // En online, le "drafteur" pour l'affordability est toujours MOI
    const cur = state.mode === 'online'
      ? state.participants.find(p => p.isMe)
      : state.currentParticipant;
    const slot = pickerState.slot;
    if (!slot) return [];
    // Override accepted positions (used by shortlist picker = tous les postes ouverts)
    let accepted = pickerState.acceptedPositionsOverride
      ? Array.from(pickerState.acceptedPositionsOverride)
      : SLOT_RULES[slot.type] || [];
    // 1 joueur par club : compter clubs déjà présents dans MON équipe
    let myClubs = null;
    if (state.onePerClub && cur && cur.slots) {
      myClubs = new Set();
      Object.values(cur.slots).forEach(pid => {
        if (pid) {
          const pl = playerById(pid);
          if (pl) myClubs.add(pl.club);
        }
      });
    }

    return PLAYERS.filter(p => {
      // ===== Critères de la draft (verrouillés au setup) =====
      if (state.clubMode) {
        // Filtre par club actuel ou passé
        const inCurrent = p.club === state.clubMode;
        const inFormer = state.clubModeFormer && (p.former || []).includes(state.clubMode);
        if (!inCurrent && !inFormer) return false;
      } else {
        // Filtre championnat (ignoré si mode club actif)
        if (!inDraftPool(p)) return false;
      }
      if (!passesAge(p.age, state.ageSlider)) return false;
      if (state.takenIds.has(p.id)) return false;
      // Règle 1 par club
      if (myClubs && myClubs.has(p.club)) return false;
      // ===== Slot eligibility =====
      if (!p.positions.some(pos => accepted.includes(pos))) return false;
      // ===== Filtres affinés du picker =====
      if (pickerState.search && !normSearch(p.name).includes(pickerState.search)) return false;
      // (chip âge dans le picker affine encore par-dessus le critère draft)
      if (pickerState.age === 'u21' && p.age >= 21) return false;
      if (pickerState.age === 'u25' && p.age >= 25) return false;
      if (pickerState.age === 'o30' && p.age < 30) return false;
      if (pickerState.league && p.league !== pickerState.league) return false;
      if (pickerState.club) {
        const inClub = p.club === pickerState.club || (p.former || []).includes(pickerState.club);
        if (!inClub) return false;
      }
      if (pickerState.affordable && p.value > state.budget - cur.spent) return false;
      return true;
    });
  }

  function renderPicker() {
    const cur = state.currentParticipant;
    const list = pickerCandidates();
    list.sort((a, b) => b.value - a.value);
    const MAX = isMobile ? 80 : 200;
    const visible = list.slice(0, MAX);

    const grid = $('#pickerGrid');
    grid.innerHTML = '';
    const more = list.length > MAX ? ` (TOP ${MAX} AFFICHÉ)` : '';
    $('#pickerStats').textContent = `${list.length} JOUEUR(S) ÉLIGIBLE(S) AU POSTE ${pickerState.slot.type}${more}`;

    const PAGE = 60;
    const myToken = ++renderToken;
    let i = 0;
    function chunk() {
      if (myToken !== renderToken) return;
      const frag = document.createDocumentFragment();
      const end = Math.min(i + PAGE, visible.length);
      for (; i < end; i++) frag.appendChild(buildPlayerRow(visible[i], cur));
      grid.appendChild(frag);
      if (i < visible.length) requestAnimationFrame(chunk);
    }
    chunk();

    if (list.length === 0) {
      grid.appendChild(el('div', { class: 'muted', style: 'padding:20px;text-align:center' }, 'Aucun joueur ne correspond — assouplis les filtres.'));
    }
  }

  // Construit une ligne compacte pour la liste du picker
  function buildPlayerRow(p, cur) {
    const slot = pickerState.slot;
    const matchKind = slot && slot.id !== '_shortlist' ? slotMatch(p, slot.type) : 'main';
    const eligible = matchKind !== null;
    const me = state.mode === 'online' ? state.participants.find(x => x.isMe) : cur;
    const affordable = !me || p.value <= state.budget - me.spent;
    const blocked = !eligible || !affordable;

    const row = el('div', {
      class: 'player-row glow' + (blocked ? ' ineligible' : '') + (matchKind === 'sec' ? ' is-sec' : ''),
      title: !eligible ? 'Mauvais poste pour ce slot' : (!affordable ? 'Hors budget' : (matchKind === 'sec' ? 'Poste secondaire — performera moins bien' : 'Cliquer pour drafter')),
    });
    row.addEventListener('click', () => openConfirmPick(p));

    // Photo
    const photo = el('div', { class: 'pr-photo', style: `background:${gradientFor(p)}` });
    attachPhoto(photo, p, '');
    photo.appendChild(el('span', {}, initials(p)));
    row.appendChild(photo);

    // Info
    const info = el('div', { class: 'pr-info' });
    info.appendChild(el('div', { class: 'pr-name' }, p.name));
    const meta = el('div', { class: 'pr-meta' });
    const mainPos = p.posMain || p.positions.slice(0, 1);
    const secPos  = p.posSec  || p.positions.slice(1);
    mainPos.forEach(pos => {
      const matches = slot && slot.id !== '_shortlist' && (SLOT_RULES[slot.type] || []).includes(pos);
      meta.appendChild(el('span', { class: 'pos pos-main' + (matches ? ' match' : '') }, pos));
    });
    secPos.forEach(pos => {
      const matches = slot && slot.id !== '_shortlist' && (SLOT_RULES[slot.type] || []).includes(pos);
      meta.appendChild(el('span', { class: 'pos pos-sec' + (matches ? ' match' : '') }, pos));
    });
    if (matchKind === 'sec') meta.appendChild(el('span', { class: 'pos-warn' }, '⚠ secondaire'));
    meta.appendChild(el('span', { class: 'age' }, p.age + ' ans'));
    meta.appendChild(el('span', { class: 'club' }, '· ' + p.club));
    info.appendChild(meta);
    row.appendChild(info);

    // Price
    row.appendChild(el('div', { class: 'pr-price' }, p.value + ' M€'));

    return row;
  }

  function bindPicker() {
    $('#pickerSearch').oninput = (e) => { pickerState.search = e.target.value.toLowerCase(); renderPicker(); };
    $('#pickerLeague').onchange = (e) => { pickerState.league = e.target.value; renderPicker(); };
    $('#pickerClub').onchange = (e) => { pickerState.club = e.target.value; renderPicker(); };
    $('#pickerAffordable').onchange = (e) => { pickerState.affordable = e.target.checked; renderPicker(); };
    $('#pickerAge').onclick = (e) => {
      const btn = e.target.closest('.chip'); if (!btn) return;
      $$('#pickerAge .chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      pickerState.age = btn.dataset.age;
      renderPicker();
    };
  }

  function buildPlayerCard(p, cur) {
    const eligible = !cur || eligibleSlotsFor(p, cur).length > 0;
    const affordable = !cur || p.value <= state.budget - cur.spent;
    const blocked = !eligible || !affordable;

    const card = el('div', {
      class: 'player-card' + (blocked ? ' ineligible' : ''),
      title: !eligible ? 'Aucun poste libre' : (!affordable ? 'Hors budget' : 'Cliquer pour drafter'),
    });
    card.addEventListener('click', () => openConfirmPick(p));

    // Photo : Sofascore → Fotmob → Transfermarkt → fallback gradient + initiales
    const photo = el('div', {
      class: 'pc-photo',
      style: `background:${gradientFor(p)}`,
    });
    attachPhoto(photo, p, 'pc-photo-img');
    photo.appendChild(el('span', { class: 'pc-photo-initials' }, initials(p)));

    // Position badges
    const badges = el('div', { class: 'pos-badges' });
    p.positions.forEach(pos => {
      const matches = cur && eligibleSlotsFor(p, cur).some(s => SLOT_RULES[s.type].includes(pos));
      badges.appendChild(el('span', { class: 'pos-badge' + (matches ? ' match' : '') }, pos));
    });
    photo.appendChild(badges);

    // Age badge
    photo.appendChild(el('span', { class: 'age-badge' }, p.age + ' ans'));

    card.appendChild(photo);

    // Body
    const body = el('div', { class: 'pc-body' });
    body.appendChild(el('div', { class: 'pc-name', title: p.name }, p.name));
    body.appendChild(el('div', { class: 'pc-value' }, p.value + ' M€'));
    body.appendChild(el('div', { class: 'pc-club', title: p.club + ' · ' + p.league }, p.club + ' · ' + p.league));
    card.appendChild(body);

    return card;
  }

  // ============================================================
  // CONFIRM PICK
  // ============================================================
  function openConfirmPick(player) {
    // Shortlist picker : on ajoute juste, pas de confirm
    if (pickerState.target === 'shortlist') {
      addToShortlist(player);
      // Pas de fermeture du picker — on peut en ajouter plusieurs
      renderPicker();
      return;
    }

    // En online, le slot a été choisi explicitement (cliqué) → utiliser ce slot
    let cur, eligible;
    if (state.mode === 'online') {
      cur = state.participants.find(p => p.isMe);
      // Slot fixe (le picker a été ouvert pour CE slot)
      const slotDef = pickerState.slot;
      eligible = [slotDef].filter(s =>
        slotMatch(player, s.type) !== null &&
        !cur.slots[s.id]
      );
    } else {
      cur = state.currentParticipant;
      // Si le picker a été ouvert pour un slot précis (clic sur le terrain),
      // on assigne DIRECTEMENT à ce slot (pas de re-question)
      if (pickerState.slot && pickerState.slot.id && pickerState.slot.id !== '_shortlist') {
        const slotDef = pickerState.slot;
        eligible = [slotDef].filter(s =>
          slotMatch(player, s.type) !== null &&
          !cur.slots[s.id]
        );
      } else {
        eligible = eligibleSlotsFor(player, cur);
      }
    }

    if (eligible.length === 0) {
      return toast('Mauvais poste', `${player.name} (${player.positions.join('/')}) ne correspond à aucun slot libre.`);
    }
    if (player.value > state.budget - cur.spent) {
      return toast('Budget dépassé', `Il te reste ${(state.budget - cur.spent).toFixed(0)} M€ et ${player.name} en vaut ${player.value} M€.`);
    }

    if (eligible.length === 1) {
      state.pendingPick = { player, slot: eligible[0] };
      showConfirmModal();
    } else {
      $('#slotPickerSub').textContent = `${player.name} peut occuper plusieurs postes. Choisis :`;
      const wrap = $('#slotOptions');
      wrap.innerHTML = '';
      eligible.forEach(slot => {
        const opt = el('div', { class: 'slot-opt' },
          el('strong', {}, slot.type),
          el('span', {}, 'SLOT ' + slot.id.toUpperCase()));
        opt.addEventListener('click', () => {
          state.pendingPick = { player, slot };
          closeModal('#modalSlot');
          showConfirmModal();
        });
        wrap.appendChild(opt);
      });
      openModal('#modalSlot');
    }
  }

  function showConfirmModal() {
    const { player, slot } = state.pendingPick;
    const cur = state.currentParticipant;
    $('#confirmTitle').textContent = `Drafter ${player.name} ?`;
    const body = $('#confirmBody');
    body.innerHTML = '';
    const summary = el('div', { class: 'confirm-summary' },
      el('div', { class: 'conf-photo', style: `background:${gradientFor(player)}` }, initials(player)),
      el('div', {},
        el('div', { class: 'name' }, player.name),
        el('div', { class: 'sub' }, `${player.club} · ${player.age} ans · ${player.value} M€`)),
    );
    body.appendChild(summary);
    body.appendChild(el('p', { class: 'muted' },
      `Sera placé au poste `, el('strong', {}, slot.type),
      `. Budget restant après : ${(state.budget - cur.spent - player.value).toFixed(0)} M€.`));
    openModal('#modalConfirm');
  }

  function applyPendingPick() {
    const { player, slot } = state.pendingPick;
    state.pendingPick = null;
    closeModal('#modalConfirm');
    closeModal('#modalPicker');

    if (state.mode === 'online') {
      onlinePerformPick(slot.id, player.id);
      removeFromShortlist(player.id);
      return;
    }

    const cur = state.currentParticipant;
    cur.slots[slot.id] = player.id;
    cur.spent += player.value;
    state.takenIds.add(player.id);
    pauseTimer();

    // Reveal animation puis advance
    showPickReveal(player, cur, () => advanceTurn());
  }

  // Animation reveal : 2,5s avec photo grosse + nom + prix + drafteur
  function showPickReveal(player, participant, done) {
    const overlay = el('div', { class: 'pick-reveal-overlay' });
    const card = el('div', { class: 'pick-reveal-card' });
    card.appendChild(el('div', { class: 'pick-reveal-eyebrow' }, '/ DRAFTÉ'));
    const photo = el('div', { class: 'pick-reveal-photo', style: `background:${gradientFor(player)}` });
    attachPhoto(photo, player, '');
    photo.appendChild(el('span', {}, initials(player)));
    card.appendChild(photo);
    card.appendChild(el('div', { class: 'pick-reveal-name' }, player.name));
    card.appendChild(el('div', { class: 'pick-reveal-meta' },
      `${player.positions.join(' · ')} · ${player.age} ANS · ${player.club}`));
    card.appendChild(el('div', { class: 'pick-reveal-price' }, player.value + ' M€'));
    if (participant) {
      const by = el('div', { class: 'pick-reveal-by' });
      by.innerHTML = 'PIOCHÉ PAR <strong>' + participant.name + '</strong>';
      card.appendChild(by);
    }
    const prog = el('div', { class: 'pick-reveal-progress' });
    prog.appendChild(el('div', { class: 'pick-reveal-progress-fill' }));
    card.appendChild(prog);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    // Force reflow puis show
    overlay.getBoundingClientRect();
    requestAnimationFrame(() => overlay.classList.add('show'));
    // Tap to skip
    let dismissed = false;
    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      overlay.classList.remove('show');
      setTimeout(() => { overlay.remove(); if (done) done(); }, 280);
    }
    overlay.addEventListener('click', dismiss);
    setTimeout(dismiss, 2500);
  }

  // ============================================================
  // TURN ADVANCEMENT (snake)
  // ============================================================
  function advanceTurn() {
    state.pickIndex += 1;
    const totalPicks = state.nbPlayers * 11;

    if (state.pickIndex > totalPicks) {
      // Rattrapage des joueurs skip
      while (state.skipped.length > 0) {
        const next = state.skipped.shift();
        const part = state.participants.find(p => p.id === next.participantId);
        if (openSlotsForParticipant(part).length > 0) {
          state.currentParticipant = part;
          renderAll();
          startTimer();
          return;
        }
      }
      if (state.gamble && !state.gambleUsed) {
        offerGamble();
        return;
      }
      finishGame();
      return;
    }

    const pickInRound = ((state.pickIndex - 1) % state.nbPlayers) + 1;
    if (pickInRound === 1) {
      state.round += 1;
      state.order = state.order.slice().reverse();
    }

    const partIdx = state.order[pickInRound - 1];
    state.currentParticipant = state.participants[partIdx];

    if (openSlotsForParticipant(state.currentParticipant).length === 0) {
      advanceTurn();
      return;
    }

    renderAll();
    startTimer();
  }

  function skipCurrentTurn() {
    pauseTimer();
    const totalPicks = state.nbPlayers * 11;
    const inCatchUp = state.pickIndex > totalPicks;
    if (!inCatchUp) {
      state.skipped.push({ participantId: state.currentParticipant.id });
      toast('Temps écoulé', `${state.currentParticipant.name} pioche plus tard.`);
    } else {
      toast('Temps écoulé', `${state.currentParticipant.name} a manqué son rattrapage.`);
    }
    advanceTurn();
  }

  // ============================================================
  // TIMER
  // ============================================================
  function startTimer() {
    pauseTimer();
    state.timerEnd = Date.now() + state.timerSec * 1000;
    updateTimer();
    state.timerHandle = setInterval(updateTimer, 200);
  }
  function pauseTimer() {
    if (state.timerHandle) clearInterval(state.timerHandle);
    state.timerHandle = null;
  }
  function updateTimer() {
    const remaining = Math.max(0, (state.timerEnd - Date.now()) / 1000);
    const sec = Math.ceil(remaining);
    $('#timerText').textContent = sec;
    const ring = $('#timerRing');
    const C = 2 * Math.PI * 52;
    const offset = C * (1 - remaining / state.timerSec);
    ring.style.strokeDashoffset = offset;
    ring.classList.toggle('warn', sec <= 15 && sec > 5);
    ring.classList.toggle('danger', sec <= 5);
    if (remaining <= 0) {
      pauseTimer();
      skipCurrentTurn();
    }
  }

  // ============================================================
  // GAMBLE
  // ============================================================
  function offerGamble() {
    state.gambleUsed = true;
    pauseTimer();
    renderAll();
    $('#gambleResult').innerHTML = '';
    $('#rollGamble').disabled = false;
    $('#skipGamble').disabled = false;
    openModal('#modalGamble');
  }

  function rollGamble() {
    const cur = state.currentParticipant;
    const opps = state.participants.filter(p => p.id !== cur.id && Object.values(p.slots).some(Boolean));
    if (opps.length === 0) return finishGameAfterGamble();
    const opp = opps[Math.floor(Math.random() * opps.length)];

    const win = Math.random() < 0.5;
    const result = $('#gambleResult');
    result.innerHTML = '<div class="dice-spin">🎲</div>';
    $('#rollGamble').disabled = true;
    $('#skipGamble').disabled = true;

    setTimeout(() => {
      let msg;
      if (win) {
        const stealable = pickStealableFrom(opp, cur);
        if (!stealable) {
          msg = `<span class="gamble-win">Tu gagnes... mais aucun joueur de ${opp.name} ne rentre dans ta formation. Pas de chance !</span>`;
        } else {
          const slotIdOpp = Object.keys(opp.slots).find(k => opp.slots[k] === stealable.player.id);
          opp.slots[slotIdOpp] = null;
          opp.spent -= stealable.player.value;
          cur.slots[stealable.targetSlot.id] = stealable.player.id;
          cur.spent += stealable.player.value;
          msg = `<span class="gamble-win">PILE ! Tu voles <strong>${stealable.player.name}</strong> à ${opp.name}.</span>`;
        }
      } else {
        const stealable = pickStealableFrom(cur, opp);
        if (!stealable) {
          msg = `<span class="gamble-lose">Face... mais aucun de tes joueurs ne rentre chez ${opp.name}. Sauvé !</span>`;
        } else {
          const slotIdCur = Object.keys(cur.slots).find(k => cur.slots[k] === stealable.player.id);
          cur.slots[slotIdCur] = null;
          cur.spent -= stealable.player.value;
          opp.slots[stealable.targetSlot.id] = stealable.player.id;
          opp.spent += stealable.player.value;
          msg = `<span class="gamble-lose">FACE. ${opp.name} te vole <strong>${stealable.player.name}</strong>.</span>`;
        }
      }
      result.innerHTML = msg + '<div style="margin-top:18px"><button class="btn btn-primary" id="endGamble">Voir les équipes</button></div>';
      $('#endGamble').addEventListener('click', finishGameAfterGamble);
      renderAll();
    }, 700);
  }

  function pickStealableFrom(donor, receiver) {
    const candidates = Object.values(donor.slots).filter(Boolean).map(id => playerById(id));
    candidates.sort((a, b) => b.value - a.value);
    for (const player of candidates) {
      const openSlots = openSlotsForParticipant(receiver);
      const targetSlot = openSlots.find(s => slotMatch(player, s.type) !== null);
      if (targetSlot) return { player, targetSlot };
    }
    return null;
  }

  function finishGameAfterGamble() {
    closeModal('#modalGamble');
    finishGame();
  }

  // ============================================================
  // FINISH
  // ============================================================
  function finishGame() {
    pauseTimer();
    showScreen('final');
    const grid = $('#finalGrid');
    grid.innerHTML = '';
    state.participants.forEach(p => {
      const card = el('div', { class: 'final-card glow' });
      const filled = Object.values(p.slots).filter(Boolean).length;
      card.appendChild(el('div', { class: 'head' },
        el('div', { class: 'final-avatar', style: `background:${p.color.grad}` }, initials(p.name)),
        el('div', {},
          el('h3', {}, p.name),
          el('div', { class: 'meta' }, `${FORMATIONS[p.formation].label} · ${filled}/${squadSize()} · ${p.spent.toFixed(0)} / ${state.budget} M€`)),
      ));
      const wrap = el('div', { class: 'pitch-wrap' });
      const pitch = el('div', { class: 'pitch' });
      wrap.appendChild(pitch);
      card.appendChild(wrap);
      grid.appendChild(card);
      renderPitch(p, pitch);
    });
    $('#finalSub').textContent = `${state.nbPlayers} équipes constituées en ${state.round} round(s).`;
  }

  // ============================================================
  // MODALS
  // ============================================================
  function openModal(sel) { $(sel).setAttribute('aria-hidden', 'false'); }
  function closeModal(sel) { $(sel).setAttribute('aria-hidden', 'true'); }
  function toast(title, body) {
    $('#toastTitle').textContent = title;
    $('#toastBody').textContent = body;
    openModal('#modalToast');
  }

  function bindModals() {
    document.addEventListener('click', (e) => {
      if (e.target.matches('[data-close]')) {
        const modal = e.target.closest('.modal');
        if (modal) closeModal('#' + modal.id);
      }
      if (e.target.classList.contains('modal')) closeModal('#' + e.target.id);
    });
    $('#confirmYes').addEventListener('click', applyPendingPick);
    $('#rollGamble').addEventListener('click', rollGamble);
    $('#skipGamble').addEventListener('click', () => { closeModal('#modalGamble'); finishGame(); });
  }

  // ============================================================
  // RESTART
  // ============================================================
  function restart() {
    pauseTimer();
    showScreen('setup');
  }

  // ============================================================
  // ONLINE MODE — tabs + lobby
  // ============================================================
  function bindModeTabs() {
    const tabs = $$('#modeTabs .mode-tab');
    tabs.forEach(t => t.addEventListener('click', () => {
      tabs.forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      state.mode = t.dataset.mode;
      const isOnline = state.mode === 'online';
      $('#lobbyCard').style.display = isOnline ? 'block' : 'none';
      // En online, on enlève les inputs participants (chacun rejoint via son écran)
      $('#participantsTitle').style.display = isOnline ? 'none' : 'block';
      $('#participantsList').style.display = isOnline ? 'none' : 'grid';
      $('#configCardSub').textContent = isOnline
        ? 'Règle les paramètres de la draft. Lance la partie quand tout le monde a rejoint le salon.'
        : 'Règle ta partie : nombre de joueurs, budget, championnats, timer.';
      $('#startGame').textContent = isOnline ? 'Mode online — utilise le bouton du salon' : 'Lancer le draft';
      $('#startGame').disabled = isOnline;
    }));
  }

  function populateOnlineFormations() {
    const sel = $('#onlineFormation');
    if (!sel) return;
    sel.innerHTML = '';
    Object.keys(FORMATIONS).forEach((f, idx) => {
      const opt = el('option', { value: f }, FORMATIONS[f].label);
      if (idx === 0) opt.setAttribute('selected', '');
      sel.appendChild(opt);
    });
  }

  function bindLobby() {
    const btnCreate = $('#btnCreate');
    const btnJoin = $('#btnJoin');
    const btnCopy = $('#btnCopyCode');
    const btnStart = $('#btnStartOnline');

    btnCreate.addEventListener('click', () => onlineEnterRoom('host'));
    btnJoin.addEventListener('click', () => onlineEnterRoom('guest'));
    btnCopy.addEventListener('click', () => {
      const code = state.online.roomCode || '';
      try { navigator.clipboard.writeText(code); btnCopy.textContent = 'Code copié !'; setTimeout(() => btnCopy.textContent = 'Copier le code', 1500); } catch (_) {}
    });
    btnStart.addEventListener('click', startGameOnlineHost);
  }

  function onlineEnterRoom(role) {
    const name = ($('#onlineName').value || '').trim().slice(0, 18) || 'Joueur';
    const roomName = ($('#onlineRoom').value || '').trim() || 'Salon';
    const joinCode = ($('#onlineJoinCode').value || '').trim();
    const formation = $('#onlineFormation').value || '4-3-3';
    if (role === 'guest' && !joinCode) return toast('Code manquant', 'Colle le code partagé par l\'hôte dans le champ « Code du salon ».');
    const me = { name, formation, roomName };

    $('#btnCreate').disabled = true;
    $('#btnJoin').disabled = true;
    $('#lobbyState').textContent = role === 'host' ? 'Création du salon...' : 'Connexion au salon...';

    Online.off();
    const promise = role === 'host' ? Online.createRoom(roomName, me) : Online.joinRoom(joinCode, me);
    promise.then(({ id, roomCode }) => {
      state.online.joined = true;
      state.online.isHost = (role === 'host');
      state.online.myId = id;
      state.online.roomCode = roomCode;

      $('#lobbyForm').style.display = 'none';
      $('#lobbyRoom').style.display = 'flex';
      $('#lobbyRoomName').textContent = roomName;
      $('#lobbyShareCode').textContent = roomCode;
      $('#lobbyHostActions').style.display = role === 'host' ? 'flex' : 'none';
      $('#lobbyGuestMsg').style.display = role === 'guest' ? 'block' : 'none';
      $('#lobbyState').textContent = role === 'host'
        ? 'Salon créé. Partage le code à tes potes — il marche partout (Wi-Fi, 4G, n\'importe où).'
        : 'Connecté ! En attente du lancement par l\'hôte.';

      ensureOnlineStatus(true);
      if (role === 'host') {
        renderLobbyPlayers(Online.state.participants);
        updateStartButton();
      }
    }).catch((err) => {
      console.error(err);
      $('#btnCreate').disabled = false;
      $('#btnJoin').disabled = false;
      const msg = (err && err.message) || 'connexion impossible';
      $('#lobbyState').textContent = 'Erreur : ' + msg;
      toast(role === 'host' ? 'Création échouée' : 'Connexion échouée', msg);
    });

    Online.on('state', (st) => {
      // Hôte ou guest reçoit l'état
      if (state.online.joined && st.phase === 'lobby') {
        renderLobbyPlayers(st.participants);
        updateStartButton(st.participants.length);
      }
      if (state.online.joined && st.phase === 'draft') {
        // L'hôte vient de lancer
        if (!isOnGameScreen()) enterOnlineDraft(st);
        else applyOnlineState(st);
      }
      if (st && st.phase === 'final') {
        finishOnline(st);
      }
    });

    Online.on('error', (e) => {
      console.warn('Online error:', e);
      ensureOnlineStatus(false);
    });

    Online.on('message', ({ from, msg }) => {
      if (state.online.isHost) onlineHostHandleMessage(from, msg);
    });
  }

  function renderLobbyPlayers(parts) {
    const wrap = $('#lobbyPlayers');
    wrap.innerHTML = '';
    parts.forEach((p, i) => {
      const grad = TEAM_COLORS[i % 4].grad;
      const card = el('div', { class: 'lobby-player-card glow' + (p.isHost ? ' host' : '') });
      card.appendChild(el('div', { class: 'avatar-mini', style: `background:${grad}` }, initials(p.name)));
      const info = el('div', {});
      info.appendChild(el('div', { class: 'name' }, p.name));
      info.appendChild(el('div', { class: 'meta' }, FORMATIONS[p.formation]?.label || p.formation));
      if (p.isHost) info.appendChild(el('div', { class: 'badge' }, '/ HÔTE'));
      card.appendChild(info);
      wrap.appendChild(card);
    });
  }

  function updateStartButton(count) {
    const btn = $('#btnStartOnline');
    if (!btn) return;
    const c = count || (Online.state ? Online.state.participants.length : 1);
    btn.disabled = c < 2;
    btn.textContent = c < 2 ? 'En attente d\'au moins 1 invité…' : `Lancer la draft (${c} joueurs)`;
  }

  function startGameOnlineHost() {
    if (!Online || !Online.state) return;
    if (state.leagues.size === 0) return toast('Aucun championnat', 'Active au moins un championnat dans la configuration.');
    const settings = {
      budget: state.budget,
      timerSec: state.timerSec,
      gamble: state.gamble,
      leagues: Array.from(state.leagues),
      ageSlider: state.ageSlider,
    };
    // Init host state for draft
    const parts = Online.state.participants.slice();
    const order = shuffleIndexes(parts.length);
    Online.state.phase = 'draft';
    Online.state.settings = settings;
    Online.state.order = order;
    Online.state.round = 1;
    Online.state.pickIndex = 1;
    Online.state.takenIds = [];
    Online.state.skipped = [];
    Online.state.gambleUsed = false;
    Online.state.currentParticipant = parts[order[0]].id;
    Online.broadcastState();
  }

  function isOnGameScreen() {
    return document.querySelector('#screen-draft.active') !== null;
  }

  function enterOnlineDraft(st) {
    // Construit le contexte local depuis l'état host
    state.budget = st.settings.budget;
    state.timerSec = st.settings.timerSec;
    state.gamble = st.settings.gamble;
    state.leagues = new Set(st.settings.leagues);
    state.ageSlider = (typeof st.settings.ageSlider === 'number') ? st.settings.ageSlider : 9;

    state.participants = st.participants.map((p, i) => ({
      id: p.id, name: p.name, formation: p.formation,
      color: TEAM_COLORS[i % 4],
      slots: st.slots[p.id] || blankSlots(p.formation),
      spent: st.spent[p.id] || 0,
      isMe: p.id === state.online.myId,
    }));
    state.order = st.order;
    state.round = st.round;
    state.pickIndex = st.pickIndex;
    state.takenIds = new Set(st.takenIds);
    state.skipped = st.skipped.slice();
    state.gambleUsed = st.gambleUsed;
    state.currentParticipant = state.participants.find(p => p.id === st.currentParticipant) || state.participants[0];

    // Le "courant" pour le picker = TOUJOURS moi-même (en online on draft son XI)
    showScreen('draft');
    $('#shortlistBlock').style.display = 'block';

    renderHeaderOnline();
    renderMyTeamForMeOnline();
    renderOpponentsOnline();
    if (state.currentParticipant.id === state.online.myId) startTimer();
  }

  function applyOnlineState(st) {
    // Mise à jour live pendant la draft
    state.participants.forEach(p => {
      p.slots = st.slots[p.id] || p.slots;
      p.spent = st.spent[p.id] || 0;
    });
    state.order = st.order;
    state.round = st.round;
    state.pickIndex = st.pickIndex;
    state.takenIds = new Set(st.takenIds);
    state.skipped = st.skipped.slice();
    state.gambleUsed = st.gambleUsed;
    state.currentParticipant = state.participants.find(p => p.id === st.currentParticipant);

    renderHeaderOnline();
    renderMyTeamForMeOnline();
    renderOpponentsOnline();
    renderShortlist();

    if (state.currentParticipant && state.currentParticipant.id === state.online.myId) {
      startTimer();
    } else {
      pauseTimer();
    }
  }

  function renderHeaderOnline() {
    const cur = state.currentParticipant;
    if (!cur) return;
    $('#turnName').textContent = cur.id === state.online.myId ? 'À toi !' : cur.name;
    $('#turnRound').textContent = `Round ${Math.min(state.round, squadSize())} / ${squadSize()}`;
    $('#turnPickIndex').textContent = `Pick ${state.pickIndex}`;
    const olist = $('#orderList');
    olist.innerHTML = '';
    state.order.forEach(idx => {
      const p = state.participants[idx];
      const cls = ['order-pill'];
      if (p.id === cur.id) cls.push('current');
      olist.appendChild(el('span', { class: cls.join(' ') }, p.name));
    });
  }

  function renderMyTeamForMeOnline() {
    // Toujours afficher le terrain de l'utilisateur courant (moi)
    const me = state.participants.find(p => p.isMe);
    if (!me) return;
    $('#myTeamTitle').textContent = me.name + ' (toi)';
    const remaining = state.budget - me.spent;
    $('#budgetRem').textContent = remaining.toFixed(0);
    $('#budgetTot').textContent = state.budget;
    $('#budgetBar').style.width = Math.max(0, (remaining / state.budget) * 100) + '%';
    const filled = Object.values(me.slots).filter(Boolean).length;
    $('#picksLeft').textContent = 11 - filled;
    renderPitch(me, $('#myPitch'), { interactive: state.currentParticipant && state.currentParticipant.id === state.online.myId });
    const cur = state.currentParticipant;
    const isMine = cur && cur.id === state.online.myId;
    $('#pitchHint').textContent = isMine
      ? '/ À toi de piocher — clique sur un poste'
      : '/ ' + cur.name + ' est en train de piocher…';
  }

  function renderOpponentsOnline() {
    const wrap = $('#opponentsList');
    wrap.innerHTML = '';
    state.participants.filter(p => !p.isMe).forEach(p => {
      const isCurrent = state.currentParticipant && state.currentParticipant.id === p.id;
      const card = el('div', { class: 'opp-card' + (isCurrent ? ' is-current' : '') });
      card.appendChild(el('div', { class: 'opp-avatar', style: `background:${p.color.grad}` }, initials(p.name)));
      const filled = Object.values(p.slots).filter(Boolean).length;
      const info = el('div', {});
      info.appendChild(el('div', { class: 'opp-name' }, p.name));
      info.appendChild(el('div', { class: 'opp-meta' },
        `${FORMATIONS[p.formation].label} · ${filled}/${squadSize()} · ${p.spent.toFixed(0)} M€${isCurrent ? ' · pioche…' : ''}`));
      card.appendChild(info);
      wrap.appendChild(card);
    });
  }

  // Côté hôte : valider/appliquer un pick reçu d'un guest
  function onlineHostHandleMessage(fromId, msg) {
    const st = Online.state;
    if (!st || st.phase !== 'draft') return;
    if (st.currentParticipant !== fromId) return; // pas son tour
    const part = st.participants.find(p => p.id === fromId);
    if (!part) return;
    if (msg.type === 'pick') {
      const player = PLAYERS.find(p => p.id === msg.playerId);
      if (!player) return;
      const slots = st.slots[fromId];
      if (!slots || slots[msg.slotId]) return;
      const slot = (FORMATIONS[part.formation].slots || []).find(s => s.id === msg.slotId);
      if (!slot) return;
      // Critères de la draft
      const accepted = SLOT_RULES[slot.type];
      if (!player.positions.some(pos => accepted.includes(pos))) return;
      if (st.takenIds.includes(player.id)) return;
      const remaining = st.settings.budget - (st.spent[fromId] || 0);
      if (player.value > remaining) return;
      // Apply
      slots[msg.slotId] = player.id;
      st.spent[fromId] = (st.spent[fromId] || 0) + player.value;
      st.takenIds.push(player.id);
      hostAdvance();
      Online.broadcastState();
    } else if (msg.type === 'skip') {
      hostAdvance(true);
      Online.broadcastState();
    }
  }

  function hostAdvance(skipped) {
    const st = Online.state;
    if (skipped) st.skipped.push({ participantId: st.currentParticipant });
    st.pickIndex += 1;
    const total = st.participants.length * 11;
    if (st.pickIndex > total) {
      while (st.skipped.length > 0) {
        const next = st.skipped.shift();
        const part = st.participants.find(p => p.id === next.participantId);
        const slots = st.slots[next.participantId];
        const open = Object.entries(slots).filter(([, v]) => !v);
        if (open.length > 0) {
          st.currentParticipant = next.participantId;
          return;
        }
      }
      st.phase = 'final';
      return;
    }
    const pickInRound = ((st.pickIndex - 1) % st.participants.length) + 1;
    if (pickInRound === 1) {
      st.round += 1;
      st.order = st.order.slice().reverse();
    }
    const partIdx = st.order[pickInRound - 1];
    st.currentParticipant = st.participants[partIdx].id;
  }

  // Côté local (host inclus) : appeler l'action de pick en mode online
  function onlinePerformPick(slotId, playerId) {
    if (state.online.isHost) {
      onlineHostHandleMessage(state.online.myId, { type: 'pick', slotId, playerId });
    } else {
      Online.sendPick(slotId, playerId);
    }
  }

  // ============================================================
  // SHORTLIST (online only)
  // ============================================================
  function bindShortlist() {
    const addBtn = $('#shortlistAdd');
    if (addBtn) addBtn.addEventListener('click', () => openShortlistPicker());
  }

  function openShortlistPicker() {
    // Picker en mode "ajouter à la shortlist" plutôt que "drafter"
    pickerState.target = 'shortlist';
    // Slot factice : tous les postes acceptés (selon ma formation + critères)
    const me = state.participants.find(p => p.isMe);
    if (!me) return;
    const myOpenSlots = openSlotsForParticipant(me);
    // On ouvre un picker spécial qui montre les joueurs éligibles à n'importe quel slot ouvert
    const acceptedPositions = new Set();
    myOpenSlots.forEach(s => SLOT_RULES[s.type].forEach(p => acceptedPositions.add(p)));
    pickerState.acceptedPositionsOverride = acceptedPositions;
    pickerState.slot = { type: 'TOUS', id: '_shortlist' };
    pickerState.search = ''; pickerState.age = 'all'; pickerState.league = ''; pickerState.club = '';
    pickerState.affordable = true;

    $('#pickerEyebrow').textContent = '/ AJOUTER À LA SHORT LIST';
    $('#pickerTitle').textContent = 'Ajouter un joueur à ta short list';

    $('#pickerSearch').value = '';
    $$('#pickerAge .chip').forEach(c => c.classList.remove('active'));
    $$('#pickerAge .chip')[0].classList.add('active');
    $('#pickerAffordable').checked = true;

    // Leagues/clubs from candidates
    const candidates = PLAYERS.filter(p =>
      inDraftPool(p) &&
      !state.takenIds.has(p.id) &&
      !state.online.shortlist.find(s => s.id === p.id) &&
      p.positions.some(pos => acceptedPositions.has(pos))
    );
    const leagues = Array.from(new Set(candidates.map(p => p.league))).sort();
    $('#pickerLeague').innerHTML = '<option value="">Tous championnats</option>' +
      leagues.map(l => `<option>${l}</option>`).join('');
    const clubsSet = new Set();
    candidates.forEach(p => { clubsSet.add(p.club); (p.former || []).forEach(c => clubsSet.add(c)); });
    const clubs = Array.from(clubsSet).sort();
    $('#pickerClub').innerHTML = '<option value="">Tous clubs</option>' +
      clubs.map(c => `<option>${c}</option>`).join('');

    openModal('#modalPicker');
    setTimeout(() => $('#pickerSearch').focus(), 60);
    renderPicker();
  }

  function addToShortlist(player) {
    if (state.online.shortlist.find(p => p.id === player.id)) return;
    state.online.shortlist.push(player);
    renderShortlist();
  }
  function removeFromShortlist(playerId) {
    state.online.shortlist = state.online.shortlist.filter(p => p.id !== playerId);
    renderShortlist();
  }

  function renderShortlist() {
    const grid = $('#shortlistGrid');
    if (!grid) return;
    grid.innerHTML = '';
    if (state.online.shortlist.length === 0) {
      grid.appendChild(el('div', { class: 'shortlist-empty' },
        'Aucun joueur dans ta short list. Clique sur « + Ajouter » pour drag-and-drop sur ton terrain.'));
      return;
    }
    state.online.shortlist.forEach(p => {
      const card = el('div', { class: 'shortlist-card', draggable: 'true', 'data-pid': p.id });
      const remove = el('span', { class: 'remove', title: 'Retirer' }, '×');
      remove.addEventListener('click', (e) => { e.stopPropagation(); removeFromShortlist(p.id); });
      card.appendChild(remove);
      const photo = el('div', { class: 'photo', style: `background:${gradientFor(p)}` });
      attachPhoto(photo, p, '');
      photo.appendChild(el('span', {}, initials(p)));
      card.appendChild(photo);
      const body = el('div', { class: 'body' });
      body.appendChild(el('div', { class: 'name' }, p.name));
      body.appendChild(el('div', { class: 'value' }, p.value + ' M€ · ' + p.positions.join('/')));
      card.appendChild(body);
      // Drag start
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', p.id);
        e.dataTransfer.effectAllowed = 'move';
        card.classList.add('dragging');
        // Highlight slots éligibles
        markEligibleSlots(p);
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        clearEligibleMarks();
      });
      grid.appendChild(card);
    });
    // Permettre drop sur les slots
    setupSlotDropZones();
  }

  function markEligibleSlots(player) {
    const me = state.participants.find(p => p.isMe);
    if (!me) return;
    const slots = $$('#myPitch .slot');
    slots.forEach(el => {
      const slotId = el.dataset.sid;
      if (!slotId) return;
      const slotDef = FORMATIONS[me.formation].slots.find(s => s.id === slotId);
      if (!slotDef || me.slots[slotId]) return;
      const accepted = SLOT_RULES[slotDef.type];
      if (player.positions.some(pos => accepted.includes(pos))) {
        const remaining = state.budget - me.spent;
        if (player.value <= remaining) el.classList.add('drop-active');
      }
    });
  }
  function clearEligibleMarks() {
    $$('#myPitch .slot.drop-active').forEach(el => el.classList.remove('drop-active'));
  }

  function setupSlotDropZones() {
    const slots = $$('#myPitch .slot');
    slots.forEach(slotEl => {
      slotEl.addEventListener('dragover', (e) => {
        if (slotEl.classList.contains('drop-active')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }
      });
      slotEl.addEventListener('drop', (e) => {
        e.preventDefault();
        const pid = e.dataTransfer.getData('text/plain');
        const player = PLAYERS.find(p => p.id === pid);
        const slotId = slotEl.dataset.sid;
        if (!player || !slotId) return;
        if (state.mode === 'online') {
          onlinePerformPick(slotId, pid);
          // Retirer de la shortlist locale
          removeFromShortlist(pid);
        }
      });
    });
  }

  function finishOnline(st) {
    pauseTimer();
    showScreen('final');
    const grid = $('#finalGrid');
    grid.innerHTML = '';
    st.participants.forEach((p, i) => {
      const card = el('div', { class: 'final-card' });
      const filled = Object.values(st.slots[p.id] || {}).filter(Boolean).length;
      card.appendChild(el('div', { class: 'head' },
        el('div', { class: 'final-avatar', style: `background:${TEAM_COLORS[i % 4].grad}` }, initials(p.name)),
        el('div', {},
          el('h3', {}, p.name),
          el('div', { class: 'meta' }, `${FORMATIONS[p.formation].label} · ${filled}/${squadSize()} · ${(st.spent[p.id] || 0).toFixed(0)} / ${st.settings.budget} M€`)),
      ));
      const wrap = el('div', { class: 'pitch-wrap' });
      const pitch = el('div', { class: 'pitch' });
      wrap.appendChild(pitch);
      card.appendChild(wrap);
      grid.appendChild(card);
      // Render pitch from state
      const fakeParticipant = { formation: p.formation, slots: st.slots[p.id] || {} };
      renderPitch(fakeParticipant, pitch, {});
    });
    $('#finalSub').textContent = `${st.participants.length} équipes constituées · salon ${state.online.roomCode}`;
  }

  function ensureOnlineStatus(connected) {
    let pill = document.querySelector('.online-status');
    if (!pill) {
      pill = el('div', { class: 'online-status' }, 'EN LIGNE');
      document.body.appendChild(pill);
    }
    pill.classList.toggle('disconnected', !connected);
    pill.textContent = connected
      ? 'EN LIGNE · ' + (state.online.roomCode || '')
      : 'DÉCONNECTÉ';
  }

  function blankSlots(formation) {
    const F = FORMATIONS[formation];
    if (!F) return {};
    const o = {};
    F.slots.forEach(s => o[s.id] = null);
    return o;
  }

  // ============================================================
  // INIT
  // ============================================================
  // Track mouse globally pour l'effet spotlight (gradient border qui suit le curseur)
  function bindSpotlight() {
    // Skip totalement sur touch / mobile : aucune classe, aucun listener
    if (isTouch) return;
    $$('.setup-card, .mode-tab, .lobby-card, .feature').forEach(n => n.classList.add('glow'));

    let raf = null, lastE = null;
    document.addEventListener('pointermove', (e) => {
      lastE = e;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const ev = lastE; if (!ev) return;
        const target = ev.target.closest && ev.target.closest('.glow');
        if (target) {
          const r = target.getBoundingClientRect();
          target.style.setProperty('--mx', (ev.clientX - r.left) + 'px');
          target.style.setProperty('--my', (ev.clientY - r.top) + 'px');
        }
      });
    }, { passive: true });
  }

  // ============================================================
  // PHASE B — STADIUM (verdict + simulation)
  // ============================================================
  const stadiumState = {
    scores: [],        // par participant (computeTeamScore)
    styles: [],        // clé de style par participant
    tactics: [],       // {lineHeight,tempo,press,width,directness} par participant
    profiles: [],      // teamProfile par participant
    matches: [],       // bracket
    pendingStyleIdx: 0,
  };

  function recomputeScores() {
    stadiumState.scores = state.participants.map((p, i) => {
      const roles = (tacticsState.byParticipant[i] && tacticsState.byParticipant[i].players) || null;
      return window.Sim.computeTeamScore(p, FORMATIONS, SLOT_RULES, playerById, stadiumState.tactics[i], roles);
    });
    stadiumState.profiles = state.participants.map((p, i) => {
      const roles = (tacticsState.byParticipant[i] && tacticsState.byParticipant[i].players) || null;
      return window.Sim.teamProfile(p, FORMATIONS, playerById, stadiumState.tactics[i], roles);
    });
    // === Nouveau : note d'équipe intelligente engine A.5 ===
    stadiumState.engineGrades = state.participants.map((p, i) => {
      if (!window.Drafter || !window.Drafter.TeamGrade) return null;
      try {
        const teamA = adaptToEngineTeam(p);
        return window.Drafter.TeamGrade.gradeTeam(teamA, {
          grid: state.fiveMode ? '5v5' : '11v11',
        });
      } catch (e) {
        console.warn('TeamGrade failed for participant', i, e);
        return null;
      }
    });
  }

  // Cache des dossiers pré-match calculés une fois (lourd)
  const _preMatchCache = new Map();
  function getPreMatchAnalysis(idxA, idxB) {
    const key = idxA + '_' + idxB;
    if (_preMatchCache.has(key)) return _preMatchCache.get(key);
    if (!window.Drafter || !window.Drafter.Analyzer) return null;
    try {
      const teamA = adaptToEngineTeam(state.participants[idxA]);
      const teamB = adaptToEngineTeam(state.participants[idxB]);
      const result = window.Drafter.Analyzer.analyzeMatch(teamA, teamB, {
        grid: state.fiveMode ? '5v5' : '11v11',
      });
      _preMatchCache.set(key, result);
      return result;
    } catch (e) {
      console.warn('getPreMatchAnalysis failed:', e);
      return null;
    }
  }

  function goToStadium() {
    const fromBoard = stadiumState._tacticsFromBoard;
    stadiumState._tacticsFromBoard = false;
    if (!fromBoard) {
      stadiumState.styles = state.participants.map(() => null);
      stadiumState.tactics = state.participants.map(() => null);
      stadiumState.pendingStyleIdx = 0;
    } else {
      // Tactics déjà définies par le board, on garde
      stadiumState.pendingStyleIdx = state.participants.length;
    }
    stadiumState.matches = [];
    ensureTacticsState();
    recomputeScores();

    showScreen('stadium');
    renderTeamScores();
    renderTournament();

    if (!fromBoard) {
      setTimeout(askNextStyle, 400);
    } else {
      // Build bracket direct
      buildBracketAndRender();
      renderAiAnalysis();
    }
  }

  function askNextStyle() {
    const idx = stadiumState.pendingStyleIdx;
    if (idx >= state.participants.length) return;
    const part = state.participants[idx];
    const STYLES = window.Sim.STYLES;
    let chosen = 'equilibre';
    let tac = Object.assign({}, STYLES.equilibre.tactics);

    $('#styleEyebrow').textContent = `/ TACTIQUE · ${part.name.toUpperCase()} (${idx + 1}/${state.participants.length})`;
    $('#styleTitle').textContent = `${part.name}, comment fais-tu jouer ton équipe ?`;
    $('#styleSub').textContent = 'Choisis une philosophie, puis affine les curseurs. La simulation s\'appuie réellement dessus.';

    const wrap = $('#styleOptions');
    wrap.innerHTML = '';
    Object.values(STYLES).forEach(s => {
      const opt = el('button', { class: 'style-opt' + (s.key === chosen ? ' selected' : ''), type: 'button', 'data-key': s.key });
      opt.appendChild(el('span', { class: 'icon' }, s.icon + ' ' + s.label.toUpperCase()));
      opt.appendChild(el('h4', {}, s.label));
      opt.appendChild(el('p', {}, s.desc));
      opt.addEventListener('click', () => {
        $$('#styleOptions .style-opt').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        chosen = s.key;
        tac = Object.assign({}, STYLES[s.key].tactics);
        syncTacticSliders();
        $('#styleConfirm').disabled = false;
      });
      wrap.appendChild(opt);
    });

    // Curseurs tactiques (injectés une fois)
    let sliderHost = $('#tacticSliders');
    if (!sliderHost) {
      sliderHost = el('div', { id: 'tacticSliders', class: 'tactic-sliders' });
      $('#styleOptions').after(sliderHost);
    }
    const SL = [
      ['lineHeight', 'Hauteur de bloc', 'Bas', 'Haut'],
      ['tempo', 'Tempo', 'Posé', 'Rapide'],
      ['press', 'Pressing', 'Passif', 'Agressif'],
      ['width', 'Largeur', 'Axial', 'Large'],
      ['directness', 'Verticalité', 'Patient', 'Direct'],
    ];
    sliderHost.innerHTML = '';
    SL.forEach(([k, label, lo, hi]) => {
      const row = el('div', { class: 'tactic-slider' });
      row.appendChild(el('div', { class: 'ts-label' }, label, el('span', { class: 'ts-val', 'data-k': k }, String(tac[k]))));
      const input = el('input', { type: 'range', min: '0', max: '100', step: '1', value: String(tac[k]), 'data-key': k });
      input.addEventListener('input', () => {
        tac[k] = +input.value;
        row.querySelector('.ts-val').textContent = input.value;
      });
      const ends = el('div', { class: 'ts-ends' }, el('span', {}, lo), el('span', {}, hi));
      row.appendChild(input);
      row.appendChild(ends);
      sliderHost.appendChild(row);
    });
    function syncTacticSliders() {
      sliderHost.querySelectorAll('input[type=range]').forEach(inp => {
        inp.value = String(tac[inp.dataset.key]);
        const v = sliderHost.querySelector('.ts-val[data-k="' + inp.dataset.key + '"]');
        if (v) v.textContent = String(tac[inp.dataset.key]);
      });
    }

    $('#styleConfirm').disabled = false;
    $('#styleConfirm').onclick = () => {
      stadiumState.styles[idx] = chosen;
      stadiumState.tactics[idx] = Object.assign({}, tac);
      closeModal('#modalStyle');
      stadiumState.pendingStyleIdx++;
      recomputeScores();
      renderTeamScores();
      if (stadiumState.pendingStyleIdx < state.participants.length) {
        setTimeout(askNextStyle, 300);
      } else {
        buildBracketAndRender();
        renderTournament();
        renderAiAnalysis();
      }
    };

    openModal('#modalStyle');
  }

  // ---- Bracket (local) ----
  function buildBracketAndRender() {
    const n = state.participants.length;
    let bracket;
    if (n === 2) bracket = [{ a: 0, b: 1, type: 'final' }];
    else if (n === 3) bracket = [{ a:0,b:1,type:'rr' }, { a:0,b:2,type:'rr' }, { a:1,b:2,type:'rr' }];
    else {
      const ranked = state.participants.map((p, i) => ({ i, ov: stadiumState.scores[i].overall }))
        .sort((x, y) => y.ov - x.ov);
      bracket = [
        { a: ranked[0].i, b: ranked[3].i, type: 'semi' },
        { a: ranked[1].i, b: ranked[2].i, type: 'semi' },
      ];
    }
    stadiumState.matches = bracket.map(m => ({ ...m, played: false, result: null }));
    renderTournament();
  }

  function computeStandings() {
    const stats = state.participants.map((p, i) => ({ idx:i, name:p.name, color:p.color, p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0 }));
    stadiumState.matches.forEach(m => {
      if (!m.played) return;
      const A = stats[m.a], B = stats[m.b], r = m.result;
      A.p++; B.p++; A.gf += r.scoreA; A.ga += r.scoreB; B.gf += r.scoreB; B.ga += r.scoreA;
      if (r.scoreA > r.scoreB) { A.w++; A.pts += 3; B.l++; }
      else if (r.scoreA < r.scoreB) { B.w++; B.pts += 3; A.l++; }
      else { A.d++; B.d++; A.pts++; B.pts++; }
    });
    return stats.sort((x, y) => y.pts - x.pts || (y.gf-y.ga)-(x.gf-x.ga) || y.gf-x.gf);
  }

  // ============================================================
  // ANALYSE TACTIQUE — 100% déterministe (moteur intégré, pas de clé)
  // ============================================================
  function renderAiAnalysis() {
    const area = $('#aiAnalysisArea');
    const status = $('#aiAnalysisStatus');
    if (!area) return;
    renderDeterministicAnalysis(area, status);
  }

  function renderDeterministicAnalysis(area, status) {
    if (!window.Reason) return;
    status.textContent = 'raisonnement intégré';
    area.innerHTML = '';
    const wrap = el('div', { class: 'ai-output' });

    // 1) Analyse par équipe
    state.participants.forEach((p, i) => {
      const tp = stadiumState.profiles[i];
      const tac = stadiumState.tactics[i] || window.Sim.STYLES.equilibre.tactics;
      const score = stadiumState.scores[i];
      if (!tp || !score) return;
      const block = el('div', { class: 'ai-team-block glow' });
      block.appendChild(el('h3', { class: 'ai-h' }, p.name + ' — ' + FORMATIONS[p.formation].label + ' · ' + score.overall + '/99'));
      const html = window.Reason.analyzeTeam(p.name, score, tp, tac, FORMATIONS, playerById, p.formation);
      const div = document.createElement('div');
      div.innerHTML = html;
      block.appendChild(div);
      wrap.appendChild(block);
    });

    // 2) Matchups par paire (max 6 paires pour rester lisible)
    if (state.participants.length >= 2) {
      const matchupsEl = el('div', { class: 'ai-matchups' });
      matchupsEl.appendChild(el('h3', { class: 'ai-h' }, '⚔ Matchups potentiels'));
      const seen = new Set();
      const pairs = [];
      for (let i = 0; i < state.participants.length; i++)
        for (let j = i + 1; j < state.participants.length; j++) pairs.push([i, j]);
      pairs.slice(0, 6).forEach(([i, j]) => {
        const pa = state.participants[i], pb = state.participants[j];
        const tpA = stadiumState.profiles[i], tpB = stadiumState.profiles[j];
        const tacA = stadiumState.tactics[i] || window.Sim.STYLES.equilibre.tactics;
        const tacB = stadiumState.tactics[j] || window.Sim.STYLES.equilibre.tactics;
        if (!tpA || !tpB) return;
        const block = el('div', { class: 'ai-team-block glow' });
        block.appendChild(el('h4', { class: 'ai-h' }, pa.name + ' vs ' + pb.name));
        const html = window.Reason.analyzeMatchup(pa.name, tpA, tacA, pb.name, tpB, tacB);
        const div = document.createElement('div'); div.innerHTML = html;
        block.appendChild(div);
        matchupsEl.appendChild(block);
      });
      wrap.appendChild(matchupsEl);
    }
    area.appendChild(wrap);
  }

  function renderMarkdown(md) {
    let out = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    out = out.replace(/^### (.+)$/gm, '<h4 class="ai-h">$1</h4>');
    out = out.replace(/^## (.+)$/gm, '<h3 class="ai-h">$1</h3>');
    out = out.replace(/^# (.+)$/gm, '<h2 class="ai-h">$1</h2>');
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    out = '<p>' + out.split(/\n\n+/).join('</p><p>') + '</p>';
    out = out.replace(/<p>(\s*<h[234])/g, '$1');
    out = out.replace(/(<\/h[234]>)<\/p>/g, '$1');
    return out;
  }

  function renderTeamScores() {
    const grid = $('#teamScoresGrid');
    grid.innerHTML = '';
    // Inject the gradient defs for the ring (once)
    if (!document.getElementById('stadGradDefs')) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('id', 'stadGradDefs');
      svg.setAttribute('width', '0');
      svg.setAttribute('height', '0');
      svg.style.position = 'absolute';
      svg.innerHTML = `<defs><linearGradient id="stadGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#ffd76b"/><stop offset="100%" stop-color="#ff5c4d"/></linearGradient></defs>`;
      document.body.appendChild(svg);
    }

    state.participants.forEach((p, i) => {
      const score = stadiumState.scores[i];
      const style = stadiumState.styles[i];
      const card = el('div', { class: 'team-score-card glow' });
      // Header
      const head = el('div', { class: 'team-score-head' },
        el('div', { class: 'avatar', style: `background:${p.color.grad}` }, initials(p.name)),
        el('div', {},
          el('h3', {}, p.name),
          el('div', { class: 'meta' }, `${FORMATIONS[p.formation].label} · ${score.filled}/${squadSize()} · ${score.totalValue.toFixed(0)} M€`)),
      );
      card.appendChild(head);

      // Overall ring + style badge
      const overallPct = score.overall / 99;
      const dashOffset = 314.16 * (1 - overallPct);
      const ringWrap = el('div', { class: 'overall-ring-wrap' });
      const ring = el('div', { class: 'overall-ring' });
      ring.innerHTML = `<svg viewBox="0 0 110 110"><circle cx="55" cy="55" r="50" class="ring-bg"/><circle cx="55" cy="55" r="50" class="ring-fg" style="stroke-dashoffset:${dashOffset}"/></svg>
        <div class="value"><span>${score.overall}</span><span>OVERALL</span></div>`;
      ringWrap.appendChild(ring);
      const styleBadge = style
        ? el('div', { class: 'style-badge' }, window.Sim.STYLES[style].icon + ' ' + window.Sim.STYLES[style].label)
        : el('div', { class: 'style-badge no-style' }, '/ STYLE ?');
      const meta = el('div', {}, styleBadge);
      ringWrap.appendChild(meta);
      card.appendChild(ringWrap);

      // Score bars : 4 dimensions du nouveau grade si dispo, sinon legacy
      const engineGrade = stadiumState.engineGrades && stadiumState.engineGrades[i];
      const bars = el('div', { class: 'score-bars' });
      const dims = engineGrade
        ? [
            ['QUALITÉ INDIVIDUELLE', engineGrade.dimensions.raw],
            ['COHÉSION (synergies)',  engineGrade.dimensions.cohesion],
            ['ADÉQUATION RÔLES',      engineGrade.dimensions.fit],
            ['ÉQUILIBRE ZONAL',       engineGrade.dimensions.balance],
          ]
        : [
            ['QUALITÉ', score.quality],
            ['CHIMIE', score.chemistry],
            ['ADÉQUATION', score.fit],
            ['ÉQUILIBRE', score.balance],
            ['COHÉRENCE TACTIQUE', score.tactic],
          ];
      dims.forEach(([lbl, v]) => {
        const bar = el('div', { class: 'score-bar' });
        bar.appendChild(el('span', { class: 'label' }, lbl));
        const barEl = el('div', { class: 'bar' });
        const fill = el('div', { class: 'bar-fill', style: `width:${v}%` });
        barEl.appendChild(fill);
        bar.appendChild(barEl);
        bar.appendChild(el('span', { class: 'num' }, String(v)));
        bars.appendChild(bar);
      });
      card.appendChild(bars);

      // Override de la valeur du ring central avec engineGrade.grade si dispo
      if (engineGrade) {
        const valueSpan = ring.querySelector('.value span:first-child');
        if (valueSpan) valueSpan.textContent = engineGrade.grade;
        // Mise à jour aussi du dashoffset
        const pct = engineGrade.grade / 99;
        const fgCircle = ring.querySelector('.ring-fg');
        if (fgCircle) fgCircle.style.strokeDashoffset = 314.16 * (1 - pct);
      }

      // Top 3 players
      const topWrap = el('div', { class: 'top-players' });
      score.topPlayers.forEach(tp => {
        const tpEl = el('div', { class: 'top-player' });
        const ph = el('div', { class: 'photo', style: `background:${gradientFor(tp)}` });
        attachPhoto(ph, tp, '');
        ph.appendChild(el('span', {}, initials(tp)));
        tpEl.appendChild(ph);
        tpEl.appendChild(el('div', { class: 'nm' }, tp.name));
        tpEl.appendChild(el('div', { class: 'vl' }, tp.value + ' M€'));
        topWrap.appendChild(tpEl);
      });
      card.appendChild(topWrap);

      grid.appendChild(card);
    });
  }

  function renderTournament() {
    const wrap = $('#tournamentArea');
    wrap.innerHTML = '';
    const hasMatches = stadiumState.matches.length > 0;

    const head = el('div', { class: 'tournament-header' });
    head.appendChild(el('h3', {}, hasMatches ? 'Calendrier des matches' : 'En attente des styles…'));
    if (hasMatches) {
      const allPlayed = stadiumState.matches.every(m => m.played);
      if (!allPlayed) {
        const playAll = el('button', { class: 'btn btn-primary' }, 'Lancer toute la simulation');
        playAll.addEventListener('click', playAllMatches);
        head.appendChild(playAll);
      }
    }
    wrap.appendChild(head);

    if (!hasMatches) return;

    const grid = el('div', { class: 'matches-grid' });
    stadiumState.matches.forEach((m, idx) => {
      grid.appendChild(buildMatchRow(m, idx));
    });
    wrap.appendChild(grid);

    // Classement si tous joués
    if (stadiumState.matches.every(m => m.played)) {
      renderStandings(wrap);
    }
  }

  function buildMatchRow(m, idx) {
    const pa = state.participants[m.a], pb = state.participants[m.b];
    const sa = stadiumState.scores[m.a], sb = stadiumState.scores[m.b];
    const winA = m.played && m.result.scoreA > m.result.scoreB;
    const winB = m.played && m.result.scoreA < m.result.scoreB;
    const row = el('div', { class: 'match-row' + (m.played ? ' played' : '') + (winA ? ' win-a' : '') + (winB ? ' win-b' : '') });

    // Team A
    const aBox = el('div', { class: 'match-team match-team-a' });
    aBox.appendChild(el('div', { class: 'avatar-tiny', style: `background:${pa.color.grad}` }, initials(pa.name)));
    const aInfo = el('div', {});
    aInfo.appendChild(el('div', { class: 'name' }, pa.name));
    aInfo.appendChild(el('div', { class: 'sub' }, 'Overall ' + sa.overall));
    aBox.appendChild(aInfo);
    row.appendChild(aBox);

    // Score
    const scoreEl = el('div', { class: 'match-score' });
    if (m.played) {
      scoreEl.appendChild(el('span', {}, String(m.result.scoreA)));
      scoreEl.appendChild(el('span', { class: 'pending' }, '–'));
      scoreEl.appendChild(el('span', {}, String(m.result.scoreB)));
    } else {
      scoreEl.appendChild(el('span', { class: 'pending' }, 'vs'));
    }
    row.appendChild(scoreEl);

    // Team B
    const bBox = el('div', { class: 'match-team match-team-b' });
    const bInfo = el('div', {});
    bInfo.appendChild(el('div', { class: 'name' }, pb.name));
    bInfo.appendChild(el('div', { class: 'sub' }, 'Overall ' + sb.overall));
    bBox.appendChild(bInfo);
    bBox.appendChild(el('div', { class: 'avatar-tiny', style: `background:${pb.color.grad}` }, initials(pb.name)));
    row.appendChild(bBox);

    // CTA
    const cta = el('div', { class: 'match-cta' });
    // Bouton dossier pré-match (engine A.4)
    if (window.Drafter && window.Drafter.Analyzer) {
      const dossier = el('button', { class: 'btn btn-ghost match-dossier' });
      dossier.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> Dossier';
      dossier.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openDossierTactique(m.a, m.b);
      });
      cta.appendChild(dossier);
    }
    if (!m.played) {
      const btn = el('button', { class: 'btn btn-primary' }, 'Simuler');
      btn.addEventListener('click', () => playMatch(idx));
      cta.appendChild(btn);
    } else {
      const btn = el('button', { class: 'btn btn-ghost' }, 'Revoir');
      btn.addEventListener('click', () => replayMatch(idx));
      cta.appendChild(btn);
    }
    row.appendChild(cta);

    return row;
  }

  /**
   * openDossierTactique(idxA, idxB)
   * Modal qui affiche le dossier pré-match enrichi par l'engine A.4
   */
  function openDossierTactique(idxA, idxB) {
    const analysis = getPreMatchAnalysis(idxA, idxB);
    if (!analysis) { toast('Engine non disponible'); return; }
    const partA = state.participants[idxA], partB = state.participants[idxB];

    let modal = $('#modalDossier');
    if (!modal) {
      modal = el('div', { class: 'modal modal-dossier', id: 'modalDossier' });
      modal.innerHTML = '<div class="modal-card dossier-card"><button class="modal-close" data-close>×</button><div class="dossier-body"></div></div>';
      document.body.appendChild(modal);
      modal.addEventListener('click', (ev) => {
        if (ev.target.matches('[data-close]') || ev.target === modal) closeModal('#modalDossier');
      });
    }

    const body = modal.querySelector('.dossier-body');
    body.innerHTML = '';

    // Header confrontation
    const head = el('div', { class: 'dos-head' });
    head.appendChild(el('div', { class: 'dos-eyebrow' }, 'DOSSIER TACTIQUE PRÉ-MATCH'));
    head.appendChild(el('h2', { class: 'dos-title' }, partA.name + ' vs ' + partB.name));
    body.appendChild(head);

    // Pronostic
    const pron = el('div', { class: 'dos-pronostic' });
    const winnerName = analysis.predictedWinner === 'A' ? partA.name :
                       analysis.predictedWinner === 'B' ? partB.name :
                       'Confrontation équilibrée';
    pron.appendChild(el('div', { class: 'dos-pron-label' }, 'Pronostic'));
    pron.appendChild(el('div', { class: 'dos-pron-title' }, winnerName));
    pron.appendChild(el('div', { class: 'dos-pron-sub' }, 'Confiance : ' + analysis.confidence + ' · ' +
      analysis.domStats.A + ' zones ' + partA.name + ' vs ' + analysis.domStats.B + ' zones ' + partB.name));
    body.appendChild(pron);

    // Narration
    if (analysis.narrative) {
      body.appendChild(el('p', { class: 'dos-narrative' }, analysis.narrative));
    }

    // Profils des 2 équipes
    const profiles = el('div', { class: 'dos-profiles' });
    [analysis.reportA, analysis.reportB].forEach((report, i) => {
      const part = i === 0 ? partA : partB;
      const col = el('div', { class: 'dos-col' });
      col.appendChild(el('div', { class: 'dos-team-head', style: 'border-left-color:' + part.color.solid }, part.name));

      // Identité tactique
      if (report.primaryIdentity) {
        const identity = el('div', { class: 'dos-block' });
        identity.appendChild(el('div', { class: 'dos-block-label' }, 'Identité tactique'));
        identity.appendChild(el('div', { class: 'dos-block-value' }, report.primaryIdentity.label));
        identity.appendChild(el('div', { class: 'dos-block-desc' }, report.primaryIdentity.desc));
        col.appendChild(identity);
      }

      // Synergies positives
      if (report.synergies && report.synergies.positive.length) {
        const syn = el('div', { class: 'dos-block' });
        syn.appendChild(el('div', { class: 'dos-block-label' }, 'Synergies fortes'));
        report.synergies.positive.slice(0, 3).forEach(s => {
          const item = el('div', { class: 'dos-syn-pos' });
          item.appendChild(el('span', { class: 'dos-syn-tag' }, '+' + s.score));
          item.appendChild(el('span', {}, s.why));
          syn.appendChild(item);
        });
        col.appendChild(syn);
      }

      // Contradictions / faiblesses
      if (report.contradictions && report.contradictions.length) {
        const contr = el('div', { class: 'dos-block' });
        contr.appendChild(el('div', { class: 'dos-block-label dos-warn-label' }, 'Contradictions détectées'));
        report.contradictions.slice(0, 2).forEach(c => {
          const item = el('div', { class: 'dos-warn-item' });
          item.appendChild(el('span', { class: 'dos-warn-icon' }, '⚠'));
          item.appendChild(el('span', {}, c.player.name + ' en ' + c.roleLabel + ' (fit ' + c.fit + ')'));
          contr.appendChild(item);
        });
        col.appendChild(contr);
      }

      // Zone forte
      if (report.strongZones && report.strongZones.length) {
        const zone = el('div', { class: 'dos-block' });
        zone.appendChild(el('div', { class: 'dos-block-label' }, 'Zone forte'));
        const z = report.strongZones[0];
        zone.appendChild(el('div', { class: 'dos-block-value' },
          window.Drafter.Analyzer.zoneLabel(z.zone)));
        zone.appendChild(el('div', { class: 'dos-block-desc' },
          'Att ' + z.attack + ' · Def ' + z.defense + ' · Vitesse ' + z.speed));
        col.appendChild(zone);
      }

      profiles.appendChild(col);
    });
    body.appendChild(profiles);

    // Avantages exploitables
    if (analysis.advantagesA.length || analysis.advantagesB.length) {
      const adv = el('div', { class: 'dos-advantages' });
      adv.appendChild(el('h4', {}, 'Zones d\'exploitation'));
      const advGrid = el('div', { class: 'dos-adv-grid' });
      [['A', partA, analysis.advantagesA], ['B', partB, analysis.advantagesB]].forEach(([sideKey, part, list]) => {
        if (!list.length) return;
        const side = el('div', { class: 'dos-adv-side' });
        side.appendChild(el('div', { class: 'dos-adv-name', style: 'color:' + part.color.solid }, part.name));
        list.slice(0, 3).forEach(a => {
          const item = el('div', { class: 'dos-adv-item' });
          item.appendChild(el('span', { class: 'dos-adv-mag' }, '+' + a.magnitude));
          item.appendChild(el('span', {}, window.Drafter.Analyzer.zoneLabel(a.cellId)));
          side.appendChild(item);
        });
        advGrid.appendChild(side);
      });
      adv.appendChild(advGrid);
      body.appendChild(adv);
    }

    openModal('#modalDossier');
  }

  function renderStandings(parent) {
    const standings = computeStandings();
    const wrap = el('div', { class: 'standings' });
    wrap.appendChild(el('h3', { class: 'standings-title' }, 'Classement final'));
    const grid = el('div', { class: 'standings-grid' });
    standings.forEach((s, i) => {
      const row = el('div', { class: 'standing-row rank-' + (i + 1) });
      row.appendChild(el('div', { class: 'rank' }, '#' + (i + 1)));
      row.appendChild(el('div', { class: 'avatar-tiny', style: `background:${s.color.grad}` }, initials(s.name)));
      row.appendChild(el('div', { class: 'name' }, s.name));
      row.appendChild(el('div', { class: 'pts' }, s.pts + ' pts'));
      row.appendChild(el('div', { class: 'gd' }, `${s.gf}–${s.ga}`));
      grid.appendChild(row);
    });
    wrap.appendChild(grid);
    parent.appendChild(wrap);
  }

  // ============================================================
  // SIMULATION ANIMÉE
  // ============================================================
  function playMatch(matchIdx) {
    const m = stadiumState.matches[matchIdx];
    if (m.played) return replayMatch(matchIdx);

    const partA = state.participants[m.a], partB = state.participants[m.b];
    const tpA = stadiumState.profiles[m.a], tpB = stadiumState.profiles[m.b];
    const tacA = stadiumState.tactics[m.a] || window.Sim.STYLES.equilibre.tactics;
    const tacB = stadiumState.tactics[m.b] || window.Sim.STYLES.equilibre.tactics;

    // === Nouveau moteur si dispo (engine A+B + Five) ===
    let result;
    const useFive = state.fiveMode || state.matchMode === 'five';
    if (window.Drafter && window.Drafter.MatchEngine && !state.legacyEngine) {
      try {
        const teamA = adaptToEngineTeam(partA);
        const teamB = adaptToEngineTeam(partB);
        // Engine spécifique Five si en mode 5v5
        const engineResult = useFive && window.Drafter.FiveEngine
          ? window.Drafter.FiveEngine.runFiveMatch(teamA, teamB)
          : window.Drafter.MatchEngine.runMatch(teamA, teamB);
        result = convertEngineResultToLegacy(engineResult, partA, partB);
        m.engineResult = engineResult;
      } catch (e) {
        console.warn('MatchEngine failed, fallback legacy:', e);
        result = window.Sim.simulateMatch(tpA, tpB, tacA, tacB, { five: useFive });
      }
    } else {
      result = window.Sim.simulateMatch(tpA, tpB, tacA, tacB, { five: useFive });
    }

    m.result = result;
    m.played = true;

    // Bracket 4 joueurs : après les 2 demies, créer finale + 3e place
    if (state.participants.length === 4 && stadiumState.matches.length === 2 &&
        stadiumState.matches.every(mm => mm.played)) {
      const win = stadiumState.matches.map(mm => mm.result.scoreA >= mm.result.scoreB ? mm.a : mm.b);
      const los = stadiumState.matches.map(mm => mm.result.scoreA >= mm.result.scoreB ? mm.b : mm.a);
      stadiumState.matches.push({ a: los[0], b: los[1], type: '3rd', played: false, result: null });
      stadiumState.matches.push({ a: win[0], b: win[1], type: 'final', played: false, result: null });
    }

    playMatchAnimation(m, partA, partB);
  }

  // Adapte un `participant` Drafter (slots {slotId: playerId}) au format engine team
  function adaptToEngineTeam(participant) {
    return {
      name: participant.name,
      formation: participant.formation,
      slots: participant.slots,
      roles: (tacticsState.byParticipant &&
              tacticsState.byParticipant[state.participants.indexOf(participant)] &&
              tacticsState.byParticipant[state.participants.indexOf(participant)].players &&
              Object.fromEntries(Object.entries(tacticsState.byParticipant[state.participants.indexOf(participant)].players)
                .filter(([_, v]) => v && v.role)
                .map(([k, v]) => [k, v.role]))) || {},
      formationDef: FORMATIONS[participant.formation],
      playerById,
    };
  }

  // Convertit le résultat MatchEngine au format Sim.simulateMatch attendu par
  // l'animation existante (path, moments avec t/type/team/text/scorer/scorerId)
  function convertEngineResultToLegacy(eng, partA, partB) {
    const moments = eng.moments.map(mo => {
      // Reconstitue les path[] compatibles (id + slotId)
      const legacyPath = mo.path && mo.path.length
        ? mo.path.map(p => ({ id: p.id, slotId: p.slotId }))
        : (mo.cast ? Object.values(mo.cast).map(c => ({
            id: c.player ? c.player.id : c.id,
            slotId: c.slotId,
          })) : []).filter(p => p && p.id);
      // Type compatible : engine 'goal'|'save'|'miss'|'attempt'|'phase'|... → legacy 'goal'|'save'|'miss'|'turnover'|...
      let legacyType = mo.type;
      if (mo.type === 'attempt') legacyType = 'turnover';
      if (mo.type === 'kickoff') legacyType = 'kickoff';
      if (mo.type === 'halftime') legacyType = 'half';
      if (mo.type === 'fulltime') legacyType = 'end';
      if (mo.type === 'phase') legacyType = 'phase';
      if (mo.type === 'transition') legacyType = 'transition';
      return {
        t: mo.t,
        type: legacyType,
        team: mo.team,
        text: mo.text,
        scorer: mo.scorer && mo.scorer.player ? mo.scorer.player.name : undefined,
        scorerId: mo.scorer && mo.scorer.player ? mo.scorer.player.id : undefined,
        assistId: mo.cast && mo.cast.passer && mo.cast.passer.player ? mo.cast.passer.player.id : undefined,
        path: legacyPath,
        xg: mo.xg,
        // enrichissements engine
        situationKey: mo.situationKey,
        situationLabel: mo.situationLabel,
        phaseId: mo.phaseId,
        phaseLabel: mo.phaseLabel,
        phaseFocus: mo.phaseFocus,
        originZone: mo.originZone,
        targetZone: mo.targetZone,
      };
    });
    return {
      scoreA: eng.scoreA,
      scoreB: eng.scoreB,
      moments,
      stats: {
        A: Object.assign({ possession: eng.stats.A.possession, shots: eng.stats.A.shots,
          onTarget: eng.stats.A.onTarget, xg: eng.stats.A.xg, corners: eng.stats.A.corners, fouls: eng.stats.A.fouls || 0 }),
        B: Object.assign({ possession: eng.stats.B.possession, shots: eng.stats.B.shots,
          onTarget: eng.stats.B.onTarget, xg: eng.stats.B.xg, corners: eng.stats.B.corners, fouls: eng.stats.B.fouls || 0 }),
      },
      contrib: eng.contributions,
      engineMeta: { scenario: eng.scenario, analysis: eng.analysis, gradeA: eng.gradeA, gradeB: eng.gradeB },
    };
  }

  function replayMatch(matchIdx) {
    const m = stadiumState.matches[matchIdx];
    if (!m.played) return;
    playMatchAnimation(m, state.participants[m.a], state.participants[m.b]);
  }

  // ---- Animation ----
  let simAnim = { timeouts: [], skipping: false, speed: 1 };
  function clearSimAnim() { simAnim.timeouts.forEach(t => clearTimeout(t)); simAnim.timeouts = []; }

  const JERSEY_NUMBERS = {
    GK:[1,13], LB:[3,12], RB:[2,12], LWB:[3,12], RWB:[2,12], CB:[4,5,6,15],
    DM:[6,8,16], CM:[8,10,6,14], AM:[10,21], LM:[11,17], RM:[7,17],
    LW:[11,17,22], RW:[7,17,24], CF:[9,19], ST:[9,19,17], SS:[22,27],
  };
  function assignJerseyNumbers(participant) {
    const F = FORMATIONS[participant.formation];
    const used = new Set(); const map = {}; const counts = {};
    F.slots.forEach(slot => {
      counts[slot.type] = (counts[slot.type]||0)+1;
      const pool = JERSEY_NUMBERS[slot.type] || [];
      let num = pool[counts[slot.type]-1] || (counts[slot.type]+20);
      while (used.has(num) && num < 99) num++;
      used.add(num); map[slot.id] = num;
    });
    return map;
  }

  // Couleurs maillots contrastées pour un match
  function kitColors(partA, partB) {
    let a = partA.color.solid, b = partB.color.solid;
    // si trop proches, l'équipe B passe en blanc cassé
    if (closeColor(a, b)) b = '#eef2f6';
    return { a, b };
  }
  function closeColor(h1, h2) {
    const c1 = hexRgb(h1), c2 = hexRgb(h2);
    if (!c1 || !c2) return false;
    const d = Math.abs(c1[0]-c2[0]) + Math.abs(c1[1]-c2[1]) + Math.abs(c1[2]-c2[2]);
    return d < 120;
  }
  function hexRgb(h) {
    const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return null;
    const n = parseInt(m[1], 16); return [(n>>16)&255, (n>>8)&255, n&255];
  }

  const SIMW = 760, SIMH = 480;

  function pawnXY(slot, side) {
    // portrait (x:largeur 0-100, y:profondeur 92=propre but) → paysage
    const margin = 34;
    const depth = 1 - (slot.y / 100);      // 0 propre but → 1 but adverse
    const width = slot.x / 100;
    if (side === 'A') {
      return { x: margin + depth * (SIMW/2 - margin*0.5), y: margin + width * (SIMH - margin*2) };
    } else {
      return { x: SIMW - margin - depth * (SIMW/2 - margin*0.5), y: margin + (1 - width) * (SIMH - margin*2) };
    }
  }

  function playMatchAnimation(m, partA, partB) {
    clearSimAnim();
    simAnim.skipping = false;
    const r = m.result;
    const kits = kitColors(partA, partB);

    // En-tête
    $('#simNameA').textContent = partA.name;
    $('#simNameB').textContent = partB.name;
    const tA = stadiumState.tactics[m.a], tB = stadiumState.tactics[m.b];
    const styA = stadiumState.styles[m.a], styB = stadiumState.styles[m.b];
    $('#simMetaA').textContent = (styA ? window.Sim.STYLES[styA].label : '—') + ' · ' + FORMATIONS[partA.formation].label;
    $('#simMetaB').textContent = (styB ? window.Sim.STYLES[styB].label : '—') + ' · ' + FORMATIONS[partB.formation].label;
    $('#simAvA').style.background = partA.color.grad; $('#simAvA').textContent = initials(partA.name);
    $('#simAvB').style.background = partB.color.grad; $('#simAvB').textContent = initials(partB.name);
    $('#simScoreA').textContent = '0'; $('#simScoreB').textContent = '0';
    $('#simMinute').textContent = "0'";
    const ev = $('#simEvent'); if (ev) ev.textContent = "Coup d'envoi";
    const phasePill = $('#simPhasePill'); if (phasePill) phasePill.textContent = '';
    const stT = $('#stText'); if (stT) stT.textContent = 'Coup d\'envoi imminent';
    const stS = $('#stSituation'); if (stS) stS.textContent = 'Présentation';
    const _simLog = $('#simEvents');
    _simLog.innerHTML = '';
    _simLog.setAttribute('aria-hidden', 'true');
    _simLog.classList.remove('match-report-visible');

    // Terrain
    const pitch = $('#simPitch');
    pitch.setAttribute('viewBox', `0 0 ${SIMW} ${SIMH}`);
    pitch.innerHTML = '';
    const line = 'rgba(255,255,255,0.32)';
    pitch.appendChild(svg('rect', { x:6, y:6, width:SIMW-12, height:SIMH-12, fill:'none', stroke:line, 'stroke-width':2, rx:8 }));
    pitch.appendChild(svg('line', { x1:SIMW/2, y1:6, x2:SIMW/2, y2:SIMH-6, stroke:line, 'stroke-width':2 }));
    pitch.appendChild(svg('circle', { cx:SIMW/2, cy:SIMH/2, r:54, fill:'none', stroke:line, 'stroke-width':2 }));
    pitch.appendChild(svg('circle', { cx:SIMW/2, cy:SIMH/2, r:3, fill:line }));
    pitch.appendChild(svg('rect', { x:6, y:SIMH/2-78, width:66, height:156, fill:'none', stroke:line, 'stroke-width':1.5 }));
    pitch.appendChild(svg('rect', { x:SIMW-72, y:SIMH/2-78, width:66, height:156, fill:'none', stroke:line, 'stroke-width':1.5 }));
    pitch.appendChild(svg('rect', { x:6, y:SIMH/2-30, width:26, height:60, fill:'none', stroke:line, 'stroke-width':1.5 }));
    pitch.appendChild(svg('rect', { x:SIMW-32, y:SIMH/2-30, width:26, height:60, fill:'none', stroke:line, 'stroke-width':1.5 }));

    // Pions
    const numA = assignJerseyNumbers(partA), numB = assignJerseyNumbers(partB);
    const pawnById = {};
    const allPawns = [];
    function buildPawns(part, side, kit, nums, partIdx) {
      const ts = tacticsState.byParticipant && tacticsState.byParticipant[partIdx];
      FORMATIONS[part.formation].slots.forEach(slot => {
        const pid = part.slots[slot.id];
        const pl = pid ? playerById(pid) : null;
        if (!pl) return;   // slot jamais rempli → l'équipe joue VRAIMENT en infériorité
        // Position ajustée selon le rôle (posDx en largeur, posDy en profondeur)
        let adj = { x: 0, y: 0 };
        if (ts && ts.players && ts.players[slot.id] && ts.players[slot.id].sliders) {
          const sl = ts.players[slot.id].sliders;
          // posDy : -20..20 → décalage en profondeur (négatif = plus haut = vers but adverse)
          // posDx : -20..20 → décalage en largeur
          const profSign = side === 'A' ? 1 : -1;
          adj.x = (sl.posDy || 0) * 2.2 * profSign;       // profondeur en X paysage
          adj.y = (sl.posDx || 0) * 1.6;                  // largeur en Y paysage
        }
        const base = pawnXY(slot, side);
        const adjBase = { x: base.x + adj.x, y: base.y + adj.y };
        const g = svg('g', { class: 'sim-pawn-group' });
        const ring = svg('circle', { class:'sim-pawn', cx:adjBase.x, cy:adjBase.y, r:17, fill:kit, stroke:'rgba(0,0,0,0.65)', 'stroke-width':1.8 });
        const num = svg('text', { x:adjBase.x, y:adjBase.y+5, 'text-anchor':'middle', 'font-family':'Inter, sans-serif', 'font-weight':'600',
          'font-size':16, fill: kit === '#eef2f6' ? '#10131a' : '#fff', style:'pointer-events:none' });
        num.textContent = nums[slot.id];
        const nm = svg('text', { x:adjBase.x, y:adjBase.y+33, 'text-anchor':'middle', 'font-family':'JetBrains Mono, monospace',
          'font-size':11, fill:'#fff', 'font-weight':'600', style:'pointer-events:none; text-shadow:0 1px 3px rgba(0,0,0,1)' });
        nm.textContent = pl ? pl.name.split(' ').slice(-1)[0].slice(0,12).toUpperCase() : slot.type;
        g.appendChild(ring); g.appendChild(num); g.appendChild(nm);
        pitch.appendChild(g);
        const obj = { side, base: adjBase, x: adjBase.x, y: adjBase.y, ring, num, nm, g, pid, slotType: slot.type };
        allPawns.push(obj);
        if (pl) pawnById[pl.id] = obj;
      });
    }
    buildPawns(partA, 'A', kits.a, numA, m.a);
    buildPawns(partB, 'B', kits.b, numB, m.b);

    const ball = svg('circle', { class:'sim-ball', cx:SIMW/2, cy:SIMH/2, r:6.5, fill:'#fff', stroke:'#111', 'stroke-width':1.2 });
    pitch.appendChild(ball);

    openModal('#modalSim');

    // Déplacer le bloc d'une équipe vers une profondeur (0 propre but..1 adverse)
    function shiftTeam(side, attackDepth) {
      const dir = side === 'A' ? 1 : -1;
      const push = (attackDepth - 0.5) * 70 * dir;
      allPawns.filter(p => p.side === side).forEach(p => {
        const nx = p.base.x + push;
        p.x = nx; p.ring.setAttribute('cx', nx);
        p.num.setAttribute('x', nx); p.nm.setAttribute('x', nx);
      });
    }
    function resetShape() {
      allPawns.forEach(p => { p.x = p.base.x; p.y = p.base.y;
        p.ring.setAttribute('cx', p.base.x); p.ring.setAttribute('cy', p.base.y);
        p.num.setAttribute('x', p.base.x); p.num.setAttribute('y', p.base.y+4.5);
        p.nm.setAttribute('x', p.base.x); p.nm.setAttribute('y', p.base.y+26);
      });
    }
    function moveBallTo(x, y) {
      ball.setAttribute('cx', x); ball.setAttribute('cy', y);
    }
    function ballToPawn(pid) { const p = pawnById[pid]; if (p) moveBallTo(p.x, p.y); }

    // Bouge un pion physiquement vers (x,y) avec une transition fluide
    function movePawnTo(pawn, x, y) {
      // borne au terrain (les courses élargies pouvaient sortir du cadre)
      x = Math.max(24, Math.min(SIMW - 24, x));
      y = Math.max(24, Math.min(SIMH - 24, y));
      pawn.x = x; pawn.y = y;
      pawn.ring.setAttribute('cx', x); pawn.ring.setAttribute('cy', y);
      pawn.num.setAttribute('x', x);   pawn.num.setAttribute('y', y + 4.5);
      pawn.nm.setAttribute('x', x);    pawn.nm.setAttribute('y', y + 26);
    }
    // Mouvement individuel COHÉRENT : le porteur avance légèrement vers le
    // but adverse (appel court), puis revient à sa position de formation.
    // Pas de chaos : seul le porteur bouge, de façon mesurée et dirigée.
    function pulsePawn(pid, side) {
      const p = pawnById[pid]; if (!p) return;
      p.ring.classList.add('pawn-on-ball');
      const dir = side === 'A' ? 1 : -1;          // A attaque vers la droite
      const baseX = p.baseX != null ? p.baseX : (p.baseX = p.x);
      const baseY = p.baseY != null ? p.baseY : (p.baseY = p.y);
      // COURSE INDIVIDUELLE réaliste : la profondeur dépend du poste —
      // les attaquants plongent DANS la moitié adverse, les milieux
      // accompagnent, les défenseurs sortent court. + variation latérale.
      const RUN = { GK: 0, CB: 36, LB: 70, RB: 70, LWB: 90, RWB: 90,
                    DM: 70, CM: 95, AM: 120, LM: 110, RM: 110,
                    LW: 150, RW: 150, SS: 140, CF: 150, ST: 150 };
      const run = (RUN[p.slotType] != null ? RUN[p.slotType] : 90) * (0.8 + Math.random() * 0.45);
      const lat = (Math.random() - 0.5) * 46;
      movePawnTo(p, baseX + run * dir, baseY + lat);
      setTimeout(() => {
        p.ring.classList.remove('pawn-on-ball');
        movePawnTo(p, baseX, baseY);              // retour à sa zone
      }, 980);
    }

    // === HEAT ZONE : illumine la zone du terrain où se passe l'action ===
    // Map des cellId engine vers coords SVG (proportionnel)
    const ZONE_COORDS = {
      'axis-def':       { sx: 0.50, sy: 0.80 },
      'axis-mid':       { sx: 0.50, sy: 0.50 },
      'axis-att':       { sx: 0.50, sy: 0.22 },
      'axis-box':       { sx: 0.50, sy: 0.10 },
      'left-def':       { sx: 0.16, sy: 0.78 },
      'left-mid':       { sx: 0.16, sy: 0.50 },
      'left-att':       { sx: 0.16, sy: 0.22 },
      'right-def':      { sx: 0.84, sy: 0.78 },
      'right-mid':      { sx: 0.84, sy: 0.50 },
      'right-att':      { sx: 0.84, sy: 0.22 },
      'left-half-def':  { sx: 0.32, sy: 0.78 },
      'left-half-mid':  { sx: 0.32, sy: 0.50 },
      'left-half-att':  { sx: 0.32, sy: 0.22 },
      'right-half-def': { sx: 0.68, sy: 0.78 },
      'right-half-mid': { sx: 0.68, sy: 0.50 },
      'right-half-att': { sx: 0.68, sy: 0.22 },
    };
    function highlightHeatZone(cellId, side, kits) {
      const coords = ZONE_COORDS[cellId];
      if (!coords) return;
      const pitch = $('#simPitch');
      if (!pitch) return;
      // Sens : si side A, la zone "att" est à droite du SVG ; si side B, miroir gauche
      const xPct = side === 'A' ? (1 - coords.sy) : coords.sy;
      const yPct = side === 'A' ? coords.sx : (1 - coords.sx);
      const cx = xPct * SIMW;
      const cy = yPct * SIMH;

      // Cercle radial coloré qui pulse
      const heat = svg('circle', {
        class: 'sim-heat-zone',
        cx, cy, r: 55,
        fill: side === 'A' ? kits.a : kits.b,
        opacity: 0,
      });
      pitch.appendChild(heat);
      // Anime via setAttribute (compat SVG)
      requestAnimationFrame(() => {
        heat.setAttribute('opacity', '0.32');
        heat.setAttribute('r', '85');
      });
      setTimeout(() => {
        heat.setAttribute('opacity', '0');
        setTimeout(() => heat.remove(), 800);
      }, 1400);
    }
    // L'adversaire le plus proche du porteur va le presser AGRESSIVEMENT
    function chaseToward(carrierId, defSide) {
      const c = pawnById[carrierId]; if (!c) return;
      const defenders = allPawns.filter(p => p.side === defSide && p.slotType !== 'GK');
      if (!defenders.length) return;
      // 2 plus proches pressing serré, 1 troisième de couverture
      const sorted = defenders.slice().sort((x, y) => {
        const dx1 = x.x - c.x, dy1 = x.y - c.y;
        const dx2 = y.x - c.x, dy2 = y.y - c.y;
        return (dx1*dx1+dy1*dy1) - (dx2*dx2+dy2*dy2);
      });
      sorted.slice(0, 3).forEach((d, i) => {
        const dx = c.x - d.x, dy = c.y - d.y;
        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
        // i=0 : se rapproche à 22px (duel), i=1 : 40px (soutien), i=2 : 65px (couverture)
        const targetDist = 22 + i * 18;
        const t = Math.max(0, dist - targetDist);
        const nx = d.x + (dx / dist) * t * 0.7;
        const ny = d.y + (dy / dist) * t * 0.7;
        movePawnTo(d, nx, ny);
      });
    }
    // Les coéquipiers du porteur se positionnent en soutien (offrent solutions de passe)
    function supportFor(carrierId, attSide) {
      const c = pawnById[carrierId]; if (!c) return;
      const dir = attSide === 'A' ? 1 : -1;
      const mates = allPawns.filter(p => p.side === attSide && p.pid !== carrierId && p.slotType !== 'GK');
      if (!mates.length) return;
      // 2 coéquipiers les plus proches → se proposent à 60px en avant + sur les côtés
      const sorted = mates.slice().sort((x, y) => {
        const dx1 = x.x - c.x, dy1 = x.y - c.y;
        const dx2 = y.x - c.x, dy2 = y.y - c.y;
        return (dx1*dx1+dy1*dy1) - (dx2*dx2+dy2*dy2);
      });
      // 3 soutiens : 2 proches en appui + 1 attaquant qui plonge en profondeur
      sorted.slice(0, 2).forEach((m, i) => {
        const lateral = (i === 0 ? 1 : -1) * (40 + Math.random() * 20);
        const forward = 45 + Math.random() * 40;
        movePawnTo(m, c.x + forward * dir, c.y + lateral);
      });
      const runner = mates.find(m => ['ST','CF','LW','RW','SS'].includes(m.slotType) && !sorted.slice(0,2).includes(m));
      if (runner) movePawnTo(runner, c.x + (110 + Math.random() * 50) * dir, runner.y + (Math.random() - 0.5) * 40);
    }
    // Le gardien suit la trajectoire de l'attaque (latéralement)
    function gkTrack(attSide) {
      const defSide = attSide === 'A' ? 'B' : 'A';
      const gk = allPawns.find(p => p.side === defSide && p.slotType === 'GK');
      if (!gk) return;
      const carrier = ball ? { x: +ball.getAttribute('cx'), y: +ball.getAttribute('cy') } : null;
      if (!carrier) return;
      // GK reste sur sa ligne mais suit le ballon latéralement (±20px max)
      const dy = Math.max(-22, Math.min(22, carrier.y - gk.base.y));
      movePawnTo(gk, gk.base.x, gk.base.y + dy);
    }

    // ---- Construire la séquence d'animation (hops) à partir des moments ----
    const HOP = 920 / simAnim.speed;       // ralenti — vraiment voir l'action
    const PAUSE = 580 / simAnim.speed;
    let cum = 0;
    let liveScore = { a:0, b:0 };

    function schedule(fn, dur) { const t = setTimeout(() => { if(!simAnim.skipping) fn(); }, cum); simAnim.timeouts.push(t); cum += dur; }

    // Helper d'update du timer + horloge fluide entre moments
    function setMinute(t) { $('#simMinute').textContent = (t|0) + "'"; }
    let lastMinute = 0;
    function rampMinuteTo(target, dur) {
      const from = lastMinute;
      const start = performance.now();
      const step = (now) => {
        if (simAnim.skipping) return;
        const k = Math.min(1, (now - start) / dur);
        const cur = from + (target - from) * k;
        setMinute(cur);
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      lastMinute = target;
    }

    // ===== Ticker animé (UNE seule ligne narrative à la fois) =====
    function updateTicker(text, situation, options) {
      options = options || {};
      const stText = $('#stText');
      const stSit = $('#stSituation');
      if (!stText || !stSit) return;
      // Animate by re-attaching (CSS animation runs again)
      stText.textContent = text || '';
      stText.classList.remove('goal');
      if (options.goal) stText.classList.add('goal');
      // Trigger reflow to restart animation
      stText.style.animation = 'none'; void stText.offsetWidth; stText.style.animation = '';
      stSit.textContent = situation || '';
    }

    // ===== Phase banner =====
    function showPhaseBanner(title, sub) {
      const b = $('#simPhaseBanner');
      const t = $('#spbTitle');
      const s = $('#spbSub');
      const wrap = $('.sim-pitch-wrap');
      if (!b || !t) return;
      t.textContent = title || 'Phase';
      if (s) s.textContent = sub || '';
      b.classList.remove('active');
      void b.offsetWidth;
      b.classList.add('active');
      wrap && wrap.classList.add('phase-active');
      setTimeout(() => wrap && wrap.classList.remove('phase-active'), 2200);
      // Pill update
      const pill = $('#simPhasePill');
      if (pill) {
        pill.textContent = title || '';
      }
    }

    // ===== Score avec bump animé =====
    function bumpScore(side) {
      const el = $(side === 'A' ? '#simScoreA' : '#simScoreB');
      if (!el) return;
      el.textContent = liveScore[side === 'A' ? 'a' : 'b'];
      el.classList.remove('bump');
      void el.offsetWidth;
      el.classList.add('bump');
      setTimeout(() => el.classList.remove('bump'), 800);
    }

    // ===== Map du focus de phase vers libellé FR =====
    const phaseLabels = {
      'observation': { fr: 'Observation',   sub: 'Les deux équipes prennent leurs marques' },
      'ascendant':   { fr: 'Ascendant',     sub: 'Une équipe pose son emprise' },
      'fin-mt':      { fr: 'Fin de période',sub: 'Dernières minutes avant la pause' },
      'reajustement':{ fr: 'Réajustement',  sub: 'Reprise — ajustements tactiques' },
      'tournant':    { fr: 'Tournant',      sub: 'Le tournant du match approche' },
      'finale':      { fr: 'Finale',        sub: 'Dernières minutes, intensité maximale' },
    };

    // ===== Set initial du ticker =====
    schedule(() => { updateTicker('Coup d\'envoi', 'Lancement du match'); }, 0);

    r.moments.forEach(mo => {
      if (mo.type === 'kickoff') {
        schedule(() => {
          setMinute(0); lastMinute = 0;
          resetShape();
          moveBallTo(SIMW/2, SIMH/2);
          updateTicker('Coup d\'envoi', 'Le match commence');
        }, HOP);
        return;
      }
      if (mo.type === 'phase') {
        const labelMeta = phaseLabels[mo.phaseLabel || mo.phaseFocus] || { fr: mo.text || 'Nouvelle phase', sub: '' };
        schedule(() => {
          rampMinuteTo(mo.t, HOP * 0.7);
          showPhaseBanner(labelMeta.fr, labelMeta.sub);
        }, HOP);
        return;
      }
      if (mo.type === 'half') {
        schedule(() => {
          rampMinuteTo(mo.t, HOP*1.4);
          showPhaseBanner('Mi-temps', 'Pause');
          resetShape();
          moveBallTo(SIMW/2, SIMH/2);
        }, HOP*2.0);
        return;
      }
      if (mo.type === 'end') {
        schedule(() => {
          rampMinuteTo(mo.t, HOP*0.8);
          showPhaseBanner('Terminé', mo.text || 'Coup de sifflet final');
          renderTournament();
        }, HOP);
        return;
      }
      if (mo.type === 'transition') {
        schedule(() => {
          rampMinuteTo(mo.t, HOP * 0.5);
          updateTicker(mo.text || 'Transition au milieu', 'Transition');
        }, HOP * 0.5);
        return;
      }
      if (mo.type === 'foul' || mo.type === 'card' || mo.type === 'corner' || mo.type === 'freekick') {
        schedule(() => {
          rampMinuteTo(mo.t, HOP*0.9);
          const tag = mo.type === 'card' ? (mo.card === 'red' ? 'Carton rouge' : 'Carton') :
                      mo.type === 'corner' ? 'Corner' :
                      mo.type === 'freekick' ? 'Coup franc' : 'Faute';
          updateTicker(mo.text || tag, tag);
          pushLog(mo);
        }, HOP*1.4);
        return;
      }

      const side = mo.team;
      if (!side) return;
      const attackDepth = mo.type === 'goal' ? 0.95 : mo.type === 'save' || mo.type === 'miss' ? 0.82 : 0.62;
      // Update visuel : ticker + déplacement bloc
      schedule(() => {
        rampMinuteTo(mo.t, HOP * 0.8);
        const sitTag = mo.situationLabel || (mo.type === 'save' ? 'Parade' : mo.type === 'miss' ? 'Tir manqué' : 'Action');
        updateTicker(mo.text, sitTag);
        shiftTeam(side, attackDepth);
        shiftTeam(side === 'A' ? 'B' : 'A', 1 - attackDepth * 0.85);
      }, 0);

      // hops sur la trajectoire — modèle "intentions" plus que mouvement physique :
      // - ballon transite vers chaque pion impliqué (passe visible)
      // - pion porteur pulse subtilement (pas de course)
      // - heat zone s'allume sur la zone d'action (targetZone si dispo)
      // → finis les 22 pions qui s'agitent
      const path = (mo.path || []).filter(p => p && p.id && pawnById[p.id]);
      // Active la heat zone correspondante AU DÉBUT de l'action
      if (mo.targetZone || mo.originZone) {
        schedule(() => {
          highlightHeatZone(mo.targetZone || mo.originZone, side, kits);
        }, 0);
      }
      path.forEach((pt, idx) => {
        schedule(() => {
          ballToPawn(pt.id);
          pulsePawn(pt.id, side);
          drawPassTrace(pawnById, path, idx, side, kits);
        }, HOP);
      });

      if (mo.type === 'goal') {
        schedule(() => {
          const gx = side === 'A' ? SIMW-10 : 10;
          moveBallTo(gx, SIMH/2 + (Math.random()*70-35));
          liveScore[side==='A'?'a':'b']++;
          bumpScore(side);
          updateTicker('⚽ BUT — ' + (mo.scorer || mo.text || 'But !'), 'But', { goal: true });
          pushLog(mo, true);
          goalCelebration(mo, side === 'A' ? partA : partB, side === 'A' ? kits.a : kits.b);
        }, HOP*1.2);
        schedule(() => { resetShape(); moveBallTo(SIMW/2, SIMH/2); }, PAUSE*2.4);
      } else if (mo.type === 'save' || mo.type === 'miss') {
        schedule(() => { pushLog(mo); }, PAUSE*1.6);
      } else {
        schedule(() => { pushLog(mo); }, PAUSE);
      }
    });

    // fin d'anim : afficher rapport
    schedule(() => { showMatchReport(m, partA, partB); }, 200);

    function pushLog(mo, isGoal) {
      const log = $('#simEvents');
      const liNode = el('div', { class: 'sim-event-line' + (isGoal ? ' goal' : (mo.type==='card'?' card':'')) });
      liNode.appendChild(el('span', { class:'ev-time' }, mo.t + "'"));
      liNode.appendChild(el('span', { class:'ev-text' }, mo.text));
      log.appendChild(liNode);
      log.scrollTop = log.scrollHeight;
    }
  }

  // Trace visuelle d'une passe (segment estompé)
  function drawPassTrace(pawnById, path, idx, side, kits) {
    if (idx === 0) return;
    const from = path[idx-1], to = path[idx];
    const a = pawnById[from.id], b = pawnById[to.id];
    if (!a || !b) return;
    const ln = svg('line', { class:'sim-pass-line', x1:a.x, y1:a.y, x2:b.x, y2:b.y,
      stroke: side==='A'?kits.a:kits.b, 'stroke-width':2 });
    $('#simPitch').appendChild(ln);
    setTimeout(() => ln.remove(), 700);
  }

  function goalCelebration(mo, part, kit) {
    const wrap = $('.sim-pitch-wrap');
    const flash = el('div', { class:'sim-goal-flash' });
    wrap.appendChild(flash);
    const banner = el('div', { class:'sim-goal-banner' });
    banner.innerHTML = '<div class="gb-but">BUT&nbsp;!</div><div class="gb-scorer">' +
      (mo.scorer || '') + '</div><div class="gb-team">' + part.name + '</div>';
    banner.style.setProperty('--kit', kit);
    wrap.appendChild(banner);
    setTimeout(() => { flash.remove(); }, 1300);
    setTimeout(() => { banner.remove(); }, 2200);
  }

  function showMatchReport(m, partA, partB) {
    const r = m.result;
    const tpA = stadiumState.profiles[m.a], tpB = stadiumState.profiles[m.b];
    const tacA = stadiumState.tactics[m.a] || window.Sim.STYLES.equilibre.tactics;
    const tacB = stadiumState.tactics[m.b] || window.Sim.STYLES.equilibre.tactics;
    const rep = window.Sim.matchReport(partA.name, partB.name, tpA, tpB, tacA, tacB, r);

    const stT = $('#stText');
    if (stT) stT.textContent = rep.winner ? (rep.winner + ' s\'impose ' + r.scoreA + ' - ' + r.scoreB) : 'Match nul ' + r.scoreA + ' - ' + r.scoreB;
    const stS = $('#stSituation');
    if (stS) stS.textContent = 'Coup de sifflet final';

    // === Extraction des buteurs depuis les moments ===
    const goalsA = [], goalsB = [];
    (r.moments || []).forEach(mo => {
      if (mo.type === 'goal') {
        const scorerName = mo.scorer || (mo.text || '').replace(/^⚽?\s*(BUT\s*!?\s*)?/i, '').split(/[—,]/)[0].trim();
        const entry = { name: scorerName || 'But', minute: mo.t };
        if (mo.team === 'A') goalsA.push(entry); else goalsB.push(entry);
      }
    });

    // === Notes + MVP ===
    const ratingsA = computePlayerRatings(partA, tpA, r, 'A');
    const ratingsB = computePlayerRatings(partB, tpB, r, 'B');
    const allRated = ratingsA.concat(ratingsB);
    const mvp = allRated.slice().sort((a, b) => b.rating - a.rating)[0];

    // === Construit la feuille de match dans #simEvents (révélé) ===
    const log = $('#simEvents');
    log.setAttribute('aria-hidden', 'false');
    log.classList.add('match-report-visible');
    log.innerHTML = '';

    const card = el('div', { class: 'sim-report' });

    // 1. En-tête score
    const head = el('div', { class: 'sr-scoreline' });
    head.innerHTML =
      `<div class="sr-team ${r.scoreA>=r.scoreB?'win':''}"><span class="sr-tname">${partA.name}</span></div>` +
      `<div class="sr-score">${r.scoreA} <span>–</span> ${r.scoreB}</div>` +
      `<div class="sr-team ${r.scoreB>=r.scoreA?'win':''}"><span class="sr-tname">${partB.name}</span></div>`;
    card.appendChild(head);

    // 2. Buteurs (style FlashScore avec icône ballon)
    if (goalsA.length || goalsB.length) {
      const scorers = el('div', { class: 'sr-scorers' });
      const colA = el('div', { class: 'sr-scorers-col left' });
      goalsA.forEach(g => {
        const it = el('div', { class: 'sr-goal' });
        it.innerHTML = `<span class="sr-gname">${g.name}</span> <span class="sr-gmin">${g.minute}'</span> <span class="sr-gicon">⚽</span>`;
        colA.appendChild(it);
      });
      const colB = el('div', { class: 'sr-scorers-col right' });
      goalsB.forEach(g => {
        const it = el('div', { class: 'sr-goal' });
        it.innerHTML = `<span class="sr-gicon">⚽</span> <span class="sr-gmin">${g.minute}'</span> <span class="sr-gname">${g.name}</span>`;
        colB.appendChild(it);
      });
      scorers.appendChild(colA);
      scorers.appendChild(colB);
      card.appendChild(scorers);
    }

    // 3. MVP
    if (mvp) {
      const mvpEl = el('div', { class: 'sr-mvp' });
      mvpEl.innerHTML = `<span class="sr-mvp-badge">★ MVP</span> <span class="sr-mvp-name">${mvp.name}</span> <span class="sr-mvp-note">${mvp.rating.toFixed(1)}</span>`;
      card.appendChild(mvpEl);
    }

    // 4. Résumé narratif court
    if (rep.lines && rep.lines.length) {
      const summary = el('div', { class: 'sr-summary' });
      rep.lines.slice(0, 3).forEach(l => {
        const p = el('div', { class: 'sr-line' });
        p.innerHTML = l.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        summary.appendChild(p);
      });
      card.appendChild(summary);
    }

    // 5. Stats principales (barres comparatives)
    const deepA = computeDeepStats(r, tpA, 'A');
    const deepB = computeDeepStats(r, tpB, 'B');
    const statRows = [
      ['Possession', r.stats.A.possession, r.stats.B.possession, '%'],
      ['Tirs', r.stats.A.shots, r.stats.B.shots, ''],
      ['Cadrés', r.stats.A.onTarget, r.stats.B.onTarget, ''],
      ['xG', r.stats.A.xg, r.stats.B.xg, ''],
      ['Passes %', deepA.passAcc, deepB.passAcc, '%'],
      ['Duels gagnés', deepA.duels, deepB.duels, ''],
    ];
    const stats = el('div', { class: 'sr-statbars' });
    statRows.forEach(([label, a, b, unit]) => {
      const total = (parseFloat(a) + parseFloat(b)) || 1;
      const pctA = Math.round(parseFloat(a) / total * 100);
      const row = el('div', { class: 'sr-statbar' });
      row.innerHTML =
        `<span class="sr-sb-a">${a}${unit}</span>` +
        `<div class="sr-sb-track"><div class="sr-sb-fill-a" style="width:${pctA}%"></div><div class="sr-sb-fill-b" style="width:${100-pctA}%"></div></div>` +
        `<span class="sr-sb-b">${b}${unit}</span>`;
      const lbl = el('div', { class: 'sr-sb-label' }, label);
      const wrap = el('div', { class: 'sr-sb-wrap' });
      wrap.appendChild(lbl); wrap.appendChild(row);
      stats.appendChild(wrap);
    });
    card.appendChild(stats);

    // 6. Notes individuelles (2 colonnes)
    card.appendChild(el('div', { class: 'sr-rating-title' }, 'Notes des joueurs'));
    const ratingsBox = el('div', { class: 'sr-ratings' });
    [[partA, ratingsA], [partB, ratingsB]].forEach(([part, ratings]) => {
      const col = el('div', { class: 'sr-rating-col' });
      col.appendChild(el('div', { class: 'sr-rating-team' }, part.name));
      ratings.forEach(p => {
        const row = el('div', { class: 'sr-rating-row' });
        row.appendChild(el('span', { class: 'sr-rp-pos' }, p.slotType));
        row.appendChild(el('span', { class: 'sr-rp-name' }, p.name));
        const noteClass = p.rating >= 7.5 ? 'great' : p.rating >= 6.5 ? 'good' : p.rating >= 5.5 ? 'mid' : 'bad';
        row.appendChild(el('span', { class: 'sr-rp-note ' + noteClass }, p.rating.toFixed(1)));
        col.appendChild(row);
      });
      ratingsBox.appendChild(col);
    });
    card.appendChild(ratingsBox);

    log.appendChild(card);
  }

  // Calcule des stats avancées à partir du résultat de la sim
  function computeDeepStats(r, tp, side) {
    const possession = r.stats[side].possession;
    const shots = r.stats[side].shots;
    const xg = parseFloat(r.stats[side].xg) || 0;
    // Passes : proportionnel à possession × niveau de jeu
    const passQuality = tp ? (tp.midControl || 50) : 50;
    const totalPasses = Math.round(possession * (5 + passQuality / 20));
    const accuracy = Math.round(78 + (passQuality - 50) * 0.18);
    const duels = Math.round(20 + Math.random() * 20 + (tp && tp.defense ? (tp.defense - 60) * 0.3 : 0));
    const thirdFinal = Math.min(95, Math.round(possession * 0.45 + xg * 8));
    const fouls = Math.round(8 + Math.random() * 8);
    return { passes: totalPasses, passAcc: accuracy, duels, thirdFinal, fouls };
  }

  // Calcule des notes individuelles 1-10 par joueur
  function computePlayerRatings(participant, tp, result, side) {
    if (!tp || !tp.players) return [];
    const won = side === 'A' ? result.scoreA > result.scoreB : result.scoreB > result.scoreA;
    const draw = result.scoreA === result.scoreB;
    return tp.players.map(p => {
      const base = 6.0;
      // Boost si joueur naturellement bon
      const skillBoost = (((p.att||60) + (p.cre||60) + (p.def||60) + (p.tec||60)) / 4 - 60) / 12;
      // Bonus victoire / nul
      const resBonus = won ? 0.4 : draw ? 0 : -0.4;
      // Pénalité hors poste
      const fitPenalty = p.fitMode === 'sec' ? -0.8 : p.fitMode === 'off' ? -1.6 : 0;
      // Bruit
      const noise = (Math.random() - 0.5) * 1.4;
      let rating = base + skillBoost + resBonus + fitPenalty + noise;
      // Bonus si participe aux buts (heuristique : attaquant et équipe a marqué)
      const teamScore = side === 'A' ? result.scoreA : result.scoreB;
      if (['ST','CF','SS','LW','RW','AM'].includes(p.slotType) && teamScore > 0) rating += 0.4 + Math.random() * 0.6;
      // GK : note inverse du nombre de buts encaissés
      if (p.slotType === 'GK') {
        const ga = side === 'A' ? result.scoreB : result.scoreA;
        rating = 7.0 - ga * 0.6 + (Math.random() - 0.5) * 0.5;
      }
      rating = Math.max(3.0, Math.min(9.5, rating));
      return {
        name: (p.player && p.player.name || '—').split(' ').slice(-1)[0],
        slotType: p.slotType,
        rating,
      };
    }).sort((a, b) => b.rating - a.rating);
  }

  function svg(tag, attrs) {
    const ns = 'http://www.w3.org/2000/svg';
    const node = document.createElementNS(ns, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, v));
    return node;
  }

  function playAllMatches() {
    const playNext = (i) => {
      if (i >= stadiumState.matches.length) return;
      if (stadiumState.matches[i].played) return playNext(i + 1);
      playMatch(i);
      setTimeout(() => {
        closeModal('#modalSim');
        renderTournament();
        setTimeout(() => playNext(i + 1), 500);
      }, estimateSimDuration(stadiumState.matches[i]));
    };
    playNext(0);
  }

  function estimateSimDuration(m) {
    if (!m.result) return 8000;
    let hops = 0;
    m.result.moments.forEach(mo => { hops += 1 + ((mo.path||[]).length); if (mo.type==='goal') hops += 3; });
    return Math.min(180000, hops * (920 / simAnim.speed) + 5000);
  }

  // ============================================================
  // MODE FIVE (5v5)
  // ============================================================
  const FIVE_FORMATIONS = window.FIVE_FORMATIONS || {};
  let fiveTeam = null;   // { formation, slots, name }
  let fiveBudget = 200;

  function initFiveScreen() {
    // populate formations
    const sel = $('#fiveFormation');
    if (sel && sel.children.length === 0) {
      Object.keys(FIVE_FORMATIONS).forEach((k, i) => {
        const opt = el('option', { value: k }, FIVE_FORMATIONS[k].label);
        if (i === 0) opt.setAttribute('selected', '');
        sel.appendChild(opt);
      });
    }
    fiveBudget = +($('#fiveBudget').value || 200);
    $('#fiveBudgetVal').textContent = String(fiveBudget);
    fiveTeam = { formation: sel.value, slots: {}, name: $('#fiveName').value || 'Toi' };
    Object.keys(FIVE_FORMATIONS[fiveTeam.formation].slots || {}).forEach(() => {});
    FIVE_FORMATIONS[fiveTeam.formation].slots.forEach(s => fiveTeam.slots[s.id] = null);
    renderFivePitch();

    // bindings
    sel.onchange = () => {
      fiveTeam.formation = sel.value;
      fiveTeam.slots = {};
      FIVE_FORMATIONS[fiveTeam.formation].slots.forEach(s => fiveTeam.slots[s.id] = null);
      renderFivePitch();
      validateFive();
    };
    $('#fiveBudget').oninput = () => {
      fiveBudget = +$('#fiveBudget').value;
      $('#fiveBudgetVal').textContent = String(fiveBudget);
      validateFive();
    };
    $('#fiveName').oninput = () => { fiveTeam.name = $('#fiveName').value || 'Toi'; };
    $('#fiveBack').onclick = () => showScreen('setup');
    $('#fiveStart').onclick = startFiveSimulation;
    $$('#fiveOppLevel button').forEach(b => b.onclick = () => {
      $$('#fiveOppLevel button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
    });
  }

  function renderFivePitch() {
    const mount = $('#fivePitch');
    mount.innerHTML = '';
    mount.classList.add('pitch-street');   // ambiance street/urbain pour le 5v5
    appendPitchFeatures(mount);
    const F = FIVE_FORMATIONS[fiveTeam.formation];
    F.slots.forEach(slot => {
      const pid = fiveTeam.slots[slot.id];
      const pl = pid ? playerById(pid) : null;
      const slotEl = el('div', {
        class: 'slot' + (pl ? ' filled' : ''),
        style: `left:${slot.x}%; top:${slot.y}%`,
        'data-sid': slot.id,
      });
      const bubble = el('div', { class: 'slot-bubble' });
      if (pl) {
        const ph = el('div', { class: 'slot-photo', style: `background:${gradientFor(pl)}` });
        attachPhoto(ph, pl, 'slot-photo-img');
        ph.appendChild(el('span', { class: 'slot-photo-fb' }, initials(pl)));
        bubble.appendChild(ph);
      } else { bubble.appendChild(el('span', {}, slot.type)); }
      slotEl.appendChild(bubble);
      slotEl.appendChild(el('div', { class: 'slot-name' },
        pl ? pl.name.split(' ').slice(-1)[0].toUpperCase() + ' · ' + pl.value + 'M' : slot.type));
      slotEl.addEventListener('click', () => openFivePicker(slot));
      mount.appendChild(slotEl);
    });
    validateFive();
  }

  function validateFive() {
    const total = Object.values(fiveTeam.slots).filter(Boolean).length;
    const spent = Object.values(fiveTeam.slots).filter(Boolean)
      .reduce((s, id) => s + (playerById(id) ? (playerById(id).value || 0) : 0), 0);
    $('#fiveStart').disabled = total < 5 || spent > fiveBudget;
  }

  let fivePickerSlot = null;
  function openFivePicker(slot) {
    fivePickerSlot = slot;
    pickerState.slot = slot;
    pickerState.target = 'five';
    pickerState.acceptedPositionsOverride = null;
    pickerState.search = ''; pickerState.age = 'all'; pickerState.league = ''; pickerState.club = '';
    pickerState.affordable = true;
    const toolbar = $('.picker-toolbar'); if (toolbar) toolbar.style.display = '';
    $('#pickerEyebrow').textContent = '/ FIVE · POSTE ' + slot.type;
    $('#pickerTitle').textContent = 'Choisis ton ' + (POS_LABEL_FR[slot.type] || slot.type);
    $('#pickerSearch').value = '';
    $$('#pickerAge .chip').forEach(c => c.classList.remove('active'));
    $$('#pickerAge .chip')[0].classList.add('active');
    $('#pickerAffordable').checked = true;
    // dropdowns
    const accepted = SLOT_RULES[slot.type] || [];
    const cand = PLAYERS.filter(p => inDraftPool(p) && p.positions.some(pp => accepted.includes(pp)));
    const leagues = Array.from(new Set(cand.map(p => p.league))).sort();
    $('#pickerLeague').innerHTML = '<option value="">Tous championnats</option>' + leagues.map(l => `<option>${l}</option>`).join('');
    const clubs = Array.from(new Set(cand.map(p => p.club))).sort();
    $('#pickerClub').innerHTML = '<option value="">Tous clubs</option>' + clubs.map(c => `<option>${c}</option>`).join('');
    openModal('#modalPicker');
    setTimeout(() => $('#pickerSearch').focus(), 60);
    renderPickerFive();
  }
  function renderPickerFive() {
    const slot = pickerState.slot;
    const accepted = SLOT_RULES[slot.type] || [];
    let list = PLAYERS.filter(p => inDraftPool(p) && p.positions.some(pp => accepted.includes(pp)));
    if (pickerState.search) list = list.filter(p => normSearch(p.name).includes(pickerState.search));
    if (pickerState.age === 'u21') list = list.filter(p => p.age < 21);
    else if (pickerState.age === 'u25') list = list.filter(p => p.age < 25);
    else if (pickerState.age === 'o30') list = list.filter(p => p.age >= 30);
    if (pickerState.league) list = list.filter(p => p.league === pickerState.league);
    if (pickerState.club) list = list.filter(p => p.club === pickerState.club);
    // déjà piochés
    const taken = new Set(Object.values(fiveTeam.slots).filter(Boolean));
    list = list.filter(p => !taken.has(p.id));
    if (pickerState.affordable) {
      const spent = Object.values(fiveTeam.slots).filter(Boolean).reduce((s, id) => s + (playerById(id) ? playerById(id).value || 0 : 0), 0);
      const remain = fiveBudget - spent;
      list = list.filter(p => p.value <= remain);
    }
    list.sort((a, b) => b.value - a.value);
    const grid = $('#pickerGrid'); grid.innerHTML = '';
    $('#pickerStats').textContent = `${list.length} JOUEUR(S) DISPONIBLE(S)`;
    list.slice(0, 120).forEach(p => grid.appendChild(buildFivePickerRow(p)));
  }
  function buildFivePickerRow(p) {
    const row = el('div', { class: 'player-row glow' });
    const photo = el('div', { class: 'pr-photo', style: `background:${gradientFor(p)}` });
    attachPhoto(photo, p, '');
    photo.appendChild(el('span', {}, initials(p)));
    row.appendChild(photo);
    const info = el('div', { class: 'pr-info' });
    info.appendChild(el('div', { class: 'pr-name' }, p.name));
    const meta = el('div', { class: 'pr-meta' });
    p.positions.forEach(pos => meta.appendChild(el('span', { class: 'pos' }, pos)));
    meta.appendChild(el('span', { class: 'age' }, p.age + ' ans'));
    meta.appendChild(el('span', { class: 'club' }, '· ' + p.club));
    info.appendChild(meta);
    row.appendChild(info);
    row.appendChild(el('div', { class: 'pr-price' }, p.value + ' M€'));
    row.addEventListener('click', () => {
      fiveTeam.slots[fivePickerSlot.id] = p.id;
      closeModal('#modalPicker');
      renderFivePitch();
    });
    return row;
  }

  function startFiveSimulation() {
    // Construit l'adversaire IA
    const level = $('#fiveOppLevel button.active')?.dataset.val || 'medium';
    const oppBudget = level === 'easy' ? Math.round(fiveBudget * 0.7)
                    : level === 'hard' ? Math.round(fiveBudget * 1.2)
                    : fiveBudget;
    const oppFormationKeys = Object.keys(FIVE_FORMATIONS);
    const oppFK = oppFormationKeys[Math.floor(Math.random() * oppFormationKeys.length)];
    const TOP5 = ['Premier League','La Liga','Bundesliga','Serie A','Ligue 1'];
    const pool = PLAYERS.filter(p => TOP5.includes(p.league)).slice().sort((a, b) => b.value - a.value);
    const oppSlots = {};
    const used = new Set(Object.values(fiveTeam.slots).filter(Boolean));
    let remain = oppBudget;
    FIVE_FORMATIONS[oppFK].slots.forEach(s => {
      const acc = SLOT_RULES[s.type] || [];
      const cand = pool.filter(p => !used.has(p.id) && p.value <= remain && p.positions.some(pp => acc.includes(pp)));
      if (!cand.length) return;
      // pick somewhere in the top of affordable list
      const top = cand.slice(0, Math.min(15, cand.length));
      const pick = top[Math.floor(Math.random() * top.length)];
      oppSlots[s.id] = pick.id; used.add(pick.id); remain -= pick.value;
    });

    // Construit deux participants pour la sim
    const A = { id: 'me', name: fiveTeam.name, formation: fiveTeam.formation, slots: fiveTeam.slots, color: TEAM_COLORS[0] };
    const B = { id: 'ai', name: 'IA ' + (level==='easy'?'Amateur':level==='hard'?'Élite':'Confirmé'), formation: oppFK, slots: oppSlots, color: TEAM_COLORS[1] };

    // Sauvegarde temporaire de state participants
    const backup = state.participants.slice();
    state.participants = [A, B];
    // Hack pour utiliser FIVE_FORMATIONS sur le simulateur : on injecte temporairement
    const SAVED_FORM = Object.assign({}, FORMATIONS);
    Object.assign(FORMATIONS, FIVE_FORMATIONS);
    stadiumState.styles = ['equilibre', 'equilibre'];
    stadiumState.tactics = [window.Sim.STYLES.equilibre.tactics, window.Sim.STYLES.equilibre.tactics];
    stadiumState.scores = [
      window.Sim.computeTeamScore(A, FORMATIONS, SLOT_RULES, playerById, stadiumState.tactics[0]),
      window.Sim.computeTeamScore(B, FORMATIONS, SLOT_RULES, playerById, stadiumState.tactics[1]),
    ];
    stadiumState.profiles = [
      window.Sim.teamProfile(A, FORMATIONS, playerById, stadiumState.tactics[0]),
      window.Sim.teamProfile(B, FORMATIONS, playerById, stadiumState.tactics[1]),
    ];
    stadiumState.matches = [{ a: 0, b: 1, type: 'five', played: false, result: null }];
    state.matchMode = 'five';
    // Switch écran stadium
    showScreen('stadium');
    renderTeamScores();
    renderTournament();
    // Lancer
    setTimeout(() => playMatch(0), 400);
    // après simulation, on restaure
    setTimeout(() => {
      // restauration différée (laisse la simulation finir)
    }, 100);
    // store restore handles
    state._fiveRestore = () => {
      Object.keys(FORMATIONS).forEach(k => { if (!SAVED_FORM[k]) delete FORMATIONS[k]; });
      Object.assign(FORMATIONS, SAVED_FORM);
      state.participants = backup;
      state.matchMode = null;
    };
  }

  // ============================================================
  // MODE JUSTE PRIX
  // ============================================================
  function initJusteScreen() {
    window.JustePrix.init(REAL_PLAYERS);
    $('#justeBack').onclick = () => { showScreen('setup'); routeMode('juste'); };
    // Buttons sur l'ECRAN juste (post-bascule)
    $$('#screen-juste .juste-variant').forEach(b => b.onclick = () => {
      const v = b.dataset.variant;
      if (v === 'updown') startUpDownGame();
      else if (v === 'multi') showMultiSetup();
    });
  }

  // Buttons INLINE depuis le setup
  function bindInlineJusteSetup() {
    if (!window.JustePrix) return;
    window.JustePrix.init(REAL_PLAYERS || PLAYERS);
    $$('#setupJustePanel .juste-variant').forEach(b => {
      b.onclick = () => {
        const v = b.dataset.variant;
        // bascule sur l'écran juste prix et démarre
        showScreen('juste');
        if (v === 'updown') startUpDownGame();
        else if (v === 'multi') showMultiSetup();
      };
    });
    // Bouton "Lancer" optionnel : lance la dernière variante choisie ou updown par défaut
    const startBtn = $('#justeStartInline');
    if (startBtn) startBtn.onclick = () => {
      showScreen('juste');
      startUpDownGame();
    };
  }

  function startUpDownGame() {
    $('#justeUpDown').style.display = 'block';
    $('#justeMulti').style.display = 'none';
    const s = window.JustePrix.startUpDown();
    renderUpDown(s);
    $('#justeLower').onclick = () => answerUp('lower');
    $('#justeHigher').onclick = () => answerUp('higher');
  }
  function renderUpDown(s) {
    fillJusteCard('#justeA', s.current, false);
    fillJusteCard('#justeB', s.next, true);
    const livesEl = $('#justeLives');
    livesEl.innerHTML = '';
    const HEART = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 21s-7-4.5-9.5-9.5C0.5 7 3.5 3 7 3c2 0 3.5 1.2 5 3 1.5-1.8 3-3 5-3 3.5 0 6.5 4 4.5 8.5C19 16.5 12 21 12 21z"/></svg>';
    for (let i = 0; i < 3; i++) {
      const span = document.createElement('span');
      span.className = 'life' + (i < s.lives ? ' on' : ' off');
      span.innerHTML = HEART;
      livesEl.appendChild(span);
    }
    $('#justeScore').textContent = String(s.score);
    $('#justeFeedback').textContent = '';
    $('#justeFeedback').className = 'juste-feedback';
  }
  function fillJusteCard(sel, player, hidden) {
    const card = $(sel);
    const photoBox = card.querySelector('.jp-photo');
    photoBox.innerHTML = '';
    // Cascade FIABLE : Sofifa _240 (toujours dispo) → Fotmob → TM medium → initiales
    // (Sofascore et TM /header/ sont parfois bloqués par CORS, on les évite ici)
    const candidates = [];
    if (player.sofifa) candidates.push(player.sofifa.replace(/_120\.png$/, '_240.png'));
    if (player.sofifa) candidates.push(player.sofifa);  // fallback _120 si _240 manque
    if (player.fot)    candidates.push('https://images.fotmob.com/image_resources/playerimages/' + player.fot + '.png');
    if (player.tmid)   candidates.push('https://img.a.transfermarkt.technology/portrait/medium/' + player.tmid + '-1.jpg');
    if (player.photo)  candidates.push(player.photo);
    // dédoublonne
    const seen = new Set();
    const dedup = candidates.filter(u => u && !seen.has(u) && seen.add(u));
    // Affiche l'initiale tout de suite (placeholder visible immédiat)
    const initialsEl = document.createElement('span');
    initialsEl.className = 'jp-initials';
    initialsEl.textContent = initials(player);
    photoBox.appendChild(initialsEl);
    // Essaie la cascade en arrière-plan
    function tryNext(idx) {
      if (idx >= dedup.length) return;  // garde l'initiale
      const img = new Image();
      img.referrerPolicy = 'no-referrer';
      img.decoding = 'async';
      img.onload = () => {
        // succès : remplace l'initiale par l'image
        photoBox.innerHTML = '';
        photoBox.appendChild(img);
      };
      img.onerror = () => tryNext(idx + 1);
      img.src = dedup[idx];
    }
    tryNext(0);
    card.querySelector('.jp-name').textContent = player.name;
    card.querySelector('.jp-club').textContent = player.club + ' · ' + (player.league || '');
    if (hidden) {
      card.querySelector('.jp-value-hidden').textContent = '?';
    } else {
      card.querySelector('.jp-value-known').textContent = player.value + ' M€';
    }
    // Glow ambiant : couleur dérivée du club / nation
    const rgb = glowColorFor(player);
    card.style.setProperty('--glow-r', rgb[0]);
    card.style.setProperty('--glow-g', rgb[1]);
    card.style.setProperty('--glow-b', rgb[2]);
    card.classList.add('flash');
    setTimeout(() => card.classList.remove('flash'), 800);
  }

  // Couleur de glow par joueur : hash déterministe sur le nom du club
  function glowColorFor(player) {
    const PRESETS = {
      'Real Madrid':[230,225,180], 'Paris SG':[60,90,180], 'Manchester City':[120,180,220],
      'Manchester United':[230,80,80], 'Liverpool':[230,80,80], 'Arsenal':[230,90,90],
      'Chelsea':[80,130,220], 'Tottenham':[200,220,240],
      'FC Barcelona':[180,80,120], 'Barcelona':[180,80,120], 'Atlético Madrid':[230,80,80],
      'Bayern Munich':[230,80,80], 'Bayern München':[230,80,80], 'Borussia Dortmund':[240,200,40],
      'Inter':[80,120,230], 'Juventus':[200,210,220], 'AC Milan':[230,80,80], 'AS Roma':[210,100,90], 'Napoli':[80,170,230],
    };
    if (PRESETS[player.club]) return PRESETS[player.club];
    // hash sur club
    let h = 0; const s = String(player.club || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    const hue = ((h >>> 0) % 360);
    return hslToRgb(hue / 360, 0.55, 0.6);
  }
  function hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      const hue2 = (p, q, t) => { if (t<0) t+=1; if (t>1) t-=1; if (t<1/6) return p+(q-p)*6*t; if (t<1/2) return q; if (t<2/3) return p+(q-p)*(2/3-t)*6; return p; };
      const q = l < 0.5 ? l * (1+s) : l+s-l*s;
      const p = 2*l - q;
      r = hue2(p, q, h+1/3); g = hue2(p, q, h); b = hue2(p, q, h-1/3);
    }
    return [Math.round(r*255), Math.round(g*255), Math.round(b*255)];
  }
  function answerUp(dir) {
    const r = window.JustePrix.answerUpDown(dir);
    const fb = $('#justeFeedback');
    // brièvement révéler la vraie valeur
    $('#justeB .jp-value-hidden').textContent = r.last.b.value + ' M€';
    if (r.last.tie) {
      fb.textContent = '🟰 Même valeur — on continue';
      fb.className = 'juste-feedback';
    } else if (r.last.correct) {
      fb.textContent = '✓ Bien vu !';
      fb.className = 'juste-feedback correct';
    } else {
      fb.textContent = '✗ Faux — vie en moins';
      fb.className = 'juste-feedback wrong';
    }
    setTimeout(() => {
      if (!r.alive) {
        fb.textContent = `Game over — meilleure série : ${r.score}`;
        fb.className = 'juste-feedback wrong';
        $('#justeLower').disabled = true; $('#justeHigher').disabled = true;
        return;
      }
      renderUpDown(window.JustePrix.state);
      $('#justeLower').disabled = false; $('#justeHigher').disabled = false;
    }, 1400);
  }

  function showMultiSetup() {
    $('#justeUpDown').style.display = 'none';
    $('#justeMulti').style.display = 'block';
    $('#multiSetup').style.display = 'block';
    $('#multiRound').style.display = 'none';
    const wrap = $('#multiParticipants');
    wrap.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const def = ['Alex', 'Sam', 'Jordan', 'Charlie'][i];
      const row = el('div', { class: 'mr-guess-row' });
      row.appendChild(el('label', {}, 'Joueur ' + (i+1)));
      const inp = el('input', { type: 'text', value: i < 2 ? def : '', placeholder: 'Pseudo (vide = absent)' });
      row.appendChild(inp);
      wrap.appendChild(row);
    }
    $('#multiStart').onclick = () => {
      const parts = $$('#multiParticipants input')
        .map((inp, i) => ({ name: inp.value.trim(), color: TEAM_COLORS[i % 4], idx: i }))
        .filter(p => p.name);
      if (parts.length < 2) return toast('Pas assez de joueurs', 'Il faut au moins 2 participants.');
      window.JustePrix.startMulti(parts);
      renderMultiRound();
      $('#multiSetup').style.display = 'none';
      $('#multiRound').style.display = 'block';
    };
  }

  function renderMultiRound() {
    const s = window.JustePrix.state;
    const wrap = $('#multiRound'); wrap.innerHTML = '';
    // Target card
    const tgt = el('div', { class: 'mr-target' });
    const ph = el('div', { class: 'mr-photo' });
    const urls = [
      window.photoUrlHQ && window.photoUrlHQ(s.target),
      window.photoUrlHQFallback && window.photoUrlHQFallback(s.target),
      window.photoUrl && window.photoUrl(s.target),
    ].filter((u, i, a) => u && a.indexOf(u) === i);
    (function tryNext(i) {
      if (i >= urls.length) { ph.textContent = initials(s.target); return; }
      const im = new Image();
      im.src = urls[i]; im.referrerPolicy = 'no-referrer'; im.decoding = 'async';
      im.onerror = () => { im.remove(); tryNext(i+1); };
      ph.appendChild(im);
    })(0);
    tgt.appendChild(ph);
    tgt.appendChild(el('div', { class: 'mr-name' }, s.target.name));
    tgt.appendChild(el('div', { class: 'mr-club' }, s.target.club + ' · ' + (s.target.league || '')));
    tgt.appendChild(el('div', { class: 'mr-club' }, 'Manche ' + (s.round + 1) + ' / ' + s.rounds));
    wrap.appendChild(tgt);

    // Guess inputs
    const list = el('div', { class: 'mr-guesses' });
    s.participants.forEach((p, i) => {
      const row = el('div', { class: 'mr-guess-row' });
      row.appendChild(el('label', {}, p.name));
      const inp = el('input', { type: 'number', min: '0', step: '1', placeholder: 'M€' });
      row.appendChild(inp);
      const btn = el('button', { class: 'btn btn-primary' }, 'Valider');
      btn.onclick = () => {
        const v = +inp.value;
        if (!v && v !== 0) return;
        const res = window.JustePrix.submitGuess(i, v);
        row.classList.add('locked');
        btn.disabled = true;
        if (res.resolved) renderMultiReveal(res);
      };
      row.appendChild(btn);
      list.appendChild(row);
    });
    wrap.appendChild(list);

    // Score board
    const sb = el('div', { class: 'mr-scoreboard' });
    s.participants.forEach((p, i) => {
      const tile = el('div', { class: 'mr-score-tile' + (Math.max(...s.scores) === s.scores[i] && s.scores[i] > 0 ? ' lead' : '') });
      tile.appendChild(el('span', { class: 'name' }, p.name));
      tile.appendChild(el('span', { class: 'pts' }, String(s.scores[i])));
      sb.appendChild(tile);
    });
    wrap.appendChild(sb);
  }
  function renderMultiReveal(res) {
    const s = window.JustePrix.state;
    const wrap = $('#multiRound');
    const rev = el('div', { class: 'mr-reveal' });
    rev.appendChild(el('div', { class: 'mrr-value' },
      el('span', { class: 'mrr-label' }, 'Vraie valeur'),
      el('span', { class: 'mrr-num' }, res.target + ' M€')));
    rev.appendChild(el('div', { class: 'mrr-winner' }, '🏆 Manche pour ' + s.participants[res.winnerIdx].name));
    const rows = el('div', { class: 'mrr-rows' });
    const maxDiff = Math.max(1, ...s.participants.map((p, i) => Math.abs((res.history.guesses[i] || 0) - res.target)));
    s.participants.forEach((p, i) => {
      const g = res.history.guesses[i];
      const diff = Math.abs(g - res.target);
      const row = el('div', { class: 'mrr-row' + (i === res.winnerIdx ? ' win' : '') });
      row.appendChild(el('span', { class: 'mrr-name' }, p.name));
      row.appendChild(el('span', { class: 'mrr-guess' }, g + ' M€'));
      const bar = el('div', { class: 'mrr-bar' });
      bar.appendChild(el('div', { class: 'mrr-bar-fill', style: `width:${Math.max(6, 100 - diff / maxDiff * 100)}%` }));
      row.appendChild(bar);
      row.appendChild(el('span', { class: 'mrr-delta' }, 'Δ ' + diff));
      rows.appendChild(row);
    });
    rev.appendChild(rows);
    wrap.appendChild(rev);
    if (!res.finished) {
      const nextBtn = el('button', { class: 'btn btn-primary' }, 'Manche suivante');
      nextBtn.onclick = () => renderMultiRound();
      rev.appendChild(document.createElement('br'));
      rev.appendChild(nextBtn);
    } else {
      const finalMsg = el('div', {}, '🏆 ' + s.participants[res.scores.indexOf(Math.max.apply(null, res.scores))].name + ' remporte la partie !');
      finalMsg.style.marginTop = '12px';
      finalMsg.style.fontFamily = 'Bebas Neue';
      finalMsg.style.fontSize = '22px';
      finalMsg.style.color = 'var(--neon)';
      rev.appendChild(finalMsg);
    }
  }

  // ============================================================
  // MODE SAISON
  // ============================================================
  function initSeasonScreen() {
    $('#seasonBack').onclick = () => showScreen('setup');
    $('#seasonStart').onclick = startSeason;
    $('#seasonNext').onclick = nextSeasonRound;
    $('#seasonAll').onclick = simulateFullSeason;
  }
  function startSeason() {
    // utilise la dernière équipe du user du draft, OU génère depuis le setup courant
    if (!state.participants.length || !state.participants[0].slots) {
      return toast('Pas d\'équipe', 'Construis d\'abord une équipe via Draft, puis reviens ici.');
    }
    const me = state.participants[0];
    const profile = window.Sim.teamProfile(me, FORMATIONS, playerById, window.Sim.STYLES.equilibre.tactics);
    window.Season.init(me, profile, PLAYERS, FORMATIONS, SLOT_RULES, playerById, {
      myName: me.name || 'Mon équipe',
      tactics: window.Sim.STYLES.equilibre.tactics,
    });
    $('#seasonStart').disabled = true;
    $('#seasonNext').disabled = false;
    $('#seasonAll').disabled = false;
    renderSeasonTable();
  }
  function nextSeasonRound() {
    const r = window.Season.playNextRound();
    if (r.finished) { $('#seasonNext').disabled = true; $('#seasonAll').disabled = true; }
    renderSeasonTable();
    renderRecentResults();
  }
  function simulateFullSeason() {
    while (true) {
      const r = window.Season.playNextRound();
      if (!r || r.finished) break;
    }
    $('#seasonNext').disabled = true; $('#seasonAll').disabled = true;
    renderSeasonTable();
    renderRecentResults();
  }
  function renderSeasonTable() {
    const s = window.Season.state; if (!s) return;
    const table = window.Season.standings();
    const wrap = $('#seasonTable');
    const tbl = el('table');
    const thead = el('thead'); const trh = el('tr');
    ['#','Équipe','J','V','N','D','BP','BC','+/-','Pts','Forme'].forEach(h => trh.appendChild(el('th', {}, h)));
    thead.appendChild(trh); tbl.appendChild(thead);
    const tbody = el('tbody');
    table.forEach((t, i) => {
      const tr = el('tr', { class: t.isUser ? 'me' : '' });
      tr.appendChild(el('td', { class: 'pos-rank' }, '' + (i+1)));
      tr.appendChild(el('td', { class: 'pos-team' }, t.name));
      tr.appendChild(el('td', {}, '' + t.p));
      tr.appendChild(el('td', {}, '' + t.w));
      tr.appendChild(el('td', {}, '' + t.d));
      tr.appendChild(el('td', {}, '' + t.l));
      tr.appendChild(el('td', {}, '' + t.gf));
      tr.appendChild(el('td', {}, '' + t.ga));
      tr.appendChild(el('td', {}, '' + (t.gf - t.ga)));
      tr.appendChild(el('td', {}, '' + t.pts));
      const form = el('td', { class: 'pos-form' });
      (t.form || []).slice(-5).forEach(f => form.appendChild(el('span', { class: f }, f)));
      tr.appendChild(form);
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    wrap.innerHTML = ''; wrap.appendChild(tbl);
  }
  function renderRecentResults() {
    const s = window.Season.state; if (!s) return;
    const wrap = $('#seasonResults'); wrap.innerHTML = '';
    const latest = s.results.slice(-8).reverse();
    latest.forEach(r => {
      const home = s.teams[r.home].name, away = s.teams[r.away].name;
      const row = el('div', { class: 'sr-result' + (r.userInvolved ? ' me' : '') });
      row.appendChild(el('div', {}, home));
      row.appendChild(el('div', { class: 'score' }, r.hg + ' – ' + r.ag));
      row.appendChild(el('div', { class: 'away' }, away));
      wrap.appendChild(row);
    });
  }

  // ============================================================
  // TACTICS BOARD (FM-like)
  // ============================================================
  const tacticsState = {
    currentIdx: 0,
    selectedSlotId: null,
    // par participant : { phases:{possession,transition,defense}, players:{slotId: { role, sliders }} }
    byParticipant: [],
  };

  function ensureTacticsState() {
    state.participants.forEach((p, i) => {
      if (tacticsState.byParticipant[i]) return;
      const init = {
        phases: { possession: 'mixed', transition: 'rest', defense: 'mid' },
        players: {},
      };
      const F = FORMATIONS[p.formation];
      F.slots.forEach(slot => {
        const pid = p.slots[slot.id];
        const pl = pid ? playerById(pid) : null;
        if (!pl) return;
        const roleKey = window.Tactics.defaultRoleFor(pl, slot.type);
        const role = roleKey ? window.Tactics.ROLES[roleKey] : null;
        init.players[slot.id] = {
          role: roleKey,
          sliders: role ? Object.assign({}, role.preset) : { posDx:0, posDy:0, aggr:50, risk:50, off:50 },
        };
      });
      tacticsState.byParticipant[i] = init;
    });
  }

  function goToTactics() {
    if (!state.participants.length) return;
    ensureTacticsState();
    tacticsState.currentIdx = 0;
    tacticsState.selectedSlotId = null;
    showScreen('tactics');
    renderTacticsBoard();
  }

  function renderTacticsBoard() {
    const i = tacticsState.currentIdx;
    const part = state.participants[i];
    if (!part) return;
    const ts = tacticsState.byParticipant[i];

    // Participant tabs
    const tabs = $('#tacticsParticipantTabs');
    tabs.innerHTML = '';
    state.participants.forEach((p, idx) => {
      const b = el('button', { class: idx === i ? 'active' : '' }, p.name || ('J' + (idx+1)));
      b.addEventListener('click', () => { tacticsState.currentIdx = idx; tacticsState.selectedSlotId = null; renderTacticsBoard(); });
      tabs.appendChild(b);
    });
    $('#tacticsParticipantName').textContent = part.name;

    // Phase options
    const PS = window.Tactics.PHASE_STYLES;
    Object.keys(PS).forEach(phase => {
      const opt = $('.phase-options[data-phase-opts="' + phase + '"]');
      opt.innerHTML = '';
      PS[phase].options.forEach(o => {
        const b = el('button', { class: ts.phases[phase] === o.key ? 'active' : '' });
        b.appendChild(el('strong', {}, o.label));
        b.appendChild(document.createTextNode(o.desc));
        b.addEventListener('click', () => {
          ts.phases[phase] = o.key;
          // Propager au stadium tactics
          syncTacticsToStadium(i);
          renderTacticsBoard();
        });
        opt.appendChild(b);
      });
    });

    // Pitch with player chips
    const pitch = $('#tacticsPitch');
    pitch.innerHTML = '';
    appendPitchFeatures(pitch);
    FORMATIONS[part.formation].slots.forEach(slot => {
      const pid = part.slots[slot.id];
      const pl = pid ? playerById(pid) : null;
      const slotPlayer = ts.players[slot.id];
      const role = slotPlayer && slotPlayer.role ? window.Tactics.ROLES[slotPlayer.role] : null;
      const warn = pl && slotPlayer && slotPlayer.role ? window.Tactics.incompatibility(pl, slotPlayer.role) : null;
      const sel = tacticsState.selectedSlotId === slot.id;
      const slotEl = el('div', {
        class: 'slot' + (pl ? ' filled' : '') + (sel ? ' selected' : '') + (warn ? ' warn' : ''),
        style: `left:${slot.x}%; top:${slot.y}%`,
      });
      const bubble = el('div', { class: 'slot-bubble' });
      if (pl) {
        const ph = el('div', { class: 'slot-photo', style: `background:${gradientFor(pl)}` });
        attachPhoto(ph, pl, 'slot-photo-img');
        ph.appendChild(el('span', { class: 'slot-photo-fb' }, initials(pl)));
        bubble.appendChild(ph);
      } else bubble.appendChild(el('span', {}, slot.type));
      slotEl.appendChild(bubble);
      slotEl.appendChild(el('div', { class: 'slot-name' },
        pl ? (role ? role.label.split(' ')[0].toUpperCase() : pl.name.split(' ').slice(-1)[0].toUpperCase()) : slot.type));
      slotEl.addEventListener('click', () => {
        tacticsState.selectedSlotId = slot.id;
        renderTacticsBoard();
        // le panneau de rôle est hors-viewport sur laptop → l'amener à l'écran
        const rp = $('#tacticsRolePanel');
        if (rp) rp.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
      pitch.appendChild(slotEl);
    });

    renderRolePanel(i);
    renderWarningsSummary(i);
  }

  // Heatmap visuelle d'un rôle : mini-pitch SVG avec blob radial centré sur la position
  // calculée à partir du slot + posDx/posDy du rôle. Les sliders aggr/off élargissent la zone.
  function buildHeatmap(slot, role, sliders, opts) {
    opts = opts || {};
    const big = opts.size === 'big';
    const W = big ? 200 : 56;
    const H = big ? Math.round(W * 1.45) : Math.round(W * 1.45);
    const wrap = el('div', { class: 'heatmap ' + (big ? 'heatmap-big' : 'heatmap-mini') });
    const ns = 'http://www.w3.org/2000/svg';
    const svgEl = document.createElementNS(ns, 'svg');
    svgEl.setAttribute('viewBox', '0 0 100 145');
    svgEl.setAttribute('width', W); svgEl.setAttribute('height', H);
    svgEl.style.display = 'block';

    // Terrain de fond
    const bg = document.createElementNS(ns, 'rect');
    bg.setAttribute('x', 0); bg.setAttribute('y', 0); bg.setAttribute('width', 100); bg.setAttribute('height', 145);
    bg.setAttribute('rx', 6); bg.setAttribute('fill', 'rgba(20,40,32,0.4)');
    bg.setAttribute('stroke', 'rgba(255,255,255,0.18)'); bg.setAttribute('stroke-width', 0.5);
    svgEl.appendChild(bg);

    // Lignes : médiane + cercle central + surfaces
    const lineColor = 'rgba(255,255,255,0.22)';
    function line(x1,y1,x2,y2){const l=document.createElementNS(ns,'line');l.setAttribute('x1',x1);l.setAttribute('y1',y1);l.setAttribute('x2',x2);l.setAttribute('y2',y2);l.setAttribute('stroke',lineColor);l.setAttribute('stroke-width',0.5);svgEl.appendChild(l);}
    function rect(x,y,w,h){const r=document.createElementNS(ns,'rect');r.setAttribute('x',x);r.setAttribute('y',y);r.setAttribute('width',w);r.setAttribute('height',h);r.setAttribute('fill','none');r.setAttribute('stroke',lineColor);r.setAttribute('stroke-width',0.5);svgEl.appendChild(r);}
    function circ(cx,cy,r){const c=document.createElementNS(ns,'circle');c.setAttribute('cx',cx);c.setAttribute('cy',cy);c.setAttribute('r',r);c.setAttribute('fill','none');c.setAttribute('stroke',lineColor);c.setAttribute('stroke-width',0.5);svgEl.appendChild(c);}
    line(4,72.5,96,72.5);
    circ(50,72.5,12);
    rect(30,4, 40, 18);
    rect(30,123, 40, 18);

    // Position cible du rôle : slot.x (0-100) + posDx, slot.y (0-100) + posDy
    // (les coords slot sont déjà en %, on les map en viewBox 100×145)
    const tx = Math.max(8, Math.min(92, slot.x + (sliders.posDx || 0) * 0.7));
    const ty = Math.max(8, Math.min(137, (slot.y / 100) * 145 + (sliders.posDy || 0) * 1.1));

    // Rayon influencé par implication / agressivité
    const aggr = sliders.aggr != null ? sliders.aggr : 50;
    const off  = sliders.off  != null ? sliders.off  : 50;
    const radius = 16 + (aggr - 50) * 0.18 + (off - 50) * 0.14;

    // Définition du gradient de chaleur
    const defs = document.createElementNS(ns, 'defs');
    const grad = document.createElementNS(ns, 'radialGradient');
    grad.setAttribute('id', 'hm-' + Math.random().toString(36).slice(2, 8));
    grad.setAttribute('cx', '50%'); grad.setAttribute('cy', '50%'); grad.setAttribute('r', '50%');
    [['0%', 'rgba(239,180,111,0.85)'], ['45%', 'rgba(214,139,60,0.55)'], ['80%', 'rgba(138,79,28,0.18)'], ['100%', 'rgba(0,0,0,0)']].forEach(s => {
      const st = document.createElementNS(ns, 'stop');
      st.setAttribute('offset', s[0]); st.setAttribute('stop-color', s[1]);
      grad.appendChild(st);
    });
    defs.appendChild(grad);
    svgEl.appendChild(defs);

    // Blob de chaleur (ellipse pour donner orientation)
    const blob = document.createElementNS(ns, 'ellipse');
    blob.setAttribute('cx', tx);
    blob.setAttribute('cy', ty);
    blob.setAttribute('rx', radius);
    blob.setAttribute('ry', radius * 1.25);
    blob.setAttribute('fill', 'url(#' + grad.getAttribute('id') + ')');
    blob.setAttribute('opacity', '0.9');
    blob.setAttribute('filter', 'blur(0.5)');
    svgEl.appendChild(blob);

    // Point central du rôle
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', tx); dot.setAttribute('cy', ty);
    dot.setAttribute('r', big ? 2 : 1.6);
    dot.setAttribute('fill', '#fff'); dot.setAttribute('opacity', '0.9');
    svgEl.appendChild(dot);

    wrap.appendChild(svgEl);
    return wrap;
  }

  function renderRolePanel(i) {
    const part = state.participants[i];
    const ts = tacticsState.byParticipant[i];
    const panel = $('#tacticsRolePanel');
    const sid = tacticsState.selectedSlotId;
    if (!sid) {
      panel.innerHTML = '<div class="trp-empty">Sélectionne un joueur pour voir et modifier son rôle.</div>';
      return;
    }
    const slot = FORMATIONS[part.formation].slots.find(s => s.id === sid);
    const pid = part.slots[sid];
    const pl = pid ? playerById(pid) : null;
    if (!pl) {
      panel.innerHTML = '<div class="trp-empty">Slot vide — assigne d\'abord un joueur dans le draft.</div>';
      return;
    }
    panel.innerHTML = '';
    // Head
    const head = el('div', { class: 'trp-head' });
    const ph = el('div', { class: 'trp-photo', style: `background:${gradientFor(pl)}` });
    attachPhoto(ph, pl, '');
    ph.appendChild(el('span', {}, initials(pl)));
    head.appendChild(ph);
    head.appendChild(el('div', {},
      el('div', { class: 'trp-name' }, pl.name),
      el('div', { class: 'trp-pos' }, (pl.posMain || []).join('/') + ' · ' + slot.type + ' · ' + pl.value + ' M€')
    ));
    panel.appendChild(head);

    // Section rôles
    const sec1 = el('div', { class: 'trp-section' });
    sec1.appendChild(el('h5', {}, 'Rôle'));

    // Heatmap principale du rôle sélectionné (gros affichage)
    if (slotPlayer.role) {
      const r = window.Tactics.ROLES[slotPlayer.role];
      const heatBig = buildHeatmap(slot, r, slotPlayer.sliders, { size: 'big' });
      sec1.appendChild(heatBig);
    }

    const opts = el('div', { class: 'role-options' });
    const roles = window.Tactics.rolesForSlot(slot.type);
    const slotPlayer2 = slotPlayer; // alias
    roles.forEach(r => {
      const isActive = slotPlayer2.role === r.key;
      const div = el('div', { class: 'role-option' + (isActive ? ' active' : '') });
      // mini heatmap à gauche
      const mini = buildHeatmap(slot, r, r.preset, { size: 'mini' });
      div.appendChild(mini);
      const info = el('div', { class: 'role-info' });
      info.appendChild(el('div', { class: 'role-name' }, r.label));
      info.appendChild(el('div', { class: 'role-summary' }, r.summary));
      const w = window.Tactics.incompatibility(pl, r.key);
      if (w) info.appendChild(el('div', { class: 'role-warn' }, '⚠ ' + w[0]));
      div.appendChild(info);
      div.addEventListener('click', () => {
        slotPlayer2.role = r.key;
        slotPlayer2.sliders = Object.assign({}, r.preset);
        syncTacticsToStadium(i);
        renderTacticsBoard();
      });
      opts.appendChild(div);
    });
    sec1.appendChild(opts);
    panel.appendChild(sec1);

    // Section sliders
    const sec2 = el('div', { class: 'trp-section' });
    sec2.appendChild(el('h5', {}, 'Comportement'));
    const SL = [
      ['aggr', 'Agressivité', 'Calme', 'Engagé'],
      ['risk', 'Prise de risque', 'Sûr', 'Aventureux'],
      ['off',  'Implication offensive', 'Replié', 'Décisif'],
      ['posDy', 'Profondeur (+ haut / − bas)', 'Bas', 'Haut'],
    ];
    SL.forEach(([k, lbl]) => {
      const row = el('div', { class: 'role-slider' });
      const labelDiv = el('label', {});
      labelDiv.appendChild(document.createTextNode(lbl));
      labelDiv.appendChild(el('span', { 'data-k': k }, '' + (slotPlayer.sliders[k] || 0)));
      row.appendChild(labelDiv);
      const min = (k === 'posDy' || k === 'posDx') ? -20 : 0;
      const max = (k === 'posDy' || k === 'posDx') ? 20 : 100;
      const inp = el('input', { type: 'range', min: String(min), max: String(max), step: '1', value: String(slotPlayer.sliders[k] || 0) });
      inp.addEventListener('input', () => {
        slotPlayer.sliders[k] = +inp.value;
        row.querySelector('span[data-k="' + k + '"]').textContent = inp.value;
        syncTacticsToStadium(i);
      });
      row.appendChild(inp);
      sec2.appendChild(row);
    });
    panel.appendChild(sec2);
  }

  function renderWarningsSummary(i) {
    const part = state.participants[i];
    const ts = tacticsState.byParticipant[i];
    const wrap = $('#tacticsWarnings');
    const issues = [];
    FORMATIONS[part.formation].slots.forEach(slot => {
      const pid = part.slots[slot.id];
      const pl = pid ? playerById(pid) : null;
      const sp = ts.players[slot.id];
      if (!pl || !sp || !sp.role) return;
      const w = window.Tactics.incompatibility(pl, sp.role);
      if (w) issues.push(pl.name + ' : ' + w[0]);
    });
    if (issues.length === 0) {
      wrap.innerHTML = '';
    } else {
      wrap.innerHTML = '<strong>⚠ Alertes IA</strong><br>' + issues.map(i => '• ' + i).join('<br>');
    }
  }

  // Mappe les phases tactiques → curseurs Sim (utilisés par le moteur)
  function syncTacticsToStadium(i) {
    const ts = tacticsState.byParticipant[i];
    if (!ts) return;
    // Fold les choix de phases en tactique Sim
    const SP = window.Tactics.PHASE_STYLES;
    let lineHeight = 50, tempo = 55, press = 55, width = 55, directness = 50;
    if (ts.phases.defense === 'high') { lineHeight = 75; press = 80; }
    else if (ts.phases.defense === 'mid') { lineHeight = 50; press = 55; }
    else if (ts.phases.defense === 'low') { lineHeight = 28; press = 30; }
    if (ts.phases.transition === 'counter') { tempo = 75; directness = 75; }
    else if (ts.phases.transition === 'gegen') { press = Math.min(95, press + 15); }
    else if (ts.phases.transition === 'rest') { tempo = 45; }
    if (ts.phases.possession === 'short') { directness = 25; tempo = Math.max(40, tempo - 10); }
    else if (ts.phases.possession === 'mixed') { directness = 50; }
    else if (ts.phases.possession === 'direct') { directness = 78; }
    else if (ts.phases.possession === 'wing') { width = 75; }

    // Stocker dans stadiumState pour la sim
    if (!stadiumState.tactics) stadiumState.tactics = [];
    stadiumState.tactics[i] = { lineHeight, tempo, press, width, directness };
    if (!stadiumState.styles) stadiumState.styles = [];
    stadiumState.styles[i] = 'equilibre';
  }

  // Synchroniser au chargement du tactics board
  function syncAllTacticsToStadium() {
    state.participants.forEach((_, i) => syncTacticsToStadium(i));
  }

  // ============================================================
  // GUESS THE TEAM
  // Variantes : club (joueurs masqués par nationalité), nation (par club)
  // Compos types pour les grands clubs / sélections
  // ============================================================
  const GUESS_CLUB_LINEUPS = [
    // Top 12 clubs avec leur 11 typique 2025/26
    { team: 'Real Madrid', formation: '4-3-3', slots: [
      { type:'GK',   name:'Courtois' }, { type:'LB', name:'Mendy' }, { type:'CB', name:'Militão' }, { type:'CB', name:'Rüdiger' }, { type:'RB', name:'Alexander-Arnold' },
      { type:'CM', name:'Tchouaméni' }, { type:'CM', name:'Bellingham' }, { type:'CM', name:'Valverde' },
      { type:'LW', name:'Vinicius Jr.' }, { type:'ST', name:'Mbappé' }, { type:'RW', name:'Rodrygo' },
    ]},
    { team: 'Manchester City', formation: '4-3-3', slots: [
      { type:'GK', name:'Donnarumma' }, { type:'LB', name:'Gvardiol' }, { type:'CB', name:'Dias' }, { type:'CB', name:'Stones' }, { type:'RB', name:'Matheus Nunes' },
      { type:'DM', name:'Rodri' }, { type:'CM', name:'Reijnders' }, { type:'CM', name:'Bernardo Silva' },
      { type:'LW', name:'Doku' }, { type:'ST', name:'Haaland' }, { type:'RW', name:'Foden' },
    ]},
    { team: 'FC Barcelona', formation: '4-3-3', slots: [
      { type:'GK', name:'ter Stegen' }, { type:'LB', name:'Balde' }, { type:'CB', name:'Cubarsí' }, { type:'CB', name:'Araujo' }, { type:'RB', name:'Koundé' },
      { type:'CM', name:'Pedri' }, { type:'DM', name:'de Jong' }, { type:'CM', name:'Gavi' },
      { type:'LW', name:'Raphinha' }, { type:'ST', name:'Lewandowski' }, { type:'RW', name:'Yamal' },
    ]},
    { team: 'Arsenal', formation: '4-3-3', slots: [
      { type:'GK', name:'Raya' }, { type:'LB', name:'Calafiori' }, { type:'CB', name:'Saliba' }, { type:'CB', name:'Gabriel' }, { type:'RB', name:'White' },
      { type:'DM', name:'Rice' }, { type:'CM', name:'Ødegaard' }, { type:'CM', name:'Havertz' },
      { type:'LW', name:'Martinelli' }, { type:'ST', name:'Gyökeres' }, { type:'RW', name:'Saka' },
    ]},
    { team: 'Liverpool', formation: '4-3-3', slots: [
      { type:'GK', name:'Alisson' }, { type:'LB', name:'Kerkez' }, { type:'CB', name:'van Dijk' }, { type:'CB', name:'Konaté' }, { type:'RB', name:'Frimpong' },
      { type:'CM', name:'Mac Allister' }, { type:'DM', name:'Gravenberch' }, { type:'CM', name:'Wirtz' },
      { type:'LW', name:'Gakpo' }, { type:'ST', name:'Isak' }, { type:'RW', name:'Salah' },
    ]},
    { team: 'Paris SG', formation: '4-3-3', slots: [
      { type:'GK', name:'Chevalier' }, { type:'LB', name:'Mendes' }, { type:'CB', name:'Marquinhos' }, { type:'CB', name:'Pacho' }, { type:'RB', name:'Hakimi' },
      { type:'CM', name:'Vitinha' }, { type:'DM', name:'Neves' }, { type:'CM', name:'Zaïre-Emery' },
      { type:'LW', name:'Doué' }, { type:'ST', name:'Dembélé' }, { type:'RW', name:'Barcola' },
    ]},
    { team: 'Bayern Munich', formation: '4-2-3-1', slots: [
      { type:'GK', name:'Neuer' }, { type:'LB', name:'Davies' }, { type:'CB', name:'Upamecano' }, { type:'CB', name:'Kim' }, { type:'RB', name:'Kimmich' },
      { type:'DM', name:'Pavlovic' }, { type:'CM', name:'Goretzka' }, { type:'AM', name:'Musiala' },
      { type:'LW', name:'Luis Díaz' }, { type:'ST', name:'Kane' }, { type:'RW', name:'Olise' },
    ]},
    { team: 'Inter', formation: '3-5-2', slots: [
      { type:'GK', name:'Sommer' }, { type:'CB', name:'Bastoni' }, { type:'CB', name:'Acerbi' }, { type:'CB', name:'Pavard' },
      { type:'LWB', name:'Dimarco' }, { type:'CM', name:'Mkhitaryan' }, { type:'CM', name:'Çalhanoğlu' }, { type:'CM', name:'Barella' }, { type:'RWB', name:'Dumfries' },
      { type:'ST', name:'Thuram' }, { type:'ST', name:'Lautaro Martínez' },
    ]},
    { team: 'Juventus', formation: '3-5-2', slots: [
      { type:'GK', name:'Di Gregorio' }, { type:'CB', name:'Bremer' }, { type:'CB', name:'Gatti' }, { type:'CB', name:'Kalulu' },
      { type:'LWB', name:'Cambiaso' }, { type:'CM', name:'Locatelli' }, { type:'CM', name:'McKennie' }, { type:'CM', name:'Koopmeiners' }, { type:'RWB', name:'Weah' },
      { type:'ST', name:'Vlahović' }, { type:'ST', name:'Yıldız' },
    ]},
    { team: 'Atlético Madrid', formation: '4-4-2', slots: [
      { type:'GK', name:'Oblak' }, { type:'LB', name:'Hancko' }, { type:'CB', name:'José Giménez' }, { type:'CB', name:'Le Normand' }, { type:'RB', name:'Llorente' },
      { type:'LM', name:'Gallagher' }, { type:'CM', name:'Koke' }, { type:'CM', name:'Barrios' }, { type:'RM', name:'Griezmann' },
      { type:'ST', name:'Alvarez' }, { type:'ST', name:'Sørloth' },
    ]},
    { team: 'Chelsea', formation: '4-2-3-1', slots: [
      { type:'GK', name:'Robert Sánchez' }, { type:'LB', name:'Cucurella' }, { type:'CB', name:'Colwill' }, { type:'CB', name:'Chalobah' }, { type:'RB', name:'James' },
      { type:'DM', name:'Caicedo' }, { type:'CM', name:'Enzo Fernández' }, { type:'AM', name:'Palmer' },
      { type:'LW', name:'Pedro Neto' }, { type:'ST', name:'João Pedro' }, { type:'RW', name:'Estêvão' },
    ]},
    { team: 'Tottenham', formation: '4-3-3', slots: [
      { type:'GK', name:'Vicario' }, { type:'LB', name:'Udogie' }, { type:'CB', name:'Romero' }, { type:'CB', name:'van de Ven' }, { type:'RB', name:'Porro' },
      { type:'DM', name:'Bissouma' }, { type:'CM', name:'Bentancur' }, { type:'CM', name:'Sarr' },
      { type:'LW', name:'Kudus' }, { type:'ST', name:'Richarlison' }, { type:'RW', name:'Brennan Johnson' },
    ]},
    { team: 'Newcastle', formation: '4-3-3', slots: [
      { type:'GK', name:'Pope' }, { type:'LB', name:'Hall' }, { type:'CB', name:'Burn' }, { type:'CB', name:'Schär' }, { type:'RB', name:'Trippier' },
      { type:'CM', name:'Bruno Guimarães' }, { type:'DM', name:'Tonali' }, { type:'CM', name:'Joelinton' },
      { type:'LW', name:'Gordon' }, { type:'ST', name:'Woltemade' }, { type:'RW', name:'Barnes' },
    ]},
    { team: 'Napoli', formation: '4-3-3', slots: [
      { type:'GK', name:'Meret' }, { type:'LB', name:'Spinazzola' }, { type:'CB', name:'Buongiorno' }, { type:'CB', name:'Rrahmani' }, { type:'RB', name:'Di Lorenzo' },
      { type:'CM', name:'De Bruyne' }, { type:'DM', name:'Lobotka' }, { type:'CM', name:'McTominay' },
      { type:'LW', name:'Neres' }, { type:'ST', name:'Højlund' }, { type:'RW', name:'Politano' },
    ]},
    { team: 'AC Milan', formation: '4-2-3-1', slots: [
      { type:'GK', name:'Maignan' }, { type:'LB', name:'Estupiñán' }, { type:'CB', name:'Tomori' }, { type:'CB', name:'Pavlović' }, { type:'RB', name:'Saelemaekers' },
      { type:'DM', name:'Modrić' }, { type:'CM', name:'Fofana' }, { type:'AM', name:'Loftus-Cheek' },
      { type:'LW', name:'Leão' }, { type:'ST', name:'Giménez' }, { type:'RW', name:'Pulisic' },
    ]},
  ];
  const GUESS_NATION_LINEUPS = [
    { team: 'France', formation: '4-3-3', slots: [
      { type:'GK', name:'Maignan' }, { type:'LB', name:'Theo Hernández' }, { type:'CB', name:'Saliba' }, { type:'CB', name:'Upamecano' }, { type:'RB', name:'Koundé' },
      { type:'DM', name:'Tchouaméni' }, { type:'CM', name:'Camavinga' }, { type:'CM', name:'Rabiot' },
      { type:'LW', name:'Mbappé' }, { type:'ST', name:'Kolo Muani' }, { type:'RW', name:'Dembélé' },
    ]},
    { team: 'Espagne', formation: '4-3-3', slots: [
      { type:'GK', name:'Simón' }, { type:'LB', name:'Cucurella' }, { type:'CB', name:'Le Normand' }, { type:'CB', name:'Laporte' }, { type:'RB', name:'Carvajal' },
      { type:'DM', name:'Rodri' }, { type:'CM', name:'Pedri' }, { type:'CM', name:'Fabián Ruiz' },
      { type:'LW', name:'Nico Williams' }, { type:'ST', name:'Morata' }, { type:'RW', name:'Yamal' },
    ]},
    { team: 'Angleterre', formation: '4-3-3', slots: [
      { type:'GK', name:'Pickford' }, { type:'LB', name:'Lewis' }, { type:'CB', name:'Stones' }, { type:'CB', name:'Guéhi' }, { type:'RB', name:'Walker' },
      { type:'DM', name:'Rice' }, { type:'CM', name:'Bellingham' }, { type:'CM', name:'Mainoo' },
      { type:'LW', name:'Foden' }, { type:'ST', name:'Kane' }, { type:'RW', name:'Saka' },
    ]},
    { team: 'Brésil', formation: '4-3-3', slots: [
      { type:'GK', name:'Ederson' }, { type:'LB', name:'Wendell' }, { type:'CB', name:'Militão' }, { type:'CB', name:'Marquinhos' }, { type:'RB', name:'Danilo' },
      { type:'DM', name:'Casemiro' }, { type:'CM', name:'Bruno Guimarães' }, { type:'CM', name:'Lucas Paquetá' },
      { type:'LW', name:'Vinicius Jr.' }, { type:'ST', name:'Endrick' }, { type:'RW', name:'Rodrygo' },
    ]},
    { team: 'Allemagne', formation: '4-2-3-1', slots: [
      { type:'GK', name:'ter Stegen' }, { type:'LB', name:'Raum' }, { type:'CB', name:'Rüdiger' }, { type:'CB', name:'Tah' }, { type:'RB', name:'Kimmich' },
      { type:'DM', name:'Andrich' }, { type:'CM', name:'Goretzka' }, { type:'AM', name:'Wirtz' },
      { type:'LW', name:'Gnabry' }, { type:'ST', name:'Havertz' }, { type:'RW', name:'Musiala' },
    ]},
    { team: 'Portugal', formation: '4-3-3', slots: [
      { type:'GK', name:'Diogo Costa' }, { type:'LB', name:'Mendes' }, { type:'CB', name:'Dias' }, { type:'CB', name:'António Silva' }, { type:'RB', name:'Cancelo' },
      { type:'DM', name:'João Palhinha' }, { type:'CM', name:'Bruno Fernandes' }, { type:'CM', name:'Vitinha' },
      { type:'LW', name:'Bernardo Silva' }, { type:'ST', name:'Cristiano Ronaldo' }, { type:'RW', name:'Leão' },
    ]},
    { team: 'Pays-Bas', formation: '4-3-3', slots: [
      { type:'GK', name:'Verbruggen' }, { type:'LB', name:'Aké' }, { type:'CB', name:'van Dijk' }, { type:'CB', name:'de Vrij' }, { type:'RB', name:'Dumfries' },
      { type:'DM', name:'Schouten' }, { type:'CM', name:'Reijnders' }, { type:'CM', name:'Gravenberch' },
      { type:'LW', name:'Gakpo' }, { type:'ST', name:'Depay' }, { type:'RW', name:'Simons' },
    ]},
    { team: 'Argentine', formation: '4-3-3', slots: [
      { type:'GK', name:'Emiliano Martínez' }, { type:'LB', name:'Tagliafico' }, { type:'CB', name:'Romero' }, { type:'CB', name:'Otamendi' }, { type:'RB', name:'Molina' },
      { type:'DM', name:'Paredes' }, { type:'CM', name:'Enzo Fernández' }, { type:'CM', name:'Mac Allister' },
      { type:'LW', name:'Nico González' }, { type:'ST', name:'Alvarez' }, { type:'RW', name:'Messi' },
    ]},
    { team: 'Italie', formation: '4-3-3', slots: [
      { type:'GK', name:'Donnarumma' }, { type:'LB', name:'Dimarco' }, { type:'CB', name:'Bastoni' }, { type:'CB', name:'Calafiori' }, { type:'RB', name:'Di Lorenzo' },
      { type:'DM', name:'Locatelli' }, { type:'CM', name:'Barella' }, { type:'CM', name:'Pellegrini' },
      { type:'LW', name:'Chiesa' }, { type:'ST', name:'Retegui' }, { type:'RW', name:'Politano' },
    ]},
  ];

  let guessState = null;
  // Drapeaux emoji par pays
  const NATION_FLAGS = {
    'France':'🇫🇷','Spain':'🇪🇸','England':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','Brazil':'🇧🇷','Argentina':'🇦🇷',
    'Germany':'🇩🇪','Italy':'🇮🇹','Portugal':'🇵🇹','Netherlands':'🇳🇱','Belgium':'🇧🇪',
    'Croatia':'🇭🇷','Uruguay':'🇺🇾','Norway':'🇳🇴','Sweden':'🇸🇪','Denmark':'🇩🇰',
    'Poland':'🇵🇱','Morocco':'🇲🇦','Senegal':'🇸🇳','Côte d\'Ivoire':'🇨🇮','Ivory Coast':'🇨🇮',
    'Nigeria':'🇳🇬','Cameroon':'🇨🇲','Egypt':'🇪🇬','Algeria':'🇩🇿','Tunisia':'🇹🇳',
    'Ghana':'🇬🇭','Switzerland':'🇨🇭','Austria':'🇦🇹','Czech Republic':'🇨🇿','Czechia':'🇨🇿',
    'Slovakia':'🇸🇰','Serbia':'🇷🇸','Hungary':'🇭🇺','Türkiye':'🇹🇷','Turkey':'🇹🇷',
    'Ukraine':'🇺🇦','Russia':'🇷🇺','Wales':'🏴󠁧󠁢󠁷󠁬󠁳󠁿','Scotland':'🏴󠁧󠁢󠁳󠁣󠁴󠁿','Republic of Ireland':'🇮🇪',
    'Northern Ireland':'🇮🇪','Greece':'🇬🇷','Mexico':'🇲🇽','USA':'🇺🇸','United States':'🇺🇸',
    'Canada':'🇨🇦','Colombia':'🇨🇴','Chile':'🇨🇱','Peru':'🇵🇪','Ecuador':'🇪🇨',
    'Paraguay':'🇵🇾','Venezuela':'🇻🇪','Bolivia':'🇧🇴','Japan':'🇯🇵','South Korea':'🇰🇷',
    'Korea Republic':'🇰🇷','Australia':'🇦🇺','New Zealand':'🇳🇿','Iran':'🇮🇷','Saudi Arabia':'🇸🇦',
    'Qatar':'🇶🇦','UAE':'🇦🇪','Israel':'🇮🇱','Norway':'🇳🇴','Iceland':'🇮🇸',
    'Albania':'🇦🇱','Bosnia':'🇧🇦','Romania':'🇷🇴','Bulgaria':'🇧🇬','Slovenia':'🇸🇮',
    'Georgia':'🇬🇪','Armenia':'🇦🇲','Finland':'🇫🇮','Estonia':'🇪🇪','Latvia':'🇱🇻',
    'Lithuania':'🇱🇹','North Macedonia':'🇲🇰','Montenegro':'🇲🇪','Kosovo':'🇽🇰',
  };
  function flagFor(nationality) {
    if (!nationality) return '·';
    return NATION_FLAGS[nationality] || nationality.slice(0,3).toUpperCase();
  }
  // ISO-3166 alpha-2 pour flagcdn.com (les emoji drapeaux s'affichent en
  // LETTRES sous Windows → on sert de vraies images de drapeaux)
  const NATION_ISO = {
    'France':'fr','Spain':'es','England':'gb-eng','Brazil':'br','Argentina':'ar',
    'Germany':'de','Italy':'it','Portugal':'pt','Netherlands':'nl','Belgium':'be',
    'Croatia':'hr','Uruguay':'uy','Norway':'no','Sweden':'se','Denmark':'dk',
    'Poland':'pl','Morocco':'ma','Senegal':'sn',"Côte d'Ivoire":'ci','Ivory Coast':'ci',
    'Nigeria':'ng','Cameroon':'cm','Egypt':'eg','Algeria':'dz','Tunisia':'tn',
    'Ghana':'gh','Switzerland':'ch','Austria':'at','Czech Republic':'cz','Czechia':'cz',
    'Slovakia':'sk','Serbia':'rs','Hungary':'hu','Türkiye':'tr','Turkey':'tr',
    'Ukraine':'ua','Russia':'ru','Wales':'gb-wls','Scotland':'gb-sct','Republic of Ireland':'ie',
    'Northern Ireland':'gb-nir','Greece':'gr','Mexico':'mx','USA':'us','United States':'us',
    'Canada':'ca','Colombia':'co','Chile':'cl','Peru':'pe','Ecuador':'ec',
    'Paraguay':'py','Venezuela':'ve','Bolivia':'bo','Japan':'jp','South Korea':'kr',
    'Korea Republic':'kr','Australia':'au','New Zealand':'nz','Iran':'ir','Saudi Arabia':'sa',
    'Qatar':'qa','UAE':'ae','Israel':'il','Iceland':'is','Albania':'al','Bosnia':'ba',
    'Bosnia-Herzegovina':'ba','Romania':'ro','Bulgaria':'bg','Slovenia':'si','Georgia':'ge',
    'Armenia':'am','Finland':'fi','Estonia':'ee','Latvia':'lv','Lithuania':'lt',
    'North Macedonia':'mk','Montenegro':'me','Kosovo':'xk','Mali':'ml','Guinea':'gn',
    'Burkina Faso':'bf','DR Congo':'cd','Gabon':'ga','Angola':'ao','Mozambique':'mz',
    'Cape Verde':'cv','Gambia':'gm','Togo':'tg','Benin':'bj','Zambia':'zm',
    'Uzbekistan':'uz','Jordan':'jo','Iraq':'iq','Costa Rica':'cr','Panama':'pa',
    'Honduras':'hn','Jamaica':'jm','Haiti':'ht','Curacao':'cw','Suriname':'sr',
  };
  // Élément drapeau : image flagcdn (fallback emoji si nation inconnue)
  function flagEl(nationality) {
    const iso = NATION_ISO[nationality];
    if (!iso) return el('div', { class: 'gp-flag' }, flagFor(nationality));
    const wrap = el('div', { class: 'gp-flag gp-flag-img' });
    const img = el('img', { src: `https://flagcdn.com/w80/${iso}.png`, alt: nationality || '', loading: 'lazy' });
    img.addEventListener('error', () => { wrap.textContent = flagFor(nationality); wrap.classList.remove('gp-flag-img'); });
    wrap.appendChild(img);
    return wrap;
  }
  // Normalisation robuste (accents + lettres spéciales + parenthèses) pour matcher les noms
  function normName(s) {
    return (s || '').replace(/\([^)]*\)/g, ' ')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/ø/gi, 'o').replace(/å/gi, 'a').replace(/[æ]/gi, 'ae')
      .replace(/ł/gi, 'l').replace(/[đð]/gi, 'd').replace(/ı/gi, 'i')
      .replace(/ß/gi, 'ss').toLowerCase().replace(/\s+/g, ' ').trim();
  }
  // Retrouve un joueur de la DB depuis un nom de compo (tolérant aux accents)
  function findGuessPlayer(name) {
    const q = normName(name);
    if (!q) return null;
    const P = window.PLAYERS;
    let p = P.find(x => normName(x.name) === q);
    if (p) return p;
    p = P.find(x => { const n = normName(x.name); return n.endsWith(' ' + q) || n === q; });
    if (p) return p;
    const ql = q.split(' ').pop();
    p = P.find(x => normName(x.name).split(' ').pop() === ql);
    return p || null;
  }
  // Joueurs ABSENTS de la base (2500 entrées) : nat + club fournis à la main
  // pour que Guess affiche toujours drapeau/écusson (jamais de fallback vide).
  const GUESS_DB_FIX = {
    'Messi':             { nat: 'Argentina',   club: 'Inter Miami' },
    'Cristiano Ronaldo': { nat: 'Portugal',    club: 'Al-Nassr' },
    'Neuer':             { nat: 'Germany',     club: 'Bayern Munich' },
    'Pickford':          { nat: 'England',     club: 'Everton' },
    'Martinelli':        { nat: 'Brazil',      club: 'Arsenal' },
    'Zaïre-Emery':       { nat: 'France',      club: 'Paris SG' },
    'Dumfries':          { nat: 'Netherlands', club: 'Inter' },
    'de Vrij':           { nat: 'Netherlands', club: 'Inter' },
    'Aké':               { nat: 'Netherlands', club: 'Manchester City' },
    'Depay':             { nat: 'Netherlands', club: 'Corinthians' },
    'Gatti':             { nat: 'Italy',       club: 'Juventus' },
    'Koke':              { nat: 'Spain',       club: 'Atlético Madrid' },
    'Bentancur':         { nat: 'Uruguay',     club: 'Tottenham' },
    'Burn':              { nat: 'England',     club: 'Newcastle' },
    'Schär':             { nat: 'Switzerland', club: 'Newcastle' },
    'Trippier':          { nat: 'England',     club: 'Newcastle' },
    'Meret':             { nat: 'Italy',       club: 'Napoli' },
    'Rrahmani':          { nat: 'Kosovo',      club: 'Napoli' },
    'Di Lorenzo':        { nat: 'Italy',       club: 'Napoli' },
    'Politano':          { nat: 'Italy',       club: 'Napoli' },
    'Wendell':           { nat: 'Brazil',      club: 'São Paulo' },
    'Danilo':            { nat: 'Brazil',      club: 'Flamengo' },
    'Andrich':           { nat: 'Germany',     club: 'Bayer Leverkusen' },
    'Cancelo':           { nat: 'Portugal',    club: 'Al-Hilal' },
    'Otamendi':          { nat: 'Argentina',   club: 'River Plate' },
  };
  // Méta d'affichage (nat/club) d'un slot : DB d'abord, sinon override
  function guessMeta(name) {
    return findGuessPlayer(name) || GUESS_DB_FIX[name] || null;
  }
  // Badge club court : initiales (max 4 chars) avec accent couleur
  function clubBadge(club) {
    if (!club) return '?';
    return club.replace(/\bFC\b|\bAC\b|\bAS\b|\bAFC\b|\bUS\b/g, '').trim().split(' ').filter(Boolean)
      .map(w => w[0]).join('').slice(0, 4).toUpperCase();
  }
  // Écusson de club scrapé (Wikipedia) → chemin local, sinon null (fallback initiales)
  function clubLogoSrc(club) {
    if (!club || !window.CLUB_LOGOS) return null;
    return window.CLUB_LOGOS[club]
      || window.CLUB_LOGOS[club.replace(/\b[FA]\.?C\.?\b/gi, '').trim()]
      || null;
  }

  function initGuessScreen() {
    document.body.setAttribute('data-mode', 'guess');
    if ($('#guessVariants')) $('#guessVariants').style.display = '';
    if ($('#guessGame')) $('#guessGame').style.display = 'none';
    if ($('#guessFeedback')) $('#guessFeedback').textContent = '';
    if ($('#guessBack')) $('#guessBack').onclick = () => { stopGuessTimer(); showScreen('home'); };
    $$('#guessVariants .guess-variant').forEach(b => {
      b.onclick = () => startGuess(b.dataset.variant);
    });
  }
  function fillGuessParticipants() {
    const wrap = $('#guessParticipants');
    if (!wrap || wrap.children.length) return;
    for (let i = 0; i < 4; i++) {
      const row = el('div', { class: 'mr-guess-row' });
      row.appendChild(el('label', {}, 'Joueur ' + (i + 1)));
      row.appendChild(el('input', { type: 'text', value: i < 2 ? ['Alex', 'Sam'][i] : '', placeholder: 'Pseudo (vide = absent)' }));
      wrap.appendChild(row);
    }
  }
  function toggleGuessPlayers() {
    const isMulti = (($('#setupGuessPanel .guess-mode-btn.active') || {}).dataset || {}).guessMode === 'multi';
    if ($('#guessPlayers')) $('#guessPlayers').style.display = isMulti ? 'block' : 'none';
  }
  function bindInlineGuessSetup() {
    if (!$('#setupGuessPanel')) return;
    fillGuessParticipants();
    toggleGuessPlayers();
    // Mode pick (solo/multi)
    $$('#setupGuessPanel .guess-mode-btn').forEach(b => {
      b.onclick = () => {
        $$('#setupGuessPanel .guess-mode-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        toggleGuessPlayers();
      };
    });
    // Variant pick
    $$('#setupGuessPanel .guess-variant-card').forEach(b => {
      b.onclick = () => {
        $$('#setupGuessPanel .guess-variant-card').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
      };
    });
    // Démarrer
    const startBtn = $('#guessStartInline');
    if (startBtn) startBtn.onclick = () => {
      const variant = ($('#setupGuessPanel .guess-variant-card.active') || {}).dataset?.variant || 'club';
      const mode = ($('#setupGuessPanel .guess-mode-btn.active') || {}).dataset?.guessMode || 'solo';
      let players = null;
      if (mode === 'multi') {
        players = $$('#guessParticipants input').map(i => i.value.trim()).filter(Boolean);
        if (players.length < 2) return toast('Pas assez de joueurs', 'Le mode Tour à tour demande au moins 2 joueurs.');
      }
      showScreen('guess');
      startGuess(variant, mode, players);
    };
  }
  let guessTimer = null;
  const GUESS_SECONDS = 20;
  function stopGuessTimer() { if (guessTimer) { clearInterval(guessTimer); guessTimer = null; } }
  function startGuess(variant, mode, players) {
    const pool = variant === 'club' ? GUESS_CLUB_LINEUPS : GUESS_NATION_LINEUPS;
    guessState = {
      variant,
      mode: mode || 'solo',
      pool: pool.slice().sort(() => Math.random() - 0.5),
      idx: 0,
      score: 0,
      streak: 0,
      players: (mode === 'multi' && players) ? players.map(n => ({ name: n, score: 0 })) : null,
      turn: 0,
    };
    if ($('#guessVariants')) $('#guessVariants').style.display = 'none';
    if ($('#guessGame')) $('#guessGame').style.display = '';
    if ($('#guessSkip')) $('#guessSkip').onclick = () => skipGuess();
    if ($('#guessInput')) {
      $('#guessInput').oninput = () => updateSuggestions();
      $('#guessInput').onkeydown = (ev) => { if (ev.key === 'Enter') submitGuessAnswer(); };
    }
    renderGuessRound();
  }
  function renderGuessRound() {
    stopGuessTimer();
    const s = guessState;
    if (s.idx >= s.pool.length) {
      s.pool = (s.variant === 'club' ? GUESS_CLUB_LINEUPS : GUESS_NATION_LINEUPS).slice().sort(() => Math.random() - 0.5);
      s.idx = 0;
    }
    const target = s.pool[s.idx];
    s._target = target;
    // Mode Tour à tour : indicateur de tour + scoreboard par joueur
    const turnEl = $('#guessTurn'), sbEl = $('#guessScoreboard');
    if (s.players) {
      if (turnEl) { turnEl.style.display = ''; turnEl.textContent = 'Au tour de ' + s.players[s.turn].name; }
      if (sbEl) {
        sbEl.style.display = '';
        sbEl.innerHTML = '';
        const best = Math.max.apply(null, s.players.map(p => p.score));
        s.players.forEach((p, i) => {
          const tile = el('div', { class: 'gsb-tile' + (i === s.turn ? ' active' : '') + (p.score === best && best > 0 ? ' lead' : '') });
          tile.appendChild(el('span', { class: 'gsb-name' }, p.name));
          tile.appendChild(el('span', { class: 'gsb-pts' }, String(p.score)));
          sbEl.appendChild(tile);
        });
      }
    } else {
      if (turnEl) turnEl.style.display = 'none';
      if (sbEl) sbEl.style.display = 'none';
    }
    $('#guessVariantLabel').textContent = s.variant === 'club' ? 'CLUB INCONNU' : 'SÉLECTION INCONNUE';
    $('#guessHint').textContent = s.variant === 'club'
      ? '11 joueurs masqués par leur drapeau de nationalité'
      : '11 joueurs masqués par leur badge de club';
    if ($('#guessInput')) {
      $('#guessInput').value = '';
      $('#guessInput').placeholder = s.variant === 'club' ? 'Tape un club…' : 'Tape une sélection…';
    }
    $('#guessFeedback').textContent = '';
    $('#guessFeedback').className = 'guess-feedback';
    $('#guessScore').textContent = s.score;
    $('#guessStreak').textContent = 'Série · ' + s.streak;

    // === TERRAIN VISUEL : affiche les 11 joueurs sur la formation
    // avec leur drapeau (club mode) ou badge club (nation mode) — PAS le nom ===
    const lineup = $('#guessLineup');
    lineup.innerHTML = '';
    lineup.className = 'guess-pitch';
    const formation = window.FORMATIONS[target.formation] || window.FORMATIONS['4-3-3'];
    if (!formation) return;

    // Positionnement absolu sur le pitch comme le mode draft
    target.slots.forEach((slotData, i) => {
      const formSlot = formation.slots[i];
      if (!formSlot) return;
      const playerData = guessMeta(slotData.name);
      const slot = el('div', { class: 'gp-slot', style: `left:${formSlot.x}%; top:${formSlot.y}%` });
      const bubble = el('div', { class: 'gp-bubble' });
      if (s.variant === 'club') {
        // Variante club → afficher le drapeau de la nationalité du joueur
        const flag = flagEl(playerData ? playerData.nat : null);
        flag.title = playerData ? playerData.nat : '';
        bubble.appendChild(flag);
      } else {
        // Variante sélection → afficher l'écusson du club (sinon initiales)
        const club = playerData ? playerData.club : '';
        const logo = clubLogoSrc(club);
        // glowColorFor exige un vrai joueur DB (les overrides n'ont que nat/club)
        const clubBg = playerData && playerData.id && playerData.club ? glowColorFor(playerData) : [120, 130, 150];
        const badge = el('div', {
          class: 'gp-club-badge' + (logo ? ' has-logo' : ''),
          style: logo ? '' : `background:rgb(${clubBg[0]},${clubBg[1]},${clubBg[2]})`,
        });
        if (logo) {
          const img = el('img', { src: logo, alt: '', loading: 'lazy' });
          img.addEventListener('error', () => {
            badge.classList.remove('has-logo');
            badge.style.background = `rgb(${clubBg[0]},${clubBg[1]},${clubBg[2]})`;
            img.remove();
            badge.textContent = clubBadge(club);
          });
          badge.appendChild(img);
        } else {
          badge.textContent = clubBadge(club);
        }
        badge.title = club || '';
        bubble.appendChild(badge);
      }
      slot.appendChild(bubble);
      slot.appendChild(el('div', { class: 'gp-pos' }, slotData.type));
      lineup.appendChild(slot);
    });
    setTimeout(() => $('#guessInput') && $('#guessInput').focus(), 100);

    // Timer du tour : à 0 → manche perdue (révèle la réponse, joueur suivant)
    let left = GUESS_SECONDS;
    const tn = $('#guessTimerNum'), tEl = $('#guessTimer');
    if (tn) tn.textContent = String(left);
    if (tEl) tEl.classList.remove('urgent');
    guessTimer = setInterval(() => {
      left--;
      if (tn) tn.textContent = String(Math.max(0, left));
      if (tEl && left <= 5) tEl.classList.add('urgent');
      if (left <= 0) { stopGuessTimer(); guessTimeout(); }
    }, 1000);
  }
  // Avance au tour suivant (multi) puis à la manche suivante
  function guessAdvance(delay) {
    const s = guessState;
    setTimeout(() => {
      if (s.players) s.turn = (s.turn + 1) % s.players.length;
      s.idx++;
      renderGuessRound();
    }, delay);
  }
  function guessTimeout() {
    const s = guessState;
    s.streak = 0;
    const fb = $('#guessFeedback');
    fb.textContent = '⏱ Temps écoulé — réponse : ' + s._target.team;
    fb.className = 'guess-feedback wrong';
    $('#guessStreak').textContent = 'Série · 0';
    guessAdvance(1800);
  }
  function updateSuggestions() {
    const s = guessState;
    const q = $('#guessInput').value.trim().toLowerCase();
    const sugg = $('#guessSuggestions');
    sugg.innerHTML = '';
    if (q.length < 1) return;
    // Pool des réponses possibles
    const pool = s.variant === 'club'
      ? Array.from(new Set(PLAYERS.map(p => p.club).filter(Boolean)))
      : Array.from(new Set(PLAYERS.map(p => p.nat).filter(Boolean)));
    const matches = pool.filter(name => name.toLowerCase().includes(q)).slice(0, 6);
    matches.forEach(name => {
      const it = el('div', { class: 'guess-suggestion' }, name);
      it.onclick = () => { $('#guessInput').value = name; sugg.innerHTML = ''; submitGuessAnswer(); };
      sugg.appendChild(it);
    });
  }
  function submitGuessAnswer() {
    const s = guessState;
    if (!s || !s._target) return;
    stopGuessTimer();
    const ans = $('#guessInput').value.trim().toLowerCase();
    const target = s._target.team.toLowerCase();
    const fb = $('#guessFeedback');
    if (ans === target || target.includes(ans) && ans.length >= 4) {
      s.score++;
      s.streak++;
      if (s.players) s.players[s.turn].score++;     // point au joueur du tour
      fb.textContent = '✓ Bonne réponse : ' + s._target.team
        + (s.players ? ' · +1 ' + s.players[s.turn].name : '');
      fb.className = 'guess-feedback correct';
      $('#guessScore').textContent = s.score;
      $('#guessStreak').textContent = 'Série · ' + s.streak;
      $('#guessSuggestions').innerHTML = '';
      guessAdvance(1500);
    } else {
      s.streak = 0;
      fb.textContent = '✗ Réponse : ' + s._target.team;
      fb.className = 'guess-feedback wrong';
      $('#guessStreak').textContent = 'Série · 0';
      guessAdvance(2000);
    }
  }
  function skipGuess() {
    const s = guessState;
    stopGuessTimer();
    s.streak = 0;
    const fb = $('#guessFeedback');
    fb.textContent = '⏭ ' + s._target.team;
    fb.className = 'guess-feedback wrong';
    guessAdvance(1300);
  }

  // ============================================================
  // UNDERCOVER FOOT
  // Salon multi (3-8), distribution de rôles, vote, révélation
  // ============================================================
  let underState = null;
  function initUnderScreen() {
    document.body.setAttribute('data-mode', 'under');
    if ($('#underSetup')) $('#underSetup').style.display = '';
    if ($('#underGame')) $('#underGame').style.display = 'none';
    if ($('#underVotePhase')) $('#underVotePhase').style.display = 'none';
    if ($('#underBack')) $('#underBack').onclick = () => showScreen('home');
    if (!underState) underState = { players: [], scores: {} };
    renderUnderPlayers();
    if ($('#underAddBtn')) $('#underAddBtn').onclick = () => addUnderPlayer();
    if ($('#underNewName')) $('#underNewName').onkeydown = (ev) => { if (ev.key === 'Enter') addUnderPlayer(); };
    if ($('#underStart')) $('#underStart').onclick = () => startUnderRound();
  }
  function bindInlineUnderSetup() {
    if (!$('#setupUnderPanel')) return;
    if (!underState) underState = { players: [], scores: {} };
    renderUnderPlayers();
    if ($('#underAddBtn')) $('#underAddBtn').onclick = () => addUnderPlayer();
    if ($('#underNewName')) $('#underNewName').onkeydown = (ev) => { if (ev.key === 'Enter') addUnderPlayer(); };
    if ($('#underStart')) $('#underStart').onclick = () => { showScreen('under'); startUnderRound(); };
  }
  function addUnderPlayer() {
    const inp = $('#underNewName');
    const name = inp.value.trim();
    if (!name) return;
    if (underState.players.length >= 8) { toast('Maximum 8 joueurs'); return; }
    underState.players.push({ id: 'u' + Date.now(), name, alive: true });
    inp.value = '';
    renderUnderPlayers();
  }
  function renderUnderPlayers() {
    const wrap = $('#underPlayers');
    wrap.innerHTML = '';
    underState.players.forEach((p, i) => {
      const pill = el('div', { class: 'under-pill' });
      pill.appendChild(el('span', {}, p.name));
      const rm = el('button', { class: 'under-pill-rm' }, '×');
      rm.onclick = () => { underState.players.splice(i, 1); renderUnderPlayers(); };
      pill.appendChild(rm);
      wrap.appendChild(pill);
    });
    $('#underStart').disabled = underState.players.length < 3;
  }
  // Paire DYNAMIQUE tirée de la base : 2 joueurs du même registre (poste +
  // valeur proche) → imposteur difficile à coincer, et un pool quasi infini.
  // Pool Undercover : STARS uniquement. Le seuil de valeur sert de proxy de
  // notoriété — ≥45 M€ écarte les role-players méconnus des 5 grands champ.
  // (+ légendes, toujours iconiques). Saudi/MLS limités aux très grosses cotes.
  const UNDER_TOP_LEAGUES = new Set([
    'Premier League','La Liga','Bundesliga','Serie A','Ligue 1',
  ]);
  let _underPool = null;
  function underPool() {
    if (_underPool) return _underPool;
    const cur = (window.PLAYERS || []).filter(p =>
      p.name && !/\(/.test(p.name) && UNDER_TOP_LEAGUES.has(p.league) && p.value >= 45);
    const legends = (window.LEGENDS || []);
    _underPool = cur.concat(legends);
    return _underPool;
  }
  const underBucketOf = p => {
    const pos = (p.posMain || p.positions || [])[0] || '';
    if (pos === 'GK') return 'GK';
    if (['CB','LB','RB','LWB','RWB'].includes(pos)) return 'DEF';
    if (['DM','CM','AM','LM','RM'].includes(pos)) return 'MID';
    return 'ATT';
  };
  const underUsedIds = new Set();   // anti-répétition à l'échelle de la session
  // Renvoie une PAIRE d'objets joueurs [a, b] similaires (même registre,
  // valeur proche), jamais réutilisés tant que le pool n'est pas épuisé.
  function pickUnderPair() {
    const pool = underPool().filter(p => p.value > 0);
    if (pool.length < 20) return null;
    const buckets = { GK: [], DEF: [], MID: [], ATT: [] };
    pool.forEach(p => { if (!underUsedIds.has(p.id)) buckets[underBucketOf(p)].push(p); });
    let keys = ['ATT','ATT','MID','MID','DEF','GK'].filter(k => buckets[k].length >= 2);
    if (!keys.length) {                 // pool épuisé → on repart à zéro
      underUsedIds.clear();
      return pickUnderPair();
    }
    const arr = buckets[keys[Math.floor(Math.random() * keys.length)]];
    const a = arr[Math.floor(Math.random() * arr.length)];
    let cands = arr.filter(x => x.id !== a.id && x.value >= a.value * 0.5 && x.value <= a.value * 2);
    if (!cands.length) cands = arr.filter(x => x.id !== a.id);
    const b = cands[Math.floor(Math.random() * cands.length)];
    underUsedIds.add(a.id); underUsedIds.add(b.id);
    return Math.random() < 0.5 ? [a, b] : [b, a];
  }
  // Paires de secours si la base n'est pas chargée
  const UNDER_WORDS = [
    ['Messi', 'Cristiano Ronaldo'],
    ['Mbappé', 'Haaland'],
    ['Vinicius Jr.', 'Saka'],
    ['Bellingham', 'Yamal'],
    ['Modric', 'Kroos'],
    ['Pedri', 'Gavi'],
    ['Salah', 'Sterling'],
    ['Benzema', 'Lewandowski'],
    ['Kanté', 'Casemiro'],
    ['Maignan', 'Donnarumma'],
    ['Mertens', 'Insigne'],
    ['Mané', 'Salah'],
    ['Foden', 'De Bruyne'],
    ['Rodri', 'Casemiro'],
    ['Rashford', 'Sancho'],
  ];
  // Deck de questions de déduction (façon apps Undercover mobiles) — créatives
  const UNDER_QUESTIONS = [
    'Quel premier mot vous vient à l\'esprit en pensant à ce joueur ?',
    'Ce joueur est-il surcoté ou sous-coté ? Pourquoi ?',
    'Un personnage de fiction auquel il vous fait penser ?',
    'Dans quel club le verriez-vous parfaitement ?',
    'Une qualité, un défaut — en un mot chacun.',
    'Plutôt Ballon d\'Or ou éternel second ?',
    'Un animal qui lui correspond ?',
    'Le décririez-vous comme un leader ou un suiveur ?',
    'Une couleur qui lui va bien ?',
    'Titulaire ou remplaçant dans votre équipe de rêve ?',
    'Plutôt génie ou travailleur acharné ?',
    'En une émotion, qu\'est-ce qu\'il vous inspire ?',
    'S\'il était un plat, ce serait quoi ?',
    'Quelle musique passerait quand il entre sur le terrain ?',
    'S\'il était un métier hors football, lequel ?',
    'Sa célébration de but idéale en deux mots ?',
    'Plutôt match de gala ou derby sous la pluie ?',
    'Quel super-pouvoir lui collerait à la peau ?',
    'S\'il était une voiture, laquelle ?',
    'Tu lui prêtes ta PS5 : il te la rend dans quel état ?',
    'Son emoji signature ?',
    'Il rate un penalty décisif : quelle est sa réaction ?',
    'Plutôt insta-foot ou fantôme des réseaux ?',
    'S\'il était un prof, il enseignerait quoi ?',
    'Un mot pour décrire sa coupe de cheveux ?',
    'Capitaine de soirée ou premier parti ?',
    'S\'il était une météo, laquelle ?',
    'Combien de temps il survivrait dans Koh-Lanta ?',
    'Son point faible caché, en un mot ?',
    'Plutôt tunnel de dribbles ou passe décisive sobre ?',
    'Quelle pub pourrait-il tourner demain ?',
    'S\'il était un jeu vidéo, lequel ?',
    'Sa réaction quand l\'arbitre sort le jaune ?',
    'Tu le croises au marché : il achète quoi ?',
    'Un sport où il serait nul ?',
    'Son surnom dans le vestiaire, à votre avis ?',
    'Décris-le en 1 mot, mais mens à moitié.',
    'Mime sa façon de courir (sans parler).',
    'Une ville qui lui ressemble ?',
    'Plutôt clip de rap ou doc Netflix ?',
    'S\'il était une épice, laquelle ?',
    'Le détail qui ferait dire « c\'est lui » ?',
    'Une stat imaginaire qui le décrit.',
    'S\'il jouait à un autre poste, lequel ?',
    'Une appli forcément sur son téléphone ?',
    'Plutôt feu, eau, terre ou air ?',
    'Décris son tatouage (réel ou inventé).',
    'Il arrive en retard : son excuse ?',
    'Décris-le comme à ta grand-mère.',
    'Une décennie qui lui irait mieux ?',
    'Donne un seul mot… en chuchotant.',
  ];
  // Angle d'indice unique par joueur (recyclage si plus de joueurs que d'angles)
  function pickUnderAngles(n) {
    const sh = UNDER_QUESTIONS.slice().sort(() => Math.random() - 0.5);
    const out = []; for (let i = 0; i < n; i++) out.push(sh[i % sh.length]);
    return out;
  }

  const UNDER_STAGE_HTML =
    '<div class="uc-prompt" id="underPrompt">Téléphone à <strong id="underTurn">—</strong></div>' +
    '<button class="under-reveal-card" id="underRevealCard">' +
      '<div class="urc-front"><div class="urc-eyebrow">Touche pour révéler</div><div class="urc-icon">🔒</div></div>' +
      '<div class="urc-back"><div class="urc-eyebrow" id="underRoleLabel">CIVIL</div><div class="urc-mot" id="underMot">—</div>' +
      '<div class="urc-hint">Garde-le secret. Repasse l\'appareil quand tu as compris.</div></div>' +
    '</button>' +
    '<button class="btn btn-ghost" id="underNextTurn">Joueur suivant →</button>';

  function startUnderRound() {
    // Restaure le stage (la discussion l'a peut-être remplacé)
    const stage = $('.under-card-stage');
    if (stage) stage.innerHTML = UNDER_STAGE_HTML;
    const pair = pickUnderPair();
    if (!pair) { toast('Base indisponible', 'Recharge la page et réessaie.'); return; }
    const civil = pair[0];        // objet joueur
    const impostor = pair[1];     // objet joueur (similaire)
    const playersShuffled = underState.players.slice().sort(() => Math.random() - 0.5);
    const impostorIdx = Math.floor(Math.random() * playersShuffled.length);
    playersShuffled.forEach((p, i) => {
      p.role = i === impostorIdx ? 'impostor' : 'civil';
      p.secret = i === impostorIdx ? impostor : civil;   // objet joueur à révéler
      p.revealed = false;
      p.alive = true;
    });
    // 3 questions aléatoires distinctes pour la discussion
    const qs = UNDER_QUESTIONS.slice().sort(() => Math.random() - 0.5).slice(0, 3);
    underState.players = playersShuffled;
    underState.round = { civil, impostor, turnIdx: 0, questions: qs, phase: 'handoff' };
    $('#underSetup').style.display = 'none';
    $('#underGame').style.display = '';
    $('#underVotePhase').style.display = 'none';
    showUnderHandoff();
  }

  // Interstitiel "passe l'appareil à X" — on sait clairement à qui donner
  function showUnderHandoff() {
    const round = underState.round;
    const p = underState.players[round.turnIdx];
    if (!p) return;
    const card = $('#underRevealCard');
    // ANTI-FUITE : on coupe la transition de flip pendant le reset → la carte
    // revient face cachée INSTANTANÉMENT (aucune rotation où on verrait le
    // secret du joueur précédent), puis on réactive l'animation pour le tap.
    card.style.transition = 'none';
    card.querySelectorAll('.urc-front, .urc-back').forEach(f => f.style.transition = 'none');
    card.classList.remove('revealed');
    $('#underRoleLabel').textContent = '';
    $('#underMot').innerHTML = '';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      card.style.transition = '';
      card.querySelectorAll('.urc-front, .urc-back').forEach(f => f.style.transition = '');
    }));
    const prompt = $('#underPrompt');
    prompt.innerHTML = '📱 Passe l\'appareil à <strong>' + p.name + '</strong>';
    // Le front de la carte montre "Je suis X — toucher pour voir mon joueur"
    const front = card.querySelector('.urc-front .urc-eyebrow');
    if (front) front.textContent = 'Je suis ' + p.name + ' — toucher';
    const nextBtn = $('#underNextTurn');
    nextBtn.textContent = (round.turnIdx >= underState.players.length - 1) ? 'Lancer la discussion →' : 'Joueur suivant →';
    card.onclick = () => {
      // Pas de mention civil/imposteur : chacun voit juste SON joueur et doit
      // deviner s'il est l'intrus (comme une vraie app Undercover).
      $('#underRoleLabel').textContent = 'TON JOUEUR';
      const mot = $('#underMot');
      mot.innerHTML = '';
      const secret = p.secret;
      if (secret) {
        const ph = el('div', { class: 'uc-secret-photo', style: `background:${gradientFor(secret)}` });
        attachPhoto(ph, secret, 'uc-secret-img');
        ph.appendChild(el('span', { class: 'uc-secret-fb' }, initials(secret)));
        mot.appendChild(ph);
        mot.appendChild(el('div', { class: 'uc-secret-name' }, secret.name));
      }
      card.classList.add('revealed');
    };
    nextBtn.onclick = () => {
      round.turnIdx++;
      if (round.turnIdx >= underState.players.length) {
        showUnderDiscussion();
      } else {
        showUnderHandoff();
      }
    };
  }

  // Phase discussion : questions aléatoires affichées pour guider la déduction
  function showUnderDiscussion() {
    const stage = $('.under-card-stage');
    if (!stage) { startUnderVotePhase(); return; }
    // Un angle d'indice DIFFÉRENT pour chaque joueur → plus varié et ludique.
    // Indice libre : un mot, un mime, une image… celui qui se sait flou bluffe.
    const alive = underState.players.filter(p => p.alive);
    const angles = pickUnderAngles(alive.length);
    stage.innerHTML =
      '<div class="uc-prompt">Indices — chacun son tour, à voix haute</div>' +
      '<div class="under-questions">' +
        alive.map((p, i) =>
          '<div class="under-q"><span class="uq-num">' + (i + 1) + '</span>' +
          '<span><strong>' + p.name + '</strong> — ' + angles[i] + '</span></div>'
        ).join('') +
      '</div>' +
      '<p class="under-q-hint">Indice LIBRE (mot, mime, image). Si ton joueur te paraît seul de son genre, tu es peut-être l\'intrus : reste vague et oriente les soupçons.</p>' +
      '<button class="btn btn-primary" id="underToVote">Passer au vote →</button>';
    $('#underToVote').onclick = () => startUnderVotePhase();
  }
  function startUnderVotePhase() {
    $('#underVotePhase').style.display = '';
    const grid = $('#underVoteGrid');
    grid.innerHTML = '';
    const alive = underState.players.filter(p => p.alive);
    alive.forEach(p => {
      const btn = el('button', { class: 'under-vote-item' });
      btn.appendChild(el('span', { class: 'uvi-name' }, p.name));
      btn.onclick = () => underVoteFor(p.id);
      grid.appendChild(btn);
    });
    $('#underVoteResult').textContent = '';
  }
  function underVoteFor(playerId) {
    const accused = underState.players.find(p => p.id === playerId);
    if (!accused) return;
    const wasImpostor = accused.role === 'impostor';
    const impostor = underState.players.find(p => p.role === 'impostor');
    const result = $('#underVoteResult');
    result.innerHTML = '';

    // === POINTS ===
    // Civils démasquent l'imposteur → +1 chaque civil.
    // L'imposteur survit (mauvaise cible) → +3 (récompense le bluff).
    if (wasImpostor) {
      underState.players.filter(p => p.role === 'civil')
        .forEach(p => { underState.scores[p.id] = (underState.scores[p.id] || 0) + 1; });
    } else if (impostor) {
      underState.scores[impostor.id] = (underState.scores[impostor.id] || 0) + 3;
    }
    underState.roundNo = (underState.roundNo || 1);

    // Verdict + la PAIRE révélée (photos) pour voir à quel point c'était serré
    const verdict = el('div', { class: wasImpostor ? 'uvr-win' : 'uvr-lose' },
      wasImpostor ? '✓ Imposteur démasqué !' : '✗ Raté — ' + accused.name + ' était un civil. L\'imposteur s\'en sort (+3).');
    result.appendChild(verdict);
    const pair = el('div', { class: 'uvr-pair' });
    [['Civils', underState.round.civil], ['Imposteur', underState.round.impostor]].forEach(([lab, pl]) => {
      const cell = el('div', { class: 'uvr-pair-cell' });
      const ph = el('div', { class: 'uc-secret-photo', style: `background:${gradientFor(pl)}` });
      attachPhoto(ph, pl, 'uc-secret-img'); ph.appendChild(el('span', { class: 'uc-secret-fb' }, initials(pl)));
      cell.appendChild(ph);
      cell.appendChild(el('div', { class: 'uvr-pair-lab' }, lab));
      cell.appendChild(el('div', { class: 'uvr-pair-name' }, pl.name));
      pair.appendChild(cell);
    });
    result.appendChild(pair);

    // === SCOREBOARD cumulé (trié) ===
    result.appendChild(renderUnderScoreboard());

    const again = el('button', { class: 'btn btn-primary', style: 'margin-top:16px' }, 'Manche suivante →');
    again.onclick = () => { underState.roundNo = (underState.roundNo || 1) + 1; startUnderRound(); };
    result.appendChild(again);
    const stop = el('button', { class: 'btn btn-ghost', style: 'margin-top:8px' }, 'Terminer · nouveaux joueurs');
    stop.onclick = () => {
      underState.scores = {}; underState.roundNo = 1;
      $('#underSetup').style.display = ''; $('#underGame').style.display = 'none'; renderUnderPlayers();
    };
    result.appendChild(stop);
  }
  function renderUnderScoreboard() {
    const sb = el('div', { class: 'under-scoreboard' });
    sb.appendChild(el('div', { class: 'usb-title' }, 'Classement · manche ' + (underState.roundNo || 1)));
    const rows = underState.players.slice()
      .map(p => ({ name: p.name, score: underState.scores[p.id] || 0 }))
      .sort((a, b) => b.score - a.score);
    const best = rows.length ? rows[0].score : 0;
    rows.forEach(r => {
      const tile = el('div', { class: 'usb-row' + (r.score === best && best > 0 ? ' lead' : '') });
      tile.appendChild(el('span', { class: 'usb-name' }, r.name));
      tile.appendChild(el('span', { class: 'usb-pts' }, r.score + ' pt' + (r.score > 1 ? 's' : '')));
      sb.appendChild(tile);
    });
    return sb;
  }

  function init() {
    const note = $('#datasetNote');
    if (note) note.textContent = `${PLAYERS.length} joueurs · données Transfermarkt saison 2025-26 · valeurs marchandes en temps réel`;

    buildHero();
    bindSetup();
    bindInlineJusteSetup();
    bindInlineGuessSetup();
    bindInlineUnderSetup();
    bindModeTabs();
    bindLobby();
    populateOnlineFormations();
    renderParticipants();
    bindModals();
    bindPicker();
    bindShortlist();
    bindSpotlight();
    initSeasonScreen();
    $('#startGame').addEventListener('click', startGame);
    $('#restartBtn').addEventListener('click', restart);
    $('#restartBtn2') && $('#restartBtn2').addEventListener('click', restart);
    $('#toStadium') && $('#toStadium').addEventListener('click', goToTactics);
    $('#tacticsValidate') && $('#tacticsValidate').addEventListener('click', () => {
      syncAllTacticsToStadium();
      // Skip le modal askNextStyle puisque déjà configuré
      stadiumState._tacticsFromBoard = true;
      goToStadium();
    });
    $('#simSkip') && $('#simSkip').addEventListener('click', () => {
      simAnim.skipping = true;
      clearSimAnim();
      closeModal('#modalSim');
      renderTournament();
    });
    $('#simSpeed') && $('#simSpeed').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      $$('#simSpeed button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      simAnim.speed = +b.dataset.spd;
    });
    $('#logoHome').addEventListener('click', (e) => { e.preventDefault(); restart(); });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
