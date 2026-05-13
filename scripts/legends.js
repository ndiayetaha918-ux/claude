// Drafter — Mode Légendes
// Joueurs pris dans leur prime (estimations cohérentes avec le marché actuel)
// Photos : Wikipedia Commons URLs stables

window.LEGENDS = [
  // ============ TOP TIER GOAT ============
  { id: 'pele', name: 'Pelé', age: 25, nat: 'Brazil', club: 'Santos FC', league: 'Légendes', value: 250, positions: ['CF','AM','SS'], former: ['New York Cosmos'],
    photo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Edson_Arantes_Pel%C3%A9_-_1960.jpg/220px-Edson_Arantes_Pel%C3%A9_-_1960.jpg' },
  { id: 'maradona', name: 'Diego Maradona', age: 26, nat: 'Argentina', club: 'SSC Napoli', league: 'Légendes', value: 240, positions: ['AM','SS','CF'], former: ['Boca Juniors','FC Barcelona','Sevilla','Newell\'s'],
    photo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Maradona-Mundial_86_con_la_copa.JPG/220px-Maradona-Mundial_86_con_la_copa.JPG' },
  { id: 'messi', name: 'Lionel Messi (prime)', age: 27, nat: 'Argentina', club: 'FC Barcelona', league: 'Légendes', value: 280, positions: ['RW','CF','AM','SS'], former: ['Paris SG','Inter Miami'],
    photo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Lionel_Messi_20180626_%28cropped%29.jpg/220px-Lionel_Messi_20180626_%28cropped%29.jpg' },
  { id: 'cr7', name: 'Cristiano Ronaldo (prime)', age: 28, nat: 'Portugal', club: 'Real Madrid', league: 'Légendes', value: 260, positions: ['LW','CF','ST','RW'], former: ['Manchester United','Sporting CP','Juventus','Al-Nassr'],
    photo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Cristiano_Ronaldo_2018.jpg/220px-Cristiano_Ronaldo_2018.jpg' },
  { id: 'cruyff', name: 'Johan Cruyff', age: 27, nat: 'Netherlands', club: 'FC Barcelona', league: 'Légendes', value: 220, positions: ['CF','AM','LW'], former: ['Ajax','LA Aztecs'],
    photo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Cruyff_voetbalt_in_Wenen%2C_Bestanddeelnr_927-3535_%28cropped%29.jpg/220px-Cruyff_voetbalt_in_Wenen%2C_Bestanddeelnr_927-3535_%28cropped%29.jpg' },

  // ============ MILIEUX LÉGENDAIRES ============
  { id: 'zidane', name: 'Zinedine Zidane', age: 28, nat: 'France', club: 'Real Madrid', league: 'Légendes', value: 200, positions: ['AM','CM','SS'], former: ['Juventus','Bordeaux','Cannes'],
    photo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Zinedine_Zidane_by_Tasnim_03.jpg/220px-Zinedine_Zidane_by_Tasnim_03.jpg' },
  { id: 'platini', name: 'Michel Platini', age: 28, nat: 'France', club: 'Juventus', league: 'Légendes', value: 180, positions: ['AM','CM','SS'], former: ['Saint-Étienne','Nancy'] },
  { id: 'iniesta', name: 'Andrés Iniesta', age: 28, nat: 'Spain', club: 'FC Barcelona', league: 'Légendes', value: 170, positions: ['AM','CM','LW'], former: ['Vissel Kobe'] },
  { id: 'xavi', name: 'Xavi Hernández', age: 28, nat: 'Spain', club: 'FC Barcelona', league: 'Légendes', value: 160, positions: ['CM','DM','AM'], former: ['Al Sadd'] },
  { id: 'pirlo', name: 'Andrea Pirlo', age: 30, nat: 'Italy', club: 'Juventus', league: 'Légendes', value: 130, positions: ['DM','CM','AM'], former: ['AC Milan','Inter Milan','Brescia'] },
  { id: 'kaka', name: 'Kaká', age: 27, nat: 'Brazil', club: 'AC Milan', league: 'Légendes', value: 180, positions: ['AM','CM','SS'], former: ['Real Madrid','Orlando City'] },
  { id: 'ronaldinho', name: 'Ronaldinho', age: 25, nat: 'Brazil', club: 'FC Barcelona', league: 'Légendes', value: 220, positions: ['AM','LW','CF'], former: ['Paris SG','AC Milan','Atletico Mineiro'],
    photo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/eb/Ronaldinho_Gala.jpg/220px-Ronaldinho_Gala.jpg' },
  { id: 'beckham', name: 'David Beckham', age: 27, nat: 'England', club: 'Manchester United', league: 'Légendes', value: 130, positions: ['RM','CM','RW'], former: ['Real Madrid','LA Galaxy','Paris SG','AC Milan'] },
  { id: 'gerrard', name: 'Steven Gerrard', age: 28, nat: 'England', club: 'Liverpool', league: 'Légendes', value: 140, positions: ['CM','AM','DM'], former: ['LA Galaxy'] },
  { id: 'lampard', name: 'Frank Lampard', age: 28, nat: 'England', club: 'Chelsea', league: 'Légendes', value: 120, positions: ['CM','AM'], former: ['West Ham','Manchester City','New York City'] },
  { id: 'scholes', name: 'Paul Scholes', age: 28, nat: 'England', club: 'Manchester United', league: 'Légendes', value: 100, positions: ['CM','AM','DM'], former: [] },
  { id: 'vieira', name: 'Patrick Vieira', age: 27, nat: 'France', club: 'Arsenal', league: 'Légendes', value: 110, positions: ['DM','CM'], former: ['Juventus','Inter Milan','Manchester City'] },
  { id: 'modric_prime', name: 'Luka Modrić (prime)', age: 30, nat: 'Croatia', club: 'Real Madrid', league: 'Légendes', value: 150, positions: ['CM','AM','DM'], former: ['Tottenham','Dinamo Zagreb','AC Milan'] },
  { id: 'kroos_prime', name: 'Toni Kroos (prime)', age: 28, nat: 'Germany', club: 'Real Madrid', league: 'Légendes', value: 130, positions: ['CM','DM','AM'], former: ['Bayern Munich','Bayer Leverkusen'] },

  // ============ ATTAQUANTS LÉGENDAIRES ============
  { id: 'r9', name: 'Ronaldo (R9)', age: 22, nat: 'Brazil', club: 'Inter Milan', league: 'Légendes', value: 230, positions: ['CF','ST','SS'], former: ['FC Barcelona','Real Madrid','AC Milan','PSV','Corinthians'],
    photo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Ronaldo_-_Ph%C3%A9nom%C3%A8ne_-_C%C3%B4te_d%27Ivoire_2007_%28cropped%29.jpg/220px-Ronaldo_-_Ph%C3%A9nom%C3%A8ne_-_C%C3%B4te_d%27Ivoire_2007_%28cropped%29.jpg' },
  { id: 'henry', name: 'Thierry Henry', age: 26, nat: 'France', club: 'Arsenal', league: 'Légendes', value: 180, positions: ['LW','CF','ST'], former: ['FC Barcelona','Juventus','Monaco','New York Red Bulls'],
    photo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Thierry_Henry_2018_%28cropped%29.jpg/220px-Thierry_Henry_2018_%28cropped%29.jpg' },
  { id: 'vanbasten', name: 'Marco van Basten', age: 25, nat: 'Netherlands', club: 'AC Milan', league: 'Légendes', value: 180, positions: ['CF','ST'], former: ['Ajax'] },
  { id: 'romario', name: 'Romário', age: 26, nat: 'Brazil', club: 'FC Barcelona', league: 'Légendes', value: 170, positions: ['CF','ST'], former: ['PSV','Flamengo','Vasco'] },
  { id: 'eusebio', name: 'Eusébio', age: 26, nat: 'Portugal', club: 'Benfica', league: 'Légendes', value: 180, positions: ['CF','RW','ST'], former: ['Boston Minutemen'] },
  { id: 'george_best', name: 'George Best', age: 25, nat: 'N. Ireland', club: 'Manchester United', league: 'Légendes', value: 170, positions: ['LW','RW','CF'], former: ['LA Aztecs'] },
  { id: 'drogba', name: 'Didier Drogba', age: 28, nat: 'Côte d\'Ivoire', club: 'Chelsea', league: 'Légendes', value: 130, positions: ['CF','ST'], former: ['Marseille','Galatasaray','Shanghai'] },
  { id: 'ibra', name: 'Zlatan Ibrahimović', age: 28, nat: 'Sweden', club: 'AC Milan', league: 'Légendes', value: 170, positions: ['CF','ST','SS'], former: ['Ajax','Inter Milan','FC Barcelona','Juventus','Paris SG','Manchester United','LA Galaxy'] },
  { id: 'suarez', name: 'Luis Suárez', age: 27, nat: 'Uruguay', club: 'FC Barcelona', league: 'Légendes', value: 160, positions: ['CF','ST','SS'], former: ['Liverpool','Ajax','Atlético Madrid','Inter Miami'] },
  { id: 'lewa_prime', name: 'Robert Lewandowski (prime)', age: 28, nat: 'Poland', club: 'Bayern Munich', league: 'Légendes', value: 170, positions: ['CF','ST'], former: ['Borussia Dortmund','FC Barcelona'] },
  { id: 'aguero', name: 'Sergio Agüero', age: 26, nat: 'Argentina', club: 'Manchester City', league: 'Légendes', value: 150, positions: ['CF','ST','SS'], former: ['Atlético Madrid','FC Barcelona'] },
  { id: 'cantona', name: 'Eric Cantona', age: 27, nat: 'France', club: 'Manchester United', league: 'Légendes', value: 130, positions: ['CF','SS','AM'], former: ['Marseille','Leeds','Auxerre'] },
  { id: 'bergkamp', name: 'Dennis Bergkamp', age: 27, nat: 'Netherlands', club: 'Arsenal', league: 'Légendes', value: 140, positions: ['SS','AM','CF'], former: ['Ajax','Inter Milan'] },
  { id: 'shevchenko', name: 'Andriy Shevchenko', age: 27, nat: 'Ukraine', club: 'AC Milan', league: 'Légendes', value: 150, positions: ['CF','ST'], former: ['Dynamo Kyiv','Chelsea'] },
  { id: 'rooney', name: 'Wayne Rooney', age: 26, nat: 'England', club: 'Manchester United', league: 'Légendes', value: 140, positions: ['CF','SS','AM','ST'], former: ['Everton','DC United'] },
  { id: 'benzema_prime', name: 'Karim Benzema (prime)', age: 30, nat: 'France', club: 'Real Madrid', league: 'Légendes', value: 130, positions: ['CF','ST','SS'], former: ['Lyon','Al-Ittihad'] },

  // ============ AILIERS / EXTRÊMES ============
  { id: 'hazard', name: 'Eden Hazard (prime)', age: 26, nat: 'Belgium', club: 'Chelsea', league: 'Légendes', value: 170, positions: ['LW','AM','RW','SS'], former: ['Lille','Real Madrid'],
    photo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/Eden_Hazard_in_2017.jpg/220px-Eden_Hazard_in_2017.jpg' },
  { id: 'ribery', name: 'Franck Ribéry', age: 27, nat: 'France', club: 'Bayern Munich', league: 'Légendes', value: 130, positions: ['LW','LM','AM'], former: ['Marseille','Fiorentina','Salernitana'] },
  { id: 'robben', name: 'Arjen Robben', age: 28, nat: 'Netherlands', club: 'Bayern Munich', league: 'Légendes', value: 130, positions: ['RW','LW','RM'], former: ['Chelsea','Real Madrid','PSV'] },
  { id: 'bale', name: 'Gareth Bale', age: 25, nat: 'Wales', club: 'Real Madrid', league: 'Légendes', value: 160, positions: ['RW','LW','LM','LB','CF'], former: ['Tottenham','LAFC'] },
  { id: 'figo', name: 'Luís Figo', age: 28, nat: 'Portugal', club: 'Real Madrid', league: 'Légendes', value: 150, positions: ['RW','RM','AM'], former: ['Sporting CP','FC Barcelona','Inter Milan'] },
  { id: 'roberto_carlos', name: 'Roberto Carlos', age: 26, nat: 'Brazil', club: 'Real Madrid', league: 'Légendes', value: 130, positions: ['LB','LM','LWB'], former: ['Inter Milan','Palmeiras','Corinthians'] },
  { id: 'cafu', name: 'Cafú', age: 28, nat: 'Brazil', club: 'AS Roma', league: 'Légendes', value: 110, positions: ['RB','RM','RWB'], former: ['São Paulo','AC Milan'] },
  { id: 'maicon', name: 'Maicon', age: 28, nat: 'Brazil', club: 'Inter Milan', league: 'Légendes', value: 90, positions: ['RB','RM','RWB'], former: ['Cruzeiro','Manchester City','Roma'] },
  { id: 'maldini', name: 'Paolo Maldini', age: 27, nat: 'Italy', club: 'AC Milan', league: 'Légendes', value: 140, positions: ['LB','CB','LWB'], former: [] },
  { id: 'baresi', name: 'Franco Baresi', age: 28, nat: 'Italy', club: 'AC Milan', league: 'Légendes', value: 110, positions: ['CB','DM'], former: [] },

  // ============ DÉFENSEURS LÉGENDAIRES ============
  { id: 'beckenbauer', name: 'Franz Beckenbauer', age: 27, nat: 'Germany', club: 'Bayern Munich', league: 'Légendes', value: 180, positions: ['CB','DM','CM'], former: ['New York Cosmos','Hamburger SV'] },
  { id: 'sergio_ramos', name: 'Sergio Ramos (prime)', age: 28, nat: 'Spain', club: 'Real Madrid', league: 'Légendes', value: 110, positions: ['CB','RB'], former: ['Sevilla','Paris SG','Sevilla (retour)'] },
  { id: 'pique', name: 'Gerard Piqué', age: 28, nat: 'Spain', club: 'FC Barcelona', league: 'Légendes', value: 90, positions: ['CB'], former: ['Manchester United','Real Zaragoza'] },
  { id: 'puyol', name: 'Carles Puyol', age: 28, nat: 'Spain', club: 'FC Barcelona', league: 'Légendes', value: 80, positions: ['CB','RB'], former: [] },
  { id: 'thuram', name: 'Lilian Thuram', age: 28, nat: 'France', club: 'Juventus', league: 'Légendes', value: 90, positions: ['CB','RB'], former: ['Parma','FC Barcelona','Monaco'] },
  { id: 'cannavaro', name: 'Fabio Cannavaro', age: 30, nat: 'Italy', club: 'Real Madrid', league: 'Légendes', value: 80, positions: ['CB'], former: ['Parma','Inter Milan','Juventus','Al-Ahli'] },
  { id: 'nesta', name: 'Alessandro Nesta', age: 28, nat: 'Italy', club: 'AC Milan', league: 'Légendes', value: 90, positions: ['CB'], former: ['Lazio','Montreal Impact'] },
  { id: 'terry', name: 'John Terry', age: 28, nat: 'England', club: 'Chelsea', league: 'Légendes', value: 80, positions: ['CB'], former: ['Aston Villa'] },
  { id: 'vidic', name: 'Nemanja Vidić', age: 27, nat: 'Serbia', club: 'Manchester United', league: 'Légendes', value: 70, positions: ['CB'], former: ['Inter Milan','Spartak Moscow'] },

  // ============ GARDIENS ============
  { id: 'buffon', name: 'Gianluigi Buffon', age: 30, nat: 'Italy', club: 'Juventus', league: 'Légendes', value: 90, positions: ['GK'], former: ['Parma','Paris SG'] },
  { id: 'casillas', name: 'Iker Casillas', age: 28, nat: 'Spain', club: 'Real Madrid', league: 'Légendes', value: 80, positions: ['GK'], former: ['Porto'] },
  { id: 'neuer_prime', name: 'Manuel Neuer (prime)', age: 28, nat: 'Germany', club: 'Bayern Munich', league: 'Légendes', value: 100, positions: ['GK'], former: ['Schalke 04'] },
  { id: 'kahn', name: 'Oliver Kahn', age: 30, nat: 'Germany', club: 'Bayern Munich', league: 'Légendes', value: 80, positions: ['GK'], former: ['Karlsruher SC'] },
  { id: 'lev_yashin', name: 'Lev Yashin', age: 30, nat: 'Soviet Union', club: 'Dynamo Moscow', league: 'Légendes', value: 80, positions: ['GK'], former: [] },

  // ============ RÉCENTS / RETIRED ============
  { id: 'iniesta', name: 'Andrés Iniesta', age: 30, nat: 'Spain', club: 'FC Barcelona', league: 'Légendes', value: 150, positions: ['CM','AM','LW'], former: ['Vissel Kobe','Emirates Club'] },
  { id: 'busquets', name: 'Sergio Busquets', age: 28, nat: 'Spain', club: 'FC Barcelona', league: 'Légendes', value: 110, positions: ['DM','CM'], former: ['Inter Miami'] },
  { id: 'alonso', name: 'Xabi Alonso', age: 28, nat: 'Spain', club: 'Real Madrid', league: 'Légendes', value: 90, positions: ['CM','DM'], former: ['Liverpool','Bayern Munich','Real Sociedad'] },
  { id: 'pirlo', name: 'Andrea Pirlo', age: 30, nat: 'Italy', club: 'Juventus', league: 'Légendes', value: 130, positions: ['DM','CM','AM'], former: ['AC Milan','Inter Milan','Brescia','New York City'] },
  { id: 'totti', name: 'Francesco Totti', age: 28, nat: 'Italy', club: 'AS Roma', league: 'Légendes', value: 130, positions: ['SS','AM','CF'], former: [] },
  { id: 'delpiero', name: 'Alessandro Del Piero', age: 28, nat: 'Italy', club: 'Juventus', league: 'Légendes', value: 130, positions: ['SS','AM','CF'], former: ['Sydney','Padova'] },
  { id: 'raul', name: 'Raúl', age: 27, nat: 'Spain', club: 'Real Madrid', league: 'Légendes', value: 130, positions: ['CF','SS','ST'], former: ['Schalke 04','Al Sadd','New York Cosmos'] },
];

// Dédoublonner par id (au cas où)
window.LEGENDS = window.LEGENDS.filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i);

console.log('[Drafter] Légendes chargées :', window.LEGENDS.length);
