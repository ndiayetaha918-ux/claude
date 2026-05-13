// Drafter — Mode Naruto
// Personnages avec postes/stats inspirés du lore (specs du user)

window.NARUTO = [
  // ===== Attaquants explosifs =====
  { id: 'naruto', name: 'Naruto Uzumaki', age: 17, nat: 'Konoha', club: 'Konoha', league: 'Naruto', value: 220, positions: ['ST','CF','LW'], former: [], emoji: '🦊',
    bio: 'Numéro 9 agressif au pressing, vif, finition de fou. Décisif dans les grands matches.' },
  { id: 'sasuke', name: 'Sasuke Uchiha', age: 17, nat: 'Konoha', club: 'Hawk', league: 'Naruto', value: 200, positions: ['LW','SS','RW','AM'], former: ['Konoha','Orochimaru'], emoji: '⚡',
    bio: 'Ailier inverti / second attaquant, tourne autour du 9, finition top.' },
  { id: 'minato', name: 'Minato Namikaze', age: 24, nat: 'Konoha', club: 'Konoha', league: 'Naruto', value: 230, positions: ['LW','RW','ST','AM'], former: [], emoji: '⚡',
    bio: 'Vitesse surnaturelle. Hokage de couloir : LW, RW, ST ou meneur.' },
  { id: 'madara', name: 'Madara Uchiha', age: 30, nat: 'Konoha', club: 'Akatsuki', league: 'Naruto', value: 210, positions: ['ST','CF','AM'], former: ['Konoha'], emoji: '🌑',
    bio: 'Buteur dominant, présence et puissance absolues.' },
  { id: 'obito', name: 'Obito Uchiha', age: 28, nat: 'Konoha', club: 'Akatsuki', league: 'Naruto', value: 150, positions: ['RW','AM','SS'], former: ['Konoha'], emoji: '🔥',
    bio: 'Ailier droit imprévisible, frappes lourdes.' },
  { id: 'killerbee', name: 'Killer Bee', age: 32, nat: 'Kumo', club: 'Kumo', league: 'Naruto', value: 130, positions: ['CF','ST','LW'], former: [], emoji: '🐝',
    bio: 'Pivot puissant, jeu dos au but, finition lyrique.' },
  { id: 'gaara', name: 'Gaara', age: 17, nat: 'Suna', club: 'Suna', league: 'Naruto', value: 110, positions: ['CB','DM'], former: [], emoji: '🏜️',
    bio: 'Défenseur central impassable. Bloc de sable.' },
  { id: 'rocklee', name: 'Rock Lee', age: 17, nat: 'Konoha', club: 'Konoha', league: 'Naruto', value: 95, positions: ['LM','RM','CM'], former: [], emoji: '🥋',
    bio: 'Volume de course, courage, dribble physique. Latéral offensif rêvé.' },

  // ===== Milieu / polyvalents =====
  { id: 'itachi', name: 'Itachi Uchiha', age: 21, nat: 'Konoha', club: 'Akatsuki', league: 'Naruto', value: 240, positions: ['CM','AM','DM','LW','RW'], former: ['Konoha'], emoji: '🪶',
    bio: 'Génie polyvalent. MDC, MOC, ailier des 2 côtés. Vision et finition.' },
  { id: 'kakashi', name: 'Kakashi Hatake', age: 27, nat: 'Konoha', club: 'Konoha', league: 'Naruto', value: 170, positions: ['CM','AM','DM','LM','RM','LW','RW','SS','CB'], former: [], emoji: '🐺',
    bio: 'Couteau-suisse. Peut jouer n\'importe où sur le terrain.' },
  { id: 'shikamaru', name: 'Shikamaru Nara', age: 17, nat: 'Konoha', club: 'Konoha', league: 'Naruto', value: 140, positions: ['DM','CM'], former: [], emoji: '🦌',
    bio: 'Cerveau du milieu. Pas le plus rapide mais lit toujours le jeu 2 temps avant.' },
  { id: 'neji', name: 'Neji Hyuga', age: 18, nat: 'Konoha', club: 'Konoha', league: 'Naruto', value: 90, positions: ['DM','CB'], former: [], emoji: '👁️',
    bio: 'Récupérateur et défenseur. Lecture du jeu via Byakugan.' },
  { id: 'jiraiya', name: 'Jiraiya', age: 50, nat: 'Konoha', club: 'Konoha', league: 'Naruto', value: 160, positions: ['CM','DM','CB'], former: [], emoji: '🐸',
    bio: 'Box-to-box infatigable. Peut aussi jouer 6 ou DC dans une formation à 3.' },
  { id: 'orochimaru', name: 'Orochimaru', age: 50, nat: 'Konoha', club: 'Oto', league: 'Naruto', value: 130, positions: ['CM','AM','SS'], former: ['Konoha','Akatsuki'], emoji: '🐍',
    bio: 'Créateur fourbe, MOC ou MDC offensif, dribble tout-terrain.' },
  { id: 'tsunade', name: 'Tsunade Senju', age: 50, nat: 'Konoha', club: 'Konoha', league: 'Naruto', value: 130, positions: ['DM','CB'], former: [], emoji: '🐌',
    bio: 'Sentinelle puissante. Couvre toute la largeur devant la défense.' },
  { id: 'konan', name: 'Konan', age: 30, nat: 'Ame', club: 'Akatsuki', league: 'Naruto', value: 85, positions: ['AM','LM','LW'], former: ['Konoha'], emoji: '📜',
    bio: 'Crochets, créations, jeu d\'origami. Milieu créatif de couloir.' },
  { id: 'pain', name: 'Pain (Nagato)', age: 30, nat: 'Ame', club: 'Akatsuki', league: 'Naruto', value: 200, positions: ['AM','CM','DM','SS'], former: [], emoji: '🌀',
    bio: 'Chef d\'orchestre, six positions à la fois. Distribution divine.' },
  { id: 'darui', name: 'Darui', age: 28, nat: 'Kumo', club: 'Kumo', league: 'Naruto', value: 75, positions: ['CM','DM','CB'], former: [], emoji: '⚡',
    bio: 'Milieu solide, frappes longues.' },

  // ===== Wingers / latéraux / extras =====
  { id: 'sasori', name: 'Sasori', age: 30, nat: 'Suna', club: 'Akatsuki', league: 'Naruto', value: 100, positions: ['CB','DM'], former: ['Suna'], emoji: '🎭',
    bio: 'Stratège défensif. Manipule les espaces.' },
  { id: 'deidara', name: 'Deidara', age: 22, nat: 'Iwa', club: 'Akatsuki', league: 'Naruto', value: 95, positions: ['LW','LM','AM'], former: ['Iwa'], emoji: '💥',
    bio: 'Ailier gauche explosif, frappes spectaculaires.' },
  { id: 'kisame', name: 'Kisame', age: 32, nat: 'Kiri', club: 'Akatsuki', league: 'Naruto', value: 95, positions: ['CB','DM','ST'], former: ['Kiri'], emoji: '🦈',
    bio: 'Bloc défensif costaud, peut monter en pointe sur coups de pied.' },
  { id: 'hidan', name: 'Hidan', age: 28, nat: 'Yu', club: 'Akatsuki', league: 'Naruto', value: 60, positions: ['ST','CF'], former: [], emoji: '⚔️',
    bio: 'Buteur fougueux, joue à la limite (cartons quasi garantis).' },
  { id: 'sakura', name: 'Sakura Haruno', age: 17, nat: 'Konoha', club: 'Konoha', league: 'Naruto', value: 70, positions: ['CB','DM','AM'], former: [], emoji: '🌸',
    bio: 'Tacle dévastateur, mais aussi vision créative.' },

  // ===== Légendes / CB / GK =====
  { id: 'hashirama', name: 'Hashirama Senju', age: 35, nat: 'Konoha', club: 'Konoha', league: 'Naruto', value: 200, positions: ['CB','DM'], former: [], emoji: '🌳',
    bio: 'Premier Hokage. Défenseur central indéplaçable, leader.' },
  { id: 'tobirama', name: 'Tobirama Senju', age: 35, nat: 'Konoha', club: 'Konoha', league: 'Naruto', value: 150, positions: ['CB','LB','DM'], former: [], emoji: '💧',
    bio: 'Défenseur tactique, vif, organisateur de la ligne.' },
  { id: 'hiruzen', name: 'Hiruzen Sarutobi', age: 55, nat: 'Konoha', club: 'Konoha', league: 'Naruto', value: 120, positions: ['GK'], former: [], emoji: '🦊',
    bio: 'Gardien sage, lecture totale, jeu au pied incroyable.' },
  { id: 'fugaku', name: 'Fugaku Uchiha', age: 38, nat: 'Konoha', club: 'Konoha', league: 'Naruto', value: 110, positions: ['GK'], former: [], emoji: '🎴',
    bio: 'Chef du clan Uchiha. Gardien autoritaire, présence aérienne.' },
  { id: 'a_raikage', name: 'A (Raikage)', age: 38, nat: 'Kumo', club: 'Kumo', league: 'Naruto', value: 95, positions: ['CB','RB','DM'], former: [], emoji: '⚡',
    bio: 'Latéral droit ultra rapide et puissant. Le bulldozer.' },
  { id: 'mei', name: 'Mei Terumi', age: 30, nat: 'Kiri', club: 'Kiri', league: 'Naruto', value: 80, positions: ['CB','LB'], former: [], emoji: '🌋',
    bio: 'Défenseur de bloc bas, frappe en cloche.' },
  { id: 'onoki', name: 'Onoki', age: 65, nat: 'Iwa', club: 'Iwa', league: 'Naruto', value: 60, positions: ['CB','GK'], former: [], emoji: '🗿',
    bio: 'Vétéran. Vision et placement, mais pas le plus vif.' },
];

window.NARUTO = window.NARUTO.filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i);
console.log('[Drafter] Naruto chargé :', window.NARUTO.length);
