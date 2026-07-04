const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { fN, fD, getConsos, computeScore, maintStatus, assuranceStatus } = require('../logic.js');

describe('fN — formatage des nombres', () => {
  test('regroupe les milliers (fr-FR)', () => {
    // fr-FR utilise une espace insecable etroite (U+202F) comme separateur de milliers
    assert.equal(fN(1000).replace(/\s/g, ' '), '1 000');
    assert.equal(fN(25000).replace(/\s/g, ' '), '25 000');
  });
  test('retourne la valeur absolue (pas de signe negatif)', () => {
    assert.equal(fN(-500), '500');
  });
  test('gere zero', () => {
    assert.equal(fN(0), '0');
  });
});

describe('getConsos — calcul de consommation plein-a-plein', () => {
  test('ignore le tout premier plein (pas de distance de reference)', () => {
    const r = getConsos([{ id: 1, date: '2026-01-01', km: 1000, liters: 40, full: true }]);
    assert.equal(r.length, 0);
  });

  test('calcule la conso simple entre deux pleins complets consecutifs', () => {
    // 400 km parcourus, 40L pour les faire => 10 L/100km
    const r = getConsos([
      { id: 1, date: '2026-01-01', km: 1000, liters: 40, full: true },
      { id: 2, date: '2026-01-15', km: 1400, liters: 40, full: true },
    ]);
    assert.equal(r.length, 1);
    assert.equal(r[0].dist, 400);
    assert.equal(r[0].conso, 10);
  });

  test('cumule les litres des pleins partiels entre deux pleins complets', () => {
    // Plein complet (40L) -> partiel (10L) -> plein complet (30L) sur 500 km au total
    // Conso doit utiliser 10+30=40L sur les 500 km, PAS seulement les 30L du dernier plein
    const r = getConsos([
      { id: 1, date: '2026-01-01', km: 1000, liters: 40, full: true },
      { id: 2, date: '2026-01-10', km: 1200, liters: 10, full: false },
      { id: 3, date: '2026-01-20', km: 1500, liters: 30, full: true },
    ]);
    assert.equal(r.length, 1);
    assert.equal(r[0].dist, 500);
    assert.equal(r[0].conso, 8); // (10+30)/500*100 = 8
  });

  test('entrees sans champ "full" sont traitees comme des pleins complets (retro-compatibilite)', () => {
    const r = getConsos([
      { id: 1, date: '2026-01-01', km: 1000, liters: 40 },
      { id: 2, date: '2026-01-15', km: 1400, liters: 40 },
    ]);
    assert.equal(r.length, 1);
    assert.equal(r[0].conso, 10);
  });

  test('ignore un couple si le kilometrage ne progresse pas (distance <= 0)', () => {
    const r = getConsos([
      { id: 1, date: '2026-01-01', km: 1000, liters: 40, full: true },
      { id: 2, date: '2026-01-15', km: 1000, liters: 40, full: true },
    ]);
    assert.equal(r.length, 0);
  });

  test('trie les entrees par date avant de calculer, quel que soit l\'ordre d\'entree', () => {
    const r = getConsos([
      { id: 2, date: '2026-01-15', km: 1400, liters: 40, full: true },
      { id: 1, date: '2026-01-01', km: 1000, liters: 40, full: true },
    ]);
    assert.equal(r.length, 1);
    assert.equal(r[0].id, 2); // le resultat correspond au 2eme plein chronologique
  });

  test('tableau vide -> aucun resultat', () => {
    assert.deepEqual(getConsos([]), []);
  });
});

describe('computeScore — score sante (0-100)', () => {
  test('100 par defaut si aucune conso et pas de budget', () => {
    assert.equal(computeScore({ consos: [], budget: 0 }), 100);
  });

  test('penalite legere si conso 10-30% au-dessus de la cible', () => {
    const sc = computeScore({ consos: [{ conso: 10 }], target: 9, budget: 0 });
    assert.equal(sc, 80); // 10 > 9*1.1=9.9 -> -20
  });

  test('grosse penalite si conso >30% au-dessus de la cible', () => {
    const sc = computeScore({ consos: [{ conso: 13 }], target: 9, budget: 0 });
    assert.equal(sc, 60); // 13 > 9*1.3=11.7 -> -40
  });

  test('penalite si budget legerement depasse', () => {
    const sc = computeScore({ consos: [{ conso: 9 }], target: 9, budget: 100000, spent: 105000 });
    assert.equal(sc, 85); // spent/budget=1.05 -> -15
  });

  test('grosse penalite si budget tres depasse', () => {
    const sc = computeScore({ consos: [{ conso: 9 }], target: 9, budget: 100000, spent: 130000 });
    assert.equal(sc, 70); // ratio 1.3 -> -30
  });

  test('ne descend jamais sous 0', () => {
    const sc = computeScore({ consos: [{ conso: 20 }], target: 9, budget: 100000, spent: 200000 });
    assert.equal(sc, 30); // -40-30=30, deja > 0 mais on verifie le clamp aussi
    const sc2 = computeScore({ consos: [{ conso: 50 }], target: 9, budget: 100000, spent: 500000 });
    assert.ok(sc2 >= 0);
  });
});

describe('maintStatus — statut d\'un entretien', () => {
  const now = new Date('2026-07-04T12:00:00');

  test('"due" si la date prevue est deja passee', () => {
    const { st, sl } = maintStatus({ nextDate: '2026-07-01' }, 0, now);
    assert.equal(st, 'due');
    assert.equal(sl, 'ECHU');
  });

  test('"warn" si la date prevue est dans moins de 30 jours', () => {
    const { st } = maintStatus({ nextDate: '2026-07-20' }, 0, now);
    assert.equal(st, 'warn');
  });

  test('"ok" si la date prevue est dans plus de 30 jours', () => {
    const { st } = maintStatus({ nextDate: '2026-12-01' }, 0, now);
    assert.equal(st, 'ok');
  });

  test('"due" si le kilometrage prevu est deja depasse', () => {
    const { st, sl } = maintStatus({ nextKm: 50000 }, 50500, now);
    assert.equal(st, 'due');
    assert.equal(sl, 'ECHU');
  });

  test('"warn" si moins de 500 km avant l\'echeance', () => {
    const { st } = maintStatus({ nextKm: 50000 }, 49700, now);
    assert.equal(st, 'warn');
  });

  test('"ok" si aucune echeance renseignee', () => {
    const { st, sl } = maintStatus({}, 1000, now);
    assert.equal(st, 'ok');
    assert.equal(sl, 'A jour');
  });

  test('priorise la date sur le kilometrage si les deux sont fournis', () => {
    const { st } = maintStatus({ nextDate: '2026-12-01', nextKm: 100 }, 99999, now);
    assert.equal(st, 'ok'); // la date, lointaine, l'emporte
  });
});

describe('assuranceStatus — statut d\'expiration assurance', () => {
  const now = new Date('2026-07-04T12:00:00');

  test('null si pas de date de fin', () => {
    assert.equal(assuranceStatus({}, now), null);
  });

  test('"danger" si deja expiree', () => {
    const r = assuranceStatus({ dateFin: '2026-06-01' }, now);
    assert.equal(r.type, 'danger');
  });

  test('"warn" si expire dans moins de 30 jours', () => {
    const r = assuranceStatus({ dateFin: '2026-07-20' }, now);
    assert.equal(r.type, 'warn');
  });

  test('"ok" si expire dans plus de 30 jours', () => {
    const r = assuranceStatus({ dateFin: '2026-12-01' }, now);
    assert.equal(r.type, 'ok');
  });
});
