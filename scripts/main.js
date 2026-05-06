/* ==========================================================================
   Drafter — moteur de jeu
   ========================================================================== */
(function () {
  'use strict';

  const PLAYERS = window.PLAYERS;
  const SLOT_RULES = window.SLOT_RULES;
  const FORMATIONS = window.FORMATIONS;

  // ---------- Palette d'avatars ----------
  const TEAM_GRADIENTS = [
    'linear-gradient(135deg, #ff6b5b, #ffb56b)',
    'linear-gradient(135deg, #6bd8a4, #2fa977)',
    'linear-gradient(135deg, #a98cff, #6c5ce7)',
    'linear-gradient(135deg, #ffcf5e, #ff8a6b)',
  ];
  const POS_GRADIENTS = {
    GK: 'linear-gradient(135deg,#ffd86b,#ff9f4d)',
    CB: 'linear-gradient(135deg,#7be0b9,#1f7a52)',
    LB: 'linear-gradient(135deg,#7be0b9,#2fa977)',
    RB: 'linear-gradient(135deg,#7be0b9,#2fa977)',
    DM: 'linear-gradient(135deg,#a98cff,#6c5ce7)',
    CM: 'linear-gradient(135deg,#a98cff,#7a5da2)',
    AM: 'linear-gradient(135deg,#d8c8ff,#a98cff)',
    LM: 'linear-gradient(135deg,#ffb098,#ff6b5b)',
    RM: 'linear-gradient(135deg,#ffb098,#ff6b5b)',
    LW: 'linear-gradient(135deg,#ff8a6b,#ff6b5b)',
    RW: 'linear-gradient(135deg,#ff8a6b,#ff6b5b)',
    SS: 'linear-gradient(135deg,#ffcf5e,#ff6b5b)',
    CF: 'linear-gradient(135deg,#ffcf5e,#e85a4b)',
    ST: 'linear-gradient(135deg,#ffcf5e,#e85a4b)',
  };

  const initials = (name) =>
    name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');

  const avatarGradient = (player) => {
    const primary = player.positions[0];
    return POS_GRADIENTS[primary] || POS_GRADIENTS.CM;
  };

  // ---------- État global ----------
  const state = {
    nbPlayers: 4,
    budget: 750,
    timerSec: 45,
    gamble: true,
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
  // SETUP
  // ============================================================
  function bindSegments() {
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
    bindSeg('#segBudget',  'budget',    'number');
    bindSeg('#segTimer',   'timerSec',  'number');
    bindSeg('#segGamble',  'gamble',    'bool');
  }

  function renderParticipants() {
    const list = $('#participantsList');
    list.innerHTML = '';
    const defaults = ['Alex', 'Jordan', 'Sam', 'Charlie'];
    for (let i = 0; i < state.nbPlayers; i++) {
      const grad = TEAM_GRADIENTS[i];
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
        gradient: TEAM_GRADIENTS[i],
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
    $('#turnRound').textContent = `Round ${state.round} / 11`;
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
      olist.appendChild(el('span', { class: 'order-pill skipped', title: 'Doit piocher plus tard' }, p.name + ' (à rattraper)'));
    });
  }

  function renderMyTeam() {
    const cur = state.currentParticipant;
    if (!cur) return;
    $('#myTeamTitle').textContent = `Équipe de ${cur.name}`;
    const remaining = state.budget - cur.spent;
    $('#budgetRem').textContent = remaining.toFixed(0);
    $('#budgetTot').textContent = state.budget;
    const pct = Math.max(0, (remaining / state.budget) * 100);
    $('#budgetBar').style.width = pct + '%';
    const filled = Object.values(cur.slots).filter(Boolean).length;
    $('#picksLeft').textContent = 11 - filled;

    renderPitch(cur, $('#myPitch'));
  }

  function renderPitch(participant, mountEl) {
    const F = FORMATIONS[participant.formation];
    mountEl.innerHTML = '';
    mountEl.appendChild(el('div', { class: 'pitch-circle' }));
    F.slots.forEach(slot => {
      const filledId = participant.slots[slot.id];
      const filledP = filledId ? PLAYERS.find(p => p.id === filledId) : null;
      const slotEl = el('div', {
        class: 'slot' + (filledP ? ' filled' : ''),
        style: `left:${slot.x}%; top:${slot.y}%`,
        title: filledP ? `${filledP.name} (${filledP.positions.join('/')})` : slot.type,
      });
      const bubble = el('div', { class: 'slot-bubble' });
      if (filledP) {
        bubble.appendChild(el('div', {
          class: 'slot-photo',
          style: `background:${avatarGradient(filledP)}`,
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

  function initFiltersUI() {
    const leagues = Array.from(new Set(PLAYERS.map(p => p.league))).sort();
    const leagueSel = $('#leagueSelect');
    leagueSel.innerHTML = '<option value="">Tous championnats</option>' +
      leagues.map(l => `<option>${l}</option>`).join('');

    const clubsSet = new Set();
    PLAYERS.forEach(p => {
      clubsSet.add(p.club);
      (p.former || []).forEach(c => clubsSet.add(c));
    });
    const clubs = Array.from(clubsSet).sort();
    const clubSel = $('#clubSelect');
    clubSel.innerHTML = '<option value="">Tous clubs</option>' +
      clubs.map(c => `<option>${c}</option>`).join('');

    $('#searchInput').addEventListener('input', (e) => { activeFilters.search = e.target.value.toLowerCase(); renderPlayers(); });
    leagueSel.addEventListener('change', (e) => { activeFilters.league = e.target.value; renderPlayers(); });
    clubSel.addEventListener('change',   (e) => { activeFilters.club   = e.target.value; renderPlayers(); });
    $('#posSelect').addEventListener('change', (e) => { activeFilters.pos = e.target.value; renderPlayers(); });
    $('#onlyEligible').addEventListener('change', (e) => { activeFilters.onlyEligible = e.target.checked; renderPlayers(); });
    $('#onlyAffordable').addEventListener('change', (e) => { activeFilters.onlyAffordable = e.target.checked; renderPlayers(); });

    $('#ageChips').addEventListener('click', (e) => {
      const btn = e.target.closest('.chip'); if (!btn) return;
      $$('#ageChips .chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      activeFilters.age = btn.dataset.age;
      renderPlayers();
    });

    $('#resetFilters').addEventListener('click', () => {
      activeFilters = { search: '', age: 'all', league: '', club: '', pos: '', onlyEligible: true, onlyAffordable: false };
      $('#searchInput').value = '';
      leagueSel.value = ''; clubSel.value = ''; $('#posSelect').value = '';
      $('#onlyEligible').checked = true; $('#onlyAffordable').checked = false;
      $$('#ageChips .chip').forEach(c => c.classList.remove('active'));
      $$('#ageChips .chip')[0].classList.add('active');
      renderPlayers();
    });
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
    const grid = $('#playersGrid');
    grid.innerHTML = '';
    $('#playersStats').textContent = `${list.length} joueur(s) disponible(s)`;

    list.slice(0, 80).forEach(p => {
      const eligible = !cur || eligibleSlotsFor(p, cur).length > 0;
      const affordable = !cur || p.value <= state.budget - cur.spent;
      const blocked = !eligible || !affordable;
      const card = el('div', {
        class: 'player-card' + (blocked ? ' ineligible' : ''),
        title: !eligible ? 'Aucun poste libre pour ce joueur' : (!affordable ? 'Hors budget' : 'Cliquer pour drafter'),
      });
      card.addEventListener('click', () => openConfirmPick(p));

      const top = el('div', { class: 'pc-top' });
      top.appendChild(el('div', { class: 'avatar', style: `background:${avatarGradient(p)}` }, initials(p.name)));
      const info = el('div', {});
      info.appendChild(el('div', { class: 'pc-name' }, p.name));
      info.appendChild(el('div', { class: 'pc-club' }, p.club));
      top.appendChild(info);
      card.appendChild(top);

      const meta = el('div', { class: 'pc-meta' });
      p.positions.forEach(pos => {
        const matches = cur && eligibleSlotsFor(p, cur).some(s => SLOT_RULES[s.type].includes(pos));
        meta.appendChild(el('span', { class: 'pos-tag' + (matches ? ' match' : '') }, pos));
      });
      card.appendChild(meta);

      const foot = el('div', { class: 'pc-foot' });
      foot.appendChild(el('span', { class: 'pc-age' }, p.age + ' ans · ' + p.league));
      foot.appendChild(el('span', { class: 'pc-value' }, p.value + ' M€'));
      card.appendChild(foot);

      grid.appendChild(card);
    });

    if (list.length === 0) {
      grid.appendChild(el('div', { class: 'muted', style: 'padding:20px' }, 'Aucun joueur ne correspond aux filtres.'));
    }
  }

  // ============================================================
  // CONFIRM PICK
  // ============================================================
  function openConfirmPick(player) {
    const cur = state.currentParticipant;
    const eligible = eligibleSlotsFor(player, cur);

    if (eligible.length === 0) {
      return toast('Mauvais poste', `${player.name} (${player.positions.join('/')}) ne correspond à aucun slot libre dans ta formation.`);
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
          el('span', {}, 'Slot ' + slot.id.toUpperCase()));
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
      el('div', { class: 'avatar', style: `background:${avatarGradient(player)}` }, initials(player.name)),
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
      // Tous les picks normaux sont faits. On rattrape les joueurs skip d'abord.
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
      // Puis on propose le gamble au dernier picker (s'il reste activé)
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
      toast('Temps écoulé', `${state.currentParticipant.name} pioche plus tard. Tour suivant !`);
    } else {
      toast('Temps écoulé', `${state.currentParticipant.name} a manqué son rattrapage. On continue !`);
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
          msg = `<span class="gamble-win">Pile ! Tu voles <strong>${stealable.player.name}</strong> à ${opp.name}.</span>`;
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
          msg = `<span class="gamble-lose">Face. ${opp.name} te vole <strong>${stealable.player.name}</strong>.</span>`;
        }
      }
      result.innerHTML = msg + '<div style="margin-top:18px"><button class="btn btn-primary" id="endGamble">Voir les équipes</button></div>';
      $('#endGamble').addEventListener('click', finishGameAfterGamble);
      renderAll();
    }, 700);
  }

  function pickStealableFrom(donor, receiver) {
    const candidates = Object.values(donor.slots).filter(Boolean).map(id => PLAYERS.find(p => p.id === id));
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
        el('div', { class: 'avatar', style: `background:${p.gradient}` }, initials(p.name)),
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
    bindSegments();
    renderParticipants();
    bindModals();
    $('#startGame').addEventListener('click', startGame);
    $('#restartBtn').addEventListener('click', restart);
    $('#logoHome').addEventListener('click', (e) => { e.preventDefault(); restart(); });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
