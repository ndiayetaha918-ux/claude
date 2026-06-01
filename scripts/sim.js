/* ==========================================================================
   Drafter — Moteur de simulation v2 (positionnel, raisonné)
   - Profils de joueurs dérivés (att/cre/pac/def/phy/tec)
   - Tactique par équipe (hauteur de bloc, tempo, pressing, largeur, directness)
   - Simulation par possessions à travers 4 zones du terrain
   - Faiblesses exploitables émergentes (bloc bas ↔ contre, press ↔ espaces)
   - Timeline de moments avec trajectoire de balle réelle entre joueurs
   - Score dérivé des buts simulés (toujours cohérent)
   - Rapport tactique post-match
   ========================================================================== */
(function () {
  'use strict';

  // ---- Styles → presets tactiques (modifiables par l'utilisateur) ----
  const STYLES = {
    possession: { key:'possession', label:'Possession', icon:'◐',
      desc:'Conservation, jeu court, on use l\'adversaire.',
      tactics:{ lineHeight:62, tempo:42, press:55, width:60, directness:25 } },
    contre:     { key:'contre', label:'Contre-attaque', icon:'↯',
      desc:'Bloc médian, récupération puis projection rapide.',
      tactics:{ lineHeight:42, tempo:78, press:40, width:50, directness:78 } },
    pressing:   { key:'pressing', label:'Pressing haut', icon:'↥',
      desc:'Récupération haute, intensité, gegenpressing.',
      tactics:{ lineHeight:78, tempo:70, press:88, width:62, directness:50 } },
    bloc:       { key:'bloc', label:'Bloc bas', icon:'▤',
      desc:'Défense compacte, lignes basses, jeu direct.',
      tactics:{ lineHeight:24, tempo:46, press:25, width:38, directness:70 } },
    equilibre:  { key:'equilibre', label:'Équilibré', icon:'⬡',
      desc:'Pas d\'excès, on s\'adapte au match.',
      tactics:{ lineHeight:52, tempo:55, press:52, width:52, directness:50 } },
  };

  const ATTACK_POS = ['ST','CF','SS','LW','RW','AM'];
  const MID_POS    = ['CM','DM','AM','LM','RM'];
  const DEF_POS    = ['CB','LB','RB','LWB','RWB','DM'];

  // ---- Profil d'un joueur (0..100 par attribut) ----
  function profile(player) {
    const v = player.value || 5;
    const base = Math.max(46, Math.min(94, 44 + Math.log10(v + 1) * 16));
    const pos = (player.positions && player.positions[0]) || 'CM';
    // poids par poste : [att, cre, pac, def, phy, tec]
    const W = {
      GK:[10,30,20,80,70,40], CB:[18,35,45,90,82,52], LB:[40,52,78,74,62,64],
      RB:[40,52,78,74,62,64], LWB:[48,56,82,68,60,66], RWB:[48,56,82,68,60,66],
      DM:[38,62,55,80,74,66], CM:[55,80,62,64,64,78], AM:[74,86,68,42,52,86],
      LM:[64,72,82,52,54,80], RM:[64,72,82,52,54,80], LW:[80,72,88,38,50,86],
      RW:[80,72,88,38,50,86], SS:[86,78,74,36,58,84], CF:[88,66,66,34,74,78],
      ST:[92,58,72,30,78,72],
    }[pos] || [60,60,60,60,60,60];
    // âge : pic ~27
    const age = player.age || 26;
    const pacAge = age <= 24 ? 1.06 : age >= 31 ? (age >= 34 ? 0.82 : 0.92) : 1.0;
    const expAge = age >= 29 ? 1.04 : age <= 20 ? 0.95 : 1.0; // cre/def montent avec l'expérience
    const scale = (w) => Math.round(Math.max(35, Math.min(99, base * (0.62 + w / 250))));
    return {
      att: scale(W[0]),
      cre: Math.round(scale(W[1]) * expAge),
      pac: Math.round(scale(W[2]) * pacAge),
      def: Math.round(scale(W[3]) * expAge),
      phy: scale(W[4]),
      tec: scale(W[5]),
      pos, player,
    };
  }

  function avg(arr, key) { return arr.length ? arr.reduce((s, p) => s + p[key], 0) / arr.length : 50; }

  // ---- Forces d'équipe par ligne (raisonnement zonal) ----
  function teamProfile(participant, FORMATIONS, playerById, tactics) {
    const F = FORMATIONS[participant.formation];
    const slots = F.slots.map(s => ({ slot: s, pid: participant.slots[s.id] }));
    const players = slots.filter(s => s.pid).map(s => {
      const pl = playerById(s.pid);
      return pl ? Object.assign(profile(pl), { slotType: s.slot.type, x: s.slot.x, y: s.slot.y, slotId: s.slot.id }) : null;
    }).filter(Boolean);

    const gk  = players.filter(p => p.slotType === 'GK');
    const def = players.filter(p => ['CB','LB','RB','LWB','RWB'].includes(p.slotType));
    const mid = players.filter(p => ['DM','CM','AM','LM','RM'].includes(p.slotType));
    const att = players.filter(p => ['LW','RW','ST','CF','SS'].includes(p.slotType));

    const T = tactics || STYLES.equilibre.tactics;
    // Construction : DC/MDC qualité passe + GK relance
    const buildUp = 0.5*avg(def,'tec') + 0.3*avg(mid,'cre') + 0.2*avg(gk,'cre');
    // Contrôle du milieu : tec/cre/def des milieux + nombre
    const midControl = (0.45*avg(mid,'cre') + 0.30*avg(mid,'tec') + 0.25*avg(mid,'def')) * (1 + (mid.length - 3) * 0.04);
    // Création de chances : créateurs + ailiers
    const chanceCreation = 0.5*avg(att,'cre' in (att[0]||{}) ? 'cre':'tec') + 0.3*avg(mid,'cre') + 0.2*avg(att,'tec');
    // Finition
    const finishing = 0.7*avg(att,'att') + 0.3*Math.max(avg(att,'att'), avg(mid,'att'));
    // Vitesse offensive (contres)
    const attackPace = 0.6*avg(att,'pac') + 0.4*avg(mid,'pac');
    // Solidité défensive : DC/MDC def+phy, modulé par bloc bas (plus bas = plus solide mais subit)
    const defLine = 0.55*avg(def,'def') + 0.25*avg(def,'phy') + 0.20*avg(mid,'def');
    const blockBonus = (60 - T.lineHeight) * 0.12; // bloc bas → +solidité
    const defense = defLine + blockBonus;
    // Vulnérabilité dans le dos (ligne haute = espaces concédés)
    const spaceBehind = Math.max(0, (T.lineHeight - 45)) * 0.5 - avg(def,'pac') * 0.15;
    // Pressing : récupère haut mais coûte de l'énergie / laisse de l'espace
    const pressGain = T.press * 0.4 + avg(mid,'phy') * 0.3 + avg(att,'phy') * 0.2;
    const gkRating = avg(gk, 'def');

    return {
      players, gk, def, mid, att,
      buildUp, midControl, chanceCreation, finishing, attackPace,
      defense, spaceBehind, pressGain, gkRating,
      formation: participant.formation,
      starCount: players.filter(p => (p.player.value||0) >= 70).length,
    };
  }

  // ============================================================
  // SCORING d'équipe (raisonné, pas juste somme des valeurs)
  // ============================================================
  function computeTeamScore(participant, FORMATIONS, SLOT_RULES, playerById, tactics) {
    const players = Object.values(participant.slots).filter(Boolean).map(id => playerById(id)).filter(Boolean);
    if (!players.length) return { quality:0, chemistry:0, fit:0, balance:0, tactic:0, overall:0, players:[], topPlayers:[], totalValue:0, avgAge:0, filled:0, tp:null };

    const tp = teamProfile(participant, FORMATIONS, playerById, tactics);
    const totalValue = players.reduce((s, p) => s + (p.value || 0), 0);
    const avgValue = totalValue / players.length;

    // Qualité individuelle (log) — mais on plafonne l'effet "stars empilées"
    let quality = 32 + Math.log10(Math.max(1, avgValue)) * 22;
    quality = Math.min(99, Math.max(20, quality));

    // Chimie : nationalité + championnat partagés
    let sameL = 0, sameN = 0;
    for (let i = 0; i < players.length; i++)
      for (let j = i + 1; j < players.length; j++) {
        if (players[i].league && players[i].league === players[j].league) sameL++;
        if (players[i].nat && players[i].nat === players[j].nat) sameN++;
      }
    const maxPairs = players.length * (players.length - 1) / 2 || 1;
    const chemistry = Math.min(99, Math.max(20, 38 + (sameL / maxPairs) * 40 + (sameN / maxPairs) * 28));

    // Adéquation : poste joué vs poste naturel
    const F = FORMATIONS[participant.formation];
    let fitPts = 0, slotsCount = 0;
    F.slots.forEach(slot => {
      const pid = participant.slots[slot.id]; if (!pid) return;
      const pl = playerById(pid); if (!pl) return;
      slotsCount++;
      const acc = SLOT_RULES[slot.type] || [];
      if (pl.positions[0] === slot.type) fitPts += 3;
      else if (acc.indexOf(pl.positions[0]) === 0) fitPts += 2.6;
      else if (acc.includes(pl.positions[0])) fitPts += 2.1;
      else if (pl.positions.some(p => acc.includes(p))) fitPts += 1.4;
      else fitPts += 0.4;
    });
    const fit = slotsCount ? Math.min(99, (fitPts / (slotsCount * 3)) * 100) : 0;

    // Équilibre : répartition def/mid/att + redondances
    const balance = Math.min(99, 40 + (tp.def.length>=3?20:8) + (tp.mid.length>=2?20:8) + (tp.att.length>=1?19:6)
      - Math.max(0, (tp.att.length - 4)) * 6);

    // Cohérence tactique : la tactique sert-elle les joueurs ?
    const T = tactics || STYLES.equilibre.tactics;
    let tactic = 60;
    // tempo élevé sans vitesse devant = pénalité ; bloc bas sans solidité = pénalité
    if (T.tempo > 65 && tp.attackPace < 70) tactic -= 12;
    if (T.lineHeight < 35 && tp.defense < 70) tactic -= 10;
    if (T.press > 75 && avg(tp.mid,'phy') < 68) tactic -= 10;
    if (T.directness > 70 && tp.finishing < 68) tactic -= 8;
    if (T.tempo > 65 && tp.attackPace >= 78) tactic += 10;
    if (T.lineHeight < 35 && tp.defense >= 78) tactic += 8;
    tactic = Math.min(99, Math.max(20, tactic));

    // Overall pondéré — la cohérence compte autant que les noms
    const overall = Math.round(
      quality * 0.34 + chemistry * 0.14 + fit * 0.16 + balance * 0.14 + tactic * 0.22
    );

    const topPlayers = players.slice().sort((a, b) => b.value - a.value).slice(0, 3);
    const avgAge = Math.round((players.reduce((s, p) => s + (p.age||26), 0) / players.length) * 10) / 10;

    return {
      quality: Math.round(quality), chemistry: Math.round(chemistry), fit: Math.round(fit),
      balance: Math.round(balance), tactic: Math.round(tactic), overall,
      players, topPlayers, totalValue, avgAge, filled: players.length, tp,
    };
  }

  // ============================================================
  // SIMULATION DU MATCH (par possessions / zones)
  // ============================================================
  function rnd(a=1){ return Math.random()*a; }
  function chance(p){ return Math.random() < p; }
  function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
  function weightedPick(arr, key){
    const tot = arr.reduce((s,p)=>s+Math.max(1,p[key]),0);
    let r = Math.random()*tot;
    for (const p of arr){ r -= Math.max(1,p[key]); if (r<=0) return p; }
    return arr[arr.length-1];
  }

  // Coordonnées paysage (0..100 en x = profondeur vers le but adverse, y = largeur)
  // Pour A : x croît vers la droite ; pour B : miroir géré à l'affichage.
  function fieldPos(prof, side, zone) {
    // prof.x (0..100 horizontal portrait), prof.y (0..100 vertical portrait)
    // En paysage : profondeur = (100 - prof.y)/100 ; largeur = prof.x/100
    const depth = 1 - (prof.y / 100);
    const width = prof.x / 100;
    return { depth, width };
  }

  function simulateMatch(A, B, tacticsA, tacticsB, opts) {
    opts = opts || {};
    const five = !!opts.five;
    const tpA = A, tpB = B; // déjà des teamProfiles
    const TA = tacticsA, TB = tacticsB;

    // Probabilité de base de gagner une possession (contrôle du milieu + style)
    // Un style direct/bloc bas cède le ballon ; possession/pressing le garde.
    const ctrlA = tpA.midControl * (0.7 + TA.tempo/300) * (1 + (TA.lineHeight-50)/240) * (1 - (TA.directness-50)/300) + tpA.pressGain*0.25;
    const ctrlB = tpB.midControl * (0.7 + TB.tempo/300) * (1 + (TB.lineHeight-50)/240) * (1 - (TB.directness-50)/300) + tpB.pressGain*0.25;
    const possShareA = Math.max(0.28, Math.min(0.72, ctrlA / (ctrlA + ctrlB)));

    const moments = [];
    const minutesTotal = 90;
    const nPossessions = five ? 34 : 46; // five = plus de transitions
    let scoreA = 0, scoreB = 0;
    let minute = 1;
    const statsA = { poss:0, shots:0, onTarget:0, xg:0, corners:0, fouls:0 };
    const statsB = { poss:0, shots:0, onTarget:0, xg:0, corners:0, fouls:0 };
    const contrib = {}; // playerId -> {goals, assists, key, recov}

    function bump(pid, k){ if(!pid)return; (contrib[pid]=contrib[pid]||{goals:0,assists:0,key:0,recov:0})[k]++; }

    moments.push({ t:0, type:'kickoff', team:null, text:'Coup d\'envoi' });

    for (let i = 0; i < nPossessions; i++) {
      minute = Math.min(89, Math.round((i + 0.5) / nPossessions * 88) + 1);
      const half = i === Math.floor(nPossessions/2);
      if (half) moments.push({ t:45, type:'half', team:null, text:'Mi-temps' });

      // Qui a le ballon ?
      const aHas = chance(possShareA);
      const side = aHas ? 'A' : 'B';
      const off = aHas ? tpA : tpB;     // attaque
      const deff = aHas ? tpB : tpA;    // défense
      const Toff = aHas ? TA : TB;
      const Tdef = aHas ? TB : TA;
      if (aHas) statsA.poss++; else statsB.poss++;

      // ---- Construction → progression à travers les zones ----
      // zone 1 (sortie) → 2 (milieu) → 3 (dernier tiers) → 4 (surface)
      const path = [];
      let broke = false, turnoverZone = 0;

      // joueurs impliqués pour la trajectoire
      const startP = off.def.length ? weightedPick(off.def,'tec') : pick(off.players);
      path.push(startP);

      // Pressing adverse sur la sortie de balle
      const pressOnBuildup = (Tdef.press/100) * 0.5 + (deff.pressGain/200);
      const buildupSkill = off.buildUp/100 + (Toff.directness/300);
      if (chance(pressOnBuildup * 0.45) && !chance(buildupSkill)) {
        // perte à la relance → l'adversaire récupère haut
        turnoverZone = 1; broke = true;
        const winner = deff.mid.length ? pick(deff.mid) : pick(deff.players);
        bump(winner.player.id, 'recov');
      }

      let mid1 = null, mid2 = null, finalP = null;
      if (!broke) {
        // milieu
        mid1 = off.mid.length ? weightedPick(off.mid,'cre') : pick(off.players);
        path.push(mid1);
        const midBattle = off.midControl / (off.midControl + deff.midControl);
        if (!chance(midBattle * 0.62 + 0.12)) {
          turnoverZone = 2; broke = true;
          const winner = deff.mid.length ? weightedPick(deff.mid,'def') : pick(deff.players);
          bump(winner.player.id, 'recov');
        }
        if (!broke) {
          // dernier tiers : création de chance
          const creator = off.mid.concat(off.att).length ? weightedPick(off.mid.concat(off.att),'cre') : pick(off.players);
          mid2 = creator; path.push(creator);
          // défense recule + vulnérabilité espaces (si l'attaque va vite et la ligne def est haute)
          const breakDef = (off.chanceCreation + off.attackPace*0.5 + Math.max(0, deff.spaceBehind)) /
                           (off.chanceCreation + off.attackPace*0.5 + deff.defense + 55);
          if (chance(breakDef * 0.7 + 0.08)) {
            finalP = off.att.length ? weightedPick(off.att,'att') : weightedPick(off.players,'att');
            path.push(finalP);
          } else {
            turnoverZone = 3; broke = true;
            const winner = deff.def.length ? weightedPick(deff.def,'def') : pick(deff.players);
            bump(winner.player.id, 'recov');
          }
        }
      }

      // ---- Issue de la possession ----
      if (broke) {
        // transition / contre possible pour le défenseur si tactique directe
        const counterChance = (Tdef.directness/100) * 0.28 * (turnoverZone>=2?1.3:0.7);
        moments.push({
          t:minute, type:'turnover', team:side, zone:turnoverZone,
          path: path.map(serializeP),
          text: commentaryTurnover(turnoverZone, off, deff)
        });
        if (chance(counterChance)) {
          // contre éclair
          const cTeam = aHas ? 'B' : 'A';
          const cOff = deff;
          const finisher = cOff.att.length ? weightedPick(cOff.att,'pac') : weightedPick(cOff.players,'att');
          const passer = cOff.mid.length ? weightedPick(cOff.mid,'cre') : pick(cOff.players);
          const shotQ = (finisher.att*0.6 + finisher.pac*0.2 + cOff.finishing*0.2)/100;
          const onT = chance(shotQ*0.7+0.1);
          const xg = +(0.08 + shotQ*0.22).toFixed(2);
          const cStats = cTeam==='A'?statsA:statsB;
          cStats.shots++; cStats.xg+=xg; if(onT)cStats.onTarget++;
          const gk = (cTeam==='A'?tpB:tpA).gkRating;
          const isGoal = onT && chance(shotQ * (1 - gk/150) * 0.62);
          bump(passer.player.id,'key');
          moments.push({
            t:minute, type: isGoal?'goal':(onT?'save':'miss'), team:cTeam, counter:true,
            path:[serializeP(passer), serializeP(finisher)],
            scorer: isGoal?finisher.player.name:undefined,
            scorerId: isGoal?finisher.player.id:undefined,
            assistId: isGoal?passer.player.id:undefined,
            text: isGoal ? `CONTRE FATAL ! ${finisher.player.name} conclut la transition`
                 : onT ? `Contre de ${finisher.player.name}, le gardien repousse !`
                 : `Contre de ${finisher.player.name} mais ça file à côté`
          });
          if (isGoal){ if(cTeam==='A')scoreA++; else scoreB++; bump(finisher.player.id,'goals'); bump(passer.player.id,'assists'); }
        }
        continue;
      }

      // chance créée → tir
      const shooter = finalP || (off.att.length?pick(off.att):pick(off.players));
      const assister = mid2 && mid2!==shooter ? mid2 : (mid1 && mid1!==shooter ? mid1 : null);
      const shotQ = (shooter.att*0.55 + shooter.tec*0.2 + off.finishing*0.25)/100;
      const onT = chance(shotQ*0.66 + 0.12);
      const xg = +(0.1 + shotQ*0.28).toFixed(2);
      if (aHas){ statsA.shots++; statsA.xg+=xg; if(onT)statsA.onTarget++; } else { statsB.shots++; statsB.xg+=xg; if(onT)statsB.onTarget++; }
      const gk = deff.gkRating;
      const isGoal = onT && chance(shotQ * (1 - gk/150) * 0.6);
      if (assister) bump(assister.player.id,'key');

      if (isGoal) {
        if (aHas) scoreA++; else scoreB++;
        bump(shooter.player.id,'goals');
        if (assister) bump(assister.player.id,'assists');
        moments.push({
          t:minute, type:'goal', team:side, path:path.map(serializeP),
          scorer:shooter.player.name, scorerId:shooter.player.id,
          assistId: assister?assister.player.id:null,
          text: assister ? `BUT ! ${shooter.player.name}, servi par ${assister.player.name}`
                         : `BUT ! ${shooter.player.name} d'une frappe limpide`
        });
      } else if (onT) {
        moments.push({ t:minute, type:'save', team:side, path:path.map(serializeP),
          text:`${shooter.player.name} tente, ${deff.gk.length?deff.gk[0].player.name:'le gardien'} veille !` });
        // corner possible
        if (chance(0.4)) { if(aHas)statsA.corners++; else statsB.corners++;
          moments.push({ t:minute, type:'corner', team:side, path:[], text:`Corner pour ${aHas?'l\'équipe A':'l\'équipe B'}` }); }
      } else {
        moments.push({ t:minute, type:'miss', team:side, path:path.map(serializeP),
          text:`${shooter.player.name} ajuste mal, ça passe à côté` });
      }

      // faute / coup franc occasionnel
      if (chance(0.10)) {
        const fteam = aHas?'B':'A';
        if (fteam==='A')statsA.fouls++; else statsB.fouls++;
        const dangerous = chance(0.4);
        moments.push({ t:minute, type: dangerous?'freekick':'foul', team:fteam, path:[],
          text: dangerous?`Coup franc dangereux obtenu`:`Faute au milieu` });
        if (dangerous && chance(0.12)) {
          const taker = off.players.length?weightedPick(off.players,'tec'):null;
          const isGoal2 = taker && chance((taker.tec/100)*0.25);
          if (isGoal2){ if(aHas)scoreA++; else scoreB++; bump(taker.player.id,'goals');
            moments.push({ t:minute, type:'goal', team:side, freekick:true, path:[serializeP(taker)],
              scorer:taker.player.name, scorerId:taker.player.id,
              text:`COUP FRANC MAGISTRAL de ${taker.player.name} !` }); }
        }
        if (chance(0.16)) moments.push({ t:minute, type:'card', team: aHas?'A':'B', card: chance(0.1)?'red':'yellow', path:[],
          text: chance(0.1)?'Carton rouge !':'Carton jaune' });
      }
    }

    moments.push({ t:90, type:'end', team:null, text:`Coup de sifflet final — ${scoreA} - ${scoreB}` });

    return {
      scoreA, scoreB, moments,
      stats: { A: finalizeStats(statsA, nPossessions), B: finalizeStats(statsB, nPossessions) },
      contrib,
      possShareA: Math.round(possShareA*100),
    };
  }

  function finalizeStats(s, n){
    return { possession: Math.round(s.poss/n*100), shots:s.shots, onTarget:s.onTarget,
             xg:+s.xg.toFixed(2), corners:s.corners, fouls:s.fouls };
  }
  function serializeP(p){ return { id:p.player.id, name:p.player.name, x:p.x, y:p.y, slotType:p.slotType }; }

  function commentaryTurnover(zone, off, deff){
    if (zone===1) return 'Pressing haut récompensé, ballon perdu à la relance !';
    if (zone===2) return 'Le milieu adverse récupère, duel gagné';
    return 'La défense repousse le danger';
  }

  // ============================================================
  // RAPPORT TACTIQUE POST-MATCH (déterministe mais argumenté)
  // ============================================================
  function matchReport(nameA, nameB, A, B, TA, TB, result) {
    const r = result;
    const winner = r.scoreA > r.scoreB ? nameA : r.scoreB > r.scoreA ? nameB : null;
    const lines = [];
    lines.push(`**${nameA} ${r.scoreA} – ${r.scoreB} ${nameB}** · possession ${r.stats.A.possession}%-${r.stats.B.possession}% · xG ${r.stats.A.xg}-${r.stats.B.xg}.`);

    // qui a dominé le milieu
    if (A.midControl > B.midControl + 6) lines.push(`${nameA} a contrôlé l'entrejeu (${Math.round(A.midControl)} vs ${Math.round(B.midControl)}), dictant le tempo.`);
    else if (B.midControl > A.midControl + 6) lines.push(`${nameB} a pris l'ascendant au milieu (${Math.round(B.midControl)} vs ${Math.round(A.midControl)}).`);
    else lines.push(`Bataille équilibrée au milieu, le match s'est joué sur des détails.`);

    // exploitation des faiblesses
    if (TA.lineHeight > 65 && B.attackPace > 75) lines.push(`La ligne haute de ${nameA} a offert des espaces que la vitesse de ${nameB} a exploités.`);
    if (TB.lineHeight > 65 && A.attackPace > 75) lines.push(`${nameA} a trouvé les failles derrière la défense haute de ${nameB} en transition.`);
    if (TA.lineHeight < 35 && A.defense > 74) lines.push(`Le bloc bas de ${nameA} a tenu : peu d'espaces concédés, ${nameB} a buté dessus.`);
    if (TB.press > 78 && A.buildUp < 66) lines.push(`Le pressing de ${nameB} a gêné la relance de ${nameA}.`);

    // homme du match
    const best = Object.entries(r.contrib).map(([id,c])=>({id,score:c.goals*4+c.assists*2.5+c.key*0.8+c.recov*0.5,c}))
      .sort((a,b)=>b.score-a.score)[0];
    if (best && best.score > 0) {
      const nm = (r.contrib[best.id] && r.contrib[best.id].name) || best.id;
    }
    if (winner) lines.push(`Décisif : ${winner} a su convertir sa domination ${r.scoreA===r.scoreB?'':'au tableau d\'affichage'}.`);
    else lines.push(`Match nul logique au vu de l'équilibre des forces.`);

    return { winner, lines };
  }

  // ============================================================
  // Export
  // ============================================================
  window.Sim = {
    STYLES,
    profile, teamProfile, computeTeamScore,
    simulateMatch, matchReport,
  };
})();
