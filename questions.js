'use strict';
// Les deux questionnaires. Les questions dépendantes (dep) n'apparaissent que si la condition est remplie.
const ON = ['Oui', 'Non'];
const ONS = ['Oui', 'Non', 'Ne sait pas'];
const ECH5 = ['Très bonne', 'Bonne', 'Moyenne', 'Mauvaise', 'Très mauvaise'];

function maker(p) {
  return function (num, sec, text, type, opts, o) {
    const q = Object.assign({ id: p + num, num: num, sec: sec || '', text: text, type: type, opts: (opts || []).slice() }, o || {});
    if (q.other) q.opts.push('Autre');
    return q;
  };
}

// ---------- Questionnaire A : eau potable et assainissement ----------
const a = maker('a');
const QA = [
  a('1', 'I. Identification du ménage', 'Sexe de l’enquêté(e)', 'single', ['Masculin', 'Féminin']),
  a('2', '', 'Âge (en années)', 'number'),
  a('3', '', 'Situation matrimoniale', 'single', ['Célibataire', 'Marié(e)', 'Veuf/Veuve', 'Séparé(e)']),
  a('4', '', 'Niveau d’instruction', 'single', ['Aucun', 'Primaire', 'Secondaire', 'Supérieur/Universitaire']),
  a('5', '', 'Activité principale', 'single', ['Agriculture', 'Commerce', 'Fonction publique', 'Secteur privé', 'Artisanat', 'Élevage'], { other: true }),
  a('6', '', 'Nombre de personnes vivant dans le ménage', 'number'),

  a('7', 'II. Accès à l’eau', 'Quelle est la principale source d’eau utilisée par votre ménage ?', 'single', ['Robinet', 'Source aménagée', 'Source non aménagée', 'Forage', 'Rivière', 'Eau de pluie']),
  a('8', '', 'Cette source d’eau est-elle disponible toute l’année ?', 'single', ON),
  a('9', '', 'Si non, pendant quelle période est-elle indisponible ?', 'single', ['Pendant la saison sèche', 'Pendant la saison des pluies'], { other: true, dep: { q: 'a8', in: ['Non'] } }),
  a('10', '', 'Quelle est la principale source d’eau pour les autres besoins domestiques (lessive, vaisselle, nettoyage…) ?', 'single', ['Robinet', 'Source', 'Rivière', 'Forage', 'Eau de pluie']),
  a('11', '', 'Votre ménage traite-t-il l’eau avant de la boire ?', 'single', ['Toujours', 'Souvent', 'Parfois', 'Jamais']),
  a('12', '', 'Si oui, quelle méthode utilisez-vous principalement ?', 'single', ['Ébullition', 'Filtration', 'Désinfection solaire', 'Chloration', 'Décantation'], { other: true, dep: { q: 'a11', not: ['Jamais'] } }),
  a('12a', '', 'Si vous ne traitez pas l’eau, pourquoi ?', 'single', ['L’eau est considérée comme propre', 'Manque de moyens financiers', 'Manque de produit de traitement', 'Manque d’information', 'Goût de l’eau après traitement'], { other: true, dep: { q: 'a11', in: ['Jamais'] } }),

  a('13', 'III. Perception de la qualité de l’eau', 'Comment appréciez-vous la qualité de l’eau que consomme votre ménage ?', 'single', ECH5),
  a('14', '', 'Avez-vous déjà constaté l’un des problèmes suivants dans votre eau de consommation ?', 'multi', ['Trouble', 'Mauvaise odeur', 'Mauvais goût', 'Présence de déchets', 'Aucun problème']),
  a('15', '', 'Votre ménage a-t-il déjà connu un problème de santé associé à la consommation d’eau ?', 'single', ONS),
  a('15a', '', 'Si oui, lequel ?', 'multi', ['Diarrhée', 'Douleur abdominale', 'Vomissements', 'Fièvre'], { other: true, dep: { q: 'a15', in: ['Oui'] } }),

  a('16', 'IV. Conditions d’assainissement du ménage', 'Votre ménage dispose-t-il d’une latrine/toilette ?', 'single', ON),
  a('17', '', 'Si oui, quel type de toilette utilisez-vous ?', 'single', ['Latrine traditionnelle', 'Latrine améliorée', 'Toilette avec fosse septique'], { other: true, dep: { q: 'a16', in: ['Oui'] } }),
  a('18', '', 'La toilette dispose-t-elle d’un dispositif de lavage des mains à proximité ?', 'single', ON, { dep: { q: 'a16', in: ['Oui'] } }),
  a('19', '', 'Si oui, avec quoi les membres du ménage se lavent-ils principalement les mains ?', 'single', ['Eau seulement', 'Eau + savon', 'Eau + cendre'], { dep: { q: 'a18', in: ['Oui'] } }),
  a('20', '', 'Où les membres du ménage défèquent-ils lorsqu’il n’y a pas de toilette ?', 'single', ['Dans la brousse', 'Dans la rivière'], { other: true, dep: { q: 'a16', in: ['Non'] } }),

  a('21', 'V. Gestion des déchets solides', 'Comment votre ménage se débarrasse-t-il des déchets solides ?', 'single', ['Dépôt dans une poubelle', 'Dépôt dans une fosse', 'Dépôt dans la rue', 'Dépôt dans la nature', 'Incinération', 'Recyclage']),
  a('22', '', 'Votre ménage dispose-t-il d’une poubelle ?', 'single', ON),
  a('23', '', 'À quelle fréquence les déchets sont-ils évacués ?', 'single', ['Chaque jour', 'Plusieurs fois par semaine', 'Une fois par semaine', 'Occasionnellement']),

  a('24', 'VI. Gestion des eaux usées', 'Où sont principalement évacuées les eaux usées de votre ménage ?', 'single', ['Dans une fosse', 'Dans la cour', 'Dans la rue', 'Dans un cours d’eau', 'Dans la végétation / brousse']),

  a('25', 'VII. Hygiène et pratiques du ménage', 'À quels moments les membres du ménage se lavent-ils généralement les mains ?', 'multi', ['Avant de manger', 'Après avoir utilisé les toilettes', 'Après avoir travaillé']),
  a('26', '', 'Comment évaluez-vous les conditions d’assainissement de votre ménage ?', 'single', ['Très bonnes', 'Bonnes', 'Moyennes', 'Mauvaises', 'Très mauvaises']),

  a('27', 'VIII. Difficultés et perceptions des ménages', 'Quelle est la principale difficulté de votre ménage concernant l’accès à l’eau potable ?', 'single', ['Éloignement des points d’eau', 'Insuffisance des points d’eau', 'Coût de l’eau', 'Panne des installations', 'Mauvaise qualité de l’eau'], { other: true }),
  a('28', '', 'Quelle est la principale difficulté concernant l’assainissement ?', 'single', ['Insuffisance de latrines', 'Manque de moyens financiers', 'Manque d’espace', 'Absence de système d’évacuation des déchets', 'Absence de drainage des eaux usées', 'Manque de sensibilisation'], { other: true }),
  a('29', '', 'Existe-t-il dans votre quartier des actions communautaires en faveur de l’eau et de l’assainissement ?', 'single', ONS),
  a('30', '', 'Selon vous, quelles mesures permettraient d’améliorer l’accès à l’eau potable ?', 'text'),
  a('31', '', 'Quelles mesures permettraient d’améliorer l’assainissement dans votre quartier ?', 'text')
];

