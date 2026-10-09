/* 거인과 도망자 — 화면/조작 */
(function () {
  'use strict';
  const GE = window.GE, CFG = GE.CFG;
  const $ = (id) => document.getElementById(id);
  const STORE = 'giantEscape.brains.v2'; // v2: 문 2개·거인 시야 축소 버전 (v1 저장본은 무시)

  const trainer = new GE.Trainer((Math.random() * 2 ** 32) >>> 0);
  const app = {
    trainer, game: null, map: null, seed: 0,
    playing: false, training: false, lastTick: 0, acc: 0,
    score: { runner: 0, giant: 0, draw: 0 },
    vision: null, trail: [], loggedAt: {}, nextTimer: null, flashGenes: {},
  };
  window.__app = app; // 디버그/테스트용

  // ---------- 캔버스 ----------
  const board = $('board'), ctx = board.getContext('2d');
  const chart = $('chart'), cctx = chart.getContext('2d');
  let tile = 30;
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = $('canvasWrap').clientWidth;
    tile = w / CFG.W;
    board.width = Math.round(w * dpr); board.height = Math.round(tile * CFG.H * dpr);
    board.style.height = (tile * CFG.H) + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cw = chart.clientWidth, ch = chart.clientHeight;
    chart.width = Math.round(cw * dpr); chart.height = Math.round(ch * dpr);
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(); drawChart();
  }
  window.addEventListener('resize', resize);

  const xy = (i) => [i % CFG.W, (i / CFG.W) | 0];
  function lerpPath(path, t) {
    if (!path || path.length < 2) { const [x, y] = xy(path[path.length - 1]); return [x, y]; }
    const segs = path.length - 1, f = Math.min(segs - 1e-9, t * segs), k = Math.floor(f), u = f - k;
    const [x0, y0] = xy(path[k]), [x1, y1] = xy(path[k + 1]);
    return [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u];
  }
  const ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  function emoji(ch, cx, cy, size) {
    ctx.font = `${size}px "Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffffff';
    ctx.fillText(ch, cx, cy + size * 0.05);
  }

  function draw() {
    const g = app.game, m = app.map;
    if (!m) return;
    const W = CFG.W, H = CFG.H, T = tile, now = performance.now();
    ctx.clearRect(0, 0, W * T, H * T);
    // 바닥/벽
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (m.g[i] === 1) {
        ctx.fillStyle = '#2b3157'; ctx.fillRect(x * T, y * T, T + 0.5, T + 0.5);
        ctx.fillStyle = '#353c6b'; ctx.fillRect(x * T, y * T, T + 0.5, T * 0.22);
      } else {
        ctx.fillStyle = (x + y) % 2 ? '#141830' : '#171b35'; ctx.fillRect(x * T, y * T, T + 0.5, T + 0.5);
      }
    }
    if (!g) return;
    const interval = 1000 / +$('speed').value;
    const t = g.result ? 1 : ease(Math.min(1, app.acc / interval));
    // 거인 시야
    if ($('showVision').checked && app.vision) {
      ctx.fillStyle = 'rgba(255,80,80,0.10)';
      for (const i of app.vision) { const [x, y] = xy(i); ctx.fillRect(x * T, y * T, T, T); }
    }
    // 도망자 발자국
    app.trail.forEach((i, k) => {
      const [x, y] = xy(i); ctx.fillStyle = `rgba(79,195,255,${0.05 + 0.25 * k / app.trail.length})`;
      ctx.beginPath(); ctx.arc((x + .5) * T, (y + .5) * T, T * 0.12, 0, Math.PI * 2); ctx.fill();
    });
    // 문 근처 (거인이 오래 머물 수 없는 구역)
    const banned = g.giant.doorBan > 0;
    ctx.fillStyle = banned ? `rgba(255,230,120,${0.16 + 0.08 * Math.sin(now / 150)})` : 'rgba(255,230,120,0.06)';
    for (const i of m.floor) if (m.nearDoor[i]) { const [x, y] = xy(i); ctx.fillRect(x * T, y * T, T, T); }
    // 출구 2개 (문 A / 문 B) — 거인은 문 칸에 들어갈 수 없음
    m.exits.forEach((e, k) => {
      const [x, y] = xy(e), open = g.keysLeft.length === 0;
      ctx.fillStyle = open ? `rgba(89,227,154,${0.35 + 0.2 * Math.sin(now / 200)})` : 'rgba(120,90,60,0.55)';
      ctx.fillRect(x * T, y * T, T, T);
      emoji('🚪', (x + .5) * T, (y + .5) * T, T * 0.8);
      if (!open) emoji('🔒', (x + .78) * T, (y + .25) * T, T * 0.38);
      ctx.font = `bold ${Math.max(10, T * 0.36)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.strokeText(m.exitNames[k], (x + .2) * T, (y + .22) * T);
      ctx.fillStyle = open ? '#59e39a' : '#ffd54a'; ctx.fillText(m.exitNames[k], (x + .2) * T, (y + .22) * T);
    });
    // 열쇠
    for (const k of g.keysLeft) { const [x, y] = xy(k);
      ctx.fillStyle = 'rgba(255,213,74,0.18)'; ctx.beginPath(); ctx.arc((x + .5) * T, (y + .5) * T, T * 0.45, 0, Math.PI * 2); ctx.fill();
      emoji('🔑', (x + .5) * T, (y + .5) * T + Math.sin(now / 250 + k) * T * 0.06, T * 0.7); }
    // 거인 목표 표시
    if (g.giant.goal >= 0 && !g.result) { const [x, y] = xy(g.giant.goal);
      ctx.strokeStyle = 'rgba(255,93,93,0.6)'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
      ctx.strokeRect(x * T + 3, y * T + 3, T - 6, T - 6); ctx.setLineDash([]); }
    // 도망자
    const [rx, ry] = lerpPath([g.runner.prev, g.runner.pos], t);
    if (!(g.result === 'giant')) {
      ctx.fillStyle = 'rgba(79,195,255,0.28)'; ctx.beginPath(); ctx.arc((rx + .5) * T, (ry + .5) * T, T * 0.46, 0, Math.PI * 2); ctx.fill();
      emoji('🏃', (rx + .5) * T, (ry + .5) * T + Math.abs(Math.sin(now / 90)) * -T * 0.05, T * 0.78);
      if (g.keysHeld) emoji('🔑'.repeat(1), (rx + .85) * T, (ry + .1) * T, T * 0.32);
    }
    // 거인 (크게)
    const [gx, gy] = lerpPath(g.giant.path, t);
    const dashing = g.giant.dashLeft > 0 || (g.giant.path && g.giant.path.length > 2);
    if (dashing) { ctx.fillStyle = 'rgba(255,170,60,0.25)'; ctx.beginPath(); ctx.arc((gx + .5) * T, (gy + .5) * T, T * 0.9, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,93,93,0.30)'; ctx.beginPath(); ctx.arc((gx + .5) * T, (gy + .5) * T, T * 0.62, 0, Math.PI * 2); ctx.fill();
    const wob = Math.sin(now / 160) * 0.04;
    emoji(g.result === 'giant' ? '😋' : '👹', (gx + .5) * T, (gy + .5) * T, T * (1.35 + wob));
  }

  // ---------- 차트 ----------
  function drawChart() {
    const w = chart.clientWidth, h = chart.clientHeight, H = trainer.history;
    cctx.clearRect(0, 0, w, h);
    const pad = { l: 30, r: 6, t: 8, b: 18 };
    const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
    cctx.font = '10px sans-serif'; cctx.fillStyle = '#9aa3c7'; cctx.textAlign = 'right'; cctx.textBaseline = 'middle';
    for (const p of [0, 50, 100]) { const y = pad.t + ph * (1 - p / 100); cctx.fillText(p + '%', pad.l - 4, y);
      cctx.strokeStyle = p === 50 ? '#6b7299' : '#262b48'; cctx.setLineDash(p === 50 ? [4, 4] : []); cctx.beginPath(); cctx.moveTo(pad.l, y); cctx.lineTo(w - pad.r, y); cctx.stroke(); }
    cctx.setLineDash([]);
    if (H.length === 0) { cctx.textAlign = 'center'; cctx.fillText('아직 학습 기록이 없습니다', pad.l + pw / 2, pad.t + ph / 2 - 14); return; }
    const data = H.slice(-300), n = data.length, win = Math.max(1, Math.min(10, Math.round(n / 8)));
    const X = (k) => pad.l + (n === 1 ? pw / 2 : pw * k / (n - 1));
    const Y = (v) => pad.t + ph * (1 - v);
    const smooth = (key) => data.map((_, k) => { let s = 0, c = 0; for (let j = Math.max(0, k - win + 1); j <= k; j++) { s += data[j][key] + data[j].draw / 2; c++; } return s / c; });
    for (const [key, col] of [['runner', '#4fc3ff'], ['giant', '#ff5d5d']]) {
      cctx.fillStyle = col + '44';
      data.forEach((d, k) => { cctx.fillRect(X(k) - 1, Y(d[key] + d.draw / 2) - 1, 2, 2); });
      const s = smooth(key); cctx.strokeStyle = col; cctx.lineWidth = 2; cctx.beginPath();
      s.forEach((v, k) => k ? cctx.lineTo(X(k), Y(v)) : cctx.moveTo(X(k), Y(v))); cctx.stroke();
    }
    cctx.fillStyle = '#9aa3c7'; cctx.textBaseline = 'top';
    cctx.textAlign = 'left'; cctx.fillText(data[0].gen + '세대', pad.l, h - 14);
    cctx.textAlign = 'right'; cctx.fillText(data[n - 1].gen + '세대', w - pad.r, h - 14);
  }

  // ---------- 능력치 ----------
  function renderGenes() {
    for (const [side, defs] of [['runner', GE.RUNNER_GENES], ['giant', GE.GIANT_GENES]]) {
      const box = $('genes-' + side), genes = trainer[side].genes;
      if (!box.children.length) box.innerHTML = defs.map((d) => `<div class="gene" data-k="${d.key}"><div class="name"><span>${d.label}</span><span class="v"></span></div><div class="bar"><i></i></div></div>`).join('');
      for (const d of defs) {
        const el = box.querySelector(`[data-k="${d.key}"]`), v = genes[d.key];
        el.querySelector('.v').textContent = Math.round(v * 100);
        el.querySelector('i').style.width = (v * 100).toFixed(1) + '%';
        el.classList.toggle('flash', !!app.flashGenes[side + d.key]);
      }
      $('lv-' + side).textContent = trainer[side].level;
    }
    $('st-gen').textContent = trainer.generation;
    const tw = trainer.trainWins;
    $('sc-train').textContent = `훈련 경기 ${trainer.rounds}판 (도망자 ${tw.runner} · 거인 ${tw.giant} · 무 ${tw.draw})`;
  }

  // ---------- 로그 ----------
  function log(text, cls, turnLabel) {
    const li = document.createElement('li'); if (cls) li.className = cls;
    li.innerHTML = `<span class="t">${turnLabel || ''}</span>`; li.appendChild(document.createTextNode(text));
    const ul = $('log'); ul.prepend(li);
    while (ul.children.length > 80) ul.lastChild.remove();
  }
  function flushEvents() {
    const g = app.game;
    while (g.events.length) {
      const e = g.events.shift();
      const key = e.type + e.text;
      if (['spot', 'lost', 'ambush', 'dash'].includes(e.type) && app.loggedAt[key] !== undefined && e.turn - app.loggedAt[key] < 8) continue;
      app.loggedAt[key] = e.turn;
      log(e.text, e.type, `턴 ${e.turn}`);
    }
  }

  // ---------- 게임 흐름 ----------
  function newRound(newMap) {
    clearTimeout(app.nextTimer);
    if (newMap || !app.map) { app.seed = (Math.random() * 2 ** 32) >>> 0; app.map = GE.generateMap(app.seed); }
    app.game = new GE.Game(app.map, { ...trainer.runner.genes }, { ...trainer.giant.genes }, app.seed);
    app.trail = []; app.loggedAt = {}; app.acc = 0;
    $('overlay').classList.add('hidden');
    log(`— 새 경기 시작 (도망자 Lv.${trainer.runner.level} vs 거인 Lv.${trainer.giant.level}) —`, 'end');
    updateStatus(); draw();
  }
  function updateStatus() {
    const g = app.game; if (!g) return;
    $('st-turn').textContent = g.turn; $('st-max').textContent = CFG.MAX_TURNS;
    $('st-keys').textContent = `${g.keysHeld}/${app.map.keys.length}` + (g.keysLeft.length === 0 ? ' · 문 A/B 열림' : '');
    const d = GE.bfs(app.map, g.giant.pos, app.map.gNbrs)[g.runner.pos];
    $('st-dist').textContent = d >= 999 ? '문 안 (안전)' : d + '칸';
    $('st-rmode').textContent = g.runner.mode; $('st-gmode').textContent = g.giant.mode;
    $('st-dash').textContent = (g.giant.dashLeft > 0 ? '돌진 중!' : g.giant.dashCd > 0 ? `충전 ${g.giant.dashCd}` : '준비') + (g.giant.doorBan > 0 ? ` · 문 접근금지 ${g.giant.doorBan}` : '');
    app.vision = app.map.floor.filter((i) => GE.giantSees(g, i)); // 거인 시야(앞쪽 부채꼴)
  }
  function tick() {
    const g = app.game; if (!g || g.result) return;
    app.trail.push(g.runner.pos); if (app.trail.length > 14) app.trail.shift();
    g.step(); flushEvents(); updateStatus();
    if (g.result) onRoundEnd();
  }
  function onRoundEnd() {
    const g = app.game, r = g.result;
    app.score[r]++;
    $('sc-runner').textContent = app.score.runner; $('sc-giant').textContent = app.score.giant; $('sc-draw').textContent = app.score.draw;
    $('overlayText').textContent = r === 'runner' ? '🏃 탈출 성공!' : r === 'giant' ? '👹 잡아먹었다!' : '⏳ 시간 초과';
    $('overlayText').style.color = r === 'runner' ? '#4fc3ff' : r === 'giant' ? '#ff5d5d' : '#cfd3ef';
    $('overlaySub').textContent = `${g.turn}턴 · 경기 후 두 AI가 복기 훈련 중…`;
    $('overlay').classList.remove('hidden');
    // 경기 후 한 세대 학습
    setTimeout(() => {
      const out = trainer.trainGeneration();
      reportLearning(out.changes, out.rec);
      $('overlaySub').textContent = `${g.turn}턴 · ${trainer.generation}세대 학습 완료`;
      if ($('autoNext').checked && app.playing) app.nextTimer = setTimeout(() => newRound(true), 1600);
      else setPlaying(false);
    }, 50);
  }
  function reportLearning(changes, rec) {
    app.flashGenes = {};
    const seen = new Set();
    changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    for (const c of changes) { if (seen.size >= 3) break; seen.add(c.side + c.key); app.flashGenes[c.side + c.key] = 1;
      log(`🧠 ${c.text} (${c.label} ${c.delta > 0 ? '▲' : '▼'}${Math.round(Math.abs(c.delta) * 100)})`, 'learn', `${trainer.generation}세대`); }
    if (rec) log(`📊 ${trainer.generation}세대 훈련 ${rec.n}판: 도망자 ${Math.round(rec.runner * 100)}% · 거인 ${Math.round(rec.giant * 100)}%`, 'learn', `${trainer.generation}세대`);
    renderGenes(); drawChart();
  }
  function setPlaying(p) {
    app.playing = p; $('btnPlay').textContent = p ? '⏸ 일시정지' : '▶ 시작';
    if (p && app.game && app.game.result) newRound(true);
  }

  // ---------- 빠른 훈련 ----------
  function fastTrain(gens) {
    if (app.training) return;
    const wasPlaying = app.playing; setPlaying(false); clearTimeout(app.nextTimer);
    app.training = true; document.querySelectorAll('button,select').forEach((b) => b.disabled = true);
    $('trainOverlay').classList.remove('hidden');
    const before = { runner: { ...trainer.runner.genes }, giant: { ...trainer.giant.genes } };
    const lv0 = { runner: trainer.runner.level, giant: trainer.giant.level };
    let done = 0; const tot = { r: 0, g: 0, d: 0, n: 0 };
    const chunk = () => {
      const t0 = performance.now();
      while (done < gens && performance.now() - t0 < 30) {
        const out = trainer.trainGeneration(); done++;
        tot.r += out.rec.runner * out.n; tot.g += out.rec.giant * out.n; tot.d += out.rec.draw * out.n; tot.n += out.n;
      }
      $('trainBar').style.width = (100 * done / gens) + '%';
      $('trainText').textContent = `${done}/${gens}세대 · ${tot.n}판 · 도망자 ${Math.round(100 * tot.r / tot.n)}% / 거인 ${Math.round(100 * tot.g / tot.n)}%`;
      renderGenes(); drawChart();
      if (done < gens) return setTimeout(chunk, 0);
      // 요약
      const changes = [];
      for (const [side, defs] of [['runner', GE.RUNNER_GENES], ['giant', GE.GIANT_GENES]]) for (const d of defs) {
        const delta = trainer[side].genes[d.key] - before[side][d.key];
        if (Math.abs(delta) >= 0.12) changes.push({ side, key: d.key, label: d.label, delta, text: delta > 0 ? d.up : d.down });
      }
      log(`⚡ 빠른 훈련 ${gens}세대(${tot.n}판) 완료 — 도망자 ${Math.round(100 * tot.r / tot.n)}% · 거인 ${Math.round(100 * tot.g / tot.n)}% · 레벨 도망자 +${trainer.runner.level - lv0.runner}, 거인 +${trainer.giant.level - lv0.giant}`, 'learn', `${trainer.generation}세대`);
      reportLearning(changes.slice(0, 6), null);
      $('trainOverlay').classList.add('hidden');
      document.querySelectorAll('button,select').forEach((b) => b.disabled = false);
      app.training = false;
      newRound(true); setPlaying(true);
    };
    setTimeout(chunk, 30);
  }

  // ---------- 저장/불러오기 ----------
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify({ trainer: trainer.toJSON(), score: app.score, savedAt: Date.now() }));
      log(`💾 두뇌 저장 완료 (${trainer.generation}세대, 도망자 Lv.${trainer.runner.level} · 거인 Lv.${trainer.giant.level})`, 'learn'); }
    catch (e) { log('저장 실패: ' + e.message, 'spot'); }
  }
  function load(silent) {
    try { const raw = localStorage.getItem(STORE);
      if (!raw) { if (!silent) log('저장된 두뇌가 없습니다', 'spot'); return false; }
      const o = JSON.parse(raw);
      if (!trainer.load(o.trainer)) return false;
      app.score = o.score || app.score;
      $('sc-runner').textContent = app.score.runner; $('sc-giant').textContent = app.score.giant; $('sc-draw').textContent = app.score.draw;
      renderGenes(); drawChart(); newRound(true);
      log(`📂 두뇌 불러오기 완료 (${trainer.generation}세대, ${new Date(o.savedAt).toLocaleString('ko-KR')} 저장본)`, 'learn');
      return true;
    } catch (e) { log('불러오기 실패: ' + e.message, 'spot'); return false; }
  }
  function resetBrains() {
    if (!confirm('두 AI의 학습 내용과 점수를 모두 지우고 처음부터 시작할까요? (저장본은 그대로 남습니다)')) return;
    trainer.reset(); app.score = { runner: 0, giant: 0, draw: 0 }; app.flashGenes = {};
    ['sc-runner', 'sc-giant', 'sc-draw'].forEach((id) => $(id).textContent = '0');
    $('log').innerHTML = ''; log('🧹 두뇌 초기화 — 두 AI 모두 1레벨부터 다시 배웁니다', 'learn');
    renderGenes(); drawChart(); newRound(true);
  }

  // ---------- 이벤트 ----------
  $('btnPlay').onclick = () => setPlaying(!app.playing);
  $('btnRestart').onclick = () => { newRound(false); };
  $('btnNewMap').onclick = () => { newRound(true); };
  $('speed').oninput = () => { $('speedVal').textContent = $('speed').value; };
  $('btnTrain').onclick = () => fastTrain(+$('trainGens').value);
  $('btnSave').onclick = save;
  $('btnLoad').onclick = () => load(false);
  $('btnResetBrain').onclick = resetBrains;
  document.addEventListener('visibilitychange', () => { app.lastTick = performance.now(); });

  function loop(now) {
    const dt = Math.min(250, now - (app.lastTick || now)); app.lastTick = now;
    if (app.playing && app.game && !app.game.result && !app.training) {
      app.acc += dt; const interval = 1000 / +$('speed').value;
      let guard = 0;
      while (app.acc >= interval && guard++ < 10 && !app.game.result) { app.acc -= interval; tick(); }
    }
    draw();
    requestAnimationFrame(loop);
  }

  // 시작
  renderGenes();
  if (!load(true)) newRound(true);
  log('👋 ▶ 시작을 누르면 AI 두 명이 대결합니다. ⚡ 빠른 훈련으로 수백 판을 순식간에 학습시킬 수 있어요.', 'learn');
  resize();
  requestAnimationFrame(loop);
})();
