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

  // pool de joueurs reconnaissables : top par valeur (>=10M) sur les 5 ligues majeures
  function buildPool(PLAYERS) {
    const TOP5 = ['Premier League','La Liga','Bundesliga','Serie A','Ligue 1'];
    return PLAYERS.filter(p =>
      p && p.value >= 10 && TOP5.includes(p.league) &&
      (p.sofifa || p.sofa || p.fot) // photo dispo de préférence
    );
  }

  const JustePrix = window.JustePrix = {
    mode: null,      // 'updown' | 'multi'
    pool: [],
    state: {},

    init(PLAYERS) {
      this.pool = buildPool(PLAYERS);
    },

    // -------- Variante 1 : Plus ou Moins --------
    startUpDown() {
      this.mode = 'updown';
      const A = pickRandom(this.pool);
      const B = pickDifferent(this.pool, A);
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
      s.next = pickDifferent(this.pool, s.current);
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
        target: pickRandom(this.pool),
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
        if (s.round < s.rounds) s.target = pickRandom(this.pool);
        return { resolved: true, winnerIdx: bestIdx, target, history: s.history[0], scores: s.scores, finished: s.round >= s.rounds };
      }
      return { resolved: false };
    },
  };

  function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function pickDifferent(arr, x) {
    let n; do { n = pickRandom(arr); } while (n === x);
    return n;
  }
})();
