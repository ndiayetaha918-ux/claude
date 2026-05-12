/* ==========================================================================
   Drafter — Mode online (PeerJS, broker public, sans inscription)
   ========================================================================== */
(function () {
  'use strict';

  // ID stable de salon -> PeerID hôte
  function hostPeerId(roomCode) {
    return 'drafter-v1-' + sanitize(roomCode) + '-host';
  }
  function guestPeerId(roomCode) {
    return 'drafter-v1-' + sanitize(roomCode) + '-' + Math.random().toString(36).slice(2, 8);
  }
  function sanitize(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9-]+/g, '-').slice(0, 24) || 'room';
  }

  // Config WebRTC : multiples STUN pour maximiser NAT traversal cross-device
  // (TURN free non disponible publiquement en 2026 — cross-network parfois bloqué
  //  par NAT symétrique des opérateurs mobiles, dans ce cas même réseau Wi-Fi recommandé)
  const PEER_CONFIG = {
    debug: 0,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:global.stun.twilio.com:3478' },
      ],
      iceCandidatePoolSize: 10,
    },
  };

  // ==== API publique ====
  const Online = window.Online = {
    role: null,                  // 'host' | 'guest' | null
    peer: null,                  // PeerJS instance
    conns: new Map(),            // PeerID -> DataConnection (côté host: tous les guests)
    hostConn: null,              // côté guest: la conn vers l'hôte
    roomCode: null,
    me: null,                    // { id, name, formation }
    state: null,                 // état canonique côté host
    listeners: { state: [], message: [], error: [] },

    on(evt, fn) { this.listeners[evt].push(fn); return this; },
    off(evt) { if (evt) this.listeners[evt] = []; else { this.listeners.state=[]; this.listeners.message=[]; this.listeners.error=[]; } return this; },
    emit(evt, ...args) { (this.listeners[evt] || []).forEach(fn => fn(...args)); },

    // Hôte : créer un salon. Retourne une promesse.
    createRoom(roomCode, me) {
      this.role = 'host';
      this.roomCode = sanitize(roomCode);
      this.me = me;
      const desiredId = hostPeerId(this.roomCode);
      return new Promise((resolve, reject) => {
        const peer = new Peer(desiredId, PEER_CONFIG);
        this.peer = peer;
        let opened = false;
        peer.on('open', (id) => {
          opened = true;
          // Initial host state with self
          this.state = {
            phase: 'lobby',
            participants: [{ id, name: me.name, formation: me.formation, isHost: true }],
            settings: null,
            order: [], round: 1, pickIndex: 1, currentParticipant: null,
            takenIds: [], skipped: [], gambleUsed: false,
            slots: { [id]: blankSlots(me.formation) },
            spent: { [id]: 0 },
          };
          resolve({ id, roomCode: this.roomCode });
        });
        peer.on('connection', (conn) => this.onGuestConnected(conn));
        peer.on('error', (err) => {
          if (!opened) reject(err);
          this.emit('error', err);
        });
        peer.on('disconnected', () => peer.reconnect());
      });
    },

    // Invité : rejoindre un salon
    joinRoom(roomCode, me) {
      this.role = 'guest';
      this.roomCode = sanitize(roomCode);
      this.me = me;
      const myId = guestPeerId(this.roomCode);
      const targetId = hostPeerId(this.roomCode);
      return new Promise((resolve, reject) => {
        const peer = new Peer(myId, PEER_CONFIG);
        this.peer = peer;
        let opened = false;
        let connected = false;
        // Timeout global pour la jointure
        const giveUp = setTimeout(() => {
          if (!connected) reject(new Error('Salon introuvable ou hôte injoignable. Vérifie le code.'));
        }, 12000);
        peer.on('open', (id) => {
          opened = true;
          const conn = peer.connect(targetId, { reliable: true, metadata: { name: me.name, formation: me.formation } });
          this.hostConn = conn;
          conn.on('open', () => {
            connected = true;
            clearTimeout(giveUp);
            conn.send({ type: 'hello', name: me.name, formation: me.formation });
            resolve({ id, roomCode: this.roomCode });
          });
          conn.on('data', (msg) => this.onMessageFromHost(msg));
          conn.on('close', () => this.emit('error', new Error('Connexion à l\'hôte perdue')));
          conn.on('error', (err) => {
            // Si la connexion échoue avant ouverture, c'est une erreur fatale
            if (!connected) { clearTimeout(giveUp); reject(err); }
            else this.emit('error', err);
          });
        });
        peer.on('error', (err) => {
          // peer-unavailable = l'hôte n'existe pas
          if (!connected && (err && (err.type === 'peer-unavailable' || !opened))) {
            clearTimeout(giveUp);
            reject(err.type === 'peer-unavailable'
              ? new Error('Aucun salon "' + this.roomCode + '" — l\'hôte n\'a pas encore créé le salon.')
              : err);
          } else {
            this.emit('error', err);
          }
        });
      });
    },

    onGuestConnected(conn) {
      conn.on('open', () => {
        conn.on('data', (msg) => this.onMessageFromGuest(conn, msg));
      });
      conn.on('close', () => {
        // Retirer le participant
        if (this.state) {
          this.state.participants = this.state.participants.filter(p => p.id !== conn.peer);
          this.broadcastState();
        }
        this.conns.delete(conn.peer);
      });
    },

    onMessageFromGuest(conn, msg) {
      if (!msg || !msg.type) return;
      if (msg.type === 'hello') {
        // Ajouter le guest aux participants
        if (this.state.phase === 'lobby') {
          if (!this.state.participants.find(p => p.id === conn.peer)) {
            this.state.participants.push({
              id: conn.peer, name: (msg.name || 'Joueur').slice(0,18), formation: msg.formation || '4-3-3', isHost: false,
            });
            this.state.slots[conn.peer] = blankSlots(msg.formation || '4-3-3');
            this.state.spent[conn.peer] = 0;
          }
          this.conns.set(conn.peer, conn);
          this.broadcastState();
        }
      } else if (msg.type === 'pick') {
        // Validate via callback (set by main.js)
        this.emit('message', { from: conn.peer, msg });
      } else if (msg.type === 'skip') {
        this.emit('message', { from: conn.peer, msg });
      }
    },

    onMessageFromHost(msg) {
      if (!msg || !msg.type) return;
      if (msg.type === 'state') {
        this.state = msg.state;
        this.emit('state', this.state);
      } else if (msg.type === 'toast') {
        this.emit('message', { from: 'host', msg });
      }
    },

    // Côté hôte : envoyer l'état à tous les guests
    broadcastState() {
      if (this.role !== 'host') return;
      const payload = { type: 'state', state: this.state };
      this.conns.forEach(c => { try { c.send(payload); } catch (_) {} });
      // Dispatcher localement aussi
      this.emit('state', this.state);
    },

    // Côté guest : envoyer un pick à l'hôte
    sendPick(slotId, playerId) {
      if (this.role !== 'guest' || !this.hostConn) return;
      this.hostConn.send({ type: 'pick', slotId, playerId });
    },
    sendSkip() {
      if (this.role !== 'guest' || !this.hostConn) return;
      this.hostConn.send({ type: 'skip' });
    },

    teardown() {
      if (this.peer) { try { this.peer.destroy(); } catch (_) {} }
      this.peer = null;
      this.role = null;
      this.conns.clear();
      this.hostConn = null;
      this.state = null;
    },
  };

  function blankSlots(formation) {
    const F = (window.FORMATIONS || {})[formation];
    if (!F) return {};
    const o = {};
    F.slots.forEach(s => o[s.id] = null);
    return o;
  }
})();
