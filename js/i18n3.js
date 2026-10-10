/* 거인과 도망자 — 언어 (기본 영어, ?lang=ko 로 한국어 원문)
 * 게임 로직은 한국어 문자열(모드 이름 등)을 그대로 쓰고, 화면에 나가는 순간 번역한다.
 * - tr(s): 문장 규칙 → 단어 사전 → 숫자 단위 순서로 치환 (브라우저·Node 공용, 순수 함수)
 * - 브라우저: 페이지 글자(텍스트·title·placeholder)를 MutationObserver로 계속 번역 */
(function (root) {
  'use strict';
  const HANGUL = /[\uac00-\ud7a3]/;
  const G = (n) => (n === '-1' || n === '-2' ? 'the Snake' : 'Giant ' + n); // catcher -2 → "거인-1"
  const giantList = (s) => s.split('·').join(' & ');
  const GL = (l) => (l.includes('·') ? 'Giants ' : 'Giant ') + giantList(l);
  const OBJ = { '번개창을': 'the Lightning Spear', '연막탄을': 'a Smoke Bomb', '부스터를': 'a Booster', '투명망토를': 'an Invisibility Cloak', '샷건을': 'a Shotgun', '벽넘기 신발을': 'Vault Shoes', '바리케이드를': 'a Barricade', '포효 뿔피리를': 'a Roar Horn', '냄새 추적기를': 'a Scent Tracker' };
  const MISSION_NAME = { '스위치': 'Switches', '보석 운반': 'Gem Carry', '발판': 'Pressure Plate' };

  // 유전자 문구 (engine3.js 의 RUNNER_GENES / GIANT_GENES 와 같은 순서·키)
  const GENES_EN = {
    danger: ['Caution', 'Runner now steers clear of paths near giants', 'Runner is taking risky shortcuts'],
    flee: ['Flee radius', 'Runner learned to bolt from farther away', 'Runner stays calm even with a giant close'],
    greed: ['Key greed', 'Runner pushes for the goal even while chased', 'Runner learned: survive first when chased'],
    loop: ['Loop use', 'Runner learned to shake giants by circling loops', 'Runner prefers straight-line escapes'],
    predict: ['Prediction', "Runner started predicting the giants' next moves", 'Runner only trusts what it sees now'],
    memory: ['Memory', 'Runner remembers where giants were for longer', 'Runner forgets past danger quickly and pushes on'],
    keySafe: ['Safe target first', 'Runner goes for keys/doors far from giants first', 'Runner goes for the nearest key/door first'],
    sprint: ['Sprint timing', 'Runner sprints earlier', 'Runner saves sprints for the last moment'],
    itemGreed: ['Item greed', 'Runner detours to grab items', 'Runner puts the goal before items'],
    panic: ['Defensive item timing', 'Runner uses smoke/cloak/booster early', 'Runner saves smoke/cloak/booster for emergencies'],
    shotgun: ['Shotgun range', 'Runner fires the shotgun from farther away', 'Runner holds fire until point-blank'],
    barricade: ['Barricades', 'Runner learned to drop barricades when chased', 'Runner saves its barricades'],
    missionOrder: ['Finish missions first', 'Runner finishes nearly-done missions first', 'Runner tackles the nearest mission first'],
    plateNerve: ['Plate nerve', 'Runner holds the plate even as giants close in', 'Runner hops off the plate at the first sign of a giant'],
    snakeLure: ['Snake lure', 'Runner learned to lure giants toward the snake', 'Runner keeps giants away from the snake'],
    tailGrab: ['Tail grab', "Runner learned to yank the snake's tail to chase it off", "Runner leaves the snake's tail alone"],
    vault: ['Wall vault', 'Runner vaults walls boldly', 'Runner saves vaults for big emergencies/shortcuts'],
    stride: ['Speed focus', 'Giant trained legs over ears — faster now', 'Giant slowed down and sharpened its hearing'],
    intercept: ['Cut-off', "Giant learned to cut off the Runner's path", 'Giant went back to chasing from behind'],
    lookahead: ['Look-ahead', 'Giant now reads several moves ahead', 'Giant only looks at the near future'],
    ambush: ['Ambush', 'Giant learned to ambush near keys', 'Giant prefers patrols over ambushes'],
    dash: ['Charge range', 'Giant charges from farther away', 'Giant saves its charge for the decisive moment'],
    patience: ['Persistence', 'Giant tracks a lost Runner more stubbornly', 'Giant gives up on lost trails quickly'],
    scent: ['Scent tracking', 'Giant learned to follow footprint scent', 'Giant ignores old scent'],
    exitGuard: ['Exit watch', 'Giant learned to guard routes near exits', 'Giant guards keys over exits'],
    spread: ['Spread out', 'Giant learned to spread out and surround', 'Giant sticks with its teammates'],
    call: ['Call backup', 'Giant calls teammates on sight', 'Giant prefers to hunt alone, quietly'],
    smash: ['Wall smash', 'Giant smashes walls even for small shortcuts', 'Giant saves wall smashes for big shortcuts'],
    roar: ['Roar', "Giant roars to reveal the Runner's position", 'Giant saves its roar'],
    tracker: ['Tracker use', 'Giant uses the scent tracker fast to re-find the Runner', 'Giant holds the scent tracker for long'],
    blockade: ['Blockade', "Giant learned to barricade the Runner's path", 'Giant saves its barricade'],
    guard: ['Guard missions/stairs', 'Giant guards mission spots and stairs', 'Giant guards mission spots less'],
    snakeSense: ['Snake avoidance', 'Giant smells the snake and detours', "Giant doesn't mind the snake"],
    snakeStop: ['Block the Snake', 'Runner steps in to stop the Snake before it eats too many giants', 'Runner ignores the Snake and focuses on escaping'],
    snakeShot: ['Shoot the Snake', 'Runner started shooting the Snake when it hunts giants', 'Runner saves its shotgun for giants'],
    sHunt: ['Hunting sense', 'Snake smells giants from farther away', 'Snake only goes for giants right in front of it'],
    sChase: ['Relentless chase', 'Snake chases a lost giant for longer', 'Snake gives up on lost giants quickly'],
    sPill: ['Pill greed', 'Snake travels far for pills', 'Snake skips pills to focus on giants'],
    sCamp: ['Respawn ambush', 'Snake learned to wait near where eaten giants respawn', 'Snake ignores respawn spots'],
    sFloor: ['Floor switching', 'Snake takes the stairs to the floor with more giants', 'Snake tends to stay on its floor'],
    sAmbush: ['Junction ambush', 'Snake learned to lurk at junctions for giants', 'Snake keeps moving without stopping'],
    sLunge: ['Lunge', 'Snake lunges at giants from farther away', 'Snake saves its lunge for point-blank'],
    delve: ['Underground delve', 'Runner explores the underground maze longer and deeper', 'Runner focuses on surface goals over the underground'],
    weaponSeek: ['Weapon hunt', 'Runner searches the underground for the hidden giant-slaying weapon', "Runner won't waste time hunting the legendary weapon"],
    dinoFear: ['Dino avoidance', 'Runner takes the long way around when it hears the Dinosaur', 'Runner squeezes past the Dinosaur'],
    deepPatrol: ['Underground patrol', 'Giant patrols down in the underground maze', 'Giant only patrols the surface'],
    dinoDodge: ['Dino avoidance', 'Giant gives the Dinosaur a wide berth', "Giant isn't afraid of the Dinosaur"],
    rockUse: ['Boulder hatch block', 'Giant rolls even far-off boulders over the underground hatches', 'Giant only pushes boulders that are right there'],
    rockDoor: ['Boulder door block', 'Giant blocks an exit door with a boulder even before the Runner has all keys', 'Giant only blocks a door at the last moment'],
    sDodge: ['Runner dodge', 'Snake keeps away from the Runner to protect its tail', "Snake doesn't mind the Runner"],
  };
  const geneRules = [];
  function addGeneRules(GE) {
    if (!GE || geneRules.length) return;
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const d of [...GE.RUNNER_GENES, ...GE.GIANT_GENES, ...(GE.SNAKE_GENES || [])]) {
      const en = GENES_EN[d.key]; if (!en) continue;
      for (const [ko, e] of [[d.up, en[1]], [d.down, en[2]]]) {
        if (/^거인이 /.test(ko)) geneRules.push([new RegExp('거인(\\d+)이 ' + esc(ko.slice(4))), (m, n) => e.replace(/^Giant/, 'Giant ' + n)]);
        geneRules.push([new RegExp(esc(ko)), e]);
      }
      geneRules.push([new RegExp('거인(\\d+) ' + esc(d.label) + '(?=[ )]|$)'), (m, n) => `Giant ${n} ${en[0]}`]);
      geneRules.push([new RegExp('(^|[(>])' + esc(d.label) + '(?=$|[ <)])'), (m, p) => p + en[0]]);
    }
  }

  // 문장 규칙 (위에서부터 순서대로)
  const rockName = (n) => n.replace(/해치 (\d+)번/, 'Hatch $1').replace(/문 ([AB])/, 'Door $1').replace('계단', 'the stairs');
  const R = [
    // 고정 긴 문단
    [/^👋 ▶ 시작을 누르면 도망자 1명과 거인 (\d+)명이 2층 미로에서 대결합니다.*$/, (m, n) => `👋 Press ▶ Start: 1 Runner vs ${n} Giants in a 2-floor maze. 💥 Giants can smash a wall every 30s, and every 5 Runner wins adds another giant (max 10).`],
    [/^\s*🧰 열쇠는 잠긴 상자 안.*$/, '🧰 Keys sit in locked chests — solve the missions (🕹️ flip switches · 💎 carry the gem · ⏳ hold the plate) to open them. 🐍 The Snake eats 💊 pills to grow and swallows giants — the Runner passes right through it (grab its tail to make it hide). 🌫 The Runner only remembers what it has seen (toggle Full map to reveal all). 🔫 Shotgun: 2 shells, 1 reload every 5s, a hit stuns for 2s (misses more at range). 🎒 Runner items: 💨 Smoke 🚀 Booster 👻 Cloak 🤸 Vault 🧱 Barricade · Giant items: 🔊 Roar 🐾 Scent Tracker 🚧 Barricade. 💥 Each giant smashes inner walls/barricades on a 30s cooldown. 👀 Runner View shows first person. ⚡ Fast Train runs hundreds of games instantly.'],
    [/^⛏️ 새 지역: 엄청 큰 지하 1층\(B1\)!.*$/, '⛏️ New area: a HUGE underground level (B1)! Climb down through the hatches on 1F. Somewhere down there lies the legendary giant-slaying weapon 🔱 Lightning Spear — but TWO giant 2×2 🦖 Dinosaurs roam the tunnels: poor eyes and no sense of direction, but a superb nose — they follow footprint scent and CHARGE when they see prey.'],
    [/^도망자 1명 vs 거인 4명.*?⛏️.*$/, '1 Runner vs 4 Giants (+1 giant every 5 Runner wins, max 10) in a 2-floor maze. The 2 keys are in locked chests (🕹️ switches · 💎 gem carry · ⏳ pressure plate missions open them). Grab the keys and escape through Door A or B on 1F to win as the Runner; get caught and the Giants win; if the 🐍 Snake eats 20 giants in one game, the Snake wins (the Runner blocks it with tail grabs and the shotgun). The Snake roams both floors via the stairs, eating 💊 pills and giants to grow. The Runner only knows what it has 🌫 seen, and picks up items (💨 Smoke 🚀 Booster 👻 Cloak 🔫 Shotgun (2 shells) 🧱 Barricade / Giants: 🔊 Roar 🐾 Scent Tracker 🚧 Barricade). 💥 Giants can smash a wall every 30s. ⛏️ Below the 1F hatches lies a huge underground maze (B1) hiding the legendary giant-slaying 🔱 Lightning Spear (2 uses) — but two giant 2×2 🦖 Dinosaurs roam down there, tracking prey by smell. 🪨 Big boulders (2 underground · 1 at each door on 1F) can only be pushed by Giants, one tile at a time — they block hatches and exit doors to stop the escape (a boulder on a door stays all round; with both doors sealed the Runner can only survive to the time limit — a draw — or fight back with the weapon). All three sides — Runner, Giants and Snake — learn from each other every game.'],
    [/^도망자 1명 vs 거인 4명.*$/, '1 Runner vs 4 Giants (+1 giant every 5 Runner wins, max 10) in a 2-floor maze. The 2 keys are in locked chests (🕹️ switches · 💎 gem carry · ⏳ pressure plate missions open them). Grab the keys and escape through Door A or B on 1F to win as the Runner; get caught and the Giants win; if the 🐍 Snake eats 20 giants in one game, the Snake wins (the Runner blocks it with tail grabs and the shotgun). The Snake roams both floors via the stairs, eating 💊 pills and giants to grow. The Runner only knows what it has 🌫 seen, and picks up items (💨 Smoke 🚀 Booster 👻 Cloak 🔫 Shotgun (2 shells) 🧱 Barricade / Giants: 🔊 Roar 🐾 Scent Tracker 🚧 Barricade). 💥 Giants can smash a wall every 30s. All three sides — Runner, Giants and Snake — learn from each other every game.'],
    [/^🔫 샷건 = 도망자 기본 스킬.*$/, '🔫 Shotgun = Runner\'s base skill (2 shells, 1 reload / 5s), a hit stuns for 2s · 🤸 Vault = jump one inner wall once · 🐍 Eaten giants respawn at start after 3s (default 10 turns/s) · 🏢 Floor button: Auto → 1F → 2F → B1 · ⛏️ B1: 🔱 Lightning Spear = slay a giant in a straight line within 5 tiles (out for the game, 2 uses) · 🦖 Dinosaur (2×2, B1 only): bites the Runner = Giants win, bites a giant = 10s KO · 🐍 Snake (1, uses stairs): eats only giants, the Runner passes through; step on its tail to make it vanish briefly, a shotgun hit stuns it for 3s · 🐍 The Snake learns too: eat 20 giants in one game to win (rare) · 💥 Wall smash 30s cooldown · 3D: three.js (bundled, MIT) · Drag to rotate · Wheel / pinch to zoom · In Runner View drag to look around · Learning is saved in this browser (localStorage)'],
    [/^매 판이 끝나면 한 세대.*$/, 'After every game, one generation (16–24 games) trains. The Runner brain (17 genes — incl. items, missions, snake) and the Giant team brain (16 genes per giant — new giants clone & mutate the top catcher) face mutated challengers on the same map; the better one survives. The losing side sends 2 challengers and mutates harder.'],
    [/^끄면 도망자가 직접 본 곳만.*$/, 'Off: only what the Runner has seen is lit (fog of war). Runner View always shows the Runner\'s memory.'],
    [/^보는 층: 자동.*$/, 'Floor shown: Auto (Runner\'s floor) → 1F → 2F → B1'],
    [/^매 판이 끝나면 한 세대.*유전자 22개.*$/, 'After every game, one generation (16–24 games) trains. The Runner brain (22 genes — incl. items, missions, the snake, underground delving, weapon hunting, dino avoidance), the Giant team brain (20 genes per giant — new giants clone & mutate the top catcher) and the Snake brain (8 genes — hunting, respawn ambush, lunge…) face mutated challengers on the same map; the better one survives. The losing side sends extra challengers and mutates harder.'],
    [/^거인과 도망자 3D — AI 대결 · 공진화$/, 'Giants vs Runner 3D — Live AI Battle · Co-Evolution'],
    [/(?:👹)+ 거인과 도망자 3D — AI 실시간 대결 · 공진화/, '👹 Giants vs Runner 3D — Live AI Battle · Co-Evolution'],
    [/^(?:👹)+ 거인과 도망자 3D 🏃 🐍$/, '👹👹👹👹 Giants vs Runner 3D 🏃 🐍'],
    [/^🐍 새 규칙: 뷱도 학습합니다!.*?거인 (\d+)마리.*$/, '🐍 New rule: the Snake learns too! If it eats $1 giants in one game, the Snake wins (Runner and Giants both lose). The Runner fights back by yanking its tail and shooting it with the shotgun.'],
    [/^매 판이 끝나면 한 세대.*$/, 'After every game, one generation (16–24 games) trains. The Runner brain (19 genes — incl. items, missions, blocking the snake), the Giant team brain (16 genes per giant — new giants clone & mutate the top catcher) and the Snake brain (8 genes — hunting, respawn ambush, lunge…) face mutated challengers on the same map; the better one survives. The losing side sends extra challengers and mutates harder.'],
    // 경기 로그
    // v21 지하 · 무기 · 공룡
    // v23 공룡 2마리(냄새·돌격) · 출구 봉쇄
    [/🦖 공룡이 도망자를 발견하고 돌격한다! 쿵쾅쿵쾅/, "🦖 A Dinosaur spotted the Runner and CHARGES! THUD THUD"],
    [/🦖 공룡이 거인(\d+)에게 돌격한다!/, '🦖 A Dinosaur charges at Giant $1!'],
    [/🦖 공룡이 냄새를 맡았다… 킁킁/, '🦖 A Dinosaur caught a scent… sniff sniff'],
    [/🚫 모든 출구가 막혔다! 도망자는 살아남아야 한다 \(지하의 무기를 찾거나 시간 끝까지 버티기\)/, '🚫 All exits sealed! The Runner must survive (find the weapon underground or hold out until time runs out)'],
    [/🚪 출구 하나가 다시 열렸다!/, '🚪 An exit is open again!'],
    // v22 바위
    [/^🪨 새 함정: 바위!.*$/, '🪨 New trap: boulders! 2 in the underground and 1 at each exit door on 1F. Only Giants can push them (one tile at a time) — they roll them over hatches and in front of the exit doors to stop the Runner escaping. A boulder on a door stays there all round — if both doors are sealed, the Runner must find the weapon underground or survive until time runs out (2000 turns).'],
    [/🪨 거인(\d+)이 바위를 밀어 해치 (\d+)번을 막았다! 도망자의 탈출로가 막혔다/, "🪨 Giant $1 pushed a boulder over Hatch $2! The Runner's escape route is blocked"],
    [/🪨 거인(\d+)이 바위를 밀어 문 ([AB])를 막았다! 도망자는 그 문으로 못 나간다/, "🪨 Giant $1 blocked Door $2 with a boulder! The Runner can't escape that way"],
    [/🪨 거인(\d+)이 바위를 밀어 계단을 막았다! 도망자의 길이 막혔다/, "🪨 Giant $1 pushed a boulder onto the stairs! The Runner's path is blocked"],
    [/🪨 거인(\d+)이 바위를 밀기 시작했다… \((해치 \d+번|문 [AB]|계단)[을를] 막으러\)/, (_, k, n) => `🪨 Giant ${k} starts pushing a boulder… (to block ${rockName(n)})`],
    [/🪨 바위가 데굴데굴 제자리로 굴러갔다 — (해치 \d+번|문 [AB]|계단)[이가] 다시 열렸다/, (_, n) => `🪨 The boulder rolled back home — ${rockName(n)} is open again`],
    [/🪨 (해치 \d+번|문 [AB]|계단)[이가] 다시 열렸다 \(거인(\d+)이 바위를 치움\)/, (_, n, k) => `🪨 ${rockName(n)} is open again (Giant ${k} moved the boulder)`],
    [/🕳️ 도망자가 해치를 타고 지하 1층으로 내려갔다/, '🕳️ Runner climbed down a hatch into B1'],
    [/🕳️ 도망자가 지상으로 올라왔다/, '🕳️ Runner climbed back up to the surface'],
    [/⚡ 도망자가 지하에서 전설의 무기 '거인 퇴치 번개창'을 찾았다! 🔱 \((\d+)번\)/, '⚡ Runner found the legendary weapon underground — the Giant-Slayer Lightning Spear! 🔱 ($1 uses)'],
    [/⚡ 도망자가 번개창으로 거인(\d+)을 처치했다! ☠️ \(이번 판 복귀 불가 · 남은 (\d+)번\)/, '⚡ Runner struck down Giant $1 with the Lightning Spear! ☠️ (out for this game · $2 uses left)'],
    [/🦖 공룡이 거인(\d+)을 물어 쓰러뜨렸다! \((\d+)초 뒤 출발점에서 부활\)/, '🦖 The Dinosaur mauled Giant $1! (respawns in $2s)'],
    [/거인(\d+)이 정신을 차리고 출발점에 다시 나타났다/, 'Giant $1 came to and respawned at the start'],
    [/🦖 공룡이 도망자를 삼켰다! 지하의 공포…/, '🦖 The Dinosaur swallowed the Runner! Terror of the deep…'],
    [/🦖 공룡이 도망자를 삼켰다!/, '🦖 The Dinosaur swallowed the Runner!'],
    [/🦖 공룡이 도망자를 발견했다! 쿵쾅쿵쾅 달려온다/, "🦖 The Dinosaur spotted the Runner! THUD THUD — it's charging"],
    [/🦖 공룡이 거인(\d+)을 노린다!/, '🦖 The Dinosaur is stalking Giant $1!'],
    [/도망자가 공룡을 발견했다! 🦖 쿵… 쿵…/, 'Runner spotted the Dinosaur! 🦖 thud… thud…'],
    [/🦖기절 (\d+)초/, '🦖KO $1s'],
    [/지하 1층 · 미션을 풀어 상자를 열어라/, 'B1 · Solve missions to open the chests'],
    [/지하 1층 · 문이 열렸다! 1층 빛을 따라가라/, 'B1 · Doors open! Follow the light on 1F'],
    [/🐍 뷱이 거인 (\d+)\/(\d+)마리째! (\d+)마리만 더 먹으면 뷱 승리/, (m, a, b, c) => `🐍 The Snake has eaten ${a}/${b} giants! ${c} more and the Snake wins`],
    [/🛡️ 도망자가 뷱을 막았다! 꼬리를 잡아 땅속으로 쫓아냈다 \(뷱 (\d+)\/(\d+)\)/, '🛡️ Runner blocked the Snake! Yanked its tail and drove it underground (Snake $1/$2)'],
    [/🛡️ 도망자가 뷱을 쐈다! 🔫 뷱 (\d+)초 기절 — 거인 사냥을 막았다 \(뷱 (\d+)\/(\d+)\)/, '🛡️ Runner shot the Snake! 🔫 Snake stunned $1s — giant hunt stopped (Snake $2/$3)'],
    [/도망자가 뷱을 쐈지만 빗나갔다! 🔫💨 샷건 (\d+)\/(\d+)/, 'Runner fired at the Snake — MISSED! 🔫💨 Ammo $1/$2'],
    [/뷱 승리! 🐍👑 뷱이 거인을 (\d+)마리 먹어 치웠다/, 'SNAKE WINS! 🐍👑 The Snake devoured $1 giants'],
    [/🐍👑 뷱 승리! 거인 (\d+)마리 꿀꺽/, '🐍👑 SNAKE WINS! $1 giants gulped'],
    [/거인(-?\d+)이 도망자를 잡아먹었다!/, (m, n) => (n === '-1' ? 'The Snake got the Runner!' : `Giant ${n} ate the Runner!`)],
    [/거인(\d+)이 벽을 부셨다!/, 'Giant $1 smashed a wall!'],
    [/거인(\d+)이 (도망자의 )?바리케이드를 (힘껏 )?부쉈다!/, (m, n, r, h) => `Giant ${n} ${h ? 'smashed' : 'broke'} ${r ? "the Runner's" : 'a'} barricade!`],
    [/도망자가 스위치를 켰다! 🕹️ 미션: 스위치 (\d+)\/(\d+)/, 'Runner flipped a switch! 🕹️ Switches $1/$2'],
    [/도망자가 보석을 주웠다! 💎 받침대로 옮겨라 \(미션: 보석 0\/1\)/, 'Runner grabbed the gem! 💎 Get it to the pedestal'],
    [/미션 완료\((.+?)\)! 🧰 (\d+)층 상자가 열렸다 — 열쇠를 꺼낼 수 있다/, (m, a, f) => `Mission complete (${MISSION_NAME[a] || a})! 🧰 The ${f}F chest is open — key up for grabs`],
    [/뷱이 거인(\d+)을 삼켰다! 🐍 \((\d+)초 뒤 출발점에서 부활\)/, 'The Snake swallowed Giant $1! 🐍 (respawns in $2s)'],
    [/도망자가 전력질주한다!/, 'Runner sprints!'],
    [/🤸 도망자 벽넘기!/, '🤸 Runner vaults the wall!'],
    [/도망자가 (.+?) 주웠다!/, (m, o) => `Runner picked up ${OBJ[o] || o}!`],
    [/거인(\d+)이 (.+?) 주웠다!/, (m, n, o) => `Giant ${n} picked up ${OBJ[o] || o}!`],
    [/도망자가 마지막 열쇠를 얻었다! 🔑 문 A·B가 열렸다/, 'Runner got the LAST KEY! 🔑 Doors A & B are OPEN'],
    [/도망자가 열쇠를 주웠다 🔑 \((\d+)\/(\d+)\)/, 'Runner grabbed a key 🔑 ($1/$2)'],
    [/도망자가 뷱의 꼬리를 잡아당겼다! 🐍 뷱이 땅속으로 숨었다 \((\d+)턴\)/, "Runner yanked the Snake's tail! 🐍 It burrowed underground ($1 turns)"],
    [/도망자가 문 (\S+)로 빠져나갔다!/, 'Runner slipped out through Door $1!'],
    [/도망자가 발판을 밟고 버틴다… 미션: 발판 (\d+)\/(\d+) \(쿵쿵! 거인이 들을 수 있다\)/, 'Runner holds the plate… $1/$2 (thud thud — giants can hear it!)'],
    [/도망자가 발판에서 내려왔다 — 발판 미션이 처음으로 돌아갔다/, 'Runner stepped off — plate mission reset'],
    [/거인(\d+)이 동료를 불렀다!/, 'Giant $1 called for backup!'],
    [/거인(\d+)이 정신을 차렸다/, 'Giant $1 shook it off'],
    [/거인(\d+)이 돌진한다!/, 'Giant $1 CHARGES!'],
    [/문의 빛에 눈이 부신 거인(\d+)이 문 근처에서 물러난다/, 'Blinded by the door light, Giant $1 backs off'],
    [/열쇠의 빛에 눈이 부신 거인(\d+)이 열쇠 근처에서 물러난다/, "Blinded by the key's glow, Giant $1 backs off"],
    [/거인(\d+)이 뷱의 배 속에서 빠져나와 출발점에 다시 나타났다/, "Giant $1 escaped the Snake's belly and respawned"],
    [/뷱이 도망자를 삼켰다!/, 'The Snake swallowed the Runner!'],
    [/탈출 성공! 도망자가 문 (\S+)로 탈출했다/, 'ESCAPED! Runner got out through Door $1'],
    [/시간 초과 — 무승부/, "Time's up — Draw"],
    [/도망자가 거인(\d+)을 발견했다!/, 'Runner spotted Giant $1!'],
    [/도망자가 거인(\d+)의 발소리를 들었다…/, "Runner hears Giant $1's footsteps…"],
    [/도망자가 뷱을 발견했다!/, 'Runner spotted the Snake!'],
    [/도망자가 (\d+)층에서 잠긴 상자를 찾았다! 🧰 단서: (.*)$/, (m, f, c) => `Runner found a locked chest on ${f}F! 🧰 Clue: ` + c.replace(/스위치 (\d+)개를 켜라/, 'flip $1 switches').replace('보석을 받침대로 옮겨라', 'carry the gem to the pedestal').replace(/발판 위에서 (\d+)턴 버텨라/, 'hold the plate for $1 turns')],
    [/도망자가 문 (\S+) 쪽으로 방향을 바꿨다/, 'Runner switches to Door $1'],
    [/도망자가 문 (\S+)를 노린다/, 'Runner heads for Door $1'],
    [/도망자가 샷건을 쐈지만 빗나갔다! 🔫💨 샷건 (\d+)\/(\d+)/, 'Runner fires — MISSED! 🔫💨 Ammo $1/$2'],
    [/총소리를 들은 거인([\d·]+)이 몰려온다!/, (m, l) => `${GL(l)} heard the shot — closing in!`],
    [/도망자가 샷건을 쐈다! 🔫 거인(\d+) (\d+)초 기절 · 샷건 (\d+)\/(\d+)(?: \(장전 (\d+)초\))?/, (m, n, s, a, b, r) => `Runner fires the shotgun! 🔫 Giant ${n} stunned ${s}s · Ammo ${a}/${b}${r ? ` (reload ${r}s)` : ''}`],
    [/도망자가 연막탄을 터뜨렸다! 💨 (.*?)의 눈이 가려졌다/, (m, l) => `Runner popped a smoke bomb! 💨 ${GL(l.replace(/거인/g, ''))} blinded`],
    [/도망자가 연막탄을 터뜨렸다!/, 'Runner popped a smoke bomb!'],
    [/도망자가 투명망토를 둘렀다! 👻 \(뛰면 발소리는 들린다\)/, 'Runner put on the invisibility cloak! 👻 (footsteps still audible)'],
    [/도망자가 부스터를 켰다!/, 'Runner hit the booster!'],
    [/도망자가 뒤에 바리케이드를 쳤다!/, 'Runner dropped a barricade behind!'],
    [/거인(\d+)이 포효했다! 🔊 모든 거인이 도망자의 위치를 알았다/, 'Giant $1 ROARS! 🔊 Every giant knows where the Runner is'],
    [/거인(\d+)이 냄새 추적기를 켰다! 🐾 도망자의 발자국을 따라간다/, "Giant $1 turned on the scent tracker! 🐾 Following the Runner's tracks"],
    [/거인(\d+)이 길목에 바리케이드를 쳤다!/, 'Giant $1 blocked the path with a barricade!'],
    [/뷱이 (\d+)층에 다시 나타났다!/, 'The Snake resurfaced on $1F!'],
    [/뷱이 알약을 먹고 길어졌다! 💊 \(길이 (\d+)\)/, 'The Snake ate a pill and grew! 💊 (length $1)'],
    [/뷱이 알약을 먹었다 💊 \(이미 최대 길이 (\d+)\)/, 'The Snake ate a pill 💊 (already max length $1)'],
    [/거인(\d+)이 도망자를 발견했다!/, 'Giant $1 spotted the Runner!'],
    [/거인(\d+)이 도망자의 냄새를 맡았다!/, "Giant $1 caught the Runner's scent!"],
    [/거인(\d+)이 매복하러 간다…/, 'Giant $1 sets up an ambush…'],
    [/거인(\d+)이 계단을 지키러 간다…/, 'Giant $1 moves to guard the stairs…'],
    [/거인(\d+)이 미션 장소을 지키러 간다…/, 'Giant $1 moves to guard a mission spot…'],
    // UI 문장
    [/도망자 (\d+)승! 거인이 한 명 늘었다 👹 \(거인([\d·]+) 등장 — 이제 (\d+)명\)/, (m, w, l, n) => `Runner win #${w}! A new giant joins 👹 (${GL(l)} enters — now ${n} giants)`],
    [/— 새 경기 \(도망자 Lv\.(\d+) vs 거인팀 Lv\.(\d+): (.*)\) —/, (m, a, b, l) => `— New game (Runner Lv.${a} vs Giants Lv.${b}: ${l.replace(/(\d+)번 /g, '#$1 ')}) —`],
    [/(\d+)턴 · 경기 후 복기 훈련 중…/, 'Turn $1 · post-game training…'],
    [/(\d+)턴 · (\d+)세대 학습 완료/, 'Turn $1 · Gen $2 learned'],
    [/🏃 문 (\S+) 탈출 성공!/, '🏃 ESCAPED via Door $1!'],
    [/👹 거인(\d+)이 잡아먹었다!/, '👹 Giant $1 got the Runner!'],
    [/🐍 뷱이 도망자를 삼켰다!/, '🐍 The Snake swallowed the Runner!'],
    [/⏳ 시간 초과/, "⏳ Time's up"],
    [/⚡ 빠른 훈련 (\d+)세대\((\d+)판\) 완료 — 도망자 (\d+)% · 거인팀 (\d+)% · 뷱 (\d+)% · 레벨 도망자 \+(\d+), 거인팀 \+(\d+), 뷱 \+(\d+)/, '⚡ Fast training: $1 gens ($2 games) done — Runner $3% · Giants $4% · Snake $5% · Levels: Runner +$6, Giants +$7, Snake +$8'],
    [/⚡ 빠른 훈련 (\d+)세대\((\d+)판\) 완료 — 도망자 (\d+)% · 거인팀 (\d+)% · 레벨 도망자 \+(\d+), 거인팀 \+(\d+)/, '⚡ Fast training: $1 gens ($2 games) done — Runner $3% · Giants $4% · Levels: Runner +$5, Giants +$6'],
    [/(\d+)\/(\d+)세대 · (\d+)판 · 도망자 (NaN|\d+)% \/ 거인팀 (NaN|\d+)%/, '$1/$2 gens · $3 games · Runner $4% / Giants $5%'],
    [/📊 (\d+)세대 훈련 (\d+)판: 도망자 (\d+)% · 거인팀 (\d+)%/, '📊 Gen $1 training, $2 games: Runner $3% · Giants $4%'],
    [/훈련 경기 ([\d,]+)판 \(도망자 (\d+) · 거인팀 (\d+) · 뷱 (\d+) · 무 (\d+)\)/, 'Training games: $1 (Runner $2 · Giants $3 · Snake $4 · Draw $5)'],
    [/훈련 경기 ([\d,]+)판 \(도망자 (\d+) · 거인팀 (\d+) · 무 (\d+)\)/, 'Training games: $1 (Runner $2 · Giants $3 · Draw $4)'],
    [/훈련 경기 (\d+)판/, 'Training games: $1'],
    [/🐍 뷱이 먹은 거인 (\d+) · 도망자 (\d+) · 알약 (\d+)/, '🐍 Snake ate: $1 giants · $2 runners · $3 pills'],
    [/👹 거인 (\d+)명 · 최대 인원\((\d+)명\)/, '👹 $1 giants · MAX ($2)'],
    [/👹 거인 (\d+)명 · 다음 거인 추가까지 도망자 (\d+)승/, '👹 $1 giants · next giant in $2 Runner wins'],
    [/💾 두뇌 저장 완료 \((\d+)세대, 도망자 Lv\.(\d+) · 거인팀 Lv\.(\d+)\)/, '💾 Brains saved (Gen $1, Runner Lv.$2 · Giants Lv.$3)'],
    [/📂 두뇌 불러오기 완료 \((\d+)세대, (.*) 저장본\)/, '📂 Brains loaded (Gen $1, saved $2)'],
    [/🧹 초기화 완료 — 0세대부터 다시 시작합니다 \(거인 (\d+)명\)/, '🧹 Reset done — starting over from Gen 0 ($1 giants)'],
    [/🧹 두뇌 초기화 — 모두 1레벨부터 다시 배웁니다 \(거인 (\d+)명으로\)/, '🧹 Brains reset — everyone relearns from Lv.1 ($1 giants)'],
    [/👀 미리보기: 거인 (\d+)명 \(저장 안 함\)/, '👀 Preview: $1 giants (not saved)'],
    [/👀 미리보기\(\?giants=\) 중에는 저장하지 않습니다/, '👀 Not saving during preview (?giants=)'],
    [/🧊 3D 화면 준비 완료 — 드래그로 회전, 휠\/두 손가락으로 확대/, '🧊 3D ready — drag to rotate, wheel / pinch to zoom'],
    [/이 기기에서는 3D\(WebGL\)를 쓸 수 없어 2D로 보여줍니다/, 'No 3D (WebGL) on this device — showing 2D'],
    [/3D를 쓸 수 없어 2D 화면으로 보여줍니다/, '3D unavailable — showing 2D'],
    [/⚠️ 진행이 멈춰 새 경기를 시작합니다/, '⚠️ Game stalled — starting a new one'],
    [/도망자와 거인팀의 학습 내용과 점수를 모두 지울까요\? \(저장본은 그대로 남습니다\)/, 'Erase all Runner/Giant learning and scores? (Saved brains stay)'],
    [/🧬 <b>(\d+)<\/b>세대 · 훈련 ([\d,]+)판/, '🧬 Gen <b>$1</b> · $2 training games'],
    [/최근 도망자 승률/, 'Runner win rate (recent)'],
    [/🐍 거인 (\d+)마리 꿀꺽/, (m, n) => `🐍 ${n} giant${n === '1' ? '' : 's'} gulped`],
    [/⏱ 턴 (\d+)/, '⏱ Turn $1'],
    [/📏 거인까지 (\d+|-)칸?/, '📏 Nearest giant $1'],
    [/거인까지 (\d+)칸/, 'Giant $1 tiles away'],
    [/장전 중… (\d+)% \((\d+)초에 1발\)/, 'Reloading… $1% (1 shell / $2s)'],
    [/벽부수기 준비: 거인([\d·]+)/, (m, l) => `Wall smash ready: ${GL(l)}`],
    [/다음 벽부수기 (\d+)초/, 'Next wall smash in $1s'],
    [/거인(\d+) 벽부수기 준비/, 'Giant $1 wall smash ready'],
    [/거인(\d+) 벽부수기 (\d+)초 남음/, 'Giant $1 wall smash in $2s'],
    [/거인(\d+) 벽 부수기/, 'Giant $1 wall smash'],
    [/🐍배 속 (\d+)초/, '🐍belly $1s'],
    [/🐍 거인(\d+) 부활 (\d+)초/, '🐍 Giant $1 back in $2s'],
    [/💫 거인(\d+) 기절 ([\d.]+)초/, '💫 Giant $1 stunned $2s'],
    [/🐾 거인([\d·]+) 추적 중!/, (m, l) => `🐾 ${GL(l)} tracking!`],
    [/(\d+)층 · 미션을 풀어 상자를 열어라/, '$1F · Solve missions to open the chests'],
    [/(\d+)층 · 문이 열렸다! 1층 빛을 따라가라/, '$1F · Doors open! Follow the light on 1F'],
    [/(\d+)↺(\d+)초/, '$1↺$2s'],
    [/🐍 거인(\d+) 부활/, '🐍 Giant $1 respawn'],
    [/🎥 추격전! 거인이 바로 뒤에!/, '🎥 CHASE! A giant is right behind!'],
    [/🔊 클릭하면 소리 켜짐/, '🔊 Click to enable sound'],
    [/🔊 화면을 터치하면 소리 켜짐/, '🔊 Tap to enable sound'],
  ];
  // 단어·짧은 구절 (긴 것 먼저)
  const WORDS = [
    ['출구 봉쇄', 'Exits sealed'], ['생존', 'Survival'], ['돌격', 'Charge'],
    ['바위로 해치 막기', 'Boulder hatch block'], ['바위로 문 막기', 'Boulder door block'], ['바위 밀기', 'Pushing boulder'], ['바위', 'Boulder'],
    ['지하 1층', 'B1'], ['공룡 피하기', 'Dodging dino'], ['무기 찾기', 'Weapon hunt'], ['지하 탐험', 'Exploring B1'], ['처치됨', 'slain'], ['번개창', 'Lightning Spear'], ['공룡', 'Dinosaur'], ['추적', 'Tracking'],
    ['거인을 먹으면 뷱 승리', 'Eat giants to win'], ['뷱 승리', 'Snake wins'], ['땅속에 숨음', 'Underground'], ['뷱 막기', 'Blocking Snake'], ['부활 매복', 'Spawn ambush'], ['막기', 'Blocks'], ['뷱 승', 'Snake wins'],
    ['미션(발판)', 'Mission (plate)'], ['길목 차단', 'Cut-off'], ['흔적 추적', 'Trailing'], ['냄새 추적', 'Sniffing'], ['아이템 줍기', 'Item run'], ['소화 중', 'Digesting'], ['거인 사냥', 'Hunting giants'], ['알약 찾기', 'Pill hunt'],
    ['추격조', 'Chaser'], ['차단조', 'Cutter'], ['매복조', 'Ambusher'], ['파괴조', 'Wrecker'],
    ['🏢 층: 자동', '🏢 Floor: Auto'], ['🏢 층: ', '🏢 Floor: '], ['문 안 (안전)', 'Out the door (safe)'], ['· 문 A/B 열림', '· Doors A/B open'], ['문 열림!', 'Doors open!'], ['💎 운반 중', '💎 carrying'],
    ['아이템을 주워 위기를 넘겨라', 'Grab items to survive'], ['아직 학습 기록이 없습니다', 'No training history yet'], ['장전 완료', 'Loaded'], ['질주 중!', 'Sprinting!'], ['준비됨', 'Ready'], ['준비', 'Ready'],
    ['▶ 시작', '▶ Start'], ['⏸ 일시정지', '⏸ Pause'], ['↺ 다시', '↺ Replay'], ['🗺 새 맵', '🗺 New map'], ['🧊 3D 보기', '🧊 3D view'], ['🗺 2D 보기', '🗺 2D view'], ['🎥 도망자 따라가기', '🎥 Follow Runner'], ['🎥 자유 시점', '🎥 Free cam'], ['🔭 전체 보기', '🔭 Overview'],
    ['🏃 3인칭', '🏃 3rd person'], ['🎥 3인칭으로', '🎥 3rd person'], ['🎥 위에서 보기', '🎥 Top view'], ['👀 도망자 시점', '👀 Runner view'], ['속도 ', 'Speed '], ['턴/초', ' turns/s'], ['자동 다음 판', 'Auto next game'], ['거인 시야', 'Giant vision'], ['전체 지도 보기', 'Full map'], ['미니맵', 'Minimap'],
    ['도망자 승', 'Runner wins'], ['무승부', 'Draws'], ['거인팀 승', 'Giant wins'], ['🧠 학습', '🧠 Learning'], ['⚡ 빠른 훈련 중…', '⚡ Fast training…'], ['⚡ 빠른 훈련', '⚡ Fast train'], ['💾 두뇌 저장', '💾 Save brains'], ['📂 불러오기', '📂 Load'], ['🧹 초기화', '🧹 Reset'],
    ['📈 세대별 승률', '📈 Win rate by generation'], ['📢 실시간 중계', '📢 Live feed'], ['📏 가장 가까운 거인', '📏 Nearest giant'], ['💥 벽 부수기', '💥 Wall smash'], ['저장된 두뇌가 없습니다', 'No saved brains'], ['저장본 형식이 달라 불러오지 못했습니다', 'Save format differs — could not load'],
    ['불러오기 실패: ', 'Load failed: '], ['저장 실패: ', 'Save failed: '], ['볼륨', 'Volume'], ['배경음악', 'Music'], ['효과음', 'SFX'],
    ['거인팀', 'Giants'], ['도망자', 'Runner'], ['뷱', 'Snake'], ['샷건', 'Shotgun'], ['미션: ', 'Mission: '], ['미션', 'Mission'], ['안전', 'safe'], ['무 ', 'Draw '], ['스위치', 'Switch'], ['보석', 'Gem'], ['발판', 'Plate'], ['숨음', 'hidden'], ['기절', 'stunned'], ['장전', 'reload'],
    ['연막탄', 'Smoke Bomb'], ['부스터', 'Booster'], ['투명망토', 'Cloak'], ['벽넘기', 'Vault'], ['바리케이드', 'Barricade'], ['포효 뿔피리', 'Roar Horn'], ['냄새 추적기', 'Scent Tracker'], ['투명', 'Cloak'],
    ['탐색', 'Exploring'], ['순찰', 'Patrol'], ['어슬렁', 'Roaming'], ['매복', 'Ambush'], ['지루함', 'Bored'], ['추격', 'Chase'], ['차단', 'Cut'], ['파괴', 'Wreck'], ['돌파', 'Break out'], ['도주', 'Fleeing'], ['경계', 'Alert'], ['목표로', 'To goal'],
    ['오전', 'AM'], ['오후', 'PM'],
  ].sort((a, b) => b[0].length - a[0].length);
  const UNITS = [
    [/턴 (\d+)/g, 'T$1'], [/(\d+)세대 \(약 ([\d,]+)판\)/g, '$1 gens (~$2 games)'], [/(\d+)세대/g, 'Gen $1'], [/^세대$/g, ' gen'], [/(\d+)판/g, '$1 games'], [/(\d+)승/g, '$1 wins'],
    [/⏱ 턴 /g, '⏱ Turn '], [/(\d+)층/g, '$1F'], [/(\d+)\s?초 남음/g, '$1s left'], [/(\d+(?:\.\d)?)초/g, '$1s'], [/(\d+)턴/g, '$1 turns'], [/(\d+)칸/g, '$1 tiles'], [/(\d+)명/g, '$1'],
    [/거인 (\d+)/g, 'Giant $1'], [/거인(-?\d+)의/g, (m, n) => G(n) + "'s"], [/거인(-?\d+)(?:이|가|을|를|은|는)?/g, (m, n) => G(n)], [/(\d+)번 /g, '#$1 '], [/거인/g, 'Giant'],
    [/^초$/g, 's'], [/^칸$/g, ' tiles'], [/(\d)년 ?/g, '$1-'], [/(\d)월 ?/g, '$1-'], [/(\d)일/g, '$1'],
  ];
  const cache = new Map();
  function tr(s) {
    if (I18N.lang === 'ko' || typeof s !== 'string' || !HANGUL.test(s)) return s;
    const hit = cache.get(s); if (hit !== undefined) return hit;
    let o = s;
    if (!geneRules.length && root.GE) addGeneRules(root.GE);
    for (const [re, to] of geneRules) if (HANGUL.test(o)) o = o.replace(re, to);
    for (const [re, to] of R) { if (!HANGUL.test(o)) break; o = o.replace(re, to); }
    for (const [ko, en] of WORDS) { if (!HANGUL.test(o)) break; if (o.includes(ko)) o = o.split(ko).join(en); }
    for (const [re, to] of UNITS) { if (!HANGUL.test(o)) break; o = o.replace(re, to); }
    if (cache.size > 5000) cache.clear(); cache.set(s, o);
    return o;
  }
  const qs = root.location ? new URLSearchParams(root.location.search) : null;
  const I18N = { lang: qs && qs.get('lang') === 'ko' ? 'ko' : 'en', tr, addGeneRules, hasHangul: (s) => HANGUL.test(s) };
  root.I18N = I18N;
  if (typeof module !== 'undefined') module.exports = I18N;

  // ---------- 브라우저: 화면 글자 자동 번역 ----------
  if (!root.document || I18N.lang === 'ko') return;
  const doc = root.document;
  doc.documentElement.lang = 'en';
  const ATTRS = ['title', 'placeholder', 'aria-label'];
  function fixText(n) { const v = n.nodeValue; if (v && HANGUL.test(v)) { const t = tr(v); if (t !== v) n.nodeValue = t; } }
  function fixEl(el) {
    for (const a of ATTRS) { const v = el.getAttribute && el.getAttribute(a); if (v && HANGUL.test(v)) el.setAttribute(a, tr(v)); }
  }
  function walk(rootNode) {
    if (rootNode.nodeType === 3) return fixText(rootNode);
    if (rootNode.nodeType !== 1) return;
    fixEl(rootNode);
    const w = doc.createTreeWalker(rootNode, 5 /* element | text */);
    let n; while ((n = w.nextNode())) { if (n.nodeType === 3) fixText(n); else fixEl(n); }
  }
  // innerHTML 로 통째로 바뀌는 문장(예: 🧬 <b>12</b>세대 · …)은 요소 단위로도 한 번 맞춰 봄
  function fixHtml(el) { if (!el || !el.innerHTML || el.children.length > 40 || !HANGUL.test(el.innerHTML)) return; const h = el.innerHTML, t = tr(h); if (t !== h && !HANGUL.test(t)) el.innerHTML = t; }
  const mo = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') { const hi = m.target.parentElement && m.target.parentElement.closest('#h-info'); if (hi) fixHtml(hi); else fixText(m.target); }
      else if (m.type === 'attributes') fixEl(m.target);
      else { const hi = m.target.closest && m.target.closest('#h-info'); if (hi) fixHtml(hi); for (const n of m.addedNodes) walk(n); }
    }
  });
  function start() {
    fixHtml(doc.getElementById('h-info'));
    if (doc.title && HANGUL.test(doc.title)) doc.title = tr(doc.title);
    walk(doc.body);
    mo.observe(doc.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    const _confirm = root.confirm; root.confirm = (m) => _confirm.call(root, tr(String(m)));
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start); else start();
  if (doc.title && HANGUL.test(doc.title)) doc.title = tr(doc.title);
})(typeof window !== 'undefined' ? window : globalThis);
