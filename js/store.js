/* FlexPlay — storage layer.
   Everything lives in localStorage today. Every read/write goes through this module and
   every mutation is queued in `outbox`, so swapping in Supabase/Firebase later means
   implementing Store.sync() and nothing else in the app changes. */
(function (global) {
  'use strict';

  const KEY = 'flexplay.v1';
  const uid = Engines.uid;

  const blank = () => ({
    version: 1,
    seenIntro: false,
    events: [],
    players: [],   // permanent refs; stats accrue here across events and sports
    outbox: [],    // pending mutations for a future backend
    settings: { deviceName: 'Organiser' }
  });

  let db = blank();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) db = Object.assign(blank(), JSON.parse(raw));
    } catch (e) { console.warn('FlexPlay: could not read local data', e); }
    return db;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch (e) { console.warn('FlexPlay: could not save', e); }
  }

  /* Every change is recorded, so a backend can replay them when one exists. */
  function record(type, payload) {
    db.outbox.push({ id: uid('op'), type, payload, at: Date.now() });
    if (db.outbox.length > 500) db.outbox.splice(0, db.outbox.length - 500);
    save();
  }

  /* ---------- players (permanent refs) ---------- */
  function nextRef(sport) {
    const prefix = (sport || 'gen').slice(0, 3).toUpperCase();
    const n = db.players.filter(p => p.ref.indexOf(prefix) === 0).length + 1;
    return prefix + '-' + String(n).padStart(4, '0');
  }

  function findPlayerByName(name) {
    const k = name.trim().toLowerCase();
    return db.players.find(p => p.name.trim().toLowerCase() === k) || null;
  }

  function ensurePlayer(name, sport) {
    let p = findPlayerByName(name);
    if (p) return p;
    p = {
      id: uid('p'), ref: nextRef(sport), name: name.trim(), coach: '', createdAt: Date.now(),
      stats: { played: 0, won: 0, lost: 0, drawn: 0, pf: 0, pa: 0, events: 0 },
      bySport: {}
    };
    db.players.push(p);
    record('player.create', p);
    return p;
  }

  function player(id) { return db.players.find(p => p.id === id) || null; }

  /* Write an approved result into the permanent record. Called once per final match. */
  function applyResultToPlayers(event, m) {
    if (event.entryMode !== 'individual') return;
    const sport = event.sport;
    const bump = (ids, forPts, agPts, res) => {
      ids.forEach(eid => {
        const entry = event.entries.find(e => e.id === eid);
        if (!entry || !entry.playerId) return;
        const p = player(entry.playerId);
        if (!p) return;
        const s = p.stats;
        s.played++; s.pf += forPts; s.pa += agPts;
        if (res === 'w') s.won++; else if (res === 'l') s.lost++; else s.drawn++;
        const bs = p.bySport[sport] = p.bySport[sport] || { played: 0, won: 0, pf: 0, pa: 0 };
        bs.played++; bs.pf += forPts; bs.pa += agPts;
        if (res === 'w') bs.won++;
      });
    };
    const draw = m.sa === m.sb, aWin = m.sa > m.sb;
    bump(m.a, m.sa, m.sb, draw ? 'd' : aWin ? 'w' : 'l');
    bump(m.b, m.sb, m.sa, draw ? 'd' : aWin ? 'l' : 'w');
    record('result.approved', { eventId: event.id, matchId: m.id, sa: m.sa, sb: m.sb });
  }

  /* ---------- events ---------- */
  function newDraft() {
    return {
      id: uid('e'),
      name: '',
      sport: 'padel',
      format: 'americano',
      entryMode: 'individual',
      entries: [],
      seedOrder: [],
      config: {
        courts: 2, target: 24, minutes: 12, endBy: 'points',
        rounds: 7, groups: 2, advance: 2, koEntry: 'none',
        mexicanoRule: 'standard', allowPlayerScores: true
      },
      rounds: [],
      bracket: [],
      stage: 'setup',
      locked: false,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  function saveEvent(ev) {
    ev.updatedAt = Date.now();
    const i = db.events.findIndex(e => e.id === ev.id);
    if (i === -1) { db.events.unshift(ev); record('event.create', { id: ev.id, name: ev.name }); }
    else { db.events[i] = ev; record('event.update', { id: ev.id }); }
    save();
    return ev;
  }

  function event(id) { return db.events.find(e => e.id === id) || null; }
  function removeEvent(id) {
    db.events = db.events.filter(e => e.id !== id);
    record('event.delete', { id });
    save();
  }

  /* ---------- share link (dormant until a backend exists) ----------
     Today this encodes a read-only snapshot into the URL so a spectator on the same
     network — or anyone you send the link to — can open a live board. It is capped:
     very large events fall back to "organiser device only". */
  function shareSnapshot(ev) {
    const slim = {
      n: ev.name, s: ev.sport, f: ev.format, st: ev.stage,
      e: ev.entries.map(x => [x.id, x.name]),
      r: (ev.rounds || []).map(r => ({
        m: r.matches.map(m => [m.court, m.a, m.b, m.sa, m.sb, m.status]),
        b: r.resting || []
      }))
    };
    try {
      const json = JSON.stringify(slim);
      const b64 = btoa(unescape(encodeURIComponent(json)));
      return b64.length > 8000 ? null : b64;
    } catch (e) { return null; }
  }

  function readShared() {
    const h = location.hash || '';
    if (h.indexOf('#board=') !== 0) return null;
    try {
      const json = decodeURIComponent(escape(atob(h.slice(7))));
      return JSON.parse(json);
    } catch (e) { return null; }
  }

  /* ---------- backend seam ----------
     Implement these two against Supabase/Firebase and the app becomes multi-device.
     Until then they resolve immediately and the outbox just accumulates. */
  const Backend = {
    enabled: false,
    async push(ops) { return { ok: true, applied: ops.length }; },
    async pull() { return { events: [], players: [] }; }
  };

  async function sync() {
    if (!Backend.enabled || !navigator.onLine) return { synced: 0, queued: db.outbox.length };
    const ops = db.outbox.slice();
    const res = await Backend.push(ops);
    if (res && res.ok) { db.outbox = db.outbox.slice(ops.length); save(); }
    return { synced: ops.length, queued: db.outbox.length };
  }

  function exportJSON() { return JSON.stringify(db, null, 2); }
  function importJSON(text) {
    const parsed = JSON.parse(text);
    db = Object.assign(blank(), parsed);
    save();
    return db;
  }

  global.Store = {
    load, save, get db() { return db; },
    ensurePlayer, findPlayerByName, player, applyResultToPlayers, nextRef,
    newDraft, saveEvent, event, removeEvent,
    shareSnapshot, readShared,
    sync, Backend, record, exportJSON, importJSON,
    reset() { db = blank(); save(); }
  };
})(window);
