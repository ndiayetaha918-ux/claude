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
    const url1 = window.photoUrl && window.photoUrl(player);
    const url2 = window.photoUrlFallback && window.photoUrlFallback(player);
    if (!url1 && !url2) return;
    const im = new Image();
    im.alt = player.name;
    im.loading = 'lazy';
    im.referrerPolicy = 'no-referrer';
    im.className = imgClass;
    let triedFallback = false;
    im.onload = () => { if (im.naturalWidth > 1) container.classList.add('has-img'); };
    im.onerror = () => {
      if (!triedFallback && url2 && url2 !== url1) {
        triedFallback = true;
        im.src = url2;
      } else {
        im.remove();
      }
    };
    im.src = url1 || url2;
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
    // Hero v4 : spatial arc 3 cards (Five / Draft / Juste)
    const bento = $('#modeBento');
    if (!bento) return;

    // Parallax au niveau du stage (l'ensemble bouge subtilement avec la souris)
    let rafParallax = null;
    function setParallax(mx, my) {
      bento.style.setProperty('--mx', mx);
      bento.style.setProperty('--my', my);
    }
    bento.addEventListener('pointermove', (ev) => {
      const r = bento.getBoundingClientRect();
      const mx = ((ev.clientX - r.left) / r.width - 0.5) * 2;   // -1..1
      const my = ((ev.clientY - r.top) / r.height - 0.5) * 2;
      if (rafParallax) return;
      rafParallax = requestAnimationFrame(() => {
        rafParallax = null;
        setParallax(mx.toFixed(3), my.toFixed(3));
      });
      // glow per card
      const card = ev.target.closest && ev.target.closest('.mode-card');
      if (card) {
        const cr = card.getBoundingClientRect();
        card.style.setProperty('--mx-px', (ev.clientX - cr.left) + 'px');
        card.style.setProperty('--my-px', (ev.clientY - cr.top) + 'px');
      }
    });
    bento.addEventListener('pointerleave', () => setParallax(0, 0));

    bento.addEventListener('click', (ev) => {
      const card = ev.target.closest('.mode-card');
      if (!card) return;
      routeMode(card.dataset.bento);
    });
  }

  function routeMode(mode) {
    if (mode === 'draft') {
      // setup classique — scroll vers le panneau
      $('#setupSection').scrollIntoView({ behavior: 'smooth' });
    } else if (mode === 'five') {
      showScreen('five');
      initFiveScreen();
    } else if (mode === 'juste') {
      showScreen('juste');
      initJusteScreen();
    }
  }

  // ============================================================
  // SETUP
  // ============================================================
  const ALL_LEAGUES = Array.from(new Set(PLAYERS.map(p => p.league))).sort();

  // Top 5 leagues activés par défaut (UX clearer que tout activé)
  const TOP5_LEAGUES = ['Premier League', 'La Liga', 'Bundesliga', 'Serie A', 'Ligue 1'];

  function updateLeagueCounter() {
    const lbl = $('#leagueCounter');
    if (lbl) lbl.textContent = state.leagues.size + ' / ' + ALL_LEAGUES.length + ' championnats actifs';
  }

  function bindSetup() {
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

    // Clé API IA (optionnel)
    const aiKeyInput = $('#aiApiKey');
    const btnSaveAi = $('#btnSaveAiKey');
    if (aiKeyInput && btnSaveAi) {
      try {
        const saved = localStorage.getItem('drafter_ai_key');
        if (saved) aiKeyInput.value = saved;
      } catch (e) {}
      btnSaveAi.addEventListener('click', () => {
        const v = aiKeyInput.value.trim();
        try {
          if (v) localStorage.setItem('drafter_ai_key', v);
          else localStorage.removeItem('drafter_ai_key');
          btnSaveAi.textContent = '✓ Enregistré';
          setTimeout(() => btnSaveAi.textContent = 'Enregistrer', 1500);
        } catch (e) { toast('Erreur', 'localStorage indisponible.'); }
      });
    }

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
    $('#turnRound').textContent = `Round ${Math.min(state.round, 11)} / 11`;
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
        `${FORMATIONS[p.formation].label} · ${filled}/11 · ${p.spent.toFixed(0)} M€`));
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

  function renderPitch(participant, mountEl, opts) {
    opts = opts || {};
    const F = FORMATIONS[participant.formation];
    mountEl.innerHTML = '';
    mountEl.appendChild(el('div', { class: 'pitch-circle' }));
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
        `${FORMATIONS[p.formation].label} · ${filled}/11 · ${p.spent.toFixed(0)} M€`));
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
    $('#pickerEyebrow').textContent = `/ POSTE ${slot.type} · ${filled} / 11 picks faits`;
    $('#pickerTitle').textContent = `Choisir un ${POS_LABEL_FR[slot.type] || slot.type}`;

    // Reset UI
    $('#pickerSearch').value = '';
    $$('#pickerAge .chip').forEach(c => c.classList.remove('active'));
    $$('#pickerAge .chip')[0].classList.add('active');
    $('#pickerAffordable').checked = true;

    // League/Club selects scoped to allowed leagues + accepted positions
    const accepted = SLOT_RULES[slot.type];
    const candidates = PLAYERS.filter(p =>
      state.leagues.has(p.league) &&
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
        if (!state.leagues.has(p.league)) return false;
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
          el('div', { class: 'meta' }, `${FORMATIONS[p.formation].label} · ${filled}/11 · ${p.spent.toFixed(0)} / ${state.budget} M€`)),
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
    $('#turnRound').textContent = `Round ${Math.min(state.round, 11)} / 11`;
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
        `${FORMATIONS[p.formation].label} · ${filled}/11 · ${p.spent.toFixed(0)} M€${isCurrent ? ' · pioche…' : ''}`));
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
      state.leagues.has(p.league) &&
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
          el('div', { class: 'meta' }, `${FORMATIONS[p.formation].label} · ${filled}/11 · ${(st.spent[p.id] || 0).toFixed(0)} / ${st.settings.budget} M€`)),
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
  // ANALYSE IA (optionnelle, via clé Claude API du user)
  // ============================================================
  async function renderAiAnalysis() {
    const area = $('#aiAnalysisArea');
    const status = $('#aiAnalysisStatus');
    if (!area) return;
    // 1) Toujours rendre le raisonnement déterministe en premier (instantané)
    renderDeterministicAnalysis(area, status);
    // 2) Si une clé est posée, on enrichit avec l'analyse LLM par-dessus
    let aiConfig = null;
    try { aiConfig = localStorage.getItem('drafter_ai_key'); } catch (e) {}
    if (!aiConfig) return;
    const isWorker = aiConfig.startsWith('http');
    status.textContent = isWorker ? 'enrichissement via worker...' : 'enrichissement Claude...';
    const enrichBox = el('div', { class: 'ai-loading' });
    enrichBox.textContent = '⏳ ' + (isWorker ? 'Worker' : 'Claude') + ' approfondit l\'analyse...';
    area.appendChild(enrichBox);

    const teams = state.participants.map((p, i) => {
      const score = stadiumState.scores[i];
      const ts = tacticsState.byParticipant && tacticsState.byParticipant[i];
      const lineup = FORMATIONS[p.formation].slots.map(slot => {
        const pid = p.slots[slot.id];
        const player = pid ? playerById(pid) : null;
        const tp = ts && ts.players && ts.players[slot.id];
        const role = tp && tp.role ? window.Tactics.ROLES[tp.role] : null;
        return {
          slot: slot.type,
          player: player ? player.name + ' (' + player.value + 'M, ' + (player.posMain||[]).join('/') + ')' : '—',
          role: role ? role.label : '—',
        };
      });
      return {
        drafter: p.name,
        formation: FORMATIONS[p.formation].label,
        phases: ts ? ts.phases : {},
        overall: score.overall,
        breakdown: { qualite: score.quality, chimie: score.chemistry, adequation: score.fit, equilibre: score.balance, tactique: score.tactic },
        lineup,
      };
    });

    try {
      let res, data, text;
      if (isWorker) {
        // Mode worker : on POST direct sur l'URL
        const url = aiConfig.replace(/\/+$/, '') + '/ai/analyze';
        res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ teams, context: {} }),
        });
        if (res.ok) {
          data = await res.json();
          text = data.text || '';
        }
      } else {
        // Mode clé directe (insecure, mais le user a accepté)
        const prompt = buildPromptFromTeams(teams);
        res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': aiConfig,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 2400,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        if (res.ok) {
          data = await res.json();
          text = (data.content || []).map(c => c.text || '').join('\n');
        }
      }
      enrichBox.remove();
      if (!res.ok) {
        const errEl = el('p', { class: 'muted ai-error' });
        errEl.textContent = 'Enrichissement IA indisponible (HTTP ' + res.status + ').';
        area.appendChild(errEl);
        status.textContent = 'heuristique seul';
        return;
      }
      const div = el('div', { class: 'ai-output ai-llm' });
      div.innerHTML = '<h3 class="ai-h">🤖 Analyse approfondie</h3>' + renderMarkdown(text);
      area.appendChild(div);
      status.textContent = isWorker ? '✓ enrichi via worker' : '✓ enrichi par Claude';
      return;
    } catch (e) {
      enrichBox.remove();
      const errEl = el('p', { class: 'muted ai-error' });
      errEl.textContent = 'Réseau IA inaccessible : ' + e.message;
      area.appendChild(errEl);
      status.textContent = 'heuristique seul';
      return;
    }

  }

  function buildPromptFromTeams(teams) {
    let p = 'Tu es un analyste tactique de football professionnel. Voici ' + teams.length + ' équipes draftées qui vont s\'affronter.\n\n';
    teams.forEach((t, i) => {
      p += '## Équipe ' + (i+1) + ' — ' + t.drafter + '\n';
      p += 'Formation : ' + t.formation + '\n';
      p += 'Tactique : possession=' + (t.phases.possession||'?') + ', transition=' + (t.phases.transition||'?') + ', défense=' + (t.phases.defense||'?') + '\n';
      p += 'Compo :\n';
      t.lineup.forEach(l => { p += '- ' + l.slot + ' : ' + l.player + ' — rôle ' + l.role + '\n'; });
      p += '\n';
    });
    p += '\nPour chaque équipe :\n1) Identité tactique en 1 phrase\n2) 2-3 forces réelles (joueurs clés et rôles qui se complètent)\n3) 2-3 failles concrètes que l\'adversaire peut exploiter\n4) Un joueur dont le rôle assigné ne lui convient PAS, et pourquoi.\n\nPuis : pour chaque MATCHUP, 3 phrases sur le déroulé probable du match. Format markdown ## Équipe X.';
    return p;
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
          el('div', { class: 'meta' }, `${FORMATIONS[p.formation].label} · ${score.filled}/11 · ${score.totalValue.toFixed(0)} M€`)),
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

      // Score bars
      const bars = el('div', { class: 'score-bars' });
      [['QUALITÉ', score.quality], ['CHIMIE', score.chemistry], ['ADÉQUATION', score.fit], ['ÉQUILIBRE', score.balance], ['COHÉRENCE TACTIQUE', score.tactic]].forEach(([lbl, v]) => {
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
    if (!m.played) {
      const btn = el('button', { class: 'btn btn-ghost' }, 'Simuler ce match');
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

    const result = window.Sim.simulateMatch(tpA, tpB, tacA, tacB, { five: state.matchMode === 'five' });
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
    $('#simMinute').textContent = "0'"; $('#simEvent').textContent = "Coup d'envoi";
    $('#simEvents').innerHTML = '';

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
        const ring = svg('circle', { class:'sim-pawn', cx:adjBase.x, cy:adjBase.y, r:13, fill:kit, stroke:'rgba(0,0,0,0.55)', 'stroke-width':1.5 });
        const num = svg('text', { x:adjBase.x, y:adjBase.y+4.5, 'text-anchor':'middle', 'font-family':'Bebas Neue, sans-serif',
          'font-size':14, fill: kit === '#eef2f6' ? '#10131a' : '#fff', style:'pointer-events:none' });
        num.textContent = nums[slot.id];
        const nm = svg('text', { x:adjBase.x, y:adjBase.y+26, 'text-anchor':'middle', 'font-family':'JetBrains Mono, monospace',
          'font-size':9, fill:'#fff', style:'pointer-events:none; text-shadow:0 1px 2px rgba(0,0,0,0.9)' });
        nm.textContent = pl ? pl.name.split(' ').slice(-1)[0].slice(0,11).toUpperCase() : slot.type;
        g.appendChild(ring); g.appendChild(num); g.appendChild(nm);
        pitch.appendChild(g);
        const obj = { side, base: adjBase, x: adjBase.x, y: adjBase.y, ring, num, nm, g, pid };
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
    function moveBallTo(x, y) { ball.setAttribute('cx', x); ball.setAttribute('cy', y); }
    function ballToPawn(pid) { const p = pawnById[pid]; if (p) moveBallTo(p.x, p.y); }

    // ---- Construire la séquence d'animation (hops) à partir des moments ----
    const HOP = 560 / simAnim.speed;       // durée par passe
    const PAUSE = 360 / simAnim.speed;
    let cum = 0;
    let liveScore = { a:0, b:0 };

    function schedule(fn, dur) { const t = setTimeout(() => { if(!simAnim.skipping) fn(); }, cum); simAnim.timeouts.push(t); cum += dur; }

    r.moments.forEach(mo => {
      if (mo.type === 'kickoff') {
        schedule(() => { $('#simEvent').textContent = "Coup d'envoi"; resetShape(); moveBallTo(SIMW/2, SIMH/2); }, HOP);
        return;
      }
      if (mo.type === 'half') {
        schedule(() => { $('#simEvent').textContent = '⏸ Mi-temps'; pushLog(mo); resetShape(); moveBallTo(SIMW/2, SIMH/2); }, HOP*2.2);
        return;
      }
      if (mo.type === 'end') {
        schedule(() => { $('#simEvent').textContent = '🏁 Terminé'; pushLog(mo); renderTournament(); }, HOP);
        return;
      }
      if (mo.type === 'foul' || mo.type === 'card' || mo.type === 'corner' || mo.type === 'freekick') {
        schedule(() => {
          $('#simEvent').textContent = (mo.type==='card'?(mo.card==='red'?'🟥 ':'🟨 '):mo.type==='corner'?'⛳ ':'⚑ ') + mo.text;
          pushLog(mo);
        }, HOP*1.4);
        return;
      }

      const side = mo.team; // 'A'|'B'
      const attackDepth = mo.type === 'goal' ? 0.95 : mo.type === 'save' || mo.type === 'miss' ? 0.82 : 0.62;
      // pousser le bloc attaquant, reculer le bloc défenseur
      schedule(() => {
        $('#simEvent').textContent = mo.text;
        shiftTeam(side, attackDepth);
        shiftTeam(side === 'A' ? 'B' : 'A', 1 - attackDepth*0.85);
      }, 0);

      // hops sur la trajectoire (passes réelles entre joueurs)
      const path = (mo.path || []).filter(p => p && p.id && pawnById[p.id]);
      path.forEach((pt, idx) => {
        schedule(() => {
          ballToPawn(pt.id);
          // trace de passe
          drawPassTrace(pawnById, path, idx, side, kits);
        }, HOP);
      });

      if (mo.type === 'goal') {
        schedule(() => {
          // ballon dans le but
          const gx = side === 'A' ? SIMW-10 : 10;
          moveBallTo(gx, SIMH/2 + (Math.random()*70-35));
          liveScore[side==='A'?'a':'b']++;
          $('#simScoreA').textContent = liveScore.a;
          $('#simScoreB').textContent = liveScore.b;
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
    const host = $('#simEvent');
    if (host) host.textContent = rep.winner ? ('Victoire ' + rep.winner) : 'Match nul';
    // afficher un encart rapport dans la zone events
    const log = $('#simEvents');
    const card = el('div', { class:'sim-report' });
    card.appendChild(el('div', { class:'sr-title' }, '📋 Analyse du match'));
    rep.lines.forEach(l => {
      const p = el('div', { class:'sr-line' });
      p.innerHTML = l.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      card.appendChild(p);
    });
    // stats
    const st = el('div', { class:'sr-stats' });
    st.innerHTML =
      `<div><span>${r.stats.A.possession}%</span><label>Possession</label><span>${r.stats.B.possession}%</span></div>` +
      `<div><span>${r.stats.A.shots}</span><label>Tirs</label><span>${r.stats.B.shots}</span></div>` +
      `<div><span>${r.stats.A.onTarget}</span><label>Cadrés</label><span>${r.stats.B.onTarget}</span></div>` +
      `<div><span>${r.stats.A.xg}</span><label>xG</label><span>${r.stats.B.xg}</span></div>` +
      `<div><span>${r.stats.A.corners}</span><label>Corners</label><span>${r.stats.B.corners}</span></div>`;
    card.appendChild(st);
    log.appendChild(card);
    log.scrollTop = log.scrollHeight;
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
    return Math.min(110000, hops * (560 / simAnim.speed) + 4000);
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
    mount.appendChild(el('div', { class: 'pitch-circle' }));
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
    const cand = PLAYERS.filter(p => state.leagues.has(p.league) && p.positions.some(pp => accepted.includes(pp)));
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
    let list = PLAYERS.filter(p => state.leagues.has(p.league) && p.positions.some(pp => accepted.includes(pp)));
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
    $('#justeBack').onclick = () => showScreen('setup');
    $$('.juste-variant').forEach(b => b.onclick = () => {
      const v = b.dataset.variant;
      if (v === 'updown') startUpDownGame();
      else if (v === 'multi') showMultiSetup();
    });
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
    $('#justeLives').textContent = '❤'.repeat(s.lives) + '🖤'.repeat(3 - s.lives);
    $('#justeScore').textContent = String(s.score);
    $('#justeFeedback').textContent = '';
    $('#justeFeedback').className = 'juste-feedback';
  }
  function fillJusteCard(sel, player, hidden) {
    const card = $(sel);
    const photoBox = card.querySelector('.jp-photo');
    photoBox.innerHTML = '';
    const url = window.photoUrl && window.photoUrl(player);
    if (url) {
      const img = new Image();
      img.src = url; img.loading = 'lazy';
      img.onerror = () => { img.remove(); photoBox.textContent = initials(player); };
      photoBox.appendChild(img);
    } else { photoBox.textContent = initials(player); }
    card.querySelector('.jp-name').textContent = player.name;
    card.querySelector('.jp-club').textContent = player.club + ' · ' + (player.league || '');
    if (hidden) {
      card.querySelector('.jp-value-hidden').textContent = '?';
    } else {
      card.querySelector('.jp-value-known').textContent = player.value + ' M€';
    }
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
    const url = window.photoUrl && window.photoUrl(s.target);
    if (url) { const im = new Image(); im.src = url; im.loading = 'lazy'; ph.appendChild(im); }
    else { ph.textContent = initials(s.target); }
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
    const winnerName = s.participants[res.winnerIdx].name;
    let html = '<strong>Vraie valeur : ' + res.target + ' M€</strong><br>Gagnant de la manche : ' + winnerName + '.<br>';
    s.participants.forEach((p, i) => {
      const g = res.history.guesses[i];
      const diff = Math.abs(g - res.target);
      html += '<br>' + p.name + ' : ' + g + ' M€ (Δ ' + diff + ')';
    });
    rev.innerHTML = html;
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
    pitch.appendChild(el('div', { class: 'pitch-circle' }));
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
      });
      pitch.appendChild(slotEl);
    });

    renderRolePanel(i);
    renderWarningsSummary(i);
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
    const opts = el('div', { class: 'role-options' });
    const roles = window.Tactics.rolesForSlot(slot.type);
    const slotPlayer = ts.players[sid];
    roles.forEach(r => {
      const isActive = slotPlayer.role === r.key;
      const div = el('div', { class: 'role-option' + (isActive ? ' active' : '') });
      div.appendChild(el('div', { class: 'role-name' }, r.label));
      div.appendChild(el('div', { class: 'role-summary' }, r.summary));
      const w = window.Tactics.incompatibility(pl, r.key);
      if (w) div.appendChild(el('div', { class: 'role-warn' }, '⚠ ' + w[0]));
      div.addEventListener('click', () => {
        slotPlayer.role = r.key;
        slotPlayer.sliders = Object.assign({}, r.preset);
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

  function init() {
    const note = $('#datasetNote');
    if (note) note.textContent = `${PLAYERS.length} joueurs · données Transfermarkt saison 2025-26 · valeurs marchandes en temps réel`;

    buildHero();
    bindSetup();
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
