/* ==========================================================================
   Drafter — Mode Juste Prix
   Deux variantes :
   1) Plus ou Moins : on devine si le joueur B vaut plus ou moins que A.
      Bonne réponse → on continue, mauvaise → -1 vie (3 vies au départ).
   2) Juste Prix multijoueur : tout le monde estime la valeur, le plus
      proche prend le point.
   ========================================================================== */
(function () {
  'use strict';

  // Pool stratifié en 3 tiers pour équilibrer les questions (pas que des stars)
  function buildPool(PLAYERS) {
    const TOP5 = ['Premier League','La Liga','Bundesliga','Serie A','Ligue 1'];
    // accepte un peu plus de leagues pour la variété (ajout Saudi + Eredivisie + Primeira)
    const OK = TOP5.concat(['Saudi Pro League','Eredivisie','Primeira Liga','MLS']);
    const reconnaissables = PLAYERS.filter(p =>
      p && p.value >= 8 && OK.includes(p.league)
      // on ne filtre PAS par présence de photo : initiales en fallback
    );
    // tier S = >=70M (mega stars), A = 25-70M (très bons), B = 8-25M (bons abordables)
    const tierS = reconnaissables.filter(p => p.value >= 70);
    const tierA = reconnaissables.filter(p => p.value >= 25 && p.value < 70);
    const tierB = reconnaissables.filter(p => p.value >= 8 && p.value < 25);
    return { tierS, tierA, tierB, all: reconnaissables };
  }

  // Tirage équilibré : on alterne les tiers pour éviter le all-stars
  function pickBalanced(pools) {
    const dice = Math.random();
    // 40% S, 35% A, 25% B
    const t = dice < 0.40 ? pools.tierS
            : dice < 0.75 ? pools.tierA
            :               pools.tierB;
    return pickRandom(t.length ? t : pools.all);
  }

  // Pour une paire Plus/Moins : valeur du second pas trop éloignée du premier (sinon trop facile)
  function pickClosePair(pools) {
    const a = pickBalanced(pools);
    // viser un B dans la même fourchette ±60% pour que la question reste piquante
    const min = Math.max(1, a.value * 0.45);
    const max = a.value * 1.85;
    const cands = pools.all.filter(p => p.id !== a.id && p.value >= min && p.value <= max);
    const b = cands.length ? pickRandom(cands) : pickDifferent(pools.all, a);
    return { a, b };
  }

  const JustePrix = window.JustePrix = {
    mode: null,
    pool: { tierS:[], tierA:[], tierB:[], all:[] },
    state: {},

    init(PLAYERS) {
      this.pool = buildPool(PLAYERS);
    },

    // -------- Variante 1 : Plus ou Moins --------
    startUpDown() {
      this.mode = 'updown';
      const pair = pickClosePair(this.pool);
      const A = pair.a;
      const B = pair.b;
      this.state = { lives: 3, score: 0, current: A, next: B, history: [] };
      return this.state;
    },
    answerUpDown(direction) {
      const s = this.state;
      if (!s || !s.current || !s.next) return null;
      const correct = direction === 'higher'
        ? s.next.value > s.current.value
        : s.next.value < s.current.value;
      if (s.next.value === s.current.value) {
        // égalité = pas de pénalité
        s.history.unshift({ a: s.current, b: s.next, correct: true, tie: true });
      } else if (correct) {
        s.score++;
        s.history.unshift({ a: s.current, b: s.next, correct: true });
      } else {
        s.lives--;
        s.history.unshift({ a: s.current, b: s.next, correct: false });
      }
      s.current = s.next;
      // nouvelle paire avec valeur similaire pour garder le challenge
      const pair = pickClosePair(this.pool);
      s.next = pair.a.id === s.current.id ? pair.b : pair.a;
      return { score: s.score, lives: s.lives, alive: s.lives > 0,
               last: s.history[0], current: s.current, next: s.next };
    },

    // -------- Variante 2 : Juste Prix multijoueur --------
    startMulti(participants) {
      this.mode = 'multi';
      this.state = {
        participants: participants.slice(), // [{name, color}]
        round: 0,
        rounds: 7,
        target: pickBalanced(this.pool),
        guesses: {}, // pid -> value
        scores: participants.map(() => 0),
        history: [],
      };
      return this.state;
    },
    submitGuess(pid, value) {
      const s = this.state;
      s.guesses[pid] = value;
      if (Object.keys(s.guesses).length === s.participants.length) {
        // résoudre la manche
        const target = s.target.value;
        let bestIdx = 0, bestDiff = Infinity;
        s.participants.forEach((p, i) => {
          const g = s.guesses[i] || 0;
          const d = Math.abs(g - target);
          if (d < bestDiff) { bestDiff = d; bestIdx = i; }
        });
        s.scores[bestIdx]++;
        s.history.unshift({ target: s.target, guesses: Object.assign({}, s.guesses), winner: bestIdx });
        s.guesses = {};
        s.round++;
        if (s.round < s.rounds) s.target = pickBalanced(this.pool);
        return { resolved: true, winnerIdx: bestIdx, target, history: s.history[0], scores: s.scores, finished: s.round >= s.rounds };
      }
      return { resolved: false };
    },
    // Résolution forcée (timer écoulé) : on tranche avec les réponses données.
    // Ceux qui n'ont pas répondu ne peuvent pas gagner la manche.
    resolveMulti() {
      const s = this.state;
      const target = s.target.value;
      let bestIdx = -1, bestDiff = Infinity;
      s.participants.forEach((p, i) => {
        if (s.guesses[i] == null) return;          // pas répondu → hors course
        const d = Math.abs(s.guesses[i] - target);
        if (d < bestDiff) { bestDiff = d; bestIdx = i; }
      });
      if (bestIdx >= 0) s.scores[bestIdx]++;
      s.history.unshift({ target: s.target, guesses: Object.assign({}, s.guesses), winner: bestIdx });
      s.guesses = {};
      s.round++;
      if (s.round < s.rounds) s.target = pickBalanced(this.pool);
      return { resolved: true, winnerIdx: bestIdx, target, history: s.history[0], scores: s.scores, finished: s.round >= s.rounds, timedOut: true };
    },
  };

  function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function pickDifferent(arr, x) {
    let n; do { n = pickRandom(arr); } while (n === x);
    return n;
  }
})();
