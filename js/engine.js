/* 거인과 도망자 — 게임 엔진 + AI + 공진화(유전 알고리즘)
 * 브라우저(window.GE)와 Node(require) 양쪽에서 동작합니다. 외부 라이브러리 없음. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- 설정 ----------
  const CFG = {
    W: 23, H: 15,          // 홀수 (미로)
    KEYS: 2,
    MAX_TURNS: 420,
    VISION: 7,             // 도망자 시야 반경 (벽에 가려짐)
    GIANT_VISION: 5,       // 거인 시야: 반경 5칸, 바라보는 방향 앞쪽 부채꼴(120°)만 보임
    GIANT_CONE_COS: 0.5,   // cos(60°) → 좌우 60°씩
    DOOR_LINGER: 8, DOOR_BAN: 14, // 문 근처(2칸)에서 8턴 넘게 서성이면 14턴 동안 문 근처 접근 금지
    HEAR: 6,               // 도망자는 미로 거리 6칸 안의 거인 발소리를 듣는다
    // 거인 속도/청각은 'stride' 유전자로 배분: 빠를수록 귀가 어둡다
    GIANT_SKIP_MIN: 6, GIANT_SKIP_MAX: 20,   // N턴에 1번 쉰다
    GIANT_HEAR_MAX: 8, GIANT_HEAR_MIN: 3,
    DASH_LEN: 3, DASH_COOLDOWN: 22,
    MAPS_PER_GEN: 4,       // 세대당 맵 4개 × 2×2 대진 = 16판
    BRAID: 0.10, DEADEND_REMOVE: 0.55,
  };

  // ---------- 난수 ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(rng) {
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const giantSkip = (gg) => Math.round(CFG.GIANT_SKIP_MIN + (CFG.GIANT_SKIP_MAX - CFG.GIANT_SKIP_MIN) * gg.stride);
  const giantHear = (gg) => Math.round(CFG.GIANT_HEAR_MAX - (CFG.GIANT_HEAR_MAX - CFG.GIANT_HEAR_MIN) * gg.stride);

  // ---------- 미로 ----------
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  function generateMap(seed) {
    const rng = mulberry32(seed >>> 0);
    const W = CFG.W, H = CFG.H;
    const g = new Uint8Array(W * H).fill(1); // 1=벽
    const idx = (x, y) => y * W + x;
    // 재귀 백트래커
    const stack = [[1, 1]]; g[idx(1, 1)] = 0;
    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      const opts = [];
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx * 2, ny = cy + dy * 2;
        if (nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1 && g[idx(nx, ny)] === 1) opts.push([nx, ny, dx, dy]);
      }
      if (!opts.length) { stack.pop(); continue; }
      const [nx, ny, dx, dy] = opts[Math.floor(rng() * opts.length)];
      g[idx(cx + dx, cy + dy)] = 0; g[idx(nx, ny)] = 0; stack.push([nx, ny]);
    }
    // 고리 만들기 (벽 일부 제거)
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (g[idx(x, y)] !== 1) continue;
      const h = g[idx(x - 1, y)] === 0 && g[idx(x + 1, y)] === 0 && g[idx(x, y - 1)] === 1 && g[idx(x, y + 1)] === 1;
      const v = g[idx(x, y - 1)] === 0 && g[idx(x, y + 1)] === 0 && g[idx(x - 1, y)] === 1 && g[idx(x + 1, y)] === 1;
      if ((h || v) && rng() < CFG.BRAID) g[idx(x, y)] = 0;
    }
    // 막다른 길 일부 뚫기
    for (let y = 1; y < H - 1; y += 2) for (let x = 1; x < W - 1; x += 2) {
      let open = 0; const walls = [];
      for (const [dx, dy] of DIRS) {
        const wx = x + dx, wy = y + dy;
        if (g[idx(wx, wy)] === 0) open++;
        else if (wx > 0 && wy > 0 && wx < W - 1 && wy < H - 1) walls.push(idx(wx, wy));
      }
      if (open === 1 && walls.length && rng() < CFG.DEADEND_REMOVE) g[walls[Math.floor(rng() * walls.length)]] = 0;
    }
    const map = { W, H, g, seed };
    buildNbrs(map);
    const pick = (cands) => cands[Math.floor(rng() * cands.length)];
    // 도망자 / 거인 시작점
    const corners = map.floor.filter((i) => { const x = i % W, y = (i / W) | 0; return (x < 5 || x > W - 6) && (y < 4 || y > H - 5); });
    map.runnerStart = pick(corners.length ? corners : map.floor);
    const dR = bfs(map, map.runnerStart);
    const maxR = Math.max(...map.floor.map((i) => dR[i]));
    map.giantStart = pick(map.floor.filter((i) => dR[i] >= maxR * 0.7));
    const dG = bfs(map, map.giantStart);
    // 출구 2개: 바깥 벽에 문을 뚫는다 (문 칸은 항상 막다른 칸 → 길을 끊지 않음). 서로 멀리 떨어지게.
    const doorCands = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!(x === 0 || y === 0 || x === W - 1 || y === H - 1)) continue;
      if ((x === 0 || x === W - 1) && (y === 0 || y === H - 1)) continue;
      const inner = x === 0 ? idx(1, y) : x === W - 1 ? idx(W - 2, y) : y === 0 ? idx(x, 1) : idx(x, H - 2);
      if (g[inner] !== 0 || inner === map.runnerStart || inner === map.giantStart) continue;
      doorCands.push({ door: idx(x, y), inner });
    }
    const dist = (a, b) => manhattan(map, a, b);
    let aC = doorCands.filter((c) => dR[c.inner] >= maxR * 0.45 && dG[c.inner] >= 8);
    if (!aC.length) aC = doorCands.filter((c) => dR[c.inner] >= maxR * 0.3);
    if (!aC.length) aC = doorCands;
    const A = pick(aC);
    const dA = bfs(map, A.inner);
    const maxA = Math.max(...map.floor.map((i) => dA[i]));
    let bC = doorCands.filter((c) => c !== A && dA[c.inner] >= maxA * 0.6 && dR[c.inner] >= maxR * 0.3 && dG[c.inner] >= 6 && dist(c.door, A.door) >= 10);
    if (!bC.length) bC = doorCands.filter((c) => c !== A && dA[c.inner] >= maxA * 0.45 && dist(c.door, A.door) >= 6);
    if (!bC.length) bC = doorCands.filter((c) => c !== A);
    const B = pick(bC);
    map.exits = [A.door, B.door];
    map.exitNames = ['A', 'B'];
    for (const e of map.exits) g[e] = 0;
    buildNbrs(map);
    map.isExit = new Uint8Array(W * H); for (const e of map.exits) map.isExit[e] = 1;
    // 도망자: 열쇠를 다 모으기 전엔 문 칸에 못 들어감 / 거인: 문 칸에는 절대 못 들어감
    map.lockedNbrs = new Array(W * H); map.gNbrs = new Array(W * H);
    for (const i of map.floor) { map.lockedNbrs[i] = map.nbrs[i].filter((j) => !map.isExit[j]); map.gNbrs[i] = map.lockedNbrs[i]; }
    // 문 근처(미로 거리 2칸 이내) 표시 + 거인 매복 자리(문에서 3칸)
    map.nearDoor = new Uint8Array(W * H); map.guardSpot = [];
    for (const e of map.exits) {
      const d = bfs(map, e);
      for (const i of map.floor) if (!map.isExit[i] && d[i] <= 2) map.nearDoor[i] = 1;
      let spot = -1; for (const i of map.floor) if (d[i] === 3) { spot = i; break; }
      if (spot < 0) for (const i of map.floor) if (!map.isExit[i] && (spot < 0 || Math.abs(d[i] - 3) < Math.abs(d[spot] - 3))) spot = i;
      map.guardSpot.push(spot);
    }
    // 열쇠
    const dE = bfs(map, map.exits[0]), dE2 = bfs(map, map.exits[1]);
    map.keys = [];
    for (let k = 0; k < CFG.KEYS; k++) {
      let c = map.floor.filter((i) => !map.isExit[i] && !map.nearDoor[i] && dR[i] >= 8 && dG[i] >= 6 && Math.min(dE[i], dE2[i]) >= 7 && !map.keys.includes(i) &&
        map.keys.every((kk) => manhattan(map, kk, i) >= 6));
      if (!c.length) c = map.floor.filter((i) => !map.isExit[i] && i !== map.runnerStart && i !== map.giantStart && !map.keys.includes(i));
      map.keys.push(pick(c));
    }
    return map;
  }
  function buildNbrs(map) {
    const { W, H, g } = map;
    map.floor = []; for (let i = 0; i < W * H; i++) if (g[i] === 0) map.floor.push(i);
    map.nbrs = new Array(W * H);
    for (const i of map.floor) {
      const x = i % W, y = (i / W) | 0, list = [];
      for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = ny * W + nx; if (g[j] === 0) list.push(j); }
      map.nbrs[i] = list;
    }
  }
  function manhattan(map, a, b) { return Math.abs(a % map.W - b % map.W) + Math.abs(((a / map.W) | 0) - ((b / map.W) | 0)); }

  function bfs(map, src, nb) {
    nb = nb || map.nbrs;
    const d = new Int16Array(map.W * map.H).fill(-1);
    const q = new Int16Array(map.W * map.H); let h = 0, t = 0;
    d[src] = 0; q[t++] = src;
    while (h < t) { const c = q[h++]; const l = nb[c]; if (!l) continue; for (const n of l) if (d[n] < 0) { d[n] = d[c] + 1; q[t++] = n; } }
    for (let i = 0; i < d.length; i++) if (d[i] < 0) d[i] = 999;
    return d;
  }
  // 비용 맵 다익스트라 (목표에서 역방향)
  function dijkstra(map, src, cost, nb) {
    nb = nb || map.nbrs;
    const N = map.W * map.H, dist = new Float64Array(N).fill(Infinity);
    const heap = [[0, src]]; dist[src] = 0;
    const push = (e) => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    while (heap.length) {
      const [dc, c] = pop(); if (dc > dist[c]) continue;
      for (const n of (nb[c] || [])) { const nd = dc + cost[c]; if (nd < dist[n]) { dist[n] = nd; push([nd, n]); } }
    }
    return dist;
  }
  function lineOfSight(map, a, b) {
    let x0 = a % map.W, y0 = (a / map.W) | 0; const x1 = b % map.W, y1 = (b / map.W) | 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (map.g[y0 * map.W + x0] === 1) return false;
      if (x0 === x1 && y0 === y1) return true;
      const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  function sees(map, a, b) {
    const dx = a % map.W - b % map.W, dy = ((a / map.W) | 0) - ((b / map.W) | 0);
    return dx * dx + dy * dy <= CFG.VISION * CFG.VISION && lineOfSight(map, a, b);
  }

  // 거인 시야: 반경 GIANT_VISION, 바라보는 방향 앞쪽 부채꼴 + 바로 옆(1칸)은 항상 보임
  function giantSees(game, target) {
    const m = game.map, G = game.giant, a = G.pos;
    const dx = target % m.W - a % m.W, dy = ((target / m.W) | 0) - ((a / m.W) | 0);
    const d2 = dx * dx + dy * dy;
    if (d2 > CFG.GIANT_VISION * CFG.GIANT_VISION) return false;
    if (d2 > 2) {
      const [fx, fy] = G.facing;
      if ((fx * dx + fy * dy) / Math.sqrt(d2) < CFG.GIANT_CONE_COS) return false;
    }
    return lineOfSight(m, a, target);
  }

  // ---------- 유전자 정의 ----------
  const RUNNER_GENES = [
    { key: 'danger', label: '경계심', up: '도망자가 거인 근처 길을 더 피하게 됐다', down: '도망자가 위험을 감수하고 지름길을 택하기 시작했다' },
    { key: 'flee', label: '도주 반경', up: '도망자가 더 멀리서부터 도망치는 법을 배웠다', down: '도망자가 거인이 가까이 와도 침착해졌다' },
    { key: 'greed', label: '열쇠 욕심', up: '도망자가 쫓기면서도 열쇠를 향해 밀어붙인다', down: '도망자가 쫓기면 일단 살고 보는 법을 배웠다' },
    { key: 'loop', label: '고리 활용', up: '도망자가 미로의 고리를 돌며 따돌리는 법을 배웠다', down: '도망자가 고리 대신 직선 도주를 택했다' },
    { key: 'predict', label: '예측력', up: '도망자가 거인의 다음 움직임을 예측하기 시작했다', down: '도망자가 지금 보이는 것만 믿게 됐다' },
    { key: 'memory', label: '기억력', up: '도망자가 거인을 마지막으로 본 곳을 오래 기억한다', down: '도망자가 지난 위험을 빨리 잊고 전진한다' },
    { key: 'keySafe', label: '안전한 목표 우선', up: '도망자가 거인에게서 먼 열쇠·문부터 노리기 시작했다', down: '도망자가 가까운 열쇠·문부터 가는 쪽을 택했다' },
  ];
  const GIANT_GENES = [
    { key: 'stride', label: '속도 집중', up: '거인이 귀 대신 다리를 단련해 더 빨라졌다', down: '거인이 속도를 줄이고 청각을 키웠다' },
    { key: 'intercept', label: '길목 차단', up: '거인이 도망자 앞길을 끊는 법을 배웠다', down: '거인이 정직하게 뒤를 쫓는 쪽으로 돌아갔다' },
    { key: 'lookahead', label: '예측 거리', up: '거인이 도망자의 몇 수 앞을 내다보기 시작했다', down: '거인이 가까운 미래만 보게 됐다' },
    { key: 'ambush', label: '매복 성향', up: '거인이 열쇠 근처 매복을 배웠다', down: '거인이 매복보다 순찰을 택했다' },
    { key: 'dash', label: '돌진 거리', up: '거인이 더 먼 거리에서 돌진하기 시작했다', down: '거인이 돌진을 아껴 결정적 순간에 쓴다' },
    { key: 'patience', label: '끈기', up: '거인이 놓친 도망자를 더 끈질기게 추적한다', down: '거인이 놓친 흔적을 빨리 포기하고 길목으로 간다' },
    { key: 'scent', label: '냄새 추적', up: '거인이 도망자의 발자국 냄새를 쫓는 법을 배웠다', down: '거인이 오래된 냄새는 무시하고 길목을 노린다' },
    { key: 'exitGuard', label: '출구 감시', up: '거인이 출구 근처 길목을 지키는 법을 배웠다', down: '거인이 출구보다 열쇠를 지키기 시작했다' },
  ];
  function randomGenes(defs, rng) { const o = {}; for (const d of defs) o[d.key] = 0.25 + 0.5 * rng(); return o; }
  // Lv.1 초보 두뇌: 일부러 서툰 값에서 출발해 서로 겨루며 성장한다
  function defaultRunner() { return { danger: 0.15, flee: 0.3, greed: 0.85, loop: 0.25, predict: 0.2, memory: 0.4, keySafe: 0.3 }; }
  function defaultGiant() { return { stride: 0.5, intercept: 0.85, lookahead: 0.85, ambush: 0.3, dash: 0.1, patience: 0.3, scent: 0.2, exitGuard: 0.3 }; }

  // ---------- 게임 ----------
  class Game {
    constructor(map, runnerGenes, giantGenes, seed) {
      this.map = map; this.rg = runnerGenes; this.gg = giantGenes;
      this.rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
      this.turn = 0; this.result = null; this.events = [];
      this.keysLeft = map.keys.slice(); this.keysHeld = 0;
      this.scent = new Int16Array(map.W * map.H).fill(-999); // 도망자 발자국 냄새 (지나간 턴)
      this.runner = { pos: map.runnerStart, prev: map.runnerStart, known: -1, knownTurn: -999, target: -1, mode: '탐색' };
      this.giant = { pos: map.giantStart, prev: map.giantStart, prev2: map.giantStart, lastSeen: -1, lastSeenTurn: -999, dashLeft: 0, dashCd: 0, mode: '순찰', goal: -1, sawRunner: false, patrol: -1, modeSince: 0, path: [map.giantStart], facing: DIRS[(seed >>> 3) & 3].slice(), doorHeat: 0, doorBan: 0 };
    }
    log(type, text) { this.events.push({ turn: this.turn, type, text }); }
    hasAllKeys() { return this.keysLeft.length === 0; }

    step() {
      if (this.result) return;
      this.turn++;
      const m = this.map, R = this.runner, G = this.giant;
      // 도망자 이동
      R.prev = R.pos;
      R.pos = runnerDecide(this);
      this.scent[R.prev] = this.turn - 1; this.scent[R.pos] = this.turn;
      if (this.keysLeft.includes(R.pos)) {
        this.keysLeft.splice(this.keysLeft.indexOf(R.pos), 1); this.keysHeld++;
        this.log('key', this.hasAllKeys() ? `도망자가 마지막 열쇠를 얻었다! 🔑 문 A·B가 열렸다` : `도망자가 열쇠를 주웠다 🔑 (${this.keysHeld}/${m.keys.length})`);
      }
      if (R.pos === G.pos) return this.finish('giant');
      if (m.isExit[R.pos] && this.hasAllKeys()) {
        this.escapeDoor = m.exitNames[m.exits.indexOf(R.pos)];
        this.log('door', `도망자가 문 ${this.escapeDoor}로 빠져나갔다! 🚪`);
        return this.finish('runner');
      }
      // 거인 이동 (느리지만 돌진 가능)
      G.prev2 = G.prev; G.prev = G.pos;
      let moves = (this.turn % giantSkip(this.gg) === 0) ? 0 : 1;
      if (G.dashCd > 0) G.dashCd--;
      giantSense(this);
      if (G.dashLeft === 0 && G.dashCd === 0 && G.sawRunner) {
        const d = bfs(m, G.pos, m.gNbrs)[R.pos];
        if (d <= 2 + Math.round(this.gg.dash * 10)) { G.dashLeft = CFG.DASH_LEN; G.dashCd = CFG.DASH_COOLDOWN; this.log('dash', '거인이 돌진한다! 💨'); }
      }
      if (G.dashLeft > 0) { moves = 2; G.dashLeft--; }
      G.path = [G.pos];
      for (let s = 0; s < moves; s++) {
        const before = G.pos;
        G.pos = giantDecide(this);
        if (G.pos !== before) { G.facing = [G.pos % m.W - before % m.W, ((G.pos / m.W) | 0) - ((before / m.W) | 0)]; }
        G.path.push(G.pos); // 애니메이션용 경로
        if (G.pos === R.pos) return this.finish('giant');
      }
      // 문 근처 서성임 제한 (출구 봉쇄 방지)
      if (G.doorBan > 0) { G.doorBan--; G.doorHeat = 0; }
      else if (m.nearDoor[G.pos]) { if (++G.doorHeat > CFG.DOOR_LINGER) { G.doorBan = CFG.DOOR_BAN; this.log('doorban', '문의 빛에 눈이 부신 거인이 문 근처에서 물러난다 ✨'); } }
      else G.doorHeat = Math.max(0, G.doorHeat - 1);
      if (this.turn >= CFG.MAX_TURNS) return this.finish('draw');
    }
    finish(who) {
      this.result = who;
      if (who === 'giant') this.log('end', '거인이 도망자를 잡아먹었다! 👹');
      else if (who === 'runner') this.log('end', `탈출 성공! 도망자가 문 ${this.escapeDoor}로 탈출했다 🏃🚪`);
      else this.log('end', '시간 초과 — 무승부');
    }
    run() { while (!this.result) this.step(); return this.result; }
  }

  // ---------- 도망자 AI ----------
  function runnerDecide(game) {
    const m = game.map, R = game.runner, G = game.giant, g = game.rg;
    const N = m.W * m.H;
    const rN = game.hasAllKeys() ? m.nbrs : m.lockedNbrs; // 잠긴 문은 못 지나감
    const dR = bfs(m, R.pos, rN);
    const seen = sees(m, R.pos, G.pos), heard = dR[G.pos] <= CFG.HEAR;
    if (seen || heard) {
      if (R.knownTurn < game.turn - 3) game.log('spot', seen ? '도망자가 거인을 발견했다! 😱' : '도망자가 거인의 발소리를 들었다… 👂');
      R.known = G.pos; R.knownTurn = game.turn;
    }
    const memTurns = Math.round(g.memory * 40);
    const age = game.turn - R.knownTurn;
    const threat = R.known >= 0 && age <= memTurns ? R.known : -1;
    let dG = null;
    if (threat >= 0) dG = bfs(m, threat, m.gNbrs); // 거인 기준 거리 (거인은 문 칸에 못 들어감)
    const predictShift = g.predict * 3 + (threat >= 0 ? age * 0.8 : 0);
    // 목표 선택
    let target;
    if (game.hasAllKeys()) {
      // 두 문 중 더 안전한 문: 가까움 + 거인과의 거리
      let best = Infinity;
      for (const e of m.exits) {
        let s = dR[e];
        if (dG) s += (0.6 + g.keySafe) * Math.max(0, 16 - Math.min(dG[e], 30)) * 2;
        if (s < best) { best = s; target = e; }
      }
      if (R.door !== target) {
        if (R.door !== undefined && R.door >= 0) game.log('doorpick', `도망자가 문 ${m.exitNames[m.exits.indexOf(target)]} 쪽으로 방향을 바꿨다`);
        else game.log('doorpick', `도망자가 문 ${m.exitNames[m.exits.indexOf(target)]}를 노린다`);
        R.door = target;
      }
    } else {
      let best = Infinity;
      for (const k of game.keysLeft) {
        let s = dR[k];
        if (dG) s += g.keySafe * Math.max(0, 14 - Math.min(dG[k], 30)) * 2.5;
        if (s < best) { best = s; target = k; }
      }
    }
    R.target = target;
    // 위험 비용 맵
    const fleeR = 2 + g.flee * 7;
    const cost = new Float64Array(N).fill(1);
    if (dG) {
      const K = g.danger * 30;
      for (const i of m.floor) {
        const de = dG[i] - predictShift;
        if (de < fleeR) { const r = (fleeR - de) / fleeR; cost[i] = 1 + K * r * r; }
      }
    }
    const distT = dijkstra(m, target, cost, rN);
    const cands = rN[R.pos].concat([R.pos]);
    // 바로 옆이 승리/열쇠면 그대로
    for (const c of rN[R.pos]) if (c === target && c !== G.pos && (!dG || dG[c] > 1 || (m.isExit[c] && game.hasAllKeys()))) { R.mode = '돌파'; return c; }
    const fleeing = dG && dG[R.pos] - (threat === G.pos ? 0 : predictShift * 0.5) <= fleeR;
    let best = -Infinity, choice = R.pos;
    for (const c of cands) {
      let s;
      if (fleeing) {
        let esc = 0;
        if (g.loop > 0.02) {
          const dc = bfs(m, c, rN); let cnt = 0;
          for (const i of m.floor) if (dc[i] + 1 < dG[i]) cnt++;
          esc = cnt / m.floor.length;
        }
        s = -g.greed * 1.2 * Math.min(distT[c], 200) + (1 - g.greed) * 3 * Math.min(dG[c], 30) + g.loop * 25 * esc;
      } else {
        s = -distT[c] - (c === R.pos ? 0.5 : 0);
      }
      if (dG && dG[c] <= 1) s -= 1000;
      if (c === G.pos) s -= 5000;
      if (c === R.prev && c !== R.pos) s -= 0.3; // 왔다갔다 억제
      s += game.rng() * 0.01;
      if (s > best) { best = s; choice = c; }
    }
    R.mode = fleeing ? '도주' : (dG ? '경계' : '탐색');
    return choice;
  }

  // ---------- 거인 AI ----------
  function giantSense(game) {
    const m = game.map, R = game.runner, G = game.giant;
    const now = giantSees(game, R.pos) || bfs(m, G.pos, m.gNbrs)[R.pos] <= giantHear(game.gg);
    if (now) {
      if (!G.sawRunner) game.log('spot', '거인이 도망자를 발견했다! 👀');
      G.lastSeen = R.pos; G.lastSeenTurn = game.turn;
    } else if (G.sawRunner && game.turn - G.lastSeenTurn >= 1) game.log('lost', '거인이 도망자를 놓쳤다…');
    G.sawRunner = now;
  }
  function runnerObjective(game, from) {
    const m = game.map;
    const d = bfs(m, from, game.hasAllKeys() ? m.nbrs : m.lockedNbrs); let best = Infinity, t = m.exits[0];
    for (const k of (game.hasAllKeys() ? m.exits : game.keysLeft)) if (d[k] < best) { best = d[k]; t = k; }
    return t;
  }
  // 거인이 이번 턴에 갈 수 있는 칸 (문 칸 불가, 접근 금지 중이면 문 근처도 불가)
  function giantMoves(game, from) {
    const m = game.map, G = game.giant, list = m.gNbrs[from];
    if (G.doorBan <= 0) return list;
    if (m.nearDoor[from]) { // 문 근처에 있으면 문에서 멀어지는 쪽으로만
      const out = list.filter((c) => !m.nearDoor[c]);
      return out.length ? out : list;
    }
    const far = list.filter((c) => !m.nearDoor[c]);
    return far.length ? far : [from];
  }
  function stepToward(game, from, distMap) {
    let best = Infinity, choice = from;
    for (const c of giantMoves(game, from)) { const v = distMap[c] + game.rng() * 0.01; if (v < best) { best = v; choice = c; } }
    return choice;
  }
  function giantDecide(game) {
    const m = game.map, R = game.runner, G = game.giant, g = game.gg;
    const dToR = bfs(m, R.pos, m.gNbrs);
    if (giantSees(game, R.pos) || dToR[G.pos] <= giantHear(g)) { G.lastSeen = R.pos; G.lastSeenTurn = game.turn; G.sawRunner = true; }
    if (G.sawRunner) {
      // 추격 vs 길목 차단
      if (dToR[G.pos] <= 3 || g.intercept < 0.05) { G.mode = '추격'; G.goal = R.pos; return stepToward(game, G.pos, dToR); }
      const obj = runnerObjective(game, R.pos);
      const dObj = bfs(m, obj, game.hasAllKeys() ? m.nbrs : m.lockedNbrs);
      // 도망자 경로를 따라 L칸 앞 지점
      const L = Math.round(g.lookahead * 10);
      let p = R.pos;
      for (let s = 0; s < L && p !== obj; s++) { let nb = p; for (const c of m.lockedNbrs[p]) if (dObj[c] < dObj[nb]) nb = c; p = nb; }
      const dP = bfs(m, p, m.gNbrs);
      let best = Infinity, choice = G.pos;
      for (const c of giantMoves(game, G.pos)) {
        const v = (1 - g.intercept) * dToR[c] + g.intercept * dP[c] + game.rng() * 0.01;
        if (v < best) { best = v; choice = c; }
      }
      G.mode = g.intercept > 0.5 ? '길목 차단' : '추격'; G.goal = p;
      return choice;
    }
    const patienceTurns = 4 + Math.round(g.patience * 36);
    if (G.lastSeen >= 0 && game.turn - G.lastSeenTurn <= patienceTurns && G.pos !== G.lastSeen) {
      G.mode = '흔적 추적'; G.goal = G.lastSeen;
      return stepToward(game, G.pos, bfs(m, G.lastSeen, m.gNbrs));
    }
    if (G.pos === G.lastSeen) G.lastSeen = -1;
    // 냄새 추적: 신선한 발자국이 있으면 더 신선한 쪽으로
    const maxAge = Math.round(g.scent * 40);
    if (maxAge > 0) {
      let best = game.scent[G.pos], choice = -1;
      for (const c of giantMoves(game, G.pos)) if (game.scent[c] > best && game.turn - game.scent[c] <= maxAge) { best = game.scent[c]; choice = c; }
      if (choice >= 0) {
        if (G.mode !== '냄새 추적') game.log('scent', '거인이 도망자의 냄새를 맡았다! 👃');
        G.mode = '냄새 추적'; G.goal = choice; return choice;
      }
    }
    if (G.mode === '냄새 추적') G.mode = '탐색';
    // 매복 또는 순찰
    if (G.mode === '매복' && game.turn - G.modeSince > 20 + g.ambush * 60) G.mode = '지루함'; // 너무 오래 매복하면 순찰로
    if (G.mode !== '매복' && G.mode !== '순찰') { G.ambushSpot = -1; G.mode = (G.mode !== '지루함' && game.rng() < g.ambush) ? '매복' : '순찰'; G.modeSince = game.turn; G.patrol = -1; if (G.mode === '매복') game.log('ambush', '거인이 매복하러 간다… 🤫'); }
    if (G.mode === '순찰' && game.turn - G.modeSince > 40) G.mode = '탐색';
    if (G.mode === '매복') {
      // 출구 감시: 문 칸·문 앞에는 못 가므로 문에서 3칸 떨어진 길목에서 기다린다 (문 하나만 지킬 수 있음)
      if (G.ambushSpot === undefined || G.ambushSpot < 0) {
        const from = G.lastSeen >= 0 ? G.lastSeen : m.runnerStart;
        if (game.rng() < (game.hasAllKeys() ? 0.3 + 0.5 * g.exitGuard : 0.35 * g.exitGuard)) {
          const dF = bfs(m, from);
          const di = dF[m.exits[0]] <= dF[m.exits[1]] ? 0 : 1;
          G.ambushSpot = m.guardSpot[di];
        } else G.ambushSpot = runnerObjective(game, from);
      }
      const spot = G.ambushSpot;
      G.goal = spot;
      const dS = bfs(m, spot, m.gNbrs);
      if (dS[G.pos] <= 2) { // 근처에서 서성임
        const opts = giantMoves(game, G.pos).filter((c) => dS[c] <= 2);
        return opts.length && game.rng() < 0.5 ? opts[Math.floor(game.rng() * opts.length)] : G.pos;
      }
      return stepToward(game, G.pos, dS);
    }
    if (G.patrol < 0 || G.patrol === G.pos || game.rng() < 0.02) { do G.patrol = m.floor[Math.floor(game.rng() * m.floor.length)]; while (m.isExit[G.patrol] || m.nearDoor[G.patrol]); }
    G.goal = G.patrol;
    return stepToward(game, G.pos, bfs(m, G.patrol, m.gNbrs));
  }

  // ---------- 공진화 트레이너 ----------
  function mutate(genes, sigma, rng) { const o = {}; for (const k in genes) o[k] = clamp01(genes[k] + gauss(rng) * sigma); return o; }

  class Trainer {
    constructor(seed) {
      this.rng = mulberry32((seed || Date.now()) >>> 0);
      this.reset();
    }
    reset() {
      this.generation = 0; this.rounds = 0;
      this.runner = { genes: defaultRunner(), level: 1, sigma: 0.12 };
      this.giant = { genes: defaultGiant(), level: 1, sigma: 0.12 };
      this.history = []; // {gen, runner, giant, draw}
      this.lastRate = 0.5;
      this.trainWins = { runner: 0, giant: 0, draw: 0 };
    }
    // 한 세대: 챔피언/도전자 2×2 매치를 같은 맵 k개에서 → 짝 비교로 선택
    // 한 세대: 챔피언 + 도전자(변이)들이 같은 맵에서 모든 대진을 치르고 짝 비교로 선택.
    // 지고 있는 쪽은 도전자를 2명 내보내고(연습량 2배) 변이 폭도 크게 → 상대 전략에 빨리 적응.
    trainGeneration(mapsPerGen) {
      const k = mapsPerGen || CFG.MAPS_PER_GEN, rng = this.rng;
      const prev = this.lastRate ?? 0.5;
      this.runner.sigma = prev < 0.42 ? 0.2 : prev > 0.58 ? 0.07 : 0.12;
      this.giant.sigma = prev > 0.58 ? 0.2 : prev < 0.42 ? 0.07 : 0.12;
      const nR = prev < 0.45 ? 2 : 1, nG = prev > 0.55 ? 2 : 1;
      const R0 = this.runner.genes, G0 = this.giant.genes;
      const Rs = [R0], Gs = [G0];
      for (let i = 0; i < nR; i++) Rs.push(mutate(R0, this.runner.sigma, rng));
      for (let i = 0; i < nG; i++) Gs.push(mutate(G0, this.giant.sigma, rng));
      const rScore = Rs.map(() => 0), gScore = Gs.map(() => 0);
      let rw = 0, gw = 0, dw = 0, n = 0;
      for (let mi = 0; mi < k; mi++) {
        const seed = (rng() * 2 ** 32) >>> 0, map = generateMap(seed);
        for (let a = 0; a < Rs.length; a++) for (let b = 0; b < Gs.length; b++) {
          const game = new Game(map, Rs[a], Gs[b], seed + a * 7 + b * 13);
          const res = game.run(); n++;
          const prog = (map.keys.length - game.keysLeft.length) / (map.keys.length + 1);
          if (res === 'runner') { rw++; rScore[a] += 1; }
          else if (res === 'giant') { gw++; rScore[a] += 0.15 * prog; gScore[b] += 1 - 0.3 * game.turn / CFG.MAX_TURNS; }
          else { dw++; rScore[a] += 0.1 * prog; gScore[b] += 0.4; } // 무승부: 숨기만 하는 도망자는 진 것과 거의 같게 취급
        }
      }
      this.rounds += n; this.generation++;
      this.trainWins.runner += rw; this.trainWins.giant += gw; this.trainWins.draw += dw;
      this.lastRate = (rw + dw * 0.5) / n;
      const changes = [];
      const pickBest = (side, defs, list, sc) => {
        const champ = list[0]; let bi = 0;
        for (let i = 1; i < list.length; i++) if (sc[i] > sc[bi]) bi = i;
        if (bi === 0) { // 동점 도전자는 가끔 채택 (중립 표류)
          for (let i = 1; i < list.length; i++) if (sc[i] === sc[0] && rng() < (this.tieAccept ?? 0.3)) { bi = i; break; }
          if (bi === 0) return false;
        }
        const chal = list[bi];
        for (const d of defs) {
          const delta = chal[d.key] - champ[d.key];
          if (Math.abs(delta) >= 0.08) changes.push({ side, key: d.key, label: d.label, delta, text: delta > 0 ? d.up : d.down });
        }
        if (sc[bi] > sc[0]) this[side].level++;
        this[side].genes = chal;
        return true;
      };
      const rAcc = pickBest('runner', RUNNER_GENES, Rs, rScore);
      const gAcc = pickBest('giant', GIANT_GENES, Gs, gScore);
      const rec = { gen: this.generation, runner: rw / n, giant: gw / n, draw: dw / n, n };
      this.history.push(rec);
      if (this.history.length > 2000) this.history.shift();
      return { rec, changes, rAcc, gAcc, n };
    }
    toJSON() {
      return { v: 2, lastRate: this.lastRate, generation: this.generation, rounds: this.rounds, runner: this.runner, giant: this.giant, history: this.history, trainWins: this.trainWins };
    }
    load(o) {
      if (!o || o.v !== 2) return false; // v1(문 1개 시절) 두뇌는 호환 안 됨
      Object.assign(this, { lastRate: o.lastRate ?? 0.5, generation: o.generation, rounds: o.rounds, runner: o.runner, giant: o.giant, history: o.history || [], trainWins: o.trainWins || { runner: 0, giant: 0, draw: 0 } });
      return true;
    }
  }

  return { CFG, giantSkip, giantHear, mulberry32, generateMap, bfs, Game, Trainer, RUNNER_GENES, GIANT_GENES, defaultRunner, defaultGiant, mutate, sees, giantSees };
});
