/* ==========================================================================
   Drafter — Système tactique FM-like
   - 3 phases : possession / transition / défensive
   - Pour chaque joueur : rôle nommé + 4 sliders (positionnement, agressivité,
     prise de risque, appels)
   - L'IA prévient si une consigne est incohérente avec le profil du joueur
   ========================================================================== */
(function () {
  'use strict';

  // ---- Rôles par famille de poste ----
  // Chaque rôle a un poste de slot où il s'applique, et un préréglage pour les
  // 3 phases. La position cible (px, py) est relative au terrain (0-100).
  // L'IA juge l'adéquation au profil du joueur.
  const ROLES = {
    // ===== Gardiens =====
    GK_classic:   { slot:['GK'], label:'Gardien classique',  family:'GK', needs:{def:60,phy:50}, summary:'Reste dans sa surface, lecture du danger.', preset:{ posDx:0, posDy:0, aggr:35, risk:25, off:10 } },
    GK_sweeper:   { slot:['GK'], label:'Gardien libéro',      family:'GK', needs:{def:60,phy:55,tec:65}, summary:'Sort haut, relance, joue 11e homme.', preset:{ posDx:0, posDy:-8, aggr:55, risk:55, off:25 } },

    // ===== Défenseurs centraux =====
    CB_stopper:   { slot:['CB'], label:'Stoppeur',            family:'CB', needs:{def:70,phy:75}, summary:'Anticipe haut, agressif sur l\'attaquant.', preset:{ posDx:0, posDy:8, aggr:78, risk:35, off:15 } },
    CB_classic:   { slot:['CB'], label:'Défenseur axial',     family:'CB', needs:{def:65,phy:65}, summary:'Tient sa zone, dégage propre.', preset:{ posDx:0, posDy:0, aggr:50, risk:30, off:15 } },
    CB_libero:    { slot:['CB'], label:'Libéro',              family:'CB', needs:{tec:75,cre:60,def:62}, summary:'Sort balle au pied, casse les lignes.', preset:{ posDx:0, posDy:-6, aggr:55, risk:65, off:35 } },

    // ===== Latéraux =====
    LB_classic:   { slot:['LB','LWB'], label:'Latéral gauche', family:'LB', needs:{def:60,pac:65}, summary:'Replié, soutien défensif.', preset:{ posDx:-3, posDy:6, aggr:55, risk:35, off:35 } },
    LB_wingback:  { slot:['LB','LWB'], label:'Piston gauche', family:'LB', needs:{pac:75,phy:65,tec:65}, summary:'Monte haut, centre, dépasse les fonctions.', preset:{ posDx:-2, posDy:-12, aggr:55, risk:55, off:75 } },
    LB_inverted:  { slot:['LB','LWB'], label:'Latéral inversé', family:'LB', needs:{tec:75,cre:70}, summary:'Rentre à l\'intérieur en relais milieu.', preset:{ posDx:8, posDy:-6, aggr:45, risk:60, off:55 } },
    RB_classic:   { slot:['RB','RWB'], label:'Latéral droit', family:'RB', needs:{def:60,pac:65}, summary:'Replié, soutien défensif.', preset:{ posDx:3, posDy:6, aggr:55, risk:35, off:35 } },
    RB_wingback:  { slot:['RB','RWB'], label:'Piston droit', family:'RB', needs:{pac:75,phy:65,tec:65}, summary:'Monte haut, centre, dépasse les fonctions.', preset:{ posDx:2, posDy:-12, aggr:55, risk:55, off:75 } },
    RB_inverted:  { slot:['RB','RWB'], label:'Latéral inversé', family:'RB', needs:{tec:75,cre:70}, summary:'Rentre à l\'intérieur en relais milieu.', preset:{ posDx:-8, posDy:-6, aggr:45, risk:60, off:55 } },

    // ===== Milieux défensifs =====
    DM_anchor:    { slot:['DM'], label:'Sentinelle',          family:'DM', needs:{def:70,phy:70}, summary:'Reste, couvre la ligne défensive.', preset:{ posDx:0, posDy:6, aggr:65, risk:25, off:15 } },
    DM_regista:   { slot:['DM','CM'], label:'Régisseur',      family:'DM', needs:{tec:78,cre:75}, summary:'Tempo, longues ouvertures.', preset:{ posDx:0, posDy:2, aggr:40, risk:75, off:35 } },
    DM_destroyer: { slot:['DM'], label:'Récupérateur',        family:'DM', needs:{def:72,phy:78}, summary:'Coupe les transitions adverses sans pitié.', preset:{ posDx:0, posDy:0, aggr:85, risk:25, off:20 } },

    // ===== Milieux centraux =====
    CM_box:       { slot:['CM','DM'], label:'Box-to-box',     family:'CM', needs:{phy:72,att:65,def:60}, summary:'Couvre 60m, surface à surface.', preset:{ posDx:0, posDy:0, aggr:65, risk:55, off:60 } },
    CM_deeplying: { slot:['CM','DM'], label:'Milieu reculé',  family:'CM', needs:{tec:72,cre:65}, summary:'Tempo bas du milieu, lance le jeu.', preset:{ posDx:0, posDy:3, aggr:45, risk:60, off:30 } },
    CM_carrilero: { slot:['CM'], label:'Relayeur',            family:'CM', needs:{tec:65,phy:60}, summary:'Côté, supporte le côté faible.', preset:{ posDx:8, posDy:-2, aggr:55, risk:50, off:50 } },
    CM_mezzala:   { slot:['CM','AM'], label:'Mezzala',        family:'CM', needs:{tec:72,cre:70,phy:62}, summary:'Couloir intérieur, casse les lignes.', preset:{ posDx:-5, posDy:-8, aggr:55, risk:65, off:65 } },

    // ===== Milieux offensifs =====
    AM_classic:   { slot:['AM'], label:'Meneur classique',    family:'AM', needs:{tec:74,cre:80}, summary:'Entre les lignes, dernière passe.', preset:{ posDx:0, posDy:-4, aggr:40, risk:70, off:65 } },
    AM_shadow:    { slot:['AM','SS'], label:'Second attaquant', family:'AM', needs:{att:72,cre:70}, summary:'Joue dans le dos du 9, finition aussi.', preset:{ posDx:0, posDy:-12, aggr:45, risk:65, off:80 } },
    AM_trequart:  { slot:['AM'], label:'Trequartista',        family:'AM', needs:{tec:78,cre:82}, summary:'Liberté totale, créativité absolue.', preset:{ posDx:5, posDy:-6, aggr:35, risk:80, off:60 } },

    // ===== Ailes =====
    LW_winger:    { slot:['LW','LM'], label:'Ailier de débordement', family:'LW', needs:{pac:75,tec:70}, summary:'Profondeur ligne de touche, centres.', preset:{ posDx:-8, posDy:-8, aggr:55, risk:55, off:75 } },
    LW_inverted:  { slot:['LW'], label:'Ailier inversé',       family:'LW', needs:{tec:75,att:70}, summary:'Rentre, frappe du pied opposé.', preset:{ posDx:5, posDy:-10, aggr:50, risk:65, off:75 } },
    LW_inside:    { slot:['LW','LM'], label:'Ailier intérieur', family:'LW', needs:{tec:72,cre:70}, summary:'Joue plus proche du 10 que de la ligne.', preset:{ posDx:8, posDy:-5, aggr:45, risk:65, off:60 } },
    RW_winger:    { slot:['RW','RM'], label:'Ailier de débordement', family:'RW', needs:{pac:75,tec:70}, summary:'Profondeur ligne de touche, centres.', preset:{ posDx:8, posDy:-8, aggr:55, risk:55, off:75 } },
    RW_inverted:  { slot:['RW'], label:'Ailier inversé',       family:'RW', needs:{tec:75,att:70}, summary:'Rentre, frappe du pied opposé.', preset:{ posDx:-5, posDy:-10, aggr:50, risk:65, off:75 } },
    RW_inside:    { slot:['RW','RM'], label:'Ailier intérieur', family:'RW', needs:{tec:72,cre:70}, summary:'Joue plus proche du 10 que de la ligne.', preset:{ posDx:-8, posDy:-5, aggr:45, risk:65, off:60 } },
    LM_classic:   { slot:['LM'], label:'Milieu gauche',        family:'LM', needs:{tec:65,phy:60}, summary:'Couvre tout le côté, replie aussi.', preset:{ posDx:-3, posDy:-3, aggr:50, risk:50, off:55 } },
    RM_classic:   { slot:['RM'], label:'Milieu droit',         family:'RM', needs:{tec:65,phy:60}, summary:'Couvre tout le côté, replie aussi.', preset:{ posDx:3, posDy:-3, aggr:50, risk:50, off:55 } },

    // ===== Attaquants =====
    ST_classic:   { slot:['ST','CF'], label:'Numéro 9 classique', family:'ST', needs:{att:75,phy:65}, summary:'Point de fixation, finition.', preset:{ posDx:0, posDy:-15, aggr:55, risk:55, off:90 } },
    ST_false9:    { slot:['ST','CF'], label:'Faux 9',            family:'ST', needs:{tec:72,cre:70}, summary:'Décroche, libère les espaces.', preset:{ posDx:0, posDy:-4, aggr:40, risk:70, off:70 } },
    ST_target:    { slot:['ST','CF'], label:'Pivot',             family:'ST', needs:{phy:78,att:65}, summary:'Dos au but, jeu de remise, tête.', preset:{ posDx:0, posDy:-12, aggr:55, risk:40, off:80 } },
    ST_poacher:   { slot:['ST','CF'], label:'Renard des surfaces', family:'ST', needs:{att:78}, summary:'Ne sort pas de la surface, instinct pur.', preset:{ posDx:0, posDy:-18, aggr:55, risk:35, off:95 } },
    CF_complete:  { slot:['CF','ST'], label:'Avant-centre complet', family:'CF', needs:{att:72,tec:70,phy:65}, summary:'Tout faire : décrocher, frapper, presser.', preset:{ posDx:0, posDy:-10, aggr:65, risk:60, off:78 } },
  };

  // Pour un slot type donné, retourne la liste des rôles compatibles
  function rolesForSlot(slotType) {
    return Object.entries(ROLES)
      .filter(([k, r]) => r.slot.includes(slotType))
      .map(([k, r]) => Object.assign({ key: k }, r));
  }

  // Rôle par défaut intelligent selon le profil du joueur
  function defaultRoleFor(player, slotType) {
    const candidates = rolesForSlot(slotType);
    if (!candidates.length) return null;
    // Score chaque rôle selon les attributs estimés du joueur
    const prof = window.Sim ? window.Sim.profile(player) : { att:60, cre:60, pac:60, def:60, phy:60, tec:60 };
    let best = candidates[0], bestScore = -1;
    candidates.forEach(r => {
      let sc = 0, count = 0;
      Object.entries(r.needs || {}).forEach(([k, target]) => {
        // pénalise si en-dessous
        const v = prof[k] || 60;
        sc += Math.max(0, 100 - Math.abs(v - target) * 0.8);
        count++;
      });
      if (count) sc /= count;
      if (sc > bestScore) { bestScore = sc; best = r; }
    });
    return best.key;
  }

  // Analyse d'incompatibilité : un joueur joue mal son rôle s'il manque d'un attribut clé
  function incompatibility(player, roleKey) {
    const r = ROLES[roleKey]; if (!r || !player) return null;
    const prof = window.Sim ? window.Sim.profile(player) : null;
    if (!prof) return null;
    const warnings = [];
    Object.entries(r.needs || {}).forEach(([k, target]) => {
      const v = prof[k] || 60;
      if (v < target - 8) {
        const lbl = { att:'finition', cre:'créativité', pac:'vitesse', def:'défense', phy:'physique', tec:'technique' }[k];
        warnings.push(lbl + ' insuffisante (' + v + ' / ' + target + ')');
      }
    });
    return warnings.length ? warnings : null;
  }

  // ---- Style collectif par phase ----
  const PHASE_STYLES = {
    possession: {
      label: 'En possession',
      options: [
        { key:'short', label:'Construction courte', desc:'Le ballon circule par le bas, on attire le pressing.' },
        { key:'mixed', label:'Approche mixte', desc:'Court derrière, long si fenêtre.' },
        { key:'direct', label:'Jeu direct', desc:'On évite le milieu, ballon devant rapidement.' },
        { key:'wing',   label:'Jeu de couloir', desc:'Tout passe par les ailes, centres.' },
      ],
    },
    transition: {
      label: 'En transition',
      options: [
        { key:'counter', label:'Contre-attaque éclair', desc:'Récup → projection en 3 passes max.' },
        { key:'rest',    label:'Repos défensif', desc:'On reprend forme avant d\'attaquer.' },
        { key:'gegen',   label:'Contre-pressing', desc:'Récup haute immédiate après perte.' },
      ],
    },
    defense: {
      label: 'En phase défensive',
      options: [
        { key:'high',   label:'Bloc haut + pressing', desc:'Ligne à mi-terrain, on étouffe.' },
        { key:'mid',    label:'Bloc médian', desc:'Compact, on attend dans son camp.' },
        { key:'low',    label:'Bloc bas', desc:'On défend la surface, on se replie.' },
      ],
    },
  };

  window.Tactics = {
    ROLES, rolesForSlot, defaultRoleFor, incompatibility, PHASE_STYLES,
  };
})();
