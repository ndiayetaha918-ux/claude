/* ==========================================================================
   Drafter — Moteur de raisonnement tactique (déterministe, sans clé API)
   Produit une analyse façon consultant tactique : compositions, profils,
   redondances, plans tactiques, scénarios de match, faiblesses exploitables.
   Le but : ressentir un raisonnement, pas un texte aléatoire.
   ========================================================================== */
(function () {
  'use strict';

  const POS_ROLES = {
    GK:'gardien', CB:'défenseur central', LB:'latéral gauche', RB:'latéral droit',
    LWB:'piston gauche', RWB:'piston droit', DM:'sentinelle', CM:'milieu relais',
    AM:'meneur', LM:'milieu gauche', RM:'milieu droit', LW:'ailier gauche',
    RW:'ailier droit', SS:'second attaquant', CF:'avant-centre mobile', ST:'numéro 9',
  };

  const Reason = window.Reason = {

    // ============================================================
    // ANALYSE D'UNE ÉQUIPE
    // ============================================================
    analyzeTeam(participantName, score, profile, tactics, FORMATIONS, playerById, formationKey) {
      const tp = profile;
      const Toff = tactics || window.Sim.STYLES.equilibre.tactics;
      const F = FORMATIONS[formationKey];

      const lines = [];
      const tag = (s) => `<span class="ai-tag">${s}</span>`;

      // -- Identité du bloc --
      const ident = describeIdentity(Toff);
      lines.push(`<p><strong>Identité.</strong> Bloc ${ident.block}, tempo ${ident.tempo}, intention ${ident.intent}. Style : ${ident.label}.</p>`);

      // -- Forces saillantes --
      const strengths = [];
      if (tp.midControl >= 70) strengths.push('un milieu dominateur');
      if (tp.finishing >= 75) strengths.push('une finition de très haut niveau');
      if (tp.attackPace >= 78) strengths.push('une vitesse en transition qui peut faire mal');
      if (tp.chanceCreation >= 75) strengths.push('une vraie créativité dans le dernier tiers');
      if (tp.defense >= 75) strengths.push('une assise défensive sérieuse');
      if (tp.gkRating >= 78) strengths.push('un gardien décisif');
      if (tp.buildUp >= 72) strengths.push('une relance propre');
      if (strengths.length === 0) strengths.push('un collectif sans excès, équilibré');
      lines.push(`<p><strong>Forces.</strong> Le projet repose sur ${joinFr(strengths)}.</p>`);

      // -- Faiblesses --
      const w = [];
      if (Toff.lineHeight >= 70 && tp.attackPace < 70) w.push('une ligne très haute sans la vitesse pour la couvrir : tout contre rapide va piquer dans le dos');
      if (Toff.lineHeight <= 30 && tp.finishing < 65) w.push('un bloc bas qui condamne à compter sur de rares occasions : la finition n\'est pas garantie');
      if (Toff.press >= 80 && avgPhy(tp) < 68) w.push('un pressing exigeant sans le moteur physique au milieu : essoufflement annoncé');
      if (Toff.tempo >= 70 && tp.attackPace < 65) w.push('un tempo voulu rapide mais des relais lents : on se précipite dans la mauvaise vitesse');
      if (Toff.directness >= 70 && tp.finishing < 65) w.push('du jeu direct mais peu d\'attaquants pour le capitaliser');
      if (tp.def.length <= 2) w.push('seulement deux défenseurs : exposition aux centres et aux deuxièmes ballons');
      if (countRoleConflicts(tp) > 0) w.push('des rôles qui se chevauchent : deux profils qui veulent la même zone');
      if (w.length === 0) w.push('aucune faille structurelle évidente, mais attention à la concentration sur la durée');
      lines.push(`<p><strong>Faiblesses.</strong> ${capitalize(w.slice(0,3).join('. '))}.</p>`);

      // -- Plan tactique probable --
      const plan = buildPlan(tp, Toff, F);
      lines.push(`<p><strong>Plan probable.</strong> ${plan}</p>`);

      // -- Hommes-clés --
      const keys = topPlayers(tp, 3);
      const keyLine = keys.map(p => `<strong>${p.player.name}</strong> (${POS_ROLES[p.slotType] || p.slotType})`).join(', ');
      lines.push(`<p><strong>Clés du système.</strong> ${keyLine}.</p>`);

      return lines.join('');
    },

    // ============================================================
    // MATCHUP : comment équipe A se comporterait face à équipe B
    // ============================================================
    analyzeMatchup(nameA, tpA, tacA, nameB, tpB, tacB) {
      const lines = [];
      // Bataille du milieu
      const mid = midBattle(tpA, tpB, tacA, tacB);
      lines.push(`<p>${mid}</p>`);
      // Failles exploitables
      const exA = exploitable(nameA, tpA, tacA, tpB, tacB);
      const exB = exploitable(nameB, tpB, tacB, tpA, tacA);
      if (exA) lines.push(`<p>${exA}</p>`);
      if (exB) lines.push(`<p>${exB}</p>`);
      // Pronostic
      const pron = predict(nameA, nameB, tpA, tpB, tacA, tacB);
      lines.push(`<p><strong>Pronostic.</strong> ${pron}</p>`);
      return lines.join('');
    },
  };

  // ============================================================
  // primitives
  // ============================================================
  function avg(arr, k) { return arr.length ? arr.reduce((s, p) => s + p[k], 0) / arr.length : 50; }
  function avgPhy(tp) { return (avg(tp.mid, 'phy') + avg(tp.att, 'phy')) / 2; }

  function describeIdentity(T) {
    const block = T.lineHeight >= 65 ? 'haut' : T.lineHeight <= 35 ? 'bas' : 'médian';
    const tempo = T.tempo >= 65 ? 'rapide' : T.tempo <= 40 ? 'posé' : 'mesuré';
    const intent = T.directness >= 65 ? 'verticale' : T.directness <= 35 ? 'patiente' : 'mixte';
    let label = 'équilibré';
    if (T.press >= 75) label = 'gegenpressing';
    else if (T.lineHeight <= 35 && T.directness >= 65) label = 'bloc bas + jeu direct';
    else if (T.lineHeight >= 65 && T.tempo <= 50) label = 'possession territoriale';
    else if (T.directness >= 70) label = 'contre-attaque';
    return { block, tempo, intent, label };
  }
  function joinFr(arr) {
    if (arr.length === 1) return arr[0];
    return arr.slice(0, -1).join(', ') + ' et ' + arr[arr.length - 1];
  }
  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function topPlayers(tp, n) {
    return tp.players.slice().sort((a, b) => (b.player.value || 0) - (a.player.value || 0)).slice(0, n);
  }
  function countRoleConflicts(tp) {
    // ex : 2 AM côte à côte qui ne sont pas dans une formation à deux meneurs
    let c = 0;
    const byType = {};
    tp.players.forEach(p => { (byType[p.slotType] = byType[p.slotType] || []).push(p); });
    if ((byType.AM || []).length >= 2) c++;
    if ((byType.SS || []).length >= 2) c++;
    return c;
  }
  function buildPlan(tp, T, F) {
    const parts = [];
    if (T.lineHeight >= 65) parts.push('la ligne défensive monte à la moitié du terrain');
    else if (T.lineHeight <= 35) parts.push('on accepte de subir, bloc bas');
    else parts.push('un bloc médian discipliné');
    if (T.press >= 70) parts.push('pressing déclenché sur le porteur dès la sortie de balle');
    else if (T.press <= 35) parts.push('on attend dans le bloc plutôt que harceler');
    if (T.directness >= 65) parts.push('verticalité maximale dès qu\'une fenêtre s\'ouvre');
    else parts.push('construction patiente par le milieu');
    if (T.width >= 65) parts.push('on étire les couloirs');
    else if (T.width <= 35) parts.push('jeu axial très resserré');
    return capitalize(parts.join(', ')) + '.';
  }
  function midBattle(tpA, tpB, TA, TB) {
    const diff = tpA.midControl - tpB.midControl;
    if (Math.abs(diff) < 6) {
      return `Au milieu, la bataille est serrée (${Math.round(tpA.midControl)} vs ${Math.round(tpB.midControl)}). Celui qui gagne les seconds ballons prendra le dessus.`;
    }
    if (diff > 0) return `${TA.press >= 70 ? 'Par le pressing,' : 'Par la qualité technique,'} l'équipe A devrait dominer l'entrejeu (${Math.round(tpA.midControl)} vs ${Math.round(tpB.midControl)}).`;
    return `Le milieu adverse paraît supérieur (${Math.round(tpB.midControl)} vs ${Math.round(tpA.midControl)}) : il va falloir compenser ailleurs.`;
  }
  function exploitable(myName, tpMe, T, tpOpp, Topp) {
    if (Topp.lineHeight >= 65 && tpMe.attackPace >= 75) {
      return `<strong>Faille à exploiter :</strong> la ligne haute adverse ouvre l'espace, et ${myName} a la vitesse devant pour la punir en transition.`;
    }
    if (Topp.lineHeight <= 30 && tpMe.chanceCreation < 65) {
      return `<strong>Limite annoncée :</strong> face au bloc bas adverse, ${myName} aura du mal à créer si on n'attire personne hors du bloc.`;
    }
    if (Topp.press >= 75 && tpMe.buildUp < 65) {
      return `<strong>Danger :</strong> le pressing adverse ciblera la relance fragile de ${myName}. Le gardien va devoir lancer long.`;
    }
    if (Topp.width <= 35 && tpMe.players.filter(p => ['LM','RM','LW','RW','LWB','RWB'].includes(p.slotType)).length >= 2) {
      return `<strong>Atout :</strong> ${myName} a la largeur — l'adversaire défend axialement, les couloirs sont libres.`;
    }
    return null;
  }
  function predict(nameA, nameB, tpA, tpB, TA, TB) {
    const styleAdv = (TA.lineHeight - TB.lineHeight) * 0.1 + (tpA.midControl - tpB.midControl) * 0.6
                    + (tpA.finishing - tpB.finishing) * 0.4 - (tpA.spaceBehind - tpB.spaceBehind) * 0.3;
    if (styleAdv > 8) return `${nameA} part avec un avantage clair — la dynamique du match devrait pencher de son côté.`;
    if (styleAdv < -8) return `${nameB} a les arguments structurels pour faire la différence sur ce duel.`;
    return `Un match d'épaule indécis : un détail (coup de pied arrêté, exploit individuel) peut tout faire basculer.`;
  }

})();
