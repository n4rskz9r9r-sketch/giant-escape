/* 거인과 도망자 v7 — 게임 엔진 + AI + 공진화 (2층 미로 + 열쇠 미션 + 뷱(뱀) + 거인 4~8명 팀 + 30초마다 벽 부수기 + 아이템 + 전장의 안개)
 * 브라우저(window.GE)와 Node(require) 양쪽에서 동작. 외부 라이브러리 없음. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CFG = {
    W: 31, H: 21, FLOORS: 2, STAIRS: 2,   // 층마다 31×21, 2층 (계단 2곳)            // 홀수 (미로) — 거인 4명이라 넓힘
    KEYS: 2,
    GIANTS: 4,               // 기본 거인 수 (도망자가 WINS_PER_GIANT승 할 때마다 1명씩 늘어 최대 GIANTS_MAX)
    GIANTS_MAX: 10, WINS_PER_GIANT: 5,
    TPS: 10,                 // 기본 속도(턴/초). '초' 단위 규칙은 이 속도 기준으로 턴으로 바꿈 (샷건 기절 3초 = 30턴, 뷱 소화·거인 부활 5초 = 50턴)
    SMASH_COOLDOWN_SEC: 30,  // 거인마다 기본 능력 '벽 부수기': 30초(300턴)에 한 번
    SMASH_FIRST_SEC: 10,     // 판 시작 후 첫 벽 부수기까지 (10초)
    MAX_TURNS: 1100,
    VISION: 9,               // 도망자 시야
    HEAR: 7,                 // 도망자 청각 (미로 거리)
    GIANT_VISION: 5,         // 거인 시야 반경
    GIANT_CONE_COS: 0.5,     // 앞쪽 120° 부채꼴
    GIANT_SKIP_MIN: 5, GIANT_SKIP_MAX: 8,   // 거인은 N턴에 1번 쉰다 (3명이라 느리게) ('속도 집중' 유전자)
    GIANT_HEAR_MAX: 4, GIANT_HEAR_MIN: 1,   // v11: 5→4
    CALL_RANGE: 14,          // '호출' 유전자 최대 전달 거리
    GIANT_REST_P: 0,         // 추가 휴식 확률 (v16: 0.12→0 — 도망자 기본 샷건·뷱 통과 보정)
    DASH_LEN: 2, DASH_COOLDOWN: 32,
    SPRINT_LEN: 2, SPRINT_COOLDOWN: 13,   // v11: 16→13 (벽 부수기 상시 능력·부활 5초 보정)     // 도망자 전력질주
    DOOR_LINGER: 8, DOOR_BAN: 14,
    KEY_LINGER: 14, KEY_BAN: 30,
    // 열쇠 미션: 열쇠는 잠긴 상자 안 → 미션을 끝내야 열림 (맵마다 3종 중 2종)
    LEVERS: 3, PLATE_TURNS: 4, PLATE_NOISE: 11,
    // 뷱(뱀): 전체 1마리(계단으로 두 층을 오감), 거인만 잡아먹음 (v16: 도망자는 뷱을 그냥 통과). 꼬리를 잡으면 잠시 땅속으로 숨음
    SNAKES: 1, SNAKES_PER_FLOOR: 1, SNAKE_LEN: 4, SNAKE_MAX: 18, SNAKE_GROW_GIANT: 2, SNAKE_GROW_PILL: 1, SNAKE_SENSE: 1, SNAKE_SKIP: 3, SNAKE_PREFER_GIANT: 2,
    SNAKE_DIGEST_SEC: 5,     // 뷱에게 먹힌 거인은 5초(50턴) 뒤 출발점에서 부활
    SNAKE_HIDE: 40, SNAKE_REST: 12,
    // 알약: 뷱만 먹음, 먹을 때마다 한 칸 길어짐 (최대 SNAKE_MAX)
    PILLS_START: 6, PILL_RESPAWN: 50, PILL_MAX: 10,   // 열쇠 옆에 오래 버티면 열쇠 빛에 눈이 부셔 물러남 (안개 속 탐색 중 열쇠 캠핑 → 무승부 방지)
    MAPS_PER_GEN: 4,
    BRAID: 0.3, DEADEND_REMOVE: 0.9,   // 고리 많은 미로
    // 아이템 (도망자용 5종 + 거인용 3종). 기본 속도 10턴/초 기준: 샷건 기절 30턴 = 3초
    ITEMS_START_R: 2, ITEMS_START_G: 3, ITEM_RESPAWN: 45, ITEM_MAX: 6, ITEM_R_SHARE: 0.4,
    SMOKE_RADIUS: 3, SMOKE_TURNS: 6,
    BOOST_TURNS: 4,
    CLOAK_TURNS: 7,
    SHOTGUN_AMMO: 2,         // v16: 샷건은 도망자 기본 스킬. 최대 2발, 처음 2발, 2발 미만이면 5초(50턴)마다 1발 장전
    SHOTGUN_RELOAD_SEC: 5,
    SHOTGUN_RANGE: 4, STUN_SEC: 2, SHOTGUN_HIT: 1, SHOTGUN_FALLOFF: 0.3,   // 명중률: 코앞(1칸) SHOTGUN_HIT, 한 칸 멀어질 때마다 -FALLOFF (빗나가면 탄만 씀)
    SHOT_NOISE: 12,          // v16: 총소리가 들리는 미로 거리 (샷건이 공짜가 된 만큼 쏘면 다른 거인이 몰려옴)
    BARRICADE_HP: 3,
    TRACK_TURNS: 10,
    FRONTIER_COST: 6,        // 전장의 안개: 미탐색 경계로 가는 비용(알려진 열쇠가 있으면 그쪽을 우선)
    SMASH_GAIN_MIN: 0, SMASH_GAIN_MAX: 8,   // 목표 쪽 벽을 부숴 줄어드는 거리(칸)가 이 이상일 때 사용 ('벽 부수기' 유전자가 높을수록 작은 이득에도 사용)
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(rng) { let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const giantSkip = (gg) => Math.round(CFG.GIANT_SKIP_MIN + (CFG.GIANT_SKIP_MAX - CFG.GIANT_SKIP_MIN) * gg.stride);
  const giantHear = (gg) => Math.round(CFG.GIANT_HEAR_MAX - (CFG.GIANT_HEAR_MAX - CFG.GIANT_HEAR_MIN) * gg.stride);
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const secTurns = (sec) => Math.round(sec * CFG.TPS);
  const giantsForWins = (wins) => Math.min(CFG.GIANTS_MAX, CFG.GIANTS + Math.floor(Math.max(0, wins) / CFG.WINS_PER_GIANT));

  // ---------- 미로 ----------
  function buildNbrs(map) {
    const { W, H, g } = map;
    map.floor = []; for (let i = 0; i < W * H; i++) if (g[i] === 0) map.floor.push(i);
    map.nbrs = new Array(W * H);
    for (const i of map.floor) {
      const x = i % W, y = (i / W) | 0, list = [];
      for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = ny * W + nx; if (g[j] === 0) list.push(j); }
      if (map.stairOf && map.stairOf[i] >= 0 && g[map.stairOf[i]] === 0) list.push(map.stairOf[i]); // 계단: 같은 자리 위/아래층
      map.nbrs[i] = list;
    }
    map._bfs = new Map();
  }
  function finalizeGraphs(map) {
    buildNbrs(map);
    const N = map.W * map.H;
    map.lockedNbrs = new Array(N); map.gNbrs = new Array(N);
    for (const i of map.floor) { map.lockedNbrs[i] = map.nbrs[i].filter((j) => !map.isExit[j]); map.gNbrs[i] = map.lockedNbrs[i]; }
    // 뷱 전용: 같은 층만, 문 근처·계단·출구 제외
    map.sNbrs = new Array(N);
    // 뷱 전용: 문 근처·출구는 못 감. 계단은 탈 수 있음 (한 마리가 두 층을 오가며 사냥)
    const sOk = (j) => !map.isExit[j] && !(map.nearDoor && map.nearDoor[j]);
    for (const i of map.floor) map.sNbrs[i] = sOk(i) ? map.lockedNbrs[i].filter((j) => sOk(j)) : [];
    map.graphs = [map.nbrs, map.lockedNbrs, map.gNbrs, map.sNbrs];
  }
  // 벽을 부수면 그 판의 맵만 복사해서 바꿈 (훈련에서 같은 맵을 여러 판이 공유하므로)
  function cloneMap(m) { const c = Object.assign({}, m); c.g = new Uint8Array(m.g); c.breakable = new Uint8Array(m.breakable); c.pristine = false; finalizeGraphs(c); return c; }
  const floorOf = (map, i) => (map.FH ? Math.floor(((i / map.W) | 0) / map.FH) : 0);
  function manhattan(map, a, b) { return Math.abs(a % map.W - b % map.W) + Math.abs(((a / map.W) | 0) - ((b / map.W) | 0)); }

  function genFloor(rng, W, H) {
    const g = new Uint8Array(W * H).fill(1);
    const idx = (x, y) => y * W + x;
    const stack = [[1, 1]]; g[idx(1, 1)] = 0;
    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      const opts = [];
      for (const [dx, dy] of DIRS) { const nx = cx + dx * 2, ny = cy + dy * 2; if (nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1 && g[idx(nx, ny)] === 1) opts.push([nx, ny, dx, dy]); }
      if (!opts.length) { stack.pop(); continue; }
      const [nx, ny, dx, dy] = opts[Math.floor(rng() * opts.length)];
      g[idx(cx + dx, cy + dy)] = 0; g[idx(nx, ny)] = 0; stack.push([nx, ny]);
    }
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      if (g[idx(x, y)] !== 1) continue;
      const h = g[idx(x - 1, y)] === 0 && g[idx(x + 1, y)] === 0 && g[idx(x, y - 1)] === 1 && g[idx(x, y + 1)] === 1;
      const v = g[idx(x, y - 1)] === 0 && g[idx(x, y + 1)] === 0 && g[idx(x - 1, y)] === 1 && g[idx(x + 1, y)] === 1;
      if ((h || v) && rng() < CFG.BRAID) g[idx(x, y)] = 0;
    }
    for (let y = 1; y < H - 1; y += 2) for (let x = 1; x < W - 1; x += 2) {
      let open = 0; const walls = [];
      for (const [dx, dy] of DIRS) { const wx = x + dx, wy = y + dy; if (g[idx(wx, wy)] === 0) open++; else if (wx > 0 && wy > 0 && wx < W - 1 && wy < H - 1) walls.push(idx(wx, wy)); }
      if (open === 1 && walls.length && rng() < CFG.DEADEND_REMOVE) g[walls[Math.floor(rng() * walls.length)]] = 0;
    }
    return g;
  }
  // 층을 위아래로 이어 붙인 한 장의 격자: 1층 = 0..FH-1행, 2층 = FH..2FH-1행 (바깥 벽이 층 사이 시야를 막음)
  function generateMap(seed) {
    const rng = mulberry32(seed >>> 0);
    const W = CFG.W, FH = CFG.H, F = Math.max(1, CFG.FLOORS || 1), H = FH * F;
    const g = new Uint8Array(W * H).fill(1);
    for (let f = 0; f < F; f++) g.set(genFloor(rng, W, FH), f * W * FH);
    const idx = (x, y) => y * W + x;
    const map = { W, H, FH, floors: F, g, seed, stairOf: new Int32Array(W * H).fill(-1), stairs: [] };
    const fl = (i) => floorOf(map, i), ly = (i) => ((i / W) | 0) % FH;
    // 계단: 두 층 모두 길인 같은 자리, 서로 멀리
    if (F > 1) {
      const cand = []; for (let y = 2; y < FH - 2; y++) for (let x = 2; x < W - 2; x++) { const a = idx(x, y); if (g[a] === 0 && g[a + W * FH] === 0) cand.push(a); }
      for (let k = 0; k < CFG.STAIRS && cand.length; k++) {
        let c = cand.filter((a) => map.stairs.every(([s0]) => manhattan(map, s0, a) >= (W + FH) / 2.2));
        if (!c.length) c = cand.filter((a) => map.stairs.every(([s0]) => s0 !== a));
        const a = c[Math.floor(rng() * c.length)], b = a + W * FH;
        map.stairOf[a] = b; map.stairOf[b] = a; map.stairs.push([a, b]);
      }
    }

    buildNbrs(map);
    const pick = (c) => c[Math.floor(rng() * c.length)];
    const corners = map.floor.filter((i) => { const x = i % W, y = ly(i); return fl(i) === 0 && map.stairOf[i] < 0 && (x < 6 || x > W - 7) && (y < 5 || y > FH - 6); });
    let corners2 = corners;
    if (map.stairs.length) { const dSt = map.stairs.map(([a]) => bfs(map, a)); corners2 = corners.filter((i) => dSt.every((d) => d[i] >= 10)); }
    map.runnerStart = pick(corners2.length ? corners2 : corners.length ? corners : map.floor);
    const dR = bfs(map, map.runnerStart);
    const maxR = Math.max(...map.floor.map((i) => dR[i]));
    // 거인 3명: 도망자에게서 멀고, 서로도 떨어지게
    map.giantStarts = [];
    for (let k = 0; k < CFG.GIANTS_MAX; k++) { // 늘어날 거인까지 최대 인원만큼 출발점을 미리 정함 (앞의 N개만 사용)
      const gf = k % F;
      let c = map.floor.filter((i) => fl(i) === gf && map.stairOf[i] < 0 && dR[i] >= maxR * 0.5 && map.giantStarts.every((s) => manhattan(map, s, i) >= 9));
      if (!c.length) c = map.floor.filter((i) => fl(i) === gf && dR[i] >= maxR * 0.25 && !map.giantStarts.includes(i));
      if (!c.length) c = map.floor.filter((i) => i !== map.runnerStart && !map.giantStarts.includes(i));
      map.giantStarts.push(pick(c));
    }
    const dGs = map.giantStarts.map((s) => bfs(map, s));
    const dG = new Int16Array(W * H); for (const i of map.floor) dG[i] = Math.min(...dGs.map((d) => d[i]));
    // 출구 2개 (바깥 벽에 문)
    const doorCands = [];
    for (let y = 0; y < FH; y++) for (let x = 0; x < W; x++) { // 문은 1층 바깥 벽에만
      if (!(x === 0 || y === 0 || x === W - 1 || y === FH - 1)) continue;
      if ((x === 0 || x === W - 1) && (y === 0 || y === FH - 1)) continue;
      const inner = x === 0 ? idx(1, y) : x === W - 1 ? idx(W - 2, y) : y === 0 ? idx(x, 1) : idx(x, FH - 2);
      if (g[inner] !== 0 || inner === map.runnerStart || map.giantStarts.includes(inner) || map.stairOf[inner] >= 0) continue;
      doorCands.push({ door: idx(x, y), inner });
    }
    let aC = doorCands.filter((c) => dR[c.inner] >= maxR * 0.45 && dG[c.inner] >= 8);
    if (!aC.length) aC = doorCands.filter((c) => dR[c.inner] >= maxR * 0.3);
    if (!aC.length) aC = doorCands;
    const A = pick(aC);
    const dA = bfs(map, A.inner);
    const maxA = Math.max(...map.floor.map((i) => dA[i]));
    let bC = doorCands.filter((c) => c !== A && dA[c.inner] >= maxA * 0.6 && dR[c.inner] >= maxR * 0.3 && dG[c.inner] >= 6 && manhattan(map, c.door, A.door) >= 14);
    if (!bC.length) bC = doorCands.filter((c) => c !== A && dA[c.inner] >= maxA * 0.45 && manhattan(map, c.door, A.door) >= 8);
    if (!bC.length) bC = doorCands.filter((c) => c !== A);
    const B = pick(bC);
    map.exits = [A.door, B.door]; map.exitNames = ['A', 'B'];
    for (const e of map.exits) g[e] = 0;
    map.isExit = new Uint8Array(W * H); for (const e of map.exits) map.isExit[e] = 1;
    finalizeGraphs(map);
    map.nearDoor = new Uint8Array(W * H); map.guardSpot = [];
    for (const e of map.exits) {
      const d = bfs(map, e);
      for (const i of map.floor) if (!map.isExit[i] && d[i] <= 2) map.nearDoor[i] = 1;
      let spot = -1; for (const i of map.floor) if (d[i] === 3) { spot = i; break; }
      if (spot < 0) for (const i of map.floor) if (!map.isExit[i] && (spot < 0 || Math.abs(d[i] - 3) < Math.abs(d[spot] - 3))) spot = i;
      map.guardSpot.push(spot);
    }
    // 거인이 부술 수 있는 벽: 바깥 벽·문틀(문 주변 3칸) 제외한 안쪽 벽
    map.breakable = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 1; x < W - 1; x++) {
      const yl = y % FH; if (yl === 0 || yl === FH - 1) continue; // 층마다 바깥 벽 제외
      const i = idx(x, y); if (g[i] !== 1) continue;
      if (map.exits.some((e) => manhattan(map, e, i) <= 3)) continue;
      map.breakable[i] = 1;
    }
    const dE = bfs(map, map.exits[0]), dE2 = bfs(map, map.exits[1]);
    map.keys = [];
    const used = new Set([map.runnerStart, ...map.giantStarts]);
    const free = (i) => !map.isExit[i] && !map.nearDoor[i] && map.stairOf[i] < 0 && !used.has(i);
    for (let k = 0; k < CFG.KEYS; k++) {
      const kf = (k + 1) % F; // 열쇠는 층마다 나눠 둠 (첫 열쇠는 2층)
      let c = map.floor.filter((i) => fl(i) === kf && free(i) && dR[i] >= 10 && dG[i] >= 6 && Math.min(dE[i], dE2[i]) >= 8 && map.keys.every((kk) => manhattan(map, kk, i) >= 8));
      if (!c.length) c = map.floor.filter((i) => fl(i) === kf && free(i));
      if (!c.length) c = map.floor.filter((i) => free(i));
      const kc = pick(c); map.keys.push(kc); used.add(kc);
    }
    // 미션: 열쇠마다 다른 종류 (스위치 N개 켜기 / 보석 운반 / 발판 버티기)
    const types = ['switch', 'carry', 'plate'];
    for (let i = types.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [types[i], types[j]] = [types[j], types[i]]; }
    const pickFar = (filt, minD) => {
      let c = map.floor.filter((i) => free(i) && filt(i) && [...used].every((u) => manhattan(map, u, i) >= minD));
      if (!c.length) c = map.floor.filter((i) => free(i) && filt(i));
      if (!c.length) c = map.floor.filter((i) => free(i));
      const r = pick(c); used.add(r); return r;
    };
    map.missions = []; map.keyMission = {}; map.missionCells = [];
    map.keys.forEach((kc, k) => {
      const type = types[k % types.length], kf = fl(kc), other = (kf + 1) % F, M = { type, key: kc };
      if (type === 'switch') { M.levers = []; for (let n = 0; n < CFG.LEVERS; n++) M.levers.push(pickFar((i) => (n === 0 ? fl(i) === other : true) && dR[i] >= 5, 7)); }
      else if (type === 'carry') {
        M.gem = pickFar((i) => fl(i) === other && dR[i] >= 8, 7);
        const nb = map.nbrs[kc].filter((i) => free(i) && fl(i) === kf);
        if (nb.length) { M.pedestal = pick(nb); used.add(M.pedestal); } else M.pedestal = pickFar((i) => fl(i) === kf && manhattan(map, i, kc) <= 4, 0);
      } else { const dK = bfs(map, kc); M.plate = pickFar((i) => fl(i) === kf && dK[i] >= 5 && dK[i] <= 14, 4); }
      map.keyMission[kc] = map.missions.length; map.missions.push(M);
      map.missionCells.push(...(M.levers || []), ...(M.gem != null ? [M.gem, M.pedestal] : []), ...(M.plate != null ? [M.plate] : []));
    });
    map.isMission = new Uint8Array(W * H); for (const c of map.missionCells) map.isMission[c] = 1;
    map.itemSpots = map.floor.filter((i) => !map.isExit[i] && !map.nearDoor[i] && dR[i] >= 4 && !map.keys.includes(i) && !map.giantStarts.includes(i) && !map.isMission[i] && map.stairOf[i] < 0);
    finalizeGraphs(map); // 문 근처가 정해진 뒤 뷱 그래프 다시 만들기
    // 뷱 출발점: 층마다, 도망자·거인 출발점에서 멀리
    map.snakeStarts = [];
    for (let f = 0; f < F; f++) for (let n = 0; n < CFG.SNAKES_PER_FLOOR; n++) {
      let c = map.floor.filter((i) => fl(i) === f && map.sNbrs[i].length >= 1 && dR[i] >= 12 && !used.has(i) && map.giantStarts.every((s) => manhattan(map, s, i) >= 5));
      if (!c.length) c = map.floor.filter((i) => fl(i) === f && map.sNbrs[i].length >= 1 && !used.has(i));
      if (c.length) { const sc = pick(c); used.add(sc); map.snakeStarts.push(sc); }
    }
    return map;
  }

  function bfs(map, src, nb) {
    nb = nb || map.nbrs;
    const N = map.W * map.H, d = new Int16Array(N).fill(-1), q = new Int16Array(N); let h = 0, t = 0;
    d[src] = 0; q[t++] = src;
    while (h < t) { const c = q[h++]; const l = nb[c]; if (!l) continue; for (const n of l) if (d[n] < 0) { d[n] = d[c] + 1; q[t++] = n; } }
    for (let i = 0; i < N; i++) if (d[i] < 0) d[i] = 999;
    return d;
  }
  // 맵 단위 BFS 캐시 (그래프: 0=전체, 1=잠긴 문 제외, 2=거인용)
  function bfsC(map, src, gid) {
    const key = src * 4 + gid; let d = map._bfs.get(key);
    if (!d) { d = bfs(map, src, map.graphs[gid]); map._bfs.set(key, d); }
    return d;
  }
  function dijkstra(map, src, cost, nb) {
    const N = map.W * map.H, dist = new Float64Array(N).fill(Infinity);
    const heap = [[0, src]]; dist[src] = 0;
    const push = (e) => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    while (heap.length) { const [dc, c] = pop(); if (dc > dist[c]) continue; for (const n of (nb[c] || [])) { const nd = dc + cost[c]; if (nd < dist[n]) { dist[n] = nd; push([nd, n]); } } }
    return dist;
  }
  function lineOfSight(map, a, b) {
    let x0 = a % map.W, y0 = (a / map.W) | 0; const x1 = b % map.W, y1 = (b / map.W) | 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (map.g[y0 * map.W + x0] !== 0) return false;
      if (x0 === x1 && y0 === y1) return true;
      const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  function sees(map, a, b) {
    const dx = a % map.W - b % map.W, dy = ((a / map.W) | 0) - ((b / map.W) | 0);
    return dx * dx + dy * dy <= CFG.VISION * CFG.VISION && lineOfSight(map, a, b);
  }
  // 거인 i의 시야: 반경 GIANT_VISION, 앞쪽 부채꼴 + 바로 옆
  function giantSees(game, i, target) {
    const m = game.map, G = game.giants[i], a = G.pos;
    const dx = target % m.W - a % m.W, dy = ((target / m.W) | 0) - ((a / m.W) | 0), d2 = dx * dx + dy * dy;
    if (d2 > CFG.GIANT_VISION * CFG.GIANT_VISION) return false;
    if (d2 > 2 && (G.facing[0] * dx + G.facing[1] * dy) / Math.sqrt(d2) < CFG.GIANT_CONE_COS) return false;
    return lineOfSight(m, a, target);
  }

  // ---------- 유전자 ----------
  const RUNNER_GENES = [
    { key: 'danger', label: '경계심', up: '도망자가 거인 근처 길을 더 피하게 됐다', down: '도망자가 위험을 감수하고 지름길을 택하기 시작했다' },
    { key: 'flee', label: '도주 반경', up: '도망자가 더 멀리서부터 도망치는 법을 배웠다', down: '도망자가 거인이 가까이 와도 침착해졌다' },
    { key: 'greed', label: '열쇠 욕심', up: '도망자가 쫓기면서도 목표를 향해 밀어붙인다', down: '도망자가 쫓기면 일단 살고 보는 법을 배웠다' },
    { key: 'loop', label: '고리 활용', up: '도망자가 미로의 고리를 돌며 따돌리는 법을 배웠다', down: '도망자가 고리 대신 직선 도주를 택했다' },
    { key: 'predict', label: '예측력', up: '도망자가 거인들의 다음 움직임을 예측하기 시작했다', down: '도망자가 지금 보이는 것만 믿게 됐다' },
    { key: 'memory', label: '기억력', up: '도망자가 거인을 본 곳을 오래 기억한다', down: '도망자가 지난 위험을 빨리 잊고 전진한다' },
    { key: 'keySafe', label: '안전한 목표 우선', up: '도망자가 거인들에게서 먼 열쇠·문부터 노린다', down: '도망자가 가까운 열쇠·문부터 가는 쪽을 택했다' },
    { key: 'sprint', label: '전력질주 타이밍', up: '도망자가 더 일찍 전력질주를 쓰기 시작했다', down: '도망자가 전력질주를 아껴 마지막 순간에 쓴다' },
    { key: 'itemGreed', label: '아이템 욕심', up: '도망자가 돌아가더라도 아이템을 챙기기 시작했다', down: '도망자가 아이템보다 목표를 우선한다' },
    { key: 'panic', label: '방어 아이템 타이밍', up: '도망자가 연막·망토·부스터를 일찍 쓰기 시작했다', down: '도망자가 연막·망토·부스터를 아껴 위기 순간에 쓴다' },
    { key: 'shotgun', label: '샷건 사거리', up: '도망자가 샷건을 멀리서부터 쏘기 시작했다', down: '도망자가 샷건을 코앞까지 아껴 쏜다' },
    { key: 'barricade', label: '바리케이드 설치', up: '도망자가 쫓기면 뒤에 바리케이드를 치는 법을 배웠다', down: '도망자가 바리케이드를 아껴 둔다' },
    { key: 'missionOrder', label: '미션 마무리 우선', up: '도망자가 거의 끝난 미션부터 마무리한다', down: '도망자가 가까운 미션부터 손댄다' },
    { key: 'plateNerve', label: '발판 배짱', up: '도망자가 거인이 다가와도 발판 위에서 버틴다', down: '도망자가 거인 기척이 나면 발판에서 바로 내려온다' },
    { key: 'snakeLure', label: '뷱 유인', up: '도망자가 거인을 뷱 쪽으로 끌고 가는 법을 배웠다', down: '도망자가 뷱 근처로 거인을 데려가지 않는다' },
    { key: 'tailGrab', label: '꼬리 잡기', up: '도망자가 뷱의 꼬리를 잡아 쫓아내는 법을 배웠다', down: '도망자가 뷱 꼬리에 손대지 않는다' },
    { key: 'vault', label: '벽넘기', up: '도망자가 벽넘기를 과감하게 쓰기 시작했다', down: '도망자가 벽넘기를 아껴 큰 위기·큰 지름길에만 쓴다' },
  ];
  const GIANT_GENES = [
    { key: 'stride', label: '속도 집중', up: '거인이 귀 대신 다리를 단련해 더 빨라졌다', down: '거인이 속도를 줄이고 청각을 키웠다' },
    { key: 'intercept', label: '길목 차단', up: '거인이 도망자 앞길을 끊는 법을 배웠다', down: '거인이 정직하게 뒤를 쫓는 쪽으로 돌아갔다' },
    { key: 'lookahead', label: '예측 거리', up: '거인이 도망자의 몇 수 앞을 내다보기 시작했다', down: '거인이 가까운 미래만 보게 됐다' },
    { key: 'ambush', label: '매복 성향', up: '거인이 열쇠 근처 매복을 배웠다', down: '거인이 매복보다 순찰을 택했다' },
    { key: 'dash', label: '돌진 거리', up: '거인이 더 먼 거리에서 돌진하기 시작했다', down: '거인이 돌진을 아껴 결정적 순간에 쓴다' },
    { key: 'patience', label: '끈기', up: '거인이 놓친 도망자를 더 끈질기게 추적한다', down: '거인이 놓친 흔적을 빨리 포기한다' },
    { key: 'scent', label: '냄새 추적', up: '거인이 발자국 냄새를 쫓는 법을 배웠다', down: '거인이 오래된 냄새는 무시한다' },
    { key: 'exitGuard', label: '출구 감시', up: '거인이 출구 근처 길목을 지키는 법을 배웠다', down: '거인이 출구보다 열쇠를 지키기 시작했다' },
    { key: 'spread', label: '흩어지기', up: '거인이 동료와 흩어져 포위하는 법을 배웠다', down: '거인이 동료와 뭉쳐 다니기 시작했다' },
    { key: 'call', label: '호출', up: '거인이 도망자를 보면 동료를 부르기 시작했다', down: '거인이 혼자 조용히 사냥하는 쪽을 택했다' },
    { key: 'smash', label: '벽 부수기', up: '거인이 작은 지름길에도 벽을 부수는 법을 배웠다', down: '거인이 벽 부수기를 아껴 큰 지름길에만만 쓴다' },
    { key: 'roar', label: '포효', up: '거인이 도망자를 보면 포효해 위치를 알리기 시작했다', down: '거인이 포효를 아껴 둔다' },
    { key: 'tracker', label: '추적기 활용', up: '거인이 놓친 도망자를 냄새 추적기로 빨리 다시 찾는다', down: '거인이 냄새 추적기를 오래 아껴 둔다' },
    { key: 'blockade', label: '길막기', up: '거인이 도망자 앞길에 바리케이드를 치는 법을 배웠다', down: '거인이 바리케이드를 아껴 둔다' },
    { key: 'guard', label: '미션·계단 지키기', up: '거인이 미션 장소와 계단을 지키기 시작했다', down: '거인이 미션 장소를 덜 지킨다' },
    { key: 'snakeSense', label: '뷱 피하기', up: '거인이 뷱 냄새를 맡고 멀리 돌아간다', down: '거인이 뷱을 신경 쓰지 않는다' },
  ];
  // Lv.1 초보 두뇌 (일부러 서툰 값). 거인은 처음부터 역할이 조금씩 다르게 출발
  function defaultRunner() { return { danger: 0.5, flee: 0.35, greed: 0.7, loop: 0.3, predict: 0.5, memory: 0.4, keySafe: 0.35, sprint: 0.3, itemGreed: 0.4, panic: 0.4, shotgun: 0.4, barricade: 0.4, missionOrder: 0.4, plateNerve: 0.4, snakeFear: 0.5, snakeLure: 0.3, tailGrab: 0.3, vault: 0.4 }; }
  function defaultGiantOne(k) {
    const base = { stride: 0.5, intercept: 0.5, lookahead: 0.5, ambush: 0.3, dash: 0.1, patience: 0.3, scent: 0.2, exitGuard: 0.3, spread: 0.1, call: 0.2, smash: 0.3, roar: 0.4, tracker: 0.4, blockade: 0.3, guard: 0.3, snakeSense: 0.4 };
    if (k === 0) Object.assign(base, { intercept: 0.15, scent: 0.4 });           // 추격조
    if (k === 1) Object.assign(base, { intercept: 0.85, lookahead: 0.8 });       // 차단조
    if (k === 2) Object.assign(base, { ambush: 0.8, exitGuard: 0.6 });           // 매복조
    if (k === 3) Object.assign(base, { smash: 0.9, patience: 0.6, scent: 0.45, intercept: 0.3 }); // 파괴조
    return base;
  }
  function defaultGiantTeam() { return Array.from({ length: CFG.GIANTS }, (_, k) => defaultGiantOne(k)); }
  function roleOf(g) {
    const r = [['추격조', (1 - g.intercept) + g.scent * 0.5], ['차단조', g.intercept + g.lookahead * 0.5], ['매복조', g.ambush + g.exitGuard * 0.5], ['파괴조', (g.smash ?? 0) * 1.5 + g.patience * 0.3]];
    r.sort((a, b) => b[1] - a[1]); return r[0][0];
  }

  // ---------- 게임 ----------
  class Game {
    constructor(map, runnerGenes, giantTeam, seed) {
      this.map = map; this.rg = runnerGenes; this.gg = giantTeam;
      this.rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
      this.turn = 0; this.result = null; this.events = []; this.catcher = -1; this.escapeDoor = null;
      this.keysLeft = map.keys.slice(); this.keysHeld = 0;
      this.scent = new Int16Array(map.W * map.H).fill(-999);
      this.doorWatch = [-1, -1]; // 문마다 감시 거인은 최대 1명
      const n = giantTeam.length; // 거인 수 = 팀 유전자 수 (출발점은 맵에 GIANTS_MAX개 준비)
      this.runner = { pos: map.runnerStart, prev: map.runnerStart, path: [map.runnerStart], known: new Array(n).fill(-1), knownTurn: new Array(n).fill(-999), target: -1, door: -1, mode: '탐색', sprintLeft: 0, sprintCd: 0,
        seen: new Uint8Array(map.W * map.H), inv: { shotgun: CFG.SHOTGUN_AMMO, smoke: 0, boost: 0, cloak: 0, vault: 0, barricade: 0 }, reload: 0, cloak: 0, boost: 0, used: 0, vaults: 0 };
      this.giants = map.giantStarts.slice(0, n).map((s, k) => ({
        id: k, pos: s, prev: s, path: [s], facing: DIRS[((seed >>> 3) + k) & 3].slice(),
        know: -1, knowTurn: -999, saw: false, mode: '순찰', goal: -1, patrol: -1, modeSince: 0, ambushSpot: -1,
        dashLeft: 0, dashCd: 0, doorHeat: 0, doorBan: 0, keyHeat: 0, keyBan: 0, called: -99, smashCd: secTurns(CFG.SMASH_FIRST_SEC), smashTurn: -99, smashes: 0,
        inv: { roar: 0, tracker: 0, barricade: 0 }, stun: 0, blind: 0, track: 0, out: 0,
      }));
      // 아이템 · 바리케이드 · 화면 효과 기록(fx)
      this.items = []; this.barricades = []; this.fx = []; this.lastItemSpawn = 0;
      for (let i = 0; i < CFG.ITEMS_START_R; i++) this.spawnItem('R');
      for (let i = 0; i < CFG.ITEMS_START_G; i++) this.spawnItem('G');
      // 미션 진행 상태
      this.ms = map.missions.map((M) => ({ type: M.type, done: false, lev: (M.levers || []).map(() => false), cnt: 0, need: M.type === 'switch' ? M.levers.length : M.type === 'plate' ? CFG.PLATE_TURNS : 1, gemTaken: false }));
      this.runner.gem = -1;
      // 뷱
      // 뷱은 전체에 1마리 (위층에서 출발, 계단으로 오르내림)
      this.snakes = map.snakeStarts.slice(-CFG.SNAKES).map((c, i) => ({ id: i, body: new Array(CFG.SNAKE_LEN).fill(c), prevBody: new Array(CFG.SNAKE_LEN).fill(c), grow: 0, hidden: 0, rest: 0, target: -1, patrol: -1, floor: floorOf(map, c), mode: '어슬렁' }));
      this.snakeAte = { giants: 0, runner: 0, byGiant: new Array(n).fill(0), pills: 0 };
      this.pills = []; this.lastPill = 0;
      for (let i = 0; i < CFG.PILLS_START; i++) this.spawnPill(i % map.floors);
      updateSeen(this);
      this.smashed = []; // 부서진 벽 기록 (화면 연출용)
    }
    // 거인 k가 벽 ws(1~2칸)를 부숨: 맵 복사(처음 한 번) → 벽 제거 → 길찾기 갱신
    smash(k, ws) {
      if (this.map.pristine !== false) this.map = cloneMap(this.map);
      const G = this.giants[k]; G.smashCd = secTurns(CFG.SMASH_COOLDOWN_SEC); G.smashTurn = this.turn; G.smashes = (G.smashes || 0) + 1;
      const bars = ws.filter((w) => this.map.g[w] === 2), walls = ws.filter((w) => this.map.g[w] === 1);
      for (const w of bars) this.removeBarricade(w, k, 'smash');
      if (walls.length) {
        const m = this.map; for (const w of walls) { m.g[w] = 0; m.breakable[w] = 0; } finalizeGraphs(m);
        for (const w of walls) this.smashed.push({ turn: this.turn, cell: w, giant: k });
        this.log('smash', `거인${k + 1}이 벽을 부셨다! 💥`);
      }
      this.fx.push({ t: 'smash', cell: ws[0], giant: k, turn: this.turn });
    }
    log(type, text) { this.events.push({ turn: this.turn, type, text }); }
    spawnItem(side) {
      const m = this.map;
      side = side || (this.rng() < CFG.ITEM_R_SHARE ? 'R' : 'G');
      const types = side === 'R' ? (CFG.R_SPAWN_LIST || R_SPAWN) : G_ITEMS;
      const type = types[Math.floor(this.rng() * types.length)];
      const taken = new Set(this.items.map((it) => it.cell).concat(this.keysLeft, this.barricades.map((b) => b.cell), [this.runner.pos], this.giants.map((G) => G.pos)));
      const sp = m.itemSpots.filter((i) => m.g[i] === 0 && !taken.has(i));
      if (!sp.length) return;
      const cell = sp[Math.floor(this.rng() * sp.length)];
      this.items.push({ cell, type, side });
      if (this.turn > 0) this.fx.push({ t: 'spawn', cell, type, turn: this.turn });
    }
    // 바리케이드 설치/제거 (맵 복사본에서 g=2)
    setTile(cell, v) {
      if (this.map.pristine !== false) this.map = cloneMap(this.map);
      const m = this.map; m.g[cell] = v; m.breakable[cell] = v === 2 ? 1 : 0; finalizeGraphs(m);
    }
    placeBarricade(cell, by) {
      this.setTile(cell, 2); this.barricades.push({ cell, by, hp: CFG.BARRICADE_HP });
      this.fx.push({ t: 'barricade', cell, by, turn: this.turn });
    }
    removeBarricade(cell, k, how) {
      const i = this.barricades.findIndex((b) => b.cell === cell); if (i < 0) return;
      const b = this.barricades[i]; this.barricades.splice(i, 1); this.setTile(cell, 0);
      this.fx.push({ t: 'barricadeBreak', cell, giant: k, turn: this.turn });
      this.log('barricade', `거인${k + 1}이 ${b.by === 'runner' ? '도망자의 ' : ''}바리케이드를 ${how === 'smash' ? '힘껏 ' : ''}부쉈다! 💥`);
    }
    isBarricade(cell) { return this.map.g[cell] === 2; }
    hasAllKeys() { return this.keysLeft.length === 0; }
    giantAt(pos) { for (const G of this.giants) if (G.pos === pos && G.out <= 0) return G.id; return -1; }
    catcherAt(pos) { for (const G of this.giants) if (G.pos === pos && G.stun <= 0 && G.out <= 0) return G.id; return -1; } // 기절·먹힌 거인은 못 잡음
    floorOf(c) { return floorOf(this.map, c); }
    // 미션: 도망자가 밟은 칸 처리
    missionTouch(c) {
      const m = this.map, R = this.runner;
      m.missions.forEach((M, mi) => {
        const S = this.ms[mi]; if (S.done) return;
        if (M.type === 'switch') { const li = M.levers.indexOf(c); if (li >= 0 && !S.lev[li]) { S.lev[li] = true; S.cnt++; this.fx.push({ t: 'lever', cell: c, turn: this.turn }); this.log('mission', `도망자가 스위치를 켰다! 🕹️ 미션: 스위치 ${S.cnt}/${S.need}`); if (S.cnt >= S.need) this.missionDone(mi); } }
        else if (M.type === 'carry') {
          if (c === M.gem && !S.gemTaken && R.gem < 0) { S.gemTaken = true; R.gem = mi; this.fx.push({ t: 'gem', cell: c, turn: this.turn }); this.log('mission', '도망자가 보석을 주웠다! 💎 받침대로 옮겨라 (미션: 보석 0/1)'); }
          if (c === M.pedestal && R.gem === mi) { R.gem = -1; S.cnt = 1; this.fx.push({ t: 'pedestal', cell: c, turn: this.turn }); this.missionDone(mi); }
        }
      });
    }
    missionDone(mi) {
      const S = this.ms[mi], M = this.map.missions[mi]; S.done = true;
      this.fx.push({ t: 'chest', cell: M.key, turn: this.turn });
      const name = { switch: '스위치', carry: '보석 운반', plate: '발판' }[M.type];
      this.log('mission', `미션 완료(${name})! 🧰 ${this.floorOf(M.key) + 1}층 상자가 열렸다 — 열쇠를 꺼낼 수 있다`);
    }
    missionText() {
      return this.map.missions.map((M, mi) => { const S = this.ms[mi]; const n = { switch: '스위치', carry: '보석', plate: '발판' }[M.type]; return S.done ? `${n} ✅` : `${n} ${S.cnt}/${S.need}`; }).join(' · ');
    }
    spawnPill(f) {
      const m = this.map; if (!this.snakes.length) return;
      if (f == null) f = this.snakes[Math.floor(this.rng() * this.snakes.length)].floor;
      const taken = new Set([...this.pills, ...this.items.map((it) => it.cell), ...this.keysLeft, ...this.snakes.flatMap((S) => S.body)]);
      const sp = m.itemSpots.filter((i) => floorOf(m, i) === f && m.g[i] === 0 && m.sNbrs[i] && m.sNbrs[i].length && !taken.has(i));
      if (!sp.length) return;
      const c = sp[Math.floor(this.rng() * sp.length)]; this.pills.push(c);
      if (this.turn > 0) this.fx.push({ t: 'pillSpawn', cell: c, turn: this.turn });
    }
    // 뷱 몸통(머리 제외)은 지나갈 수 없음 — 길어질수록 복도를 더 막음
    snakeBody() {
      if (this._sbTurn === this.turn && this._sb) return this._sb;
      const b = new Set(); for (const S of this.snakes) if (S.hidden <= 0) for (let i = 1; i < S.body.length; i++) if (S.body[i] !== S.body[0]) b.add(S.body[i]);
      this._sb = b; this._sbTurn = this.turn; return b;
    }
    snakeAtHead(c) { for (const S of this.snakes) if (S.hidden <= 0 && S.body[0] === c) return S; return null; }
    eatGiant(S, k) {
      const G = this.giants[k]; G.out = secTurns(CFG.SNAKE_DIGEST_SEC); G.stun = 0; G.blind = 0; G.track = 0; G.dashLeft = 0; G.know = -1; G.saw = false; G.ambushSpot = -1; releaseDoor(this, k);
      G.eatenAt = G.pos; G.path = [G.pos];
      S.grow += CFG.SNAKE_GROW_GIANT; S.rest = CFG.SNAKE_REST; this.snakeAte.giants++; this.snakeAte.byGiant[k]++;
      this.fx.push({ t: 'eat', cell: S.body[0], giant: k, snake: S.id, turn: this.turn });
      this.log('snake', `뷱이 거인${k + 1}을 삼켰다! 🐍 (${CFG.SNAKE_DIGEST_SEC}초 뒤 출발점에서 부활)`);
    }

    step() {
      if (this.result) return;
      this.turn++;
      const m = this.map, R = this.runner;
      // --- 도망자 (전력질주 시 2칸)
      if (R.sprintCd > 0) R.sprintCd--;
      let rMoves = 1;
      if (R.sprintLeft === 0 && R.sprintCd === 0) {
        const dR = bfsC(m, R.pos, 1); let near = 999;
        this.giants.forEach((G, k) => { if (this.turn - R.knownTurn[k] <= 1) near = Math.min(near, dR[R.known[k]]); });
        if (near <= 1 + Math.round(this.rg.sprint * 5)) { R.sprintLeft = CFG.SPRINT_LEN; R.sprintCd = CFG.SPRINT_COOLDOWN; this.log('sprint', '도망자가 전력질주한다! ⚡'); }
      }
      if (R.cloak > 0) R.cloak--;
      // 샷건 장전 (기본 스킬): 2발 미만이면 5초마다 1발
      if (R.inv.shotgun < CFG.SHOTGUN_AMMO) { if (++R.reload >= secTurns(CFG.SHOTGUN_RELOAD_SEC)) { R.inv.shotgun++; R.reload = 0; } } else R.reload = 0;
      runnerUseItems(this);
      if (R.sprintLeft > 0) { rMoves = 2; R.sprintLeft--; }
      if (R.boost > 0) { rMoves = 2; R.boost--; }
      R.path = [R.pos];
      for (let s = 0; s < rMoves; s++) {
        R.prev = R.pos;
        R.vaultOver = -1;
        R.pos = runnerDecide(this);
        if (R.vaultOver >= 0) { // 벽넘기: 안쪽 벽(또는 바리케이드) 한 칸을 뛰어넘음
          R.inv.vault--; R.used++; R.vaults++; R.vaultTurn = this.turn;
          R.path.push(R.vaultOver); // 화면 보간용: 벽 위를 지나가는 점
          this.fx.push({ t: 'vault', from: R.prev, over: R.vaultOver, to: R.pos, cell: R.prev, turn: this.turn });
          this.log('vault', '🤸 도망자 벽넘기!');
        }
        R.path.push(R.pos);
        this.scent[R.prev] = this.turn - 1; this.scent[R.pos] = this.turn;
        const ii = this.items.findIndex((it) => it.cell === R.pos && it.side === 'R');
        if (ii >= 0) {
          const it = this.items[ii]; this.items.splice(ii, 1);
          R.inv[it.type] = (R.inv[it.type] || 0) + 1;
          this.fx.push({ t: 'pickup', cell: R.pos, type: it.type, who: -1, turn: this.turn });
          this.log('item', `도망자가 ${ITEM_INFO[it.type].obj} 주웠다! ${ITEM_INFO[it.type].icon}`);
        }
        this.missionTouch(R.pos);
        if (this.keysLeft.includes(R.pos) && this.ms[m.keyMission[R.pos]].done) {
          this.keysLeft.splice(this.keysLeft.indexOf(R.pos), 1); this.keysHeld++;
          this.log('key', this.hasAllKeys() ? '도망자가 마지막 열쇠를 얻었다! 🔑 문 A·B가 열렸다' : `도망자가 열쇠를 주웠다 🔑 (${this.keysHeld}/${m.keys.length})`);
        }
        const gi = this.catcherAt(R.pos);
        if (gi >= 0) { this.catcher = gi; return this.finish('giant'); }
        // v16: 뷱은 도망자를 먹지 않음 (도망자는 뷱 머리·몸통을 그냥 지나감)
        for (const S of this.snakes) { // 꼬리 잡기
          const tail = S.body[S.body.length - 1];
          if (S.hidden <= 0 && R.pos === tail && tail !== S.body[0] && new Set(S.body).size >= 3) {
            S.hidden = CFG.SNAKE_HIDE; this.fx.push({ t: 'tailgrab', cell: tail, snake: S.id, turn: this.turn });
            this.log('snake', `도망자가 뷱의 꼬리를 잡아당겼다! 🐍 뷱이 땅속으로 숨었다 (${CFG.SNAKE_HIDE}턴)`);
          }
        }
        if (m.isExit[R.pos] && this.hasAllKeys()) {
          this.escapeDoor = m.exitNames[m.exits.indexOf(R.pos)];
          this.log('door', `도망자가 문 ${this.escapeDoor}로 빠져나갔다! 🚪`);
          return this.finish('runner');
        }
      }
      // 발판 미션: 위에 서 있는 턴 수만큼 진행, 쿵쿵 소리에 거인이 몰려옴. 내려오면 처음부터
      m.missions.forEach((M, mi) => {
        const S = this.ms[mi]; if (M.type !== 'plate' || S.done) return;
        if (R.pos === M.plate) {
          S.cnt++; this.fx.push({ t: 'plate', cell: M.plate, n: S.cnt, need: S.need, turn: this.turn });
          if (S.cnt === 1 || S.cnt === S.need - 1) this.log('mission', `도망자가 발판을 밟고 버틴다… 미션: 발판 ${S.cnt}/${S.need} (쿵쿵! 거인이 들을 수 있다)`);
          for (const G of this.giants) if (G.out <= 0 && G.stun <= 0 && bfsC(m, G.pos, 2)[R.pos] <= CFG.PLATE_NOISE) { G.know = R.pos; G.knowTurn = this.turn; }
          if (S.cnt >= S.need) this.missionDone(mi);
        } else if (S.cnt > 0) { S.cnt = 0; this.log('mission', '도망자가 발판에서 내려왔다 — 발판 미션이 처음으로 돌아갔다'); }
      });
      runnerBarricade(this);
      // --- 거인: 감지 → 호출 → 이동
      this.giants.forEach((G, k) => giantSense(this, k));
      this.giants.forEach((G, k) => giantUseItems(this, k));
      this.giants.forEach((G, k) => {
        if (!G.saw) return;
        const range = Math.round(this.gg[k].call * CFG.CALL_RANGE);
        if (range <= 0) return;
        const d = bfsC(m, G.pos, 2); let any = false;
        this.giants.forEach((H, j) => { if (j !== k && !H.saw && d[H.pos] <= range) { H.know = R.pos; H.knowTurn = this.turn; any = true; } });
        if (any && this.turn - G.called > 10) { G.called = this.turn; this.log('call', `거인${k + 1}이 동료를 불렀다! 📢`); }
      });
      for (const G of this.giants) {
        const k = G.id, gg = this.gg[k];
        G.prev = G.pos; G.path = [G.pos];
        if (G.smashCd > 0) G.smashCd--; // 벽 부수기 쿨다운은 뷱 배 속에 있을 때도 계속 흐름 (부활해도 초기화하지 않음)
        if (G.out > 0) { if (--G.out === 0) this.respawnGiant(k); continue; }
        if (G.blind > 0) G.blind--;
        if (G.stun > 0) { if (--G.stun === 0) this.log('stun', `거인${k + 1}이 정신을 차렸다 💫`); continue; }
        let moves = ((this.turn + k) % giantSkip(gg) === 0 || this.rng() < CFG.GIANT_REST_P) ? 0 : 1;
        if (G.dashCd > 0) G.dashCd--;
        if (G.dashLeft === 0 && G.dashCd === 0 && G.saw) {
          const d = bfsC(m, G.pos, 2)[R.pos];
          if (d <= 2 + Math.round(gg.dash * 10)) { G.dashLeft = CFG.DASH_LEN; G.dashCd = CFG.DASH_COOLDOWN; this.log('dash', `거인${k + 1}이 돌진한다! 💨`); }
        }
        if (G.dashLeft > 0) { moves = 2; G.dashLeft--; }
        for (let s = 0; s < moves; s++) {
          const before = G.pos;
          if (G.smashCd <= 0) { const ws = smashChoice(this, k); if (ws) { this.smash(k, ws); const w = ws[0]; G.facing = [w % m.W - G.pos % m.W, ((w / m.W) | 0) - ((G.pos / m.W) | 0)]; break; } }
          const bw = barricadeHitChoice(this, k);
          if (bw >= 0) { // 맨손으로 바리케이드 두드리기
            const b = this.barricades.find((x) => x.cell === bw);
            G.facing = [bw % m.W - G.pos % m.W, ((bw / m.W) | 0) - ((G.pos / m.W) | 0)];
            if (--b.hp <= 0) this.removeBarricade(bw, k, 'hand'); else this.fx.push({ t: 'barricadeHit', cell: bw, giant: k, turn: this.turn });
            break;
          }
          G.pos = giantDecide(this, k);
          if (G.pos !== before) G.facing = [G.pos % m.W - before % m.W, ((G.pos / m.W) | 0) - ((before / m.W) | 0)];
          G.path.push(G.pos);
          if (G.pos === R.pos) { this.catcher = k; return this.finish('giant'); }
          { const S = this.snakeAtHead(G.pos); if (S) { this.eatGiant(S, k); break; } }
          const gi2 = this.items.findIndex((it) => it.cell === G.pos && it.side === 'G' && G.inv[it.type] === 0);
          if (gi2 >= 0) { const it = this.items[gi2]; this.items.splice(gi2, 1); G.inv[it.type] = 1; this.fx.push({ t: 'pickup', cell: G.pos, type: it.type, who: k, turn: this.turn }); this.log('item', `거인${k + 1}이 ${ITEM_INFO[it.type].obj} 주웠다! ${ITEM_INFO[it.type].icon}`); }
        }
        if (G.doorBan > 0) { G.doorBan--; G.doorHeat = 0; }
        else if (m.nearDoor[G.pos]) { if (++G.doorHeat > CFG.DOOR_LINGER) { G.doorBan = CFG.DOOR_BAN; releaseDoor(this, k); G.ambushSpot = -1; if (G.mode === '매복') G.mode = '지루함'; this.log('doorban', `문의 빛에 눈이 부신 거인${k + 1}이 문 근처에서 물러난다 ✨`); } }
        else G.doorHeat = Math.max(0, G.doorHeat - 1);
        if (G.keyBan > 0) { G.keyBan--; G.keyHeat = 0; }
        else if (nearKey(this, G.pos)) { if (++G.keyHeat > CFG.KEY_LINGER) { G.keyBan = CFG.KEY_BAN; if (this.keysLeft.includes(G.ambushSpot)) { G.ambushSpot = -1; if (G.mode === '매복') G.mode = '지루함'; } this.log('doorban', `열쇠의 빛에 눈이 부신 거인${k + 1}이 열쇠 근처에서 물러난다 ✨`); } }
        else G.keyHeat = Math.max(0, G.keyHeat - 1);
      }
      // 뷱 이동
      for (const S of this.snakes) { snakeStep(this, S); if (this.result) return; }
      this._sb = null;
      if (this.turn - this.lastPill >= CFG.PILL_RESPAWN) { this.lastPill = this.turn; if (this.pills.length < CFG.PILL_MAX) this.spawnPill(); }
      if (this.turn - this.lastItemSpawn >= CFG.ITEM_RESPAWN) { this.lastItemSpawn = this.turn; if (this.items.length < CFG.ITEM_MAX) this.spawnItem(); }
      if (this.turn >= CFG.MAX_TURNS) return this.finish('draw');
    }
    respawnGiant(k) {
      const G = this.giants[k], m = this.map; let c = m.giantStarts[k];
      const sb = this.snakeBody(), bad = (i) => m.g[i] !== 0 || this.giantAt(i) >= 0 || i === this.runner.pos || this.snakeAtHead(i) || sb.has(i) || !m.gNbrs[i];
      if (bad(c)) { const dr = bfsC(m, this.runner.pos, 2), c0 = c; let best = -1, bd = Infinity; for (const i of m.floor) { if (bad(i) || dr[i] <= 3 || floorOf(m, i) !== floorOf(m, c0)) continue; const v = manhattan(m, i, c0); if (v < bd) { bd = v; best = i; } } if (best >= 0) c = best; }
      G.pos = c; G.prev = c; G.path = [c]; G.mode = '순찰'; G.modeSince = this.turn; G.patrol = -1; G.know = -1; G.knowTurn = -999;
      this.fx.push({ t: 'respawn', cell: c, giant: k, turn: this.turn });
      this.log('snake', `거인${k + 1}이 뷱의 배 속에서 빠져나와 출발점에 다시 나타났다 😵`);
    }
    snakeEatsRunner(S) {
      this.catcher = -2; this.eatenBySnake = true; this.snakeAte.runner++;
      this.fx.push({ t: 'eat', cell: this.runner.pos, giant: -1, snake: S.id, turn: this.turn });
      this.log('snake', '뷱이 도망자를 삼켰다! 🐍');
      return this.finish('giant');
    }
    finish(who) {
      this.result = who;
      if (who === 'giant') this.log('end', `거인${this.catcher + 1}이 도망자를 잡아먹었다! 👹`);
      else if (who === 'runner') this.log('end', `탈출 성공! 도망자가 문 ${this.escapeDoor}로 탈출했다 🏃🚪`);
      else this.log('end', '시간 초과 — 무승부');
    }
    run() { while (!this.result) this.step(); return this.result; }
  }

  // ---------- 도망자 AI (거인 3명 모두 고려) ----------
  // ---------- 전장의 안개: 도망자가 본 곳/지나간 곳만 기억 ----------
  const visOffsets = {};
  function offsetsFor(r) {
    if (visOffsets[r]) return visOffsets[r];
    const o = []; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) o.push([dx, dy]);
    return (visOffsets[r] = o);
  }
  // a에서 b가 보이는가 (b가 벽이어도 그 앞까지 트여 있으면 벽 자체는 보임)
  function visibleCell(map, a, b) {
    let x0 = a % map.W, y0 = (a / map.W) | 0; const x1 = b % map.W, y1 = (b / map.W) | 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (x0 === x1 && y0 === y1) return true;
      if ((x0 !== a % map.W || y0 !== ((a / map.W) | 0)) && map.g[y0 * map.W + x0] !== 0) return false;
      const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  function updateSeen(game) {
    const m = game.map, R = game.runner, x = R.pos % m.W, y = (R.pos / m.W) | 0;
    R.seen[R.pos] = 1;
    for (const [dx, dy] of offsetsFor(CFG.VISION)) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= m.W || ny >= m.H) continue;
      const c = ny * m.W + nx; if (R.seen[c] === 1 && m.g[c] !== 2) continue;
      if (visibleCell(m, R.pos, c)) R.seen[c] = 1;
    }
  }
  // 여러 출발점 다익스트라 (우선순위 큐는 평행 배열 이진 힙)
  const HK = new Float64Array(8192), HV = new Int32Array(8192);
  function dijkstraSeeds(m, seeds, cost, pass, seen) {
    const N = m.W * m.H, W = m.W, dist = new Float64Array(N).fill(Infinity); let n = 0;
    const push = (k, v) => { let i = n++; while (i > 0) { const p = (i - 1) >> 1; if (HK[p] <= k) break; HK[i] = HK[p]; HV[i] = HV[p]; i = p; } HK[i] = k; HV[i] = v; };
    const popTo = () => { const k = HK[--n], v = HV[n]; let i = 0; for (;;) { const l = 2 * i + 1; if (l >= n) break; const c = l + 1 < n && HK[l + 1] < HK[l] ? l + 1 : l; if (HK[c] >= k) break; HK[i] = HK[c]; HV[i] = HV[c]; i = c; } HK[i] = k; HV[i] = v; };
    for (const [c, c0] of seeds) if (c0 < dist[c]) { dist[c] = c0; push(c0, c); }
    while (n > 0) {
      const dc = HK[0], c = HV[0]; popTo(); if (dc > dist[c]) continue;
      const x = c % W;
      for (let d = 0; d < 4; d++) {
        const nb = d === 0 ? (x < W - 1 ? c + 1 : -1) : d === 1 ? (x > 0 ? c - 1 : -1) : d === 2 ? c + W : c - W;
        if (nb < 0 || nb >= N || !pass(nb)) continue;
        const nd = dc + cost[nb]; if (nd < dist[nb]) { dist[nb] = nd; if (n < 8190) push(nd, nb); }
      }
      const sp = m.stairOf ? m.stairOf[c] : -1;
      if (sp >= 0 && (!seen || seen[c] === 1 || seen[sp] === 1) && pass(sp)) { const nd = dc + cost[sp]; if (nd < dist[sp]) { dist[sp] = nd; if (n < 8190) push(nd, sp); } }
    }
    return dist;
  }

  // ---------- 도망자 AI (거인 4명 모두 고려, 아는 지도만 사용) ----------
  function runnerDecide(game) {
    const m = game.map, R = game.runner, g = game.rg, N = m.W * m.H, W = m.W;
    const all = game.hasAllKeys(), gid = all ? 0 : 1, rN = m.graphs[gid];
    updateSeen(game);
    const dR = bfsC(m, R.pos, gid);
    game.giants.forEach((G, k) => {
      if (G.out > 0) { R.known[k] = -1; return; }
      const seen = sees(m, R.pos, G.pos), heard = dR[G.pos] <= CFG.HEAR;
      if (seen || heard) {
        if (R.knownTurn[k] < game.turn - 4) game.log('spot', seen ? `도망자가 거인${k + 1}을 발견했다! 😱` : `도망자가 거인${k + 1}의 발소리를 들었다… 👂`);
        R.known[k] = G.pos; R.knownTurn[k] = game.turn;
      }
    });
    const memTurns = Math.round(g.memory * 40);
    let dRaw = null, dEff = null; const freshPos = [];
    game.giants.forEach((G, k) => {
      const age = game.turn - R.knownTurn[k];
      if (R.known[k] < 0 || age > memTurns) return;
      if (age === 0 && G.stun > 3) return; // 눈앞에서 기절한 거인은 위협이 아님
      if (age === 0) freshPos.push(R.known[k]);
      const d = bfsC(m, R.known[k], 2);
      if (!dRaw) { dRaw = new Float32Array(N).fill(999); dEff = new Float32Array(N).fill(999); }
      for (const i of m.floor) { if (d[i] < dRaw[i]) dRaw[i] = d[i]; const e = d[i] - age * 0.8; if (e < dEff[i]) dEff[i] = e; }
    });
    // 뷱: 보이거나 아주 가까우면(3칸) 머리 위치를 기억, 위협으로 취급 ('뷱 경계' 유전자만큼 멀리서부터)
    const snakeD = [];
    for (const S of game.snakes) {
      if (S.hidden > 0) { R.snake = R.snake || {}; delete R.snake[S.id]; continue; }
      const h = S.body[0]; R.snake = R.snake || {};
      if (sees(m, R.pos, h) || bfsC(m, R.pos, 0)[h] <= 3) { if (!R.snake[S.id] || game.turn - R.snake[S.id].turn > 6) game.log('spot', '도망자가 뷱을 발견했다! 🐍'); R.snake[S.id] = { head: h, tail: S.body[S.body.length - 1], turn: game.turn }; }
      const kn = R.snake[S.id]; if (!kn || game.turn - kn.turn > 8) continue;
      // v16: 뷱은 도망자에게 위협이 아님 (꼬리 잡기·거인 유인에만 씀)
      snakeD.push({ d: bfsC(m, kn.head, 3), tail: kn.tail, fresh: game.turn === kn.turn, head: kn.head });
    }
    // 발판 위: '발판 배짱'만큼 거인이 가까워질 때까지 버팀
    for (let mi = 0; mi < m.missions.length; mi++) {
      const M = m.missions[mi], S = game.ms[mi];
      if (M.type === 'plate' && !S.done && R.pos === M.plate) {
        const nerve = 2 + Math.round((1 - (g.plateNerve ?? 0.4)) * 8);
        if (!dRaw || dRaw[R.pos] > nerve) { R.mode = '미션(발판)'; return R.pos; }
      }
    }
    const predictShift = g.predict * 3;
    // 아는 목표만: 본 적 있는 열쇠/문/아이템 + 미탐색 경계(frontier)
    const seenS = R.seen;
    // 상자를 보면 그 미션의 단서(스위치·보석·발판 위치)를 알게 됨
    if (!R.clue) R.clue = new Uint8Array(N);
    const clue = R.clue;
    for (const k of game.keysLeft) if (seenS[k]) { const mi = m.keyMission[k]; if (!game.ms[mi].clue) { game.ms[mi].clue = true; for (const c of missionGoals(game, mi, true)) clue[c] = 1; game.log('mission', `도망자가 ${floorOf(m, k) + 1}층에서 잠긴 상자를 찾았다! 🧰 단서: ${{ switch: '스위치 ' + CFG.LEVERS + '개를 켜라', carry: '보석을 받침대로 옮겨라', plate: '발판 위에서 ' + CFG.PLATE_TURNS + '턴 버텨라' }[m.missions[mi].type]}`); } }
    const knownC = (c) => seenS[c] === 1 || clue[c] === 1;
    // 길 찾기: 본 곳은 실제 지형, 못 본 곳은 '아마 길'로 가정(비용 1.6) — 바깥 벽·층 경계는 제외
    const FH = m.FH || m.H, ucost = 1.6;
    const pass = (n) => { if (seenS[n] === 1) return m.g[n] === 0 && (all || !m.isExit[n]); const x = n % W, yl = ((n / W) | 0) % FH; return x > 0 && x < W - 1 && yl > 0 && yl < FH - 1; };
    const seeds = []; let target = -1, bestT = Infinity;
    if (all) {
      for (const e of m.exits) { if (!knownC(e)) continue; let s = dRaw ? (0.6 + g.keySafe) * Math.max(0, 16 - Math.min(dRaw[e], 30)) * 2 : 0; seeds.push([e, s]); if (dR[e] + s < bestT) { bestT = dR[e] + s; target = e; } }
      if (target >= 0 && R.door !== target) {
        game.log('doorpick', R.door >= 0 ? `도망자가 문 ${m.exitNames[m.exits.indexOf(target)]} 쪽으로 방향을 바꿨다` : `도망자가 문 ${m.exitNames[m.exits.indexOf(target)]}를 노린다`);
        R.door = target;
      }
    } else {
      const dang = (c) => (dRaw ? g.keySafe * Math.max(0, 14 - Math.min(dRaw[c], 30)) * 2.5 : 0);
      for (const k of game.keysLeft) {
        const mi = m.keyMission[k], S = game.ms[mi];
        if (S.done) { if (!knownC(k)) continue; const s = dang(k); seeds.push([k, s]); if (dR[k] + s < bestT) { bestT = dR[k] + s; target = k; } continue; }
        const ord = (g.missionOrder ?? 0.4) * (1 - S.cnt / S.need) * 10;
        for (const c of missionGoals(game, mi, false)) { if (!knownC(c)) continue; const s = dang(c) + ord; seeds.push([c, s]); if (dR[c] + s < bestT) { bestT = dR[c] + s; target = c; } }
      }
    }
    const known = seeds.length > 0;
    for (const it of game.items) if (it.side === 'R' && seenS[it.cell] && R.inv[it.type] < 2) seeds.push([it.cell, 3 + (1 - g.itemGreed) * 28]);
    const fCost = known ? CFG.FRONTIER_COST + 6 : 0;
    for (let y = 1; y < m.H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const c = y * W + x; if (!seenS[c] || !pass(c)) continue;
      if ((x < W - 2 && !seenS[c + 1]) || (x > 1 && !seenS[c - 1]) || (y < m.H - 2 && !seenS[c + W]) || (y > 1 && !seenS[c - W])) seeds.push([c, fCost]);
      if (m.stairOf[c] >= 0 && !seenS[m.stairOf[c]]) seeds.push([m.stairOf[c], fCost]); // 안 가 본 위/아래층: 계단을 올라(내려)가 봐야 앎
    }
    R.target = target;
    const fleeR = 2 + g.flee * 7;
    const cost = new Float64Array(N).fill(1);
    for (let i = 0; i < N; i++) if (!seenS[i]) cost[i] = ucost;
    if (dEff) { const K = g.danger * 30; for (const i of m.floor) { const de = dEff[i] - predictShift; if (de < fleeR) { const r = (fleeR - de) / fleeR; cost[i] = 1 + K * r * r; } } }
    const distT = dijkstraSeeds(m, seeds, cost, pass, seenS);
    for (const c of rN[R.pos]) if (c === target && !freshPos.includes(c) && (!dRaw || dRaw[c] > 1 || (m.isExit[c] && all))) { R.mode = '돌파'; return c; }
    const fleeing = dEff && dEff[R.pos] - predictShift * 0.5 <= fleeR;
    let best = -Infinity, choice = R.pos;
    const scoreOf = (c) => {
      let s; const dt = Math.min(distT[c], 300);
      if (fleeing) {
        let esc = 0;
        if (g.loop > 0.02) { const dc = bfsC(m, c, gid); let cnt = 0; for (const i of m.floor) if (seenS[i] && dc[i] + 1 < dRaw[i]) cnt++; esc = cnt / m.floor.length; }
        s = -g.greed * 1.2 * dt + (1 - g.greed) * 3 * Math.min(dEff[c], 30) + g.loop * 25 * esc;
      } else s = -dt - (c === R.pos ? 0.5 : 0);
      if (dRaw && dRaw[c] <= 1 && !(m.isExit[c] && all)) s -= 1000;
      if (freshPos.includes(c)) s -= 5000;
      for (const sd of snakeD) {
        if (c === sd.tail && sd.d[c] >= 3) s += (g.tailGrab ?? 0.3) * 40 - 8; // 꼬리 잡기
        if (fleeing && sd.d[c] >= 2 && sd.d[c] <= 6) s += (g.snakeLure ?? 0.3) * (6 - Math.abs(sd.d[c] - 3.5)) * 2; // 거인을 뷱 쪽으로 유인
      }
      if (c === R.prev && c !== R.pos) s -= 0.3;
      s += game.rng() * 0.01;
      if (game.debug) (game.dbg = game.dbg || []).push({ c, s, dt: distT[c], dRaw: dRaw ? dRaw[c] : -1, fleeing });
      return s;
    };
    for (const c of rN[R.pos].concat([R.pos])) { const s = scoreOf(c); if (s > best) { best = s; choice = c; } }
    // 벽넘기 아이템: 안쪽 벽/바리케이드 한 칸 너머의 (아는) 빈 바닥으로. '벽넘기' 유전자가 높을수록 작은 이득에도 사용
    if (R.inv.vault > 0) {
      const vg = g.vault ?? 0.4, need = fleeing ? 4 + (1 - vg) * 30 : 3 + Math.round((1 - vg) * 12);
      let vBest = -Infinity, vTo = -1, vOver = -1;
      for (const [over, to] of vaultMoves(game)) {
        if (!seenS[to] || freshPos.includes(to)) continue;
        const s = scoreOf(to); if (s > vBest) { vBest = s; vTo = to; vOver = over; }
      }
      if (vTo >= 0 && vBest - best >= need) { R.vaultOver = vOver; R.mode = '벽넘기'; return vTo; }
    }
    R.mode = fleeing ? '도주' : (!known ? '탐색' : m.isMission[target] ? '미션' : dRaw ? '경계' : '목표로');
    return choice;
  }

  // 벽넘기 후보: [넘을 벽, 착지 칸] — 안쪽 벽(1)·바리케이드(2) 한 칸만, 바깥 벽·층 경계 불가, 착지는 같은 층의 빈 바닥(출구 제외, 거인·뷱 머리 없는 칸)
  function vaultMoves(game) {
    const m = game.map, R = game.runner, W = m.W, FH = m.FH || m.H, out = [];
    const x = R.pos % W, y = (R.pos / W) | 0;
    for (const [dx, dy] of DIRS) {
      const wx = x + dx, wy = y + dy, tx = x + 2 * dx, ty = y + 2 * dy;
      if (wx <= 0 || wx >= W - 1 || tx <= 0 || tx >= W - 1) continue;
      const wyl = wy % FH, tyl = ty % FH;
      if (wy < 0 || ty < 0 || ty >= m.H || wyl === 0 || wyl === FH - 1 || tyl === 0 || tyl === FH - 1) continue;
      if (Math.floor(wy / FH) !== Math.floor(y / FH) || Math.floor(ty / FH) !== Math.floor(y / FH)) continue;
      const w = wy * W + wx, t = ty * W + tx;
      if (m.g[w] === 0 || m.isExit[w] || m.g[t] !== 0 || m.isExit[t] || m.stairOf[t] >= 0 || m.stairOf[R.pos] >= 0) continue; // 계단 위/계단으로는 못 넘음
      if (game.giantAt(t) >= 0 || game.snakeAtHead(t)) continue;
      out.push([w, t]);
    }
    return out;
  }

  // ---------- 아이템 ----------
  // R_ITEMS: 도망자 가방 표시 순서(샷건은 기본 스킬), R_SPAWN: 맵에 떨어지는 도망자 아이템 (v16: 샷건 대신 벽넘기)
  const R_ITEMS = ['shotgun', 'smoke', 'boost', 'cloak', 'vault', 'barricade'];
  const R_SPAWN = ['smoke', 'boost', 'cloak', 'vault', 'barricade'];
  const G_ITEMS = ['roar', 'tracker', 'barricade'];
  const ITEM_INFO = {
    smoke: { name: '연막탄', obj: '연막탄을', icon: '💨' }, boost: { name: '부스터', obj: '부스터를', icon: '🚀' }, cloak: { name: '투명망토', obj: '투명망토를', icon: '👻' },
    shotgun: { name: '샷건', obj: '샷건을', icon: '🔫' }, vault: { name: '벽넘기', obj: '벽넘기 신발을', icon: '🤸' }, barricade: { name: '바리케이드', obj: '바리케이드를', icon: '🧱' },
    roar: { name: '포효 뿔피리', obj: '포효 뿔피리를', icon: '🔊' }, tracker: { name: '냄새 추적기', obj: '냄새 추적기를', icon: '🐾' },
  };
  function freshThreats(game) {
    const R = game.runner, out = [];
    game.giants.forEach((G, k) => { if (game.turn - R.knownTurn[k] <= 1 && R.known[k] >= 0 && G.stun <= 0 && G.out <= 0) out.push(k); });
    return out;
  }
  function cellFree(game, c) {
    const m = game.map;
    return m.g[c] === 0 && !m.isExit[c] && !m.isMission[c] && !(m.stairOf[c] >= 0) && !game.keysLeft.includes(c) && !game.items.some((it) => it.cell === c) && !game.pills.includes(c) && game.giantAt(c) < 0 && c !== game.runner.pos && !game.snakes.some((S) => S.body.includes(c));
  }
  // 바리케이드를 놓아도 도망자가 남은 열쇠/문 중 하나에는 갈 수 있어야 함 (못 가면 되돌림)
  function tryPlace(game, c, by) {
    if (!cellFree(game, c)) return false;
    game.setTile(c, 2);
    const m = game.map, all = game.hasAllKeys(), d = bfs(m, game.runner.pos, m.graphs[all ? 0 : 1]);
    const ok = (all ? m.exits : game.keysLeft).some((t) => d[t] < 999) && m.missionCells.every((t) => d[t] < 999);
    if (!ok) { game.setTile(c, 0); return false; }
    game.setTile(c, 0); game.placeBarricade(c, by); return true;
  }
  function runnerUseItems(game) {
    const m = game.map, R = game.runner, g = game.rg, inv = R.inv;
    // 샷건: 같은 줄(복도)에서 사거리 안, 벽에 안 막힌 거인
    if (inv.shotgun > 0) {
      const maxD = Math.min(CFG.SHOTGUN_RANGE, 1 + Math.round((g.shotgun ?? 0.4) * 3));
      let tk = -1, td = 99;
      for (const G of game.giants) {
        if (G.stun > 0 || G.out > 0) continue;
        const dx = G.pos % m.W - R.pos % m.W, dy = ((G.pos / m.W) | 0) - ((R.pos / m.W) | 0), d = Math.abs(dx) + Math.abs(dy);
        if ((dx !== 0 && dy !== 0) || d > maxD || d < 1 || !lineOfSight(m, R.pos, G.pos)) continue;
        if (d < td) { td = d; tk = G.id; }
      }
      if (tk >= 0 && game.rng() >= Math.max(0.1, CFG.SHOTGUN_HIT - (td - 1) * CFG.SHOTGUN_FALLOFF)) { // 빗나감(멀수록 잘 빗나감): 탄만 씀
        inv.shotgun--; R.used++; game.fx.push({ t: 'shot', from: R.pos, to: game.giants[tk].pos, giant: tk, miss: true, turn: game.turn });
        game.log('shot', `도망자가 샷건을 쐈지만 빗나갔다! 🔫💨 샷건 ${inv.shotgun}/${CFG.SHOTGUN_AMMO}`);
        tk = -1;
      }
      if (tk >= 0) {
        const G = game.giants[tk]; G.stun = secTurns(CFG.STUN_SEC); G.saw = false; G.dashLeft = 0; G.track = 0; inv.shotgun--; R.used++;
        game.fx.push({ t: 'shot', from: R.pos, to: G.pos, giant: tk, turn: game.turn });
        // v16: 총소리 — 근처(미로 거리 SHOT_NOISE 이내) 다른 거인들이 도망자 위치를 알아챔
        if (CFG.SHOT_NOISE > 0) { const dn = bfsC(m, R.pos, 2), heard = []; for (const H of game.giants) if (H.id !== tk && H.stun <= 0 && H.out <= 0 && dn[H.pos] <= CFG.SHOT_NOISE) { H.know = R.pos; H.knowTurn = game.turn; heard.push(H.id + 1); } if (heard.length) game.log('call', `총소리를 들은 거인${heard.join('·')}이 몰려온다! 👂`); }
        game.log('shot', `도망자가 샷건을 쐈다! 🔫 거인${tk + 1} ${CFG.STUN_SEC}초 기절 · 샷건 ${inv.shotgun}/${CFG.SHOTGUN_AMMO}${inv.shotgun < CFG.SHOTGUN_AMMO ? ` (장전 ${CFG.SHOTGUN_RELOAD_SEC}초)` : ''}`);
      }
    }
    const th = freshThreats(game); if (!th.length) return;
    const dR = bfsC(m, R.pos, 1); let near = 999; for (const k of th) near = Math.min(near, dR[R.known[k]]);
    const panic = g.panic ?? 0.4;
    if (inv.smoke > 0 && near <= 2 + Math.round(panic * 3)) {
      const hit = game.giants.filter((G) => G.out <= 0 && Math.abs(G.pos % m.W - R.pos % m.W) + Math.abs(((G.pos / m.W) | 0) - ((R.pos / m.W) | 0)) <= CFG.SMOKE_RADIUS);
      if (hit.length) {
        for (const G of hit) { G.blind = CFG.SMOKE_TURNS; G.saw = false; }
        inv.smoke--; R.used++;
        game.fx.push({ t: 'smoke', cell: R.pos, turn: game.turn });
        game.log('smoke', `도망자가 연막탄을 터뜨렸다! 💨 ${hit.map((G) => '거인' + (G.id + 1)).join('·')}의 눈이 가려졌다`);
        return;
      }
    }
    if (inv.cloak > 0 && R.cloak === 0 && near <= 2 + Math.round(panic * 4)) {
      R.cloak = CFG.CLOAK_TURNS; inv.cloak--; R.used++;
      game.fx.push({ t: 'cloak', cell: R.pos, turn: game.turn });
      game.log('cloak', '도망자가 투명망토를 둘렀다! 👻 (뛰면 발소리는 들린다)'); return;
    }
    if (inv.boost > 0 && R.boost === 0 && R.sprintLeft === 0 && near <= 2 + Math.round(panic * 5)) {
      R.boost = CFG.BOOST_TURNS; inv.boost--; R.used++;
      game.fx.push({ t: 'boost', cell: R.pos, turn: game.turn });
      game.log('boost', '도망자가 부스터를 켰다! 🚀');
    }
  }
  function runnerBarricade(game) {
    const m = game.map, R = game.runner, g = game.rg;
    if (R.inv.barricade <= 0 || R.path.length < 2) return;
    const c = R.path[R.path.length - 2]; if (c === R.pos) return;
    const reach = 2 + Math.round((g.barricade ?? 0.4) * 6);
    const chasing = freshThreats(game).some((k) => { const d = bfsC(m, game.giants[k].pos, 2); return d[c] < d[R.pos] && d[R.pos] <= reach; });
    if (!chasing) return;
    if (tryPlace(game, c, 'runner')) { R.inv.barricade--; R.used++; game.log('barricade', '도망자가 뒤에 바리케이드를 쳤다! 🧱'); }
  }
  function giantUseItems(game, k) {
    const m = game.map, R = game.runner, G = game.giants[k], g = game.gg[k];
    if (G.stun > 0 || G.out > 0) return;
    if (G.inv.roar && G.saw) {
      const unaware = game.giants.filter((H) => H.id !== k && H.knowTurn < game.turn - 1 && H.stun <= 0 && H.out <= 0).length;
      if (unaware >= 1 && game.rng() < 0.2 + 0.8 * (g.roar ?? 0.4)) {
        for (const H of game.giants) { if (H.stun > 0 || H.out > 0) continue; H.know = R.pos; H.knowTurn = game.turn; }
        G.inv.roar = 0; game.fx.push({ t: 'roar', giant: k, cell: G.pos, turn: game.turn });
        game.log('roar', `거인${k + 1}이 포효했다! 🔊 모든 거인이 도망자의 위치를 알았다`);
      }
    }
    if (G.inv.tracker && !G.saw && G.track === 0 && G.knowTurn > -999 && game.turn - G.knowTurn >= Math.round(2 + 25 * (1 - (g.tracker ?? 0.4)))) {
      G.track = CFG.TRACK_TURNS; G.inv.tracker = 0; G.know = R.pos; G.knowTurn = game.turn;
      game.fx.push({ t: 'tracker', giant: k, cell: G.pos, turn: game.turn });
      game.log('tracker', `거인${k + 1}이 냄새 추적기를 켰다! 🐾 도망자의 발자국을 따라간다`);
    }
    if (G.inv.barricade && G.know >= 0 && game.turn - G.knowTurn <= 3) {
      const all = game.hasAllKeys(), gidR = all ? 0 : 1, obj = runnerObjective(game, G.know);
      const dK = bfsC(m, G.know, gidR), dO = bfsC(m, obj, gidR), reach = 2 + Math.round(10 * (g.blockade ?? 0.3));
      if (dK[obj] < 999) for (const c of m.lockedNbrs[G.pos]) {
        if (dK[c] < 1 || dK[c] > reach || dK[c] + dO[c] !== dK[obj] || m.nearDoor[c]) continue;
        if (tryPlace(game, c, 'giant' + k)) { G.inv.barricade = 0; game.log('barricade', `거인${k + 1}이 길목에 바리케이드를 쳤다! 🚧`); break; }
      }
    }
  }
  // 맨손으로 바리케이드를 두드릴지: 바리케이드 너머가 목표까지 2칸 이상 가까우면
  function barricadeHitChoice(game, k) {
    if (!game.barricades.length) return -1;
    const m = game.map, G = game.giants[k];
    const tgt = G.know >= 0 && game.turn - G.knowTurn <= 6 ? G.know : G.goal;
    if (tgt < 0 || m.g[tgt] !== 0) return -1;
    const dT = bfsC(m, tgt, 2), cur = dT[G.pos];
    for (const b of game.barricades) {
      const bx = b.cell % m.W, by = (b.cell / m.W) | 0, gx = G.pos % m.W, gy = (G.pos / m.W) | 0;
      if (Math.abs(bx - gx) + Math.abs(by - gy) !== 1) continue;
      let after = 999; for (const [ex, ey] of DIRS) { const j = (by + ey) * m.W + bx + ex; if (j !== G.pos && m.g[j] === 0) after = Math.min(after, dT[j]); }
      if (cur - (after + 2) >= 2) return b.cell;
    }
    return -1;
  }

  // ---------- 뷱(뱀) AI: 같은 층에서 가까운 먹잇감(거인 우선)을 쫓고, 없으면 어슬렁 ----------
  function snakeStep(game, S) {
    const m = game.map, R = game.runner;
    S.prevBody = S.body.slice();
    if (S.hidden > 0) {
      if (--S.hidden === 0) { // 도망자에게서 먼 곳에서 다시 나타남
        const dR = bfsC(m, R.pos, 0);
        const c = m.floor.filter((i) => m.sNbrs[i] && m.sNbrs[i].length && dR[i] >= 12 && !(m.stairOf[i] >= 0) && game.giantAt(i) < 0);
        const at = c.length ? c[Math.floor(game.rng() * c.length)] : S.body[0];
        S.body = new Array(S.body.length).fill(at); S.prevBody = S.body.slice(); S.patrol = -1; S.floor = floorOf(m, at);
        game.fx.push({ t: 'snakeUp', cell: at, snake: S.id, turn: game.turn });
        game.log('snake', `뷱이 ${S.floor + 1}층에 다시 나타났다! 🐍`);
      }
      return;
    }
    if (S.rest > 0) { S.rest--; S.mode = '소화 중'; return; }
    if (game.turn % CFG.SNAKE_SKIP === 0) return; // 거인보다 조금 느림
    const head = S.body[0], dH = bfsC(m, head, 3);
    let tgt = -1, best = Infinity, prey = null;
    const calm = game.turn < (S.ignoreUntil || 0); // 막혀서 못 가면 잠시 사냥을 포기하고 어슬렁
    if (!calm) for (const G of game.giants) { if (G.out > 0) continue; const d = dH[G.pos]; if (d <= CFG.SNAKE_SENSE && d - CFG.SNAKE_PREFER_GIANT < best) { best = d - CFG.SNAKE_PREFER_GIANT; tgt = G.pos; prey = 'g' + G.id; } }
    if (tgt >= 0) S.mode = '거인 사냥'; // v16: 뷱은 거인만 사냥
    else if (!calm && game.pills.some((p) => dH[p] < 999)) {
      let bp = -1; for (const p of game.pills) if (dH[p] < 999 && (bp < 0 || dH[p] < dH[bp])) bp = p;
      tgt = bp; S.mode = '알약 찾기';
    } else {
      S.mode = '어슬렁';
      if (S.patrol < 0 || S.patrol === head || dH[S.patrol] >= 999 || game.rng() < 0.02) { const c = m.floor.filter((i) => dH[i] < 999 && dH[i] >= 4); S.patrol = c.length ? c[Math.floor(game.rng() * c.length)] : head; }
      tgt = S.patrol;
    }
    S.prey = prey;
    const dT = bfsC(m, tgt, 3), body = new Set(S.body.slice(0, -1));
    let nx = -1, bd = Infinity;
    for (const c of (m.sNbrs[head] || [])) { if (body.has(c)) continue; const v = dT[c] + game.rng() * 0.1; if (v < bd) { bd = v; nx = c; } }
    if (nx < 0) { // 막다른 곳: 몸을 뒤집어 꼬리 쪽으로 빠져나감 (영원히 길을 막지 않게)
      if (new Set(S.body).size > 1) { S.body.reverse(); S.prevBody = S.body.slice(); game._sb = null; S.floor = floorOf(m, S.body[0]); }
      S.stall = (S.stall || 0) + 1; if (S.stall > 4) { S.ignoreUntil = game.turn + 30; S.patrol = -1; S.stall = 0; }
      return;
    }
    if (dT[nx] >= dT[head] && S.mode !== '어슬렁') { S.stall = (S.stall || 0) + 1; if (S.stall > 6) { S.ignoreUntil = game.turn + 30; S.patrol = -1; S.stall = 0; } } else S.stall = 0;
    S.body.unshift(nx); S.floor = floorOf(m, nx); if (S.grow > 0 && S.body.length < CFG.SNAKE_MAX) S.grow--; else { S.body.pop(); if (S.body.length >= CFG.SNAKE_MAX) S.grow = 0; }
    game._sb = null;
    const pi = game.pills.indexOf(nx);
    if (pi >= 0) {
      game.pills.splice(pi, 1); game.snakeAte.pills++;
      if (S.body.length < CFG.SNAKE_MAX) { S.grow += CFG.SNAKE_GROW_PILL; game.log('snake', `뷱이 알약을 먹고 길어졌다! 💊 (길이 ${S.body.length + 1})`); } else game.log('snake', `뷱이 알약을 먹었다 💊 (이미 최대 길이 ${CFG.SNAKE_MAX})`);
      game.fx.push({ t: 'pill', cell: nx, snake: S.id, turn: game.turn });
    }
    const gi = game.giantAt(nx); if (gi >= 0) game.eatGiant(S, gi);
  }

  // ---------- 거인 AI (팀) ----------
  // 감지: 투명망토면 눈에 안 보이고 뛸 때만 들림, 연막이면 눈이 가려지고 귀도 거의 안 들림, 기절하면 아무것도 못 함
  function giantDetects(game, k) {
    const m = game.map, R = game.runner, G = game.giants[k];
    if (G.stun > 0) return false;
    const fast = R.path.length > 2;
    const see = !R.cloak && !G.blind && giantSees(game, k, R.pos);
    const hear = bfsC(m, G.pos, 2)[R.pos] <= (G.blind ? 1 : giantHear(game.gg[k])) && (!R.cloak || fast);
    return see || hear;
  }
  function giantSense(game, k) {
    const m = game.map, R = game.runner, G = game.giants[k];
    if (G.out > 0) { G.saw = false; return; }
    if (G.track > 0 && G.stun <= 0) { G.track--; G.know = R.pos; G.knowTurn = game.turn; }
    const now = giantDetects(game, k);
    if (now) {
      if (!G.saw && game.turn - G.knowTurn > 3) game.log('spot', `거인${k + 1}이 도망자를 발견했다! 👀`);
      G.know = R.pos; G.knowTurn = game.turn;
    }
    G.saw = now;
  }
  function runnerObjective(game, from) {
    const m = game.map, all = game.hasAllKeys();
    const d = bfsC(m, from, all ? 0 : 1); let best = Infinity, t = m.exits[0];
    const goals = all ? m.exits : [];
    if (!all) for (const k of game.keysLeft) { const mi = m.keyMission[k]; if (game.ms[mi].done) goals.push(k); else goals.push(...missionGoals(game, mi, false)); }
    if (!goals.length && !all) goals.push(...game.keysLeft);
    for (const k of goals) if (d[k] < best) { best = d[k]; t = k; }
    return t;
  }
  function glareSpots(game) { const out = game.keysLeft.slice(); game.map.missions.forEach((M, mi) => { if (!game.ms[mi].done) out.push(...missionGoals(game, mi, true)); }); return out; }
  function nearKey(game, c) { for (const kk of glareSpots(game)) if (bfsC(game.map, kk, 2)[c] <= 2) return true; return false; }
  // 미션의 다음 목표 칸들 (all=true면 도망자 상태와 무관하게 남은 미션 칸 전부)
  function missionGoals(game, mi, all) {
    const M = game.map.missions[mi], S = game.ms[mi]; if (S.done) return [];
    if (M.type === 'switch') return M.levers.filter((_, i) => !S.lev[i]);
    if (M.type === 'carry') return all ? (S.gemTaken ? [M.pedestal] : [M.gem, M.pedestal]) : (!S.gemTaken ? [M.gem] : game.runner.gem === mi ? [M.pedestal] : []);
    return [M.plate];
  }
  function releaseDoor(game, k) { for (let i = 0; i < 2; i++) if (game.doorWatch[i] === k) game.doorWatch[i] = -1; }
  function giantMoves(game, k, from) {
    const m = game.map, G = game.giants[k];
    const sb = game.snakes.length ? game.snakeBody() : null;
    let list = m.gNbrs[from].filter((c) => game.giantAt(c) < 0 && !(sb && sb.has(c)) && !game.snakeAtHead(c)); // 동료·뷱 몸통이 있는 칸은 못 감
    if (G.doorBan > 0) {
      if (m.nearDoor[from]) { const out = list.filter((c) => !m.nearDoor[c]); return out.length ? out : list; }
      list = list.filter((c) => !m.nearDoor[c]);
    }
    if (G.keyBan > 0 && list.length) {
      if (nearKey(game, from)) { const out = list.filter((c) => !nearKey(game, c)); return out.length ? out : list; }
      const out = list.filter((c) => !nearKey(game, c)); if (out.length) list = out;
    }
    return list;
  }
  function crowd(game, k, c) {
    let s = 0; for (const H of game.giants) if (H.id !== k && H.out <= 0) s += Math.max(0, 5 - manhattan(game.map, c, H.pos));
    return s;
  }
  function pickMove(game, k, scoreFn) {
    const G = game.giants[k], g = game.gg[k];
    let best = Infinity, choice = G.pos;
    // 뷱 피하기 유전자: 같은 층의 뷱 머리 근처를 돌아감 (머리를 알아챌 수 있는 거리 안에서만)
    const r = Math.round((g.snakeSense ?? 0) * 4), heads = [];
    if (r > 0) for (const S of game.snakes) if (S.hidden <= 0) { const d = bfsC(game.map, S.body[0], 3); if (d[G.pos] <= r + 3) heads.push(d); }
    for (const c of giantMoves(game, k, G.pos)) {
      let v = scoreFn(c) + g.spread * 0.6 * crowd(game, k, c) + game.rng() * 0.01;
      for (const d of heads) if (d[c] <= r) v += (r - d[c] + 1) * 6;
      if (v < best) { best = v; choice = c; }
    }
    return choice;
  }
  // 벽 부수기 판단 (30초 쿨다운): 도망자 추격·마지막으로 안 위치·매복 길목까지 벽을 부숴 줄어드는 거리가 기준 이상이면 부숨
  function smashChoice(game, k) {
    const m = game.map, G = game.giants[k], g = game.gg[k];
    if (game.turn - G.smashTurn < 3) return null;
    // 목표: 방금 본/들은 도망자 위치, 아니면 추적 중인 흔적 위치
    let tgt = -1;
    if ((G.mode === '길목 차단' || G.mode === '추격') && G.goal >= 0 && m.g[G.goal] === 0) tgt = G.goal;
    else if (G.know >= 0 && (game.turn - G.knowTurn <= 2 || G.mode === '흔적 추적')) tgt = G.know;
    else if (G.mode === '매복' && G.ambushSpot >= 0) tgt = G.ambushSpot;   // 도망자가 노리는 열쇠·문 길목으로 가는 지름길
    if (tgt < 0) return null;
    const dT = bfsC(m, tgt, 2), cur = dT[G.pos];
    // 미로 거리 이득은 짝수(2,4,6…)라서 유전자 값을 2칸 단위 기준으로 바꿈: 높을수록 작은 지름길에도 사용
    const need = CFG.SMASH_GAIN_MIN + 2 * Math.round((1 - (g.smash ?? 0)) * (CFG.SMASH_GAIN_MAX - CFG.SMASH_GAIN_MIN) / 2);
    const tx = tgt % m.W - G.pos % m.W, ty = ((tgt / m.W) | 0) - ((G.pos / m.W) | 0);
    let best = null, bestGain = need - 1;
    const x = G.pos % m.W, y = (G.pos / m.W) | 0;
    for (const [dx, dy] of DIRS) {
      if (dx * tx + dy * ty <= 0) continue; // 목표 쪽 벽만
      // 한 번 휘두르면 같은 방향으로 벽 1~2칸까지 부숨 (두꺼운 벽도 뚫음)
      const cells = [];
      for (let depth = 1; depth <= 2; depth++) {
        const w = (y + dy * depth) * m.W + (x + dx * depth);
        if (!m.breakable[w] || m.g[w] === 0) break;
        cells.push(w);
        let after = 999;
        for (const [ex, ey] of DIRS) { const j = (y + dy * depth + ey) * m.W + (x + dx * depth + ex); if (j !== G.pos && m.g[j] === 0 && !m.isExit[j]) after = Math.min(after, dT[j]); }
        const gain = cur - (after + depth + 1) - (depth - 1); // 두 칸 부수기는 조금 더 큰 이득이 있어야 함
        if (gain > bestGain) { bestGain = gain; best = cells.slice(); }
      }
    }
    return best;
  }
  function giantDecide(game, k) {
    const m = game.map, R = game.runner, G = game.giants[k], g = game.gg[k];
    if (giantDetects(game, k)) { G.know = R.pos; G.knowTurn = game.turn; G.saw = true; }
    if (G.ambushSpot >= 0 && G.mode !== '매복') { releaseDoor(game, k); G.ambushSpot = -1; }
    if (G.knowTurn === game.turn) {
      releaseDoor(game, k); G.ambushSpot = -1;
      const tp = G.know, dT = bfsC(m, tp, 2);
      if (dT[G.pos] <= 3 || g.intercept < 0.05) { G.mode = '추격'; G.goal = tp; return pickMove(game, k, (c) => dT[c] * 3); }
      const obj = runnerObjective(game, tp), dObj = bfsC(m, obj, game.hasAllKeys() ? 0 : 1);
      const L = Math.round(g.lookahead * 12);
      let p = tp;
      for (let s = 0; s < L && p !== obj; s++) { let nb = p; for (const c of (m.lockedNbrs[p] || [])) if (dObj[c] < dObj[nb]) nb = c; p = nb; }
      const dP = bfsC(m, p, 2);
      G.mode = g.intercept > 0.5 ? '길목 차단' : '추격'; G.goal = p;
      return pickMove(game, k, (c) => (1 - g.intercept) * dT[c] + g.intercept * dP[c]);
    }
    const patienceTurns = 4 + Math.round(g.patience * 36);
    if (G.know >= 0 && game.turn - G.knowTurn <= patienceTurns && G.pos !== G.know) {
      G.mode = '흔적 추적'; G.goal = G.know; const d = bfsC(m, G.know, 2);
      return pickMove(game, k, (c) => d[c]);
    }
    if (G.pos === G.know) G.know = -1;
    const maxAge = Math.round(g.scent * 40);
    if (maxAge > 0) {
      let best = game.scent[G.pos], choice = -1;
      for (const c of giantMoves(game, k, G.pos)) if (game.scent[c] > best && game.turn - game.scent[c] <= maxAge) { best = game.scent[c]; choice = c; }
      if (choice >= 0) { if (G.mode !== '냄새 추적') game.log('scent', `거인${k + 1}이 도망자의 냄새를 맡았다! 👃`); G.mode = '냄새 추적'; G.goal = choice; return choice; }
    }
    if (G.mode === '냄새 추적') G.mode = '탐색';
    if (G.mode === '매복' && game.turn - G.modeSince > 20 + g.ambush * 60) { G.mode = '지루함'; releaseDoor(game, k); G.ambushSpot = -1; }
    if (G.mode !== '매복' && G.mode !== '순찰') {
      G.mode = (G.mode !== '지루함' && game.rng() < g.ambush) ? '매복' : '순찰'; G.modeSince = game.turn; G.patrol = -1; G.ambushSpot = -1;
      if (G.mode === '매복') game.log('ambush', `거인${k + 1}이 매복하러 간다… 🤫`);
    }
    if (G.mode === '순찰' && game.turn - G.modeSince > 40) G.mode = '탐색';
    if (G.mode === '매복') {
      if (G.ambushSpot < 0) {
        const from = G.know >= 0 ? G.know : m.runnerStart;
        const wantDoor = game.rng() < (game.hasAllKeys() ? 0.3 + 0.5 * g.exitGuard : 0.35 * g.exitGuard);
        if (wantDoor && G.doorBan <= 0) {
          const dF = bfsC(m, from, 0); const order = dF[m.exits[0]] <= dF[m.exits[1]] ? [0, 1] : [1, 0];
          for (const di of order) if (game.doorWatch[di] < 0) { game.doorWatch[di] = k; G.ambushSpot = m.guardSpot[di]; break; }
        }
        if (G.ambushSpot < 0 && G.keyBan <= 0 && game.rng() < (g.guard ?? 0.3)) { // 미션 장소·계단 지키기
          const taken = game.giants.filter((H) => H.id !== k).map((H) => H.ambushSpot);
          const opts = []; m.missions.forEach((M, mi) => opts.push(...missionGoals(game, mi, true)));
          for (const [a, b] of m.stairs) opts.push(a, b);
          const o2 = opts.filter((c) => !taken.includes(c));
          if (o2.length) { G.ambushSpot = o2[Math.floor(game.rng() * o2.length)]; game.log('ambush', `거인${k + 1}이 ${m.stairOf[G.ambushSpot] >= 0 ? '계단' : '미션 장소'}을 지키러 간다… 🛡️`); }
        }
        if (G.ambushSpot < 0) { // 열쇠 지키기: 동료가 안 지키는 열쇠
          const taken = game.giants.filter((H) => H.id !== k).map((H) => H.ambushSpot);
          const opts = game.keysLeft.filter((kk) => !taken.includes(kk));
          if (G.keyBan > 0) opts.length = 0;
          G.ambushSpot = opts.length ? opts[Math.floor(game.rng() * opts.length)] : (G.keyBan > 0 && !game.hasAllKeys() ? -1 : runnerObjective(game, from));
        }
        if (G.ambushSpot < 0) { G.mode = '순찰'; G.modeSince = game.turn; }
      }
      if (G.ambushSpot >= 0) {
        const spot = G.ambushSpot; G.goal = spot;
        const dS = bfsC(m, spot, 2);
        if (dS[G.pos] <= 2) { const opts = giantMoves(game, k, G.pos).filter((c) => dS[c] <= 2); return opts.length && game.rng() < 0.5 ? opts[Math.floor(game.rng() * opts.length)] : G.pos; }
        return pickMove(game, k, (c) => dS[c]);
      }
    }
    // 거인용 아이템이 가까이 떨어져 있으면 주우러 감
    {
      const dG = bfsC(m, G.pos, 2); let tgt = -1, bd = 999, label = '';
      const ireach = Math.round(3 + 12 * Math.max(g.roar ?? 0, g.tracker ?? 0, g.blockade ?? 0));
      for (const it of game.items) if (it.side === 'G' && G.inv[it.type] === 0 && dG[it.cell] <= ireach && dG[it.cell] < bd) { bd = dG[it.cell]; tgt = it.cell; label = '아이템 줍기'; }
      if (tgt >= 0 && !game.giants.some((H) => H.id !== k && H.goal === tgt && H.mode === '아이템 줍기' && bfsC(m, H.pos, 2)[tgt] < bd)) {
        G.mode = label; G.goal = tgt; const d = bfsC(m, tgt, 2); return pickMove(game, k, (c) => d[c]);
      }
    }
    if (G.mode === '아이템 줍기') G.mode = '탐색';
    if (G.patrol < 0 || G.patrol === G.pos || game.rng() < 0.02) {
      let bestT = -1, bestS = -Infinity;
      const tries = game.rng() < g.spread ? 4 : 1;
      for (let t = 0; t < tries; t++) {
        let c; do c = m.floor[Math.floor(game.rng() * m.floor.length)]; while (m.isExit[c] || m.nearDoor[c]);
        const s = Math.min(...game.giants.filter((H) => H.id !== k).map((H) => manhattan(m, c, H.pos)), 99);
        if (s > bestS) { bestS = s; bestT = c; }
      }
      G.patrol = bestT;
    }
    G.goal = G.patrol; const d = bfsC(m, G.patrol, 2);
    return pickMove(game, k, (c) => d[c]);
  }

  // ---------- 공진화 트레이너 (도망자 vs 거인팀) ----------
  function mutate(genes, sigma, rng) { const o = {}; for (const k in genes) o[k] = clamp01(genes[k] + gauss(rng) * sigma); return o; }
  const mutateTeam = (team, sigma, rng) => team.map((g) => mutate(g, sigma, rng));

  class Trainer {
    constructor(seed) { this.rng = mulberry32((seed || Date.now()) >>> 0); this.reset(); }
    reset() {
      this.generation = 0; this.rounds = 0; this.lastRate = 0.5;
      this.runner = { genes: defaultRunner(), level: 1, sigma: 0.12 };
      this.giant = { team: defaultGiantTeam(), level: 1, sigma: 0.12, catches: new Array(CFG.GIANTS).fill(0) };
      this.history = []; this.trainWins = { runner: 0, giant: 0, draw: 0 };
      this.growWins = 0; // 화면에 보이는 경기에서 도망자가 이긴 횟수 (WINS_PER_GIANT승마다 거인 +1, 최대 GIANTS_MAX)
    }
    get giantCount() { return this.giant.team.length; }
    winsToNextGiant() { return this.giantCount >= CFG.GIANTS_MAX ? -1 : CFG.WINS_PER_GIANT - (this.growWins % CFG.WINS_PER_GIANT); }
    // 화면 경기 결과 기록: 도망자 승이 쌓이면 거인 추가. 반환: 새로 추가된 거인 번호 목록
    recordVisible(result, catcher) {
      const c = this.giant.catches || (this.giant.catches = new Array(this.giantCount).fill(0));
      if (result === 'giant' && catcher >= 0 && catcher < this.giantCount) c[catcher] = (c[catcher] || 0) + 1;
      if (result !== 'runner') return [];
      this.growWins++;
      const added = [];
      while (this.giantCount < giantsForWins(this.growWins)) added.push(this.addGiant());
      return added;
    }
    // 새 거인: 가장 많이 잡은 거인(동점이면 앞 번호)의 유전자를 복제해 변이
    addGiant() {
      const T = this.giant.team, c = this.giant.catches || []; let bi = 0;
      for (let i = 1; i < T.length; i++) if ((c[i] || 0) > (c[bi] || 0)) bi = i;
      T.push(mutate(T[bi], 0.12, this.rng)); c[T.length - 1] = 0; this.giant.catches = c;
      return T.length - 1;
    }
    trainGeneration(mapsPerGen) {
      const k = mapsPerGen || CFG.MAPS_PER_GEN, rng = this.rng, prev = this.lastRate;
      this.runner.sigma = prev < 0.42 ? 0.2 : prev > 0.58 ? 0.07 : 0.12;
      this.giant.sigma = prev > 0.58 ? 0.18 : prev < 0.42 ? 0.06 : 0.1;
      const nR = prev < 0.45 ? 2 : 1, nG = prev > 0.55 ? 2 : 1;
      const R0 = this.runner.genes, G0 = this.giant.team;
      const Rs = [R0], Gs = [G0];
      for (let i = 0; i < nR; i++) Rs.push(mutate(R0, this.runner.sigma, rng));
      for (let i = 0; i < nG; i++) Gs.push(mutateTeam(G0, this.giant.sigma, rng));
      const rScore = Rs.map(() => 0), gScore = Gs.map(() => 0);
      let rw = 0, gw = 0, dw = 0, n = 0;
      for (let mi = 0; mi < k; mi++) {
        const seed = (rng() * 2 ** 32) >>> 0, map = generateMap(seed);
        for (let a = 0; a < Rs.length; a++) for (let b = 0; b < Gs.length; b++) {
          const game = new Game(map, Rs[a], Gs[b], seed + a * 7 + b * 13);
          const res = game.run(); n++;
          const prog = (map.keys.length - game.keysLeft.length + 0.5 * game.ms.filter((x) => x.done).length) / (map.keys.length * 1.5 + 1);
          if (res === 'runner') { rw++; rScore[a] += 1; }
          else if (res === 'giant') { gw++; rScore[a] += 0.15 * prog; if (game.catcher >= 0 && b === 0) { const c = this.giant.catches || (this.giant.catches = []); c[game.catcher] = (c[game.catcher] || 0) + 1; } gScore[b] += 1 - 0.3 * game.turn / CFG.MAX_TURNS; }
          else { dw++; rScore[a] += 0.1 * prog; gScore[b] += 0.4; }
        }
      }
      this.rounds += n; this.generation++;
      this.trainWins.runner += rw; this.trainWins.giant += gw; this.trainWins.draw += dw;
      this.lastRate = (rw + dw * 0.5) / n;
      const changes = [], self = this;
      function best(list, sc) {
        let bi = 0; for (let i = 1; i < list.length; i++) if (sc[i] > sc[bi]) bi = i;
        if (bi === 0) for (let i = 1; i < list.length; i++) if (sc[i] === sc[0] && rng() < 0.3) { bi = i; break; }
        return bi;
      }
      const ri = best(Rs, rScore);
      if (ri > 0) {
        for (const d of RUNNER_GENES) { const delta = Rs[ri][d.key] - R0[d.key]; if (Math.abs(delta) >= 0.08) changes.push({ side: 'runner', gi: -1, key: d.key, label: d.label, delta, text: delta > 0 ? d.up : d.down }); }
        if (rScore[ri] > rScore[0]) this.runner.level++;
        this.runner.genes = Rs[ri];
      }
      const gi = best(Gs, gScore);
      if (gi > 0) {
        Gs[gi].forEach((gg, j) => { for (const d of GIANT_GENES) { const delta = gg[d.key] - G0[j][d.key]; if (Math.abs(delta) >= 0.1) changes.push({ side: 'giant', gi: j, key: d.key, label: `거인${j + 1} ${d.label}`, delta, text: (delta > 0 ? d.up : d.down).replace(/^거인이/, `거인${j + 1}이`) }); } });
        if (gScore[gi] > gScore[0]) this.giant.level++;
        this.giant.team = Gs[gi];
      }
      const rec = { gen: this.generation, runner: rw / n, giant: gw / n, draw: dw / n, n };
      this.history.push(rec); if (this.history.length > 2000) this.history.shift();
      return { rec, changes, n, rAcc: ri > 0, gAcc: gi > 0 };
    }
    toJSON() { return { v: 7, growWins: this.growWins, lastRate: this.lastRate, generation: this.generation, rounds: this.rounds, runner: this.runner, giant: this.giant, history: this.history, trainWins: this.trainWins }; }
    load(o) {
      if (!o || o.v !== 7 || !o.giant || !Array.isArray(o.giant.team) || o.giant.team.length < CFG.GIANTS || o.giant.team.length > CFG.GIANTS_MAX) return false;
      this.growWins = o.growWins || 0;
      Object.assign(this, { lastRate: o.lastRate ?? 0.5, generation: o.generation, rounds: o.rounds, runner: o.runner, giant: o.giant, history: o.history || [], trainWins: o.trainWins || { runner: 0, giant: 0, draw: 0 } });
      // 예전 저장(새 유전자 없음): 빠진 유전자는 기본값으로 채움 (진화한 값은 그대로)
      if (this.runner && this.runner.genes) this.runner.genes = Object.assign(defaultRunner(), this.runner.genes);
      return true;
    }
  }

  return { CFG, floorOf, missionGoals, R_ITEMS, R_SPAWN, vaultMoves, G_ITEMS, ITEM_INFO, visibleCell, updateSeen, cloneMap, finalizeGraphs, smashChoice, giantSkip, giantsForWins, secTurns, giantHear, mulberry32, generateMap, bfs, bfsC, Game, Trainer, RUNNER_GENES, GIANT_GENES, defaultRunner, defaultGiantTeam, roleOf, mutate, sees, giantSees, lineOfSight };
});
