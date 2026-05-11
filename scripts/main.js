/* ==========================================================================
   Drafter — moteur de jeu
   ========================================================================== */
(function () {
  'use strict';

  const PLAYERS = window.PLAYERS;
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
  const initials = (name) =>
    name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

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
  const state = {
    mode: 'local',       // 'local' | 'online'
    online: { joined: false, isHost: false, myId: null, roomCode: null, shortlist: [] },
    nbPlayers: 4,
    budget: 500,
    timerSec: 45,
    gamble: true,
    leagues: new Set(),  // Championnats activés
    ageRule: 'all',      // 'all' | 'u21' | 'u25' | 'o30'
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
    const stage = $('#heroStage');
    if (!stage) return;
    // Top players (by value), prendre 80 pour 4 rows × 20
    const top = PLAYERS.slice(0, 80);
    const rows = 4;
    const perRow = 20;
    for (let r = 0; r < rows; r++) {
      const row = el('div', {
        class: 'hero-row' + (r % 2 ? ' reverse' : '') + (r === 1 ? ' fast' : '') + (r === 2 ? ' slow' : ''),
      });
      const startIdx = (r * perRow) % top.length;
      // On duplique la liste pour le défilement infini
      for (let dup = 0; dup < 2; dup++) {
        for (let i = 0; i < perRow; i++) {
          const p = top[(startIdx + i) % top.length];
          if (!p) continue;
          const tilt = (((hashStr(p.id) % 9) - 4) / 1.3).toFixed(2) + 'deg';
          const polaroid = el('div', { class: 'polaroid', style: `--tilt:${tilt}` });
          const img = el('div', {
            class: 'polaroid-img',
            style: `background:${gradientFor(p)}`,
          });
          attachPhoto(img, p, 'polaroid-img-photo');
          img.appendChild(el('span', { class: 'polaroid-img-fallback' }, initials(p.name)));
          polaroid.appendChild(img);
          polaroid.appendChild(el('div', { class: 'polaroid-name' }, p.name.toUpperCase()));
          polaroid.appendChild(el('div', { class: 'polaroid-meta' }, p.value + ' M€'));
          row.appendChild(polaroid);
        }
      }
      stage.appendChild(row);
    }
  }

  // ============================================================
  // SETUP
  // ============================================================
  const ALL_LEAGUES = Array.from(new Set(PLAYERS.map(p => p.league))).sort();

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
    bindSeg('#segAge',     'ageRule',   'string');

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

    // League chips multi-select
    const chipsWrap = $('#leagueChips');
    state.leagues = new Set(ALL_LEAGUES); // tous activés par défaut
    // bouton "Tous"
    const allChip = el('button', { class: 'chip', type: 'button' }, 'TOUS');
    allChip.addEventListener('click', () => {
      const allOn = chipsWrap.querySelectorAll('button[data-league]').length === state.leagues.size;
      if (allOn) {
        state.leagues.clear();
        chipsWrap.querySelectorAll('button[data-league]').forEach(b => b.classList.remove('active'));
      } else {
        ALL_LEAGUES.forEach(l => state.leagues.add(l));
        chipsWrap.querySelectorAll('button[data-league]').forEach(b => b.classList.add('active'));
      }
    });
    chipsWrap.appendChild(allChip);
    ALL_LEAGUES.forEach(l => {
      const count = PLAYERS.filter(p => p.league === l).length;
      const chip = el('button', { class: 'chip active', 'data-league': l, type: 'button', title: count + ' joueurs' }, l);
      chip.addEventListener('click', () => {
        if (state.leagues.has(l)) { state.leagues.delete(l); chip.classList.remove('active'); }
        else { state.leagues.add(l); chip.classList.add('active'); }
      });
      chipsWrap.appendChild(chip);
    });
  }

  function renderParticipants() {
    const list = $('#participantsList');
    list.innerHTML = '';
    const defaults = ['Alex', 'Jordan', 'Sam', 'Charlie'];
    for (let i = 0; i < state.nbPlayers; i++) {
      const grad = TEAM_COLORS[i].grad;
      const row = el('div', { class: 'participant' },
        el('div', { class: 'participant-avatar', style: `background:${grad}` }, `J${i+1}`),
        el('input', { type: 'text', value: defaults[i], 'data-pidx': i, placeholder: 'Pseudo' }),
        (() => {
          const sel = el('select', { 'data-pidx': i });
          Object.keys(FORMATIONS).forEach((f, idx) => {
            const opt = el('option', { value: f }, FORMATIONS[f].label);
            if (idx === 0) opt.setAttribute('selected', '');
            sel.appendChild(opt);
          });
          return sel;
        })(),
      );
      list.appendChild(row);
    }
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

  const playerById = (() => {
    const map = new Map();
    PLAYERS.forEach(p => map.set(p.id, p));
    return (id) => map.get(id);
  })();

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
        ph.appendChild(el('span', { class: 'slot-photo-fb' }, initials(filledP.name)));
        bubble.appendChild(ph);
      } else {
        bubble.appendChild(el('span', {}, slot.type));
      }
      slotEl.appendChild(bubble);
      slotEl.appendChild(el('div', { class: 'slot-name' },
        filledP
          ? filledP.name.split(' ').slice(-1)[0].toUpperCase() + ' · ' + filledP.value + 'M'
          : slot.type));
      // Click → ouvrir picker pour ce slot (uniquement si interactif et vide)
      if (opts.interactive && !filledP) {
        bubble.addEventListener('click', () => openPicker(slot));
      }
      mountEl.appendChild(slotEl);
    });
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

  function eligibleSlotsFor(player, participant) {
    return openSlotsForParticipant(participant).filter(slot =>
      SLOT_RULES[slot.type].some(pos => player.positions.includes(pos))
    );
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
    return PLAYERS.filter(p => {
      // ===== Critères de la draft (verrouillés au setup) =====
      if (!state.leagues.has(p.league)) return false;
      if (state.ageRule === 'u21' && p.age >= 21) return false;
      if (state.ageRule === 'u25' && p.age >= 25) return false;
      if (state.ageRule === 'o30' && p.age < 30) return false;
      if (state.takenIds.has(p.id)) return false;
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
    const MAX = 200;
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
    const eligible = !slot || (slot.id !== '_shortlist'
      ? SLOT_RULES[slot.type].some(pos => p.positions.includes(pos))
      : true);
    const me = state.mode === 'online' ? state.participants.find(x => x.isMe) : cur;
    const affordable = !me || p.value <= state.budget - me.spent;
    const blocked = !eligible || !affordable;

    const row = el('div', {
      class: 'player-row glow' + (blocked ? ' ineligible' : ''),
      title: !eligible ? 'Mauvais poste pour ce slot' : (!affordable ? 'Hors budget' : 'Cliquer pour drafter'),
    });
    row.addEventListener('click', () => openConfirmPick(p));

    // Photo
    const photo = el('div', { class: 'pr-photo', style: `background:${gradientFor(p)}` });
    attachPhoto(photo, p, '');
    photo.appendChild(el('span', {}, initials(p.name)));
    row.appendChild(photo);

    // Info
    const info = el('div', { class: 'pr-info' });
    info.appendChild(el('div', { class: 'pr-name' }, p.name));
    const meta = el('div', { class: 'pr-meta' });
    p.positions.forEach(pos => {
      const matches = slot && slot.id !== '_shortlist' && SLOT_RULES[slot.type].includes(pos);
      meta.appendChild(el('span', { class: 'pos' + (matches ? ' match' : '') }, pos));
    });
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
    photo.appendChild(el('span', { class: 'pc-photo-initials' }, initials(p.name)));

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
        SLOT_RULES[s.type].some(pos => player.positions.includes(pos)) &&
        !cur.slots[s.id]
      );
    } else {
      cur = state.currentParticipant;
      // Si le picker a été ouvert pour un slot précis (clic sur le terrain),
      // on assigne DIRECTEMENT à ce slot (pas de re-question)
      if (pickerState.slot && pickerState.slot.id && pickerState.slot.id !== '_shortlist') {
        const slotDef = pickerState.slot;
        eligible = [slotDef].filter(s =>
          SLOT_RULES[s.type].some(pos => player.positions.includes(pos)) &&
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
      el('div', { class: 'conf-photo', style: `background:${gradientFor(player)}` }, initials(player.name)),
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
    photo.appendChild(el('span', {}, initials(player.name)));
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
      const targetSlot = openSlots.find(s => SLOT_RULES[s.type].some(pos => player.positions.includes(pos)));
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
    if (typeof Peer === 'undefined') {
      return toast('PeerJS indisponible', 'Vérifie ta connexion. Le mode online nécessite que peerjs.com soit accessible.');
    }
    const name = ($('#onlineName').value || '').trim().slice(0, 18) || 'Joueur';
    const room = ($('#onlineRoom').value || '').trim();
    const formation = $('#onlineFormation').value || '4-3-3';
    if (!room) return toast('Code manquant', 'Choisis un code de salon (ex : "foot-friday").');
    const me = { name, formation };

    $('#btnCreate').disabled = true;
    $('#btnJoin').disabled = true;
    $('#lobbyState').textContent = role === 'host' ? 'Création du salon...' : 'Connexion à l\'hôte...';

    // Reset listeners pour éviter doublons sur retry
    Online.off();
    const promise = role === 'host' ? Online.createRoom(room, me) : Online.joinRoom(room, me);
    promise.then(({ id, roomCode }) => {
      state.online.joined = true;
      state.online.isHost = (role === 'host');
      state.online.myId = id;
      state.online.roomCode = roomCode;

      $('#lobbyForm').style.display = 'none';
      $('#lobbyRoom').style.display = 'flex';
      $('#lobbyRoomName').textContent = roomCode;
      $('#lobbyHostActions').style.display = role === 'host' ? 'flex' : 'none';
      $('#lobbyGuestMsg').style.display = role === 'guest' ? 'block' : 'none';
      $('#lobbyState').textContent = role === 'host'
        ? 'Salon créé. Partage le code à tes potes.'
        : 'Connecté ! En attente du lancement par l\'hôte.';

      ensureOnlineStatus(true);
      // Si host : ajouter soi-même à participants pour le rendu lobby
      if (role === 'host') {
        renderLobbyPlayers(Online.state.participants);
        updateStartButton();
      }
    }).catch((err) => {
      console.error(err);
      $('#btnCreate').disabled = false;
      $('#btnJoin').disabled = false;
      $('#lobbyState').textContent = 'Erreur : ' + (err && err.message || 'connexion impossible');
      const isTaken = (err && err.type === 'unavailable-id');
      if (isTaken) toast('Salon déjà existant', 'Quelqu\'un héberge déjà ce salon. Choisis un autre code, ou rejoins-le avec "Rejoindre".');
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
      ageRule: state.ageRule,
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
    state.ageRule = st.settings.ageRule;

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
      photo.appendChild(el('span', {}, initials(p.name)));
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
    // Applique .glow aux éléments statiques au boot
    $$('.setup-card, .mode-tab, .lobby-card, .feature').forEach(n => n.classList.add('glow'));

    // Délégation pointermove : trouve la card hovered et set les CSS vars
    let raf = null, lastTarget = null, lastE = null;
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
          lastTarget = target;
        }
      });
    }, { passive: true });
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
    $('#startGame').addEventListener('click', startGame);
    $('#restartBtn').addEventListener('click', restart);
    $('#logoHome').addEventListener('click', (e) => { e.preventDefault(); restart(); });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
