'use strict';
/* =====================================================================
   Enquêtes ISP/Kasongo-Lunda — saisie hors ligne, GPS, analyse
   ===================================================================== */

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast('Mémoire du téléphone pleine : exportez vos fiches.'); } }
};

/* ---------- Comptes (mot de passe initial = prénom, à changer à la 1re connexion) ---------- */
const COMPTES = [
  { id: 'henock', nom: 'Ibanda Lukaku Henock', role: 'enq', qid: 'A', pwd: 'henock' },
  { id: 'manasser', nom: 'Kabeya Tsangu Manasser', role: 'enq', qid: 'B', pwd: 'manasser' },
  { id: 'raphael', nom: 'Raphaël Mpangieto', role: 'dir', qid: null, pwd: 'raphael' }
];

async function sha(s) {
  if (window.crypto && crypto.subtle) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381; for (const c of s) h = ((h << 5) + h + c.charCodeAt(0)) | 0;
  return 'x' + h;
}
async function initUsers() {
  let u = LS.get('ens_users');
  if (!u) {
    u = [];
    for (const c of COMPTES) u.push({ id: c.id, nom: c.nom, role: c.role, qid: c.qid, hash: await sha(c.pwd), must: true });
    LS.set('ens_users', u);
  }
  return u;
}

/* ---------- État ---------- */
const S = { user: null, users: [], tab: 'fiche', an: 'resume', qid: 'A', fq: null, fqt: '', cx1: '_quartier', cx2: null, lq: '', draft: null, online: navigator.onLine };

