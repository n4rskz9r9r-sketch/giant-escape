/* 거인과 도망자 v6 — 화면/조작 (3D + 1인칭 + 2D 미니맵/대체 화면 + 2층 + 미션 + 뷱 + 아이템 + 전장의 안개) */
(function () {
  'use strict';
  const GE = window.GE, CFG = GE.CFG;
  const $ = (id) => document.getElementById(id);
  const TR = (t) => (window.I18N ? window.I18N.tr(t) : t); // 화면 언어 (기본 영어, ?lang=ko)
  const EN = !!(window.I18N && window.I18N.lang !== 'ko');
  const roleShort = (g) => (EN ? TR(GE.roleOf(g)) : GE.roleOf(g).slice(0, 2));
  const STORE = 'giantEscape.brains.v7'; // v7: 벽 부수기 유전자 + 거인 수(4~10) 저장 (이전 저장본은 무시)
  const II = GE.ITEM_INFO, R_ITEMS = GE.R_ITEMS;
  const GCOL = ['#ff5d5d', '#ff8a3d', '#d0569a', '#9b7bff', '#3fd0c9', '#c8e04a', '#ff6fb5', '#5aa9ff', '#e0b04a', '#b8b8d0']; // 거인1~10
  // ?stream=1 → 방송 모드 (자동 진행, 3D, 자동 카메라, 큰 글씨 HUD, 버튼 숨김)
  const STREAM = /[?&]stream=1(\b|$)/.test(location.search);
  const STREAM_FPS = Math.max(5, Math.min(60, parseInt(new URLSearchParams(location.search).get('fps') || '30', 10) || 30)); // 방송 렌더 fps 상한
  if (STREAM) document.body.classList.add('stream');
  // v19: 뷱 승리 목표 (기본 30마리). ?snakeWin=N 으로 바꿔 볼 수 있음 (3~60)
  { const sw = parseInt(new URLSearchParams(location.search).get('snakeWin') || '', 10); if (sw >= 3 && sw <= 60) CFG.SNAKE_WIN_EATS = sw; }
  const SW = () => CFG.SNAKE_WIN_EATS;

  const trainer = new GE.Trainer((Math.random() * 2 ** 32) >>> 0);
  const app = {
    trainer, game: null, map: null, seed: 0, playing: false, training: false, lastTick: 0, acc: 0,
    score: { runner: 0, giant: 0, draw: 0, snake: 0 }, vision: [], visionVer: 0, loggedAt: {}, nextTimer: null, flashGenes: {},
    view: '2d', has3d: false, endAt: 0, fx2d: [], fxSeen: 0,
  };
  window.__app = app;

  const stageEl = $('stage3d'), board = $('board'), ctx = board.getContext('2d');
  const mini = $('minimap'), mctx = mini.getContext('2d');
  const chart = $('chart'), cctx = chart.getContext('2d');

  // ---------- 보간 ----------
  const FH = CFG.H; // 층마다 행 수
  // v21: 레벨(층) 0=1층, 1=2층, 2=지하 1층(B1). 맵마다 levels/lvl/ay 정보를 씀
  const curMap = () => (app.game ? app.game.map : app.map);
  const LVL = (f) => { const m = curMap(); return m && m.levels && m.levels[f] ? m.levels[f] : { row0: f * FH, h: FH, zOff: 0, lz: f }; };
  const flo = (i) => { const m = curMap(); return m && m.lvl ? m.lvl[i] : Math.floor(((i / CFG.W) | 0) / FH); }; // 몇 층(레벨)
  const xy = (i) => [i % CFG.W, ((i / CFG.W) | 0) - LVL(flo(i)).row0];   // 층 안 좌표 (2D 지도용)
  const ayOf = (i) => { const m = curMap(); return m && m.ay ? m.ay[i] : ((i / CFG.W) | 0) % FH; };
  const xyf = (i) => { const f = flo(i); return [i % CFG.W, ayOf(i), LVL(f).lz, f]; }; // [x, 정렬 y, 높이(지하=-1), 레벨]
  const isB1 = (f) => { const m = curMap(); return !!m && m.B1 >= 0 && f === m.B1; };
  const floorName = (f) => (isB1(f) ? '지하 1층' : `${f + 1}층`);
  const floorTag = (f) => (isB1(f) ? 'B1' : `${f + 1}F`);
  function lerpPath(path, t) {
    if (!path || path.length < 2) return xyf(path[path.length - 1]);
    const segs = path.length - 1, f = Math.min(segs - 1e-9, t * segs), k = Math.floor(f), u = f - k;
    const [x0, y0, f0, l0] = xyf(path[k]), [x1, y1, f1, l1] = xyf(path[k + 1]);
    return [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, f0 + (f1 - f0) * u, u < 0.5 ? l0 : l1];
  }
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  function missionState(g) {
    return g.map.missions.map((M, mi) => { const S = g.ms[mi]; return { type: M.type, key: M.key, done: S.done, cnt: S.cnt, need: S.need, gem: M.gem, gemTaken: S.gemTaken, pedestal: M.pedestal, plate: M.plate, levers: (M.levers || []).map((c, li) => ({ cell: c, on: S.lev[li] })) }; });
  }
  const tpsNow = () => Math.max(1, +$('speed').value);
  // v23: 도망자에게 가장 가까운 공룡
  function nearDino(g) { const W = g.map.W, r = g.runner.pos; let b = g.dinos[0], bd = 1e9; for (const D of g.dinos) { const d = Math.abs(D.pos % W - r % W) + Math.abs(((D.pos / W) | 0) - ((r / W) | 0)); if (d < bd) { bd = d; b = D; } } return b; }
  function interp() {
    const g = app.game, interval = 1000 / +$('speed').value;
    const t = g.result ? 1 : ease(Math.min(1, app.acc / interval));
    const rp = g.runner.path, [rx, ry, rf, rl] = lerpPath(rp, t);
    const [ax, ay] = xy(rp[0]), [bx, by] = xy(rp[rp.length - 1]);
    const plateIdx = g.map.missions.findIndex((M) => M.plate === g.runner.pos);
    const jump = g.runner.vaultTurn === g.turn && !g.result ? Math.sin(Math.PI * t) : 0; // 벽넘기 점프 높이(0~1)
    return {
      t,
      dinos: (g.dinos || []).map((D) => { const [x, y] = lerpPath(D.path, t); return { x, y, fx: D.facing[0], fy: D.facing[1], chase: D.mode === '돌격', sniff: D.mode === '냄새 추적', moving: D.path.length > 1 }; }),
      weapon: g.weapon,
      boulders: g.boulders ? g.boulders.map((B) => ({ cell: B.cell, blocked: !!g.blockInfo(B.cell), push: B.by >= 0 })) : [],
      runner: { x: rx, y: ry, f: rf, lv: rl, dx: bx - ax, dy: by - ay, sprint: g.runner.sprintLeft > 0, boost: g.runner.boost > 0, cloak: g.runner.cloak > 0, hasKey: g.keysHeld > 0, gem: g.runner.gem >= 0, onPlate: plateIdx, jump },
      giants: g.giants.map((G) => { const [x, y, f, lv] = lerpPath(G.path, t); return { x, y, f, lv, dead: !!G.dead, fx: G.facing[0], fy: G.facing[1], dash: G.dashLeft > 0 || G.path.length > 2, ban: G.doorBan > 0 || G.keyBan > 0, smashReady: G.smashCd <= 0, stun: G.stun > 0, blind: G.blind > 0, track: G.track > 0, out: G.out > 0, outSec: Math.ceil(G.out / tpsNow()), home: (() => { const h = g.map.giantStarts[G.id], [hx, hy, hf, hl] = xyf(h); return { x: hx, y: hy, f: hf, lv: hl }; })() }; }),
      snakes: g.snakes.map((S) => ({ f: S.floor, hidden: S.hidden > 0, stun: S.stun > 0, len: S.body.length, segs: S.body.map((c, j) => { const a = S.prevBody[Math.min(j, S.prevBody.length - 1)], [x0, y0, f0] = xyf(a), [x1, y1, f1] = xyf(c); return Math.abs(x1 - x0) + Math.abs(y1 - y0) > 1.5 ? { x: x1, y: y1, f: f1 } : { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, f: f0 + (f1 - f0) * t }; }) })),
    };
  }
  // 지금 보여줄 층: 자동(도망자가 있는 층) / 1F / 2F. 1인칭과 방송은 항상 도망자 층
  function viewFloor() {
    const g = app.game; if (!g) return 0;
    const fpvNow = app.has3d && app.view === '3d' && window.Render3D && window.Render3D.camMode === 'fpv';
    if (STREAM || fpvNow || app.floorMode === 'auto' || app.floorMode == null) return flo(g.runner.pos);
    return Math.min((g.map.levels ? g.map.levels.length : g.map.floors) - 1, app.floorMode);
  }

  // ---------- 전장의 안개 표시 정책 ----------
  // 일반 모드: '전체 지도 보기'(기본 꺼짐)를 끄면 미니맵·2D 화면·3D 전체/따라가기 화면에서 도망자가 못 본 곳이 어둡게 가려짐.
  // 1인칭: 화면 자체가 도망자 눈이고, 미니맵은 도망자의 기억(안개)만 보여줌.
  // 방송(?stream=1): 전체/따라가기 화면은 시청자용으로 전체 지도, 1인칭 구간과 미니맵은 도망자의 안개 지도.
  function fogOn(where) {
    const fpvNow = app.has3d && app.view === '3d' && window.Render3D && window.Render3D.camMode === 'fpv';
    if (STREAM) return where === 'mini' || fpvNow;
    if (fpvNow) return true;
    return !$('showFull').checked;
  }
  // ---------- 2D 그리기 (대체 화면 / 미니맵 공용) ----------
  function emoji(c, ch, cx, cy, size) {
    c.font = `${size}px "Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff'; c.fillText(ch, cx, cy + size * 0.05);
  }
  function draw2D(c, T, mini) {
    const g = app.game, m = g ? g.map : app.map; if (!m) return;
    const W = CFG.W, now = performance.now(), vf = g ? viewFloor() : 0, LV0 = LVL(vf), LH = LV0.h, base = LV0.row0 * W, ug = isB1(vf);
    const on = (i) => flo(i) === vf;
    c.clearRect(0, 0, W * T, FH * T);
    // v21: 지하(B1)는 세로로 길어서 같은 칸에 맞게 줄여 가운데에 그림
    const T0 = T; c.save();
    if (LH > FH) { const Tn = T * FH / LH; c.fillStyle = '#050403'; c.fillRect(0, 0, W * T, FH * T); c.translate((W * T - W * Tn) / 2, 0); T = Tn; }
    for (let y = 0; y < LH; y++) for (let x = 0; x < W; x++) {
      const i = base + y * W + x;
      c.fillStyle = m.g[i] === 1 ? (ug ? '#5a4632' : vf ? '#3a6080' : '#3a4280') : m.g[i] === 2 ? '#7a5230' : ug ? ((x + y) % 2 ? '#17120e' : '#1b1510') : (x + y) % 2 ? '#141830' : '#171b35';
      c.fillRect(x * T, y * T, T + 0.5, T + 0.5);
    }
    if (!g) { c.restore(); return; }
    const s0 = interp(), zo = LV0.zOff;
    const s = zo ? { ...s0, runner: { ...s0.runner, y: s0.runner.y + zo }, dinos: s0.dinos.map((d) => ({ ...d, y: d.y + zo })), giants: s0.giants.map((G) => ({ ...G, y: G.y + zo, home: { ...G.home, y: G.home.y + LVL(G.home.lv).zOff } })) } : s0;
    const fog = fogOn(mini ? 'mini' : 'board'), seen = g.runner.seen, vis = (cell) => on(cell) && (!fog || seen[cell]);
    const at = (cell) => { const [x, y] = xy(cell); return [(x + .5) * T, (y + .5) * T]; };
    if ($('showVision').checked) { c.fillStyle = 'rgba(255,80,80,0.16)'; for (const i of app.vision) { if (!on(i)) continue; const [x, y] = xy(i); c.fillRect(x * T, y * T, T, T); } }
    if (vf === 0) {
      const banned = g.giants.some((G) => G.doorBan > 0);
      c.fillStyle = banned ? 'rgba(255,230,120,0.2)' : 'rgba(255,230,120,0.07)';
      for (const i of m.floor) if (m.nearDoor[i]) { const [x, y] = xy(i); c.fillRect(x * T, y * T, T, T); }
    }
    const open = g.keysLeft.length === 0;
    m.exits.forEach((e, k) => {
      if (!vis(e)) return; const [x, y] = xy(e);
      c.fillStyle = open ? '#59e39a' : '#c98a3a'; c.fillRect(x * T, y * T, T, T);
      if (!mini) { emoji(c, '🚪', (x + .5) * T, (y + .5) * T, T * 0.8); }
      c.font = `bold ${Math.max(8, T * (mini ? 0.9 : 0.4))}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 3; c.strokeStyle = '#000'; c.strokeText(m.exitNames[k], (x + .5) * T, (y + .5) * T); c.fillStyle = '#fff'; c.fillText(m.exitNames[k], (x + .5) * T, (y + .5) * T);
    });
    // v21 해치 (1층 🕳️ ↔ 지하 🪜)
    for (const pair of m.hatches || []) for (const st of pair) { if (!vis(st)) continue; const [px, py] = at(st); c.fillStyle = 'rgba(200,154,90,.4)'; c.fillRect(px - T / 2, py - T / 2, T, T); if (mini) { c.fillStyle = '#c89a5a'; c.fillRect(px - T * .4, py - T * .4, T * .8, T * .8); } else emoji(c, isB1(flo(st)) ? '🪜' : '🕳️', px, py, T * 0.75); }
    // v21 전설의 무기 (지하, 보이면)
    if (g.weapon && !g.weapon.taken && vis(g.weapon.cell)) { const [px, py] = at(g.weapon.cell); c.fillStyle = 'rgba(127,216,255,.35)'; c.beginPath(); c.arc(px, py, T * (0.7 + 0.15 * Math.sin(now / 200)), 0, 7); c.fill(); if (mini) { c.fillStyle = '#ffd24a'; c.fillRect(px - T * .45, py - T * .45, T * .9, T * .9); } else emoji(c, '🔱', px, py, T * 0.85); }
    // 계단
    for (const pair of m.stairs || []) for (const st of pair) { if (!vis(st)) continue; const [px, py] = at(st); c.fillStyle = 'rgba(89,227,154,.35)'; c.fillRect(px - T / 2, py - T / 2, T, T); if (mini) { c.fillStyle = '#59e39a'; c.fillRect(px - T * .35, py - T * .35, T * .7, T * .7); } else emoji(c, flo(st) === 0 ? '🪜' : '⬇️', px, py, T * 0.7); }
    // v22 바위 (거인만 밀 수 있음): 회색 돌 + 막은 곳이면 빨간 테
    for (const B of g.boulders || []) { if (!vis(B.cell)) continue; const [px, py] = at(B.cell), blk = g.blockInfo(B.cell); c.fillStyle = '#8f877c'; c.beginPath(); c.arc(px, py, T * 0.47, 0, 7); c.fill(); c.fillStyle = '#b5ada2'; c.beginPath(); c.arc(px - T * 0.12, py - T * 0.12, T * 0.18, 0, 7); c.fill(); if (blk) { c.lineWidth = Math.max(2, T * 0.12); c.strokeStyle = '#ff4a4a'; c.beginPath(); c.arc(px, py, T * 0.55, 0, 7); c.stroke(); } if (!mini) emoji(c, '🪨', px, py, T * 0.7); }
    // 미션
    g.map.missions.forEach((M, mi) => {
      const S = g.ms[mi];
      if (M.type === 'switch') M.levers.forEach((lv, li) => { if (!vis(lv)) return; const [px, py] = at(lv); if (mini) { c.fillStyle = S.lev[li] ? '#59e39a' : '#ffd54a'; c.fillRect(px - T * .4, py - T * .4, T * .8, T * .8); } else emoji(c, S.lev[li] ? '✅' : '🕹️', px, py, T * 0.7); });
      if (M.type === 'carry') {
        if (!S.gemTaken && vis(M.gem)) { const [px, py] = at(M.gem); if (mini) { c.fillStyle = '#40e0ff'; c.beginPath(); c.arc(px, py, T * .45, 0, 7); c.fill(); } else emoji(c, '💎', px, py + Math.sin(now / 250) * T * 0.05, T * 0.7); }
        if (vis(M.pedestal)) { const [px, py] = at(M.pedestal); if (mini) { c.fillStyle = S.done ? '#40e0ff' : '#8899aa'; c.fillRect(px - T * .4, py - T * .4, T * .8, T * .8); } else emoji(c, S.done ? '💠' : '🏛️', px, py, T * 0.7); }
      }
      if (M.type === 'plate' && vis(M.plate)) { const [px, py] = at(M.plate); c.fillStyle = S.done ? 'rgba(89,227,154,.6)' : 'rgba(255,213,74,.4)'; c.fillRect(px - T * .45, py - T * .45, T * .9, T * .9); if (!S.done && S.cnt > 0) { c.strokeStyle = '#ffd54a'; c.lineWidth = Math.max(2, T * 0.12); c.beginPath(); c.arc(px, py, T * 0.5, -Math.PI / 2, -Math.PI / 2 + (S.cnt / S.need) * Math.PI * 2); c.stroke(); } if (!mini) emoji(c, S.done ? '✅' : '⏳', px, py, T * 0.6); }
    });
    for (const b of g.barricades) { if (!vis(b.cell)) continue; const [x, y] = xy(b.cell);
      if (mini) { c.fillStyle = b.by === 'runner' ? '#e0a050' : '#ff6060'; c.fillRect(x * T, y * T, T, T); }
      else emoji(c, b.by === 'runner' ? '🧱' : '🚧', (x + .5) * T, (y + .5) * T, T * 0.8); }
    for (const it of g.items) { if (!vis(it.cell)) continue; const [x, y] = xy(it.cell);
      if (mini) { c.fillStyle = it.side === 'R' ? '#7fd8ff' : '#ff8a8a'; c.beginPath(); c.arc((x + .5) * T, (y + .5) * T, T * 0.4, 0, 7); c.fill(); }
      else { c.fillStyle = it.side === 'R' ? 'rgba(79,195,255,.25)' : 'rgba(255,93,93,.25)'; c.beginPath(); c.arc((x + .5) * T, (y + .5) * T, T * 0.45, 0, 7); c.fill(); emoji(c, II[it.type].icon, (x + .5) * T, (y + .5) * T + Math.sin(now / 300 + it.cell) * T * 0.05, T * 0.62); } }
    for (const p of g.pills) { if (!vis(p)) continue; const [px, py] = at(p); if (mini) { c.fillStyle = '#ff5fd2'; c.beginPath(); c.arc(px, py, T * .3, 0, 7); c.fill(); } else emoji(c, '💊', px, py, T * 0.5); }
    for (const k of g.keysLeft) { if (!vis(k)) continue; const [x, y] = xy(k); const openK = g.ms[m.keyMission[k]].done;
      if (mini) { c.fillStyle = openK ? '#ffd54a' : '#c07030'; c.beginPath(); c.arc((x + .5) * T, (y + .5) * T, T * 0.45, 0, 7); c.fill(); }
      else { emoji(c, openK ? '🔓' : '🧰', (x + .5) * T, (y + .5) * T, T * 0.75); if (openK) emoji(c, '🔑', (x + .5) * T, (y + .1) * T + Math.sin(now / 250 + k) * T * 0.06, T * 0.55); } }
    // 연막·샷건·포효 효과 (2D)
    for (const f of app.fx2d) {
      const age = (now - f.at) / 1000; if (age > f.dur) continue;
      const cell0 = f.e.cell != null ? f.e.cell : f.e.from; if (cell0 == null || !on(cell0)) continue;
      const [x, y] = xy(cell0);
      if (f.e.t === 'smoke') { const a = Math.min(1, age * 3) * Math.min(1, (f.dur - age) / 0.6); c.fillStyle = `rgba(210,214,224,${(0.55 * a).toFixed(2)})`; for (let q = 0; q < 6; q++) { const ang = q + age * 0.6; c.beginPath(); c.arc((x + .5 + Math.cos(ang) * 1.3) * T, (y + .5 + Math.sin(ang) * 1.3) * T, T * (1.3 + 0.3 * Math.sin(q + age)), 0, 7); c.fill(); } }
      else if (f.e.t === 'shot' && age < 0.25) { const [tx, ty] = xy(f.e.to); c.strokeStyle = `rgba(255,220,120,${(1 - age / 0.25).toFixed(2)})`; c.lineWidth = Math.max(2, T * 0.15); c.beginPath(); c.moveTo((x + .5) * T, (y + .5) * T); c.lineTo((tx + .5) * T, (ty + .5) * T); c.stroke(); if (!mini) emoji(c, f.e.miss ? '💨' : '💥', (tx + .5) * T, (ty + .5) * T, T); }
      else if (f.e.t === 'vault' && age < 1) { const [ox, oy] = xy(f.e.over); c.strokeStyle = `rgba(120,255,200,${(1 - age).toFixed(2)})`; c.lineWidth = Math.max(2, T * 0.12); c.beginPath(); const [tx, ty] = xy(f.e.to); c.moveTo((x + .5) * T, (y + .5) * T); c.quadraticCurveTo((ox + .5) * T, (oy - .6) * T, (tx + .5) * T, (ty + .5) * T); c.stroke(); if (!mini) emoji(c, '🤸', (ox + .5) * T, (oy + .2 - age * 0.6) * T, T * 0.9); }
      else if ((f.e.t === 'roar' || f.e.t === 'eat' || f.e.t === 'chest') && age < 1.2) { c.strokeStyle = f.e.t === 'roar' ? `rgba(255,80,80,${(1 - age / 1.2).toFixed(2)})` : f.e.t === 'eat' ? `rgba(80,230,110,${(1 - age / 1.2).toFixed(2)})` : `rgba(255,213,74,${(1 - age / 1.2).toFixed(2)})`; c.lineWidth = 3; c.beginPath(); c.arc((x + .5) * T, (y + .5) * T, T * (1 + age * (f.e.t === 'roar' ? 9 : 4)), 0, 7); c.stroke(); }
    }
    // 전장의 안개
    if (fog) { c.fillStyle = mini ? 'rgba(3,4,10,0.86)' : 'rgba(3,4,10,0.78)'; for (let y = 0; y < LH; y++) for (let x = 0; x < W; x++) if (!seen[base + y * W + x]) c.fillRect(x * T, y * T, T + 0.5, T + 0.5); }
    // v21 공룡 (2×2)
    if (ug) for (const d of s.dinos) {
      const px = (d.x + 1) * T, py = (d.y + 1) * T, hid = fog && !seen[base + Math.round(d.y) * W + Math.round(d.x)];
      c.globalAlpha = hid ? (mini ? 0.4 : 0.5) : 1;
      c.fillStyle = d.chase ? 'rgba(255,90,40,.55)' : 'rgba(110,170,60,.55)'; c.beginPath(); c.arc(px, py, T * 1.05, 0, 7); c.fill();
      if (mini) { c.fillStyle = '#7ccf4a'; c.beginPath(); c.arc(px, py, T * 0.8, 0, 7); c.fill(); } else emoji(c, '🦖', px, py, T * 1.9);
      c.globalAlpha = 1;
    }
    // 뷱
    s.snakes.forEach((sn) => {
      if (sn.hidden) { if (Math.round(sn.segs[0].f) !== vf) return; }
      if (sn.hidden) { if (!mini) { const p = sn.segs[0]; emoji(c, '🕳️', (p.x + .5) * T, (p.y + .5) * T, T * 0.7); } return; }
      const h0 = sn.segs[0]; c.globalAlpha = fog && !seen[base + Math.round(h0.y) * W + Math.round(h0.x)] ? (mini ? 0.35 : 0.45) : 1; // 안개 속 뷱은 흐리게 (거인과 같은 규칙)
      for (let j = sn.segs.length - 1; j >= 1; j--) { const p = sn.segs[j]; if (Math.round(p.f) !== vf) continue; c.fillStyle = j % 2 ? '#8bd94a' : '#2fae4a'; c.beginPath(); c.arc((p.x + .5) * T, (p.y + .5) * T, T * (mini ? 0.45 : 0.38) * (1 - j / (sn.segs.length * 2.2)), 0, 7); c.fill(); }
      const h = sn.segs[0]; if (Math.round(h.f) !== vf) { c.globalAlpha = 1; return; } c.fillStyle = '#1f8a38'; c.beginPath(); c.arc((h.x + .5) * T, (h.y + .5) * T, T * (mini ? 0.55 : 0.48), 0, 7); c.fill();
      if (!mini) { emoji(c, '🐍', (h.x + .5) * T, (h.y + .5) * T, T * 0.85); if (sn.stun) emoji(c, '💫', (h.x + .5) * T, (h.y - .45) * T + Math.sin(now / 120) * T * 0.06, T * 0.6); }
      c.globalAlpha = 1;
    });
    if (!(g.result === 'giant') && s.runner.lv === vf) {
      if (g.runner.cloak > 0) c.globalAlpha = 0.4;
      c.fillStyle = 'rgba(79,195,255,0.35)'; c.beginPath(); c.arc((s.runner.x + .5) * T, (s.runner.y + .5) * T, T * (mini ? 0.7 : 0.46), 0, 7); c.fill();
      if (mini) { c.fillStyle = '#4fc3ff'; c.beginPath(); c.arc((s.runner.x + .5) * T, (s.runner.y + .5) * T, T * 0.45, 0, 7); c.fill(); }
      else { emoji(c, '🏃', (s.runner.x + .5) * T, (s.runner.y + .5) * T, T * 0.78); if (g.runner.cloak > 0) emoji(c, '👻', (s.runner.x + .9) * T, (s.runner.y + .1) * T, T * 0.45); if (g.runner.boost > 0) emoji(c, '🚀', (s.runner.x + .1) * T, (s.runner.y + .1) * T, T * 0.45); if (g.runner.gem >= 0) emoji(c, '💎', (s.runner.x + .5) * T, (s.runner.y - .45) * T, T * 0.45); }
      c.globalAlpha = 1;
    }
    s.giants.forEach((G, k) => {
      if (G.out || G.lv !== vf) return;
      const hidden = fog && !seen[base + Math.round(G.y) * W + Math.round(G.x)];
      c.globalAlpha = hidden ? (mini ? 0.35 : 0.45) : 1;
      c.fillStyle = GCOL[k] + (mini ? 'ff' : '55'); c.beginPath(); c.arc((G.x + .5) * T, (G.y + .5) * T, T * (mini ? 0.55 : 0.62), 0, 7); c.fill();
      if (!mini) {
        emoji(c, g.result === 'giant' && g.catcher === k ? '😋' : '👹', (G.x + .5) * T, (G.y + .5) * T, T * 1.2);
        c.font = `bold ${T * 0.38}px sans-serif`; c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 3;
        c.strokeText(String(k + 1), (G.x + .9) * T, (G.y + .1) * T); c.fillText(String(k + 1), (G.x + .9) * T, (G.y + .1) * T);
        if (g.giants[k].smashCd <= 0) emoji(c, '💥', (G.x + .1) * T, (G.y + .1) * T, T * 0.42);
        if (G.stun) emoji(c, '💫', (G.x + .5) * T, (G.y - .45) * T + Math.sin(now / 120) * T * 0.06, T * 0.6);
        else if (G.blind) emoji(c, '🌫️', (G.x + .5) * T, (G.y - .45) * T, T * 0.55);
        else if (G.track) emoji(c, '🐾', (G.x + .5) * T, (G.y - .45) * T, T * 0.5);
      } else if (G.stun) { c.strokeStyle = '#ffe14a'; c.lineWidth = 2; c.beginPath(); c.arc((G.x + .5) * T, (G.y + .5) * T, T * 0.9, 0, 7); c.stroke(); }
      c.globalAlpha = 1;
    });
    // 뷱에게 먹힌 거인: 출발점에 부활 카운트다운
    s.giants.forEach((G, k) => {
      if (!G.out || G.dead || G.home.lv !== vf) return; const px = (G.home.x + .5) * T, py = (G.home.y + .5) * T;
      c.strokeStyle = GCOL[k]; c.lineWidth = 2; c.setLineDash([3, 3]); c.beginPath(); c.arc(px, py, T * (mini ? 0.9 : 0.55), 0, 7); c.stroke(); c.setLineDash([]);
      c.font = `bold ${mini ? 10 : Math.max(10, T * 0.42)}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 3; c.strokeStyle = '#000';
      const tx = mini ? `${G.outSec}` : TR(`${k + 1}↺${G.outSec}초`); c.strokeText(tx, px, py); c.fillStyle = '#ffd54a'; c.fillText(tx, px, py);
    });
    // 층 표시
    c.font = `bold ${mini ? 11 : Math.max(12, T * 0.7)}px sans-serif`; c.textAlign = 'left'; c.textBaseline = 'top'; c.lineWidth = 3; c.strokeStyle = '#000';
    c.restore(); T = T0;
    const lab = `${floorTag(vf)}${(app.floorMode === 'auto' || app.floorMode == null || STREAM) ? '' : ' 👁'}`; c.strokeText(lab, 4, 3); c.fillStyle = ug ? '#ffb070' : vf ? '#9fe0ff' : '#ffd54a'; c.fillText(lab, 4, 3);
  }

  // ---------- 크기 ----------
  let tile2d = 20, tileMini = 5;
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = STREAM ? window.innerWidth : stageEl.clientWidth;
    const h = STREAM ? window.innerHeight : Math.round(w * (app.view === '3d' ? 0.66 : CFG.H / CFG.W));
    stageEl.style.height = h + 'px';
    tile2d = STREAM ? Math.min(w / CFG.W, h / CFG.H) : w / CFG.W;
    board.width = Math.round(w * dpr); board.height = Math.round(tile2d * CFG.H * dpr);
    board.width = Math.round(tile2d * CFG.W * dpr);
    board.style.width = tile2d * CFG.W + 'px'; board.style.height = tile2d * CFG.H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const mw = Math.max(120, Math.min(220, w * 0.3)); tileMini = mw / CFG.W;
    mini.width = Math.round(mw * dpr); mini.height = Math.round(tileMini * CFG.H * dpr);
    mini.style.width = mw + 'px'; mini.style.height = tileMini * CFG.H + 'px';
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cw = chart.clientWidth, ch = chart.clientHeight;
    chart.width = Math.round(cw * dpr); chart.height = Math.round(ch * dpr); cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (app.has3d) window.Render3D.resize();
    drawChart();
  }
  window.addEventListener('resize', resize);

  function setView(v) {
    if (v === '3d' && !app.has3d) v = '2d';
    app.view = v;
    stageEl.classList.toggle('is3d', v === '3d');
    $('btnView').textContent = v === '3d' ? '🗺 2D 보기' : '🧊 3D 보기';
    $('btnCam').style.display = v === '3d' ? '' : 'none';
    $('btnCamReset').style.display = v === '3d' ? '' : 'none';
    $('btnFpv').style.display = v === '3d' ? '' : 'none';
    if ($('btnTps')) $('btnTps').style.display = v === '3d' ? '' : 'none';
    if (v !== '3d') stageEl.classList.remove('fpv');
    $('chkMini').style.display = v === '3d' ? '' : 'none';
    resize();
  }
  function init3D() {
    if (app.has3d || !window.Render3D) return;
    try {
      window.Render3D.init(stageEl);
      app.has3d = true; $('btnView').disabled = false;
      if (app.map) window.Render3D.setMap(app.map);
      setView('3d');
      log('🧊 3D 화면 준비 완료 — 드래그로 회전, 휠/두 손가락으로 확대', 'learn');
    } catch (e) { log('3D를 쓸 수 없어 2D 화면으로 보여줍니다 (' + e.message + ')', 'spot'); setView('2d'); }
  }
  window.addEventListener('render3d-ready', init3D);
  window.addEventListener('render3d-failed', () => { log('이 기기에서는 3D(WebGL)를 쓸 수 없어 2D로 보여줍니다', 'spot'); setView('2d'); });

  // ---------- 차트 ----------
  function drawChart() {
    const w = chart.clientWidth, h = chart.clientHeight, Hs = trainer.history;
    cctx.clearRect(0, 0, w, h);
    const pad = { l: 30, r: 6, t: 8, b: 18 }, pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
    cctx.font = '10px sans-serif'; cctx.fillStyle = '#9aa3c7'; cctx.textAlign = 'right'; cctx.textBaseline = 'middle';
    for (const p of [0, 50, 100]) { const y = pad.t + ph * (1 - p / 100); cctx.fillText(p + '%', pad.l - 4, y); cctx.strokeStyle = p === 50 ? '#6b7299' : '#262b48'; cctx.setLineDash(p === 50 ? [4, 4] : []); cctx.beginPath(); cctx.moveTo(pad.l, y); cctx.lineTo(w - pad.r, y); cctx.stroke(); }
    cctx.setLineDash([]);
    if (!Hs.length) { cctx.textAlign = 'center'; cctx.fillText('아직 학습 기록이 없습니다', pad.l + pw / 2, pad.t + ph / 2 - 14); return; }
    const data = Hs.slice(-300), n = data.length, win = Math.max(1, Math.min(10, Math.round(n / 8)));
    const X = (k) => pad.l + (n === 1 ? pw / 2 : (pw * k) / (n - 1)), Y = (v) => pad.t + ph * (1 - v);
    for (const [key, col] of [['runner', '#4fc3ff'], ['giant', '#ff5d5d'], ['snake', '#7dff9a']]) {
      const val = (d) => (d[key] || 0) + (key === 'snake' ? 0 : d.draw / 2);
      cctx.fillStyle = col + '44'; data.forEach((d, k) => cctx.fillRect(X(k) - 1, Y(val(d)) - 1, 2, 2));
      cctx.strokeStyle = col; cctx.lineWidth = 2; cctx.beginPath();
      data.forEach((_, k) => { let s = 0, c = 0; for (let j = Math.max(0, k - win + 1); j <= k; j++) { s += val(data[j]); c++; } const v = s / c; k ? cctx.lineTo(X(k), Y(v)) : cctx.moveTo(X(k), Y(v)); });
      cctx.stroke();
    }
    cctx.fillStyle = '#9aa3c7'; cctx.textBaseline = 'top';
    cctx.textAlign = 'left'; cctx.fillText(data[0].gen + '세대', pad.l, h - 14);
    cctx.textAlign = 'right'; cctx.fillText(data[n - 1].gen + '세대', w - pad.r, h - 14);
  }

  // ---------- 능력치 ----------
  function renderGenes() {
    const rbox = $('genes-runner'), rg = trainer.runner.genes;
    if (!rbox.children.length) rbox.innerHTML = GE.RUNNER_GENES.map((d) => `<div class="gene" data-k="${d.key}"><div class="name"><span>${d.label}</span><span class="v"></span></div><div class="bar"><i></i></div></div>`).join('');
    for (const d of GE.RUNNER_GENES) {
      const el = rbox.querySelector(`[data-k="${d.key}"]`), v = rg[d.key] ?? 0;
      el.querySelector('.v').textContent = Math.round(v * 100); el.querySelector('i').style.width = (v * 100).toFixed(1) + '%';
      el.classList.toggle('flash', !!app.flashGenes['r' + d.key]);
    }
    const gbox = $('genes-giant'), team = trainer.giant.team;
    if (+gbox.dataset.n !== team.length) { // 거인 수가 바뀌면 칸을 새로 만듦 (7명 이상은 촘촘하게)
      const n = team.length, compact = n > 6; gbox.dataset.n = n; gbox.classList.toggle('compact', compact);
      gbox.style.gridTemplateColumns = `${compact ? 62 : 70}px repeat(${n}, minmax(${compact ? 16 : 22}px, 1fr))`;
      let h = '<div class="gh"></div>' + team.map((_, k) => `<div class="gh" style="color:${GCOL[k]}">${compact ? '' : '거인'}${k + 1}<small data-role="${k}"></small></div>`).join('');
      h += '<div class="gl">💥 벽 부수기</div>' + team.map((_, k) => `<div class="gcd" data-cd="${k}" title="거인${k + 1} 벽 부수기">-</div>`).join('');
      for (const d of GE.GIANT_GENES) { h += `<div class="gl">${d.label}</div>` + team.map((_, k) => `<div class="gb" data-k="${d.key}" data-g="${k}" title=""><i style="background:${GCOL[k]}"></i></div>`).join(''); }
      gbox.innerHTML = h;
    }
    team.forEach((g, k) => {
      gbox.querySelector(`[data-role="${k}"]`).textContent = team.length > 6 ? roleShort(g) : GE.roleOf(g);
      for (const d of GE.GIANT_GENES) { const el = gbox.querySelector(`[data-k="${d.key}"][data-g="${k}"]`); el.firstChild.style.width = ((g[d.key] ?? 0) * 100).toFixed(1) + '%'; el.title = `거인${k + 1} ${d.label} ${Math.round(g[d.key] * 100)}`; el.classList.toggle('flash', !!app.flashGenes['g' + k + d.key]); }
    });
    // v19: 뷱 유전자
    const sbox = $('genes-snake'), sgn = trainer.snake.genes;
    if (sbox) {
      if (!sbox.children.length) sbox.innerHTML = GE.SNAKE_GENES.map((d) => `<div class="gene" data-k="${d.key}"><div class="name"><span>${d.label}</span><span class="v"></span></div><div class="bar"><i></i></div></div>`).join('');
      for (const d of GE.SNAKE_GENES) { const el = sbox.querySelector(`[data-k="${d.key}"]`), v = sgn[d.key] ?? 0; el.querySelector('.v').textContent = Math.round(v * 100); el.querySelector('i').style.width = (v * 100).toFixed(1) + '%'; el.classList.toggle('flash', !!app.flashGenes['s' + d.key]); }
      $('lv-snake').textContent = trainer.snake.level;
    }
    $('lv-runner').textContent = trainer.runner.level; $('lv-giant').textContent = trainer.giant.level;
    $('st-gen').textContent = trainer.generation;
    const tw = trainer.trainWins;
    $('sc-train').textContent = `훈련 경기 ${trainer.rounds}판 (도망자 ${tw.runner} · 거인팀 ${tw.giant} · 뷱 ${tw.snake || 0} · 무 ${tw.draw})`;
  }

  // ---------- 로그 ----------
  function log(text, cls, label) {
    const li = document.createElement('li'); if (cls) li.className = cls;
    li.innerHTML = `<span class="t">${label || ''}</span>`; li.appendChild(document.createTextNode(text));
    const ul = $('log'); ul.prepend(li); while (ul.children.length > 90) ul.lastChild.remove();
    if (STREAM) hudLog(text, cls);
  }
  function flushEvents() {
    const g = app.game;
    while (g.events.length) {
      const e = g.events.shift(), key = e.type + e.text;
      if (['spot', 'ambush', 'dash', 'scent', 'call', 'sprint'].includes(e.type) && app.loggedAt[key] !== undefined && e.turn - app.loggedAt[key] < 10) continue;
      app.loggedAt[key] = e.turn; log(e.text, e.type, `턴 ${e.turn}`); fpvToast(e.text, e.type);
    }
  }

  // ---------- 경기 흐름 ----------
  function newRound(newMap) {
    clearTimeout(app.nextTimer);
    const changed = app.game && (app.game.smashed.length > 0 || app.game.map !== app.map);
    if (!newMap && app.map && changed && app.has3d) window.Render3D.setMap(app.map); // 부서진 벽·바리케이드 복구
    if (newMap || !app.map) { app.seed = (Math.random() * 2 ** 32) >>> 0; app.map = GE.generateMap(app.seed); if (app.has3d) window.Render3D.setMap(app.map); }
    app.game = new GE.Game(app.map, { ...trainer.runner.genes }, trainer.giant.team.map((g) => ({ ...g })), app.seed, { ...trainer.snake.genes });
    app.loggedAt = {}; app.acc = 0; app.endAt = 0; app.smashSeen = 0; app.fxSeen = 0; app.fx2d = []; app.seenCount = -1; stageEl.classList.remove('cloaked');
    $('overlay').classList.add('hidden');
    log(`— 새 경기 (도망자 Lv.${trainer.runner.level} vs 거인팀 Lv.${trainer.giant.level}: ${trainer.giant.team.map((g, k) => `${k + 1}번 ${GE.roleOf(g)}`).join(', ')} vs 뷱 Lv.${trainer.snake.level}) —`, 'end');
    updateStatus();
  }
  function updateStatus() {
    const g = app.game; if (!g) return;
    $('st-turn').textContent = g.turn; $('st-max').textContent = CFG.MAX_TURNS;
    $('st-keys').textContent = `${g.keysHeld}/${app.map.keys.length}` + (g.keysLeft.length === 0 ? ' · 문 A/B 열림' : '');
    let d = 999; for (const G of g.giants) if (G.out <= 0) d = Math.min(d, GE.bfsC(g.map, G.pos, 2)[g.runner.pos]);
    app.nearD = d;
    $('st-dist').textContent = d >= 999 ? '문 안 (안전)' : d + '칸';
    $('st-rmode').textContent = g.runner.mode + (g.runner.sprintLeft > 0 ? ' ⚡' : '') + (g.runner.boost > 0 ? ' 🚀' : '') + (g.runner.cloak > 0 ? ' 👻' : '') + invText(g.runner.inv, ' ');
    $('st-floor').textContent = floorName(flo(g.runner.pos)) + (g.weapon ? (g.weapon.taken ? ` · 🔱 ${g.runner.inv.slayer}` : '') : '') + (g.dinos && g.dinos.length && isB1(flo(g.runner.pos)) ? ` · 🦖 ${nearDino(g).mode}` : '') + (g.sealed ? ' · 🚫 출구 봉쇄' : '');
    { const gbox = $('genes-giant'), compact = g.giants.length > 6; g.giants.forEach((G, k) => { const el = gbox.querySelector(`[data-cd="${k}"]`); if (!el) return; const sec = Math.ceil(G.smashCd / tpsNow()); el.textContent = G.smashCd <= 0 ? (compact ? '✓' : '준비') : `${sec}${compact ? '' : '초'}`; el.classList.toggle('ready', G.smashCd <= 0); el.title = `거인${k + 1} ${G.smashCd <= 0 ? '벽부수기 준비' : '벽부수기 ' + sec + '초 남음'}`; }); }
    $('st-mission').textContent = g.missionText();
    $('st-snake').textContent = `뷱 ${g.snakeAte.giants}/${SW()} · ` + g.snakes.map((S) => `${S.floor + 1}F ${S.hidden > 0 ? '숨음' : S.mode}(${S.body.length})`).join(' · ');
    $('st-gmode').textContent = g.giants.map((G, k) => `${k + 1}:${G.dead ? '☠️처치됨' : G.out > 0 ? `${G.outBy === 'dino' ? '🦖기절' : '🐍배 속'} ${Math.ceil(G.out / tpsNow())}초` : G.stun > 0 ? '기절💫' : (G.mode + (isB1(flo(G.pos)) ? '⁻' : flo(G.pos) ? '²' : ''))}${G.dashLeft > 0 ? '💨' : ''}${G.doorBan > 0 || G.keyBan > 0 ? '✨' : ''}${G.smashCd <= 0 ? '💥' : ''}${G.blind > 0 ? '🌫️' : ''}${G.track > 0 ? '🐾' : ''}${G.inv.roar ? '🔊' : ''}${G.inv.tracker ? '🐾' : ''}${G.inv.barricade ? '🚧' : ''}`).join(' ');
    let sc = 0; const sn = g.runner.seen; for (let i = 0; i < sn.length; i++) sc += sn[i]; if (sc !== app.seenCount) { app.seenCount = sc; app.seenVer = (app.seenVer || 0) + 1; }
    const set = new Set();
    g.giants.forEach((G, k) => { if (G.out > 0) return; for (const i of g.map.floor) if (GE.giantSees(g, k, i)) set.add(i); });
    app.vision = [...set]; app.visionVer++;
    if (STREAM) { hudStatus(); hudAmmo(); hudSnake(); }
    fpvHudUpdate(); soundDanger();
  }
  // 샷건(기본 스킬): n/2 + 장전 진행률
  function reloadFrac() { const R = app.game && app.game.runner; if (!R || R.inv.shotgun >= CFG.SHOTGUN_AMMO) return 1; return Math.min(1, (R.reload || 0) / GE.secTurns(CFG.SHOTGUN_RELOAD_SEC)); }
  function shotgunText() { const R = app.game.runner, n = R.inv.shotgun; return `🔫샷건 ${n}/${CFG.SHOTGUN_AMMO}` + (n < CFG.SHOTGUN_AMMO ? ` (장전 ${Math.round(reloadFrac() * 100)}%)` : ''); }
  function invText(inv, pre, noGun) {
    const parts = R_ITEMS.filter((t) => t === 'shotgun' ? !noGun : inv[t] > 0).map((t) => t === 'shotgun' ? shotgunText() : II[t].icon + (inv[t] > 1 ? '×' + inv[t] : ''));
    return parts.length ? pre + parts.join(' ') : '';
  }
  function tick() {
    const g = app.game; if (!g || g.result) return; app.lastTickAt = performance.now();
    const keys0 = g.keysHeld, left0 = g.keysLeft.length;
    g.step();
    if (window.GSound) soundTick(g, keys0, left0);
    // 거인이 부순 벽 → 3D에 반영 (파편·흔들림)
    if (g.smashed.length > (app.smashSeen || 0)) {
      const fresh = g.smashed.slice(app.smashSeen || 0); app.smashSeen = g.smashed.length;
      if (app.has3d) window.Render3D.smash(fresh.map((e) => e.cell), fresh[0].giant);
      if (STREAM && app.has3d) streamOnSmash(fresh[0]);
    }
    // 아이템 효과 → 3D/2D
    if (g.fx.length > app.fxSeen) {
      const fresh = g.fx.slice(app.fxSeen); app.fxSeen = g.fx.length;
      const tps = +$('speed').value, at = performance.now();
      for (const e of fresh) { if (e.t === 'smoke') { e.turns = CFG.SMOKE_TURNS; e.radius = CFG.SMOKE_RADIUS; } app.fx2d.push({ e, at, dur: e.t === 'smoke' ? CFG.SMOKE_TURNS / tps + 0.6 : 1.2 }); }
      app.fx2d = app.fx2d.filter((f) => (at - f.at) / 1000 < f.dur);
      if (app.has3d) window.Render3D.fx(fresh, { tps });
      if (window.GSound) soundFx(fresh);
      if (fresh.some((e) => e.t === 'cloak')) stageEl.classList.add('cloaked');
    }
    stageEl.classList.toggle('cloaked', g.runner.cloak > 0);
    flushEvents(); updateStatus(); if (g.result) onRoundEnd();
  }
  // ---------- 사운드 연결 (js/audio3.js) ----------
  const SND = (n) => { if (window.GSound && !app.training) window.GSound.play(n); };
  function soundFx(fresh) {
    for (const e of fresh) {
      if (e.t === 'shot') { SND(e.miss ? 'miss' : 'shot'); if (!e.miss) setTimeout(() => SND('stun'), 160); }
      else if (e.t === 'smash') SND('smash');
      else if (e.t === 'barricadeBreak' || e.t === 'barricade') SND('barricade');
      else if (e.t === 'vault') SND('vault');
      else if (e.t === 'eat' && e.giant >= 0) SND('gulp');
      else if (e.t === 'pickup') SND('item');
      else if (e.t === 'respawn') SND('respawn');
      else if (e.t === 'roar') SND('roar');
      else if (e.t === 'smoke' || e.t === 'cloak' || e.t === 'boost') SND(e.t);
      else if (e.t === 'lever' || e.t === 'gem' || e.t === 'pedestal') SND('mission');
      else if (e.t === 'chest') SND('door');
      else if (e.t === 'tailgrab' || e.t === 'snakeStun') SND('block');
      else if (e.t === 'dinoRoar') SND('dinoRoar');
      else if (e.t === 'dinoBite') SND('dinoBite');
      else if (e.t === 'dinoSniff') SND('sniff');
      else if (e.t === 'sealed') SND('rockBlock');
      else if (e.t === 'weapon') SND('weapon');
      else if (e.t === 'slay') SND('slay');
      else if (e.t === 'hatch') SND('hatch');
      else if (e.t === 'boulder' || e.t === 'boulderReset') SND('rock');
      else if (e.t === 'boulderBlock') SND('rockBlock');
    }
  }
  function soundTick(g, keys0, left0) {
    // v21: 공룡 발소리 — 도망자가 지하에 있고 공룡이 움직이면 쿵 (가까울수록 자주)
    const ND = g.dinos && g.dinos.length ? nearDino(g) : null;
    if (ND && ND.path.length > 1 && isB1(flo(g.runner.pos))) { const W = g.map.W, d = Math.abs(ND.pos % W - g.runner.pos % W) + Math.abs(((ND.pos / W) | 0) - ((g.runner.pos / W) | 0)); if (d <= 16 && (app.stompN = (app.stompN || 0) + 1) % (d <= 8 ? 1 : 2) === 0) SND('stomp'); }
    if (g.keysHeld > keys0) SND('key');
    if (left0 > 0 && g.keysLeft.length === 0) setTimeout(() => SND('door'), 250);
  }
  function soundDanger() {
    if (!window.GSound) return; const g = app.game, d = app.nearD ?? 999;
    window.GSound.quiet = !!app.training;
    window.GSound.setDanger(!g || g.result || app.training || !app.playing || d >= 999 ? 0 : Math.max(0, Math.min(1, (13 - d) / 11)));
  }
  function onRoundEnd() {
    const g = app.game, r = g.result; app.endAt = performance.now();
    app.score[r]++;
    SND(r === 'runner' ? 'win' : r === 'giant' ? (g.catcher === -2 ? 'gulp' : g.catcher === -4 ? 'dinoBite' : 'caught') : r === 'snake' ? 'snakeWin' : 'respawn'); if (r === 'giant' && g.catcher === -2) setTimeout(() => SND('caught'), 450);
    if (app.score.snake == null) app.score.snake = 0;
    app.snakeStats = app.snakeStats || { giants: 0, runner: 0, pills: 0 };
    app.snakeStats.giants += g.snakeAte.giants; app.snakeStats.runner += g.snakeAte.runner; app.snakeStats.pills += g.snakeAte.pills;
    $('sc-snake').textContent = `🐍 뷱이 먹은 거인 ${app.snakeStats.giants} · 도망자 ${app.snakeStats.runner} · 알약 ${app.snakeStats.pills}`;
    $('sc-runner').textContent = app.score.runner; $('sc-giant').textContent = app.score.giant; $('sc-draw').textContent = app.score.draw; $('sc-snakewin').textContent = app.score.snake;
    const added = trainer.recordVisible(r, g.catcher);
    if (added.length) {
      const msg = `도망자 ${trainer.growWins}승! 거인이 한 명 늘었다 👹 (거인${added.map((k) => k + 1).join('·')} 등장 — 이제 ${trainer.giantCount}명)`;
      log(msg, 'grow'); fpvToast(msg, 'grow'); if (STREAM) hudLog(msg, 'grow'); setTimeout(() => SND('grow'), 2200);
      renderGenes(); saveQuiet();
    }
    updateGiantCount();
    $('overlayText').textContent = r === 'runner' ? `🏃 문 ${g.escapeDoor} 탈출 성공!` : r === 'giant' ? (g.catcher === -2 ? '🐍 뷱이 도망자를 삼켰다!' : g.catcher === -4 ? '🦖 공룡이 도망자를 삼켰다!' : `👹 거인${g.catcher + 1}이 잡아먹었다!`) : r === 'snake' ? `🐍👑 뷱 승리! 거인 ${g.snakeAte.giants}마리 꿀꺽` : '⏳ 시간 초과';
    $('overlayText').style.color = r === 'runner' ? '#4fc3ff' : r === 'giant' ? '#ff5d5d' : r === 'snake' ? '#7dff9a' : '#cfd3ef';
    $('overlaySub').textContent = `${g.turn}턴 · 경기 후 복기 훈련 중…`;
    $('overlay').classList.remove('hidden');
    setTimeout(() => trainAsync(STREAM ? 10 : 30, (out) => {
      reportLearning(out.changes, out.rec);
      $('overlaySub').textContent = `${g.turn}턴 · ${trainer.generation}세대 학습 완료`;
      if (STREAM) {
        saveQuiet(); hudUpdate();
        if (++app.roundsSinceBurst >= STREAM_BURST_EVERY) { app.roundsSinceBurst = 0; app.nextTimer = setTimeout(() => fastTrain(STREAM_BURST_GENS), 2200); return; }
      }
      if ($('autoNext').checked && app.playing) app.nextTimer = setTimeout(() => newRound(true), 1800);
      else setPlaying(false);
    }), 60);
  }
  // v21: 훈련을 잘게 나눠(한 번에 budget ms) 돌려 화면·방송이 멈추지 않게
  function trainAsync(budget, done) {
    const it = trainer.trainGen();
    const step = () => { const t0 = performance.now(); let r; do { r = it.next(); } while (!r.done && performance.now() - t0 < budget); if (r.done) done(r.value); else setTimeout(step, 0); };
    step();
  }
  function reportLearning(changes, rec) {
    app.flashGenes = {};
    changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    changes.slice(0, 4).forEach((c) => {
      app.flashGenes[c.side === 'runner' ? 'r' + c.key : c.side === 'snake' ? 's' + c.key : 'g' + c.gi + c.key] = 1;
      log(`🧠 ${c.text} (${c.label} ${c.delta > 0 ? '▲' : '▼'}${Math.round(Math.abs(c.delta) * 100)})`, 'learn', `${trainer.generation}세대`);
    });
    if (rec) log(`📊 ${trainer.generation}세대 훈련 ${rec.n}판: 도망자 ${Math.round(rec.runner * 100)}% · 거인팀 ${Math.round(rec.giant * 100)}% · 뷱 ${Math.round((rec.snake || 0) * 100)}%`, 'learn', `${trainer.generation}세대`);
    renderGenes(); drawChart();
  }
  function setPlaying(p) { app.playing = p; $('btnPlay').textContent = p ? '⏸ 일시정지' : '▶ 시작'; if (p && app.game && app.game.result) newRound(true); soundDanger(); }

  // ---------- 빠른 훈련 ----------
  function fastTrain(gens) {
    if (app.training) return;
    setPlaying(false); clearTimeout(app.nextTimer);
    app.training = true; soundDanger(); document.querySelectorAll('button,select').forEach((b) => (b.disabled = true));
    $('trainOverlay').classList.remove('hidden');
    const before = { r: { ...trainer.runner.genes }, t: trainer.giant.team.map((g) => ({ ...g })), s: { ...trainer.snake.genes } };
    const lv0 = { r: trainer.runner.level, g: trainer.giant.level, s: trainer.snake.level };
    let done = 0; const tot = { r: 0, g: 0, d: 0, s: 0, n: 0 };
    let gen = null;
    const chunk = () => {
      const t0 = performance.now();
      while (done < gens && performance.now() - t0 < (STREAM ? 12 : 40)) {
        if (!gen) gen = trainer.trainGen();
        const r = gen.next(); if (!r.done) continue; gen = null;
        const o = r.value; done++; tot.r += o.rec.runner * o.n; tot.g += o.rec.giant * o.n; tot.d += o.rec.draw * o.n; tot.s += (o.rec.snake || 0) * o.n; tot.n += o.n;
      }
      $('trainBar').style.width = (100 * done) / gens + '%';
      $('trainText').textContent = `${done}/${gens}세대 · ${tot.n}판 · 도망자 ${Math.round((100 * tot.r) / tot.n)}% / 거인팀 ${Math.round((100 * tot.g) / tot.n)}% / 뷱 ${Math.round((100 * tot.s) / tot.n)}%`;
      renderGenes(); drawChart();
      if (done < gens) return setTimeout(chunk, 0);
      const changes = [];
      for (const d of GE.RUNNER_GENES) { const delta = trainer.runner.genes[d.key] - before.r[d.key]; if (Math.abs(delta) >= 0.12) changes.push({ side: 'runner', key: d.key, label: d.label, delta, text: delta > 0 ? d.up : d.down }); }
      trainer.giant.team.forEach((g, k) => { for (const d of GE.GIANT_GENES) { const delta = g[d.key] - before.t[k][d.key]; if (Math.abs(delta) >= 0.15) changes.push({ side: 'giant', gi: k, key: d.key, label: `거인${k + 1} ${d.label}`, delta, text: (delta > 0 ? d.up : d.down).replace(/^거인이/, `거인${k + 1}이`) }); } });
      for (const d of GE.SNAKE_GENES) { const delta = trainer.snake.genes[d.key] - before.s[d.key]; if (Math.abs(delta) >= 0.12) changes.push({ side: 'snake', key: d.key, label: d.label, delta, text: delta > 0 ? d.up : d.down }); }
      log(`⚡ 빠른 훈련 ${gens}세대(${tot.n}판) 완료 — 도망자 ${Math.round((100 * tot.r) / tot.n)}% · 거인팀 ${Math.round((100 * tot.g) / tot.n)}% · 뷱 ${Math.round((100 * tot.s) / tot.n)}% · 레벨 도망자 +${trainer.runner.level - lv0.r}, 거인팀 +${trainer.giant.level - lv0.g}, 뷱 +${trainer.snake.level - lv0.s}`, 'learn', `${trainer.generation}세대`);
      reportLearning(changes.slice(0, 8), null);
      $('trainOverlay').classList.add('hidden');
      document.querySelectorAll('button,select').forEach((b) => (b.disabled = false));
      if (!app.has3d) $('btnView').disabled = true;
      app.training = false; newRound(true); setPlaying(true); soundDanger();
      if (STREAM) { saveQuiet(); hudUpdate(); }
    };
    setTimeout(chunk, 30);
  }

  // ---------- 저장 ----------
  // 거인 수 · 다음 거인 추가까지 남은 도망자 승수
  function updateGiantCount() {
    const n = trainer.giantCount, left = trainer.winsToNextGiant();
    const t = `👹 거인 ${n}명 · ${left < 0 ? `최대 인원(${CFG.GIANTS_MAX}명)` : `다음 거인 추가까지 도망자 ${left}승`}`;
    $('sc-grow').textContent = t; if ($('h-grow')) $('h-grow').textContent = t;
  }
  function save() {
    if (app.preview) { log('👀 미리보기(?giants=) 중에는 저장하지 않습니다', 'spot'); return; }
    try { localStorage.setItem(STORE, JSON.stringify({ trainer: trainer.toJSON(), score: app.score, savedAt: Date.now() }));
      log(`💾 두뇌 저장 완료 (${trainer.generation}세대, 도망자 Lv.${trainer.runner.level} · 거인팀 Lv.${trainer.giant.level})`, 'learn'); }
    catch (e) { log('저장 실패: ' + e.message, 'spot'); }
  }
  function load(silent) {
    try {
      const raw = localStorage.getItem(STORE);
      if (!raw) { if (!silent) log('저장된 두뇌가 없습니다', 'spot'); return false; }
      const o = JSON.parse(raw);
      if (!trainer.load(o.trainer)) { if (!silent) log('저장본 형식이 달라 불러오지 못했습니다', 'spot'); return false; }
      app.score = Object.assign({ runner: 0, giant: 0, draw: 0, snake: 0 }, o.score || app.score); // v19: 예전 점수에는 뷱 승이 없음 → 0
      $('sc-runner').textContent = app.score.runner; $('sc-giant').textContent = app.score.giant; $('sc-draw').textContent = app.score.draw; $('sc-snakewin').textContent = app.score.snake;
      renderGenes(); drawChart(); updateGiantCount(); newRound(true);
      log(`📂 두뇌 불러오기 완료 (${trainer.generation}세대, ${new Date(o.savedAt).toLocaleString(EN ? 'en-US' : 'ko-KR')} 저장본)`, 'learn');
      return true;
    } catch (e) { if (!silent) log('불러오기 실패: ' + e.message, 'spot'); return false; }
  }
  function resetBrains() {
    if (!confirm('도망자와 거인팀의 학습 내용과 점수를 모두 지울까요? (저장본은 그대로 남습니다)')) return;
    trainer.reset(); app.score = { runner: 0, giant: 0, draw: 0, snake: 0 }; app.flashGenes = {};
    ['sc-runner', 'sc-giant', 'sc-draw', 'sc-snakewin'].forEach((id) => ($(id).textContent = '0'));
    $('log').innerHTML = ''; log(`🧹 두뇌 초기화 — 모두 1레벨부터 다시 배웁니다 (거인 ${CFG.GIANTS}명으로)`, 'learn');
    renderGenes(); drawChart(); updateGiantCount(); newRound(true);
  }

  // ---------- 이벤트 ----------
  $('btnPlay').onclick = () => setPlaying(!app.playing);
  $('btnRestart').onclick = () => newRound(false);
  $('btnNewMap').onclick = () => newRound(true);
  $('speed').oninput = () => ($('speedVal').textContent = $('speed').value);
  $('btnTrain').onclick = () => fastTrain(+$('trainGens').value);
  $('btnSave').onclick = save; $('btnLoad').onclick = () => load(false); $('btnResetBrain').onclick = resetBrains;
  $('btnView').onclick = () => setView(app.view === '3d' ? '2d' : '3d');
  $('btnCam').onclick = () => setCam(window.Render3D.camMode === 'follow' ? 'orbit' : 'follow');
  $('btnCamReset').onclick = () => setCam('orbit');
  $('btnFpv').onclick = () => setCam(window.Render3D.camMode === 'fpv' ? 'tps' : 'fpv');
  if ($('btnTps')) $('btnTps').onclick = () => setCam(window.Render3D.camMode === 'tps' ? 'follow' : 'tps');
  $('showMini').onchange = () => mini.classList.toggle('hidden', !$('showMini').checked);
  $('showFull').onchange = () => { app.seenVer = (app.seenVer || 0) + 1; };
  app.floorMode = 'auto';
  $('btnFloor').onclick = () => { const nL = curMap() && curMap().levels ? curMap().levels.length : 2; app.floorMode = app.floorMode === 'auto' ? 0 : app.floorMode < nL - 1 ? app.floorMode + 1 : 'auto'; $('btnFloor').textContent = app.floorMode === 'auto' ? '🏢 층: 자동' : `🏢 층: ${floorTag(app.floorMode)}`; app.seenVer = (app.seenVer || 0) + 1; };

  // ---------- 카메라 / 1인칭 HUD ----------
  function setCam(mode) {
    const R = window.Render3D; if (!R || !app.has3d) return;
    R.setCamMode(mode); app.camAt = performance.now();
    if (STREAM && R.setAutoRotate) R.setAutoRotate(mode === 'orbit' || mode === 'follow', mode === 'orbit' ? 0.5 : 0.35); // 3인칭·1인칭에서는 자동 회전 끔
    $('btnCam').textContent = mode === 'follow' ? '🎥 자유 시점' : '🎥 도망자 따라가기';
    $('btnFpv').textContent = mode === 'fpv' ? '🎥 3인칭으로' : '👀 도망자 시점';
    $('btnFpv').classList.toggle('on', mode === 'fpv');
    if ($('btnTps')) { $('btnTps').textContent = mode === 'tps' ? '🎥 위에서 보기' : '🏃 3인칭'; $('btnTps').classList.toggle('on', mode === 'tps'); }
    stageEl.classList.toggle('fpv', mode === 'fpv');
    fpvHudUpdate();
  }
  let fpvEl = null;
  function fpvBuild() {
    fpvEl = {};
    const vig = document.createElement('div'); vig.className = 'fpv-vig'; stageEl.appendChild(vig); fpvEl.vig = vig;
    const hud = document.createElement('div'); hud.className = 'fpv-hud';
    hud.innerHTML = `<div class="fh-row"><span class="fh-ic">🔑</span><b id="fh-keys">0/2</b><span id="fh-door" class="fh-sub"></span></div>
      <div class="fh-row"><span class="fh-ic" id="fh-heart">💓</span><div class="fh-bar danger"><i id="fh-danger"></i></div><span id="fh-dist" class="fh-sub"></span></div>
      <div class="fh-row"><span class="fh-ic">⚡</span><div class="fh-bar sprint"><i id="fh-sprint"></i></div><span id="fh-sprintT" class="fh-sub"></span></div>
      <div class="fh-row" id="fh-smashRow"><span class="fh-ic">💥</span><span id="fh-smash" class="fh-sub"></span></div>
      <div class="fh-row fh-inv" id="fh-inv">${R_ITEMS.map((t) => `<span class="fh-item" data-it="${t}" title="${II[t].name}">${II[t].icon}<b></b></span>`).join('')}</div>
      <div class="fh-row" id="fh-fxRow"><span id="fh-fx" class="fh-sub"></span></div>
      <div class="fh-row" id="fh-misRow"><span class="fh-ic">🧩</span><span id="fh-mis" class="fh-sub"></span></div>`;
    stageEl.appendChild(hud); fpvEl.hud = hud;
    const toast = document.createElement('div'); toast.className = 'fpv-toast'; stageEl.appendChild(toast); fpvEl.toast = toast;
  }
  function fpvHudUpdate() {
    const g = app.game; if (!fpvEl || !g || !stageEl.classList.contains('fpv')) return;
    const nk = g.map.keys.length;
    $('fh-keys').textContent = `${g.keysHeld}/${nk}`;
    $('fh-door').textContent = `${floorName(flo(g.runner.pos))} · ` + (g.keysLeft.length ? '미션을 풀어 상자를 열어라' : '문이 열렸다! 1층 빛을 따라가라');
    $('fh-mis').textContent = '미션: ' + g.missionText() + (g.runner.gem >= 0 ? ' · 💎 운반 중' : '');
    const d = app.nearD ?? 999, danger = d >= 999 ? 0 : Math.max(0, Math.min(1, (12 - d) / 10));
    app.danger = danger;
    $('fh-danger').style.width = Math.round(danger * 100) + '%';
    $('fh-dist').textContent = d >= 999 ? '안전' : `거인까지 ${d}칸`;
    const R = g.runner;
    const sp = R.sprintLeft > 0 ? 1 : 1 - R.sprintCd / CFG.SPRINT_COOLDOWN;
    $('fh-sprint').style.width = Math.round(sp * 100) + '%';
    $('fh-sprint').parentElement.classList.toggle('ready', R.sprintCd === 0 || R.sprintLeft > 0);
    $('fh-sprintT').textContent = R.sprintLeft > 0 ? '질주 중!' : R.sprintCd === 0 ? '준비됨' : `${R.sprintCd}턴`;
    const ready = g.giants.filter((G) => G.smashCd <= 0 && G.out <= 0).map((G) => G.id + 1);
    const nextCd = Math.min(...g.giants.map((G) => G.smashCd));
    $('fh-smash').textContent = ready.length ? `벽부수기 준비: 거인${ready.join('·')}` : `다음 벽부수기 ${Math.ceil(nextCd / tpsNow())}초`;
    $('fh-smashRow').classList.toggle('warn', ready.length > 0);
    // 아이템 가방 + 효과
    for (const el of fpvEl.hud.querySelectorAll('.fh-item')) { const n = R.inv[el.dataset.it]; el.classList.toggle('has', n > 0); if (el.dataset.it === 'shotgun') el.classList.add('has'); el.querySelector('b').textContent = el.dataset.it === 'shotgun' ? `${n}/${CFG.SHOTGUN_AMMO}${n < CFG.SHOTGUN_AMMO ? ' ⏳' + Math.round(reloadFrac() * 100) + '%' : ''}` : n > 1 ? n : ''; }
    const fx = [];
    if (R.cloak > 0) fx.push(`👻 투명 ${R.cloak}턴`);
    if (R.boost > 0) fx.push(`🚀 부스터 ${R.boost}턴`);
    const st = g.giants.filter((G) => G.stun > 0); if (st.length) fx.push(st.map((G) => `💫 거인${G.id + 1} 기절 ${(G.stun / Math.max(1, +$('speed').value)).toFixed(1)}초`).join(' '));
    const tr = g.giants.filter((G) => G.track > 0); if (tr.length) fx.push(`🐾 거인${tr.map((G) => G.id + 1).join('·')} 추적 중!`);
    const eaten = g.giants.filter((G) => G.out > 0); if (eaten.length) fx.push(eaten.map((G) => `🐍 거인${G.id + 1} 부활 ${Math.ceil(G.out / tpsNow())}초`).join(' '));
    $('fh-fx').textContent = fx.join(' · ') || '아이템을 주워 위기를 넘겨라';
    $('fh-fxRow').classList.toggle('warn', tr.length > 0);
  }
  let toastTimer = 0;
  function fpvToast(text, type) {
    if (!fpvEl || STREAM || !stageEl.classList.contains('fpv')) return;
    fpvEl.toast.textContent = text; fpvEl.toast.className = 'fpv-toast show ' + (type || '');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => fpvEl.toast.classList.remove('show'), 2600);
  }
  // 심장 박동 비네트: 위험할수록 빨갛고 빠르게
  function fpvVignette(now) {
    if (!fpvEl) return;
    const on = stageEl.classList.contains('fpv'); if (!on) return;
    const dg = app.danger || 0, bpm = 70 + dg * 100;
    const ph = (now / 1000) * (bpm / 60), beat = Math.pow(Math.max(0, Math.sin(ph * Math.PI * 2)), 6);
    const a = (0.25 + dg * 0.45 + beat * dg * 0.3).toFixed(2), red = Math.round(dg * 200);
    const v = `${a}|${red}`;
    if (v !== fpvEl.last) { fpvEl.last = v; fpvEl.vig.style.background = `radial-gradient(ellipse at center, rgba(0,0,0,0) 38%, rgba(${red},0,0,${a}) 78%, rgba(${Math.round(red * 0.6)},0,0,${Math.min(0.95, +a + 0.25)}) 100%)`; }
    const hs = 1 + beat * 0.25 * (0.4 + dg); $('fh-heart').style.transform = `scale(${hs.toFixed(2)})`;
  }

  function loop(now) {
    const dt = Math.min(250, now - (app.lastTick || now)); app.lastTick = now;
    if (app.playing && app.game && !app.game.result && !app.training) {
      app.acc += dt; const interval = 1000 / +$('speed').value; let guard = 0;
      while (app.acc >= interval && guard++ < 10 && !app.game.result) { app.acc -= interval; tick(); }
    }
    if (app.game) {
      if (STREAM && now - (app.lastRender || 0) < 1000 / STREAM_FPS - 2) { requestAnimationFrame(loop); return; }
      app.lastRender = now; app.lastTickAt = app.lastTickAt || now;
      if (app.view === '3d' && app.has3d) {
        const s = interp(), g = app.game;
        window.Render3D.render({ ...s, keysLeft: g.keysLeft, open: g.keysLeft.length === 0, vision: app.vision, visionVer: app.visionVer, showVision: $('showVision').checked,
          viewFloor: viewFloor(), missions: missionState(g), pills: g.pills,
          visionRadius: CFG.GIANT_VISION, items: g.items, barricades: g.barricades, seen: g.runner.seen, seenVer: app.seenVer, fog: fogOn('3d'), result: g.result, catcher: g.catcher, anyBan: g.giants.some((G) => G.doorBan > 0), time: now, endT: app.endAt ? (now - app.endAt) / 1000 : 0 });
        if (!mini.classList.contains('hidden')) draw2D(mctx, tileMini, true);
        fpvVignette(now);
      } else draw2D(ctx, tile2d, false);
    }
    requestAnimationFrame(loop);
  }

  // ---------- 방송 모드 ----------
  const STREAM_BURST_EVERY = 6, STREAM_BURST_GENS = 8, CAM_SWITCH_MS = 20000;
  app.roundsSinceBurst = 0;
  function saveQuiet() { if (app.preview) return; try { localStorage.setItem(STORE, JSON.stringify({ trainer: trainer.toJSON(), score: app.score, savedAt: Date.now() })); } catch (e) { /* 저장 공간 부족 등은 무시 */ } }
  let hud = null;
  function hudBuild() {
    hud = document.createElement('div'); hud.className = 'hud';
    hud.innerHTML = `
      <div class="hud-top"><span class="live">● LIVE</span><span class="title">👹👹👹👹 거인과 도망자 3D — AI 실시간 대결 · 공진화</span></div>
      <div class="hud-score"><span class="r">🏃 도망자 <b id="h-r">0</b></span><span class="vs">:</span><span class="g"><b id="h-g">0</b> 거인팀 👹</span><span class="vs">:</span><span class="s"><b id="h-s">0</b> 뷱 🐍</span><span class="d">무 <b id="h-d">0</b></span></div>
      <div class="hud-grow" id="h-grow"></div>
      <div class="hud-info" id="h-info"></div>
      <div class="hud-status" id="h-status"></div>
      <div class="hud-floor" id="h-floor">🏢 1F</div>
      <div class="hud-ammo" id="h-ammo"><div class="am-top"><span class="am-ic">🔫</span><span class="am-name">샷건</span><b id="h-ammoN">2/2</b><span class="am-shells" id="h-shells"></span></div><div class="am-bar"><i id="h-reload"></i></div><div class="am-sub" id="h-ammoSub">장전 완료</div></div>
      <div class="hud-snake" id="h-snake"><div class="sn-top"><span class="sn-ic">🐍</span><span class="sn-name">뷱</span><b id="h-snakeN">0/20</b></div><div class="sn-bar"><i id="h-snakeBar"></i></div><div class="sn-sub" id="h-snakeSub">거인을 먹으면 뷱 승리</div></div>
      <ul class="hud-log" id="h-log"></ul>`;
    stageEl.appendChild(hud);
  }
  function hudUpdate() {
    if (!hud) return;
    $('h-r').textContent = app.score.runner; $('h-g').textContent = app.score.giant; $('h-d').textContent = app.score.draw; $('h-s').textContent = app.score.snake || 0;
    const recent = trainer.history.slice(-20); let rr = 0, n = 0; for (const h of recent) { rr += h.runner * h.n; n += h.n; }
    $('h-info').innerHTML = `🧬 <b>${trainer.generation}</b>세대 · 훈련 ${trainer.rounds.toLocaleString(EN ? 'en-US' : 'ko-KR')}판 · 🏃 Lv.<b>${trainer.runner.level}</b> · 👹 Lv.<b>${trainer.giant.level}</b> · 🐍 Lv.<b>${trainer.snake.level}</b>` +
      (n ? ` · 최근 도망자 승률 <b>${Math.round((100 * rr) / n)}%</b>` : '') +
      `<br>${trainer.giant.team.map((g, k) => `<span style="color:${GCOL[k]}">${trainer.giantCount > 6 ? k + 1 : '거인' + (k + 1)} ${trainer.giantCount > 6 ? roleShort(g) : GE.roleOf(g)}</span>`).join(' · ')}`;
    updateGiantCount();
  }
  function hudStatus() {
    const g = app.game; if (!hud || !g) return;
    const d = app.nearD ?? 999;
    { const fl = flo(g.runner.pos), el = $('h-floor'); if (el) { el.textContent = (isB1(fl) ? '⛏️ ' : '🏢 ') + floorTag(fl) + (g.runner.inv.slayer > 0 ? ` · 🔱×${g.runner.inv.slayer}` : ''); el.classList.toggle('b1', isB1(fl)); el.classList.toggle('armed', g.runner.inv.slayer > 0); } }
    $('h-status').textContent = `🏢 ${floorName(flo(g.runner.pos))} · 🧩 ${g.missionText()} · 🐍 뷱 ${g.snakeAte.giants}/${SW()} · ⏱ 턴 ${g.turn} · 🔑 ${g.keysHeld}/${app.map.keys.length}${g.keysLeft.length ? '' : ' 문 열림!'} · 📏 거인까지 ${d >= 999 ? '-' : d + '칸'} · 🏃 ${g.runner.mode}${g.runner.sprintLeft > 0 ? ' ⚡' : ''}${g.runner.boost > 0 ? ' 🚀' : ''}${g.runner.cloak > 0 ? ' 👻' : ''}${invText(g.runner.inv, ' · 🎒 ', true)}${g.giants.some((G) => G.stun > 0) ? ' · 💫 기절 ' + g.giants.filter((G) => G.stun > 0).map((G) => G.id + 1).join('·') : ''}`;
  }
  function hudAmmo() {
    const g = app.game; if (!hud || !g) return;
    const n = g.runner.inv.shotgun, max = CFG.SHOTGUN_AMMO, fr = reloadFrac();
    $('h-ammoN').textContent = `${n}/${max}`;
    $('h-shells').innerHTML = Array.from({ length: max }, (_, i) => `<span class="sh${i < n ? ' on' : ''}"></span>`).join('');
    $('h-reload').style.width = Math.round((n >= max ? 1 : fr) * 100) + '%';
    $('h-ammo').classList.toggle('full', n >= max); $('h-ammo').classList.toggle('empty', n === 0);
    $('h-ammoSub').textContent = n >= max ? '장전 완료' : `장전 중… ${Math.round(fr * 100)}% (${CFG.SHOTGUN_RELOAD_SEC}초에 1발)`;
  }
  // v19: 뷱 진행도 (거인 n/30마리) — 목표에 가까울수록 빨갛게
  function hudSnake() {
    const g = app.game; if (!hud || !g || !$('h-snake')) return;
    const e = g.snakeAte.giants, W = SW(), fr = Math.min(1, e / W), S = g.snakes[0];
    $('h-snakeN').textContent = `${e}/${W}`;
    $('h-snakeBar').style.width = Math.round(fr * 100) + '%';
    $('h-snake').classList.toggle('hot', fr >= 0.7); $('h-snake').classList.toggle('won', g.result === 'snake');
    const blocks = g.snakeBlocks.tail + g.snakeBlocks.shot;
    $('h-snakeSub').textContent = g.result === 'snake' ? '👑 뷱 승리!' : S && S.hidden > 0 ? '🛡️ 땅속에 숨음' : S && S.stun > 0 ? '💫 기절' : (S ? S.mode : '') + (blocks ? ` · 🛡️ 막기 ${blocks}` : '');
  }
  function hudLog(text, cls) {
    if (!hud) return;
    const ul = $('h-log'), li = document.createElement('li'); if (cls) li.className = cls; li.textContent = text;
    ul.prepend(li); while (ul.children.length > 6) ul.lastChild.remove();
  }
  // 방송 카메라: 기본 3인칭 고정 (?cam= 으로 수동 지정 가능)
  const CAM_OK = ['tps', 'fpv', 'orbit', 'follow'], CAM_MS = { tps: 25000, fpv: 15000 };
  // 방송은 3인칭 고정: 시점 자동 전환 없음. 가까운 추격(거인 3칸 이내)은 중계 문구만 띄움
  function streamCamTick() {
    const R = window.Render3D; if (!R || !app.has3d || app.view !== '3d' || app.training) return;
    const now = performance.now(), g = app.game;
    const chase = g && !g.result && (app.nearD ?? 999) <= 3;
    if (chase && !app.chaseOn && now - (app.chaseLogAt || 0) > 8000) { hudLog('🎥 추격전! 거인이 바로 뒤에!', 'spot'); app.chaseLogAt = now; }
    app.chaseOn = !!chase;
  }
  function streamOnSmash() { /* 벽이 부서지면 전체/따라가기 화면에서도 흔들림이 보이도록 그대로 둠 */ }
  function streamStart() {
    hudBuild(); hudUpdate();
    $('autoNext').checked = true; const SP = String(Math.max(1, Math.min(40, parseInt(new URLSearchParams(location.search).get('speed') || '3', 10) || 3))); $('speed').value = SP; $('speedVal').textContent = SP; // 방송 기본 3턴/초 (?speed=N 로 변경) // 10턴/초 기준: 샷건 기절 3초 = 30턴, 거인 부활 5초 = 50턴
    setPlaying(true);
    setInterval(streamCamTick, 1000);
    // 방송 시작 카메라: 기본 3인칭. ?cam=tps|fpv (수동용으로 orbit|follow 도 가능 — 이때는 자동 전환 안 함)
    const camQ = new URLSearchParams(location.search).get('cam'), cam0 = CAM_OK.includes(camQ) ? camQ : 'tps';
    app.camManual = cam0 === 'orbit' || cam0 === 'follow';
    { const go = () => { setCam(cam0); app.camNextAt = performance.now() + (CAM_MS[cam0] || CAM_SWITCH_MS); }; if (app.has3d) go(); else window.addEventListener('render3d-ready', () => setTimeout(go, 50)); }
    // 멈춤 감시: 60초 동안 진행이 없으면 새 판
    setInterval(() => { if (app.playing && !app.training && app.game && !app.game.result && performance.now() - (app.lastTickAt || performance.now()) > 60000) { log('⚠️ 진행이 멈춰 새 경기를 시작합니다', 'spot'); newRound(true); } }, 15000);
    // 오류가 나면 저장 후 새로고침, 4시간마다 메모리 정리를 위해 새로고침
    window.addEventListener('error', () => { saveQuiet(); setTimeout(() => location.reload(), 3000); });
    setTimeout(() => { saveQuiet(); location.reload(); }, 4 * 3600 * 1000);
  }
  window.addEventListener('render3d-ready', () => { if (STREAM && window.Render3D.setPixelRatioCap) { window.Render3D.setPixelRatioCap(1); const m = window.Render3D.camMode; window.Render3D.setAutoRotate(m === 'orbit' || m === 'follow', 0.5); } });

  fpvBuild();
  renderGenes();
  // ?reset=<토큰>: 처음 보는 토큰이면 저장된 두뇌·점수를 지우고 새로 시작 (거인 4명·0세대·0:0:0). 같은 주소로 다시 열면(OBS 새로고침·4시간 자동 새로고침) 다시 지우지 않음
  { const rt = new URLSearchParams(location.search).get('reset');
    if (rt) { try { if (localStorage.getItem('giantEscape.lastReset') !== rt) { localStorage.removeItem(STORE); localStorage.setItem('giantEscape.lastReset', rt); app.didReset = rt; } } catch (e) { /* 저장소 사용 불가 시 무시 */ } } }
  if (!load(true)) newRound(true);
  if (app.didReset) log(`🧹 초기화 완료 — 0세대부터 다시 시작합니다 (거인 ${trainer.giantCount}명)`, 'learn');
  updateGiantCount();
  // 테스트/스크린샷용: 도망자 승리를 n번 기록한 것처럼 (거인 추가 경로를 그대로 탐)
  // 미리보기: 주소에 ?giants=N (4~10)을 붙이면 그 인원으로 시작. 저장은 하지 않음 (진짜 기록은 그대로)
  { const pg = +(new URLSearchParams(location.search).get('giants') || 0); if (pg > trainer.giantCount && pg <= CFG.GIANTS_MAX) { app.preview = true; while (trainer.giantCount < pg) trainer.addGiant(); renderGenes(); updateGiantCount(); newRound(true); log(`👀 미리보기: 거인 ${pg}명 (저장 안 함)`, 'grow'); } }
  app.testRunnerWins = (n) => { for (let i = 0; i < n; i++) { const added = trainer.recordVisible('runner', -1); if (added.length) log(`도망자 ${trainer.growWins}승! 거인이 한 명 늘었다 👹 (거인${added.map((k) => k + 1).join('·')} 등장 — 이제 ${trainer.giantCount}명)`, 'grow'); } renderGenes(); updateGiantCount(); hudUpdate(); };
  log(`👋 ▶ 시작을 누르면 도망자 1명과 거인 ${trainer.giantCount}명이 2층 미로에서 대결합니다. 💥 거인은 30초마다 벽을 부술 수 있고, 도망자가 ${CFG.WINS_PER_GIANT}승 할 때마다 거인이 1명씩 늘어납니다(최대 ${CFG.GIANTS_MAX}명).`); log(` 🧰 열쇠는 잠긴 상자 안 — 미션(🕹️스위치 켜기 · 💎보석 옮기기 · ⏳발판 버티기)을 풀어야 열립니다. 🐍 뷱은 알약💊을 먹고 길어지며 거인을 삼킵니다 — 도망자는 뷱을 그냥 통과합니다(꼬리를 잡으면 잠시 숨음). 🌫 도망자는 직접 본 곳만 기억합니다(전체 지도 보기로 전체 공개). 🔫 도망자 기본 스킬 샷건: 최대 ${CFG.SHOTGUN_AMMO}발, ${CFG.SHOTGUN_RELOAD_SEC}초마다 1발 장전, 맞으면 ${CFG.STUN_SEC}초 기절(멀수록 잘 빗나감). 🎒 도망자 아이템: 💨연막탄 🚀부스터 👻투명망토 🤸벽넘기 🧱바리케이드 · 거인 아이템: 🔊포효 🐾냄새 추적기 🚧바리케이드. 💥 거인은 각자 30초 쿨타임으로 안쪽 벽·바리케이드를 부숩니다(바깥 벽·문 근처·계단은 불가). 👀 도망자 시점 버튼으로 1인칭으로 볼 수 있어요. ⚡ 빠른 훈련으로 수백 판을 순식간에 학습시킬 수 있어요.`, 'learn');
  log(`⛏️ 새 지역: 엄청 큰 지하 1층(B1)! 1층 해치로 내려갈 수 있고, 어딘가에 거인을 처치하는 전설의 무기 🔱 번개창이 숨겨져 있습니다. 하지만 지하에는 2×2 크기의 거대한 🦖 공룡 두 마리가 돌아다닙니다 — 눈은 나쁘고 길도 잘 못 찾지만 코는 아주 좋아서 발자국 냄새를 따라오고, 먹잇감을 보면 돌격합니다.`, 'snake');
  log(`🪨 새 함정: 바위! 지하에 2개, 1층 출구 문마다 1개. 거인만 한 칸씩 밀 수 있고, 해치나 출구 문 앞을 막아 도망자의 탈출을 막습니다. 문 앞을 막은 바위는 그 판 내내 그대로 — 두 문이 다 막히면 도망자는 지하의 무기를 찾거나 시간(2000턴) 끝까지 버텨야 합니다.`, 'boulder');
  log(`🐍 새 규칙: 뷱도 학습합니다! 한 판에 거인 ${SW()}마리를 먹으면 뷱 승리(도망자·거인팀 모두 패배) — 도망자는 꼬리 잡기와 샷건으로 뷱을 막습니다.`, 'snake');
  setView(window.Render3D ? '3d' : '2d');
  if (window.Render3D) init3D();
  if (STREAM) streamStart();
  requestAnimationFrame(loop);
})();
