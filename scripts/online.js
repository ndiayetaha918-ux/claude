/* ==========================================================================
   Drafter — Online via polling HTTP (jsonblob.com, sans backend custom)
   Avantage : marche partout (HTTPS public), pas de NAT/TURN, cross-device fiable
   Tradeoff : latence 1,5s entre les actions, pas du temps réel
   ========================================================================== */
(function () {
  'use strict';

  const BASE = 'https://jsonblob.com/api/jsonBlob';
  const POLL_MS = 1500;
  const HEARTBEAT_MS = 5000;

  const Online = window.Online = {
    role: null,            // 'host' | 'guest' | null
    blobId: null,
    myId: null,
    me: null,
    state: null,
    pollHandle: null,
    heartbeatHandle: null,
    lastSeenV: 0,
    listeners: { state: [], message: [], error: [] },
    processingAction: false,

    on(evt, fn) { (this.listeners[evt] || []).push(fn); return this; },
    off(evt) {
      if (evt) this.listeners[evt] = [];
      else ['state','message','error'].forEach(k => this.listeners[k] = []);
      return this;
    },
    emit(evt, ...args) { (this.listeners[evt] || []).forEach(fn => { try { fn(...args); } catch (e) { console.error(e); } }); },

    // ============================================================
    // CREATE (host)
    // ============================================================
    async createRoom(_roomName, me) {
      this.role = 'host';
      this.me = me;
      this.myId = newClientId();
      const state = {
        v: 1,
        host: this.myId,
        hostHeartbeat: Date.now(),
        phase: 'lobby',
        participants: [{ id: this.myId, name: me.name, formation: me.formation, isHost: true }],
        settings: null,
        order: [], round: 1, pickIndex: 1, currentParticipant: null,
        takenIds: [], skipped: [], gambleUsed: false,
        slots: { [this.myId]: blankSlots(me.formation) },
        spent: { [this.myId]: 0 },
        actions: [],
      };

      // POST → crée le blob, récupère l'ID via Location header
      let res;
      try {
        res = await fetch(BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(state),
        });
      } catch (e) {
        throw new Error('Impossible de joindre le serveur. Vérifie ta connexion internet.');
      }
      if (!res.ok) throw new Error('Création échouée (HTTP ' + res.status + ')');
      const loc = res.headers.get('Location') || '';
      const m = loc.match(/\/([^\/]+)\/?$/);
      if (!m) throw new Error('Réponse serveur invalide (pas d\'ID).');
      this.blobId = m[1];
      this.state = state;
      this.lastSeenV = state.v;

      this.startPolling();
      this.startHeartbeat();
      return { id: this.myId, roomCode: this.blobId };
    },

    // ============================================================
    // JOIN (guest)
    // ============================================================
    async joinRoom(roomCode, me) {
      this.role = 'guest';
      this.me = me;
      this.myId = newClientId();
      this.blobId = (roomCode || '').trim();
      if (!this.blobId) throw new Error('Code de salon vide.');

      // Lecture initiale
      let res;
      try {
        res = await fetch(BASE + '/' + this.blobId, { headers: { 'Accept': 'application/json' } });
      } catch (e) {
        throw new Error('Impossible de joindre le serveur. Vérifie ta connexion internet.');
      }
      if (res.status === 404) throw new Error('Salon introuvable. Vérifie le code.');
      if (!res.ok) throw new Error('Erreur ' + res.status);
      let state;
      try { state = await res.json(); } catch (e) { throw new Error('Format de salon invalide.'); }
      if (!state || !state.participants) throw new Error('Salon corrompu.');
      if (state.phase !== 'lobby') throw new Error('La draft est déjà en cours. Rejoins-en une autre.');

      // Vérifier que l'hôte est encore vivant
      const hbAge = Date.now() - (state.hostHeartbeat || 0);
      if (hbAge > 30000) throw new Error('L\'hôte de ce salon ne répond plus.');

      // Ajouter soi
      state.v = (state.v || 0) + 1;
      if (!state.participants.find(p => p.id === this.myId)) {
        state.participants.push({ id: this.myId, name: me.name, formation: me.formation, isHost: false });
        state.slots[this.myId] = blankSlots(me.formation);
        state.spent[this.myId] = 0;
      }
      await this.writeState(state);
      this.state = state;
      this.lastSeenV = state.v;

      this.startPolling();
      return { id: this.myId, roomCode: this.blobId };
    },

    // ============================================================
    // POLLING
    // ============================================================
    startPolling() {
      this.stopPolling();
      this.pollHandle = setInterval(() => this.pollOnce(), POLL_MS);
      // Dispatch initial
      this.emit('state', this.state);
    },
    stopPolling() {
      if (this.pollHandle) clearInterval(this.pollHandle);
      this.pollHandle = null;
    },

    async pollOnce() {
      if (this.processingAction) return; // skip si on est en train d'écrire
      try {
        const res = await fetch(BASE + '/' + this.blobId, {
          headers: { 'Accept': 'application/json' },
          cache: 'no-store',
        });
        if (!res.ok) return;
        const state = await res.json();
        if (!state || typeof state.v !== 'number') return;

        // Si on est l'hôte et qu'il y a des actions guest en attente, les traiter
        if (this.role === 'host' && state.actions && state.actions.length > 0) {
          await this.processGuestActions(state);
          return; // processGuestActions a déjà mis à jour et émis
        }

        // Sinon, mise à jour locale si nouvelle version
        if (state.v > this.lastSeenV) {
          this.state = state;
          this.lastSeenV = state.v;
          this.emit('state', this.state);
        }
      } catch (e) {
        // Erreur réseau transitoire, ignorer
      }
    },

    // ============================================================
    // HOST : traiter les actions des guests
    // ============================================================
    async processGuestActions(remoteState) {
      this.processingAction = true;
      try {
        // Merger les actions remote dans notre état canonique
        const actions = remoteState.actions.slice();
        // Adopter aussi participants si nouveaux (lobby join)
        if (remoteState.phase === 'lobby') {
          remoteState.participants.forEach(p => {
            if (!this.state.participants.find(x => x.id === p.id)) {
              this.state.participants.push(p);
              this.state.slots[p.id] = remoteState.slots[p.id] || blankSlots(p.formation);
              this.state.spent[p.id] = 0;
            }
          });
        }
        // Process each action (delegate to main.js via event)
        actions.forEach(a => this.emit('message', { from: a.from, msg: a }));
        // Clear actions, bump version, write back
        this.state.actions = [];
        this.state.v = Math.max(this.state.v, remoteState.v) + 1;
        this.state.hostHeartbeat = Date.now();
        await this.writeState(this.state);
        this.lastSeenV = this.state.v;
        this.emit('state', this.state);
      } finally {
        this.processingAction = false;
      }
    },

    // ============================================================
    // HEARTBEAT (host signale qu'il est vivant)
    // ============================================================
    startHeartbeat() {
      if (this.heartbeatHandle) clearInterval(this.heartbeatHandle);
      this.heartbeatHandle = setInterval(() => {
        if (this.role !== 'host' || !this.state) return;
        this.state.hostHeartbeat = Date.now();
        this.state.v = (this.state.v || 0) + 1;
        this.writeState(this.state).catch(() => {});
      }, HEARTBEAT_MS);
    },

    // ============================================================
    // WRITE
    // ============================================================
    async writeState(state) {
      const res = await fetch(BASE + '/' + this.blobId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(state),
      });
      if (!res.ok) throw new Error('Sauvegarde échouée (HTTP ' + res.status + ')');
    },

    // ============================================================
    // BROADCAST (host) — appelé par main.js après modif d'état
    // ============================================================
    async broadcastState() {
      if (this.role !== 'host' || !this.state) return;
      this.state.v = (this.state.v || 0) + 1;
      this.state.hostHeartbeat = Date.now();
      try {
        await this.writeState(this.state);
        this.lastSeenV = this.state.v;
        this.emit('state', this.state);
      } catch (e) {
        this.emit('error', e);
      }
    },

    // ============================================================
    // SEND (guest → host) : append action à la queue, version bumped
    // ============================================================
    async sendPick(slotId, playerId) {
      if (this.role !== 'guest') return;
      await this.appendAction({ from: this.myId, type: 'pick', slotId, playerId, ts: Date.now() });
    },
    async sendSkip() {
      if (this.role !== 'guest') return;
      await this.appendAction({ from: this.myId, type: 'skip', ts: Date.now() });
    },
    async appendAction(action) {
      this.processingAction = true;
      try {
        const res = await fetch(BASE + '/' + this.blobId, {
          headers: { 'Accept': 'application/json' },
          cache: 'no-store',
        });
        if (!res.ok) throw new Error('Lecture échouée');
        const state = await res.json();
        state.actions = state.actions || [];
        state.actions.push(action);
        state.v = (state.v || 0) + 1;
        await this.writeState(state);
        this.state = state;
        this.lastSeenV = state.v;
      } catch (e) {
        this.emit('error', e);
      } finally {
        this.processingAction = false;
      }
    },

    teardown() {
      this.stopPolling();
      if (this.heartbeatHandle) clearInterval(this.heartbeatHandle);
      this.heartbeatHandle = null;
      this.state = null;
      this.role = null;
      this.blobId = null;
      this.myId = null;
    },
  };

  function newClientId() {
    return 'u-' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }

  function blankSlots(formation) {
    const F = (window.FORMATIONS || {})[formation];
    if (!F) return {};
    const o = {};
    F.slots.forEach(s => o[s.id] = null);
    return o;
  }
})();