const fiches = () => LS.get('ens_fiches', []);
const saveFiches = f => LS.set('ens_fiches', f);
const isDir = () => S.user && S.user.role === 'dir';
const curQid = () => isDir() ? S.qid : S.user.qid;
const curQ = () => QUEST[curQid()].q;
const dk = () => 'ens_draft_' + S.user.id;
function toast(m) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}
function dl(name, text, type) {
  const blob = new Blob([text], { type: type || 'text/plain' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const fdate = iso => { try { return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };

/* ---------- Connexion ---------- */
function loginHTML() {
  return '<div class="login"><img src="logo.png" alt="Logo ISP">' +
    '<h1>Enquêtes de terrain</h1><p class="sub">ISP/Kasongo-Lunda · Géographie et gestion de l’environnement</p>' +
    '<div class="card"><label class="f" for="lid">Identifiant</label><input type="text" id="lid" autocapitalize="none" autocomplete="username">' +
    '<label class="f" for="lpw">Mot de passe</label><input type="password" id="lpw" autocomplete="current-password">' +
    '<div class="err" id="lerr"></div><button class="btn full" onclick="doLogin()">Se connecter</button></div>' +
    '<p class="muted" style="text-align:center;font-size:13px">Fonctionne sans connexion Internet.</p></div>';
}
async function doLogin() {
  const id = $('lid').value.trim().toLowerCase(), pw = $('lpw').value;
  const u = S.users.find(x => x.id === id);
  let ok = false;
  if (u) {
    ok = (await sha(pw)) === u.hash;
    if (!ok && u.must) ok = (await sha(pw.trim().toLowerCase())) === u.hash;
  }
  if (!ok) { $('lerr').textContent = 'Identifiant ou mot de passe incorrect.'; return; }
  S.user = u; sessionStorage.setItem('ens_sess', u.id);
  S.tab = u.role === 'enq' ? 'fiche' : 'liste'; S.draft = LS.get(dk(), { quartier: '', gps: null, rep: {} });
  render(); autoSync();
}
function pwHTML() {
  return '<div class="login"><img src="logo.png" alt="Logo ISP"><h1>Nouveau mot de passe</h1>' +
    '<p class="sub">Bonjour ' + esc(S.user.nom) + '. Choisissez un mot de passe personnel (6 caractères minimum).</p>' +
    '<div class="card"><label class="f" for="np1">Nouveau mot de passe</label><input type="password" id="np1" autocomplete="new-password">' +
    '<label class="f" for="np2">Confirmer</label><input type="password" id="np2" autocomplete="new-password">' +
    '<div class="err" id="lerr"></div><button class="btn full" onclick="changePw()">Enregistrer</button></div></div>';
}
async function changePw() {
  const a = $('np1').value, b = $('np2').value;
  if (a.length < 6) { $('lerr').textContent = 'Au moins 6 caractères.'; return; }
  if (a !== b) { $('lerr').textContent = 'Les deux mots de passe sont différents.'; return; }
  if (a.toLowerCase() === S.user.id) { $('lerr').textContent = 'Choisissez un mot de passe différent de votre prénom.'; return; }
  S.user.hash = await sha(a); S.user.must = false; LS.set('ens_users', S.users);
  toast('Mot de passe enregistré'); render();
}
function logout() { sessionStorage.removeItem('ens_sess'); S.user = null; render(); }

/* ---------- Visibilité des questions dépendantes ---------- */
function condOK(q, v) {
  const d = q.dep; if (!d) return true;
  const has = x => Array.isArray(v) ? v.includes(x) : v === x;
  if (d.in) return d.in.some(has);
  if (d.not) return !d.not.some(has);
  return true;
}
function visMap(rep) {
  const vm = {};
  for (const q of curQ()) vm[q.id] = !q.dep || (vm[q.dep.q] !== false && condOK(q, rep[q.dep.q]));
  return vm;
}

/* ---------- Formulaire de saisie ---------- */
function formHTML() {
  const rep = S.draft.rep || {};
  let h = '';
  for (const q of curQ()) {
    if (q.sec) h += '<h3 class="sec">' + esc(q.sec) + '</h3>';
    h += '<div class="q" id="q_' + q.id + '"><div class="qt"><b>' + esc(q.num) + '.</b> ' + esc(q.text) + (q.type === 'multi' ? ' <span class="muted">(plusieurs réponses possibles)</span>' : '') + '</div>';
    const v = rep[q.id];
    if (q.type === 'single' || q.type === 'multi') {
      const t = q.type === 'single' ? 'radio' : 'checkbox';
      h += '<div class="opts">';
      for (const o of q.opts) {
        const ck = q.type === 'single' ? v === o : (v || []).includes(o);
        h += '<label class="opt"><input type="' + t + '" name="' + q.id + '" value="' + esc(o) + '"' + (ck ? ' checked' : '') + '><span>' + esc(o) + '</span></label>';
      }
      h += '</div>';
      if (q.other) h += '<input class="oth" name="' + q.id + '_o" placeholder="Précisez…" value="' + esc(rep[q.id + '_o'] || '') + '">';
    } else if (q.type === 'number') {
      h += '<input type="number" inputmode="numeric" min="0" name="' + q.id + '" value="' + esc(v == null ? '' : v) + '">';
    } else {
      h += '<textarea name="' + q.id + '">' + esc(v || '') + '</textarea>';
    }
    h += '</div>';
  }
  return h;
}
function readForm() {
  const f = $('f'), rep = {};
  for (const q of curQ()) {
    let v;
    if (q.type === 'single') { const r = f.querySelector('input[name="' + q.id + '"]:checked'); v = r ? r.value : null; }
    else if (q.type === 'multi') v = [...f.querySelectorAll('input[name="' + q.id + '"]:checked')].map(x => x.value);
    else { const e = f.querySelector('[name="' + q.id + '"]'); v = e ? e.value.trim() : ''; }
    rep[q.id] = v;
    const o = f.querySelector('[name="' + q.id + '_o"]'); if (o) rep[q.id + '_o'] = o.value.trim();
  }
  return rep;
}
function applyShow() {
  const f = $('f'); if (!f) return {};
  const rep = readForm(), vm = visMap(rep);
  for (const q of curQ()) {
    const el = $('q_' + q.id); if (el) el.style.display = vm[q.id] ? '' : 'none';
    if (q.other) {
      const sel = q.type === 'single' ? rep[q.id] === 'Autre' : (rep[q.id] || []).includes('Autre');
      const o = f.querySelector('[name="' + q.id + '_o"]'); if (o) o.style.display = sel ? '' : 'none';
    }
  }
  return vm;
}
function onForm() { S.draft.rep = readForm(); applyShow(); LS.set(dk(), S.draft); }
function nbQuartier(q) { return fiches().filter(f => f.qid === curQid() && f.quartier === q).length; }

function ficheTab() {
  const qn = QUEST[curQid()];
  const chips = QUARTIERS.map(q => '<button class="chip' + (S.draft.quartier === q ? ' on' : '') + '" onclick="setQuartier(\'' + q.replace(/'/g, '’') + '\')">' + esc(q) + '</button>').join('');
  const g = S.draft.gps;
  return '<h2>Nouvelle fiche</h2><p class="muted" style="margin-top:0">' + esc(qn.titre) + '</p>' +
    '<div class="card"><b>Quartier</b><div class="chips">' + chips + '</div>' +
    (S.draft.quartier ? '<div class="muted">' + nbQuartier(S.draft.quartier) + ' / ' + OBJECTIF + ' fiches déjà saisies dans ce quartier</div>' : '<div class="muted">Choisissez le quartier avant de commencer.</div>') +
    '<div class="gps" style="margin-top:10px"><button class="btn sec sm" id="gpsb" onclick="getGps()">📍 Prendre la position GPS</button><span id="gpst" class="muted">' +
    (g ? g.lat.toFixed(5) + ', ' + g.lng.toFixed(5) + ' (±' + Math.round(g.acc) + ' m)' : 'Position non enregistrée') + '</span></div></div>' +
    '<form id="f" onchange="onForm()" oninput="onForm()" onsubmit="return false">' + formHTML() + '</form>' +
    '<button class="btn full" onclick="saveFiche()">Enregistrer la fiche</button>' +
    '<button class="btn sec full" onclick="resetDraft()">Effacer et recommencer</button>';
}
function setQuartier(q) { S.draft.quartier = q; LS.set(dk(), S.draft); render(); }
function getGps() {
  if (!navigator.geolocation) { toast('GPS indisponible sur cet appareil'); return; }
  $('gpst').textContent = 'Recherche du signal GPS…';
  navigator.geolocation.getCurrentPosition(p => {
    S.draft.gps = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
    LS.set(dk(), S.draft);
    $('gpst').textContent = S.draft.gps.lat.toFixed(5) + ', ' + S.draft.gps.lng.toFixed(5) + ' (±' + Math.round(S.draft.gps.acc) + ' m)';
  }, e => { $('gpst').textContent = 'Position impossible : activez la localisation et réessayez.'; },
    { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 });
}
function resetDraft() {
  if (!confirm('Effacer toutes les réponses de cette fiche ?')) return;
  S.draft = { quartier: S.draft.quartier, gps: null, rep: {} }; LS.set(dk(), S.draft); render();
}
function saveFiche() {
  if (!S.draft.quartier) { toast('Choisissez le quartier'); window.scrollTo(0, 0); return; }
  const rep = readForm(), vm = visMap(rep);
  let vide = 0;
  for (const q of curQ()) {
    if (!vm[q.id]) { delete rep[q.id]; delete rep[q.id + '_o']; continue; }
    if (q.type === 'text') continue;
    const v = rep[q.id];
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) vide++;
  }
  if (vide && !confirm(vide + ' question(s) sans réponse. Enregistrer quand même ?')) return;
  const g = S.draft.gps;
  const fi = { id: 'F' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), qid: curQid(), enq: S.user.id, quartier: S.draft.quartier, date: new Date().toISOString(), lat: g ? g.lat : null, lng: g ? g.lng : null, acc: g ? g.acc : null, rep: rep, synced: false };
  const all = fiches(); all.push(fi); saveFiches(all);
  S.draft = { quartier: S.draft.quartier, gps: null, rep: {} }; LS.set(dk(), S.draft);
  toast('Fiche enregistrée ✓'); render(); window.scrollTo(0, 0); autoSync();
}

/* ---------- Liste des fiches ---------- */
function qSelector() {
  if (!isDir()) return '';
  return '<div class="card"><label class="f" style="margin-top:0">Questionnaire</label><select onchange="S.qid=this.value;render()">' +
    Object.values(QUEST).map(q => '<option value="' + q.id + '"' + (S.qid === q.id ? ' selected' : '') + '>' + q.id + ' — ' + esc(q.court) + '</option>').join('') + '</select></div>';
}
function listeTab() {
  const qid = curQid();
  const L = fiches().filter(f => f.qid === qid && (!S.lq || f.quartier === S.lq)).sort((a, b) => b.date.localeCompare(a.date));
  const total = fiches().filter(f => f.qid === qid).length;
  return qSelector() + '<h2>Fiches (' + total + ')</h2>' +
    '<select onchange="S.lq=this.value;render()"><option value="">Tous les quartiers</option>' + QUARTIERS.map(q => '<option' + (S.lq === q ? ' selected' : '') + '>' + esc(q) + '</option>').join('') + '</select>' +
    '<div class="card">' + (L.length ? L.map(f => '<div class="row"><div><b>' + esc(f.quartier) + '</b> <span class="muted">· ' + fdate(f.date) + '</span><br><span class="muted" style="font-size:13px">' + esc(f.enq) + (f.lat != null ? ' · GPS ✓' : '') + '</span></div><div><span class="badge' + (f.synced ? ' ok' : '') + '">' + (f.synced ? 'envoyée' : 'sur le téléphone') + '</span> <button class="btn sec sm" onclick="showFiche(\'' + f.id + '\')">Voir</button></div></div>').join('') : '<p class="muted">Aucune fiche pour le moment.</p>') + '</div>';
}
function showFiche(id) {
  const f = fiches().find(x => x.id === id); if (!f) return;
  const qs = QUEST[f.qid].q;
  let h = '<h2 style="margin-top:0">' + esc(f.quartier) + ' · ' + fdate(f.date) + '</h2>' + (f.lat != null ? '<p class="muted">GPS : ' + f.lat.toFixed(5) + ', ' + f.lng.toFixed(5) + '</p>' : '');
  for (const q of qs) {
    let v = f.rep[q.id]; if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
    v = Array.isArray(v) ? v.join(', ') : v;
    const o = f.rep[q.id + '_o']; if (o) v += ' (' + o + ')';
    h += '<div class="row" style="display:block"><span class="muted">' + esc(q.num) + '. ' + esc(q.text) + '</span><br><b>' + esc(v) + '</b></div>';
  }
  if (!f.synced && f.enq === S.user.id) h += '<button class="btn dng full" onclick="delFiche(\'' + id + '\')">Supprimer cette fiche</button>';
  h += '<button class="btn sec full" onclick="closeModal()">Fermer</button>';
  const m = document.createElement('div'); m.className = 'modal'; m.id = 'modal'; m.innerHTML = '<div>' + h + '</div>';
  m.onclick = e => { if (e.target === m) closeModal(); };
  document.body.appendChild(m);
}
function closeModal() { const m = $('modal'); if (m) m.remove(); }
function delFiche(id) {
  if (!confirm('Supprimer définitivement cette fiche ?')) return;
  saveFiches(fiches().filter(f => f.id !== id)); closeModal(); render();
}

/* ---------- Analyse ---------- */
const AGES = ['< 18 ans', '18–30 ans', '31–45 ans', '46–60 ans', '> 60 ans'];
function pseudo(qid) {
  const l = [{ id: '_quartier', num: '', text: 'Quartier', type: 'single', opts: QUARTIERS }];
  if (qid === 'A') l.push({ id: '_age', num: '', text: 'Tranche d’âge', type: 'single', opts: AGES });
  return l;
}
const allQ = qid => pseudo(qid).concat(QUEST[qid].q);
const findQ = (qid, id) => allQ(qid).find(q => q.id === id);
function valOf(f, q) {
  if (q.id === '_quartier') return f.quartier;
  if (q.id === '_age') {
    const v = f.rep.a2; if (v === '' || v == null || isNaN(+v)) return null; const a = +v;
    return a < 18 ? AGES[0] : a <= 30 ? AGES[1] : a <= 45 ? AGES[2] : a <= 60 ? AGES[3] : AGES[4];
  }
  return f.rep[q.id];
}
const dataset = (qid, qt) => fiches().filter(f => f.qid === qid && (!qt || f.quartier === qt));

function analyseTab() {
  const qid = curQid();
  const subs = [['resume', 'Résumé'], ['freq', 'Fréquences'], ['cross', 'Croisements'], ['carte', 'Carte']];
  const bar = '<div class="chips">' + subs.map(s => '<button class="chip' + (S.an === s[0] ? ' on' : '') + '" onclick="S.an=\'' + s[0] + '\';render()">' + s[1] + '</button>').join('') + '</div>';
  let body = '';
  if (!dataset(qid).length) body = '<div class="card muted">Aucune fiche à analyser pour le moment.</div>';
  else if (S.an === 'resume') body = resumeHTML(qid);
  else if (S.an === 'freq') body = freqHTML(qid);
  else if (S.an === 'cross') body = crossHTML(qid);
  else body = mapHTML(qid);
  return qSelector() + '<h2>Analyse</h2>' + bar + body;
}
function resumeHTML(qid) {
  const D = dataset(qid);
  let h = '<div class="card"><b>' + D.length + ' fiches</b> sur ' + OBJECTIF * QUARTIERS.length + ' prévues<div class="bar" style="margin:8px 0"><i style="width:' + Math.min(100, D.length / (OBJECTIF * QUARTIERS.length) * 100) + '%"></i></div>';
  for (const q of QUARTIERS) {
    const n = D.filter(f => f.quartier === q).length;
    h += '<div class="row"><span style="min-width:90px">' + esc(q) + '</span><div class="bar"><i style="width:' + Math.min(100, n / OBJECTIF * 100) + '%"></i></div><span>' + n + '/' + OBJECTIF + '</span></div>';
  }
  h += '</div>';
  const gps = D.filter(f => f.lat != null).length;
  h += '<div class="card">Fiches avec position GPS : <b>' + gps + '</b> sur ' + D.length + '</div>';
  return h;
}
function numStats(vals) {
  const v = vals.slice().sort((x, y) => x - y), n = v.length; if (!n) return null;
  const m = v.reduce((s, x) => s + x, 0) / n;
  const med = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
  const sd = n > 1 ? Math.sqrt(v.reduce((s, x) => s + (x - m) * (x - m), 0) / (n - 1)) : 0;
  return { n: n, m: m, med: med, min: v[0], max: v[n - 1], sd: sd };
}
function freqHTML(qid) {
  const qs = allQ(qid);
  if (!S.fq || !findQ(qid, S.fq)) S.fq = qs[0].id;
  const q = findQ(qid, S.fq), D = dataset(qid, S.fqt);
  let h = '<div class="card"><label class="f" style="margin-top:0">Question</label><select onchange="S.fq=this.value;render()">' +
    qs.map(x => '<option value="' + x.id + '"' + (x.id === S.fq ? ' selected' : '') + '>' + (x.num ? x.num + '. ' : '') + esc(x.text.slice(0, 70)) + '</option>').join('') + '</select>' +
    '<label class="f">Quartier</label><select onchange="S.fqt=this.value;render()"><option value="">Tous les quartiers</option>' + QUARTIERS.map(z => '<option' + (S.fqt === z ? ' selected' : '') + '>' + esc(z) + '</option>').join('') + '</select></div>';
  h += '<div class="card"><b>' + esc(q.text) + '</b>';
  if (q.type === 'number') {
    const st = numStats(D.map(f => valOf(f, q)).filter(v => v !== '' && v != null && !isNaN(+v)).map(Number));
    h += st ? '<table style="margin-top:8px"><tr><th>Effectif</th><td>' + st.n + '</td></tr><tr><th>Moyenne</th><td>' + st.m.toFixed(1) + '</td></tr><tr><th>Médiane</th><td>' + st.med + '</td></tr><tr><th>Minimum – Maximum</th><td>' + st.min + ' – ' + st.max + '</td></tr><tr><th>Écart-type</th><td>' + st.sd.toFixed(2) + '</td></tr></table>' : '<p class="muted">Pas de réponses.</p>';
  } else if (q.type === 'text') {
    const L = D.map(f => valOf(f, q)).filter(Boolean);
    h += L.length ? '<ul>' + L.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>' : '<p class="muted">Pas de réponses.</p>';
  } else {
    const cnt = {}; let n = 0;
    for (const f of D) {
      const v = valOf(f, q); if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
      n++; (Array.isArray(v) ? v : [v]).forEach(x => cnt[x] = (cnt[x] || 0) + 1);
    }
    h += '<p class="muted" style="margin:4px 0">' + n + ' répondant(s)</p><div class="scroll"><table><tr><th>Réponse</th><th>Eff.</th><th>%</th><th></th></tr>';
    for (const o of q.opts) {
      const c = cnt[o] || 0, p = n ? c / n * 100 : 0;
      h += '<tr><td>' + esc(o) + '</td><td>' + c + '</td><td>' + p.toFixed(1) + '</td><td style="min-width:90px"><div class="bar"><i style="width:' + p + '%"></i></div></td></tr>';
    }
    h += '</table></div>';
    if (q.other) { const oth = D.map(f => f.rep[q.id + '_o']).filter(Boolean); if (oth.length) h += '<p class="muted">Autres précisés : ' + oth.map(esc).join(', ') + '</p>'; }
  }
  return h + '</div>';
}

/* Khi-deux : loi du khi-deux via la fonction gamma incomplète */
function lgamma(z) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = z, x = z, t = x + 5.5; t -= (x + 0.5) * Math.log(t);
  let s = 1.000000000190015; for (const cj of c) s += cj / ++y;
  return -t + Math.log(2.5066282746310005 * s / x);
}
function gser(a, x) { let ap = a, sum = 1 / a, del = sum; for (let n = 0; n < 500; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-12) break; } return sum * Math.exp(-x + a * Math.log(x) - lgamma(a)); }
function gcf(a, x) {
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-12) break; }
  return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}