// ---------- Questionnaire B : exigences environnementales et institutionnelles ----------
const b = maker('b');
const QB = [
  b('1', 'I. Identification de l’enquêté(e)', 'Sexe', 'single', ['Masculin', 'Féminin']),
  b('2', '', 'Âge', 'single', ['Moins de 18 ans', '18–30 ans', '31–45 ans', '46–60 ans', 'Plus de 60 ans']),
  b('3', '', 'Niveau d’études', 'single', ['Aucun', 'Primaire', 'Secondaire', 'Supérieur']),
  b('4', '', 'Profession', 'single', ['Agriculteur(trice)', 'Fonctionnaire', 'Commerçant(e)', 'Élève/étudiant(e)'], { other: true }),

  b('5', 'II. Perception de l’environnement', 'Comment évaluez-vous l’état de l’environnement dans votre quartier ou village ?', 'single', ['Très bon', 'Bon', 'Moyen', 'Mauvais', 'Très mauvais']),
  b('6', '', 'Quels sont les principaux problèmes environnementaux observés ?', 'multi', ['Déforestation', 'Érosion du sol', 'Pollution de l’eau', 'Disparition des espèces', 'Mauvaise gestion des déchets'], { other: true }),
  b('7', '', 'Selon vous, ces problèmes se sont-ils aggravés au cours des dernières années ?', 'single', ONS),
  b('8', '', 'Quelles sont les principales causes de ces problèmes ?', 'multi', ['Activités agricoles', 'Exploitation forestière', 'Croissance démographique', 'Faiblesse des autorités'], { other: true }),

  b('9', 'III. Gestion des ressources naturelles', 'Utilisez-vous les ressources naturelles locales ?', 'single', ON),
  b('10', '', 'Si oui, lesquelles ?', 'multi', ['Bois', 'Eau', 'Forêts', 'Animaux', 'Terres agricoles'], { other: true, dep: { q: 'b9', in: ['Oui'] } }),
  b('11', '', 'Existe-t-il des règles locales pour protéger les ressources naturelles ?', 'single', ONS),
  b('12', '', 'Ces règles sont-elles respectées ?', 'single', ['Toujours', 'Souvent', 'Rarement', 'Jamais', 'Je ne sais pas']),

  b('13', 'IV. Aspects institutionnels', 'Connaissez-vous des institutions chargées de la gestion de l’environnement ?', 'single', ON),
  b('14', '', 'Si oui, lesquelles ?', 'multi', ['Autorités locales', 'Services de l’État', 'ONG', 'Chefferies traditionnelles'], { other: true, dep: { q: 'b13', in: ['Oui'] } }),
  b('15', '', 'Comment évaluez-vous l’action des autorités locales en matière d’environnement ?', 'single', ['Très efficace', 'Efficace', 'Moyenne', 'Faible', 'Nulle']),
  b('16', '', 'Existe-t-il des politiques ou des lois environnementales appliquées dans votre commune ?', 'single', ONS),
  b('17', '', 'Quels sont les obstacles à l’application de ces politiques ?', 'multi', ['Manque de moyens', 'Corruption', 'Faible sensibilisation', 'Manque de suivi'], { other: true }),

  b('18', 'V. Participation communautaire', 'Participez-vous à des activités de protection de l’environnement ?', 'single', ON),
  b('19', '', 'Si oui, lesquelles ?', 'multi', ['Reboisement', 'Sensibilisation', 'Nettoyage', 'Surveillance des ressources'], { other: true, dep: { q: 'b18', in: ['Oui'] } }),
  b('20', '', 'Selon vous, la population est-elle suffisamment impliquée dans la gestion de l’environnement ?', 'single', ONS),

  b('21', 'VI. Propositions et perspectives', 'Quelles solutions proposez-vous pour améliorer la gestion de l’environnement ?', 'text'),
  b('22', '', 'Que devraient faire les autorités pour renforcer la gestion de l’environnement ?', 'text'),
  b('23', '', 'Quels sont les besoins prioritaires de votre communauté ?', 'multi', ['Formation', 'Financement', 'Encadrement technique', 'Renforcement des lois'], { other: true }),

  b('24', 'VII. Observations générales', 'Avez-vous des suggestions ou des commentaires ?', 'text')
];

const QUEST = {
  A: { id: 'A', court: 'Eau et assainissement', titre: 'Accès à l’eau potable et conditions d’assainissement des ménages dans la commune rurale de Kasongo-Lunda', q: QA },
  B: { id: 'B', court: 'Environnement et institutions', titre: 'La commune rurale de Kasongo-Lunda face aux exigences environnementales et institutionnelles', q: QB }
};
const QUARTIERS = ['Kasanga', 'Kabamba', 'Sacré-Cœur', 'Nzaki', 'N’temo', 'Bethel', 'Mankubu'];
const OBJECTIF = 30;
const DIR_WA = '243821260005';
