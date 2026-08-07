/* FlexPlay — fixture engines.
   Pure functions: given entries + config + results so far, return the next round's matches.
   No DOM, no storage. Everything here is unit-testable in isolation. */
(function (global) {
  'use strict';

  const uid = (p) => p + '-' + Math.random().toString(36).slice(2, 9);

  /* ---------- sports ---------- */
  const SPORTS = {
    padel:      { name: 'Padel',       unit: 'points', side: 2, defaults: { target: 24, minutes: 12 } },
    tennis:     { name: 'Tennis',      unit: 'games',  side: 1, defaults: { target: 6,  minutes: 20 } },
    pickleball: { name: 'Pickleball',  unit: 'points', side: 2, defaults: { target: 11, minutes: 12 } },
    football:   { name: 'Football',    unit: 'goals',  side: 0, defaults: { target: 0,  minutes: 20 } },
    netball:    { name: 'Netball',     unit: 'goals',  side: 0, defaults: { target: 0,  minutes: 15 } },
    basketball: { name: 'Basketball',  unit: 'points', side: 0, defaults: { target: 0,  minutes: 16 } },
    volleyball: { name: 'Volleyball',  unit: 'points', side: 0, defaults: { target: 25, minutes: 20 } },
    cricket:    { name: 'Cricket',     unit: 'runs',   side: 0, defaults: { target: 0,  minutes: 40 } },
    generic:    { name: 'Any sport',   unit: 'points', side: 0, defaults: { target: 21, minutes: 15 } }
  };

  const FORMATS = {
    americano: { name: 'Americano',          entry: 'individual', desc: 'Rotating partners, individual points. Everyone plays with everyone.' },
    mexicano:  { name: 'Mexicano',           entry: 'individual', desc: 'Pairings set by live ranking each round — 1 & 4 vs 2 & 3.' },
    league:    { name: 'Round robin league', entry: 'either',     desc: 'Everyone plays everyone once. The table decides it.' },
    groups:    { name: 'Groups + knockout',  entry: 'either',     desc: 'Seeded groups, top N advance into the bracket.' },
    knockout:  { name: 'Straight knockout',  entry: 'either',     desc: 'Single elimination from round one. Byes auto-seeded.' },
    swiss:     { name: 'Swiss',              entry: 'either',     desc: 'Fixed rounds, matched on record. Nobody is eliminated.' },
    ladder:    { name: 'Ladder / king of court', entry: 'individual', desc: 'Winners move up a court, losers move down.' }
  };

  /* ---------- helpers ---------- */
  function shuffle(arr, seed) {
    const a = arr.slice();
    let s = seed || 1;
    const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function match(court, a, b, extra) {
    return Object.assign({
      id: uid('m'), court: court, a: a, b: b, sa: 0, sb: 0,
      status: 'open', submittedBy: null, stage: 'main'
    }, extra || {});
  }

  const pairKey = (x, y) => [x, y].sort().join('|');

  /* ---------- history: who has partnered / played whom / rested ---------- */
  function history(event) {
    const h = { partner: {}, opponent: {}, byes: {} };
    (event.entries || []).forEach(e => { h.byes[e.id] = 0; });
    (event.rounds || []).forEach(r => {
      (r.matches || []).forEach(m => {
        [m.a, m.b].forEach(side => {
          for (let i = 0; i < side.length; i++)
            for (let j = i + 1; j < side.length; j++)
              h.partner[pairKey(side[i], side[j])] = (h.partner[pairKey(side[i], side[j])] || 0) + 1;
        });
        m.a.forEach(x => m.b.forEach(y => {
          h.opponent[pairKey(x, y)] = (h.opponent[pairKey(x, y)] || 0) + 1;
        }));
      });
      (r.resting || []).forEach(id => { h.byes[id] = (h.byes[id] || 0) + 1; });
    });
    return h;
  }

  /* Rotating bye. Whoever has rested MOST gets first claim on a slot, so byes spread
     evenly instead of the same few players sitting out every round. */
  function selectPlaying(activeIds, capacity, byes) {
    if (capacity >= activeIds.length) return { playing: activeIds.slice(), resting: [] };
    const order = activeIds.slice().sort((x, y) => (byes[y] || 0) - (byes[x] || 0));
    const playing = order.slice(0, capacity);
    return { playing: playing, resting: activeIds.filter(id => playing.indexOf(id) === -1) };
  }

  /* ---------- AMERICANO: greedy social-golfer pairing ---------- */
  function americanoRound(event, activeIds, roundNo) {
    const h = history(event);
    const capacity = Math.min(event.config.courts * 4, Math.floor(activeIds.length / 4) * 4);
    const sel = selectPlaying(activeIds, capacity, h.byes);
    let pool = sel.playing;
    const resting = sel.resting;

    // Build pairs minimising repeat partners.
    const pairs = [];
    const left = shuffle(pool, roundNo * 17 + 3);
    while (left.length > 1) {
      const a = left.shift();
      let best = 0, bestScore = Infinity;
      left.forEach((b, i) => {
        const score = (h.partner[pairKey(a, b)] || 0) * 10 + (h.opponent[pairKey(a, b)] || 0);
        if (score < bestScore) { bestScore = score; best = i; }
      });
      pairs.push([a, left.splice(best, 1)[0]]);
    }

    // Pair the pairs into matches, minimising repeat opponents.
    const matches = [];
    let court = 1;
    while (pairs.length > 1) {
      const p = pairs.shift();
      let best = 0, bestScore = Infinity;
      pairs.forEach((q, i) => {
        let s = 0;
        p.forEach(x => q.forEach(y => { s += h.opponent[pairKey(x, y)] || 0; }));
        if (s < bestScore) { bestScore = s; best = i; }
      });
      const q = pairs.splice(best, 1)[0];
      matches.push(match(court++, p, q));
    }
    return { matches: matches, resting: resting };
  }

  /* ---------- MEXICANO: rank-ordered fours, 1 & 4 vs 2 & 3 ---------- */
  function mexicanoRound(event, activeIds, roundNo, table) {
    const rank = table.filter(r => activeIds.indexOf(r.id) !== -1).map(r => r.id);
    activeIds.forEach(id => { if (rank.indexOf(id) === -1) rank.push(id); });

    const h = history(event);
    const capacity = Math.min(event.config.courts * 4, Math.floor(activeIds.length / 4) * 4);
    const sel = selectPlaying(activeIds, capacity, h.byes);
    // rank order decides the pairings; bye fairness decides who is in the pool
    const playing = rank.filter(id => sel.playing.indexOf(id) !== -1);
    const resting = sel.resting;

    const matches = [];
    for (let i = 0, court = 1; i + 3 < playing.length; i += 4, court++) {
      const f = playing.slice(i, i + 4); // [1st, 2nd, 3rd, 4th] of this court
      const top = event.config.mexicanoRule === 'top-together';
      matches.push(top ? match(court, [f[0], f[1]], [f[2], f[3]])
                       : match(court, [f[0], f[3]], [f[1], f[2]]));
    }
    return { matches: matches, resting: resting };
  }

  /* ---------- ROUND ROBIN: circle method, whole schedule at once ---------- */
  function roundRobinSchedule(ids, courts, stage, groupName) {
    const list = ids.slice();
    if (list.length % 2) list.push(null); // bye marker
    const n = list.length, rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const ms = [], resting = [];
      let court = 1;
      for (let i = 0; i < n / 2; i++) {
        const a = list[i], b = list[n - 1 - i];
        if (a === null) { resting.push(b); continue; }
        if (b === null) { resting.push(a); continue; }
        ms.push(match(((court - 1) % courts) + 1, [a], [b], { stage: stage || 'main', group: groupName || null }));
        court++;
      }
      rounds.push({ matches: ms, resting: resting });
      list.splice(1, 0, list.pop()); // rotate, first fixed
    }
    return rounds;
  }

  /* ---------- SWISS: pair on record, avoid rematches ---------- */
  function swissRound(event, activeIds, table) {
    const h = history(event);
    const order = table.filter(r => activeIds.indexOf(r.id) !== -1).map(r => r.id);
    activeIds.forEach(id => { if (order.indexOf(id) === -1) order.push(id); });

    const pool = order.slice(), matches = [], resting = [];
    let court = 1;
    if (pool.length % 2) {
      // fewest byes so far gets the bye
      let idx = pool.length - 1, min = Infinity;
      pool.forEach((id, i) => { if ((h.byes[id] || 0) < min) { min = h.byes[id] || 0; idx = i; } });
      resting.push(pool.splice(idx, 1)[0]);
    }
    while (pool.length > 1) {
      const a = pool.shift();
      let idx = 0;
      for (let i = 0; i < pool.length; i++) {
        if (!h.opponent[pairKey(a, pool[i])]) { idx = i; break; }
        idx = 0;
      }
      matches.push(match(((court - 1) % event.config.courts) + 1, [a], [pool.splice(idx, 1)[0]]));
      court++;
    }
    return { matches: matches, resting: resting };
  }

  /* ---------- LADDER: court 1 is the top; winners up, losers down ---------- */
  function ladderRound(event, activeIds, roundNo, table) {
    let order;
    if (roundNo === 1 || !event.ladderOrder) {
      order = shuffle(activeIds, 7);
    } else {
      order = event.ladderOrder.filter(id => activeIds.indexOf(id) !== -1);
      activeIds.forEach(id => { if (order.indexOf(id) === -1) order.push(id); });
    }
    const matches = [], resting = [];
    let court = 1;
    let queue = order.slice();
    if (queue.length % 2) {
      // bottom of the ladder sits out, but rotate among the tail so it is not always the same player
      const h = history(event);
      const tail = queue.slice(-3);
      tail.sort((x, y) => (h.byes[x] || 0) - (h.byes[y] || 0));
      const out = tail[0];
      resting.push(out);
      queue = queue.filter(id => id !== out);
    }
    for (let i = 0; i + 1 < queue.length; i += 2) {
      matches.push(match(court++, [queue[i]], [queue[i + 1]]));
    }
    return { matches: matches, resting: resting, order: order };
  }

  function ladderReorder(order, matches) {
    const next = order.slice();
    matches.forEach(m => {
      if (m.status !== 'final') return;
      const a = m.a[0], b = m.b[0];
      const ia = next.indexOf(a), ib = next.indexOf(b);
      if (ia === -1 || ib === -1) return;
      const aWon = m.sa > m.sb;
      // winner takes the higher slot of the pair
      if (aWon && ia > ib) { next[ib] = a; next[ia] = b; }
      if (!aWon && ib > ia) { next[ia] = b; next[ib] = a; }
    });
    // winners rise one court, losers drop one
    return next;
  }

  /* ---------- KNOCKOUT bracket ---------- */
  function nextPow2(n) { let p = 1; while (p < n) p *= 2; return p; }

  function knockoutBracket(seedIds, courts, stageLabel) {
    const size = nextPow2(seedIds.length);
    const seeds = seedIds.slice();
    while (seeds.length < size) seeds.push(null); // byes

    // standard seeding order: 1 v 16, 8 v 9, ...
    const order = [0];
    for (let len = 1; len < size; len *= 2) {
      const next = [];
      order.forEach(s => { next.push(s, len * 2 - 1 - s); });
      order.length = 0;
      Array.prototype.push.apply(order, next);
    }
    const ms = [];
    for (let i = 0; i < size; i += 2) {
      const a = seeds[order[i]], b = seeds[order[i + 1]];
      ms.push(match(((i / 2) % courts) + 1,
        a === null ? [] : [a], b === null ? [] : [b],
        { stage: stageLabel || roundName(size), bracketRound: 1, slot: i / 2 }));
    }
    return ms;
  }

  function roundName(size) {
    if (size === 2) return 'Final';
    if (size === 4) return 'Semi-final';
    if (size === 8) return 'Quarter-final';
    if (size === 16) return 'Round of 16';
    return 'Round of ' + size;
  }

  function nextBracketRound(prevMatches, courts) {
    const winners = prevMatches.slice()
      .sort((x, y) => x.slot - y.slot)
      .map(m => {
        if (!m.a.length) return m.b[0] || null;
        if (!m.b.length) return m.a[0] || null;
        if (m.status !== 'final') return null;
        return m.sa >= m.sb ? m.a[0] : m.b[0];
      });
    if (winners.some(w => w === null)) return null; // round not complete
    const size = winners.length;
    const ms = [];
    for (let i = 0; i < size; i += 2) {
      ms.push(match(((i / 2) % courts) + 1, [winners[i]], [winners[i + 1]],
        { stage: roundName(size), bracketRound: (prevMatches[0].bracketRound || 1) + 1, slot: i / 2 }));
    }
    return ms;
  }

  /* ---------- GROUPS ---------- */
  function splitGroups(ids, groupCount) {
    const groups = [];
    for (let i = 0; i < groupCount; i++) groups.push([]);
    // snake draft keeps seeded strength even
    ids.forEach((id, i) => {
      const lap = Math.floor(i / groupCount);
      const pos = lap % 2 === 0 ? i % groupCount : groupCount - 1 - (i % groupCount);
      groups[pos].push(id);
    });
    return groups;
  }

  const GROUP_LETTERS = 'ABCDEFGH';

  /* ---------- STANDINGS ----------
     Tie-break: points, then points difference, then head-to-head, then points scored. */
  function standings(event) {
    const rows = {};
    const active = event.entries.filter(e => !e.withdrawn || e.withdrawnMode !== 'void');
    event.entries.forEach(e => {
      rows[e.id] = { id: e.id, name: e.name, ref: e.ref, group: e.group || null,
        played: 0, won: 0, lost: 0, drawn: 0, pf: 0, pa: 0, pts: 0, withdrawn: !!e.withdrawn };
    });
    const h2h = {};
    const isIndividual = event.entryMode === 'individual';

    (event.rounds || []).forEach(r => {
      (r.matches || []).forEach(m => {
        if (m.status !== 'final') return;
        if (m.voided) return;
        const aWin = m.sa > m.sb, draw = m.sa === m.sb;
        const apply = (ids, forPts, agPts, result) => {
          ids.forEach(id => {
            const row = rows[id]; if (!row) return;
            row.played++; row.pf += forPts; row.pa += agPts;
            if (result === 'w') { row.won++; }
            else if (result === 'l') { row.lost++; }
            else { row.drawn++; }
            // Americano/Mexicano: your points ARE your score. Others: 3/1/0.
            row.pts += isIndividual && (event.format === 'americano' || event.format === 'mexicano')
              ? forPts
              : (result === 'w' ? 3 : result === 'd' ? 1 : 0);
          });
        };
        apply(m.a, m.sa, m.sb, draw ? 'd' : aWin ? 'w' : 'l');
        apply(m.b, m.sb, m.sa, draw ? 'd' : aWin ? 'l' : 'w');
        m.a.forEach(x => m.b.forEach(y => {
          h2h[x + '>' + y] = (h2h[x + '>' + y] || 0) + (aWin ? 1 : draw ? 0 : -1);
          h2h[y + '>' + x] = (h2h[y + '>' + x] || 0) + (aWin ? -1 : draw ? 0 : 1);
        }));
      });
    });

    const list = Object.keys(rows).map(k => rows[k]);
    list.sort((x, y) =>
      y.pts - x.pts ||
      (y.pf - y.pa) - (x.pf - x.pa) ||
      (h2h[y.id + '>' + x.id] || 0) - (h2h[x.id + '>' + y.id] || 0) ||
      y.pf - x.pf ||
      x.name.localeCompare(y.name)
    );
    list.forEach((r, i) => { r.pos = i + 1; });
    return list;
  }

  function groupStandings(event) {
    const all = standings(event);
    const byGroup = {};
    all.forEach(r => {
      const g = r.group || '-';
      (byGroup[g] = byGroup[g] || []).push(r);
    });
    Object.keys(byGroup).forEach(g => byGroup[g].forEach((r, i) => { r.pos = i + 1; }));
    return byGroup;
  }

  /* ---------- ROUND GENERATION (the one entry point the UI calls) ---------- */
  function generateNextRound(event) {
    const activeIds = event.entries.filter(e => !e.withdrawn).map(e => e.id);
    const roundNo = (event.rounds || []).length + 1;
    const table = standings(event);

    switch (event.format) {
      case 'americano': return americanoRound(event, activeIds, roundNo);
      case 'mexicano':  return mexicanoRound(event, activeIds, roundNo, table);
      case 'swiss':     return swissRound(event, activeIds, table);
      case 'ladder': {
        const prev = (event.rounds || [])[roundNo - 2];
        if (prev && event.ladderOrder) event.ladderOrder = ladderReorder(event.ladderOrder, prev.matches);
        const r = ladderRound(event, activeIds, roundNo, table);
        event.ladderOrder = r.order;
        return r;
      }
      default: return null; // league / groups / knockout are pre-scheduled
    }
  }

  /* Formats whose whole schedule is drawn up front. */
  function buildSchedule(event) {
    const ids = event.seedOrder && event.seedOrder.length
      ? event.seedOrder.slice()
      : shuffle(event.entries.map(e => e.id), 11);
    const courts = event.config.courts;

    if (event.format === 'league') {
      return { rounds: roundRobinSchedule(ids, courts, 'main') };
    }
    if (event.format === 'knockout') {
      return { rounds: [{ matches: knockoutBracket(ids, courts), resting: [] }], stage: 'knockout' };
    }
    if (event.format === 'groups') {
      const groups = splitGroups(ids, event.config.groups);
      groups.forEach((g, i) => g.forEach(id => {
        const e = event.entries.find(x => x.id === id);
        if (e) e.group = GROUP_LETTERS[i];
      }));
      // interleave each group's round-robin so groups play in parallel
      const perGroup = groups.map((g, i) => roundRobinSchedule(g, courts, 'group', GROUP_LETTERS[i]));
      const maxLen = Math.max.apply(null, perGroup.map(r => r.length));
      const rounds = [];
      for (let r = 0; r < maxLen; r++) {
        const ms = [], resting = [];
        perGroup.forEach(gr => {
          if (!gr[r]) return;
          Array.prototype.push.apply(ms, gr[r].matches);
          Array.prototype.push.apply(resting, gr[r].resting);
        });
        ms.forEach((m, i) => { m.court = (i % courts) + 1; });
        rounds.push({ matches: ms, resting: resting });
      }
      return { rounds: rounds, stage: 'group' };
    }
    // americano / mexicano / swiss / ladder: first round only, rest generated live
    const first = generateNextRound(event);
    return { rounds: [first] };
  }

  /* Group phase finished → who advances */
  function qualifiers(event) {
    const byGroup = groupStandings(event);
    const perGroup = event.config.advance || 2;
    const out = [];
    Object.keys(byGroup).sort().forEach(g => {
      byGroup[g].slice(0, perGroup).forEach(r => out.push(r));
    });
    // seed across groups: all winners first, then all runners-up, etc.
    out.sort((x, y) => x.pos - y.pos || y.pts - x.pts || (y.pf - y.pa) - (x.pf - x.pa));
    return out.map(r => r.id);
  }

  global.Engines = {
    SPORTS, FORMATS, GROUP_LETTERS,
    buildSchedule, generateNextRound, standings, groupStandings, selectPlaying,
    knockoutBracket, nextBracketRound, roundName, qualifiers, shuffle, uid, history
  };
})(window);