function chiP(chi, df) { if (chi <= 0 || df <= 0) return 1; const a = df / 2, x = chi / 2; return x < a + 1 ? 1 - gser(a, x) : gcf(a, x); }

function crossHTML(qid) {
  const qs = allQ(qid).filter(q => q.type === 'single');
  if (!S.cx1 || !findQ(qid, S.cx1)) S.cx1 = qs[0].id;
  if (!S.cx2 || !findQ(qid, S.cx2)) S.cx2 = qs[2].id;
  const q1 = findQ(qid, S.cx1), q2 = findQ(qid, S.cx2), D = dataset(qid);
  const sel = (cur, fn) => '<select onchange="' + fn + '=this.value;render()">' + qs.map(x => '<option value="' + x.id + '"' + (x.id === cur ? ' selected' : '') + '>' + (x.num ? x.num + '. ' : '') + esc(x.text.slice(0, 70)) + '</option>').join('') + '</select>';
  let h = '<div class="card"><label class="f" style="margin-top:0">Lignes</label>' + sel(S.cx1, 'S.cx1') + '<label class="f">Colonnes</label>' + sel(S.cx2, 'S.cx2') + '</div>';
  const m = {}; let N = 0;
  for (const f of D) {
    const a = valOf(f, q1), b = valOf(f, q2); if (a == null || b == null || a === '' || b === '') continue;
    (m[a] = m[a] || {})[b] = ((m[a] || {})[b] || 0) + 1; N++;
  }
  const R = q1.opts.filter(o => m[o]), rt = {}, ct = {};
  R.forEach(r => Object.keys(m[r]).forEach(c => { rt[r] = (rt[r] || 0) + m[r][c]; ct[c] = (ct[c] || 0) + m[r][c]; }));
  const C = q2.opts.filter(o => ct[o]);
  if (R.length < 1 || C.length < 1) return h + '<div class="card muted">Pas assez de réponses croisées.</div>';
  h += '<div class="card scroll"><table><tr><th></th>' + C.map(c => '<th>' + esc(c) + '</th>').join('') + '<th>Total</th></tr>';
  for (const r of R) {
    h += '<tr><th>' + esc(r) + '</th>' + C.map(c => { const n = (m[r] || {})[c] || 0; return '<td>' + n + '<br><span class="muted">' + (rt[r] ? (n / rt[r] * 100).toFixed(0) : 0) + ' %</span></td>'; }).join('') + '<td><b>' + rt[r] + '</b></td></tr>';
  }
  h += '<tr><th>Total</th>' + C.map(c => '<td><b>' + ct[c] + '</b></td>').join('') + '<td><b>' + N + '</b></td></tr></table><p class="muted" style="font-size:13px">Pourcentages calculés par ligne.</p></div>';
  if (R.length > 1 && C.length > 1) {
    let chi = 0, low = 0;
    for (const r of R) for (const c of C) { const e = rt[r] * ct[c] / N, o = (m[r] || {})[c] || 0; chi += (o - e) * (o - e) / e; if (e < 5) low++; }
    const df = (R.length - 1) * (C.length - 1), p = chiP(chi, df), V = Math.sqrt(chi / (N * Math.min(R.length - 1, C.length - 1)));
    h += '<div class="verdict"><b>Test du khi-deux</b><br>χ² = ' + chi.toFixed(2) + ' · ddl = ' + df + ' · p ' + (p < 0.001 ? '< 0,001' : '= ' + p.toFixed(3).replace('.', ',')) + ' · V de Cramér = ' + V.toFixed(2).replace('.', ',') + '<br>' +
      (p < 0.05 ? 'Les deux variables sont liées de façon statistiquement significative (seuil de 5 %).' : 'Pas de lien statistiquement significatif au seuil de 5 %.') +
      (low > R.length * C.length * 0.2 ? '<br><span class="muted">Attention : plus de 20 % des cases ont un effectif théorique inférieur à 5. Regroupez des modalités ou prenez plus de fiches.</span>' : '') + '</div>';
  }
  return h;
}

