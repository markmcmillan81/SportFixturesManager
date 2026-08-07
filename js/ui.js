/* FlexPlay — UI layer. Plain DOM, no framework, no build step.
   One render() call redraws the current screen; event delegation handles every tap. */
(function () {
  'use strict';

  const E = Engines, S = Store;
  const BUILD = '1.4';
  const app = document.getElementById('app');
  const tabbar = document.getElementById('tabbar');
  const sheetEl = document.getElementById('sheet');
  const toastEl = document.getElementById('toast');

  let view = { screen: 'home', eventId: null, step: 1, tab: 'table', playerId: null, draft: null, sheet: null };
  let toastTimer = null;

  /* ---------- utils ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = sel => document.querySelector(sel);
  const initials = n => n.split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase();

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2400);
  }

  function nameOf(ev, id) {
    const e = ev.entries.find(x => x.id === id);
    return e ? e.name : '—';
  }
  const sideName = (ev, ids) => ids.length ? ids.map(id => nameOf(ev, id)).join(' & ') : 'Bye';

  function currentEvent() { return view.eventId ? S.event(view.eventId) : null; }

  function pendingApprovals(ev) {
    const out = [];
    (ev.rounds || []).forEach((r, ri) => r.matches.forEach(m => {
      if (m.status === 'submitted') out.push({ round: ri + 1, m });
    }));
    return out;
  }

  /* ---------- routing ---------- */
  function go(screen, opts) {
    Object.assign(view, { screen }, opts || {});
    render();
    window.scrollTo(0, 0);
  }

  /* ================= SCREENS ================= */

  function screenIntro() {
    return `
    <div class="intro">
      <img src="icons/logo.png" alt="FlexPlay" style="width:160px;height:auto;display:block;margin-bottom:18px">
      <h1 class="h1" style="margin:0 0 16px">Multi-sport fixtures, run from your pocket.</h1>
      <hr class="hr">
      <div class="rows" style="border-top:0">
        <div class="row row-static"><div class="h3">Seven formats</div><div class="small">Americano, Mexicano, league, groups, knockout, Swiss, ladder — one scoreboard.</div></div>
        <div class="row row-static"><div class="h3">Any sport</div><div class="small">Padel to kids' football. Individuals or teams with a coach.</div></div>
        <div class="row row-static"><div class="h3">Works with no signal</div><div class="small">Everything saves on the device. Add it to your home screen and it opens like an app.</div></div>
        <div class="row row-static"><div class="h3">Players keep a record</div><div class="small">Each player has a permanent reference. Matches, wins and points follow them across events.</div></div>
      </div>
      <button class="btn btn-primary" data-act="intro-done" onclick="window.FlexPlayStart&amp;&amp;window.FlexPlayStart()" style="margin-top:20px">Build your first tournament →</button>
      <div class="tiny" style="margin-top:14px">Build ${BUILD}</div>
    </div>`;
  }

  function screenHome() {
    const evs = S.db.events;
    const cards = evs.length ? evs.map(ev => {
      const live = ev.stage !== 'setup' && ev.stage !== 'done';
      const roundNo = (ev.rounds || []).length;
      return `<button class="row" data-act="open-event" data-id="${ev.id}">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span class="tag ${live ? 'tag-accent' : 'tag-neutral'}">${live ? 'Live' : ev.stage === 'done' ? 'Finished' : 'Setup'}</span>
          <span class="kicker">${esc(E.SPORTS[ev.sport].name)}</span>
        </div>
        <div class="h3">${esc(ev.name || 'Untitled event')}</div>
        <div class="small" style="margin-top:4px">${ev.entries.length} ${ev.entryMode === 'team' ? 'teams' : 'players'} · ${esc(E.FORMATS[ev.format].name)}${roundNo ? ' · round ' + roundNo : ''}</div>
      </button>`;
    }).join('') : `<div class="row row-static"><div class="small">No events yet. Build one — it takes about a minute.</div></div>`;

    const p = S.db.players.length;
    return `
    <div class="head">
      <div class="kicker">Organiser</div>
      <div class="head-row" style="margin-top:6px">
        <h2 class="h1">Your events</h2>
        <span class="small">${evs.length}</span>
      </div>
    </div>
    <div class="pad"><div class="rows" style="border-top:0">${cards}</div></div>
    <div class="pad" style="padding-top:18px">
      <button class="btn btn-primary" data-act="new-event">+ New tournament</button>
      <div class="grid2" style="margin-top:18px;background:transparent;border-top:2px solid var(--rule-strong)">
        <div class="cell cell-static" style="padding-left:0;border-bottom:1px solid var(--rule)">
          <div class="stat-v">${p}</div><div class="stat-k">Players on file</div></div>
        <div class="cell cell-static" style="border-bottom:1px solid var(--rule);border-left:1px solid var(--rule)">
          <div class="stat-v">${evs.filter(e => e.stage === 'done').length}</div><div class="stat-k">Events completed</div></div>
      </div>
      <div class="small" style="margin-top:18px">Data is stored on this device only. Export a backup from Share before you clear your browser.</div>
    </div>`;
  }

  /* ---------- builder ---------- */
  function screenBuilder() {
    const d = view.draft;
    const step = view.step;
    const titles = ['Sport', 'Format', 'Entries', 'Rules'];
    const subs = [
      'Sets the scoring vocabulary and sensible defaults.',
      'Seven engines, one scoreboard.',
      'Names match to existing references so history carries over.',
      'Then generate the fixtures.'
    ];
    let body = '';

    if (step === 1) {
      body = `<div class="pad" style="padding-top:16px">
        <div class="field"><label for="ev-name">Event name</label>
          <input class="input" id="ev-name" data-field="name" value="${esc(d.name)}" placeholder="Thursday Padel Americano"></div>
      </div>
      <div class="grid2">${Object.keys(E.SPORTS).map(k => `
        <button class="cell" data-act="pick-sport" data-v="${k}" aria-pressed="${d.sport === k}">
          <div style="font-size:15px;font-weight:800;letter-spacing:-.01em">${esc(E.SPORTS[k].name)}</div>
          <div style="font-size:11px;margin-top:2px;opacity:.65">${esc(E.SPORTS[k].unit)}</div>
        </button>`).join('')}</div>
      <div class="pad" style="padding-top:16px"><button class="btn btn-primary" data-act="step" data-v="2">Continue →</button></div>`;
    }

    if (step === 2) {
      body = `<div class="pad" style="padding-top:6px">
        <div class="rows" style="border-top:0">
        ${Object.keys(E.FORMATS).map(k => `
          <button class="row" data-act="pick-format" data-v="${k}">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="width:14px;height:14px;flex:none;border:2px solid var(--text);background:${d.format === k ? 'var(--accent)' : 'transparent'}"></span>
              <span style="font-size:16px;font-weight:800;letter-spacing:-.01em">${esc(E.FORMATS[k].name)}</span>
              <span class="tiny" style="margin-left:auto;font-weight:800;letter-spacing:.08em;text-transform:uppercase">${E.FORMATS[k].entry === 'individual' ? 'Individual' : E.FORMATS[k].entry === 'either' ? 'Either' : 'Teams'}</span>
            </div>
            <div class="small" style="margin:5px 0 0 22px">${esc(E.FORMATS[k].desc)}</div>
          </button>`).join('')}
        </div>
        <div class="field" style="margin-top:18px"><label>Entries are</label>
          <div class="seg">
            <button class="seg-opt" data-act="entry-mode" data-v="individual" aria-pressed="${d.entryMode === 'individual'}">Individuals</button>
            <button class="seg-opt" data-act="entry-mode" data-v="team" aria-pressed="${d.entryMode === 'team'}">Teams + coach</button>
          </div>
        </div>
        ${d.format === 'mexicano' ? `<div class="field"><label>Mexicano pairing</label>
          <div class="seg">
            <button class="seg-opt" data-act="cfg-seg" data-k="mexicanoRule" data-v="standard" aria-pressed="${d.config.mexicanoRule === 'standard'}">1 &amp; 4 v 2 &amp; 3</button>
            <button class="seg-opt" data-act="cfg-seg" data-k="mexicanoRule" data-v="top-together" aria-pressed="${d.config.mexicanoRule === 'top-together'}">1 &amp; 2 v 3 &amp; 4</button>
          </div></div>` : ''}
        ${d.format === 'groups' ? `
        <div class="flexline" style="padding:13px 0;border-top:2px solid var(--rule-strong)">
          <div><div style="font-size:14px;font-weight:700">Groups</div><div class="tiny">Entries are snaked across them</div></div>
          ${stepper('groups', d.config.groups)}
        </div>
        <div class="flexline" style="padding:13px 0;border-bottom:1px solid var(--rule)">
          <div><div style="font-size:14px;font-weight:700">Advance per group</div><div class="tiny">Into the knockout bracket</div></div>
          ${stepper('advance', d.config.advance)}
        </div>` : ''}
        <button class="btn btn-primary" data-act="step" data-v="3" style="margin-top:18px">Continue →</button>
      </div>`;
    }

    if (step === 3) {
      const isTeam = d.entryMode === 'team';
      const odd = d.entries.length % 2 !== 0;
      body = `<div class="pad" style="padding-top:16px">
        <div class="flexline" style="margin-bottom:10px">
          <span style="font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase">Entries · ${d.entries.length}</span>
          <button class="btn btn-out btn-sm" data-act="clear-entries">Clear</button>
        </div>
        <div class="field">
          <input class="input" id="entry-input" placeholder="${isTeam ? 'Team name' : 'Player name'} — type and press enter" autocomplete="off">
          ${isTeam ? '<input class="input" id="coach-input" placeholder="Coach (optional)" style="margin-top:8px" autocomplete="off">' : ''}
        </div>
        <div class="chips" id="entry-chips">
          ${d.entries.map((e, i) => `<span class="chip" draggable="true" data-idx="${i}">
            ${e.ref ? `<span class="mono-ref">${esc(e.ref)}</span>` : ''}${esc(e.name)}
            <button data-act="rm-entry" data-idx="${i}" aria-label="Remove">×</button></span>`).join('')}
        </div>
        <div class="small" style="margin-top:10px">Drag entries to set the seeding order. The draw is random unless you reorder them.</div>
        <div class="callout ${odd ? 'warn' : ''}" style="margin-top:16px">
          <div style="font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px">
            ${odd ? d.entries.length + ' entries — uneven' : d.entries.length + ' entries — even'}</div>
          <div class="body" style="color:#444141">${odd
            ? 'Odd number. Byes rotate automatically so nobody sits out twice before everyone has sat out once.'
            : 'Even number. No byes needed unless entries exceed your court count.'}</div>
        </div>
        <button class="btn btn-primary" data-act="step" data-v="4" style="margin-top:18px" ${d.entries.length < 2 ? 'disabled' : ''}>Continue →</button>
      </div>`;
    }

    if (step === 4) {
      const c = d.config;
      const timed = c.endBy === 'time' || c.endBy === 'both';
      const pointed = c.endBy === 'points' || c.endBy === 'both';
      const preScheduled = ['league', 'groups', 'knockout'].indexOf(d.format) !== -1;
      body = `<div class="pad" style="padding-top:16px">
        <div class="field"><label>A match ends on</label>
          <div class="seg">
            <button class="seg-opt" data-act="cfg-seg" data-k="endBy" data-v="points" aria-pressed="${c.endBy === 'points'}">Points</button>
            <button class="seg-opt" data-act="cfg-seg" data-k="endBy" data-v="time" aria-pressed="${c.endBy === 'time'}">Time</button>
            <button class="seg-opt" data-act="cfg-seg" data-k="endBy" data-v="both" aria-pressed="${c.endBy === 'both'}">Either</button>
          </div>
        </div>
        <div class="rows">
          ${cfgRow('Courts / pitches', 'Run in parallel', 'courts', c.courts)}
          ${pointed ? cfgRow('Points per match', 'First to this score', 'target', c.target) : ''}
          ${timed ? cfgRow('Minutes per match', 'Soft cap', 'minutes', c.minutes) : ''}
          ${!preScheduled ? cfgRow('Rounds', 'Generated one at a time', 'rounds', c.rounds) : ''}
          <div class="flexline" style="padding:13px 0;border-bottom:1px solid var(--rule)">
            <div><div style="font-size:14px;font-weight:700">Players can submit scores</div>
              <div class="tiny">You approve before anything counts</div></div>
            <button class="switch" data-act="toggle-approve" aria-checked="${!!c.allowPlayerScores}"><span></span></button>
          </div>
        </div>
        <div style="margin-top:18px;padding:16px;border:2px solid var(--text);background:var(--surface)">
          <div style="font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--accent-700);margin-bottom:8px">Ready to generate</div>
          <div class="h2">${esc(E.SPORTS[d.sport].name)} · ${esc(E.FORMATS[d.format].name)}</div>
          <div class="body" style="margin-top:6px;color:#444141">${summary(d)}</div>
        </div>
        <button class="btn btn-primary" data-act="generate" style="margin-top:16px">Generate fixtures →</button>
        <div class="small" style="margin-top:10px">The draw locks once round 1 starts. You can still handle drop-outs afterwards.</div>
      </div>`;
    }

    return `
    <div class="head">
      <div class="head-row">
        <button class="back" data-act="wiz-back">← Back</button>
        <span class="kicker">Step ${step} of 4</span>
      </div>
      <h2 class="h2" style="margin:10px 0 4px">${titles[step - 1]}</h2>
      <p class="small">${subs[step - 1]}</p>
      <div class="bars">${[1, 2, 3, 4].map(i => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>
    </div>${body}`;
  }

  function stepper(key, val) {
    return `<div class="stepper">
      <button class="step-btn" data-act="cfg" data-k="${key}" data-d="-1">−</button>
      <span class="step-val">${val}</span>
      <button class="step-btn" data-act="cfg" data-k="${key}" data-d="1">+</button>
    </div>`;
  }
  function cfgRow(label, hint, key, val) {
    return `<div class="flexline" style="padding:13px 0;border-bottom:1px solid var(--rule)">
      <div><div style="font-size:14px;font-weight:700">${label}</div><div class="tiny">${hint}</div></div>
      ${stepper(key, val)}</div>`;
  }
  function summary(d) {
    const c = d.config;
    const bits = [d.entries.length + (d.entryMode === 'team' ? ' teams' : ' players'), c.courts + ' courts'];
    if (c.endBy !== 'time') bits.push('first to ' + c.target);
    if (c.endBy !== 'points') bits.push(c.minutes + ' min cap');
    if (d.format === 'groups') bits.push(c.groups + ' groups, top ' + c.advance + ' advance');
    bits.push(c.allowPlayerScores ? 'player scores need approval' : 'organiser-only scoring');
    return bits.join(' · ');
  }

  /* ---------- live ---------- */
  function screenLive() {
    const ev = currentEvent();
    if (!ev) return screenHome();
    const rounds = ev.rounds || [];
    const r = rounds[rounds.length - 1];
    const roundNo = rounds.length;
    const pend = pendingApprovals(ev);
    const allDone = r ? r.matches.every(m => m.status === 'final' || !m.a.length || !m.b.length) : false;
    const preScheduled = ['league', 'groups', 'knockout'].indexOf(ev.format) !== -1;
    const moreScheduled = preScheduled && rounds.some(rr => rr.matches.some(m => m.status !== 'final'));

    const matches = r ? r.matches.map(m => {
      const bye = !m.a.length || !m.b.length;
      return `<div class="match">
        <div class="match-head">
          <span>${m.group ? 'Group ' + m.group + ' · ' : ''}${m.stage && m.stage !== 'main' && m.stage !== 'group' ? m.stage : 'Court ' + m.court}</span>
          <span style="font-weight:600;color:${m.status === 'final' ? '#bab6b6' : '#ff9783'}">${bye ? 'Bye' : m.status === 'final' ? 'Final' : m.status === 'submitted' ? 'Submitted' : 'In play'}</span>
        </div>
        <div class="match-body">
          <div class="side"><span class="side-name ${m.status === 'final' && m.sa > m.sb ? 'win' : ''}">${esc(sideName(ev, m.a))}</span><span class="side-score">${m.sa}</span></div>
          <div class="side"><span class="side-name ${m.status === 'final' && m.sb > m.sa ? 'win' : ''}">${esc(sideName(ev, m.b))}</span><span class="side-score">${m.sb}</span></div>
          ${bye ? '' : `<button class="btn btn-out" style="margin-top:12px" data-act="score" data-id="${m.id}">${m.status === 'final' ? 'Edit result' : 'Enter score'}</button>`}
        </div>
      </div>`;
    }).join('') : '<div class="small">No fixtures yet.</div>';

    const resting = (r && r.resting && r.resting.length)
      ? `<div class="callout" style="margin-bottom:14px">
          <div style="font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:6px">Resting this round</div>
          <div style="font-size:13.5px;font-weight:600;line-height:1.5">${r.resting.map(id => esc(nameOf(ev, id))).join(' · ')}</div>
          <div class="tiny" style="margin-top:4px">Byes rotate — these have rested least.</div>
        </div>` : '';

    let nextLabel, nextAct = 'next-round';
    if (!allDone) nextLabel = 'Waiting on ' + r.matches.filter(m => m.status !== 'final' && m.a.length && m.b.length).length + ' result(s)';
    else if (ev.stage === 'group') nextLabel = moreScheduled ? 'Next group round →' : 'Close groups → draw the knockout';
    else if (ev.stage === 'knockout') nextLabel = r.matches.length === 1 ? 'Finish tournament' : 'Next knockout round →';
    else if (preScheduled) nextLabel = moreScheduled ? 'Next round →' : 'Finish tournament';
    else if (roundNo >= ev.config.rounds) nextLabel = 'Finish tournament';
    else nextLabel = 'Close round ' + roundNo + ' → generate round ' + (roundNo + 1);

    return `
    <div class="head">
      <div class="head-row">
        <span class="kicker">${esc(E.SPORTS[ev.sport].name)} · ${esc(E.FORMATS[ev.format].name)}</span>
        <button class="back" data-act="event-menu">Manage</button>
      </div>
      <h2 class="h2" style="margin:6px 0 8px">${esc(ev.name || 'Untitled event')}</h2>
      <div style="display:flex;align-items:center;gap:10px">
        <span class="tag tag-accent" style="display:inline-flex;align-items:center;gap:5px"><i class="dot"></i>${ev.stage === 'knockout' ? 'Knockout' : 'Round ' + roundNo}</span>
        <span class="small">${ev.config.courts} courts · ${ev.config.endBy === 'time' ? ev.config.minutes + ' min' : 'first to ' + ev.config.target}</span>
      </div>
    </div>
    ${pend.length ? `<button class="banner" data-act="goto-approvals">
      <span class="tag tag-accent">${pend.length}</span>
      <span style="font-size:13px;font-weight:700">Player-submitted scores need approval</span>
      <span style="margin-left:auto;font-weight:800">→</span></button>` : ''}
    <div class="pad" style="padding-top:14px">
      ${matches}
      ${resting}
      <button class="btn ${allDone ? 'btn-dark' : 'btn-out'}" data-act="${nextAct}" ${allDone ? '' : 'disabled'}>${nextLabel}</button>
      <div style="height:20px"></div>
    </div>`;
  }

  /* ---------- approvals ---------- */
  function screenApprovals() {
    const ev = currentEvent();
    if (!ev) return screenHome();
    const pend = pendingApprovals(ev);
    return `
    <div class="head">
      <button class="back" data-act="goto-live">← Live</button>
      <h2 class="h2" style="margin:10px 0 4px">Approvals</h2>
      <p class="small">Submitted by players. Nothing reaches the table until you approve it.</p>
    </div>
    <div class="pad" style="padding-top:14px">
      ${pend.length ? pend.map(({ round, m }) => `
        <div style="border-bottom:1px solid var(--rule);padding-bottom:14px;margin-bottom:14px">
          <div class="kicker">Round ${round} · Court ${m.court}${m.submittedBy ? ' · from ' + esc(m.submittedBy) : ''}</div>
          <div class="flexline" style="margin-top:8px"><span class="side-name">${esc(sideName(ev, m.a))}</span><span style="font-size:22px;font-weight:800">${m.sa}</span></div>
          <div class="flexline" style="margin-top:4px"><span class="side-name">${esc(sideName(ev, m.b))}</span><span style="font-size:22px;font-weight:800">${m.sb}</span></div>
          <div class="row-btns" style="margin-top:12px">
            <button class="btn btn-primary" data-act="approve" data-id="${m.id}">Approve</button>
            <button class="btn btn-out" style="width:auto" data-act="score" data-id="${m.id}">Edit</button>
          </div>
        </div>`).join('')
      : '<div class="small" style="padding:20px 0">Queue clear.</div>'}
      <div class="callout dormant">
        <div style="font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px">Not live yet</div>
        <div class="body" style="color:#444141">Player submissions arrive here once a backend is connected. The approval flow is built and working — connect Supabase or Firebase in <code>js/store.js</code> and submissions start filling this queue.</div>
      </div>
    </div>`;
  }

  /* ---------- standings / bracket ---------- */
  function screenTable() {
    const ev = currentEvent();
    if (!ev) return screenHome();
    const hasGroups = ev.format === 'groups';
    const hasBracket = ev.format === 'knockout' || ev.stage === 'knockout' || (ev.bracket && ev.bracket.length);
    const tabs = [['table', hasGroups ? 'Groups' : 'Table']];
    if (hasBracket) tabs.push(['bracket', 'Bracket']);

    let body = '';
    if (view.tab === 'bracket' && hasBracket) {
      const rounds = (ev.rounds || []).filter(r => r.matches.some(m => m.stage && m.stage !== 'main' && m.stage !== 'group'));
      body = rounds.length ? rounds.map(r => r.matches.map(m => `
        <div class="tie ${m.status !== 'final' ? 'active' : ''}">
          <div class="tiny" style="font-weight:800;letter-spacing:.1em;text-transform:uppercase">${esc(m.stage)}</div>
          <div class="flexline" style="margin-top:6px"><span style="font-size:14px;font-weight:${m.status === 'final' && m.sa > m.sb ? 800 : 600}">${esc(sideName(ev, m.a))}</span><span style="font-size:14px;font-weight:800">${m.status === 'final' ? m.sa : '–'}</span></div>
          <div class="flexline" style="margin-top:2px"><span style="font-size:14px;font-weight:${m.status === 'final' && m.sb > m.sa ? 800 : 600}">${esc(sideName(ev, m.b))}</span><span style="font-size:14px;font-weight:800">${m.status === 'final' ? m.sb : '–'}</span></div>
        </div>`).join('')).join('')
        : '<div class="small">The bracket is drawn once the group phase closes.</div>';
    } else if (hasGroups) {
      const byGroup = E.groupStandings(ev);
      body = Object.keys(byGroup).sort().map(g => `
        <div style="margin-bottom:22px">
          <div class="kicker" style="margin-bottom:6px">Group ${esc(g)}</div>
          ${tableHead()}
          ${byGroup[g].map(r => tableRow(r, r.pos <= ev.config.advance)).join('')}
        </div>`).join('');
    } else {
      const rows = E.standings(ev);
      const qual = ev.config.advance || 4;
      body = tableHead() + rows.map(r => tableRow(r, ev.format !== 'league' && r.pos <= qual)).join('');
    }

    return `
    <div class="head">
      <h2 class="h2" style="margin:0 0 8px">Standings</h2>
      ${tabs.length > 1 ? `<div class="seg">${tabs.map(([k, l]) =>
        `<button class="seg-opt" data-act="table-tab" data-v="${k}" aria-pressed="${view.tab === k}">${l}</button>`).join('')}</div>` : ''}
    </div>
    <div class="pad" style="padding-top:12px">${body}
      <div class="small" style="margin-top:10px">Ties split on points difference, then head-to-head, then points scored.</div>
      <div style="height:20px"></div>
    </div>`;
  }

  function tableHead() {
    return `<div class="tbl-head"><span>#</span><span>Entry</span><span class="num">P</span><span class="num">W</span><span class="num">+/−</span><span class="num">Pts</span></div>`;
  }
  function tableRow(r, qual) {
    return `<button class="tbl-row ${qual ? 'qual' : ''}" data-act="open-entry" data-id="${esc(r.id)}">
      <span style="font-size:13px;font-weight:800;color:${qual ? 'var(--accent)' : 'var(--text)'}">${r.pos}</span>
      <span><span style="display:block;font-size:14px;font-weight:700;line-height:1.2">${esc(r.name)}</span>
        ${r.ref ? `<span class="mono-ref">${esc(r.ref)}</span>` : ''}</span>
      <span class="num">${r.played}</span><span class="num">${r.won}</span>
      <span class="num">${r.pf - r.pa > 0 ? '+' : ''}${r.pf - r.pa}</span>
      <span class="num-strong">${r.pts}</span></button>`;
  }

  /* ---------- players ---------- */
  function screenPlayers() {
    const list = S.db.players.slice().sort((a, b) => b.stats.played - a.stats.played);
    return `
    <div class="head">
      <h2 class="h2" style="margin:0 0 6px">Player database</h2>
      <p class="small">${list.length} references · history follows the reference, not the event.</p>
    </div>
    <div class="pad" style="padding-top:6px">
      ${list.length ? list.map(p => {
        const s = p.stats, pct = s.played ? Math.round(s.won / s.played * 100) : 0;
        return `<button class="row" data-act="open-player" data-id="${p.id}" style="display:flex;align-items:center;gap:12px">
          <span style="flex:none;width:38px;height:38px;background:var(--text);color:var(--bg);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800">${esc(initials(p.name))}</span>
          <span style="flex:1"><span style="display:block;font-size:15px;font-weight:700">${esc(p.name)}</span>
            <span class="mono-ref">${esc(p.ref)} · ${Object.keys(p.bySport).map(k => E.SPORTS[k] ? E.SPORTS[k].name : k).join(' · ') || 'no matches yet'}</span></span>
          <span style="flex:none;text-align:right"><span style="display:block;font-size:15px;font-weight:800">${pct}%</span>
            <span class="stat-k">win rate</span></span></button>`;
      }).join('') : '<div class="small" style="padding:20px 0">No players yet. They are created as you add entries to an event.</div>'}
      <div style="height:20px"></div>
    </div>`;
  }

  function screenProfile() {
    const p = S.player(view.playerId);
    if (!p) return screenPlayers();
    const s = p.stats, pct = s.played ? Math.round(s.won / s.played * 100) : 0;
    const stats = [['Matches', s.played], ['Won', s.won], ['Win rate', pct + '%'],
      ['Points won', s.pf], ['Points lost', s.pa], ['+/−', (s.pf - s.pa > 0 ? '+' : '') + (s.pf - s.pa)]];
    return `
    <div class="head">
      <button class="back" data-act="goto-players">← Database</button>
      <div style="display:flex;align-items:center;gap:14px;margin-top:14px">
        <span style="flex:none;width:56px;height:56px;background:var(--accent);color:var(--bg);display:flex;align-items:center;justify-content:center;font-size:19px;font-weight:800">${esc(initials(p.name))}</span>
        <div><h2 class="h2">${esc(p.name)}</h2>
          <div class="tiny" style="letter-spacing:.06em">${esc(p.ref)} · since ${new Date(p.createdAt).toLocaleDateString()}</div></div>
      </div>
    </div>
    <div class="grid3">${stats.map(([k, v]) => `<div class="cell cell-static"><div class="stat-v">${v}</div><div class="stat-k">${k}</div></div>`).join('')}</div>
    <div class="pad" style="padding-top:18px">
      <div style="font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px">By sport</div>
      ${Object.keys(p.bySport).length ? Object.keys(p.bySport).map(k => {
        const b = p.bySport[k], w = b.played ? Math.round(b.won / b.played * 100) : 0;
        return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--rule)">
          <span style="width:84px;flex:none;font-size:13px;font-weight:700">${esc(E.SPORTS[k] ? E.SPORTS[k].name : k)}</span>
          <span style="flex:1;height:10px;background:var(--surface);display:block"><span style="display:block;height:10px;width:${w}%;background:var(--accent)"></span></span>
          <span style="flex:none;font-size:12px;font-weight:600;color:var(--muted)">${b.won}–${b.played - b.won}</span></div>`;
      }).join('') : '<div class="small">No completed matches yet.</div>'}
      <div class="callout" style="margin-top:20px"><div class="body" style="color:#444141">Every approved result writes to this reference — matches, wins, points won and lost — across all sports and events.</div></div>
      <div style="height:20px"></div>
    </div>`;
  }

  /* ---------- share / spectator board ---------- */
  function screenShare() {
    const ev = currentEvent() || S.db.events[0];
    if (!ev) return `<div class="head"><h2 class="h2">Share</h2></div>
      <div class="pad" style="padding-top:16px"><div class="small">Create an event first.</div></div>`;
    const snap = S.shareSnapshot(ev);
    const url = snap ? location.origin + location.pathname + '#board=' + snap : null;
    return `
    <div class="head">
      <h2 class="h2" style="margin:0 0 6px">Share the board</h2>
      <p class="small">A read-only live board for players and spectators.</p>
    </div>
    <div class="pad" style="padding-top:16px">
      ${url ? `
        <button class="btn btn-primary" data-act="copy-link" data-url="${esc(url)}">Copy spectator link</button>
        <div class="small" style="margin-top:10px">This link carries a snapshot of the current board. Re-copy it after each round to update what spectators see.</div>`
      : `<div class="callout warn"><div class="body">This event is too large to fit in a link. Sharing needs a backend — see the note below.</div></div>`}
      <div class="callout dormant" style="margin-top:18px">
        <div style="font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px">Live sharing — not connected</div>
        <div class="body" style="color:#444141">Right now data lives on this device, so the link is a snapshot rather than a live feed. Connect a backend in <code>js/store.js</code> (<code>Store.Backend</code>) and this becomes a real-time board plus player score submission, with no other changes to the app.</div>
      </div>
      <hr class="hr" style="margin:22px 0">
      <div style="font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;margin-bottom:10px">Backup</div>
      <div class="row-btns">
        <button class="btn btn-out" data-act="export">Export data</button>
        <button class="btn btn-out" data-act="import">Import</button>
      </div>
      <div class="small" style="margin-top:10px">Keep a backup before clearing your browser — local data lives only in this browser.</div>
      <div style="height:20px"></div>
    </div>`;
  }

  function screenBoard(snap) {
    const nameById = {};
    snap.e.forEach(([id, n]) => { nameById[id] = n; });
    const last = snap.r[snap.r.length - 1] || { m: [], b: [] };
    return `<div style="background:var(--text);color:var(--bg);min-height:100vh;padding:18px">
      <div class="flexline">
        <span class="kicker" style="color:#bab6b6">Live board · shared link</span>
        <span style="display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#ff9783"><i class="dot" style="background:var(--accent)"></i>Live</span>
      </div>
      <h2 class="h1" style="margin:10px 0 2px;color:var(--bg)">${esc(snap.n)}</h2>
      <div style="font-size:13px;color:#bab6b6">${esc(E.FORMATS[snap.f] ? E.FORMATS[snap.f].name : snap.f)} · round ${snap.r.length}</div>
      <div style="height:2px;background:rgba(243,242,242,.35);margin:16px 0"></div>
      ${last.m.map(([court, a, b, sa, sb, st]) => `
        <div style="margin-bottom:16px">
          <div class="tiny" style="font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#bab6b6">Court ${court} · ${st === 'final' ? 'Final' : 'In play'}</div>
          <div class="flexline" style="margin-top:6px"><span style="font-size:15px;font-weight:700">${esc(a.map(i => nameById[i]).join(' & ') || 'Bye')}</span><span style="font-size:30px;font-weight:800">${sa}</span></div>
          <div class="flexline"><span style="font-size:15px;font-weight:700">${esc(b.map(i => nameById[i]).join(' & ') || 'Bye')}</span><span style="font-size:30px;font-weight:800">${sb}</span></div>
        </div>`).join('')}
      ${last.b && last.b.length ? `<div class="tiny" style="color:#bab6b6">Resting: ${esc(last.b.map(i => nameById[i]).join(' · '))}</div>` : ''}
      <div style="height:2px;background:rgba(243,242,242,.35);margin:16px 0"></div>
      <div class="tiny" style="color:#bab6b6">Snapshot taken by the organiser. Refresh from a newer link for later rounds.</div>
    </div>`;
  }

  /* ---------- score sheet ---------- */
  function renderSheet() {
    const ev = currentEvent();
    const id = view.sheet;
    if (!ev || !id) { sheetEl.hidden = true; sheetEl.innerHTML = ''; return; }
    let target = null;
    (ev.rounds || []).forEach(r => r.matches.forEach(m => { if (m.id === id) target = m; }));
    if (!target) { sheetEl.hidden = true; return; }
    const c = ev.config;
    const total = target.sa + target.sb;
    const fixedTotal = ev.format === 'americano' || ev.format === 'mexicano';

    sheetEl.innerHTML = `<div class="sheet">
      <div class="sheet-head">
        <div><div style="font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--accent)">Court ${target.court}</div>
          <div class="tiny">${navigator.onLine ? 'Saved on this device' : 'Offline — saved locally'}</div></div>
        <button class="sheet-close" data-act="close-sheet" aria-label="Close">×</button>
      </div>
      <div style="border-top:2px solid var(--rule-strong);margin-top:12px">
        <div class="score-row">
          <span class="side-name">${esc(sideName(ev, target.a))}</span>
          <button class="score-btn" data-act="pt" data-s="a" data-d="-1">−</button>
          <span class="score-val">${target.sa}</span>
          <button class="score-btn plus" data-act="pt" data-s="a" data-d="1">+</button>
        </div>
        <div class="score-row">
          <span class="side-name">${esc(sideName(ev, target.b))}</span>
          <button class="score-btn" data-act="pt" data-s="b" data-d="-1">−</button>
          <span class="score-val">${target.sb}</span>
          <button class="score-btn plus" data-act="pt" data-s="b" data-d="1">+</button>
        </div>
      </div>
      ${fixedTotal ? `<div class="flexline" style="padding:10px 0 14px"><span class="small">Points allotted this match</span>
        <span style="font-weight:800;color:${total === c.target ? 'var(--accent)' : 'var(--faint)'}">${total} / ${c.target}</span></div>`
      : '<div style="height:12px"></div>'}
      <button class="btn btn-primary" data-act="save-score">Save result</button>
    </div>`;
    sheetEl.hidden = false;
  }

  /* ---------- manage / drop-out sheet ---------- */
  function openManage() {
    const ev = currentEvent();
    if (!ev) return;
    sheetEl.innerHTML = `<div class="sheet">
      <div class="sheet-head">
        <div><div style="font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--accent)">Manage event</div>
        <div class="tiny">${ev.locked ? 'Draw locked — round 1 has started' : 'Draw not yet locked'}</div></div>
        <button class="sheet-close" data-act="close-sheet" aria-label="Close">×</button>
      </div>
      <div class="rows" style="margin-top:12px">
        ${ev.entries.map(e => `<div class="flexline" style="padding:12px 0;border-bottom:1px solid var(--rule)">
          <span style="font-size:14.5px;font-weight:700;${e.withdrawn ? 'text-decoration:line-through;color:var(--faint)' : ''}">${esc(e.name)}</span>
          ${e.withdrawn
            ? `<button class="btn btn-out btn-sm" data-act="reinstate" data-id="${e.id}">Reinstate</button>`
            : `<button class="btn btn-out btn-sm" data-act="withdraw" data-id="${e.id}">Drop out</button>`}
        </div>`).join('')}
      </div>
      <button class="btn btn-out" style="margin-top:16px" data-act="finish-event">Finish tournament</button>
      <button class="btn btn-out" style="margin-top:8px" data-act="delete-event">Delete event</button>
    </div>`;
    sheetEl.hidden = false;
  }

  function openWithdraw(entryId) {
    const ev = currentEvent();
    const e = ev.entries.find(x => x.id === entryId);
    sheetEl.innerHTML = `<div class="sheet">
      <div class="sheet-head">
        <div><div style="font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--accent)">${esc(e.name)} is dropping out</div>
        <div class="tiny">Choose what happens to their remaining fixtures</div></div>
        <button class="sheet-close" data-act="close-sheet" aria-label="Close">×</button>
      </div>
      <div class="rows" style="margin-top:12px">
        <button class="row" data-act="withdraw-mode" data-id="${entryId}" data-v="walkover">
          <div class="h3">Walkovers to the opponent</div><div class="small">Remaining matches are awarded, results so far stand.</div></button>
        <button class="row" data-act="withdraw-mode" data-id="${entryId}" data-v="void">
          <div class="h3">Void their matches</div><div class="small">Everything they played is removed from the table.</div></button>
        <button class="row" data-act="withdraw-mode" data-id="${entryId}" data-v="remove">
          <div class="h3">Just remove from future rounds</div><div class="small">Played results stand, no walkovers awarded.</div></button>
      </div>
    </div>`;
    sheetEl.hidden = false;
  }

  /* ================= RENDER ================= */
  function render() {
    const shared = S.readShared();
    if (shared) { app.innerHTML = screenBoard(shared); tabbar.hidden = true; return; }

    if (!S.db.seenIntro) { app.innerHTML = screenIntro(); tabbar.hidden = true; return; }

    const screens = {
      home: screenHome, builder: screenBuilder, live: screenLive, approvals: screenApprovals,
      table: screenTable, players: screenPlayers, profile: screenProfile, share: screenShare
    };
    app.innerHTML = (screens[view.screen] || screenHome)();

    const tabs = [['home', 'Events', '▤'], ['live', 'Live', '◈'], ['table', 'Table', '≡'],
      ['players', 'Players', '◍'], ['share', 'Share', '↗']];
    tabbar.innerHTML = tabs.map(([k, label, glyph]) =>
      `<button class="tab" data-act="tab" data-v="${k}" ${view.screen === k ? 'aria-current="page"' : ''}>
        <b>${glyph}</b><span>${label}</span></button>`).join('');
    tabbar.hidden = view.screen === 'builder';
    renderSheet();
  }

  /* ================= ACTIONS ================= */
  function handle(act, el) {
    const ev = currentEvent();
    const d = view.draft;

    switch (act) {
      case 'intro-done':
        S.db.seenIntro = true; S.save();
        view.draft = S.newDraft(); view.step = 1;
        return go('builder');

      case 'new-event':
        view.draft = S.newDraft(); view.step = 1;
        return go('builder');

      case 'open-event': {
        const e = S.event(el.dataset.id);
        view.eventId = e.id;
        return go(e.stage === 'setup' ? 'live' : 'live');
      }

      case 'wiz-back':
        if (view.step > 1) { view.step--; return render(); }
        return go('home');

      case 'step': {
        const next = Number(el.dataset.v);
        const nameInput = $('#ev-name');
        if (nameInput) d.name = nameInput.value;
        view.step = next; return render();
      }

      case 'pick-sport': {
        d.sport = el.dataset.v;
        const def = E.SPORTS[d.sport].defaults;
        d.config.target = def.target || d.config.target;
        d.config.minutes = def.minutes;
        d.config.endBy = def.target ? 'points' : 'time';
        if (['football', 'netball', 'basketball', 'cricket'].indexOf(d.sport) !== -1) d.entryMode = 'team';
        return render();
      }

      case 'pick-format':
        d.format = el.dataset.v;
        if (E.FORMATS[d.format].entry === 'individual') d.entryMode = 'individual';
        return render();

      case 'entry-mode': d.entryMode = el.dataset.v; return render();

      case 'cfg-seg': d.config[el.dataset.k] = el.dataset.v; return render();

      case 'cfg': {
        const k = el.dataset.k, delta = Number(el.dataset.d);
        const min = { courts: 1, target: 1, minutes: 3, rounds: 1, groups: 2, advance: 1 }[k] || 1;
        d.config[k] = Math.max(min, d.config[k] + delta * (k === 'target' ? 1 : 1));
        return render();
      }

      case 'toggle-approve': d.config.allowPlayerScores = !d.config.allowPlayerScores; return render();

      case 'rm-entry':
        d.entries.splice(Number(el.dataset.idx), 1);
        return render();

      case 'clear-entries': d.entries = []; return render();

      case 'generate': {
        if (!d.name) d.name = E.SPORTS[d.sport].name + ' ' + E.FORMATS[d.format].name;
        d.seedOrder = d.entries.map(e => e.id);
        const built = E.buildSchedule(d);
        d.rounds = built.rounds;
        d.stage = built.stage || 'main';
        d.locked = true;
        S.saveEvent(d);
        view.eventId = d.id; view.draft = null;
        toast('Fixtures generated — round 1 is up');
        return go('live');
      }

      case 'score': view.sheet = el.dataset.id; return render();
      case 'close-sheet': view.sheet = null; sheetEl.hidden = true; sheetEl.innerHTML = ''; return render();

      case 'pt': {
        const m = findMatch(ev, view.sheet);
        const key = el.dataset.s === 'a' ? 'sa' : 'sb';
        m[key] = Math.max(0, m[key] + Number(el.dataset.d));
        S.saveEvent(ev);
        return renderSheet();
      }

      case 'save-score': {
        const m = findMatch(ev, view.sheet);
        const wasFinal = m.status === 'final';
        m.status = 'final';
        S.saveEvent(ev);
        if (!wasFinal) S.applyResultToPlayers(ev, m);
        view.sheet = null;
        toast(navigator.onLine ? 'Result saved' : 'Saved locally · will sync when connected');
        return render();
      }

      case 'approve': {
        const m = findMatch(ev, el.dataset.id);
        m.status = 'final';
        S.saveEvent(ev);
        S.applyResultToPlayers(ev, m);
        toast('Approved — written to both records');
        return render();
      }

      case 'next-round': return advance(ev);

      case 'goto-approvals': return go('approvals');
      case 'goto-live': return go('live');
      case 'goto-players': return go('players');
      case 'open-player': view.playerId = el.dataset.id; return go('profile');
      case 'open-entry': {
        const entry = ev.entries.find(x => x.id === el.dataset.id);
        if (entry && entry.playerId) { view.playerId = entry.playerId; return go('profile'); }
        return;
      }
      case 'table-tab': view.tab = el.dataset.v; return render();
      case 'tab': {
        const k = el.dataset.v;
        if (k === 'live' && !view.eventId && S.db.events.length) view.eventId = S.db.events[0].id;
        if (k === 'table' && !view.eventId && S.db.events.length) view.eventId = S.db.events[0].id;
        return go(k);
      }

      case 'event-menu': return openManage();
      case 'withdraw': return openWithdraw(el.dataset.id);
      case 'withdraw-mode': {
        const entry = ev.entries.find(x => x.id === el.dataset.id);
        entry.withdrawn = true;
        entry.withdrawnMode = el.dataset.v;
        if (el.dataset.v === 'void') {
          (ev.rounds || []).forEach(r => r.matches.forEach(m => {
            if (m.a.indexOf(entry.id) !== -1 || m.b.indexOf(entry.id) !== -1) m.voided = true;
          }));
        }
        if (el.dataset.v === 'walkover') {
          (ev.rounds || []).forEach(r => r.matches.forEach(m => {
            if (m.status === 'final') return;
            const inA = m.a.indexOf(entry.id) !== -1, inB = m.b.indexOf(entry.id) !== -1;
            if (!inA && !inB) return;
            m.status = 'final';
            m.walkover = true;
            if (inA) { m.sa = 0; m.sb = ev.config.target || 1; }
            else { m.sb = 0; m.sa = ev.config.target || 1; }
          }));
        }
        S.saveEvent(ev);
        view.sheet = null; sheetEl.hidden = true;
        toast(entry.name + ' withdrawn');
        return render();
      }
      case 'reinstate': {
        const entry = ev.entries.find(x => x.id === el.dataset.id);
        entry.withdrawn = false; delete entry.withdrawnMode;
        S.saveEvent(ev); return openManage();
      }
      case 'finish-event':
        ev.stage = 'done'; S.saveEvent(ev);
        sheetEl.hidden = true; toast('Tournament finished');
        return go('table');
      case 'delete-event':
        if (confirm('Delete this event? Player records already written are kept.')) {
          S.removeEvent(ev.id); view.eventId = null;
          sheetEl.hidden = true; return go('home');
        }
        return;

      case 'copy-link': {
        const url = el.dataset.url;
        if (navigator.share) navigator.share({ title: 'FlexPlay board', url }).catch(() => {});
        else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast('Link copied'));
        else prompt('Copy this link', url);
        return;
      }
      case 'export': {
        const blob = new Blob([S.exportJSON()], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'flexplay-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        return toast('Backup downloaded');
      }
      case 'import': {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'application/json';
        input.onchange = () => {
          const f = input.files[0]; if (!f) return;
          const rd = new FileReader();
          rd.onload = () => { try { S.importJSON(rd.result); toast('Backup restored'); render(); } catch (e) { toast('Could not read that file'); } };
          rd.readAsText(f);
        };
        input.click();
        return;
      }
    }
  }

  function findMatch(ev, id) {
    let found = null;
    (ev.rounds || []).forEach(r => r.matches.forEach(m => { if (m.id === id) found = m; }));
    return found;
  }

  /* Round progression — the one place stage transitions happen. */
  function advance(ev) {
    const rounds = ev.rounds;
    const preScheduled = ['league', 'groups', 'knockout'].indexOf(ev.format) !== -1;

    if (ev.stage === 'group') {
      const more = rounds.some(r => r.matches.some(m => m.status !== 'final' && m.a.length && m.b.length));
      if (more) { toast('Play the next scheduled group round'); return render(); }
      const qual = E.qualifiers(ev).slice(0, ev.config.groups * ev.config.advance);
      const ms = E.knockoutBracket(qual, ev.config.courts);
      rounds.push({ matches: ms, resting: [] });
      ev.stage = 'knockout';
      S.saveEvent(ev);
      toast('Groups closed — knockout drawn');
      return go('live');
    }

    if (ev.stage === 'knockout' || ev.format === 'knockout') {
      const last = rounds[rounds.length - 1];
      if (last.matches.length === 1) { ev.stage = 'done'; S.saveEvent(ev); toast('Champion decided'); return go('table'); }
      const next = E.nextBracketRound(last.matches, ev.config.courts);
      if (!next) { toast('Finish every tie first'); return render(); }
      rounds.push({ matches: next, resting: [] });
      ev.stage = 'knockout';
      S.saveEvent(ev);
      return go('live');
    }

    if (preScheduled) {
      const nextIdx = rounds.findIndex(r => r.matches.some(m => m.status !== 'final' && m.a.length && m.b.length));
      if (nextIdx === -1) { ev.stage = 'done'; S.saveEvent(ev); toast('League complete'); return go('table'); }
      // move the unfinished round to the end of the list so it shows as current
      const [r] = rounds.splice(nextIdx, 1);
      rounds.push(r);
      S.saveEvent(ev);
      return render();
    }

    if (rounds.length >= ev.config.rounds) {
      ev.stage = 'done'; S.saveEvent(ev); toast('Tournament complete'); return go('table');
    }
    const next = E.generateNextRound(ev);
    rounds.push(next);
    S.saveEvent(ev);
    toast('Round ' + rounds.length + ' generated');
    return go('live');
  }

  /* ---------- entry input (step 3) ---------- */
  function addEntry(name) {
    const d = view.draft;
    if (!name.trim()) return;
    const coachEl = $('#coach-input');
    const coach = coachEl ? coachEl.value.trim() : '';
    if (d.entryMode === 'individual') {
      const p = S.ensurePlayer(name, d.sport);
      d.entries.push({ id: E.uid('en'), name: p.name, ref: p.ref, playerId: p.id });
    } else {
      d.entries.push({ id: E.uid('en'), name: name.trim(), coach: coach, ref: '' });
    }
    S.save();
    render();
    const input = $('#entry-input');
    if (input) { input.value = ''; input.focus(); }
  }

  /* ---------- drag to seed ---------- */
  let dragIdx = null;
  document.addEventListener('dragstart', e => {
    const chip = e.target.closest('.chip[draggable]');
    if (!chip) return;
    dragIdx = Number(chip.dataset.idx);
    chip.classList.add('dragging');
  });
  document.addEventListener('dragover', e => {
    if (dragIdx === null) return;
    e.preventDefault();
  });
  document.addEventListener('drop', e => {
    if (dragIdx === null) return;
    const chip = e.target.closest('.chip[draggable]');
    if (chip && view.draft) {
      const to = Number(chip.dataset.idx);
      const list = view.draft.entries;
      const [moved] = list.splice(dragIdx, 1);
      list.splice(to, 0, moved);
      render();
    }
    dragIdx = null;
  });
  document.addEventListener('dragend', () => {
    dragIdx = null;
    document.querySelectorAll('.dragging').forEach(n => n.classList.remove('dragging'));
  });

  /* ---------- global listeners ---------- */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    e.preventDefault();
    try {
      handle(el.dataset.act, el);
    } catch (err) {
      console.error(err);
      toast('Something went wrong: ' + (err && err.message ? err.message : err));
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'entry-input' || e.target.id === 'coach-input') {
      e.preventDefault();
      addEntry($('#entry-input').value);
    }
  });

  document.addEventListener('input', e => {
    if (e.target.dataset && e.target.dataset.field === 'name' && view.draft) {
      view.draft.name = e.target.value;
    }
  });

  window.addEventListener('online', () => { toast('Back online'); S.sync(); });
  window.addEventListener('offline', () => toast('Offline — everything still saves on this device'));
  window.addEventListener('hashchange', render);

  /* Direct fallback for the intro button, in case delegated clicks are blocked. */
  window.FlexPlayStart = function () {
    try {
      S.db.seenIntro = true; S.save();
      view.draft = S.newDraft(); view.step = 1;
      go('builder');
    } catch (err) { console.error(err); }
  };

  /* ---------- boot ---------- */
  try {
    S.load();
    if (S.db.events.length) view.eventId = S.db.events[0].id;
    render();
  } catch (err) {
    app.innerHTML = '<div style="padding:24px"><div style="font-size:11px;font-weight:800;'
      + 'letter-spacing:.12em;text-transform:uppercase;color:#ec3013">FlexPlay could not start</div>'
      + '<p style="font-size:14px;line-height:1.5;margin:10px 0 14px">Send this message to your developer:</p>'
      + '<pre style="white-space:pre-wrap;word-break:break-word;font-size:12px;background:#eae9e9;'
      + 'padding:12px;margin:0">' + esc(err && (err.stack || err.message) || String(err)) + '</pre></div>';
    console.error(err);
  }
})();
