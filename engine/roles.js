/* ============================================================
   Drafter — Engine A.2
   Dictionnaire de rôles enrichi (data-driven)

   Chaque rôle est décrit par un set DE DONNÉES :
   - idealAttributes : profil idéal sur les 12 attributs (0-100 = importance)
   - traits          : tags fonctionnels ('finisher', 'creator'…)
   - preferredZones  : zones du terrain où le rôle évolue
   - behavior        : comportement off/transition/def
   - slotsCompat     : postes où le rôle s'applique

   Le moteur DÉDUIT tout depuis ces données :
   - L'adéquation joueur/rôle = distance pondérée attrs vs ideal
   - Les synergies = matrices de complémentarité entre traits
   - Les contradictions = écarts profil idéal vs profil joueur
   Aucune règle codée en dur.
   ============================================================ */
(function () {
  'use strict';

  // -------- Lexique des traits fonctionnels --------
  // Servent à détecter synergies / redondances entre rôles d'une même équipe
  const TRAITS = {
    // === Offensifs ===
    finisher:       'Termine les actions dans la surface',
    creator:        'Crée des occasions par la passe décisive',
    playmaker:      'Organise le jeu, distribue depuis le bas/milieu',
    ball_carrier:   'Progresse balle au pied, casse des lignes',
    dribbler:       'Élimine en un contre un',
    box_crasher:    'Arrive dans la surface en deuxième vague',
    runner:         'Course en profondeur, dans le dos',
    target_man:     'Point de fixation, jeu de remise',
    space_creator:  'Libère des espaces pour les coéquipiers',
    wide:           'Étire le bloc adverse par la largeur',
    half_space:     'Opère dans les demi-espaces (couloirs intérieurs)',
    overlapping:    'Soutient en débordement extérieur',
    underlapping:   'Soutient en débordement intérieur',

    // === Défensifs ===
    anchor:         'Sentinelle, reste en couverture',
    ball_winner:    'Récupérateur agressif au milieu',
    presser:        'Presse haut sans relâche',
    sweeper:        'Couvre les espaces hauts, libéro',
    marker:         'Marquage individuel rigoureux',
    stopper:        'Anticipe haut sur l\'attaquant adverse',

    // === Liaison ===
    link_up:        'Fait le lien entre les lignes',
    distributor:    'Relance propre, longue ou courte',
  };

  // -------- Synergies entre traits (matrice symétrique) --------
  // Score positif = paire complémentaire | négatif = redondance/conflit
  const TRAIT_SYNERGIES = [
    // Offensif
    { pair: ['creator', 'finisher'],         score:  10, why: 'Combinaison classique : passe décisive vers le finisseur' },
    { pair: ['playmaker', 'runner'],         score:   9, why: 'Le meneur récompense les courses en profondeur' },
    { pair: ['target_man', 'runner'],        score:   9, why: 'Remise du pivot pour l\'appel en profondeur' },
    { pair: ['target_man', 'box_crasher'],   score:   8, why: 'Le pivot fixe, le box_crasher conclut' },
    { pair: ['playmaker', 'finisher'],       score:   8, why: 'L\'organisateur sert le finisseur' },
    { pair: ['space_creator', 'runner'],     score:   7, why: 'L\'un libère, l\'autre exploite' },
    { pair: ['ball_carrier', 'wide'],        score:   6, why: 'Conducteur central + élargissement' },
    { pair: ['wide', 'half_space'],          score:   7, why: 'Couverture largeur + demi-espace = surcharge du couloir' },
    { pair: ['overlapping', 'half_space'],   score:   6, why: 'Latéral monte + intérieur rentre = double menace' },
    { pair: ['underlapping', 'wide'],        score:   6, why: 'Latéral rentre + ailier extérieur = inversion' },
    { pair: ['playmaker', 'dribbler'],       score:   5, why: 'Passe entre les lignes vers l\'éliminateur' },
    { pair: ['creator', 'box_crasher'],      score:   7, why: 'Centre vers l\'arrivée en surface' },

    // Défensif
    { pair: ['anchor', 'presser'],           score:   6, why: 'Sentinelle couvre le pressing haut' },
    { pair: ['ball_winner', 'presser'],      score:   7, why: 'Pressing collectif coordonné' },
    { pair: ['stopper', 'sweeper'],          score:   8, why: 'Stoppeur anticipe, libéro couvre' },
    { pair: ['marker', 'sweeper'],           score:   6, why: 'Marquage strict + couverture' },
    { pair: ['ball_winner', 'distributor'],  score:   5, why: 'Récup + relance propre = bonne transition' },

    // Conflits / redondances
    { pair: ['target_man', 'target_man'],    score:  -8, why: 'Deux pivots dans l\'axe = saturation' },
    { pair: ['anchor', 'anchor'],            score:  -6, why: 'Deux sentinelles côte à côte = milieu trop bas' },
    { pair: ['playmaker', 'playmaker'],      score:  -4, why: 'Deux organisateurs sur la même zone = redondance' },
    { pair: ['runner', 'runner'],            score:  -3, why: 'Deux courses identiques peuvent s\'annuler' },
    { pair: ['dribbler', 'dribbler'],        score:  -2, why: 'Deux dribbleurs sans relais = jeu prévisible' },
    { pair: ['presser', 'anchor'],           score:   0, why: '' }, // pas de conflit
  ];

  // -------- Zones préférentielles --------
  // Modèle simple : couloir × profondeur (sera enrichi en A.3)
  //   Couloirs : 'left' (gauche), 'left-half' (demi-espace gauche),
  //              'axis' (axe), 'right-half', 'right'
  //   Profondeur : 'def' (def. tier), 'mid', 'att' (att. tier), 'box' (surface adverse)
  // Une zone = "couloir-profondeur" (ex. 'left-att')

  // -------- Dictionnaire des rôles enrichis --------
  const ROLES = {
    // ============================================================
    // GARDIENS
    // ============================================================
    GK_classic: {
      label: 'Gardien classique',
      family: 'GK',
      slotsCompat: ['GK'],
      summary: 'Reste dans sa surface, lit le danger, dégage simple.',
      idealAttributes: { finishing:5, dribbling:25, vision:55, passingLong:70, passingShort:62, duel:55, interception:88, anticipation:90, speed:38, stamina:55, power:72, intelligence:80 },
      traits: ['anchor', 'distributor'],
      preferredZones: ['axis-def'],
      behavior: { posDx:0, posDy:0, aggr:35, risk:25, off:10 },
    },
    GK_sweeper: {
      label: 'Gardien libéro',
      family: 'GK',
      slotsCompat: ['GK'],
      summary: 'Sort haut, relance court ou long, joue 11ᵉ homme.',
      idealAttributes: { finishing:8, dribbling:42, vision:75, passingLong:85, passingShort:82, duel:55, interception:85, anticipation:88, speed:50, stamina:60, power:70, intelligence:85 },
      traits: ['sweeper', 'distributor', 'playmaker'],
      preferredZones: ['axis-def', 'axis-mid'],
      behavior: { posDx:0, posDy:-8, aggr:55, risk:55, off:25 },
    },

    // ============================================================
    // DÉFENSEURS CENTRAUX
    // ============================================================
    CB_stopper: {
      label: 'Stoppeur',
      family: 'CB',
      slotsCompat: ['CB'],
      summary: 'Anticipe haut sur l\'attaquant, agressif au duel.',
      idealAttributes: { finishing:22, dribbling:38, vision:50, passingLong:60, passingShort:62, duel:92, interception:88, anticipation:88, speed:62, stamina:78, power:88, intelligence:78 },
      traits: ['stopper', 'marker', 'presser'],
      preferredZones: ['axis-def', 'axis-mid'],
      behavior: { posDx:0, posDy:8, aggr:78, risk:35, off:15 },
    },
    CB_classic: {
      label: 'Défenseur axial',
      family: 'CB',
      slotsCompat: ['CB'],
      summary: 'Tient sa zone, dégage propre, lecture solide.',
      idealAttributes: { finishing:22, dribbling:40, vision:50, passingLong:62, passingShort:65, duel:88, interception:85, anticipation:82, speed:55, stamina:75, power:85, intelligence:75 },
      traits: ['marker', 'distributor'],
      preferredZones: ['axis-def'],
      behavior: { posDx:0, posDy:0, aggr:50, risk:30, off:15 },
    },
    CB_libero: {
      label: 'Libéro',
      family: 'CB',
      slotsCompat: ['CB'],
      summary: 'Sort balle au pied, casse les lignes, organise.',
      idealAttributes: { finishing:30, dribbling:65, vision:78, passingLong:75, passingShort:82, duel:78, interception:80, anticipation:80, speed:65, stamina:75, power:75, intelligence:88 },
      traits: ['sweeper', 'ball_carrier', 'playmaker', 'distributor'],
      preferredZones: ['axis-def', 'axis-mid'],
      behavior: { posDx:0, posDy:-6, aggr:55, risk:65, off:35 },
    },

    // ============================================================
    // LATÉRAUX
    // ============================================================
    LB_classic: {
      label: 'Latéral gauche',
      family: 'FB',
      slotsCompat: ['LB','LWB'],
      summary: 'Replié, soutien défensif, montées contrôlées.',
      idealAttributes: { finishing:38, dribbling:65, vision:60, passingLong:62, passingShort:70, duel:72, interception:68, anticipation:65, speed:80, stamina:88, power:65, intelligence:68 },
      traits: ['marker', 'wide'],
      preferredZones: ['left-def', 'left-mid'],
      behavior: { posDx:-3, posDy:6, aggr:55, risk:35, off:35 },
    },
    LB_wingback: {
      label: 'Piston gauche',
      family: 'FB',
      slotsCompat: ['LB','LWB'],
      summary: 'Monte haut, centre, dépasse l\'ailier.',
      idealAttributes: { finishing:45, dribbling:75, vision:68, passingLong:65, passingShort:72, duel:62, interception:55, anticipation:60, speed:88, stamina:95, power:65, intelligence:70 },
      traits: ['overlapping', 'wide', 'runner'],
      preferredZones: ['left-mid', 'left-att'],
      behavior: { posDx:-2, posDy:-12, aggr:55, risk:55, off:75 },
    },
    LB_inverted: {
      label: 'Latéral inversé',
      family: 'FB',
      slotsCompat: ['LB','LWB'],
      summary: 'Rentre à l\'intérieur, relais milieu en construction.',
      idealAttributes: { finishing:42, dribbling:70, vision:78, passingLong:70, passingShort:82, duel:65, interception:60, anticipation:65, speed:75, stamina:82, power:60, intelligence:82 },
      traits: ['underlapping', 'half_space', 'playmaker', 'ball_carrier'],
      preferredZones: ['left-half-mid', 'axis-mid'],
      behavior: { posDx:8, posDy:-6, aggr:45, risk:60, off:55 },
    },
    RB_classic: {
      label: 'Latéral droit',
      family: 'FB',
      slotsCompat: ['RB','RWB'],
      summary: 'Replié, soutien défensif, montées contrôlées.',
      idealAttributes: { finishing:38, dribbling:65, vision:60, passingLong:62, passingShort:70, duel:72, interception:68, anticipation:65, speed:80, stamina:88, power:65, intelligence:68 },
      traits: ['marker', 'wide'],
      preferredZones: ['right-def', 'right-mid'],
      behavior: { posDx:3, posDy:6, aggr:55, risk:35, off:35 },
    },
    RB_wingback: {
      label: 'Piston droit',
      family: 'FB',
      slotsCompat: ['RB','RWB'],
      summary: 'Monte haut, centre, dépasse l\'ailier.',
      idealAttributes: { finishing:45, dribbling:75, vision:68, passingLong:65, passingShort:72, duel:62, interception:55, anticipation:60, speed:88, stamina:95, power:65, intelligence:70 },
      traits: ['overlapping', 'wide', 'runner'],
      preferredZones: ['right-mid', 'right-att'],
      behavior: { posDx:2, posDy:-12, aggr:55, risk:55, off:75 },
    },
    RB_inverted: {
      label: 'Latéral inversé',
      family: 'FB',
      slotsCompat: ['RB','RWB'],
      summary: 'Rentre à l\'intérieur, relais milieu en construction.',
      idealAttributes: { finishing:42, dribbling:70, vision:78, passingLong:70, passingShort:82, duel:65, interception:60, anticipation:65, speed:75, stamina:82, power:60, intelligence:82 },
      traits: ['underlapping', 'half_space', 'playmaker', 'ball_carrier'],
      preferredZones: ['right-half-mid', 'axis-mid'],
      behavior: { posDx:-8, posDy:-6, aggr:45, risk:60, off:55 },
    },

    // ============================================================
    // MILIEUX DÉFENSIFS
    // ============================================================
    DM_anchor: {
      label: 'Sentinelle',
      family: 'DM',
      slotsCompat: ['DM'],
      summary: 'Reste devant la défense, couvre les espaces.',
      idealAttributes: { finishing:35, dribbling:50, vision:75, passingLong:72, passingShort:78, duel:85, interception:88, anticipation:88, speed:55, stamina:82, power:75, intelligence:88 },
      traits: ['anchor', 'ball_winner'],
      preferredZones: ['axis-mid', 'axis-def'],
      behavior: { posDx:0, posDy:6, aggr:65, risk:25, off:15 },
    },
    DM_regista: {
      label: 'Régisseur',
      family: 'DM',
      slotsCompat: ['DM','CM'],
      summary: 'Tempo bas, longues ouvertures, sang-froid.',
      idealAttributes: { finishing:42, dribbling:55, vision:90, passingLong:88, passingShort:90, duel:65, interception:70, anticipation:78, speed:55, stamina:78, power:60, intelligence:92 },
      traits: ['playmaker', 'distributor', 'link_up'],
      preferredZones: ['axis-mid', 'axis-def'],
      behavior: { posDx:0, posDy:2, aggr:40, risk:75, off:35 },
    },
    DM_destroyer: {
      label: 'Récupérateur',
      family: 'DM',
      slotsCompat: ['DM'],
      summary: 'Coupe les transitions adverses sans pitié.',
      idealAttributes: { finishing:30, dribbling:50, vision:62, passingLong:65, passingShort:75, duel:92, interception:90, anticipation:85, speed:65, stamina:85, power:85, intelligence:78 },
      traits: ['ball_winner', 'presser', 'anchor'],
      preferredZones: ['axis-mid'],
      behavior: { posDx:0, posDy:0, aggr:85, risk:25, off:20 },
    },

    // ============================================================
    // MILIEUX CENTRAUX
    // ============================================================
    CM_box: {
      label: 'Box-to-box',
      family: 'CM',
      slotsCompat: ['CM','DM'],
      summary: 'Couvre 60m, surface à surface.',
      idealAttributes: { finishing:65, dribbling:70, vision:75, passingLong:70, passingShort:80, duel:75, interception:72, anticipation:72, speed:72, stamina:95, power:70, intelligence:78 },
      traits: ['runner', 'ball_winner', 'box_crasher'],
      preferredZones: ['axis-mid', 'axis-att', 'axis-def'],
      behavior: { posDx:0, posDy:0, aggr:65, risk:55, off:60 },
    },
    CM_deeplying: {
      label: 'Milieu reculé',
      family: 'CM',
      slotsCompat: ['CM','DM'],
      summary: 'Tempo bas du milieu, lance le jeu.',
      idealAttributes: { finishing:55, dribbling:62, vision:82, passingLong:75, passingShort:88, duel:65, interception:70, anticipation:72, speed:58, stamina:82, power:60, intelligence:85 },
      traits: ['playmaker', 'distributor', 'link_up'],
      preferredZones: ['axis-mid'],
      behavior: { posDx:0, posDy:3, aggr:45, risk:60, off:30 },
    },
    CM_carrilero: {
      label: 'Relayeur',
      family: 'CM',
      slotsCompat: ['CM'],
      summary: 'Côté, supporte le couloir, soutient.',
      idealAttributes: { finishing:55, dribbling:68, vision:72, passingLong:65, passingShort:78, duel:62, interception:62, anticipation:65, speed:72, stamina:85, power:60, intelligence:75 },
      traits: ['link_up', 'wide', 'runner'],
      preferredZones: ['left-mid', 'axis-mid'],
      behavior: { posDx:8, posDy:-2, aggr:55, risk:50, off:50 },
    },
    CM_mezzala: {
      label: 'Mezzala',
      family: 'CM',
      slotsCompat: ['CM','AM'],
      summary: 'Couloir intérieur, casse les lignes par le demi-espace.',
      idealAttributes: { finishing:72, dribbling:78, vision:80, passingLong:72, passingShort:85, duel:60, interception:60, anticipation:68, speed:75, stamina:85, power:65, intelligence:82 },
      traits: ['half_space', 'ball_carrier', 'creator', 'box_crasher'],
      preferredZones: ['left-half-mid', 'right-half-mid', 'left-half-att', 'right-half-att'],
      behavior: { posDx:-5, posDy:-8, aggr:55, risk:65, off:65 },
    },

    // ============================================================
    // MILIEUX OFFENSIFS
    // ============================================================
    AM_classic: {
      label: 'Meneur classique',
      family: 'AM',
      slotsCompat: ['AM'],
      summary: 'Entre les lignes, dernière passe.',
      idealAttributes: { finishing:72, dribbling:78, vision:90, passingLong:75, passingShort:90, duel:48, interception:50, anticipation:65, speed:70, stamina:75, power:50, intelligence:90 },
      traits: ['playmaker', 'creator', 'half_space'],
      preferredZones: ['axis-att', 'left-half-att', 'right-half-att'],
      behavior: { posDx:0, posDy:-4, aggr:40, risk:70, off:65 },
    },
    AM_shadow: {
      label: 'Second attaquant',
      family: 'AM',
      slotsCompat: ['AM','SS'],
      summary: 'Joue dans le dos du 9, finition aussi.',
      idealAttributes: { finishing:85, dribbling:78, vision:78, passingLong:65, passingShort:78, duel:55, interception:50, anticipation:80, speed:80, stamina:78, power:62, intelligence:82 },
      traits: ['finisher', 'runner', 'box_crasher', 'space_creator'],
      preferredZones: ['axis-att', 'axis-box'],
      behavior: { posDx:0, posDy:-12, aggr:45, risk:65, off:80 },
    },
    AM_trequart: {
      label: 'Trequartista',
      family: 'AM',
      slotsCompat: ['AM'],
      summary: 'Liberté totale, créativité absolue.',
      idealAttributes: { finishing:75, dribbling:88, vision:92, passingLong:78, passingShort:92, duel:42, interception:42, anticipation:62, speed:68, stamina:72, power:48, intelligence:92 },
      traits: ['creator', 'dribbler', 'playmaker', 'half_space'],
      preferredZones: ['axis-att', 'left-half-att', 'right-half-att'],
      behavior: { posDx:5, posDy:-6, aggr:35, risk:80, off:60 },
    },

    // ============================================================
    // AILES
    // ============================================================
    LW_winger: {
      label: 'Ailier de débordement',
      family: 'W',
      slotsCompat: ['LW','LM'],
      summary: 'Profondeur ligne de touche, centres.',
      idealAttributes: { finishing:72, dribbling:88, vision:70, passingLong:65, passingShort:78, duel:48, interception:45, anticipation:55, speed:92, stamina:80, power:55, intelligence:75 },
      traits: ['wide', 'dribbler', 'runner', 'creator'],
      preferredZones: ['left-att', 'left-mid'],
      behavior: { posDx:-8, posDy:-8, aggr:55, risk:55, off:75 },
    },
    LW_inverted: {
      label: 'Ailier inversé',
      family: 'W',
      slotsCompat: ['LW'],
      summary: 'Rentre, frappe du pied opposé.',
      idealAttributes: { finishing:85, dribbling:85, vision:75, passingLong:60, passingShort:78, duel:45, interception:42, anticipation:72, speed:82, stamina:78, power:62, intelligence:80 },
      traits: ['finisher', 'dribbler', 'half_space', 'box_crasher'],
      preferredZones: ['left-half-att', 'axis-att'],
      behavior: { posDx:5, posDy:-10, aggr:50, risk:65, off:75 },
    },
    LW_inside: {
      label: 'Ailier intérieur',
      family: 'W',
      slotsCompat: ['LW','LM'],
      summary: 'Joue plus proche du 10 que de la ligne.',
      idealAttributes: { finishing:70, dribbling:80, vision:82, passingLong:65, passingShort:85, duel:48, interception:48, anticipation:62, speed:75, stamina:80, power:55, intelligence:82 },
      traits: ['half_space', 'creator', 'link_up'],
      preferredZones: ['left-half-mid', 'left-half-att', 'axis-att'],
      behavior: { posDx:8, posDy:-5, aggr:45, risk:65, off:60 },
    },
    RW_winger: {
      label: 'Ailier de débordement',
      family: 'W',
      slotsCompat: ['RW','RM'],
      summary: 'Profondeur ligne de touche, centres.',
      idealAttributes: { finishing:72, dribbling:88, vision:70, passingLong:65, passingShort:78, duel:48, interception:45, anticipation:55, speed:92, stamina:80, power:55, intelligence:75 },
      traits: ['wide', 'dribbler', 'runner', 'creator'],
      preferredZones: ['right-att', 'right-mid'],
      behavior: { posDx:8, posDy:-8, aggr:55, risk:55, off:75 },
    },
    RW_inverted: {
      label: 'Ailier inversé',
      family: 'W',
      slotsCompat: ['RW'],
      summary: 'Rentre, frappe du pied opposé.',
      idealAttributes: { finishing:85, dribbling:85, vision:75, passingLong:60, passingShort:78, duel:45, interception:42, anticipation:72, speed:82, stamina:78, power:62, intelligence:80 },
      traits: ['finisher', 'dribbler', 'half_space', 'box_crasher'],
      preferredZones: ['right-half-att', 'axis-att'],
      behavior: { posDx:-5, posDy:-10, aggr:50, risk:65, off:75 },
    },
    RW_inside: {
      label: 'Ailier intérieur',
      family: 'W',
      slotsCompat: ['RW','RM'],
      summary: 'Joue plus proche du 10 que de la ligne.',
      idealAttributes: { finishing:70, dribbling:80, vision:82, passingLong:65, passingShort:85, duel:48, interception:48, anticipation:62, speed:75, stamina:80, power:55, intelligence:82 },
      traits: ['half_space', 'creator', 'link_up'],
      preferredZones: ['right-half-mid', 'right-half-att', 'axis-att'],
      behavior: { posDx:-8, posDy:-5, aggr:45, risk:65, off:60 },
    },
    LM_classic: {
      label: 'Milieu gauche',
      family: 'W',
      slotsCompat: ['LM'],
      summary: 'Couvre tout le côté, replie aussi.',
      idealAttributes: { finishing:62, dribbling:75, vision:72, passingLong:65, passingShort:78, duel:58, interception:58, anticipation:60, speed:78, stamina:88, power:58, intelligence:75 },
      traits: ['wide', 'runner', 'link_up'],
      preferredZones: ['left-mid', 'left-att'],
      behavior: { posDx:-3, posDy:-3, aggr:50, risk:50, off:55 },
    },
    RM_classic: {
      label: 'Milieu droit',
      family: 'W',
      slotsCompat: ['RM'],
      summary: 'Couvre tout le côté, replie aussi.',
      idealAttributes: { finishing:62, dribbling:75, vision:72, passingLong:65, passingShort:78, duel:58, interception:58, anticipation:60, speed:78, stamina:88, power:58, intelligence:75 },
      traits: ['wide', 'runner', 'link_up'],
      preferredZones: ['right-mid', 'right-att'],
      behavior: { posDx:3, posDy:-3, aggr:50, risk:50, off:55 },
    },

    // ============================================================
    // ATTAQUANTS
    // ============================================================
    ST_classic: {
      label: 'Numéro 9 classique',
      family: 'ST',
      slotsCompat: ['ST','CF'],
      summary: 'Point de fixation, finition.',
      idealAttributes: { finishing:90, dribbling:68, vision:65, passingLong:50, passingShort:68, duel:78, interception:35, anticipation:88, speed:78, stamina:75, power:82, intelligence:80 },
      traits: ['finisher', 'target_man'],
      preferredZones: ['axis-att', 'axis-box'],
      behavior: { posDx:0, posDy:-15, aggr:55, risk:55, off:90 },
    },
    ST_false9: {
      label: 'Faux 9',
      family: 'ST',
      slotsCompat: ['ST','CF'],
      summary: 'Décroche, libère les espaces.',
      idealAttributes: { finishing:72, dribbling:82, vision:88, passingLong:68, passingShort:90, duel:55, interception:48, anticipation:75, speed:72, stamina:78, power:55, intelligence:90 },
      traits: ['playmaker', 'space_creator', 'link_up', 'creator'],
      preferredZones: ['axis-att', 'axis-mid'],
      behavior: { posDx:0, posDy:-4, aggr:40, risk:70, off:70 },
    },
    ST_target: {
      label: 'Pivot',
      family: 'ST',
      slotsCompat: ['ST','CF'],
      summary: 'Dos au but, jeu de remise, tête.',
      idealAttributes: { finishing:80, dribbling:55, vision:72, passingLong:60, passingShort:75, duel:88, interception:38, anticipation:82, speed:62, stamina:78, power:92, intelligence:78 },
      traits: ['target_man', 'link_up'],
      preferredZones: ['axis-att', 'axis-box'],
      behavior: { posDx:0, posDy:-12, aggr:55, risk:40, off:80 },
    },
    ST_poacher: {
      label: 'Renard des surfaces',
      family: 'ST',
      slotsCompat: ['ST','CF'],
      summary: 'Reste dans la surface, instinct pur.',
      idealAttributes: { finishing:95, dribbling:62, vision:60, passingLong:42, passingShort:60, duel:72, interception:32, anticipation:92, speed:75, stamina:65, power:78, intelligence:78 },
      traits: ['finisher'],
      preferredZones: ['axis-box', 'axis-att'],
      behavior: { posDx:0, posDy:-18, aggr:55, risk:35, off:95 },
    },
    CF_complete: {
      label: 'Avant-centre complet',
      family: 'ST',
      slotsCompat: ['CF','ST'],
      summary: 'Tout faire : décrocher, frapper, presser.',
      idealAttributes: { finishing:82, dribbling:75, vision:78, passingLong:62, passingShort:80, duel:78, interception:48, anticipation:82, speed:75, stamina:82, power:75, intelligence:85 },
      traits: ['finisher', 'link_up', 'target_man', 'presser'],
      preferredZones: ['axis-att', 'axis-box'],
      behavior: { posDx:0, posDy:-10, aggr:65, risk:60, off:78 },
    },
  };

  // ============================================================
  // === Fonctions analytiques (data-driven, pas de règle codée) ==
  // ============================================================

  // -------- Attribut-clé par trait --------
  // Pour chaque trait, l'attribut qui est INDISPENSABLE. Si le joueur est
  // faible sur celui-ci, le trait ne peut pas dépasser un certain plafond,
  // même si les autres attributs compensent. Évite qu'un attaquant rapide
  // soit considéré comme "ball_winner" parce qu'il court vite.
  const TRAIT_KEY_ATTR = {
    finisher:      'finishing',
    playmaker:     'vision',
    creator:       'vision',
    dribbler:      'dribbling',
    ball_carrier:  'dribbling',
    target_man:    'power',
    runner:        'speed',
    distributor:   'passingLong',
    ball_winner:   'interception',
    presser:       'stamina',
    anchor:        'interception',
    stopper:       'duel',
    sweeper:       'anticipation',
    marker:        'duel',
    wide:          'stamina',
    half_space:    'vision',
    link_up:       'passingShort',
    overlapping:   'stamina',
    underlapping:  'passingShort',
    space_creator: 'intelligence',
    box_crasher:   'anticipation',
  };

  // -------- Tier du joueur / rôle pour détecter les mismatchs majeurs --------
  // Un attaquant naturel ne peut pas jouer défenseur central sans une grosse
  // pénalité, même si ses attrs absolus sont bons. C'est une question de
  // "famille" tactique.
  const POSITION_TIER = {
    GK:  'DEF', CB:  'DEF', LB:  'DEF', RB:  'DEF', LWB: 'DEF', RWB: 'DEF',
    DM:  'MID', CM:  'MID', AM:  'MID', LM:  'MID', RM:  'MID',
    LW:  'ATT', RW:  'ATT', SS:  'ATT', CF:  'ATT', ST:  'ATT',
  };
  const ROLE_FAMILY_TIER = {
    GK: 'DEF', CB: 'DEF', FB: 'DEF',
    DM: 'MID', CM: 'MID', AM: 'MID', W: 'ATT',
    SS: 'ATT', ST: 'ATT', CF: 'ATT',
  };

  // -------- Définition des traits comme formules d'attributs --------
  // Chaque trait est une combinaison pondérée d'attributs (data-driven).
  // Permet de calculer "à quel point un joueur EST ce trait", 0-100.
  const TRAIT_FORMULAS = {
    finisher:      { finishing: 0.55, anticipation: 0.25, power: 0.20 },
    playmaker:     { vision: 0.35, passingShort: 0.35, intelligence: 0.30 },
    creator:       { vision: 0.40, passingShort: 0.30, passingLong: 0.15, intelligence: 0.15 },
    dribbler:      { dribbling: 0.55, speed: 0.30, vision: 0.15 },
    ball_carrier:  { dribbling: 0.40, passingShort: 0.25, stamina: 0.20, intelligence: 0.15 },
    target_man:    { power: 0.40, duel: 0.30, finishing: 0.20, stamina: 0.10 },
    runner:        { speed: 0.45, stamina: 0.30, anticipation: 0.25 },
    distributor:   { passingLong: 0.40, passingShort: 0.30, intelligence: 0.30 },
    ball_winner:   { interception: 0.40, duel: 0.30, anticipation: 0.20, stamina: 0.10 },
    presser:       { stamina: 0.35, speed: 0.20, duel: 0.25, intelligence: 0.20 },
    anchor:        { interception: 0.30, anticipation: 0.30, intelligence: 0.25, duel: 0.15 },
    stopper:       { duel: 0.35, anticipation: 0.30, power: 0.20, intelligence: 0.15 },
    sweeper:       { anticipation: 0.35, intelligence: 0.30, speed: 0.20, interception: 0.15 },
    marker:        { duel: 0.40, anticipation: 0.30, stamina: 0.15, intelligence: 0.15 },
    wide:          { stamina: 0.40, speed: 0.30, dribbling: 0.20, passingShort: 0.10 },
    half_space:    { vision: 0.30, dribbling: 0.25, passingShort: 0.25, intelligence: 0.20 },
    link_up:       { passingShort: 0.35, vision: 0.30, intelligence: 0.25, duel: 0.10 },
    overlapping:   { stamina: 0.40, speed: 0.30, passingShort: 0.20, dribbling: 0.10 },
    underlapping:  { passingShort: 0.30, dribbling: 0.25, intelligence: 0.25, vision: 0.20 },
    space_creator: { intelligence: 0.40, vision: 0.30, anticipation: 0.20, stamina: 0.10 },
    box_crasher:   { anticipation: 0.30, finishing: 0.25, stamina: 0.25, speed: 0.20 },
  };

  /**
   * traitScores(attrs) → { finisher: 87, playmaker: 32, … }
   * Pour chaque trait, calcule à quel point le joueur l'incarne (0-100).
   * Plafonné par l'attribut-clé : un joueur faible sur l'attribut-clé du
   * trait ne peut pas dépasser keyAttr + 10, même si les autres compensent.
   */
  function traitScores(attrs) {
    if (!attrs) return {};
    const out = {};
    Object.entries(TRAIT_FORMULAS).forEach(([trait, formula]) => {
      let sum = 0;
      Object.entries(formula).forEach(([attr, weight]) => {
        sum += (attrs[attr] || 0) * weight;
      });
      let score = sum;
      // Plafond par attribut-clé
      const keyAttr = TRAIT_KEY_ATTR[trait];
      if (keyAttr) {
        const keyVal = attrs[keyAttr] || 0;
        const ceiling = keyVal + 10;  // tolérance modérée
        score = Math.min(score, ceiling);
      }
      out[trait] = Math.round(score);
    });
    return out;
  }

  /**
   * naturalTraits(attrs) → [trait1, trait2…]
   * Top-N traits du joueur (seuil 72 minimum, max 5 traits).
   * Utilisé pour l'analyse synergies + affichage UI.
   */
  function naturalTraits(attrs, opts) {
    opts = opts || {};
    const threshold = opts.threshold || 72;
    const maxN = opts.maxN || 5;
    const scores = traitScores(attrs);
    return Object.entries(scores)
      .filter(([_, s]) => s >= threshold)
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxN)
      .map(([t, _]) => t);
  }

  /**
   * fitScore(player, roleKey) → { score, attrFit, styleFit, weakAttrs, weakTraits, strongTraits, role }
   * Combine 2 dimensions :
   *   - attrFit  : adéquation des attributs au profil idéal du rôle (pondéré)
   *   - styleFit : recouvrement entre traits naturels et traits requis du rôle
   * Le score final pèse 60% attributs + 40% style.
   */
  function fitScore(player, roleKey) {
    const role = ROLES[roleKey];
    if (!role || !player) return null;
    const attrs = window.Drafter && window.Drafter.Attributes
      ? window.Drafter.Attributes.build(player)
      : null;
    if (!attrs) return null;

    // === 1) Adéquation attributs ===
    let weightedSum = 0;
    let weightTotal = 0;
    const gaps = [];
    Object.entries(role.idealAttributes).forEach(([attr, ideal]) => {
      const actual = attrs[attr] || 0;
      const weight = Math.pow(ideal / 100, 1.4);  // les attributs critiques pèsent plus lourd
      // Pénalité quadratique sur le déficit (gap)
      const deficit = Math.max(0, ideal - actual);
      const fit = 1 - Math.pow(deficit / 45, 1.5);
      weightedSum += Math.max(0, Math.min(1, fit)) * weight;
      weightTotal += weight;
      gaps.push({ attr, ideal, actual, gap: deficit, weight });
    });
    const attrFit = weightTotal > 0 ? (weightedSum / weightTotal) * 100 : 0;

    // === 2) Adéquation de style (traits SCORÉS) ===
    // Approche "deficit cumulé sous seuil 82" : chaque trait requis doit être à
    // 82+ chez le joueur. En-dessous, le déficit s'accumule et plombe le score.
    // Un Haaland avec creator=70 et space_creator=75 va clairement chuter sur
    // un rôle de faux 9 qui demande ces deux traits.
    const TRAIT_BAR = 82;          // niveau attendu sur un trait requis
    const PENALTY_COEF = 1.5;      // amplificateur du déficit
    const scores = traitScores(attrs);
    const required = role.traits || [];
    let deficitTotal = 0, weakTraits = [], strongTraits = [];
    required.forEach(t => {
      const s = scores[t] || 0;
      const d = Math.max(0, TRAIT_BAR - s);
      deficitTotal += d;
      if (s < 65) weakTraits.push({ trait: t, score: s });
      else if (s >= 85) strongTraits.push({ trait: t, score: s });
    });
    const styleFit = required.length > 0
      ? Math.max(15, 100 - deficitTotal * PENALTY_COEF)
      : 70;

    // === 3) Pénalité mismatch tier (offensif vs défensif vs milieu) ===
    // Un joueur naturellement offensif placé en rôle défensif → grosse pénalité,
    // même si ses attributs sont bons. C'est une question de famille tactique.
    const playerPos = (player.posMain && player.posMain[0]) || (player.positions && player.positions[0]) || 'CM';
    const playerTier = POSITION_TIER[playerPos] || 'MID';
    const roleTier = ROLE_FAMILY_TIER[role.family] || 'MID';
    let tierPenalty = 0;
    if (playerTier !== roleTier) {
      // Distance entre tiers : DEF-MID = 1, DEF-ATT = 2, MID-ATT = 1
      const dist = (playerTier === 'DEF' && roleTier === 'ATT') ||
                   (playerTier === 'ATT' && roleTier === 'DEF') ? 2 : 1;
      tierPenalty = dist === 2 ? 22 : 10;
    }

    // === 4) Score combiné (attrs 40%, style 60%, - tier penalty) ===
    const score = Math.max(15, Math.round(attrFit * 0.4 + styleFit * 0.6 - tierPenalty));

    const weakAttrs = gaps.filter(g => g.weight > 0.5 && g.gap > 7)
                          .sort((a,b) => b.gap*b.weight - a.gap*a.weight)
                          .slice(0, 3);
    return {
      score,
      attrFit: Math.round(attrFit),
      styleFit: Math.round(styleFit),
      tierPenalty,
      weakAttrs,
      weakTraits,
      strongTraits,
      naturalTraits: naturalTraits(attrs),
      traitScores: scores,
      role,
    };
  }

  /**
   * synergies(roleKeys[]) → [{pair, score, why}]
   * Détecte automatiquement les synergies et conflits entre rôles d'une équipe.
   * Basé sur TRAIT_SYNERGIES qui est une matrice data-driven.
   */
  function synergies(roleKeys) {
    if (!roleKeys || !roleKeys.length) return { positive: [], negative: [], totalScore: 0 };
    // Liste des traits par rôle assigné
    const presence = {};  // trait -> [roleKeys qui l'ont]
    roleKeys.forEach(rk => {
      const role = ROLES[rk]; if (!role) return;
      (role.traits || []).forEach(t => {
        (presence[t] = presence[t] || []).push(rk);
      });
    });
    const positive = [];
    const negative = [];
    let totalScore = 0;
    TRAIT_SYNERGIES.forEach(syn => {
      const [a, b] = syn.pair;
      if (a === b) {
        // synergie sur une paire de même trait : nombre d'occurrences > 1 → applique
        const ks = presence[a] || [];
        if (ks.length > 1) {
          const count = ks.length;
          // applique syn.score × (count - 1) — chaque doublon pèse
          for (let i = 0; i < count - 1; i++) {
            const entry = { pair: [a, a], score: syn.score, why: syn.why, roles: ks };
            (syn.score >= 0 ? positive : negative).push(entry);
            totalScore += syn.score;
          }
        }
      } else {
        const ksA = presence[a] || [];
        const ksB = presence[b] || [];
        if (ksA.length && ksB.length) {
          // applique syn.score une fois si les deux traits présents
          const entry = { pair: [a, b], score: syn.score, why: syn.why, roles: [...ksA, ...ksB] };
          (syn.score >= 0 ? positive : negative).push(entry);
          totalScore += syn.score;
        }
      }
    });
    return { positive, negative, totalScore };
  }

  /**
   * defaultRoleFor(player, slotType) → roleKey
   * Choisit automatiquement le meilleur rôle pour le joueur sur ce slot.
   * Stratégie : fitScore() sur tous les rôles compatibles → choisit le max.
   */
  function defaultRoleFor(player, slotType) {
    const candidates = rolesForSlot(slotType);
    if (!candidates.length) return null;
    let best = null, bestScore = -1;
    candidates.forEach(rk => {
      const fit = fitScore(player, rk);
      if (fit && fit.score > bestScore) { best = rk; bestScore = fit.score; }
    });
    return best;
  }

  /** rolesForSlot(slotType) → [roleKey] */
  function rolesForSlot(slotType) {
    return Object.entries(ROLES)
      .filter(([_, r]) => (r.slotsCompat || []).includes(slotType))
      .map(([k, _]) => k);
  }

  /** roleByKey(key) → role | null */
  function roleByKey(key) { return ROLES[key] || null; }

  // -------- Export public --------
  window.Drafter = window.Drafter || {};
  window.Drafter.Roles = {
    ROLES,
    TRAITS,
    TRAIT_SYNERGIES,
    fitScore,
    synergies,
    defaultRoleFor,
    rolesForSlot,
    roleByKey,
    naturalTraits,
    traitScores,
    TRAIT_FORMULAS,
  };
})();