const PAL = ['#1d5f8f', '#c98080', '#e0a82e', '#2e7d4f', '#7a5aa6', '#d2692f', '#3a9aa8'];
function mapHTML(qid) {
  const D = dataset(qid).filter(f => f.lat != null);
  if (!D.length) return '<div class="card muted">Aucun point GPS enregistré. Utilisez « Prendre la position GPS » lors de la saisie.</div>';
  const la = D.map(f => f.lat), ln = D.map(f => f.lng);
  const a0 = Math.min(...la), a1 = Math.max(...la), o0 = Math.min(...ln), o1 = Math.max(...ln);
  const k = Math.cos((a0 + a1) / 2 * Math.PI / 180);
  let w = (o1 - o0) * k, h = a1 - a0; if (w < 1e-4) w = 1e-4; if (h < 1e-4) h = 1e-4;
  const W = 340, H = 300, P = 24, s = Math.min((W - 2 * P) / w, (H - 2 * P) / h), ox = (W - w * s) / 2, oy = (H - h * s) / 2;
  let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="background:#fff;border:1px solid var(--trait);border-radius:10px"><text x="8" y="16" fill="#5d6b7a">Nord ↑</text>';
  for (const f of D) {
    const x = ox + (f.lng - o0) * k * s, y = H - (oy + (f.lat - a0) * s), c = PAL[Math.max(0, QUARTIERS.indexOf(f.quartier)) % PAL.length];
    svg += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="6" fill="' + c + '" fill-opacity=".8" stroke="#fff"/>';
  }
  svg += '</svg>';
  const leg = '<div class="chips">' + QUARTIERS.map((q, i) => '<span class="chip"><span style="color:' + PAL[i % PAL.length] + '">●</span> ' + esc(q) + ' (' + D.filter(f => f.quartier === q).length + ')</span>').join('') + '</div>';
  return '<div class="card">' + svg + leg + '<p class="muted" style="font-size:13px">' + D.length + ' points. Pour une vraie carte (QGIS, Google Earth), exportez en GeoJSON dans l’onglet Données.</p></div>';
}

