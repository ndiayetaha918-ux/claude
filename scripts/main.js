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

  // ---------- État global ----------
  const state = {
    nbPlayers: 4,
    budget: 500,
    timerSec: 45,
    gamble: true,
    leagues: new Set(),  // Championnats activés
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
          }, initials(p.name));
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
        state[key] = val;
        if (id === '#segPlayers') renderParticipants();
      });
    }
    bindSeg('#segPlayers', 'nbPlayers', 'number');
    bindSeg('#segTimer',   'timerSec',  'number');
    bindSeg('#segGamble',  'gamble',    'bool');

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
    initFiltersUI();
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
    renderAllPitches();
    renderPlayers();
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

    renderPitch(cur, $('#myPitch'));
  }

  const playerById = (() => {
    const map = new Map();
    PLAYERS.forEach(p => map.set(p.id, p));
    return (id) => map.get(id);
  })();

  function renderPitch(participant, mountEl) {
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
      });
      const bubble = el('div', { class: 'slot-bubble' });
      if (filledP) {
        bubble.appendChild(el('div', {
          class: 'slot-photo',
          style: `background:${gradientFor(filledP)}`,
        }, initials(filledP.name)));
      } else {
        bubble.appendChild(el('span', {}, slot.type));
      }
      slotEl.appendChild(bubble);
      slotEl.appendChild(el('div', { class: 'slot-name' },
        filledP ? filledP.name.split(' ').slice(-1)[0] : slot.type));
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
  // PLAYER GRID & FILTERS
  // ============================================================
  let activeFilters = {
    search: '',
    age: 'all',
    league: '',
    club: '',
    pos: '',
    onlyEligible: true,
    onlyAffordable: false,
  };
  let renderToken = 0;

  function initFiltersUI() {
    // Champ "championnat" du draft : restreint à ceux activés au setup
    const allowedLeagues = Array.from(state.leagues).sort();
    const leagueSel = $('#leagueSelect');
    leagueSel.innerHTML = '<option value="">Tous</option>' +
      allowedLeagues.map(l => `<option>${l}</option>`).join('');

    // Clubs
    const allowedPlayers = PLAYERS.filter(p => state.leagues.has(p.league));
    const clubsSet = new Set();
    allowedPlayers.forEach(p => {
      clubsSet.add(p.club);
      (p.former || []).forEach(c => clubsSet.add(c));
    });
    const clubs = Array.from(clubsSet).sort();
    const clubSel = $('#clubSelect');
    clubSel.innerHTML = '<option value="">Tous</option>' +
      clubs.map(c => `<option>${c}</option>`).join('');

    // bind events (idempotent — replace)
    $('#searchInput').oninput = (e) => { activeFilters.search = e.target.value.toLowerCase(); renderPlayers(); };
    leagueSel.onchange = (e) => { activeFilters.league = e.target.value; renderPlayers(); };
    clubSel.onchange   = (e) => { activeFilters.club   = e.target.value; renderPlayers(); };
    $('#posSelect').onchange = (e) => { activeFilters.pos = e.target.value; renderPlayers(); };
    $('#onlyEligible').onchange = (e) => { activeFilters.onlyEligible = e.target.checked; renderPlayers(); };
    $('#onlyAffordable').onchange = (e) => { activeFilters.onlyAffordable = e.target.checked; renderPlayers(); };

    $('#ageChips').onclick = (e) => {
      const btn = e.target.closest('.chip'); if (!btn) return;
      $$('#ageChips .chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      activeFilters.age = btn.dataset.age;
      renderPlayers();
    };

    $('#resetFilters').onclick = () => {
      activeFilters = { search: '', age: 'all', league: '', club: '', pos: '', onlyEligible: true, onlyAffordable: false };
      $('#searchInput').value = '';
      leagueSel.value = ''; clubSel.value = ''; $('#posSelect').value = '';
      $('#onlyEligible').checked = true; $('#onlyAffordable').checked = false;
      $$('#ageChips .chip').forEach(c => c.classList.remove('active'));
      $$('#ageChips .chip')[0].classList.add('active');
      renderPlayers();
    };
  }

  function openSlotsForParticipant(p) {
    return FORMATIONS[p.formation].slots.filter(s => !p.slots[s.id]);
  }

  function eligibleSlotsFor(player, participant) {
    return openSlotsForParticipant(participant).filter(slot =>
      SLOT_RULES[slot.type].some(pos => player.positions.includes(pos))
    );
  }

  function applyFilters() {
    const cur = state.currentParticipant;
    return PLAYERS.filter(p => {
      if (!state.leagues.has(p.league)) return false;
      if (state.takenIds.has(p.id)) return false;
      if (activeFilters.search && !p.name.toLowerCase().includes(activeFilters.search)) return false;
      if (activeFilters.age === 'u21' && p.age >= 21) return false;
      if (activeFilters.age === 'u25' && p.age >= 25) return false;
      if (activeFilters.age === 'o30' && p.age < 30) return false;
      if (activeFilters.league && p.league !== activeFilters.league) return false;
      if (activeFilters.club) {
        const inClub = p.club === activeFilters.club || (p.former || []).includes(activeFilters.club);
        if (!inClub) return false;
      }
      if (activeFilters.pos && !p.positions.includes(activeFilters.pos)) return false;
      if (activeFilters.onlyEligible && cur && eligibleSlotsFor(p, cur).length === 0) return false;
      if (activeFilters.onlyAffordable && cur && p.value > state.budget - cur.spent) return false;
      return true;
    });
  }

  function renderPlayers() {
    const cur = state.currentParticipant;
    const list = applyFilters();
    list.sort((a, b) => b.value - a.value);
    const MAX = 300;
    const visible = list.slice(0, MAX);

    const grid = $('#playersGrid');
    grid.innerHTML = '';
    const more = list.length > MAX ? ` (TOP ${MAX} AFFICHÉ — AFFINE LES FILTRES)` : '';
    $('#playersStats').textContent = `${list.length} JOUEUR(S) DISPONIBLE(S)${more}`;

    // Affichage incrémental
    const PAGE = 60;
    const myToken = ++renderToken;
    let i = 0;
    function chunk() {
      if (myToken !== renderToken) return;
      const frag = document.createDocumentFragment();
      const end = Math.min(i + PAGE, visible.length);
      for (; i < end; i++) frag.appendChild(buildPlayerCard(visible[i], cur));
      grid.appendChild(frag);
      if (i < visible.length) requestAnimationFrame(chunk);
    }
    chunk();

    if (list.length === 0) {
      grid.appendChild(el('div', { class: 'muted', style: 'padding:20px' }, 'Aucun joueur ne correspond aux filtres.'));
    }
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

    // Photo area (gradient + initiales, pas de photo réelle pour le bulk dataset)
    const photo = el('div', {
      class: 'pc-photo',
      style: `background:${gradientFor(p)}`,
    }, initials(p.name));

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
    const cur = state.currentParticipant;
    const eligible = eligibleSlotsFor(player, cur);

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
    const cur = state.currentParticipant;
    cur.slots[slot.id] = player.id;
    cur.spent += player.value;
    state.takenIds.add(player.id);
    state.pendingPick = null;
    closeModal('#modalConfirm');
    pauseTimer();
    advanceTurn();
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
      const card = el('div', { class: 'final-card' });
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
  // INIT
  // ============================================================
  function init() {
    // Mettre à jour la note dataset avec le nombre exact
    const note = $('#datasetNote');
    if (note) note.textContent = `Base agrégée ${PLAYERS.length} joueurs · données Transfermarkt 2018-2023 vieillies à mai 2026 · valeurs estimées`;

    buildHero();
    bindSetup();
    renderParticipants();
    bindModals();
    $('#startGame').addEventListener('click', startGame);
    $('#restartBtn').addEventListener('click', restart);
    $('#logoHome').addEventListener('click', (e) => { e.preventDefault(); restart(); });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
