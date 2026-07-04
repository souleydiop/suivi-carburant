// logic.js
// Logique metier PURE (aucune dependance au DOM/localStorage) afin qu'elle
// soit a la fois utilisee par l'app (index.html la charge en <script> avant
// le script principal) ET testable directement avec Node (unit tests).

function fN(n) {
  return Math.abs(n).toLocaleString('fr-FR');
}

function fD(d) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Consommation moyenne — methode "plein a plein" : la conso entre 2 pleins
// complets tient compte de tous les litres ajoutes entre-temps (y compris
// les pleins partiels), plutot que de comparer betement 2 entrees consecutives.
function getConsos(ents) {
  const s = [...ents].sort((a, b) => new Date(a.date) - new Date(b.date));
  const r = [];
  let acc = 0, lastFull = null;
  for (let i = 0; i < s.length; i++) {
    const e = s[i];
    acc += e.liters;
    const isFull = e.full !== false; // entrees existantes sans champ 'full' = considerees pleines
    if (isFull) {
      if (lastFull) {
        const dist = e.km - lastFull.km;
        if (dist > 0) r.push({ ...e, dist, conso: (acc / dist) * 100 });
      }
      lastFull = e;
      acc = 0;
    }
  }
  return r;
}

// Score sante (0-100) a partir de la conso moyenne vs objectif, et du budget vs depense.
function computeScore({ consos = [], target = 9, budget = 0, spent = 0 } = {}) {
  let sc = 100;
  if (consos.length) {
    const avg = consos.reduce((s, c) => s + c.conso, 0) / consos.length;
    if (avg > target * 1.3) sc -= 40;
    else if (avg > target * 1.1) sc -= 20;
  }
  if (budget > 0) {
    const r = spent / budget;
    if (r > 1.2) sc -= 30;
    else if (r > 1) sc -= 15;
  }
  return Math.max(0, Math.min(100, Math.round(sc)));
}

// Statut d'un entretien : 'ok' | 'warn' | 'due'. `now` injectable pour les tests.
function maintStatus(m, lastKm = 0, now = new Date()) {
  const today = now.toISOString().split('T')[0];
  let st = 'ok', sl = 'A jour';
  if (m.nextDate && m.nextDate <= today) {
    st = 'due'; sl = 'ECHU';
  } else if (m.nextDate) {
    const diff = (new Date(m.nextDate) - now) / 864e5;
    if (diff <= 30) { st = 'warn'; sl = Math.round(diff) + 'j'; }
  } else if (m.nextKm && lastKm >= m.nextKm) {
    st = 'due'; sl = 'ECHU';
  } else if (m.nextKm && lastKm >= m.nextKm - 500) {
    st = 'warn'; sl = fN(m.nextKm - lastKm) + ' km';
  }
  return { st, sl };
}

// Statut d'une assurance par rapport a sa date de fin. `now` injectable pour les tests.
// Retourne null si pas de date de fin renseignee.
function assuranceStatus(a, now = new Date()) {
  if (!a.dateFin) return null;
  const diff = (new Date(a.dateFin) - now) / 864e5;
  const diffDays = Math.round(diff);
  if (diff < 0) return { type: 'danger', diffDays };
  if (diff <= 30) return { type: 'warn', diffDays };
  return { type: 'ok', diffDays };
}

// Export CommonJS pour Node (tests unitaires) — ignore silencieusement dans le navigateur.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { fN, fD, getConsos, computeScore, maintStatus, assuranceStatus };
}
