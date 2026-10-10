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
    MAX_TURNS: 2000,         // v23: 1100→2000 (출구가 다 막혀도 버틸 시간). 시간이 다 되면 무승부
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
    SNAKES: 1, SNAKES_PER_FLOOR: 1, SNAKE_LEN: 4, SNAKE_MAX: 18, SNAKE_GROW_GIANT: 2, SNAKE_GROW_PILL: 1, SNAKE_SENSE: 1, SNAKE_SKIP: 0, SNAKE_PREFER_GIANT: 2,
    SNAKE_DIGEST_SEC: 3,     // v21: 5→3, 뷱에게 먹힌 거인은 3초(30턴) 뒤 출발점에서 부활
    SNAKE_HIDE: 40, SNAKE_REST: 20,  // v21: 뷱은 매 턴 이동(빨라짐), 먹은 뒤 20턴 소화
    // v19: 뷱도 학습하는 세 번째 편. 한 판에 거인을 SNAKE_WIN_EATS마리 먹으면 뷱 승리 (도망자·거인 모두 패배)
    SNAKE_WIN_EATS: 20,      // v21: 12→20 (한 판 기준). 뷱은 더 빨라졌지만 뷱 승리는 여전히 드묾
    SNAKE_SENSE_MAX: 6,      // '사냥 감각' 유전자 1.0일 때 거인을 알아채는 미로 거리 (기본 1 + 6)
    SNAKE_REST_PER_EAT: 6,  // v20: 배가 부를수록 소화가 느림 — 먹은 거인 1마리마다 소화 휴식 +6턴 (막판 몰아 먹기 방지)
    SNAKE_LUNGE_CD: 30, SNAKE_LUNGE_MAX: 3,  // 달려들기: 가까운 거인에게 한 턴에 2칸, 쿨다운 30턴
    SNAKE_SPAWN_SAFE: 4,     // 뷱 머리가 출발점에서 이 거리 안이면 거인은 다른 출발점에서 부활 (출발점 무한 사냥 방지)
    SNAKE_STUN_SEC: 3,       // 도망자 샷건에 맞은 뷱은 3초 기절 (못 움직이고 못 먹음)
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
    // v21: 지하 1층(B1) — 지상 한 층보다 2.4배 넓은 미로. 지상 1층 해치 몇 곳으로 내려감. 전설의 무기 1개 + 2×2 공룡
    B1: true, B1_H: 51, HATCHES: 3,
    B1_LOOP: 0.12, B1_ROOMS: 6,   // v23: 지하 미로 — 고리 길 비율, 넓은 방(5×5) 수
    // v23 공룡: 속도(칸/턴) — 어슬렁 0.25(아주 느림), 냄새 추적 0.45, 보이는 먹잇감 쫓기 0.6, 돌격 1.25 (도망자 1, 전력질주 2)
    DINO_SPEED: 0.25, DINO_SNIFF_SPEED: 0.45, DINO_TRACK_SPEED: 0.6, DINO_CHARGE_SPEED: 1.25,
    DINO_CHARGE_TURNS: 12, DINO_CHARGE_CD: 45,   // 돌격: 12턴, 다시 돌격까지 45턴
    DINO_SIGHT: 4, DINO_CONE: 0.75,   // 시야: 4칸, 앞쪽 약 ±40° 부채꼴
    DINO_SMELL: 6, DINO_SMELL_AGE: 220,   // 냄새는 아주 잘 맡음: 주변 6칸 안, 22초(220턴) 안에 지나간 옅은 발자국까지
    DINO_HEAR: 12, DINOS: 2,   // v23: 공룡 2마리
    DINO_FEEL: 6, DINO_MEMORY: 50,   // 기억력 나쁨: 50턴 지나면 어디 갔었는지 잊음
    DINO_LOSE_P: 0.03, DINO_NOSE_OFF: 15, DINO_PAUSE_P: 0.12, DINO_WRONG_P: 0.08, DINO_TURN_P: 0.5,   // 멍청함: 냄새 놓침(그 뒤 25턴 코 막힘)·멈춰 킁킁·엉뚱한 방향·느린 회전   // 지도를 모르는 공룡이 더듬어 찾는 길 (주변 6걸음)
    DINO_KO_SEC: 10,         // 공룡에게 물린 거인은 10초 뒤 출발점에서 부활
    SLAYER_AMMO: 1, SLAYER_RANGE: 5, SLAYER_CD: 15, SLAYER_LINE: false, HUNT_FLEE: 0.5,   // v24 거인 퇴치 번개창: 무한 사용(한 번 쓰면 1.5초 쿨타임), 같은 줄 5칸 안. 맞은 거인은 이번 판 동안 사라짐 · 거인을 모두 처치하면 도망자 승리
    B1_STAY_MIN: 40, B1_STAY_GENE: 50,   // 도망자가 한 판에 지하에 머무는 시간(턴) = MIN + '지하 탐험' × GENE
    WEAPON_FAR: 0.8,         // 무기는 해치에서 가장 먼 곳의 80% 이상 거리 어딘가 (판마다 무작위)
    WEAPON_SEE: 3,           // 어두운 지하라 무기는 3칸 안(시야 안)까지 다가가야 눈에 띔 — 한 번 보면 기억
    // v22 바위: 거인만 밀 수 있음(한 번에 1칸, 소코반). 지하 2개 + 지상 1층 문 근처 1개. 해치·문 앞을 막아 탈출을 방해
    BOULDERS_B1: 4, BOULDER_SURF: 0, HATCH_NOISE: 12,  // v24: 바위는 모두 지하에서 시작 — 문을 막으려면 거인이 지하에서 들고 올라와야 함
    ROCK_SEE: 3, ROCK_SEEK_P: 0.6,  // v24: 거인은 지하 바위를 3칸 안(시야)에서 봐야 앎 — 한 번 보면 거인팀이 공유
    CARRY_SLOW: 3, CARRY_MAX: 70, CARRY_GENE: 60, CARRY_TURNS: 500,  // v24 바위 나르기: 3턴에 1칸(아주 느림), 거리 한도 70+문막기×60, 500턴 넘으면 포기
    BOULDER_DOOR_MIN: 4, BOULDER_DOOR_MAX: 26, BOULDER_DOOR_PUSH_MIN: 20,  // 문 바위: 문 앞에서 4~16칸, 문 앞까지 최소 12번은 밀어야 하는 곳
    BOULDER_PUSH_TURNS: 3,   // 바위 한 칸 밀기에 드는 턴  // 도망자가 해치로 내려가면 12칸 안의 거인이 소리를 들음
    BOULDER_RESET_SEC: 12,   // 해치·계단을 막은 바위는 12초 뒤 제자리로 굴러감. 문 앞 바위는 그 판 내내 그대로 (다른 문은 언제나 열려 있음)
    BOULDER_MAX_PUSH: 22,    // 한 번 계획에 최대 22번 밀기
    BOULDER_PLAN_EVERY: 4, BOULDER_PLAN_TURNS: 140, BOULDER_CD: 40,
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
    const sOk = (j) => !map.isExit[j] && !(map.nearDoor && map.nearDoor[j]) && !(map.lvl && map.lvl[j] === map.B1); // v21: 뷱은 지하에 못 감
    for (const i of map.floor) map.sNbrs[i] = sOk(i) ? map.lockedNbrs[i].filter((j) => sOk(j)) : [];
    map.graphs = [map.nbrs, map.lockedNbrs, map.gNbrs, map.sNbrs];
  }
  // 벽을 부수면 그 판의 맵만 복사해서 바꿈 (훈련에서 같은 맵을 여러 판이 공유하므로)
  function cloneMap(m) { const c = Object.assign({}, m); c.g = new Uint8Array(m.g); c.breakable = new Uint8Array(m.breakable); c.pristine = false; finalizeGraphs(c); return c; }
  const floorOf = (map, i) => (map.lvl ? map.lvl[i] : map.FH ? Math.floor(((i / map.W) | 0) / map.FH) : 0); // v21: 0=1층, 1=2층, 2=지하 1층(B1)
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
    const W = CFG.W, FH = CFG.H, F = Math.max(1, CFG.FLOORS || 1), BH = CFG.B1 ? CFG.B1_H : 0, H = FH * F + BH;
    const g = new Uint8Array(W * H).fill(1);
    for (let f = 0; f < F; f++) g.set(genFloor(rng, W, FH), f * W * FH);
    const idx = (x, y) => y * W + x;
    const map = { W, H, FH, floors: F, g, seed, stairOf: new Int32Array(W * H).fill(-1), stairs: [], hatches: [], B1: -1 };
    // v21: 층(레벨) 정보 — 격자에서 시작 행, 높이, 정렬 오프셋(지하는 지상 1층 아래 가운데에 오도록), 칸마다 레벨·정렬 y·바깥 테두리
    map.levels = []; for (let f = 0; f < F; f++) map.levels.push({ row0: f * FH, h: FH, zOff: 0, lz: f });
    if (BH) { map.B1 = F; map.levels.push({ row0: F * FH, h: BH, zOff: (BH - FH) / 2, lz: -1 }); }
    map.lvl = new Uint8Array(W * H); map.ay = new Int16Array(W * H); map.border = new Uint8Array(W * H);
    map.levels.forEach((L, f) => { for (let yy = 0; yy < L.h; yy++) for (let x = 0; x < W; x++) { const i = (L.row0 + yy) * W + x; map.lvl[i] = f; map.ay[i] = yy - L.zOff; if (x === 0 || x === W - 1 || yy === 0 || yy === L.h - 1) map.border[i] = 1; } });
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
    for (let y = 0; y < FH * F; y++) for (let x = 1; x < W - 1; x++) { // 지하 벽은 못 부숨
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
    map.surfFloor = map.floor.slice(); map.b1Floor = [];
    if (BH) buildB1(map, seed, used);
    placeBoulders(map, seed, used);
    return map;
  }
  // ---------- v22 바위 ----------
  // 소코반 길찾기: 바위를 s에서 t까지 미는 바위 칸 순서 (미는 거인은 반대편 칸에 서야 하고, 방향을 바꾸려면 바위를 돌아 그 자리까지 걸어갈 수 있어야 함)
  // dG: 거인 위치에서의 거리(첫 밀기 자리까지 갈 수 있는지), null이면 검사 안 함
  function boulderPlan(m, s, t, okCell, maxP, dG) {
    const W = m.W, N = W * m.H, lv = floorOf(m, s), D4 = [1, -1, W, -W];
    const same = (c) => c >= 0 && c < N && floorOf(m, c) === lv;
    const walk = (c) => c === s || (same(c) && m.g[c] === 0 && !m.isExit[c]);
    const put = (c) => c === s || (same(c) && m.g[c] === 0 && !m.isExit[c] && okCell(c) && (c === t || (m.stairOf[c] < 0 && !(m.doorFront && m.doorFront.includes(c))))); // 해치·계단·문 앞은 목표일 때만
    const reach = (a, b, block) => {
      if (a === b) return true; const seen = new Map([[a, 0]]), q = [a];
      for (let h = 0; h < q.length; h++) { const c = q[h], dc = seen.get(c); if (dc >= 14) continue; for (const d of D4) { const n = c + d; if (n === block || seen.has(n) || !walk(n)) continue; if (n === b) return true; seen.set(n, dc + 1); q.push(n); } }
      return false;
    };
    const start = s * 5 + 4, prev = new Map([[start, -1]]), dist = new Map([[start, 0]]), q = [start];
    for (let h = 0; h < q.length; h++) {
      const st = q[h], c = (st / 5) | 0, pd = st % 5, dc = dist.get(st);
      if (c === t) { const out = []; for (let x = st; x >= 0; x = prev.get(x)) out.push((x / 5) | 0); return out.reverse(); }
      if (dc >= maxP) continue;
      for (let di = 0; di < 4; di++) {
        const d = D4[di], n = c + d, from = c - d;
        if (!put(n) || !walk(from)) continue;
        if (pd === 4) { if (dG && !(dG[from] < 999)) continue; }
        else if (di !== pd && !reach(c - D4[pd], from, c)) continue;
        const ns = n * 5 + di; if (prev.has(ns)) continue;
        prev.set(ns, st); dist.set(ns, dc + 1); q.push(ns);
      }
    }
    return null;
  }
  // 맵 생성 때 바위 자리: 지상 1층 문 근처 1개(문 앞까지 밀 수 있는 곳) + 지하 2개(해치까지 밀 수 있는 곳)
  function placeBoulders(map, seed, used) {
    const rng = mulberry32((seed ^ 0xB0D1E5) >>> 0), W = map.W, g = map.g;
    map.boulders = []; map.doorFront = map.exits.map((e) => (map.nbrs[e] || []).find((n) => !map.isExit[n]) ?? -1);
    const avoid = new Set([map.runnerStart, ...map.giantStarts, ...map.keys, ...(map.snakeStarts || []), ...used]);
    const okCell = (c) => !map.isMission[c] && !avoid.has(c);
    const okHome = (c, near) => g[c] === 0 && !map.isExit[c] && !map.isMission[c] && map.stairOf[c] < 0 && !avoid.has(c) && !map.nearDoor[c] && !map.boulders.some((b) => manhattan(map, b.home, c) < (near ? 4 : 8));
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const tryPlace = (cand, targets, n, near, minLen) => {
      let tries = 0;
      if (minLen) { // 문 바위: 밀어야 하는 횟수가 minLen 이상인 자리, 없으면 찾은 것 중 가장 먼 자리
        let best = -1, bl = -1;
        for (const c of shuffle(cand)) {
          if (++tries > 250) break; if (!okHome(c, near)) continue;
          const p = boulderPlan(map, c, targets[0], okCell, CFG.BOULDER_MAX_PUSH, null); if (!p) continue;
          if (p.length - 1 > bl) { bl = p.length - 1; best = c; } if (bl >= minLen) break;
        }
        if (best >= 0) map.boulders.push({ home: best, push: bl });
        return;
      }
      for (const c of shuffle(cand)) {
        if (map.boulders.length >= n || ++tries > (minLen ? 250 : 80)) break;
        if (!okHome(c, near)) continue;
        if (targets.some((t) => { const p = boulderPlan(map, c, t, okCell, CFG.BOULDER_MAX_PUSH, null); return p && p.length - 1 >= (minLen || 0); })) { map.boulders.push({ home: c }); }
      }
    };
    // v23: 문마다 바위 1개 (그 문 앞까지 밀 수 있는 자리). 문 바위끼리는 4칸 이상 떨어짐
    const dfs = map.doorFront.filter((c) => c >= 0);
    for (let i = 0; i < Math.min(CFG.BOULDER_SURF, dfs.length); i++) {
      const df = dfs[i];
      tryPlace(map.surfFloor.filter((c) => floorOf(map, c) === 0 && map.boulders.every((b) => manhattan(map, b.home, c) >= 4) && !dfs.some((o) => manhattan(map, o, c) < CFG.BOULDER_DOOR_MIN) && (() => { const d = manhattan(map, c, df); return d >= CFG.BOULDER_DOOR_MIN && d <= CFG.BOULDER_DOOR_MAX; })()), [df], map.boulders.length + 1, true, CFG.BOULDER_DOOR_PUSH_MIN);
    }
    if (map.B1 >= 0 && map.hatches.length && CFG.BOULDERS_B1 > 0) {
      const hb = map.hatches.map(([, b]) => b), n0 = map.boulders.length;
      // v24: 판마다 어두운 지하 미로 아무 곳(해치에서 4칸 이상, 서로 8칸 이상)에 숨어 있음 — 거인도 직접 찾아야 함
      for (const c of shuffle(map.b1Floor.filter((c) => Math.min(...hb.map((b) => manhattan(map, c, b))) >= 4))) {
        if (map.boulders.length >= n0 + CFG.BOULDERS_B1) break;
        if (!okHome(c, false) || (map.nbrs[c] || []).filter((n) => g[n] === 0).length < 2) continue;
        map.boulders.push({ home: c });
      }
    }
    if (!map.boulders.length) return;
    for (const b of map.boulders) g[b.home] = 3;
    finalizeGraphs(map);
    const bs = new Set(map.boulders.map((b) => b.home));
    map.itemSpots = map.itemSpots.filter((c) => !bs.has(c));
    if (map.weaponCands) map.weaponCands = map.weaponCands.filter((c) => !bs.has(c));
  }
  // 바위를 from→to로 옮긴 뒤에도 도망자가 출구(둘 중 하나)·남은 열쇠·미션 장소에 갈 길이 있나 (거인은 무시) — 길을 완전히 막는 밀기는 금지
  // v23: 문 앞 바위는 예외 (문은 둘 다 막아도 됨) — 문 앞 칸은 막혀 있어도 지나갈 수 있는 것으로 보고 검사
  function escapeOk(game, from, to) {
    const m = game.map, W = m.W, N = W * m.H, df = m.doorFront || [];
    const pass = (c) => df.includes(c) || (c !== to && (c === from || m.g[c] === 0));
    const seen = new Uint8Array(N), q = [game.runner.pos]; seen[game.runner.pos] = 1;
    for (let h = 0; h < q.length; h++) { const c = q[h]; for (const n of [c + 1, c - 1, c + W, c - W, m.stairOf[c]]) if (n >= 0 && n < N && !seen[n] && pass(n)) { seen[n] = 1; q.push(n); } }
    if (!m.exits.some((e) => seen[e])) return false;
    if (!game.keysLeft.every((kk) => seen[kk])) return false;
    for (let mi = 0; mi < m.missions.length; mi++) if (!missionGoals(game, mi, true).every((c) => seen[c])) return false;
    return true;
  }
  // v21: 지하 1층 — 넓은 미로 + 공룡용 2칸 너비 큰 복도 + 지상 1층과 이어지는 해치 + 무기 후보 + 공룡 길 그래프
  function buildB1(map, seed, used) {
    const rng = mulberry32((seed ^ 0xB1D1A0) >>> 0), W = map.W, L = map.levels[map.B1], BH = L.h, r0 = L.row0, g = map.g;
    // v23: 공룡이 어디든 다닐 수 있게 — 모든 길이 2칸 너비인 큰 미로 (2×2 방 + 1칸 벽, 간격 3). 고리 길과 넓은 방 몇 개
    g.fill(1, r0 * W, (r0 + BH) * W);
    const open = (x, yy) => { if (x > 0 && x < W - 1 && yy > 0 && yy < BH - 1) g[(r0 + yy) * W + x] = 0; };
    const CW = Math.floor((W - 1) / 3), CH = Math.floor((BH - 1) / 3);
    const room = (cx, cy) => { for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) open(1 + cx * 3 + dx, 1 + cy * 3 + dy); };
    const link = (cx, cy, dx, dy) => { // 이웃 방 사이 벽(2칸)을 엶
      if (dx) { const x = 1 + Math.min(cx, cx + dx) * 3 + 2; for (let k = 0; k < 2; k++) open(x, 1 + cy * 3 + k); }
      else { const yy = 1 + Math.min(cy, cy + dy) * 3 + 2; for (let k = 0; k < 2; k++) open(1 + cx * 3 + k, yy); }
    };
    const vis = new Uint8Array(CW * CH), st = [[Math.floor(rng() * CW), Math.floor(rng() * CH)]]; vis[st[0][1] * CW + st[0][0]] = 1; room(st[0][0], st[0][1]);
    while (st.length) {
      const [cx, cy] = st[st.length - 1], nb = [];
      for (const [dx, dy] of DIRS) { const nx = cx + dx, ny = cy + dy; if (nx >= 0 && ny >= 0 && nx < CW && ny < CH && !vis[ny * CW + nx]) nb.push([dx, dy]); }
      if (!nb.length) { st.pop(); continue; }
      const [dx, dy] = nb[Math.floor(rng() * nb.length)]; vis[(cy + dy) * CW + cx + dx] = 1; room(cx + dx, cy + dy); link(cx, cy, dx, dy); st.push([cx + dx, cy + dy]);
    }
    for (let cy = 0; cy < CH; cy++) for (let cx = 0; cx < CW; cx++) { // 고리 길
      if (cx < CW - 1 && rng() < CFG.B1_LOOP) link(cx, cy, 1, 0);
      if (cy < CH - 1 && rng() < CFG.B1_LOOP) link(cx, cy, 0, 1);
    }
    for (let r = 0; r < CFG.B1_ROOMS; r++) { // 넓은 방: 2×2 방 4개 + 가운데 기둥까지 엶 (5×5)
      const cx = Math.floor(rng() * (CW - 1)), cy = Math.floor(rng() * (CH - 1));
      link(cx, cy, 1, 0); link(cx, cy + 1, 1, 0); link(cx, cy, 0, 1); link(cx + 1, cy, 0, 1); open(1 + cx * 3 + 2, 1 + cy * 3 + 2);
    }
    // 해치: 지상 1층의 빈 칸 ↔ 바로 아래(정렬 위치) 지하 칸. 서로 멀리, 출발점·열쇠·미션·문 근처 피함
    const below = (i) => (r0 + ((i / W) | 0) + L.zOff) * W + (i % W);
    const cand = map.surfFloor.filter((i) => floorOf(map, i) === 0 && map.stairOf[i] < 0 && !map.isExit[i] && !map.nearDoor[i] && !used.has(i) && !map.isMission[i] && manhattan(map, i, map.runnerStart) >= 6 && g[below(i)] === 0); // v23: 아래가 지하 길인 곳만 (구멍을 따로 안 뚫음)
    for (let k = 0; k < CFG.HATCHES && cand.length; k++) {
      let c = cand.filter((a) => map.hatches.every(([h]) => manhattan(map, h, a) >= 10));
      if (!c.length) c = cand.filter((a) => map.hatches.every(([h]) => h !== a));
      const a = c[Math.floor(rng() * c.length)], x = a % W, yy = ((a / W) | 0) + L.zOff;
      const b = (r0 + yy) * W + x; map.stairOf[a] = b; map.stairOf[b] = a; map.hatches.push([a, b]); used.add(a);
    }
    map.itemSpots = map.itemSpots.filter((i) => map.stairOf[i] < 0);
    finalizeGraphs(map);
    map.surfFloor = map.floor.filter((i) => map.lvl[i] !== map.B1); map.b1Floor = map.floor.filter((i) => map.lvl[i] === map.B1);
    // 공룡 길: 2×2 칸(왼쪽 위 기준)이 모두 지하 빈 칸이고 해치가 아닌 곳. 큰 복도와 이어진 덩어리만
    // v23: 해치 위도 지나감 (모든 길이 2칸이라 해치를 피하면 막힘)
    const okD = (p) => { if (p % W >= W - 1) return false; for (const c of [p, p + 1, p + W, p + W + 1]) if (c >= g.length || g[c] !== 0 || map.lvl[c] !== map.B1) return false; return true; };
    const N = W * map.H, ok = new Uint8Array(N); for (const i of map.b1Floor) if (okD(i)) ok[i] = 1;
    const p0 = map.b1Floor.find((i) => ok[i]) ?? -1;
    map.dOk = new Uint8Array(N); map.dPos = []; map.dNbrs = new Array(N);
    if (p0 >= 0) { const q = [p0]; map.dOk[p0] = 1; for (let h = 0; h < q.length; h++) { const c = q[h]; for (const n of [c + 1, c - 1, c + W, c - W]) if (n >= 0 && n < N && ok[n] && !map.dOk[n]) { map.dOk[n] = 1; q.push(n); } } map.dPos = q; }
    for (const p of map.dPos) map.dNbrs[p] = [p + 1, p - 1, p + W, p - W].filter((n) => n >= 0 && n < N && map.dOk[n]);
    map._dbfs = new Map();
    // 해치에서의 거리 → 무기 후보(아주 먼 곳)·공룡 출발점(해치에서 떨어진 곳)
    const dH = new Int16Array(N).fill(999), q = []; for (const [, b] of map.hatches) { dH[b] = 0; q.push(b); }
    for (let h = 0; h < q.length; h++) { const c = q[h]; for (const n of map.nbrs[c]) if (map.lvl[n] === map.B1 && dH[n] === 999) { dH[n] = dH[c] + 1; q.push(n); } }
    let maxH = 0; for (const i of map.b1Floor) if (dH[i] < 999 && dH[i] > maxH) maxH = dH[i];
    map.weaponCands = map.b1Floor.filter((i) => dH[i] < 999 && dH[i] >= maxH * CFG.WEAPON_FAR && map.stairOf[i] < 0);
    map.dinoStarts = map.dPos.filter((p) => dH[p] >= 14 && dH[p] < 999);
    if (!map.dinoStarts.length) map.dinoStarts = map.dPos.slice();
    map.b1MaxDist = maxH;
  }
  // 공룡 길찾기: anchors(공룡 왼쪽 위 자리들)까지의 거리 (공룡 그래프, 맵마다 캐시)
  function dinoField(m, anchors) {
    const key = anchors.join(','); let d = m._dbfs.get(key); if (d) return d;
    d = new Int16Array(m.W * m.H).fill(999); const q = anchors.slice(); for (const a of anchors) d[a] = 0;
    for (let h = 0; h < q.length; h++) { const c = q[h]; for (const n of m.dNbrs[c]) if (d[n] === 999) { d[n] = d[c] + 1; q.push(n); } }
    if (m._dbfs.size > 4000) m._dbfs.clear();
    m._dbfs.set(key, d); return d;
  }
  // 칸 t를 덮는 공룡 자리들 (좁은 복도라 못 덮으면 바로 옆까지 가는 자리)
  function dinoAnchors(m, t) {
    const W = m.W, a = [t, t - 1, t - W, t - W - 1].filter((p) => p >= 0 && m.dOk[p]);
    if (a.length) return a;
    const b = []; for (const n of [t + 1, t - 1, t + W, t - W]) for (const p of [n, n - 1, n - W, n - W - 1]) if (p >= 0 && m.dOk[p] && !b.includes(p)) b.push(p);
    return b;
  }

  function bfs(map, src, nb) {
    nb = nb || map.nbrs;
    const N = map.W * map.H, d = new Int16Array(N).fill(999), q = new Int16Array(N); let h = 0, t = 0;
    d[src] = 0; q[t++] = src;
    while (h < t) { const c = q[h++]; const l = nb[c]; if (!l) continue; const dc = d[c] + 1; for (let j = 0; j < l.length; j++) { const n = l[j]; if (d[n] === 999 && n !== src) { d[n] = dc; q[t++] = n; } } }
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
    { key: 'snakeStop', label: '뷱 막기', up: '도망자가 뷱이 거인을 너무 많이 먹기 전에 막으러 나선다', down: '도망자가 뷱은 내버려 두고 탈출에 집중한다' },
    { key: 'snakeShot', label: '뷱 사격', up: '도망자가 거인을 노리는 뷱에게 샷건을 쏘기 시작했다', down: '도망자가 샷건을 거인용으로 아껴 둔다' },
    { key: 'vault', label: '벽넘기', up: '도망자가 벽넘기를 과감하게 쓰기 시작했다', down: '도망자가 벽넘기를 아껴 큰 위기·큰 지름길에만 쓴다' },
    { key: 'delve', label: '지하 탐험', up: '도망자가 지하 미로를 더 오래, 더 깊이 탐험한다', down: '도망자가 지하보다 지상 목표에 집중한다' },
    { key: 'weaponSeek', label: '무기 찾기', up: '도망자가 지하에 숨겨진 거인 퇴치 무기를 찾아 헤맨다', down: '도망자가 전설의 무기를 찾느라 시간을 쓰지 않는다' },
    { key: 'slayHunt', label: '거인 사냥', up: '번개창을 들면 도망자가 탈출보다 거인 사냥(전멸 승리)을 노린다', down: '번개창을 들어도 도망자가 탈출을 우선한다' },
    { key: 'dinoFear', label: '공룡 피하기', up: '도망자가 공룡 발소리가 들리면 멀리 돌아간다', down: '도망자가 공룡 옆을 아슬아슬하게 지나간다' },
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
    { key: 'deepPatrol', label: '지하 수색', up: '거인이 지하 미로까지 내려가 순찰한다', down: '거인이 지상에서만 순찰한다' },
    { key: 'dinoDodge', label: '공룡 피하기', up: '거인이 공룡을 보면 멀리 돌아간다', down: '거인이 공룡을 무서워하지 않는다' },
    { key: 'rockSeek', label: '바위 찾기', up: '거인이 어두운 지하를 뒤져 숨은 바위를 찾는다', down: '거인이 바위 찾기에 시간을 쓰지 않는다' },
    { key: 'rockUse', label: '바위로 해치 막기', up: '거인이 멀리 있는 바위도 굴려 와 지하 해치를 막는다', down: '거인이 가까운 바위만 겨우 민다' },
    { key: 'rockDoor', label: '바위로 문 막기', up: '거인이 열쇠를 다 모으기 전부터 바위로 출구 문을 막는다', down: '거인이 마지막 순간에만 문을 막는다' },
  ];
  // v19: 뷱 유전자 (뷱도 판마다 변이된 도전자와 겨루며 진화)
  const SNAKE_GENES = [
    { key: 'sHunt', label: '사냥 감각', up: '뷱이 더 멀리 있는 거인의 냄새를 맡는다', down: '뷱이 코앞의 거인만 노린다' },
    { key: 'sChase', label: '끈질긴 추격', up: '뷱이 놓친 거인을 더 오래 쫓는다', down: '뷱이 놓친 거인을 금방 포기한다' },
    { key: 'sPill', label: '알약 욕심', up: '뷱이 멀리 있는 알약까지 먹으러 간다', down: '뷱이 알약보다 거인 사냥에 집중한다' },
    { key: 'sCamp', label: '부활 지점 매복', up: '뷱이 먹힌 거인이 부활할 곳 근처에서 기다리는 법을 배웠다', down: '뷱이 부활 지점을 신경 쓰지 않는다' },
    { key: 'sFloor', label: '층 이동', up: '뷱이 거인이 많은 층으로 계단을 타고 옮겨 간다', down: '뷱이 지금 층에 머무르려 한다' },
    { key: 'sAmbush', label: '갈림길 매복', up: '뷱이 갈림길에 숨어 거인을 기다리는 법을 배웠다', down: '뷱이 멈추지 않고 돌아다닌다' },
    { key: 'sLunge', label: '달려들기', up: '뷱이 더 먼 거리에서 거인에게 달려든다', down: '뷱이 달려들기를 아껴 코앞에서 쓴다' },
    { key: 'sDodge', label: '도망자 피하기', up: '뷱이 꼬리를 잡히지 않게 도망자를 피해 다닌다', down: '뷱이 도망자를 신경 쓰지 않는다' },
  ];
  function defaultSnake() { return { sHunt: 0.3, sChase: 0.3, sPill: 0.5, sCamp: 0.2, sFloor: 0.3, sAmbush: 0.2, sLunge: 0.3, sDodge: 0.3 }; }
  // Lv.1 초보 두뇌 (일부러 서툰 값). 거인은 처음부터 역할이 조금씩 다르게 출발
  function defaultRunner() { return { danger: 0.5, flee: 0.35, greed: 0.7, loop: 0.3, predict: 0.5, memory: 0.4, keySafe: 0.35, sprint: 0.3, itemGreed: 0.4, panic: 0.4, shotgun: 0.4, barricade: 0.4, missionOrder: 0.4, plateNerve: 0.4, snakeFear: 0.5, snakeLure: 0.3, tailGrab: 0.3, vault: 0.4, snakeStop: 0.4, snakeShot: 0.3, delve: 0.8, weaponSeek: 0.8, dinoFear: 0.6, slayHunt: 0.5 }; }
  function defaultGiantOne(k) {
    const base = { stride: 0.5, intercept: 0.5, lookahead: 0.5, ambush: 0.3, dash: 0.1, patience: 0.3, scent: 0.2, exitGuard: 0.3, spread: 0.1, call: 0.2, smash: 0.3, roar: 0.4, tracker: 0.4, blockade: 0.3, guard: 0.3, snakeSense: 0.4, deepPatrol: 0.2, dinoDodge: 0.5, rockUse: 0.4, rockDoor: 0.4, rockSeek: 0.4 };
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
    constructor(map, runnerGenes, giantTeam, seed, snakeGenes) {
      this.map = map; this.rg = runnerGenes; this.gg = giantTeam; this.sg = Object.assign(defaultSnake(), snakeGenes || {});
      this.rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
      this.turn = 0; this.result = null; this.events = []; this.catcher = -1; this.escapeDoor = null;
      this.keysLeft = map.keys.slice(); this.keysHeld = 0;
      this.scent = new Int16Array(map.W * map.H).fill(-999);
      this.gscent = new Int16Array(map.W * map.H).fill(-999);
      this.doorWatch = [-1, -1]; // 문마다 감시 거인은 최대 1명
      const n = giantTeam.length; // 거인 수 = 팀 유전자 수 (출발점은 맵에 GIANTS_MAX개 준비)
      this.runner = { pos: map.runnerStart, prev: map.runnerStart, path: [map.runnerStart], known: new Array(n).fill(-1), knownTurn: new Array(n).fill(-999), target: -1, door: -1, mode: '탐색', sprintLeft: 0, sprintCd: 0,
        seen: new Uint8Array(map.W * map.H), inv: { shotgun: CFG.SHOTGUN_AMMO, smoke: 0, boost: 0, cloak: 0, vault: 0, barricade: 0, slayer: 0 }, reload: 0, cloak: 0, boost: 0, used: 0, vaults: 0, b1Turns: 0 };
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
      this.snakes = map.snakeStarts.slice(-CFG.SNAKES).map((c, i) => ({ id: i, body: new Array(CFG.SNAKE_LEN).fill(c), prevBody: new Array(CFG.SNAKE_LEN).fill(c), grow: 0, hidden: 0, rest: 0, target: -1, patrol: -1, floor: floorOf(map, c), mode: '어슬렁', stun: 0, lungeCd: 0, wait: 0, preyId: -1, preyTurn: -999 }));
      this.snakeAte = { giants: 0, runner: 0, byGiant: new Array(n).fill(0), pills: 0 };
      this.snakeBlocks = { tail: 0, shot: 0 }; // 도망자가 뷱을 막은 횟수
      this.pills = []; this.lastPill = 0;
      for (let i = 0; i < CFG.PILLS_START; i++) this.spawnPill(i % map.floors);
      updateSeen(this);
      this.smashed = []; // 부서진 벽 기록 (화면 연출용)
      // v21: 지하 — 전설의 무기(판마다 먼 곳 무작위) + 2×2 공룡
      this.weapon = null; this.dino = null; this.kills = 0; this.dinoAte = { giants: 0, runner: 0 };
      if (map.B1 >= 0 && map.weaponCands && map.weaponCands.length) this.weapon = { cell: map.weaponCands[Math.floor(this.rng() * map.weaponCands.length)], taken: false, takenTurn: -1 };
      // v22 바위 (맵에 g=3으로 제자리에 놓여 있음)
      this.boulders = (map.boulders || []).map((b) => ({ cell: b.home, home: b.home, by: -1, since: -1, pushes: 0, carried: -1 }));
      this.rockStats = { pushes: 0, hatch: 0, door: 0, stairs: 0, resets: 0, refused: 0, found: 0, firstFound: -1, lift: 0, carried: 0, carryTry: 0 };
      this.rockKnown = this.boulders.map(() => false); this.gB1seen = new Uint8Array(map.W * map.H);
      // v23: 공룡 2마리 (서로 멀리서 출발, 안 겹침)
      this.dinos = [];
      if (map.B1 >= 0 && map.dinoStarts && map.dinoStarts.length) {
        const W = map.W, ds = map.dinoStarts.filter((p) => map.g[p] === 0 && map.g[p + 1] === 0 && map.g[p + W] === 0 && map.g[p + W + 1] === 0), pool = ds.length ? ds : map.dinoStarts;
        for (let n = 0; n < CFG.DINOS; n++) {
          const far = pool.filter((p) => this.dinos.every((D) => manhattan(map, D.pos, p) >= 14)), pl = far.length ? far : pool.filter((p) => this.dinos.every((D) => manhattan(map, D.pos, p) >= 3));
          if (!pl.length) break; const p = pl[Math.floor(this.rng() * pl.length)];
          this.dinos.push({ id: n, pos: p, prev: p, path: [p], facing: [1, 0], mode: '어슬렁', prey: null, roam: -1, stall: 0, ignoreUntil: 0, acc: 0, chargeCd: 0, charge: 0 });
        }
      }
      this.dino = this.dinos[0] || null;
    }
    // v21: 공룡이 차지한 4칸
    dinoCells(D) { const W = this.map.W, out = []; for (const X of D ? [D] : this.dinos) { const p = X.pos; out.push(p, p + 1, p + W, p + W + 1); } return out; }
    dinoHits(c) { const W = this.map.W; for (const D of this.dinos) { const p = D.pos; if (c === p || c === p + 1 || c === p + W || c === p + W + 1) return true; } return false; }
    knockOut(k) { const G = this.giants[k]; G.stun = 0; G.blind = 0; G.track = 0; G.dashLeft = 0; G.know = -1; G.saw = false; G.ambushSpot = -1; releaseDoor(this, k); G.eatenAt = G.pos; G.path = [G.pos]; dropRock(this, k); }
    dinoBite(k) {
      const G = this.giants[k]; this.knockOut(k); G.out = secTurns(CFG.DINO_KO_SEC); G.outBy = 'dino'; this.dinoAte.giants++;
      this.fx.push({ t: 'dinoBite', cell: G.pos, giant: k, turn: this.turn });
      this.log('dino', `🦖 공룡이 거인${k + 1}을 물어 쓰러뜨렸다! (${CFG.DINO_KO_SEC}초 뒤 출발점에서 부활)`);
    }
    dinoEatsRunner() {
      this.catcher = -4; this.dinoAte.runner++;
      this.fx.push({ t: 'dinoBite', cell: this.runner.pos, giant: -1, turn: this.turn });
      return this.finish('giant');
    }
    slay(k) {
      const G = this.giants[k], R = this.runner; this.knockOut(k); G.out = 1e9; G.dead = true; G.outBy = 'slayer';
      R.spearCd = CFG.SLAYER_CD; R.used++; this.kills++;
      this.fx.push({ t: 'slay', from: R.pos, to: G.pos, cell: G.pos, giant: k, turn: this.turn });
      const left = this.giants.filter((H) => !H.dead).length;
      this.log('kill', `⚡ 도망자가 번개창으로 거인${k + 1}을 처치했다! ☠️ (이번 판 복귀 불가 · 남은 거인 ${left}명)`);
      if (left === 0) { this.winBy = 'slay'; this.finish('runner'); } // v24: 거인 전멸 = 도망자 승리
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
    // v22: 바위가 막고 있는 곳 이름 [이름, 을/를, 이/가, 종류]
    blockInfo(c) {
      const m = this.map, di = m.doorFront ? m.doorFront.indexOf(c) : -1;
      if (di >= 0) return [`문 ${m.exitNames[di]}`, '를', '가', 'door'];
      if (m.stairOf[c] >= 0) { const hi = (m.hatches || []).findIndex(([a, b]) => a === c || b === c); return hi >= 0 ? [`해치 ${hi + 1}번`, '을', '이', 'hatch'] : ['계단', '을', '이', 'stairs']; }
      return null;
    }
    boulderFree(c) {
      const m = this.map; if (m.g[c] !== 0 || m.isExit[c] || m.isMission[c]) return false;
      if (c === this.runner.pos || this.giantAt(c) >= 0 || this.dinoHits(c)) return false;
      if (this.snakes.some((S) => S.hidden <= 0 && S.body.includes(c))) return false;
      if (this.items.some((it) => it.cell === c) || this.pills.includes(c) || this.keysLeft.includes(c)) return false;
      if (this.weapon && !this.weapon.taken && this.weapon.cell === c) return false;
      return true;
    }
    // 바위 옮기기 (맵 복사본에서 g=3 이동 → 길찾기 갱신). k<0 = 제자리로 굴러감
    pushBoulder(bi, to, k) {
      if (this.map.pristine !== false) this.map = cloneMap(this.map);
      const m = this.map, B = this.boulders[bi], from = B.cell, was = this.blockInfo(from), s0 = B.since0 ?? -1;
      m.g[from] = 0; m.g[to] = 3; m.breakable[from] = 0; m.breakable[to] = 0; finalizeGraphs(m);
      B.cell = to; B.since = -1; B.since0 = this.blockInfo(to) ? this.turn : -1;
      if (k >= 0) { B.pushes++; this.rockStats.pushes++; }
      this.fx.push({ t: k >= 0 ? 'boulder' : 'boulderReset', from, to, cell: to, giant: k, turn: this.turn });
      if (was && (k < 0 || (s0 >= 0 && this.turn - s0 >= 3))) this.log('boulderOpen', k >= 0 ? `🪨 ${was[0]}${was[2]} 다시 열렸다 (거인${k + 1}이 바위를 치움)` : `🪨 바위가 데굴데굴 제자리로 굴러갔다 — ${was[0]}${was[2]} 다시 열렸다`);
    }
    // v23: 두 문이 모두 바위로 막혔나 → 도망자는 생존 모드 (무기로 거인 처치 또는 시간 끝까지 버티기)
    checkSealed() {
      const m = this.map, df = (m.doorFront || []).filter((c) => c >= 0);
      const now = df.length > 0 && df.every((c) => m.g[c] === 3);
      if (now && !this.sealed) { this.sealed = true; this.sealedTurn = this.turn; this.sealedEver = true; this.fx.push({ t: 'sealed', cell: df[0], turn: this.turn }); this.log('sealed', `🚫 모든 출구가 막혔다! 도망자는 살아남아야 한다 (지하의 번개창으로 거인을 모두 처치하거나 시간 끝까지 버티기)`); }
      else if (!now && this.sealed) { this.sealed = false; this.log('sealed', '🚪 출구 하나가 다시 열렸다!'); }
    }
    // 공정 규칙: 해치·계단·문 앞을 막은 바위는 BOULDER_RESET_SEC초 뒤 제자리로 굴러감 (제자리가 비어 있고, 굴러가도 길이 안 막힐 때)
    boulderTick() {
      const lim = secTurns(CFG.BOULDER_RESET_SEC), m = this.map, W = m.W;
      // v24: 거인이 지하에서 바위를 발견 (어두워서 ROCK_SEE칸 안 + 시야) · 지하에서 지나간 곳 기록 (바위 찾기용)
      for (const G of this.giants) {
        if (G.out > 0 || m.lvl[G.pos] !== m.B1) continue;
        const gx = G.pos % W, gy = (G.pos / W) | 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const c = G.pos + dy * W + dx; if (c >= 0 && c < m.g.length) this.gB1seen[c] = 1; }
        this.boulders.forEach((B, bi) => {
          if (this.rockKnown[bi] || B.gone || B.carried >= 0) return;
          if (Math.abs(B.cell % W - gx) + Math.abs(((B.cell / W) | 0) - gy) <= CFG.ROCK_SEE && (() => { const v = m.g[B.cell]; m.g[B.cell] = 0; const ok = lineOfSight(m, G.pos, B.cell); m.g[B.cell] = v; return ok; })()) {
            this.rockKnown[bi] = true; this.rockStats.found++; if (this.rockStats.firstFound < 0) this.rockStats.firstFound = this.turn;
            this.log('boulderFind', `🪨 거인${G.id + 1}이 어두운 지하에서 바위를 찾아냈다!`);
          }
        });
      }
      this.boulders.forEach((B, bi) => {
        if (B.gone || B.carried >= 0) return;
        const bk = this.blockInfo(B.cell);
        if (!bk || bk[3] === 'door') { B.since = -1; return; } // 문 앞 바위는 그 판 동안 그대로 (거인이 치우지 않는 한)
        if (B.since < 0) { B.since = this.turn; return; }
        if (this.turn - B.since >= lim && B.cell !== B.home && this.boulderFree(B.home) && escapeOk(this, B.cell, B.home)) {
          if (B.by >= 0) dropRock(this, B.by);
          this.pushBoulder(bi, B.home, -1); this.rockStats.resets++;
        }
      });
    }
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
      const G = this.giants[k]; this.knockOut(k); G.out = secTurns(CFG.SNAKE_DIGEST_SEC); G.outBy = 'snake';
      S.grow += CFG.SNAKE_GROW_GIANT; S.rest = CFG.SNAKE_REST + CFG.SNAKE_REST_PER_EAT * this.snakeAte.giants; this.snakeAte.giants++; this.snakeAte.byGiant[k]++;
      this.fx.push({ t: 'eat', cell: S.body[0], giant: k, snake: S.id, turn: this.turn });
      this.log('snake', `뷱이 거인${k + 1}을 삼켰다! 🐍 (${CFG.SNAKE_DIGEST_SEC}초 뒤 출발점에서 부활)`);
      const W = CFG.SNAKE_WIN_EATS, e = this.snakeAte.giants;
      if (e >= W) return this.finish('snake');
      if (e === Math.round(W / 2) || e === Math.round(W * 0.8) || e === W - 1) this.log('snakeWarn', `🐍 뷱이 거인 ${e}/${W}마리째! ${W - e}마리만 더 먹으면 뷱 승리`);
    }

    step() {
      if (this.result) return;
      this.turn++;
      const m = this.map, R = this.runner;
      if (m.B1 >= 0 && floorOf(m, R.pos) === m.B1) {
        R.b1Turns++;
        const Wp = this.weapon;
        if (Wp && !Wp.taken && !Wp.spotted && Math.abs(Wp.cell % m.W - R.pos % m.W) + Math.abs(((Wp.cell / m.W) | 0) - ((R.pos / m.W) | 0)) <= CFG.WEAPON_SEE && lineOfSight(m, R.pos, Wp.cell)) Wp.spotted = true;
      }
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
      if (this.result) return; // v24: 마지막 거인을 처치하면 즉시 끝
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
        if (m.B1 >= 0) {
          const lv = floorOf(m, R.pos), pl = floorOf(m, R.prev);
          if (lv !== pl && lv === m.B1 && CFG.HATCH_NOISE > 0) for (const G of this.giants) if (G.out <= 0 && G.stun <= 0 && bfsC(m, R.prev, 2)[G.pos] <= CFG.HATCH_NOISE) { G.know = R.pos; G.knowTurn = this.turn; } // v22: 해치 뚜껑 소리 — 가까운 거인이 도망자가 지하로 간 걸 앎
          if (lv !== pl && (lv === m.B1 || pl === m.B1)) { this.fx.push({ t: 'hatch', cell: R.pos, turn: this.turn }); this.log('b1', lv === m.B1 ? '🕳️ 도망자가 해치를 타고 지하 1층으로 내려갔다' : '🕳️ 도망자가 지상으로 올라왔다'); }
          if (this.weapon && !this.weapon.taken && R.pos === this.weapon.cell) {
            this.weapon.taken = true; this.weapon.takenTurn = this.turn; R.inv.slayer = CFG.SLAYER_AMMO;
            this.fx.push({ t: 'weapon', cell: R.pos, turn: this.turn });
            this.log('weapon', `⚡ 도망자가 지하에서 전설의 무기 '거인 퇴치 번개창'을 찾았다! 🔱 (무한 사용 — 거인을 모두 처치하면 승리)`);
          }
          if (this.dinoHits(R.pos)) return this.dinoEatsRunner();
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
            S.hidden = CFG.SNAKE_HIDE; S.stun = 0; this.snakeBlocks.tail++; this.fx.push({ t: 'tailgrab', cell: tail, snake: S.id, turn: this.turn });
            if (snakePressure(this) > 0) this.log('snakeBlock', `🛡️ 도망자가 뷱을 막았다! 꼬리를 잡아 땅속으로 쫓아냈다 (뷱 ${this.snakeAte.giants}/${CFG.SNAKE_WIN_EATS})`);
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
      if (this.boulders.length) this.boulderTick();
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
          if (this.gscent) this.gscent[G.pos] = this.turn; // v23: 거인 발자국 냄새 (공룡이 맡음)
          if (G.pos !== before && manhattan(m, G.pos, before) === 1) G.facing = [G.pos % m.W - before % m.W, ((G.pos / m.W) | 0) - ((before / m.W) | 0)];
          G.path.push(G.pos);
          if (G.pos === R.pos) { this.catcher = k; return this.finish('giant'); }
          if (this.dinos.length && this.dinoHits(G.pos)) { this.dinoBite(k); break; }
          { const S = this.snakeAtHead(G.pos); if (S && !(S.stun > 0)) { this.eatGiant(S, k); break; } }
          const gi2 = this.items.findIndex((it) => it.cell === G.pos && it.side === 'G' && G.inv[it.type] === 0);
          if (gi2 >= 0) { const it = this.items[gi2]; this.items.splice(gi2, 1); G.inv[it.type] = 1; this.fx.push({ t: 'pickup', cell: G.pos, type: it.type, who: k, turn: this.turn }); this.log('item', `거인${k + 1}이 ${ITEM_INFO[it.type].obj} 주웠다! ${ITEM_INFO[it.type].icon}`); }
        }
        if (G.doorBan > 0) { G.doorBan--; G.doorHeat = 0; }
        else if (m.nearDoor[G.pos]) { if (++G.doorHeat > CFG.DOOR_LINGER) { G.doorBan = CFG.DOOR_BAN; releaseDoor(this, k); G.ambushSpot = -1; if (G.mode === '매복') G.mode = '지루함'; this.log('doorban', `문의 빛에 눈이 부신 거인${k + 1}이 문 근처에서 물러난다 ✨`); } }
        else G.doorHeat = Math.max(0, G.doorHeat - 1);
        if (G.keyBan > 0) { G.keyBan--; G.keyHeat = 0; }
        else if (nearKey(this, G.pos)) { if (++G.keyHeat > CFG.KEY_LINGER) { G.keyBan = CFG.KEY_BAN; if (this.keysLeft.includes(G.ambushSpot)) { G.ambushSpot = -1; if (G.mode === '매복') G.mode = '지루함'; } this.log('doorban', `열쇠의 빛에 눈이 부신 거인${k + 1}이 열쇠 근처에서 물러난다 ✨`); } }
        else G.keyHeat = Math.max(0, G.keyHeat - 1);
        if (this.result) return;
      }
      // 뷱 이동
      for (const S of this.snakes) { snakeStep(this, S); if (this.result) return; }
      this._sb = null;
      for (const D of this.dinos) { dinoStep(this, D); if (this.result) return; }
      if (this.turn - this.lastPill >= CFG.PILL_RESPAWN) { this.lastPill = this.turn; if (this.pills.length < CFG.PILL_MAX) this.spawnPill(); }
      if (this.turn - this.lastItemSpawn >= CFG.ITEM_RESPAWN) { this.lastItemSpawn = this.turn; if (this.items.length < CFG.ITEM_MAX) this.spawnItem(); }
      if (this.boulders.length) this.checkSealed();
      if (this.turn >= CFG.MAX_TURNS) return this.finish('draw');
    }
    respawnGiant(k) {
      const G = this.giants[k], m = this.map; let c = m.giantStarts[k];
      const sb = this.snakeBody(), bad = (i) => m.g[i] !== 0 || this.giantAt(i) >= 0 || i === this.runner.pos || this.snakeAtHead(i) || sb.has(i) || !m.gNbrs[i];
      // v19: 뷱 머리가 출발점 바로 근처면 다른 출발점(뷱에게서 가장 먼 곳)에서 부활
      { const heads = this.snakes.filter((S) => S.hidden <= 0).map((S) => bfsC(m, S.body[0], 0)), near = (i) => heads.some((d) => d[i] <= CFG.SNAKE_SPAWN_SAFE);
        if (near(c)) { let best = -1, bv = -1; for (const s0 of m.giantStarts) { if (bad(s0) || near(s0)) continue; const v = Math.min(...heads.map((d) => d[s0])); if (v > bv) { bv = v; best = s0; } } if (best >= 0) c = best; } }
      if (bad(c)) { const dr = bfsC(m, this.runner.pos, 2), c0 = c; let best = -1, bd = Infinity; for (const i of m.floor) { if (bad(i) || dr[i] <= 3 || floorOf(m, i) !== floorOf(m, c0)) continue; const v = manhattan(m, i, c0); if (v < bd) { bd = v; best = i; } } if (best >= 0) c = best; }
      G.pos = c; G.prev = c; G.path = [c]; G.mode = '순찰'; G.modeSince = this.turn; G.patrol = -1; G.know = -1; G.knowTurn = -999;
      this.fx.push({ t: 'respawn', cell: c, giant: k, turn: this.turn });
      if (G.outBy === 'dino') this.log('dino', `거인${k + 1}이 정신을 차리고 출발점에 다시 나타났다 😵`);
      else this.log('snake', `거인${k + 1}이 뷱의 배 속에서 빠져나와 출발점에 다시 나타났다 😵`);
      G.outBy = null;
    }
    snakeEatsRunner(S) {
      this.catcher = -2; this.eatenBySnake = true; this.snakeAte.runner++;
      this.fx.push({ t: 'eat', cell: this.runner.pos, giant: -1, snake: S.id, turn: this.turn });
      this.log('snake', '뷱이 도망자를 삼켰다! 🐍');
      return this.finish('giant');
    }
    finish(who) {
      this.result = who;
      if (who === 'snake') { this.catcher = -3; this.log('end', `뷱 승리! 🐍👑 뷱이 거인을 ${this.snakeAte.giants}마리 먹어 치웠다`); return; }
      if (who === 'giant' && this.catcher === -4) this.log('end', '🦖 공룡이 도망자를 삼켰다! 지하의 공포…');
      else if (who === 'giant') this.log('end', `거인${this.catcher + 1}이 도망자를 잡아먹었다! 👹`);
      else if (who === 'runner' && this.winBy === 'slay') this.log('end', '⚡ 도망자가 거인을 모두 처치했다! 번개창의 승리 🔱👑');
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
    // v21 공룡: 지하에서 보이거나 발소리(미로 거리 DINO_HEAR)가 들리면 위치를 기억 → 거인처럼 위협으로 취급 ('공룡 피하기' 유전자만큼 더 무섭게)
    // v23: 공룡 2마리 — 각각 기억
    R.dinoK = R.dinoK || [];
    for (const D of game.dinos) {
      const dc = game.dinoCells(D);
      if (floorOf(m, R.pos) === m.B1 && (dc.some((c) => sees(m, R.pos, c)) || dR[D.pos] <= CFG.DINO_HEAR || bfsC(m, R.pos, 0)[D.pos] <= CFG.DINO_HEAR)) {
        if (!R.dino || game.turn - R.dino.turn > 8) game.log('spot', '도망자가 공룡을 발견했다! 🦖 쿵… 쿵…');
        R.dinoK[D.id] = R.dino = { pos: D.pos, turn: game.turn };
      }
      const K = R.dinoK[D.id];
      if (K && game.turn - K.turn <= 6) {
        const age = game.turn - K.turn, fear = g.dinoFear ?? 0.6, p = K.pos;
        if (!dRaw) { dRaw = new Float32Array(N).fill(999); dEff = new Float32Array(N).fill(999); }
        const ds = [p, p + 1, p + W, p + W + 1].map((c) => bfsC(m, c, 0));
        for (const i of m.floor) { let dd = 999; for (const d of ds) if (d[i] < dd) dd = d[i]; if (dd < dRaw[i]) dRaw[i] = dd; const e = dd - age * 0.5 - fear * 3; if (e < dEff[i]) dEff[i] = e; }
        if (age === 0) freshPos.push(p, p + 1, p + W, p + W + 1);
      }
    }
    // 뷱: 보이거나 아주 가까우면(3칸) 머리 위치를 기억, 위협으로 취급 ('뷱 경계' 유전자만큼 멀리서부터)
    const snakeD = [];
    for (const S of game.snakes) {
      if (S.hidden > 0) { R.snake = R.snake || {}; delete R.snake[S.id]; continue; }
      const h = S.body[0]; R.snake = R.snake || {};
      if (sees(m, R.pos, h) || bfsC(m, R.pos, 0)[h] <= 3) { if (!R.snake[S.id] || game.turn - R.snake[S.id].turn > 6) game.log('spot', '도망자가 뷱을 발견했다! 🐍'); R.snake[S.id] = { head: h, tail: S.body[S.body.length - 1], turn: game.turn }; }
      // v19 뷱 막기: 뷱이 위험할 만큼 먹었으면 소란(거인 삼키는 소리)으로 더 멀리서도 위치를 알아챔
      const press = snakePressure(game);
      if (press > 0 && !(R.snake[S.id] && R.snake[S.id].turn === game.turn) && bfsC(m, R.pos, 0)[h] <= 8 + Math.round(press * 12)) R.snake[S.id] = { head: h, tail: S.body[S.body.length - 1], turn: game.turn };
      const kn = R.snake[S.id]; if (!kn || game.turn - kn.turn > (press > 0 ? 20 : 8)) continue;
      // v16: 뷱은 도망자에게 위협이 아님 (꼬리 잡기·거인 유인에만 씀)
      snakeD.push({ d: bfsC(m, kn.head, 3), tail: kn.tail, fresh: game.turn === kn.turn, head: kn.head, grab: new Set(S.body).size >= 3 });
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
    const pass = m.border ? (n) => { if (seenS[n] === 1) return m.g[n] === 0 && (all || !m.isExit[n]); return !m.border[n]; }
      : (n) => { if (seenS[n] === 1) return m.g[n] === 0 && (all || !m.isExit[n]); const x = n % W, yl = ((n / W) | 0) % FH; return x > 0 && x < W - 1 && yl > 0 && yl < FH - 1; };
    const seeds = []; let target = -1, bestT = Infinity;
    const huntG = R.inv.slayer > 0 && (!!game.sealed || (g.slayHunt ?? 0.5) * 1.3 - (all ? 0.35 : 0) + game.kills * 0.15 > 0.5);
    const wasHunt = !!R.huntOn; R.huntOn = huntG;
    if (all && !game.sealed && !huntG) {
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
    // v19 뷱 막기: 긴급도만큼 뷱 꼬리를 목표로 (꼬리를 잡으면 뷱이 땅속으로 숨어 한동안 못 먹음)
    const sPress = snakePressure(game); let blockTail = -1;
    if (sPress > 0) for (const sd of snakeD) if (sd.grab && m.g[sd.tail] === 0 && !m.isExit[sd.tail]) { seeds.push([sd.tail, (1 - sPress) * 30]); blockTail = sd.tail; }
    for (const it of game.items) if (it.side === 'R' && seenS[it.cell] && R.inv[it.type] < 2) seeds.push([it.cell, 3 + (1 - g.itemGreed) * 28]);
    const fCost = known ? CFG.FRONTIER_COST + 6 : 0;
    // v21 지하 탐험: 지하 경계는 '지하 탐험'만큼 싸지고, 무기를 아직 못 찾았으면 '무기 찾기'만큼 더 싸짐. 오래 머물면(지침) 지상으로 돌아감
    // v23 출구 봉쇄: 탈출할 수 없으니 무기 찾기(지하 우선) → 무기가 없으면 거인을 피해 살아남기
    const sealed = !!game.sealed, hunt = sealed && game.weapon && !game.weapon.taken;
    const B1 = m.B1, wantW = game.weapon && !game.weapon.taken ? (hunt ? 1 : (g.weaponSeek ?? 0.5)) : 0;
    const tired = !hunt && B1 >= 0 && R.b1Turns > CFG.B1_STAY_MIN + (g.delve ?? 0.3) * CFG.B1_STAY_GENE;
    const b1Pen = hunt ? 0 : tired ? 300 : Math.max(0, (1 - (g.delve ?? 0.3)) * 40 - wantW * 14);
    if (game.weapon && !game.weapon.taken && game.weapon.spotted && !tired) seeds.push([game.weapon.cell, (1 - wantW) * 20]);
    for (let y = 1; y < m.H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const c = y * W + x; if (!seenS[c] || !pass(c)) continue;
      const pen = B1 >= 0 && m.lvl[c] === B1 ? b1Pen : hunt ? 25 : 0;
      if ((x < W - 2 && !seenS[c + 1]) || (x > 1 && !seenS[c - 1]) || (y < m.H - 2 && !seenS[c + W]) || (y > 1 && !seenS[c - W])) seeds.push([c, fCost + pen]);
      if (m.stairOf[c] >= 0 && !seenS[m.stairOf[c]]) seeds.push([m.stairOf[c], fCost + (B1 >= 0 && m.lvl[m.stairOf[c]] === B1 ? b1Pen : 0)]); // 안 가 본 위/아래층: 계단(해치)을 타 봐야 앎
    }
    R.target = target;
    // v24 거인 사냥: 번개창을 들었으면 '거인 사냥' 유전자만큼(봉쇄되면 무조건) 탈출 대신 거인을 쫓음 — 거인 전멸 = 승리
    if (huntG) {
      game.giants.forEach((G, k) => { if (G.dead || R.known[k] < 0) return; const age = game.turn - R.knownTurn[k]; seeds.push([R.known[k], Math.min(age, 40) * 0.5]); });
      if (!wasHunt) game.log('hunt', '⚡ 도망자가 번개창을 들고 거인 사냥에 나섰다!');
    }
    const fleeR = (2 + g.flee * 7) * (sealed ? 1.5 : 1) * (huntG ? CFG.HUNT_FLEE : 1); // 봉쇄되면 더 멀리서부터 피함 · 사냥 중엔 거의 안 피함
    const cost = new Float64Array(N).fill(1);
    for (let i = 0; i < N; i++) if (!seenS[i]) cost[i] = ucost;
    if (dEff && (!huntG || CFG.HUNT_FLEE > 0.35)) { const K = g.danger * 30; for (const i of m.floor) { const de = dEff[i] - predictShift; if (de < fleeR) { const r = (fleeR - de) / fleeR; cost[i] = 1 + K * r * r; } } }
    const distT = dijkstraSeeds(m, seeds, cost, pass, seenS);
    for (const c of rN[R.pos]) if (c === target && !freshPos.includes(c) && (!dRaw || dRaw[c] > 1 || (m.isExit[c] && all))) { R.mode = '돌파'; return c; }
    const fleeing = (!huntG || CFG.HUNT_FLEE > 0.35) && dEff && dEff[R.pos] - predictShift * 0.5 <= fleeR;
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
        if (c === sd.tail && sd.d[c] >= 3) s += (g.tailGrab ?? 0.3) * 40 - 8 + sPress * 80; // 꼬리 잡기 (뷱 막기 긴급도만큼 더)
        if (fleeing && sd.d[c] >= 2 && sd.d[c] <= 6) s += (g.snakeLure ?? 0.3) * (1 - 2 * sPress) * (6 - Math.abs(sd.d[c] - 3.5)) * 2; // 거인을 뷱 쪽으로 유인 (뷱이 위험하면 오히려 멀리)
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
    R.mode = huntG ? '거인 사냥' : sealed && !fleeing ? (hunt ? '무기 찾기' : '생존') : fleeing ? (R.dino && game.turn - R.dino.turn <= 1 && dRaw[R.pos] <= 8 && floorOf(m, R.pos) === m.B1 ? '공룡 피하기' : '도주') : B1 >= 0 && floorOf(m, R.pos) === B1 && !known ? (wantW > 0 && !tired ? '무기 찾기' : '지하 탐험') : blockTail >= 0 && distT[choice] <= distT[R.pos] && bfsC(m, choice, 0)[blockTail] < bfsC(m, R.pos, 0)[blockTail] ? '뷱 막기' : (!known ? '탐색' : m.isMission[target] ? '미션' : dRaw ? '경계' : '목표로');
    return choice;
  }

  // 벽넘기 후보: [넘을 벽, 착지 칸] — 안쪽 벽(1)·바리케이드(2) 한 칸만, 바깥 벽·층 경계 불가, 착지는 같은 층의 빈 바닥(출구 제외, 거인·뷱 머리 없는 칸)
  function vaultMoves(game) {
    const m = game.map, R = game.runner, W = m.W, FH = m.FH || m.H, out = [];
    const x = R.pos % W, y = (R.pos / W) | 0;
    for (const [dx, dy] of DIRS) {
      const wx = x + dx, wy = y + dy, tx = x + 2 * dx, ty = y + 2 * dy;
      if (wx <= 0 || wx >= W - 1 || tx <= 0 || tx >= W - 1) continue;
      if (wy < 0 || ty < 0 || ty >= m.H) continue;
      const w = wy * W + wx, t = ty * W + tx;
      if (m.border) { if (m.border[w] || m.border[t] || m.lvl[w] !== m.lvl[R.pos] || m.lvl[t] !== m.lvl[R.pos]) continue; }
      else { const wyl = wy % FH, tyl = ty % FH; if (wyl === 0 || wyl === FH - 1 || tyl === 0 || tyl === FH - 1 || Math.floor(wy / FH) !== Math.floor(y / FH) || Math.floor(ty / FH) !== Math.floor(y / FH)) continue; }
      if (game.dinoHits(t)) continue;
      if (m.g[w] === 0 || m.g[w] === 3 || m.isExit[w] || m.g[t] !== 0 || m.isExit[t] || m.stairOf[t] >= 0 || m.stairOf[R.pos] >= 0) continue; // 계단 위/계단으로는 못 넘음 · v22: 바위(큰 돌)는 못 넘음
      if (game.giantAt(t) >= 0 || game.snakeAtHead(t)) continue;
      out.push([w, t]);
    }
    return out;
  }

  // ---------- 아이템 ----------
  // R_ITEMS: 도망자 가방 표시 순서(샷건은 기본 스킬), R_SPAWN: 맵에 떨어지는 도망자 아이템 (v16: 샷건 대신 벽넘기)
  const R_ITEMS = ['shotgun', 'slayer', 'smoke', 'boost', 'cloak', 'vault', 'barricade'];
  const R_SPAWN = ['smoke', 'boost', 'cloak', 'vault', 'barricade'];
  const G_ITEMS = ['roar', 'tracker', 'barricade'];
  const ITEM_INFO = {
    smoke: { name: '연막탄', obj: '연막탄을', icon: '💨' }, boost: { name: '부스터', obj: '부스터를', icon: '🚀' }, cloak: { name: '투명망토', obj: '투명망토를', icon: '👻' },
    shotgun: { name: '샷건', obj: '샷건을', icon: '🔫' }, vault: { name: '벽넘기', obj: '벽넘기 신발을', icon: '🤸' }, barricade: { name: '바리케이드', obj: '바리케이드를', icon: '🧱' },
    slayer: { name: '번개창', obj: '번개창을', icon: '🔱' },
    roar: { name: '포효 뿔피리', obj: '포효 뿔피리를', icon: '🔊' }, tracker: { name: '냄새 추적기', obj: '냄새 추적기를', icon: '🐾' },
  };
  function freshThreats(game) {
    const R = game.runner, out = [];
    game.giants.forEach((G, k) => { if (game.turn - R.knownTurn[k] <= 1 && R.known[k] >= 0 && G.stun <= 0 && G.out <= 0) out.push(k); });
    return out;
  }
  function cellFree(game, c) {
    const m = game.map;
    return m.g[c] === 0 && !m.isExit[c] && !m.isMission[c] && !(m.lvl && m.lvl[c] === m.B1) && !(m.stairOf[c] >= 0) && !game.keysLeft.includes(c) && !game.items.some((it) => it.cell === c) && !game.pills.includes(c) && game.giantAt(c) < 0 && c !== game.runner.pos && !game.snakes.some((S) => S.body.includes(c));
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
    const m = game.map, R = game.runner, g = game.rg, inv = R.inv, usedBefore = R.used;
    // v21 번개창: 같은 줄 SLAYER_RANGE칸 안, 벽에 안 막힌 거인을 처치 (이번 판 동안 사라짐)
    if (R.spearCd > 0) R.spearCd--;
    if (inv.slayer > 0 && !(R.spearCd > 0)) {
      let tk = -1, td = 99;
      for (const G of game.giants) {
        if (G.out > 0) continue;
        const dx = G.pos % m.W - R.pos % m.W, dy = ((G.pos / m.W) | 0) - ((R.pos / m.W) | 0), d = Math.abs(dx) + Math.abs(dy);
        if ((CFG.SLAYER_LINE && dx !== 0 && dy !== 0) || d > CFG.SLAYER_RANGE || d < 1 || !lineOfSight(m, R.pos, G.pos)) continue; // v24: 번개는 시야 안이면 대각선도 맞힘
        if (d < td) { td = d; tk = G.id; }
      }
      if (tk >= 0) { game.slay(tk); return; }
    }
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
    // v19 뷱 사격: 뷱이 위험할 만큼 먹었고 거인을 노리고 있으면 샷건으로 뷱을 기절시킴
    if (inv.shotgun > 0 && R.used === usedBefore) {
      const press = snakePressure(game), sgn = g.snakeShot ?? 0.3;
      for (const S of game.snakes) {
        if (press <= 0 || S.hidden > 0 || S.stun > 0) continue;
        if (!(press >= 1 - sgn * 1.2 || (S.mode === '거인 사냥' && press >= 0.5 - sgn * 0.5))) continue;
        const h = S.body[0], dx = h % m.W - R.pos % m.W, dy = ((h / m.W) | 0) - ((R.pos / m.W) | 0), d = Math.abs(dx) + Math.abs(dy);
        if ((dx !== 0 && dy !== 0) || d < 1 || d > Math.min(CFG.SHOTGUN_RANGE, 1 + Math.round(sgn * 3)) || !lineOfSight(m, R.pos, h)) continue;
        inv.shotgun--; R.used++;
        const hit = game.rng() < Math.max(0.1, CFG.SHOTGUN_HIT - (d - 1) * CFG.SHOTGUN_FALLOFF);
        game.fx.push({ t: 'shot', from: R.pos, to: h, giant: -1, snake: S.id, miss: !hit, turn: game.turn });
        if (CFG.SHOT_NOISE > 0) { const dn = bfsC(m, R.pos, 2); for (const H of game.giants) if (H.stun <= 0 && H.out <= 0 && dn[H.pos] <= CFG.SHOT_NOISE) { H.know = R.pos; H.knowTurn = game.turn; } }
        if (hit) { S.stun = secTurns(CFG.SNAKE_STUN_SEC); S.wait = 0; game.snakeBlocks.shot++; game.fx.push({ t: 'snakeStun', cell: h, snake: S.id, turn: game.turn }); game.log('snakeBlock', `🛡️ 도망자가 뷱을 쐈다! 🔫 뷱 ${CFG.SNAKE_STUN_SEC}초 기절 — 거인 사냥을 막았다 (뷱 ${game.snakeAte.giants}/${CFG.SNAKE_WIN_EATS})`); }
        else game.log('shot', `도망자가 뷱을 쐈지만 빗나갔다! 🔫💨 샷건 ${inv.shotgun}/${CFG.SHOTGUN_AMMO}`);
        break;
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

  // ---------- 뷱(뱀) AI (v19: 학습하는 세 번째 편) ----------
  // 유전자: 사냥 감각(알아채는 거리) · 끈질긴 추격 · 알약 욕심 · 부활 지점 매복 · 층 이동 · 갈림길 매복 · 달려들기 · 도망자 피하기
  // 도망자의 '뷱 막기' 긴급도 (0이면 신경 안 씀, 1이면 최우선). 뷱이 먹은 수가 유전자에 따른 기준을 넘으면 커짐
  function snakePressure(game) {
    const W = CFG.SNAKE_WIN_EATS, e = game.snakeAte.giants, T = W * (0.9 - 0.65 * (game.rg.snakeStop ?? 0.4));
    return e <= T ? 0 : clamp01((e - T) / Math.max(1, W - T));
  }
  function snakePlan(game, S) {
    const m = game.map, sg = game.sg, head = S.body[0], dH = bfsC(m, head, 3);
    const calm = game.turn < (S.ignoreUntil || 0); // 막혀서 못 가면 잠시 사냥을 포기하고 어슬렁
    const sense = 1 + Math.round(sg.sHunt * CFG.SNAKE_SENSE_MAX);
    let prey = -1, pd = Infinity;
    if (!calm) {
      for (const G of game.giants) { if (G.out > 0) continue; const d = dH[G.pos] - (G.stun > 0 ? 2 : 0); if (d <= sense && d < pd) { pd = d; prey = G.id; } }
      if (prey >= 0) { S.preyId = prey; S.preyTurn = game.turn; }
      else if (S.preyId >= 0 && game.turn - S.preyTurn <= Math.round(sg.sChase * 25)) { const G = game.giants[S.preyId]; if (G && G.out <= 0 && dH[G.pos] < 999) { prey = G.id; pd = dH[G.pos]; } }
    }
    if (prey >= 0) { S.wait = 0; S.mode = '거인 사냥'; return { tgt: game.giants[prey].pos, prey, pd, dH }; }
    // 부활 지점 매복: 곧 부활할 거인의 출발점 근처(안전 거리 바로 밖)에서 기다림
    if (!calm && sg.sCamp > 0.15) {
      let best = -1, bd = Infinity;
      for (const G of game.giants) { if (G.out <= 0 || G.out > 8 + sg.sCamp * 45) continue; const c = m.giantStarts[G.id], d = dH[c]; if (d < bd) { bd = d; best = c; } }
      if (best >= 0 && bd < 999) { S.mode = '부활 매복'; if (bd <= CFG.SNAKE_SPAWN_SAFE + 1) return { wait: true, dH }; return { tgt: best, prey: -1, pd: 999, dH }; }
    }
    // 알약: '알약 욕심'만큼 먼 곳까지
    if (!calm) {
      const reach = 3 + Math.round(sg.sPill * 30); let bp = -1;
      for (const p of game.pills) if (dH[p] <= reach && (bp < 0 || dH[p] < dH[bp])) bp = p;
      if (bp >= 0) { S.mode = '알약 찾기'; return { tgt: bp, prey: -1, pd: 999, dH }; }
    }
    // 갈림길 매복: 갈림길에서 잠시 멈춰 기다림
    if (S.wait > 0) { S.wait--; S.mode = '매복'; return { wait: true, dH }; }
    if ((m.sNbrs[head] || []).length >= 3 && S.lastWaitAt !== head && game.rng() < sg.sAmbush * 0.35) { S.wait = Math.round(sg.sAmbush * 30); S.lastWaitAt = head; S.mode = '매복'; return { wait: true, dH }; }
    S.mode = '어슬렁';
    if (S.patrol < 0 || S.patrol === head || dH[S.patrol] >= 999 || game.rng() < 0.02) {
      S.patrol = -1;
      // 층 이동: 다른 층에 활동 중인 거인이 더 많으면 계단으로
      if (m.stairs && m.stairs.length && game.rng() < sg.sFloor) {
        const cnt = [0, 0]; for (const G of game.giants) if (G.out <= 0) cnt[floorOf(m, G.pos)]++;
        const f = floorOf(m, head);
        if (cnt[1 - f] > cnt[f]) { let st = -1; for (const [a, b] of m.stairs) for (const c of [a, b]) if (floorOf(m, c) !== f && dH[c] < 999 && (st < 0 || dH[c] < dH[st])) st = c; if (st >= 0) S.patrol = st; }
      }
      if (S.patrol < 0) { const c = m.floor.filter((i) => dH[i] < 999 && dH[i] >= 4); S.patrol = c.length ? c[Math.floor(game.rng() * c.length)] : head; }
    }
    return { tgt: S.patrol, prey: -1, pd: 999, dH };
  }
  function snakeMoveOnce(game, S, tgt) {
    const m = game.map, R = game.runner, sg = game.sg, head = S.body[0];
    const dT = bfsC(m, tgt, 3), body = new Set(S.body.slice(0, -1));
    // 도망자 피하기: 도망자 가까운 칸은 꺼림 (꼬리 잡기·샷건 피하기). 코앞 사냥 중엔 무시
    const dr = Math.round(sg.sDodge * 6), dRun = dr > 0 && S.mode !== '거인 사냥' ? bfsC(m, R.pos, 0) : null;
    let nx = -1, bd = Infinity;
    for (const c of (m.sNbrs[head] || [])) { if (body.has(c)) continue; let v = dT[c] + game.rng() * 0.1; if (dRun && dRun[c] <= dr) v += (dr - dRun[c] + 1) * 1.5; if (v < bd) { bd = v; nx = c; } }
    if (nx < 0) { // 막다른 곳: 몸을 뒤집어 꼬리 쪽으로 빠져나감 (영원히 길을 막지 않게)
      if (new Set(S.body).size > 1) { S.body.reverse(); S.prevBody = S.body.slice(); game._sb = null; S.floor = floorOf(m, S.body[0]); }
      S.stall = (S.stall || 0) + 1; if (S.stall > 4) { S.ignoreUntil = game.turn + 30; S.patrol = -1; S.stall = 0; }
      return false;
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
    const gi = game.giantAt(nx); if (gi >= 0) { game.eatGiant(S, gi); return true; }
    return false;
  }
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
    if (S.lungeCd > 0) S.lungeCd--;
    if (S.stun > 0) { S.stun--; S.mode = '기절'; return; }
    if (S.rest > 0) { S.rest--; S.mode = '소화 중'; return; }
    const plan = snakePlan(game, S);
    if (plan.wait) return;
    let moves = CFG.SNAKE_SKIP > 0 && game.turn % CFG.SNAKE_SKIP === 0 ? 0 : 1; // v21: SNAKE_SKIP 0 = 매 턴 이동
    const lr = 1 + Math.round(game.sg.sLunge * CFG.SNAKE_LUNGE_MAX);
    if (plan.prey >= 0 && S.lungeCd === 0 && plan.pd >= 1 && plan.pd <= lr) { moves = 2; S.lungeCd = CFG.SNAKE_LUNGE_CD; S.lunge = game.turn; game.fx.push({ t: 'lunge', cell: S.body[0], snake: S.id, giant: plan.prey, turn: game.turn }); }
    for (let s = 0; s < moves; s++) { if (snakeMoveOnce(game, S, plan.tgt) || game.result) break; }
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
    let list = m.gNbrs[from].filter((c) => game.giantAt(c) < 0 && !(sb && sb.has(c)) && !game.snakeAtHead(c) && !game.dinoHits(c)); // 동료·뷱 몸통·공룡이 있는 칸은 못 감
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
    // v21 공룡 피하기: 지하에서 공룡 근처를 돌아감
    let dD = null; const dr = Math.round((g.dinoDodge ?? 0.5) * 5);
    if (game.dinos.length && dr > 0 && floorOf(game.map, G.pos) === game.map.B1) for (const D of game.dinos) { const d = bfsC(game.map, D.pos, 0); if (d[G.pos] <= dr + 4 && (!dD || d[G.pos] < dD[G.pos])) dD = d; }
    for (const c of giantMoves(game, k, G.pos)) {
      let v = scoreFn(c) + g.spread * 0.6 * crowd(game, k, c) + game.rng() * 0.01;
      for (const d of heads) if (d[c] <= r) v += (r - d[c] + 1) * 6;
      if (dD && dD[c] <= dr) v += (dr - dD[c] + 1) * 8;
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
    { const rk = giantRock(game, k); if (rk >= 0) return rk; } // v22: 바위로 탈출로 막기
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
    { const rs = rockSearch(game, k); if (rs >= 0) return rs; } // v24: 지하에서 숨은 바위 찾기
    if (G.patrol < 0 || G.patrol === G.pos || game.rng() < 0.02) {
      let bestT = -1, bestS = -Infinity;
      const tries = game.rng() < g.spread ? 4 : 1;
      for (let t = 0; t < tries; t++) {
        // v21: '지하 수색'만큼 가끔 지하 칸을 순찰 목표로
        const pool = m.b1Floor && m.b1Floor.length && game.rng() < (g.deepPatrol ?? 0.2) * 0.25 ? m.b1Floor : (m.surfFloor || m.floor);
        let c, guard = 0; do c = pool[Math.floor(game.rng() * pool.length)]; while ((m.isExit[c] || m.nearDoor[c] || m.g[c] !== 0) && ++guard < 50);
        const s = Math.min(...game.giants.filter((H) => H.id !== k).map((H) => manhattan(m, c, H.pos)), 99);
        if (s > bestS) { bestS = s; bestT = c; }
      }
      G.patrol = bestT;
    }
    G.goal = G.patrol; const d = bfsC(m, G.patrol, 2);
    return pickMove(game, k, (c) => d[c]);
  }

  // v24 바위 찾기: 쓸 수 있는 바위를 아직 모르면 '바위 찾기'만큼 지하의 안 가 본 곳을 뒤짐 (열쇠가 줄수록 더 급해짐)
  function rockSearch(game, k) {
    const m = game.map, G = game.giants[k], g = game.gg[k];
    if (m.B1 < 0 || !game.boulders.length || !(game.rockKnown && game.rockKnown.length)) return -1;
    if (game.boulders.some((B, bi) => game.rockKnown[bi] && !B.gone && B.carried < 0 && !game.blockInfo(B.cell))) { if (G.mode === '바위 찾기') { G.mode = '탐색'; G.rseek = -1; } return -1; }
    if (!game.boulders.some((B, bi) => !game.rockKnown[bi] && !B.gone)) return -1;
    const seek = g.rockSeek ?? 0.4, urg = game.hasAllKeys() ? 1 : 1 / (1 + game.keysLeft.length);
    const want = seek * (0.6 + urg) + (g.rockDoor ?? 0.4) * 0.3;
    if (want < CFG.ROCK_SEEK_P) { if (G.mode === '바위 찾기') G.mode = '탐색'; return -1; }
    const others = game.giants.filter((H) => H.id !== k && H.out <= 0 && H.mode === '바위 찾기').length;
    if (G.mode !== '바위 찾기' && others >= 1 + Math.floor(seek * 2)) return -1; // 너무 많이 몰려가지 않음
    if (!(G.rseek >= 0) || G.pos === G.rseek || game.gB1seen[G.rseek] || game.rng() < 0.01) {
      const pool = m.b1Floor.filter((c) => !game.gB1seen[c] && m.g[c] === 0); if (!pool.length) return -1;
      let best = -1, bd = Infinity; const dG = bfsC(m, G.pos, 2);
      for (let t = 0; t < 12; t++) { const c = pool[Math.floor(game.rng() * pool.length)]; const d = dG[c] + game.rng() * 10; if (d < bd) { bd = d; best = c; } }
      if (best < 0 || bd >= 999) return -1; G.rseek = best;
    }
    if (G.mode !== '바위 찾기') game.log('boulderSeek', `🪨 거인${k + 1}이 지하로 바위를 찾으러 간다…`);
    G.mode = '바위 찾기'; G.goal = G.rseek; const d = bfsC(m, G.rseek, 2);
    if (!(d[G.pos] < 999)) { G.rseek = -1; return -1; }
    return pickMove(game, k, (c) => d[c]);
  }
  // ---------- v22 거인 바위 AI: 도망자의 탈출로(지하→지상 해치, 출구 문 앞)를 바위로 막음 ----------
  // v24: 들고 있던 바위를 내려놓음 (거인 발밑 근처의 빈 바닥, 없으면 원래 자리 근처)
  function setRock(game, B, c) {
    if (game.map.pristine !== false) game.map = cloneMap(game.map);
    const m = game.map; m.g[c] = 3; m.breakable[c] = 0; finalizeGraphs(m); B.cell = c; B.carried = -1; B.since = -1; B.since0 = game.blockInfo(c) ? game.turn : -1;
  }
  function releaseCarry(game, k) {
    const G = game.giants[k], B = game.boulders.find((b) => b.carried === k); if (!B) return;
    const m = game.map, ok = (c) => game.boulderFree(c) && m.stairOf[c] < 0 && !(m.doorFront || []).includes(c) && (m.nbrs[c] || []).length >= 2;
    for (const start of [G.eatenAt ?? G.pos, G.pos, B.home]) {
      const q = [start], seen = new Set(q);
      for (let i = 0; i < q.length && i < 400; i++) { const c = q[i]; if (ok(c) && escapeOk(game, -1, c)) { setRock(game, B, c); game.log('boulderDrop', `🪨 거인${k + 1}이 들고 있던 바위를 떨어뜨렸다`); return; } for (const n of m.nbrs[c] || []) if (!seen.has(n) && m.g[n] === 0) { seen.add(n); q.push(n); } }
    }
    B.carried = -1; B.gone = true; // 놓을 곳이 전혀 없으면 사라짐 (거의 없음)
  }
  function dropRock(game, k) {
    const G = game.giants[k]; if (!G || !G.rock) return;
    if (G.rock.carry && G.rock.stage === 'carry') releaseCarry(game, k);
    const B = game.boulders[G.rock.bi]; if (B && B.by === k) B.by = -1;
    G.rock = null; if (G.mode === '바위 밀기' || G.mode === '바위 나르기') G.mode = '탐색';
  }
  function pickRock(game, k) {
    const m = game.map, G = game.giants[k], g = game.gg[k];
    const use = g.rockUse ?? 0.4, door = g.rockDoor ?? 0.4, goals = [];
    const fresh = G.know >= 0 && game.turn - G.knowTurn <= 40;
    // 1) 지하에 있는 도망자가 올라갈 해치 (가까운 순 2개)
    if (fresh && m.B1 >= 0 && m.lvl[G.know] === m.B1 && use > 0.03) {
      const dK = bfsC(m, G.know, 0);
      m.hatches.map(([, b], i) => ({ i, b, d: dK[b] })).filter((h) => m.g[h.b] === 0 && h.d < 999).sort((x, y) => x.d - y.d).slice(0, 2)
        .forEach((h) => goals.push({ kind: 'hatch', target: h.b, race: h.d }));
    }
    // 2) 출구 문 앞: 열쇠를 다 모았으면 언제나, 아니면 '문 막기'가 높을수록 일찍 (도망자에게 가까운 문)
    const urg = game.hasAllKeys() ? 1 : 1 / (1 + game.keysLeft.length);
    if (m.doorFront && urg + door >= 1) {
      const dF = bfsC(m, fresh ? G.know : runnerObjective(game, m.runnerStart), 0);
      const ds = m.doorFront.map((c, i) => ({ c, d: dF[m.exits[i]] })).filter((x) => x.c >= 0 && m.g[x.c] === 0).sort((a, b) => a.d - b.d);
      if (ds.length) goals.push({ kind: 'door', target: ds[0].c, race: 999 });
    }
    if (!goals.length) return false;
    const dG = bfsC(m, G.pos, 2), maxCost = 10 + use * 40, W = m.W;
    const okCell = (c) => game.boulderFree(c) || c === G.pos;
    let best = null;
    for (const go of goals) game.boulders.forEach((B, bi) => {
      if (B.gone || B.carried >= 0 || !game.rockKnown[bi] || (B.by >= 0 && B.by !== k) || floorOf(m, B.cell) !== floorOf(m, go.target) || game.blockInfo(B.cell)) return; // 이미 막고 있는 바위는 그대로 둠
      const near = Math.min(dG[B.cell + 1], dG[B.cell - 1], dG[B.cell + W], dG[B.cell - W]);
      if (near >= 999 || near + manhattan(m, B.cell, go.target) > maxCost) return;
      const plan = boulderPlan(m, B.cell, go.target, okCell, CFG.BOULDER_MAX_PUSH, dG); if (!plan) return;
      const cost = dG[2 * plan[0] - plan[1]] + plan.length - 1;
      if (cost > maxCost || (go.kind === 'hatch' && cost > go.race + use * 25)) return;
      if (!best || cost < best.cost) best = { ...go, bi, plan, cost };
    });
    // v24: 문 앞 바위는 지하에서 들고 와야 함 — 지하 바위를 집으러 가서(가까운 순) 해치로 들고 올라와 문 앞에 내려놓음
    for (const go of goals) {
      if (go.kind !== 'door' || (best && best.kind === 'door')) continue;
      const dT = bfsC(m, go.target, 2), lim = CFG.CARRY_MAX + door * CFG.CARRY_GENE;
      game.boulders.forEach((B, bi) => {
        if (B.gone || B.carried >= 0 || !game.rockKnown[bi] || (B.by >= 0 && B.by !== k) || m.lvl[B.cell] !== m.B1 || game.blockInfo(B.cell)) return;
        let pk = -1, pd = 999; for (const n of [B.cell + 1, B.cell - 1, B.cell + m.W, B.cell - m.W]) if (dG[n] < pd && m.g[n] === 0) { pd = dG[n]; pk = n; }
        if (pk < 0 || dT[pk] >= 999) return;
        const cost = pd + dT[pk] * CFG.CARRY_SLOW;
        if (cost > lim * CFG.CARRY_SLOW * 0.6) return;
        if (!best || best.kind !== 'door' || cost < best.cost) best = { ...go, bi, carry: true, pick: pk, cost };
      });
    }
    if (!best) { G.rockCd = 12; return false; }
    if (best.carry) {
      G.rock = { bi: best.bi, carry: true, stage: 'fetch', target: best.target, kind: 'door', since: game.turn, wait: 0 };
      game.boulders[best.bi].by = k; G.mode = '바위 나르기';
      const nm = game.blockInfo(best.target);
      game.log('boulderGo', `🪨 거인${k + 1}이 지하의 바위를 가지러 간다… (${nm ? nm[0] + nm[1] : '문을'} 막으러)`);
      game.rockStats.carryTry = (game.rockStats.carryTry || 0) + 1;
      return true;
    }
    G.rock = { bi: best.bi, plan: best.plan, target: best.target, kind: best.kind, since: game.turn, wait: 0 };
    game.boulders[best.bi].by = k; G.mode = '바위 밀기';
    const nm = game.blockInfo(best.target);
    if (nm) game.log('boulderGo', `🪨 거인${k + 1}이 바위를 밀기 시작했다… (${nm[0]}${nm[1]} 막으러)`);
    return true;
  }
  // 바위 밀기 중이면 이번 턴에 갈 칸(밀면 바위가 있던 칸)을 돌려줌, 아니면 -1
  function giantRock(game, k) {
    const m = game.map, G = game.giants[k], R = game.runner;
    if (!game.boulders || !game.boulders.length) return -1;
    if (G.rockCd > 0) G.rockCd--;
    if (G.rock && G.rock.carry && G.rock.stage === 'carry') return carryStep(game, k); // 바위를 든 거인은 추격 못 함 (느릿느릿 문으로)
    if (G.knowTurn === game.turn && bfsC(m, R.pos, 2)[G.pos] <= 5) { if (G.rock) dropRock(game, k); return -1; } // 코앞의 도망자는 바로 추격
    if (!G.rock) {
      if (G.rockCd > 0 || (game.turn + k) % CFG.BOULDER_PLAN_EVERY) return -1;
      if (!pickRock(game, k)) return -1;
    }
    if (G.rock.carry) return carryStep(game, k);
    const P = G.rock, B = game.boulders[P.bi], i = P.plan.indexOf(B.cell);
    if (i < 0 || i >= P.plan.length - 1 || B.by !== k || game.turn - P.since > CFG.BOULDER_PLAN_TURNS || m.g[P.target] !== 0) { dropRock(game, k); G.rockCd = 10; return -1; }
    const n = P.plan[i + 1], from = 2 * B.cell - n;
    G.mode = '바위 밀기'; G.goal = from;
    if (G.pos === from) {
      if (!game.boulderFree(n)) { if (++P.wait > 6) { dropRock(game, k); G.rockCd = 10; return -1; } return G.pos; }
      if ((P.effort = (P.effort || 0) + 1) < CFG.BOULDER_PUSH_TURNS) return G.pos; // 무거운 바위: 한 칸 미는 데 여러 턴 (힘주는 중)
      P.effort = 0;
      if (!escapeOk(game, B.cell, n)) { game.rockStats.refused++; dropRock(game, k); G.rockCd = CFG.BOULDER_CD; return -1; } // 공정 규칙: 모든 길을 막는 밀기는 금지
      const old = B.cell; game.pushBoulder(P.bi, n, k);
      if (n === P.target) {
        const nm = game.blockInfo(n);
        if (nm) {
          game.rockStats[nm[3]]++;
          game.fx.push({ t: 'boulderBlock', cell: n, giant: k, kind: nm[3], turn: game.turn });
          game.log('boulder', nm[3] === 'door' ? `🪨 거인${k + 1}이 바위를 밀어 ${nm[0]}${nm[1]} 막았다! 도망자는 그 문으로 못 나간다` : nm[3] === 'hatch' ? `🪨 거인${k + 1}이 바위를 밀어 ${nm[0]}${nm[1]} 막았다! 도망자의 탈출로가 막혔다` : `🪨 거인${k + 1}이 바위를 밀어 계단을 막았다! 도망자의 길이 막혔다`);
        }
        dropRock(game, k); G.rockCd = CFG.BOULDER_CD;
      }
      return old;
    }
    const dF = bfsC(m, from, 2); if (!(dF[G.pos] < 999)) { dropRock(game, k); G.rockCd = 20; return -1; }
    return pickMove(game, k, (c) => dF[c]);
  }

  // v24 바위 나르기: fetch(바위 옆으로) → 집어 듦 → carry(3턴에 1칸, 해치로 올라가 문 앞 옆칸까지) → 문 앞에 내려놓음
  function carryStep(game, k) {
    const m = game.map, G = game.giants[k], P = G.rock, B = game.boulders[P.bi];
    if (!B || B.gone || game.turn - P.since > CFG.CARRY_TURNS || (P.stage === 'fetch' && (B.carried >= 0 || game.blockInfo(B.cell)))) { dropRock(game, k); G.rockCd = 20; return -1; }
    if (P.stage === 'fetch') {
      G.mode = '바위 나르기';
      if ([B.cell + 1, B.cell - 1, B.cell + m.W, B.cell - m.W].includes(G.pos)) { // 집어 듦
        if (m.g[P.target] !== 0) { dropRock(game, k); G.rockCd = 10; return -1; }
        if (m.pristine !== false) game.map = cloneMap(m);
        const mm = game.map; mm.g[B.cell] = 0; finalizeGraphs(mm); B.carried = k; B.cell = G.pos; P.stage = 'carry'; P.slow = 0;
        game.fx.push({ t: 'boulder', from: G.pos, to: G.pos, cell: G.pos, giant: k, turn: game.turn });
        game.log('boulderLift', `🪨 거인${k + 1}이 끙차! 바위를 들어 올렸다 — 느릿느릿 출구로 나른다`);
        game.rockStats.lift = (game.rockStats.lift || 0) + 1;
        return G.pos;
      }
      let dB = null, bd = 999;
      for (const n of [B.cell + 1, B.cell - 1, B.cell + m.W, B.cell - m.W]) { if (m.g[n] !== 0) continue; const d = bfsC(m, n, 2); if (d[G.pos] < bd) { bd = d[G.pos]; dB = d; } }
      if (!dB) { dropRock(game, k); G.rockCd = 20; return -1; }
      return pickMove(game, k, (c) => dB[c]);
    }
    // carry
    G.mode = '바위 나르기'; B.cell = G.pos;
    const dT = bfsC(m, P.target, 2);
    if (dT[G.pos] <= 1 && G.pos !== P.target) {
      if (m.g[P.target] === 3) { dropRock(game, k); G.rockCd = 10; return -1; } // 이미 다른 바위로 막힘 → 근처에 내려놓음
      if (!game.boulderFree(P.target)) { if (++P.wait > 30) { dropRock(game, k); G.rockCd = 10; return -1; } return G.pos; }
      setRock(game, B, P.target); B.pushes++; game.rockStats.pushes++;
      const nm = game.blockInfo(P.target); game.rockStats.door++; game.rockStats.carried = (game.rockStats.carried || 0) + 1;
      game.fx.push({ t: 'boulderBlock', cell: P.target, giant: k, kind: 'door', turn: game.turn });
      game.log('boulder', `🪨 거인${k + 1}이 지하에서 들고 온 바위로 ${nm[0]}${nm[1]} 막았다! 도망자는 그 문으로 못 나간다`);
      if (B.by === k) B.by = -1; G.rock = null; G.mode = '탐색'; G.rockCd = CFG.BOULDER_CD;
      return G.pos;
    }
    if ((P.slow = (P.slow || 0) + 1) % CFG.CARRY_SLOW) return G.pos; // 무거워서 아주 느림
    if (!(dT[G.pos] < 999)) { dropRock(game, k); G.rockCd = 20; return -1; }
    return pickMove(game, k, (c) => (c === P.target ? 999 : dT[c]));
  }
  // ---------- v21 공룡 AI ----------
  // 2턴에 1번 움직임. 지하에서 보이는 가장 가까운 생물(도망자·거인)을 쫓고, 놓치면 잠시 마지막 위치로, 아니면 큰 복도를 어슬렁
  // v23 공룡: 시야는 좁고 짧음(앞쪽 부채꼴), 평소엔 아주 느림. 주로 냄새(도망자·거인 발자국, 시간이 지나면 옅어짐)를 따라감. 먹잇감을 보면 돌격!
  function dinoSees(game, D, c) {
    const m = game.map, W = m.W; if (m.lvl[c] !== m.B1) return false;
    const cx = D.pos % W + 0.5, cy = ((D.pos / W) | 0) + 0.5, dx = c % W - cx, dy = ((c / W) | 0) - cy, d = Math.hypot(dx, dy);
    if (d > CFG.DINO_SIGHT) return false;
    if (d > 1.5 && (dx * D.facing[0] + dy * D.facing[1]) / d < CFG.DINO_CONE) return false; // 앞쪽 좁은 부채꼴만
    return game.dinoCells(D).some((x) => lineOfSight(m, x, c));
  }
  function dinoStep(game, D) {
    const m = game.map, R = game.runner, W = m.W;
    D.prev = D.pos; D.path = [D.pos];
    if (D.chargeCd > 0) D.chargeCd--;
    // 1) 눈: 앞쪽 좁은 부채꼴 안의 먹잇감 → 돌격 (쿨다운이면 냄새 추적 속도로 쫓음)
    let tgt = -1, who = null, best = 1e9;
    if (game.turn >= D.ignoreUntil) {
      const consider = (c, id) => { if (!dinoSees(game, D, c)) return; const d = manhattan(m, D.pos, c); if (d < best) { best = d; tgt = c; who = id; } };
      if (!R.cloak) consider(R.pos, -1); for (const G of game.giants) if (G.out <= 0) consider(G.pos, G.id);
    }
    if (tgt >= 0 && D.mode !== '돌격' && D.chargeCd <= 0) {
      D.mode = '돌격'; D.charge = CFG.DINO_CHARGE_TURNS; D.chargeCd = CFG.DINO_CHARGE_CD; D.prey = who;
      game.fx.push({ t: 'dinoRoar', cell: D.pos, prey: who, turn: game.turn });
      game.log('dino', who < 0 ? '🦖 공룡이 도망자를 발견하고 돌격한다! 쿵쾅쿵쾅' : `🦖 공룡이 거인${who + 1}에게 돌격한다!`);
    }
    if (D.mode === '돌격') { // 돌격 중엔 먹잇감을 놓치지 않음 (짧게)
      const P = D.prey; const pc = P < 0 ? R.pos : game.giants[P] && game.giants[P].out <= 0 ? game.giants[P].pos : -1;
      if (pc >= 0 && m.lvl[pc] === m.B1) tgt = pc; else tgt = -1;
      if (--D.charge <= 0 || tgt < 0) { D.mode = '냄새 추적'; D.charge = 0; }
    }
    // 2) 코: 주변(DINO_SMELL칸)에서 가장 신선한 발자국 냄새
    if (D.mode === '냄새 추적' && game.turn - (D.lastScent ?? 0) > 80 && game.rng() < CFG.DINO_LOSE_P) { D.mode = '어슬렁'; D.noseOff = game.turn + CFG.DINO_NOSE_OFF; } // v23: 신선한 냄새는 거의 안 놓침 (오래된 냄새만 가끔)
    if (D.mode !== '돌격' && tgt < 0 && game.turn >= (D.noseOff || 0)) {
      let fresh = -1, sc = -1; const age = CFG.DINO_SMELL_AGE, x0 = D.pos % W, y0 = (D.pos / W) | 0, r = CFG.DINO_SMELL;
      for (let yy = y0 - r; yy <= y0 + 1 + r; yy++) for (let xx = x0 - r; xx <= x0 + 1 + r; xx++) {
        if (xx < 1 || xx >= W - 1) continue; const c = yy * W + xx; if (c < 0 || c >= m.g.length || m.lvl[c] !== m.B1 || m.g[c] !== 0) continue;
        const t = Math.max(R.cloak ? -999 : game.scent[c], game.gscent ? game.gscent[c] : -999);
        if (t > fresh && game.turn - t <= age && !game.dinoHits(c)) { fresh = t; sc = c; }
      }
      if (sc >= 0) {
        if (D.mode !== '냄새 추적' && game.turn - (D.sniffLog ?? -999) > 40) { D.sniffLog = game.turn; game.fx.push({ t: 'dinoSniff', cell: D.pos, turn: game.turn }); game.log('dinoSniff', '🦖 공룡이 냄새를 맡았다… 킁킁'); }
        D.mode = '냄새 추적'; tgt = sc; D.lastScent = fresh;
      } else if (D.mode === '냄새 추적') { D.mode = '어슬렁'; D.roam = -1; }
    }
    if (tgt < 0 && D.mode !== '어슬렁') D.mode = '어슬렁';
    // 3) 속도: 어슬렁(아주 느림) < 냄새 추적 < 쫓기(보임) < 돌격
    const sp = D.mode === '돌격' ? CFG.DINO_CHARGE_SPEED : tgt >= 0 && who !== null ? CFG.DINO_TRACK_SPEED : D.mode === '냄새 추적' ? CFG.DINO_SNIFF_SPEED : CFG.DINO_SPEED;
    D.acc = (D.acc || 0) + sp; if (D.acc < 1) return; D.acc -= 1;
    // v23: 공룡은 지도를 모름 — 주변 몇 칸(DINO_FEEL)만 더듬어 길을 찾고, 냄새·눈에 보이는 것만 쫓음. 평소엔 덜 가 본 쪽으로 어슬렁 (길을 잃기도 함)
    const others = game.dinos.filter((X) => X !== D);
    const free = (n) => !(m.g[n] || m.g[n + 1] || m.g[n + W] || m.g[n + W + 1]) && !others.some((X) => Math.abs(X.pos % W - n % W) <= 1 && Math.abs(((X.pos / W) | 0) - ((n / W) | 0)) <= 1);
    if (!D.visit) D.visit = new Map();
    D.visit.set(D.pos, game.turn);
    let nx = -1;
    if (tgt >= 0) {
      const goal = new Set(dinoAnchors(m, tgt)), prev = new Map([[D.pos, -1]]), q = [D.pos], dep = new Map([[D.pos, 0]]); let hit = -1;
      for (let h = 0; h < q.length && hit < 0; h++) { const c = q[h]; if (goal.has(c)) { hit = c; break; } if (dep.get(c) >= CFG.DINO_FEEL) continue; for (const n of m.dNbrs[c] || []) if (!prev.has(n) && free(n)) { prev.set(n, c); dep.set(n, dep.get(c) + 1); q.push(n); } }
      if (hit >= 0 && hit !== D.pos) { let c = hit; while (prev.get(c) !== D.pos) c = prev.get(c); nx = c; }
      else if (hit < 0) { // 주변에서 못 찾으면 목표 쪽으로 무작정 (막히면 길을 잃음)
        let bd = manhattan(m, D.pos, tgt); for (const n of m.dNbrs[D.pos] || []) if (free(n)) { const d = manhattan(m, n, tgt) + game.rng() * 0.5; if (d < bd) { bd = d; nx = n; } }
      }
    } else {
      let bv = -Infinity; const fx = D.facing[0], fy = D.facing[1];
      for (const n of m.dNbrs[D.pos] || []) { if (!free(n)) continue; const last = D.visit.get(n) ?? -9999, dx = n % W - D.pos % W, dy = ((n / W) | 0) - ((D.pos / W) | 0);
        const v = Math.min(CFG.DINO_MEMORY, game.turn - last) * 0.1 + (dx === fx && dy === fy ? 3 : dx === -fx && dy === -fy ? -4 : 0) + game.rng() * 2.5; if (v > bv) { bv = v; nx = n; } }
      if (D.visit.size > 600) D.visit.clear();
    }
    // v23 멍청함: 냄새 맡다 멈춤 · 엉뚱한 쪽으로 감 · 방향 바꾸는 게 느림 (돌격 중엔 거의 안 그럼)
    if (D.mode === '냄새 추적' && game.rng() < CFG.DINO_PAUSE_P) { D.sniffT = game.turn; return; }
    if (D.mode !== '돌격' && game.rng() < CFG.DINO_WRONG_P) { const opts = (m.dNbrs[D.pos] || []).filter(free); if (opts.length) nx = opts[Math.floor(game.rng() * opts.length)]; }
    if (nx < 0) { if (++D.stall > 6) { D.stall = 0; if (D.mode !== '돌격') D.mode = '어슬렁'; D.facing = [-D.facing[0], -D.facing[1]]; } return; }
    const ndir = [nx % W - D.pos % W, ((nx / W) | 0) - ((D.pos / W) | 0)], rev = ndir[0] === -D.facing[0] && ndir[1] === -D.facing[1], same = ndir[0] === D.facing[0] && ndir[1] === D.facing[1];
    if (!same && (rev || (D.mode !== '돌격' && game.rng() < CFG.DINO_TURN_P))) { D.facing = rev && D.facing[0] === 0 ? [1, 0] : rev ? [0, 1] : ndir; D.turnT = game.turn; return; } // 몸을 돌리느라 한 걸음 씀 (뒤로는 두 번)
    D.stall = 0; D.facing = ndir; D.pos = nx; D.path.push(nx);
    if (game.dinoHits(R.pos)) return game.dinoEatsRunner();
    for (const G of game.giants) if (G.out <= 0 && game.dinoHits(G.pos)) game.dinoBite(G.id);
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
      this.snake = { genes: defaultSnake(), level: 1, sigma: 0.12 }; this.lastSnakeRate = 0;
      this.history = []; this.trainWins = { runner: 0, giant: 0, draw: 0, snake: 0 };
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
    trainGeneration(mapsPerGen) { const it = this.trainGen(mapsPerGen); let r; while (!(r = it.next()).done); return r.value; }
    // v21: 한 판마다 yield — 화면(방송)이 멈추지 않게 UI가 시간을 나눠 돌림
    *trainGen(mapsPerGen) {
      const k = mapsPerGen || CFG.MAPS_PER_GEN, rng = this.rng, prev = this.lastRate;
      this.runner.sigma = prev < 0.42 ? 0.2 : prev > 0.58 ? 0.07 : 0.12;
      this.giant.sigma = prev > 0.58 ? 0.18 : prev < 0.42 ? 0.06 : 0.1;
      const nR = prev < 0.45 ? 2 : 1, nG = prev > 0.55 ? 2 : 1;
      const R0 = this.runner.genes, G0 = this.giant.team;
      const Rs = [R0], Gs = [G0];
      for (let i = 0; i < nR; i++) Rs.push(mutate(R0, this.runner.sigma, rng));
      for (let i = 0; i < nG; i++) Gs.push(mutateTeam(G0, this.giant.sigma, rng));
      // v19: 뷱도 도전자와 겨룸 (판마다 돌아가며 배정, 먹은 거인 수/30 + 승리 보너스로 평가)
      if (!this.snake) this.snake = { genes: defaultSnake(), level: 1, sigma: 0.12 };
      const sPrev = this.lastSnakeRate || 0;
      this.snake.sigma = sPrev < 0.08 ? 0.18 : sPrev > 0.3 ? 0.07 : 0.12;
      const S0 = this.snake.genes, Ss = [S0];
      for (let i = 0; i < (sPrev < 0.1 ? 2 : 1); i++) Ss.push(mutate(S0, this.snake.sigma, rng));
      const sScore = Ss.map(() => 0), sCnt = Ss.map(() => 0);
      const rScore = Rs.map(() => 0), gScore = Gs.map(() => 0);
      let rw = 0, gw = 0, dw = 0, sw = 0, eats = 0, n = 0, wfound = 0, dinoR = 0, kills = 0, doorB = 0;
      for (let mi = 0; mi < k; mi++) {
        const seed = (rng() * 2 ** 32) >>> 0, map = generateMap(seed);
        for (let a = 0; a < Rs.length; a++) for (let b = 0; b < Gs.length; b++) {
          const si = (a + b + mi) % Ss.length;
          const game = new Game(map, Rs[a], Gs[b], seed + a * 7 + b * 13, Ss[si]);
          let tk = 0; while (!game.result) { game.step(); if (++tk % 30 === 0) yield -1; }
          const res = game.result; n++; eats += game.snakeAte.giants;
          if (game.weapon && game.weapon.taken) wfound++; if (game.rockStats && game.rockStats.door) doorB++; if (game.catcher === -4) dinoR++; kills += game.kills || 0;
          sCnt[si]++; sScore[si] += game.snakeAte.giants / CFG.SNAKE_WIN_EATS + (res === 'snake' ? 1 : 0);
          const prog = (map.keys.length - game.keysLeft.length + 0.5 * game.ms.filter((x) => x.done).length) / (map.keys.length * 1.5 + 1);
          if (res === 'runner') { rw++; rScore[a] += 1; }
          else if (res === 'giant') { gw++; rScore[a] += 0.15 * prog; if (game.catcher >= 0 && b === 0) { const c = this.giant.catches || (this.giant.catches = []); c[game.catcher] = (c[game.catcher] || 0) + 1; } gScore[b] += 1 - 0.3 * game.turn / CFG.MAX_TURNS; }
          else if (res === 'snake') { sw++; rScore[a] += 0.05 * prog; gScore[b] += 0; } // 뷱 승리는 도망자·거인 모두에게 패배
          else { dw++; rScore[a] += 0.1 * prog; gScore[b] += 0.4; }
          yield n;
        }
      }
      this.rounds += n; this.generation++;
      this.trainWins.runner += rw; this.trainWins.giant += gw; this.trainWins.draw += dw; this.trainWins.snake = (this.trainWins.snake || 0) + sw;
      this.lastRate = (rw + dw * 0.5) / Math.max(1, rw + gw + dw); this.lastSnakeRate = sw / n;
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
      const sAvg = sScore.map((v, i) => (sCnt[i] ? v / sCnt[i] : -1));
      const si = best(Ss, sAvg);
      if (si > 0) {
        for (const d of SNAKE_GENES) { const delta = Ss[si][d.key] - S0[d.key]; if (Math.abs(delta) >= 0.08) changes.push({ side: 'snake', gi: -1, key: d.key, label: d.label, delta, text: delta > 0 ? d.up : d.down }); }
        if (sAvg[si] > sAvg[0]) this.snake.level++;
        this.snake.genes = Ss[si];
      }
      const rec = { gen: this.generation, runner: rw / n, giant: gw / n, draw: dw / n, snake: sw / n, eats: eats / n, weapon: wfound / n, dino: dinoR / n, kills: kills / n, doorBlock: doorB / n, n };
      this.history.push(rec); if (this.history.length > 2000) this.history.shift();
      return { rec, changes, n, rAcc: ri > 0, gAcc: gi > 0, sAcc: si > 0 };
    }
    // 저장 형식은 v7 그대로 (예전 화면이 읽어도 지워지지 않게), 뷱 두뇌는 snake 필드로 추가
    toJSON() { return { v: 7, growWins: this.growWins, lastRate: this.lastRate, lastSnakeRate: this.lastSnakeRate, generation: this.generation, rounds: this.rounds, runner: this.runner, giant: this.giant, snake: this.snake, history: this.history, trainWins: this.trainWins }; }
    load(o) {
      if (!o || o.v !== 7 || !o.giant || !Array.isArray(o.giant.team) || o.giant.team.length < CFG.GIANTS || o.giant.team.length > CFG.GIANTS_MAX) return false;
      this.growWins = o.growWins || 0;
      Object.assign(this, { lastRate: o.lastRate ?? 0.5, generation: o.generation, rounds: o.rounds, runner: o.runner, giant: o.giant, history: o.history || [], trainWins: o.trainWins || { runner: 0, giant: 0, draw: 0 } });
      // 예전 저장(새 유전자 없음): 빠진 유전자는 기본값으로 채움 (진화한 값은 그대로)
      if (this.runner && this.runner.genes) this.runner.genes = Object.assign(defaultRunner(), this.runner.genes);
      // v21: 거인 팀에 새 유전자(지하 수색·공룡 피하기)가 없으면 기본값으로 채움
      this.giant.team = this.giant.team.map((gg) => Object.assign({ deepPatrol: 0.2, dinoDodge: 0.5, rockUse: 0.4, rockDoor: 0.4, rockSeek: 0.4 }, gg)); // v22: 바위 유전자
      // v19: 뷱 두뇌 (예전 저장본에는 없음 → Lv.1 기본 뷱으로 시작, 도망자·거인 기록은 그대로)
      this.snake = o.snake && o.snake.genes ? { level: o.snake.level || 1, sigma: o.snake.sigma || 0.12, genes: Object.assign(defaultSnake(), o.snake.genes) } : { genes: defaultSnake(), level: 1, sigma: 0.12 };
      this.lastSnakeRate = o.lastSnakeRate || 0;
      if (this.trainWins.snake == null) this.trainWins.snake = 0;
      return true;
    }
  }

  return { boulderPlan, escapeOk, dinoField, dinoAnchors, SNAKE_GENES, defaultSnake, snakePressure, CFG, floorOf, missionGoals, R_ITEMS, R_SPAWN, vaultMoves, G_ITEMS, ITEM_INFO, visibleCell, updateSeen, cloneMap, finalizeGraphs, smashChoice, giantSkip, giantsForWins, secTurns, giantHear, mulberry32, generateMap, bfs, bfsC, Game, Trainer, RUNNER_GENES, GIANT_GENES, defaultRunner, defaultGiantTeam, roleOf, mutate, sees, giantSees, lineOfSight };
});