/* ---------- Données : synchronisation, export, partage ---------- */
const SB = () => window.SUPABASE_URL && window.SUPABASE_KEY && String(window.SUPABASE_URL).indexOf('VOTRE') < 0;
function sbReq(path, method, body, extra) {
  return fetch(window.SUPABASE_URL + '/rest/v1/' + path, {
    method: method,
    headers: Object.assign({ apikey: window.SUPABASE_KEY, Authorization: 'Bearer ' + window.SUPABASE_KEY, 'Content-Type': 'application/json' }, extra || {}),
    body: body ? JSON.stringify(body) : undefined
  });
}
async function pushFiches() {
  const todo = fiches().filter(f => !f.synced && (isDir() || f.enq === S.user.id));
  if (!todo.length) return 0;
  const rows = todo.map(f => ({ id: f.id, qid: f.qid, enq: f.enq, quartier: f.quartier, date: f.date, lat: f.lat, lng: f.lng, acc: f.acc, rep: f.rep }));
  const r = await sbReq('fiches', 'POST', rows, { Prefer: 'resolution=merge-duplicates,return=minimal' });
  if (!r.ok) throw new Error(await r.text());
  const ids = new Set(todo.map(f => f.id));
  saveFiches(fiches().map(f => ids.has(f.id) ? Object.assign(f, { synced: true }) : f));
  return todo.length;
}
async function pullFiches() {
  const r = await sbReq('fiches?select=*&order=date.asc', 'GET');
  if (!r.ok) throw new Error(await r.text());
  const rows = await r.json(), have = new Set(fiches().map(f => f.id)), all = fiches(); let n = 0;
  for (const x of rows) if (!have.has(x.id)) { all.push({ id: x.id, qid: x.qid, enq: x.enq, quartier: x.quartier, date: x.date, lat: x.lat, lng: x.lng, acc: x.acc, rep: x.rep || {}, synced: true }); n++; }
  saveFiches(all); return n;
}
async function autoSync() {
  if (!SB() || !navigator.onLine || !S.user) return;
  try { await pushFiches(); if (isDir()) await pullFiches(); if (S.user && S.tab !== 'fiche') render(); } catch (e) { /* silencieux : nouvel essai à la prochaine connexion */ }
}
async function syncNow() {
  if (!SB()) { toast('Serveur non configuré : utilisez le partage WhatsApp'); return; }
  if (!navigator.onLine) { toast('Pas de connexion Internet'); return; }
  try {
    const a = await pushFiches(); const b = isDir() ? await pullFiches() : 0;
    toast(a + ' fiche(s) envoyée(s)' + (isDir() ? ', ' + b + ' reçue(s)' : '')); render();
  } catch (e) { toast('Échec de la synchronisation'); }
}
async function shareWA() {
  const mine = fiches().filter(f => f.enq === S.user.id);
  if (!mine.length) { toast('Aucune fiche à partager'); return; }
  const payload = JSON.stringify({ type: 'ens_fiches', de: S.user.id, date: new Date().toISOString(), fiches: mine });
  const name = 'fiches_' + S.user.id + '_' + new Date().toISOString().slice(0, 10) + '.json';
  const txt = 'Fiches d’enquête de ' + S.user.nom + ' (' + mine.length + ' fiches).';
  try {
    const file = new File([payload], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: txt }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  dl(name, payload, 'application/json');
  window.open('https://wa.me/' + DIR_WA + '?text=' + encodeURIComponent(txt + ' Le fichier ' + name + ' vient d’être téléchargé : joignez-le à ce message.'), '_blank');
}
function importFile(inp) {
  const f = inp.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result); if (d.type !== 'ens_fiches') throw 0;
      const all = fiches(), have = new Set(all.map(x => x.id)); let n = 0;
      for (const x of d.fiches) if (!have.has(x.id)) { all.push(Object.assign({}, x, { synced: true })); n++; }
      saveFiches(all); toast(n + ' nouvelle(s) fiche(s) importée(s)'); render();
    } catch (e) { toast('Fichier non reconnu'); }
  };
  r.readAsText(f); inp.value = '';
}
function csvCell(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
function exportCSV() {
  const qid = curQid(), qs = QUEST[qid].q, D = dataset(qid);
  if (!D.length) { toast('Aucune fiche à exporter'); return; }
  const head = ['id', 'enqueteur', 'quartier', 'date', 'latitude', 'longitude'].concat(qs.map(q => q.num + '. ' + q.text));
  const rows = D.map(f => [f.id, f.enq, f.quartier, f.date, f.lat, f.lng].concat(qs.map(q => {
    let v = f.rep[q.id]; if (Array.isArray(v)) v = v.join(' | ');
    if (f.rep[q.id + '_o']) v = (v ? v + ' : ' : '') + f.rep[q.id + '_o'];
    return v;
  })));
  dl('enquete_' + qid + '_' + new Date().toISOString().slice(0, 10) + '.csv', '\ufeff' + [head].concat(rows).map(r => r.map(csvCell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
}
function exportGeo() {
  const D = dataset(curQid()).filter(f => f.lat != null);
  if (!D.length) { toast('Aucun point GPS à exporter'); return; }
  const g = { type: 'FeatureCollection', features: D.map(f => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [f.lng, f.lat] }, properties: { id: f.id, quartier: f.quartier, enqueteur: f.enq, date: f.date, precision_m: f.acc == null ? null : Math.round(f.acc) } })) };
  dl('points_gps_' + curQid() + '.geojson', JSON.stringify(g), 'application/geo+json');
}
function donneesTab() {
  const mine = fiches().filter(f => isDir() || f.enq === S.user.id), pend = mine.filter(f => !f.synced).length;
  let h = qSelector() + '<h2>Données</h2>';
  h += '<div class="card"><b>État</b><p style="margin:6px 0">' + mine.length + ' fiche(s) sur ce téléphone, dont <b>' + pend + '</b> pas encore envoyée(s).</p>' +
    '<p class="muted" style="margin:0">' + (SB() ? 'Serveur configuré : l’envoi se fait seul dès que le téléphone a Internet.' : 'Serveur non configuré : partagez vos fiches par WhatsApp.') + '</p>' +
    (SB() ? '<button class="btn full" onclick="syncNow()">' + (isDir() ? 'Recevoir les nouvelles fiches' : 'Envoyer maintenant') + '</button>' : '') + '</div>';
  if (!isDir()) h += '<div class="card"><b>Envoyer au directeur</b><p class="muted" style="margin:6px 0">Partage un fichier de vos fiches via WhatsApp (choisissez M. Mpangieto).</p><button class="btn rose full" onclick="shareWA()">Partager par WhatsApp</button></div>';
  else h += '<div class="card"><b>Importer des fiches reçues</b><p class="muted" style="margin:6px 0">Ouvrez le fichier .json reçu par WhatsApp. Les fiches déjà présentes ne sont pas dupliquées.</p><input type="file" accept=".json,application/json" onchange="importFile(this)"></div>';
  h += '<div class="card"><b>Exporter</b><button class="btn sec full" onclick="exportCSV()">Tableau Excel (CSV)</button><button class="btn sec full" onclick="exportGeo()">Points GPS (GeoJSON, pour QGIS)</button></div>';
  h += '<div class="card"><button class="btn sec full" style="margin-top:0" onclick="if(confirm(\'Changer de mot de passe ?\')){S.user.must=true;render()}">Changer mon mot de passe</button></div>';
  return h;
}

/* ---------- Rendu général ---------- */
function topbar() {
  return '<div class="top"><img src="logo.png" alt=""><div class="t"><b>' + esc(S.user.nom) + '</b><span>' + (isDir() ? 'Directeur · consultation' : 'Enquêteur · ' + QUEST[S.user.qid].court) + '</span></div><span class="net">' + (navigator.onLine ? 'en ligne' : 'hors ligne') + '</span><button onclick="logout()">Sortir</button></div>';
}
function navbar() {
  const t = isDir() ? [['liste', '📋 Fiches'], ['analyse', '📊 Analyse'], ['donnees', '🗂 Données']] : [['fiche', '✏️ Saisir'], ['liste', '📋 Mes fiches'], ['analyse', '📊 Analyse'], ['donnees', '🗂 Données']];
  return '<nav class="tabs">' + t.map(x => '<button class="' + (S.tab === x[0] ? 'on' : '') + '" onclick="S.tab=\'' + x[0] + '\';render();window.scrollTo(0,0)">' + x[1] + '</button>').join('') + '</nav>';
}
function render() {
  const app = $('app');
  if (!S.user) { app.innerHTML = loginHTML(); return; }
  if (S.user.must) { app.innerHTML = pwHTML(); return; }
  let v = '';
  if (S.tab === 'fiche' && !isDir()) v = ficheTab();
  else if (S.tab === 'liste') v = listeTab();
  else if (S.tab === 'analyse') v = analyseTab();
  else v = donneesTab();
  app.innerHTML = topbar() + '<main>' + v + '</main>' + navbar();
  if (S.tab === 'fiche') applyShow();
}

/* ---------- Démarrage ---------- */
(async function () {
  S.users = await initUsers();
  const id = sessionStorage.getItem('ens_sess'), u = S.users.find(x => x.id === id);
  if (u) { S.user = u; S.tab = u.role === 'enq' ? 'fiche' : 'liste'; S.draft = LS.get(dk(), { quartier: '', gps: null, rep: {} }); }
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
  window.addEventListener('online', () => { if (S.user) { render(); autoSync(); } });
  window.addEventListener('offline', () => { if (S.user) render(); });
  autoSync();
})();
