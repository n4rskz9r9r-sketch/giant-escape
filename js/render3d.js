// 거인과 도망자 v6 — three.js 3D 렌더러 (2층·계단·미션·뷱·알약·아이템·연막·샷건·기절·바리케이드·투명망토·전장의 안개) (로컬 벤더 파일만 사용, CDN 없음)
import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';

const QS = new URLSearchParams(location.search);
const STREAM = QS.get('stream') === '1';
// 방송 모드는 CPU(소프트웨어 렌더링)를 아끼기 위해 해상도·그림자 품질을 낮춤: ?q=렌더 배율(기본 0.75), ?shadow=0 그림자 끄기
const STREAM_Q = Math.max(0.4, Math.min(1, parseFloat(QS.get('q') || '0.75')));
const SHADOWS = QS.get('shadow') !== '0';
const MOBILE = (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) || innerWidth < 760;
const GIANT_COLORS = [0xd93636, 0xe0661f, 0xa8326e, 0x7d4cff, 0x2bb3ad, 0x9fbf2a, 0xe0559a, 0x3f86e0, 0xc89a30, 0x9a9ab4]; // 거인1~10

const R3 = { ok: false, camMode: 'orbit' };
let renderer, scene, camera, controls, dirLight, container;
let mapGroup = null, map = null, W = 0, H = 0, FH = 0, NF = 1, focusF = 0, lastFocus = -1, lastCamForVis = '';
const FLOOR_Y = 3.2; // 층 높이 (전체/따라가기 시점)
let wallsMeshes = [], ghostWalls = [], tileMeshes = [], floorPlanes = [], stairObjs = [], chestObjs = new Map(), leverObjs = new Map(), gemObjs = [], pedObjs = [], plateObjs = [], pillObjs = new Map(), snakeObjs = [];
let scoutObjs = [];
let runnerObj, giantObjs = [], keyObjs = new Map(), doorObjs = [], visionMesh, coneMeshes = [], doorZoneMesh;
let lastVisionVer = -1;
// 1인칭(도망자 시점) 상태
let wallsMesh = null, hemiLight, lantern, beacons = [], eyeGlows = [];
// 벽 부수기
let wallIndex = null, debris = [], shakeAmt = 0, lastNow = 0;
const zeroM = new THREE.Matrix4().makeScale(0, 0, 0);
// 아이템 / 바리케이드 / 효과 / 안개
let itemObjs = new Map(), barObjs = new Map(), fxObjs = [], fogMesh = null, lastFogVer = -1, muzzle = null;
const ITEM_ICON = { slayer: '🔱', smoke: '💨', boost: '🚀', cloak: '👻', shotgun: '🔫', vault: '🤸', barricade: '🧱', roar: '🔊', tracker: '🐾' };
const texCache = new Map();
function emojiTex(ch, ring) {
  const key = ch + (ring || ''); if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  if (ring) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.arc(64, 64, 58, 0, 7); g.fill(); g.lineWidth = 8; g.strokeStyle = ring; g.beginPath(); g.arc(64, 64, 54, 0, 7); g.stroke(); }
  g.font = '76px "Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; texCache.set(key, t); return t;
}
// 뷱에게 먹힌 거인: 출발점 위에 부활 카운트다운 (초)
const respawnMarks = [];
function respawnMark(k) {
  if (respawnMarks[k]) return respawnMarks[k];
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false })); sp.scale.set(1.6, 0.8, 1); sp.renderOrder = 20;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.44, 32), new THREE.MeshBasicMaterial({ color: GIANT_COLORS[k % GIANT_COLORS.length], transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2;
  const g = new THREE.Group(); g.add(sp); g.add(ring); sp.position.y = 1.5; ring.position.y = 0.04;
  g.userData = { c, t, sp, ring, last: -1 }; respawnMarks[k] = g; return g;
}
function drawRespawn(k, sec) {
  const o = respawnMark(k), u = o.userData; if (u.last === sec) return; u.last = sec;
  const g = u.c.getContext('2d'); g.clearRect(0, 0, 256, 128);
  g.fillStyle = 'rgba(8,10,20,0.78)'; g.beginPath(); g.roundRect(6, 10, 244, 108, 30); g.fill();
  g.lineWidth = 6; g.strokeStyle = '#' + GIANT_COLORS[k % GIANT_COLORS.length].toString(16).padStart(6, '0'); g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
  g.font = 'bold 34px sans-serif'; g.fillText(window.I18N ? window.I18N.tr(`🐍 거인${k + 1} 부활`) : `🐍 거인${k + 1} 부활`, 128, 42);
  g.font = 'bold 50px sans-serif'; g.fillStyle = '#ffd54a'; g.fillText(window.I18N && window.I18N.lang !== 'ko' ? `${sec}s` : `${sec}초`, 128, 90);
  u.t.needsUpdate = true;
}
let smokeTex = null;
function getSmokeTex() {
  if (smokeTex) return smokeTex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(235,238,245,0.95)'); gr.addColorStop(0.55, 'rgba(200,205,215,0.55)'); gr.addColorStop(1, 'rgba(180,185,195,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); smokeTex = new THREE.CanvasTexture(c); smokeTex.colorSpace = THREE.SRGBColorSpace; return smokeTex;
}
const isShared = (t) => t === glowTex || t === smokeTex || [...texCache.values()].includes(t);
const fpv = { yaw: 0, pitch: 0, lookYaw: 0, lookPitch: 0, dragging: false, releasedAt: 0, bob: 0, last: null, lastT: 0, fov: 72, shake: 0, init: false };
// 3인칭(도망자 뒤에서 따라가기) 상태: 이동 방향을 부드럽게 따라 돌고, 뒤에 벽이 있으면 카메라를 당김
const tps = { yaw: 0, init: false, dist: 3, pos: null, look: null, lastT: 0 };
const TPS = { DIST: 3.5, MIN: 1.4, HEIGHT: 2.6, LOOK_AHEAD: 1.8, LOOK_UP: 0.4, FOV: 62 };
const FPV = { EYE: 0.6, WALL_SCALE: 3.7, GIANT_SCALE: 1.5, FOV: 72, FOV_SPRINT: 88, FOG_NEAR: 1.2, FOG_FAR: 9, BG: 0x04050b };
let glowTex = null;
function getGlowTex() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,240,150,.85)'); gr.addColorStop(1, 'rgba(255,200,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); glowTex = new THREE.CanvasTexture(c); glowTex.colorSpace = THREE.SRGBColorSpace; return glowTex;
}
function makeBeam(color, h) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.3, h, 12, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
  m.position.y = h / 2; m.visible = false; m.renderOrder = 5; beacons.push(m); return m;
}
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(1, 1, 1);

// v21: 층(레벨) 0=1층, 1=2층, 2=지하 1층(B1). y는 '정렬된 y'(지하는 지상 1층 바로 아래 가운데), 높이는 레벨의 lz × FLOOR_Y (지하 = -1)
const wx = (x) => x - W / 2 + 0.5, wz = (y) => y - FH / 2 + 0.5;
const cellF = (c) => (map && map.lvl ? map.lvl[c] : Math.floor(((c / W) | 0) / FH));
const LZ = (f) => (map && map.levels && map.levels[f] ? map.levels[f].lz : f);
const fy = (c) => LZ(cellF(c)) * FLOOR_Y;
const wzc = (c) => wz(map && map.ay ? map.ay[c] : ((c / W) | 0) % FH);
const LV = (o) => (o.lv != null ? o.lv : Math.round(o.f || 0));
let B1 = -1, torchList = [], torchLights = [], torchPts = null, dinoObjs = [], weaponObj = null;
function setAt(o, c, y) { o.position.set(wx(c % W), (y || 0) + fy(c), wzc(c)); }

function labelSprite(text, color, scale) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.fill();
  g.font = 'bold 76px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(text, 64, 70);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(scale, scale, 1); s.renderOrder = 10; return s;
}

R3.init = function (el) {
  container = el;
  renderer = new THREE.WebGLRenderer({ antialias: !MOBILE && !STREAM, powerPreference: 'high-performance' });
  renderer.setPixelRatio(STREAM ? STREAM_Q : Math.min(window.devicePixelRatio || 1, MOBILE ? 1.25 : 1.5));
  renderer.shadowMap.enabled = SHADOWS;
  renderer.shadowMap.type = STREAM ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;
  el.appendChild(renderer.domElement);
  renderer.domElement.classList.add('gl');
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d1a);
  scene.fog = new THREE.Fog(0x0b0d1a, 30, 70);
  camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.maxPolarAngle = 1.38; controls.minDistance = 4; controls.maxDistance = 60;
  hemiLight = new THREE.HemisphereLight(0xdfe8ff, 0x2a2440, 1.25); scene.add(hemiLight);
  // 1인칭용 손전등(카메라를 따라다님). 셰이더 재컴파일을 피하려고 항상 두고 밝기만 바꿈
  lantern = new THREE.PointLight(0xffd9a8, 0, 9, 1.3); scene.add(lantern);
  // v21: 지하 횃불 빛 2개 (항상 장면에 두고 세기만 바꿈 → 셰이더 재컴파일 없음)
  for (let k = 0; k < 2; k++) { const l = new THREE.PointLight(0xff8a30, 0, 7, 1.4); scene.add(l); torchLights.push(l); }
  bindFpvDrag(renderer.domElement);
  dirLight = new THREE.DirectionalLight(0xfff1dd, 2.6);
  dirLight.position.set(-12, 24, 10);
  dirLight.castShadow = true;
  const sm = MOBILE || STREAM ? 512 : 1024;
  dirLight.shadow.mapSize.set(sm, sm);
  dirLight.shadow.bias = -0.0008; dirLight.shadow.normalBias = 0.02;
  scene.add(dirLight); scene.add(dirLight.target);
  R3.resize();
  R3.ok = true;
};

R3.resize = function () {
  if (!renderer) return;
  const w = container.clientWidth, h = container.clientHeight;
  renderer.setSize(w, h, false);
  renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
  camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
};

function disposeGroup(g) {
  if (beacons.length) g.traverse((o) => { const i = beacons.indexOf(o); if (i >= 0) beacons.splice(i, 1); });
  g.traverse((o) => { if (o.geometry && o.geometry !== debrisGeo) o.geometry.dispose(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { if (m.map && !isShared(m.map)) m.map.dispose(); m.dispose(); }); } });
  if (g.parent) g.parent.remove(g);
}

function makeRunner() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.32, 4, 10), new THREE.MeshStandardMaterial({ color: 0x3fb6ff, roughness: 0.45 }));
  body.position.y = 0.38; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffd9b0, roughness: 0.6 }));
  head.position.y = 0.82; head.castShadow = true; g.add(head);
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.04, 6, 14), new THREE.MeshStandardMaterial({ color: 0xffe14a, emissive: 0x442200 }));
  scarf.rotation.x = Math.PI / 2; scarf.position.y = 0.68; g.add(scarf);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), new THREE.MeshBasicMaterial({ color: 0x3fb6ff, transparent: true, opacity: 0.28, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.02; g.add(glow);
  const keyIcon = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), new THREE.MeshStandardMaterial({ color: 0xffd54a, emissive: 0x996600, metalness: 0.8, roughness: 0.3 }));
  keyIcon.position.set(0, 1.12, 0); keyIcon.visible = false; g.add(keyIcon);
  g.userData = { body, head, keyIcon, glow };
  return g;
}
function makeGiant(k) {
  const col = GIANT_COLORS[k % GIANT_COLORS.length];
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: col, roughness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a1010, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.9, 4, 12), skin); body.position.y = 0.95; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), skin); head.position.y = 1.85; head.castShadow = true; g.add(head);
  for (const s of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.25, 8), new THREE.MeshStandardMaterial({ color: 0xf3e6c8 }));
    horn.position.set(0.16 * s, 2.12, 0); horn.rotation.z = -0.4 * s; g.add(horn);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff27a, fog: false }));
    eye.position.set(0.11 * s, 1.9, 0.26); g.add(eye);
    const eg = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTex(), color: 0xffe040, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }));
    eg.position.set(0.11 * s, 1.9, 0.3); eg.scale.set(0.32, 0.32, 1); eg.visible = false; g.add(eg); eyeGlows.push(eg);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.6, 3, 8), skin); arm.position.set(0.45 * s, 1.05, 0.05); arm.rotation.z = 0.25 * s; arm.castShadow = true; g.add(arm);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.35, 3, 8), dark); leg.position.set(0.16 * s, 0.25, 0); leg.castShadow = true; g.add(leg);
    g.userData['arm' + s] = arm; g.userData['leg' + s] = leg;
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0x220000 })); mouth.position.set(0, 1.74, 0.28); g.add(mouth);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.52, 28), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.5, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring);
  const label = labelSprite(String(k + 1), '#ffd0d0', 0.45); label.position.y = 2.55; g.add(label);
  // 벽 부수기: 휘두를 때만 주먹이 주황빛으로 커짐 (망치 아이템은 없어짐)
  const hm = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), new THREE.MeshStandardMaterial({ color: col, emissive: 0xff7a1a, emissiveIntensity: 1.1, roughness: 0.4 })); hm.position.set(0, -0.32, 0.02); hm.visible = false; g.userData.arm1.add(hm);
  g.userData.body = body; g.userData.ring = ring; g.userData.fist = hm; g.userData.label = label; g.userData.swingT = -9;
  // 기절 별 (샷건) · 연막 · 냄새 추적기 표시
  const stars = new THREE.Group(); stars.position.y = 2.45; stars.visible = false; g.add(stars);
  for (let i = 0; i < 4; i++) { const st = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex('⭐'), transparent: true, depthWrite: false, fog: false })); st.scale.set(0.34, 0.34, 1); stars.add(st); }
  const status = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex('🐾', '#59e39a'), transparent: true, depthWrite: false })); status.scale.set(0.5, 0.5, 1); status.position.y = 2.95; status.visible = false; g.add(status);
  g.userData.stars = stars; g.userData.status = status;
  return g;
}
function makeItem(type, side) {
  const g = new THREE.Group(), col = side === 'R' ? '#4fc3ff' : '#ff6b6b';
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex(ITEM_ICON[type] || '❓', col), transparent: true, depthWrite: false }));
  sp.scale.set(0.62, 0.62, 1); sp.position.y = 0.5; g.add(sp);
  const halo = new THREE.Mesh(new THREE.CircleGeometry(0.36, 20), new THREE.MeshBasicMaterial({ color: side === 'R' ? 0x4fc3ff : 0xff6b6b, transparent: true, opacity: 0.3, depthWrite: false }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.02; g.add(halo);
  const beam = makeBeam(side === 'R' ? 0x4fc3ff : 0xff6b6b, 3.5); beam.material.opacity = 0.22; g.add(beam); beam.visible = R3.camMode === 'fpv';
  g.userData = { sp }; return g;
}
function makeBarricade(by) {
  const g = new THREE.Group(), giant = by !== 'runner';
  const wood = new THREE.MeshStandardMaterial({ color: giant ? 0x5a3b2e : 0x9b6a3c, roughness: 0.85 });
  const metal = new THREE.MeshStandardMaterial({ color: giant ? 0xd23b3b : 0xffcf3a, roughness: 0.5, emissive: giant ? 0x400000 : 0x3a2a00 });
  const inner = new THREE.Group(); g.add(inner);
  for (let i = 0; i < 3; i++) { const pl = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.2, 0.12), wood); pl.position.set(0, 0.15 + i * 0.28, (i % 2 ? 0.08 : -0.08)); pl.castShadow = true; inner.add(pl); }
  for (const s of [-1, 1]) { const x = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.12), wood); x.position.set(0.32 * s, 0.45, 0); x.rotation.z = 0.5 * s; x.castShadow = true; inner.add(x); }
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.08, 0.2), metal); band.position.y = 0.72; inner.add(band);
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex(giant ? '🚧' : '🧱'), transparent: true, depthWrite: false })); sign.scale.set(0.42, 0.42, 1); sign.position.y = 1.2; g.add(sign);
  g.userData = { inner, sign, hitT: -9, wood }; return g;
}
function makeKey() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffcf3a, metalness: 0.85, roughness: 0.25, emissive: 0x664400, emissiveIntensity: 0.6 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.04, 8, 18), mat); ring.position.y = 0.2; g.add(ring);
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.32, 0.05), mat); shaft.position.y = -0.06; g.add(shaft);
  const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.04, 0.05), mat); t1.position.set(0.05, -0.17, 0); g.add(t1);
  const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.05), mat); t2.position.set(0.04, -0.09, 0); g.add(t2);
  g.children.forEach((c) => (c.castShadow = true));
  const beam = makeBeam(0xffd54a, 7); beam.position.y = 2.9; g.add(beam);
  const halo = new THREE.Mesh(new THREE.CircleGeometry(0.38, 20), new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.22, depthWrite: false }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = -0.58; g.add(halo);
  return g;
}
function makeDoor(e, name) {
  const x = e % W, y = (e / W) | 0;
  const g = new THREE.Group();
  g.position.set(wx(x), 0, wz(y));
  const vertical = x === 0 || x === W - 1; // 문이 좌우 벽에 있으면 문틀은 z축 방향
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.7 });
  const postGeo = new THREE.BoxGeometry(0.16, 1.6, 0.16);
  for (const s of [-1, 1]) { const p = new THREE.Mesh(postGeo, frameMat); p.position.set(vertical ? 0 : 0.45 * s, 0.8, vertical ? 0.45 * s : 0); p.castShadow = true; g.add(p); }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(vertical ? 0.18 : 1.06, 0.16, vertical ? 1.06 : 0.18), frameMat); lintel.position.y = 1.62; lintel.castShadow = true; g.add(lintel);
  const barMat = new THREE.MeshStandardMaterial({ color: 0xffa630, emissive: 0xff7a00, emissiveIntensity: 1.2, transparent: true, opacity: 0.75 });
  const barrier = new THREE.Mesh(new THREE.BoxGeometry(vertical ? 0.06 : 0.76, 1.4, vertical ? 0.76 : 0.06), barMat); barrier.position.y = 0.72; g.add(barrier);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x59e39a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.45), glowMat); glow.position.y = 0.75; if (vertical) glow.rotation.y = Math.PI / 2; g.add(glow);
  const label = labelSprite(name, '#ffd54a', 0.55); label.position.y = 2.1; g.add(label);
  const beam = makeBeam(0xff9a2a, 9); g.add(beam);
  g.userData = { barrier, glow, barMat, label, beam };
  return g;
}

R3.setMap = function (m) {
  if (mapGroup) disposeGroup(mapGroup);
  respawnMarks.length = 0;
  beacons = []; eyeGlows = []; fpv.init = false; itemObjs = new Map(); barObjs = new Map();
  chestObjs = new Map(); leverObjs = new Map(); gemObjs = []; pedObjs = []; plateObjs = []; pillObjs = new Map(); snakeObjs = []; stairObjs = [];
  for (const f of fxObjs) disposeGroup(f.obj); fxObjs = []; lastFogVer = -1; lastFocus = -1;
  for (const d of debris) { scene.remove(d.mesh); } debris = [];
  map = m; W = m.W; H = m.H; FH = m.FH || m.H;
  const LVS = m.levels || Array.from({ length: m.floors || 1 }, (_, f) => ({ row0: f * FH, h: FH, zOff: 0, lz: f }));
  NF = LVS.length; B1 = m.B1 != null ? m.B1 : -1;
  dinoObjs = []; weaponObj = null; torchPts = null; torchList = []; boulderObjs = [];
  mapGroup = new THREE.Group(); scene.add(mapGroup);
  const tileGeo = new THREE.PlaneGeometry(0.96, 0.96); tileGeo.rotateX(-Math.PI / 2);
  const wallGeo = new THREE.BoxGeometry(1, 0.95, 1); wallGeo.translate(0, 0.475, 0);
  const cA = new THREE.Color(0x3a3f63), cB = new THREE.Color(0x42486e), cA2 = new THREE.Color(0x3d4a5e), cB2 = new THREE.Color(0x46546a);
  const cw1 = new THREE.Color(0x8d96d0), cw2 = new THREE.Color(0x7f88c2), cw3 = new THREE.Color(0x86b0c8), cw4 = new THREE.Color(0x789fb8);
  wallIndex = new Int32Array(W * H).fill(-1); wallsMeshes = []; ghostWalls = []; tileMeshes = []; floorPlanes = [];
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0x9fb4ff, transparent: true, opacity: 0.07, depthWrite: false });
  const cA3 = new THREE.Color(0x2e2620), cB3 = new THREE.Color(0x352b23), cw5 = new THREE.Color(0x6e5a48), cw6 = new THREE.Color(0x5c4a3b);
  for (let f = 0; f < NF; f++) {
    const L = LVS[f], ug = f === B1, y0 = L.lz * FLOOR_Y, cells = [], wl = [];
    for (let i = L.row0 * W; i < (L.row0 + L.h) * W; i++) { if (m.g[i] !== 1) cells.push(i); else wl.push(i); } // v22: 바위 칸(g=3)은 바닥
    // 바닥판 (2층은 살짝 다른 색, 지하는 어두운 흙색)
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(W + (f ? 1 : 6), L.h + (f ? 1 : 6)), new THREE.MeshStandardMaterial({ color: ug ? 0x0e0a08 : f ? 0x1d2a3a : 0x1b2040, roughness: 0.95 }));
    plane.rotation.x = -Math.PI / 2; plane.position.y = y0 - (f ? 0.02 : 0); plane.receiveShadow = true; mapGroup.add(plane); floorPlanes.push(plane);
    const tiles = new THREE.InstancedMesh(tileGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), cells.length);
    cells.forEach((i, n) => { const x = i % W, y = m.ay ? m.ay[i] : (i / W) | 0, yy = (i / W) | 0; tmpM.makeTranslation(wx(x), 0.005, wz(y)); tiles.setMatrixAt(n, tmpM); tiles.setColorAt(n, (x + yy) % 2 ? (ug ? cA3 : f ? cA2 : cA) : (ug ? cB3 : f ? cB2 : cB)); });
    tiles.position.y = y0; tiles.receiveShadow = true; mapGroup.add(tiles); tileMeshes.push(tiles);
    const walls = new THREE.InstancedMesh(wallGeo, new THREE.MeshStandardMaterial({ color: ug ? 0x8a7560 : 0x9aa2d8, roughness: ug ? 0.95 : 0.75 }), Math.max(1, wl.length));
    const ghost = new THREE.InstancedMesh(wallGeo, ghostMat, Math.max(1, wl.length));
    wl.forEach((i, n) => { const x = i % W, y = m.ay ? m.ay[i] : (i / W) | 0, yy = (i / W) | 0; tmpM.makeTranslation(wx(x), 0, wz(y)); walls.setMatrixAt(n, tmpM); ghost.setMatrixAt(n, tmpM); walls.setColorAt(n, (x * 7 + yy * 3) % 5 ? (ug ? cw5 : f ? cw3 : cw1) : (ug ? cw6 : f ? cw4 : cw2)); wallIndex[i] = n; });
    if (ug) { walls.castShadow = false; }
    walls.position.y = y0; ghost.position.y = y0; walls.castShadow = true; walls.receiveShadow = true; ghost.visible = false;
    mapGroup.add(walls); mapGroup.add(ghost); wallsMeshes.push(walls); ghostWalls.push(ghost);
  }
  wallsMesh = wallsMeshes[0];
  // 문 근처 구역 (거인이 오래 머물 수 없음)
  const zone = []; for (const i of m.floor) if (m.nearDoor[i]) zone.push(i);
  doorZoneMesh = new THREE.InstancedMesh(tileGeo, new THREE.MeshBasicMaterial({ color: 0xffe680, transparent: true, opacity: 0.08, depthWrite: false }), Math.max(1, zone.length));
  zone.forEach((i, k) => { tmpM.makeTranslation(wx(i % W), 0.015 + fy(i), wzc(i)); doorZoneMesh.setMatrixAt(k, tmpM); });
  doorZoneMesh.count = zone.length; mapGroup.add(doorZoneMesh);
  // 거인 시야 타일
  visionMesh = new THREE.InstancedMesh(tileGeo, new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.22, depthWrite: false }), W * H);
  visionMesh.count = 0; visionMesh.frustumCulled = false; mapGroup.add(visionMesh); lastVisionVer = -1;
  // 전장의 안개 (보고 있는 층만)
  fogMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.0, 0.06, 1.0), new THREE.MeshBasicMaterial({ color: 0x05060d, transparent: true, opacity: 0.78, depthWrite: false }), W * H);
  fogMesh.count = 0; fogMesh.frustumCulled = false; fogMesh.renderOrder = 4; fogMesh.position.y = 1.02; mapGroup.add(fogMesh);
  // 샷건 섬광 (1인칭 화면 앞)
  muzzle = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTex(), color: 0xffc040, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false, transparent: true }));
  muzzle.visible = false; muzzle.renderOrder = 20; scene.add(muzzle); fxObjs.push({ obj: muzzle, keep: true });
  // 문
  doorObjs = m.exits.map((e, k) => { const d = makeDoor(e, m.exitNames[k]); d.position.y += fy(e); d.userData.cell = e; mapGroup.add(d); return d; });
  // 계단 (1층에서 2층으로 올라가는 나선 계단)
  for (const [a, b2] of (m.stairs || [])) {
    const o = makeStairs(); setAt(o, a, 0); o.userData.cells = [a, b2]; mapGroup.add(o); stairObjs.push(o);
    const up = new THREE.Group(); setAt(up, b2, 0); up.userData.cells = [b2];
    const hole = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.46, 24), new THREE.MeshBasicMaterial({ color: 0x59e39a, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
    hole.rotation.x = -Math.PI / 2; hole.position.y = 0.03; up.add(hole);
    // 2층 계단참: 어두운 계단 구멍 + 나무 난간 + 아래로 내려가는 첫 계단들
    const pit = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ color: 0x05060c })); pit.rotation.x = -Math.PI / 2; pit.position.y = 0.025; up.add(pit);
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.6 }), stepM = new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.7 });
    for (let q = 0; q < 4; q++) { const a2 = (q / 4) * Math.PI * 2 + Math.PI / 4; const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), wood); post.position.set(Math.cos(a2) * 0.52, 0.25, Math.sin(a2) * 0.52); up.add(post); }
    for (const [rx, rz, ry] of [[0, -0.37, 0], [0.37, 0, Math.PI / 2], [-0.37, 0, Math.PI / 2]]) { const rl = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.04, 0.04), wood); rl.position.set(rx, 0.5, rz); rl.rotation.y = ry; up.add(rl); }
    for (let q = 0; q < 3; q++) { const a2 = Math.PI * 0.5 + q * 0.6, st = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.16), stepM); st.position.set(Math.cos(a2) * 0.2, 0.06 - q * 0.0, Math.sin(a2) * 0.2); st.rotation.y = -a2; st.scale.setScalar(1 - q * 0.18); up.add(st); }
    const pole2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8), wood); pole2.position.y = 0.3; up.add(pole2);
    const lab = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex('⬇', '#59e39a'), transparent: true, depthWrite: false })); lab.scale.set(0.45, 0.45, 1); lab.position.y = 1.3; up.add(lab); up.userData.label = lab;
    const bm = makeBeam(0x59e39a, 4); bm.material.opacity = 0.2; up.add(bm); mapGroup.add(up); stairObjs.push(up);
  }
  // v21: 해치 (지상 1층 구멍 ↔ 지하 사다리)
  for (const [a, b2] of (m.hatches || [])) {
    const top = makeHatch(false); setAt(top, a, 0); top.userData.cells = [a]; mapGroup.add(top); stairObjs.push(top);
    const bot = makeHatch(true); setAt(bot, b2, 0); bot.userData.cells = [b2]; mapGroup.add(bot); stairObjs.push(bot);
  }
  if (B1 >= 0) buildUnderground(m, LVS[B1]);
  for (const b of (m.boulders || [])) { const o = makeBoulder(b.home); setAt(o, b.home, 0); o.userData.cell = b.home; mapGroup.add(o); boulderObjs.push(o); } // v22 바위
  // 열쇠 + 잠긴 상자
  keyObjs = new Map();
  for (const kk of m.keys) {
    const o = makeKey(); setAt(o, kk, 0.95); mapGroup.add(o); keyObjs.set(kk, o);
    const ch = makeChest(); setAt(ch, kk, 0); mapGroup.add(ch); chestObjs.set(kk, ch);
  }
  // 미션 물건
  (m.missions || []).forEach((M, mi) => {
    if (M.type === 'switch') M.levers.forEach((c, li) => { const o = makeLever(); setAt(o, c, 0); mapGroup.add(o); leverObjs.set(mi + ':' + li, o); });
    if (M.type === 'carry') { const g = makeGem(); setAt(g, M.gem, 0); mapGroup.add(g); gemObjs[mi] = g; const p = makePedestal(); setAt(p, M.pedestal, 0); mapGroup.add(p); pedObjs[mi] = p; }
    if (M.type === 'plate') { const p = makePlate(); setAt(p, M.plate, 0); mapGroup.add(p); plateObjs[mi] = p; }
  });
  // 캐릭터
  runnerObj = makeRunner(); runnerObj.scale.setScalar(1.35); mapGroup.add(runnerObj);
  scoutObjs = []; { const o = makeRunner(); o.scale.setScalar(1.35); o.visible = false; mapGroup.add(o); scoutObjs.push(o); } // v25 길 찾는 분신: 도망자와 똑같이 생김
  { const g = makeGem(true); g.position.set(0, 1.25, 0); g.visible = false; runnerObj.add(g); runnerObj.userData.gem = g; }
  giantObjs = m.giantStarts.map((_, k) => { const o = makeGiant(k); mapGroup.add(o); return o; });
  snakeObjs = (m.snakeStarts || []).map(() => { const o = makeSnake(); mapGroup.add(o); return o; });
  // 시야 부채꼴
  coneMeshes = m.giantStarts.map((_, k) => {
    const geo = new THREE.CircleGeometry(1, 24, -Math.PI / 2 - Math.PI / 3, (2 * Math.PI) / 3); geo.rotateX(-Math.PI / 2);
    const c = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: GIANT_COLORS[k], transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }));
    c.position.y = 0.03; mapGroup.add(c); return c;
  });
  // 그림자 카메라
  const half = Math.max(W, FH) / 2 + 2;
  Object.assign(dirLight.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 80 });
  dirLight.shadow.camera.updateProjectionMatrix();
  applyModeVisuals();
  if (R3.camMode === 'orbit') R3.resetCamera();
};
// v21: 해치 — 지상: 나무 테두리의 어두운 구멍 + 사다리 끝 + 🕳️ / 지하: 위로 올라가는 사다리 + 빛 새는 구멍
function makeHatch(under) {
  const g = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.7 });
  if (!under) {
    const pit = new THREE.Mesh(new THREE.CircleGeometry(0.4, 20), new THREE.MeshBasicMaterial({ color: 0x020203 })); pit.rotation.x = -Math.PI / 2; pit.position.y = 0.02; g.add(pit);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 6, 20), wood); rim.rotation.x = Math.PI / 2; rim.position.y = 0.04; g.add(rim);
    for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.05), wood); r.position.set(0.18 * s, 0.15, 0); g.add(r); }
  } else {
    for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.06, FLOOR_Y, 0.06), wood); r.position.set(0.2 * s, FLOOR_Y / 2, -0.3); g.add(r); }
    for (let i = 0; i < 8; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.05), wood); st.position.set(0, 0.3 + i * 0.38, -0.3); g.add(st); }
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.1, 16), new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.35, depthWrite: false })); shaft.position.y = 0.03; g.add(shaft);
  }
  const lab = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex(under ? '⬆' : '🕳️', '#c89a5a'), transparent: true, depthWrite: false })); lab.scale.set(0.5, 0.5, 1); lab.position.y = 1.3; g.add(lab);
  g.userData = { label: lab }; return g;
}
// v21: 지하 — 횃불(인스턴스 막대 + 불꽃 점 하나로 그려 가벼움), 공룡, 전설의 무기
function buildUnderground(m, L) {
  const cand = [];
  for (let yy = 1; yy < L.h - 1; yy++) for (let x = 1; x < W - 1; x++) {
    const i = (L.row0 + yy) * W + x; if (m.g[i] !== 1) continue;
    let dir = null; for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const j = i + dx + dy * W; if (m.g[j] !== 1 && m.lvl[j] === B1) { dir = [dx, dy]; break; } }
    if (dir) cand.push([i, dir]);
  }
  let seed = 1234567; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = cand.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [cand[k], cand[j]] = [cand[j], cand[k]]; }
  for (const [i, dir] of cand) { if (torchList.length >= 70) break; if (torchList.every((t) => Math.abs(t.i % W - i % W) + Math.abs(m.ay[t.i] - m.ay[i]) >= 5)) torchList.push({ i, dir }); }
  const y0 = L.lz * FLOOR_Y, stick = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.05, 0.36, 5), new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.8 }), Math.max(1, torchList.length));
  const pos = new Float32Array(torchList.length * 3);
  torchList.forEach((t, n) => {
    const x = wx(t.i % W) + t.dir[0] * 0.52, z = wz(m.ay[t.i]) + t.dir[1] * 0.52; t.x = x; t.z = z; t.y = y0 + 0.98;
    tmpQ.setFromAxisAngle(tmpV.set(t.dir[1], 0, -t.dir[0]), 0.5); tmpM.compose(tmpV.set(x, y0 + 0.78, z), tmpQ, tmpS); stick.setMatrixAt(n, tmpM);
    pos[n * 3] = x; pos[n * 3 + 1] = t.y; pos[n * 3 + 2] = z;
  });
  stick.userData.ug = true; mapGroup.add(stick);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  torchPts = new THREE.Points(geo, new THREE.PointsMaterial({ map: getGlowTex(), color: 0xff9a3a, size: 0.9, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  torchPts.userData.ug = true; torchPts.userData.stick = stick; mapGroup.add(torchPts);
  for (let i = 0; i < 2; i++) { const o = makeDino(); o.visible = false; mapGroup.add(o); dinoObjs.push(o); } // v23: 공룡 2마리
  weaponObj = makeWeapon(); weaponObj.visible = false; mapGroup.add(weaponObj);
}
// 2×2 큰 공룡 (티라노 느낌): 몸통·꼬리·목·머리(턱이 열림)·이빨·작은 팔·굵은 다리·빛나는 눈
function makeDino() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const skin = new THREE.MeshStandardMaterial({ color: 0x5a8a40, roughness: 0.8, emissive: 0x23401a, emissiveIntensity: 1 }), belly = new THREE.MeshStandardMaterial({ color: 0xb8a070, roughness: 0.85, emissive: 0x3a3020, emissiveIntensity: 1 }), dark = new THREE.MeshStandardMaterial({ color: 0x2f4a22, roughness: 0.8 });
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 10), skin); torso.scale.set(0.85, 0.8, 1.35); torso.position.set(0, 1.25, 0); torso.castShadow = true; body.add(torso);
  const bel = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), belly); bel.scale.set(0.8, 0.7, 1.2); bel.position.set(0, 1.08, 0.12); body.add(bel);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.38, 1.7, 10), skin); tail.rotation.x = -Math.PI / 2 - 0.25; tail.position.set(0, 1.25, -1.35); tail.castShadow = true; body.add(tail);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.36, 0.7, 10), skin); neck.rotation.x = 0.7; neck.position.set(0, 1.7, 0.72); body.add(neck);
  const head = new THREE.Group(); head.position.set(0, 2.0, 0.98); body.add(head);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.78), skin); skull.position.set(0, 0.06, 0.28); skull.castShadow = true; head.add(skull);
  const jaw = new THREE.Group(); jaw.position.set(0, -0.08, 0.0); head.add(jaw);
  const jm = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.7), dark); jm.position.set(0, -0.06, 0.3); jaw.add(jm);
  const toothM = new THREE.MeshStandardMaterial({ color: 0xf2efe0, roughness: 0.4 });
  for (let i = 0; i < 6; i++) { for (const s of [-1, 1]) { const t = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 4), toothM); t.rotation.x = Math.PI; t.position.set(0.19 * s, -0.14, 0.12 + i * 0.1); head.add(t); } }
  const eyeM = new THREE.MeshBasicMaterial({ color: 0xffd23a });
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), eyeM); e.position.set(0.24 * s, 0.17, 0.2); head.add(e); }
  for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 4), dark); sp.position.set(0, 1.78 - i * 0.04, 0.35 - i * 0.38); body.add(sp); }
  const arms = []; for (const s of [-1, 1]) { const a = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.32, 6), skin); a.position.set(0.36 * s, 1.25, 0.62); a.rotation.x = 0.9; body.add(a); arms.push(a); }
  const legs = []; for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(0.38 * s, 1.05, -0.1); g.add(leg);
    const th = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.72, 8), skin); th.position.y = -0.36; th.castShadow = true; leg.add(th);
    const ft = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.45), dark); ft.position.set(0, -0.98, 0.1); leg.add(ft);
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.4, 6), skin); sh.position.set(0, -0.78, 0); leg.add(sh); legs.push(leg);
  }
  const lab = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex('🦖', '#c8ff6a'), transparent: true, depthWrite: false })); lab.scale.set(0.8, 0.8, 1); lab.position.y = 3.0; g.add(lab);
  g.userData = { body, head, jaw, legs, tail, label: lab, last: null, walk: 0 };
  return g;
}
// 거인 퇴치 번개창: 금빛 삼지창 + 빛 + 빛기둥
// v22 바위: 울퉁불퉁한 큰 돌 (칸 하나를 꽉 채움) + 막고 있으면 빨간 경고 고리
let boulderObjs = [];
function makeBoulder(seed) {
  const g = new THREE.Group(), geo = new THREE.IcosahedronGeometry(0.62, 1), p = geo.attributes.position; let s = (seed * 9301 + 49297) % 233280;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }, seen = new Map();
  for (let i = 0; i < p.count; i++) { const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`; let k = seen.get(key); if (k == null) { k = 0.82 + rnd() * 0.3; seen.set(key, k); } p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.88, p.getZ(i) * k); }
  geo.computeVertexNormals();
  const rock = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x6e665c, roughness: 0.95, metalness: 0.02, flatShading: true, emissive: 0x15120e, emissiveIntensity: 1 }));
  rock.castShadow = true; rock.receiveShadow = true;
  const roll = new THREE.Group(); roll.position.y = 0.56; roll.add(rock); g.add(roll);
  const moss = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshStandardMaterial({ color: 0x3e5530, roughness: 1, flatShading: true })); moss.scale.set(1.3, 0.3, 1); moss.position.set(0.14, 0.47, 0.12); rock.add(moss);
  const warn = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.76, 32), new THREE.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  warn.rotation.x = -Math.PI / 2; warn.position.y = 0.05; warn.visible = false; g.add(warn);
  g.userData = { roll, warn };
  return g;
}
const _bv = new THREE.Vector3();
function updateBoulders(s, now, dt) {
  const bs = s.boulders || [];
  boulderObjs.forEach((o, i) => {
    const b = bs[i]; if (!b || b.gone) { o.visible = false; return; }
    o.visible = onF(b.cell);
    _bv.set(wx(b.cell % W), fy(b.cell) + (b.carried ? 2.1 : 0), wzc(b.cell)); // v24: 거인이 머리 위로 들고 나름
    const dx = _bv.x - o.position.x, dz = _bv.z - o.position.z, dist = Math.hypot(dx, dz);
    if (dist > 2.5 || Math.abs(_bv.y - o.position.y) > 0.5) o.position.copy(_bv); // 제자리로 굴러감·층 이동: 바로
    else if (dist > 0.001) {
      const st = Math.min(dist, dt * 3.2); o.position.x += dx / dist * st; o.position.z += dz / dist * st;
      const r = o.userData.roll; r.rotation.z -= (dx / dist) * st / 0.56; r.rotation.x += (dz / dist) * st / 0.56; // 굴러가는 모습
    }
    const w = o.userData.warn; w.visible = !!b.blocked; if (w.visible) w.material.opacity = 0.55 + 0.35 * Math.sin(now * 5);
  });
}
function makeWeapon() {
  const g = new THREE.Group(), gold = new THREE.MeshStandardMaterial({ color: 0xffd24a, metalness: 0.8, roughness: 0.25, emissive: 0x8a5a00, emissiveIntensity: 1.2 });
  const inner = new THREE.Group(); inner.position.y = 0.75; g.add(inner);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.0, 8), gold); inner.add(shaft);
  for (const s of [-1, 0, 1]) { const p = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.28, 6), gold); p.position.set(0.12 * s, 0.62 - Math.abs(s) * 0.04, 0); inner.add(p); }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.04), gold); bar.position.y = 0.48; inner.add(bar);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTex(), color: 0x7fd8ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.8 })); glow.scale.set(1.6, 1.6, 1); glow.position.y = 0.8; g.add(glow);
  const bm = makeBeam(0x7fd8ff, 5); bm.material.opacity = 0.25; g.add(bm);
  g.userData = { inner, glow }; return g;
}
// 계단: 칸 안에서 빙글빙글 올라가는 디딤판 + 기둥 + ⬆ 표시
function makeStairs() {
  const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.7 }), rail = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.6 });
  const steps = 10, stepGeo = new THREE.BoxGeometry(0.42, 0.08, 0.2);
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2, st = new THREE.Mesh(stepGeo, mat);
    st.position.set(Math.cos(a) * 0.22, 0.08 + (i / steps) * FLOOR_Y, Math.sin(a) * 0.22); st.rotation.y = -a; st.castShadow = true; g.add(st);
  }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, FLOOR_Y, 8), rail); pole.position.y = FLOOR_Y / 2; g.add(pole);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.5, 24), new THREE.MeshBasicMaterial({ color: 0x59e39a, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring);
  const lab = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex('⬆', '#59e39a'), transparent: true, depthWrite: false })); lab.scale.set(0.45, 0.45, 1); lab.position.y = 1.3; g.add(lab);
  const bm = makeBeam(0x59e39a, 4); bm.material.opacity = 0.2; g.add(bm);
  g.userData = { label: lab, steps: true }; return g;
}
function makeChest() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a4a22, roughness: 0.7 }), band = new THREE.MeshStandardMaterial({ color: 0xd8b04a, metalness: 0.7, roughness: 0.35, emissive: 0x332200 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.38, 0.44), wood); box.position.y = 0.19; box.castShadow = true; g.add(box);
  const lidPivot = new THREE.Group(); lidPivot.position.set(0, 0.38, -0.22); g.add(lidPivot);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.12, 0.46), wood); lid.position.set(0, 0.06, 0.22); lid.castShadow = true; lidPivot.add(lid);
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.06, 0.48), band); strap.position.y = 0.3; g.add(strap);
  const lockMat = new THREE.MeshStandardMaterial({ color: 0xff5050, emissive: 0x991010, emissiveIntensity: 0.8 });
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.05), lockMat); lock.position.set(0, 0.28, 0.24); g.add(lock);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ color: 0xff5050, transparent: true, opacity: 0.25, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.02; g.add(glow);
  g.userData = { lidPivot, lock, lockMat, glow, open: 0 }; return g;
}
function makeLever() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.3), new THREE.MeshStandardMaterial({ color: 0x555b70, metalness: 0.6, roughness: 0.4 })); base.position.y = 0.06; g.add(base);
  const pivot = new THREE.Group(); pivot.position.y = 0.12; g.add(pivot);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 8), new THREE.MeshStandardMaterial({ color: 0xcfd6e6, metalness: 0.8, roughness: 0.3 })); stick.position.y = 0.21; pivot.add(stick);
  const knobMat = new THREE.MeshStandardMaterial({ color: 0xff4a4a, emissive: 0x801010, emissiveIntensity: 1 });
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), knobMat); knob.position.y = 0.44; pivot.add(knob);
  pivot.rotation.z = 0.6; g.children.forEach((c) => (c.castShadow = true));
  // 칸 가장자리로 살짝 비켜 세우고 조금 크게 (도망자 몸에 가려지지 않게)
  const inner = new THREE.Group(); [...g.children].forEach((c) => inner.add(c)); inner.position.x = 0.26; inner.scale.setScalar(1.35); g.add(inner);
  const lab = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex('🕹️', '#ffd54a'), transparent: true, depthWrite: false })); lab.scale.set(0.4, 0.4, 1); lab.position.y = 0.95; g.add(lab);
  g.userData = { pivot, knobMat, label: lab, on: false }; return g;
}
function makeGem(small) {
  const g = new THREE.Group();
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(small ? 0.1 : 0.17), new THREE.MeshStandardMaterial({ color: 0x40e0ff, emissive: 0x1088aa, emissiveIntensity: 1.2, metalness: 0.3, roughness: 0.1 }));
  gem.position.y = small ? 0 : 0.5; g.add(gem);
  if (!small) { const halo = new THREE.Mesh(new THREE.CircleGeometry(0.36, 20), new THREE.MeshBasicMaterial({ color: 0x40e0ff, transparent: true, opacity: 0.3, depthWrite: false })); halo.rotation.x = -Math.PI / 2; halo.position.y = 0.02; g.add(halo); const bm = makeBeam(0x40e0ff, 3.5); bm.material.opacity = 0.2; g.add(bm); }
  g.userData = { gem }; return g;
}
function makePedestal() {
  const g = new THREE.Group();
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.55, 12), new THREE.MeshStandardMaterial({ color: 0xd8dce8, roughness: 0.5 })); col.position.y = 0.275; col.castShadow = true; g.add(col);
  const topMat = new THREE.MeshStandardMaterial({ color: 0x223040, emissive: 0x0a2a3a, emissiveIntensity: 1 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 12), topMat); top.position.y = 0.58; g.add(top);
  const gem = makeGem(true); gem.position.y = 0.75; gem.visible = false; g.add(gem);
  g.userData = { topMat, gem }; return g;
}
function makePlate() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, emissive: 0x402000, emissiveIntensity: 0.6, roughness: 0.5 });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.06, 0.84), mat); plate.position.y = 0.03; plate.receiveShadow = true; g.add(plate);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.4, 32, 1, 0, 0.001), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.075; g.add(ring);
  const lab = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex('⏳', '#ffd54a'), transparent: true, depthWrite: false })); lab.scale.set(0.4, 0.4, 1); lab.position.y = 0.9; g.add(lab);
  g.userData = { plate, mat, ring, ringMat, label: lab, lastN: -1 }; return g;
}
// 뷱: 초록 몸통 마디 + 빛나는 눈 + 혀
const SNAKE_SEGS = 20; // 최대 길이 18 + 여유
function makeSnake() {
  const g = new THREE.Group(), segs = [];
  const skinA = new THREE.MeshStandardMaterial({ color: 0x2fae4a, roughness: 0.45, emissive: 0x062a0c }), skinB = new THREE.MeshStandardMaterial({ color: 0x8bd94a, roughness: 0.45, emissive: 0x0a2a06 });
  const segGeo = new THREE.SphereGeometry(0.27, 14, 10);
  for (let i = 0; i < SNAKE_SEGS; i++) { const m = new THREE.Mesh(segGeo, i % 2 ? skinB : skinA); m.castShadow = true; m.visible = false; g.add(m); segs.push(m); }
  const head = new THREE.Group(); g.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12), skinA); skull.scale.set(1, 0.8, 1.25); skull.castShadow = true; head.add(skull);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff35a, fog: false })); eye.position.set(0.16 * sx, 0.16, 0.24); head.add(eye);
    const eg = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTex(), color: 0xc8ff40, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true })); eg.position.set(0.16 * sx, 0.16, 0.28); eg.scale.set(0.38, 0.38, 1); head.add(eg);
  }
  const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.28), new THREE.MeshBasicMaterial({ color: 0xff3060 })); tongue.position.set(0, -0.04, 0.5); head.add(tongue);
  const lab = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex('🐍', '#59e39a'), transparent: true, depthWrite: false })); lab.scale.set(0.5, 0.5, 1); lab.position.y = 0.9; head.add(lab);
  const mound = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 1 })); mound.scale.y = 0.4; mound.visible = false; g.add(mound);
  g.userData = { segs, head, tongue, label: lab, mound }; return g;
}
function makePill() {
  const g = new THREE.Group();
  const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.16, 4, 10), new THREE.MeshStandardMaterial({ color: 0xff5fd2, emissive: 0xc0208a, emissiveIntensity: 1.3, roughness: 0.3 }));
  cap.rotation.z = Math.PI / 2; cap.position.y = 0.32; g.add(cap);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTex(), color: 0xff70e0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 })); sp.scale.set(0.7, 0.7, 1); sp.position.y = 0.32; g.add(sp);
  g.userData = { cap }; return g;
}

R3.resetCamera = function () {
  // 화면 비율에 맞춰 미로 전체가 보이도록
  const Lh = map && map.levels && map.levels[focusF] ? map.levels[focusF].h : FH;
  const fit = Math.max(Lh * 1.05, (W * 1.0) / Math.max(0.5, camera.aspect)), y0 = LZ(focusF) * FLOOR_Y;
  camera.position.set(0, y0 + fit * 1.04, fit * 0.66);
  controls.target.set(0, y0, 0.6); controls.update();
};
// 거인의 벽 부수기: 벽 숨기기 + 파편 + 먼지 + 화면 흔들림
const debrisGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
R3.smash = function (cells, giant) {
  if (!wallsMeshes.length || !wallIndex) return;
  for (const c of cells) {
    const n = wallIndex[c]; if (n < 0) continue;
    const wm = wallsMeshes[cellF(c)]; wm.setMatrixAt(n, zeroM); ghostWalls[cellF(c)].setMatrixAt(n, zeroM); wallIndex[c] = -1;
    wm.instanceMatrix.needsUpdate = true; ghostWalls[cellF(c)].instanceMatrix.needsUpdate = true;
    const cx = wx(c % W), cz = wzc(c), hgt = 0.95 * wm.scale.y, by = fy(c);
    const mat = new THREE.MeshStandardMaterial({ color: 0x8d96d0, roughness: 0.8, transparent: true, opacity: 1 });
    for (let k = 0; k < 16; k++) {
      const m = new THREE.Mesh(debrisGeo, mat); const sc = 0.6 + Math.random() * 1.4; m.scale.setScalar(sc);
      m.position.set(cx + (Math.random() - 0.5) * 0.7, by + Math.random() * hgt, cz + (Math.random() - 0.5) * 0.7);
      m.castShadow = true; scene.add(m);
      debris.push({ mesh: m, v: new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 3.5, (Math.random() - 0.5) * 4), r: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8), life: 0, mat, floorY: by });
    }
    const dust = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.5, 24), new THREE.MeshBasicMaterial({ color: 0xd8d2c0, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
    dust.rotation.x = -Math.PI / 2; dust.position.set(cx, by + 0.05, cz); scene.add(dust);
    debris.push({ mesh: dust, dust: true, life: 0, mat: dust.material });
  }
  if (giantObjs[giant]) giantObjs[giant].userData.swingT = performance.now() / 1000;
  shakeAmt = Math.max(shakeAmt, R3.camMode === 'fpv' ? 0.18 : 0.35);
};
// 게임 효과: smoke / shot / roar / tracker / barricadeBreak / barricadeHit / pickup / cloak / boost
function addFx(obj, life, upd) { if (mapGroup) mapGroup.add(obj); fxObjs.push({ obj, life, t: 0, upd }); }
R3.fx = function (list, opt) {
  if (!map) return;
  const tps = (opt && opt.tps) || 10, nowS = performance.now() / 1000;
  for (const e of list) {
    const cx = e.cell != null ? wx(e.cell % W) : 0, cz = e.cell != null ? wzc(e.cell) : 0, cyF = e.cell != null ? fy(e.cell) : e.from != null ? fy(e.from) : 0;
    if (e.t === 'smoke') {
      const dur = (e.turns || 6) / tps + 0.8, r = (e.radius || 3) * 0.75, grp = new THREE.Group(); grp.position.set(cx, cyF, cz);
      const puffs = [];
      for (let i = 0; i < 22; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: getSmokeTex(), color: 0xc8ccd6, transparent: true, depthWrite: false, opacity: 0 }));
        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
        sp.position.set(Math.cos(a) * d, 0.3 + Math.random() * 1.4, Math.sin(a) * d); const sc = 1.2 + Math.random() * 1.4; sp.scale.set(sc, sc, 1);
        sp.userData = { sc, vy: 0.1 + Math.random() * 0.25, sp: (Math.random() - 0.5) * 0.6 }; grp.add(sp); puffs.push(sp);
      }
      addFx(grp, dur, (t, dt) => { const fin = Math.min(1, t / 0.35), fout = Math.max(0, Math.min(1, (dur - t) / 0.8)); for (const p of puffs) { p.material.opacity = 0.75 * fin * fout; p.position.y += p.userData.vy * dt; const k = p.userData.sc * (1 + t * 0.25); p.scale.set(k, k, 1); p.material.rotation += p.userData.sp * dt; } });
      shakeAmt = Math.max(shakeAmt, 0.08);
    } else if (e.t === 'shot') {
      const fx = wx(e.from % W), fz = wzc(e.from), tx = wx(e.to % W), tz = wzc(e.to);
      const len = Math.hypot(tx - fx, tz - fz), tracer = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 6), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      tracer.rotation.z = Math.PI / 2; tracer.rotation.y = -Math.atan2(tz - fz, tx - fx); tracer.position.set((fx + tx) / 2, cyF + 0.75, (fz + tz) / 2);
      addFx(tracer, 0.25, (t) => { tracer.material.opacity = 1 - t / 0.25; });
      const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTex(), color: 0xffb030, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      flash.position.set(fx + (tx - fx) / Math.max(1, len) * 0.5, cyF + 0.8, fz + (tz - fz) / Math.max(1, len) * 0.5); flash.scale.set(1.6, 1.6, 1);
      addFx(flash, 0.18, (t) => { flash.material.opacity = 1 - t / 0.18; });
      const hit = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex(e.miss ? '💨' : '💥'), transparent: true, depthWrite: false })); hit.position.set(tx, cyF + 1.6, tz); hit.scale.set(1.1, 1.1, 1);
      addFx(hit, 0.6, (t) => { hit.material.opacity = 1 - t / 0.6; const k = 1.1 + t; hit.scale.set(k, k, 1); });
      R3.muzzleT = nowS; shakeAmt = Math.max(shakeAmt, R3.camMode === 'fpv' ? 0.12 : 0.15);
    } else if (['roar', 'tracker', 'pickup', 'cloak', 'boost', 'spawn', 'lever', 'gem', 'pedestal', 'chest', 'plate', 'pill', 'pillSpawn', 'eat', 'tailgrab', 'snakeUp', 'respawn', 'snakeStun', 'lunge', 'dinoBite', 'dinoRoar', 'weapon', 'slay', 'hatch', 'boulder', 'boulderBlock', 'boulderReset', 'dinoSniff', 'sealed', 'teleport', 'scout', 'scoutPop'].includes(e.t)) {
      if (e.t === 'scout' || e.t === 'scoutPop') { const ic = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex(e.t === 'scout' ? '👥' : '💨'), transparent: true, depthWrite: false })); ic.position.set(cx, cyF + 1.6, cz); addFx(ic, 1.3, (t) => { ic.position.y = cyF + 1.6 + t * 0.6; ic.material.opacity = Math.max(0, 1 - t / 1.3); }); }
      if (e.t === 'teleport') { for (const [c0, k0] of [[e.from, 0], [e.to, 1]]) { if (!onF(c0)) continue; const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: getGlowTex(), color: 0xb98cff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })); gl.position.set(wx(c0 % W), fy(c0) + 0.8, wzc(c0)); addFx(gl, 0.9, (t) => { const k = k0 ? 3.2 - t * 3 : 0.6 + t * 3; gl.scale.set(k, k * 1.6, 1); gl.material.opacity = Math.max(0, 1 - t / 0.9); }); const ic = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex('✨'), transparent: true, depthWrite: false })); ic.position.set(wx(c0 % W), fy(c0) + 1.7, wzc(c0)); addFx(ic, 1.2, (t) => { ic.position.y = fy(c0) + 1.7 + t * 0.5; ic.material.opacity = Math.max(0, 1 - t / 1.2); }); } }
      if (e.t === 'dinoRoar') { R3.dinoRoarT = nowS; shakeAmt = Math.max(shakeAmt, 0.3); }
      if (e.t === 'boulderBlock') { shakeAmt = Math.max(shakeAmt, 0.25); const ic = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex('🪨'), transparent: true, depthWrite: false })); ic.position.set(cx, cyF + 1.6, cz); addFx(ic, 2.0, (t) => { const k = 0.8 + Math.min(t, 0.4) * 2.5; ic.scale.set(k, k, 1); ic.material.opacity = t < 1.3 ? 1 : Math.max(0, 1 - (t - 1.3) / 0.7); }); }
      if (e.t === 'dinoSniff' || e.t === 'sealed') { const ic = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex(e.t === 'sealed' ? '🚫' : '👃'), transparent: true, depthWrite: false })); ic.position.set(cx + (e.t === 'sealed' ? 0 : 0.5), cyF + 2.4, cz + 0.5); addFx(ic, 1.8, (t) => { ic.position.y = cyF + 2.4 + t * 0.4; ic.scale.setScalar(1.1); ic.material.opacity = Math.max(0, 1 - t / 1.8); }); if (e.t === 'sealed') shakeAmt = Math.max(shakeAmt, 0.3); }
      if (e.t === 'boulder') shakeAmt = Math.max(shakeAmt, 0.05);
      if (e.t === 'dinoBite' || e.t === 'weapon' || e.t === 'slay') {
        shakeAmt = Math.max(shakeAmt, e.t === 'weapon' ? 0.1 : 0.35); if (e.t === 'dinoBite') R3.dinoRoarT = nowS;
        const ic = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex(e.t === 'dinoBite' ? '🦖' : e.t === 'weapon' ? '🔱' : '☠️'), transparent: true, depthWrite: false })); ic.position.set(cx, cyF + 1.6, cz);
        addFx(ic, 2.0, (t) => { const k = 0.8 + Math.min(t, 0.4) * 2.5; ic.scale.set(k, k, 1); ic.material.opacity = t < 1.3 ? 1 : Math.max(0, 1 - (t - 1.3) / 0.7); });
      }
      if (e.t === 'slay' && e.from != null) { // 번개: 도망자 → 거인 푸른 섬광 막대
        const fx0 = wx(e.from % W), fz0 = wzc(e.from), dx = cx - fx0, dz = cz - fz0, len = Math.hypot(dx, dz) || 0.1;
        const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, len), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
        bolt.position.set((cx + fx0) / 2, cyF + 0.9, (cz + fz0) / 2); bolt.rotation.y = Math.atan2(dx, dz);
        addFx(bolt, 0.5, (t) => { bolt.material.opacity = (1 - t / 0.5) * (0.6 + 0.4 * Math.sin(t * 80)); bolt.scale.set(1 + Math.sin(t * 60) * 0.5, 1, 1); });
      }
      const col = { roar: 0xff3b3b, tracker: 0x59e39a, pickup: 0xffe14a, cloak: 0x9fd0ff, boost: 0xff9a2a, spawn: 0xffffff, lever: 0x7dff7d, gem: 0x40e0ff, pedestal: 0x40e0ff, chest: 0xffd54a, plate: 0xffd54a, pill: 0xff5fd2, pillSpawn: 0xff9fe8, eat: 0x3fe060, tailgrab: 0xc89a5a, snakeUp: 0x8a6a40, respawn: 0xffffff, snakeStun: 0xffe14a, lunge: 0x7dff9a, dinoBite: 0xff4020, dinoRoar: 0xc8ff6a, weapon: 0x7fd8ff, slay: 0x9fe8ff, hatch: 0xc89a5a, boulder: 0xb0a898, boulderBlock: 0xff5040, boulderReset: 0xb0a898, dinoSniff: 0xc8ff6a, sealed: 0xff3030 }[e.t];
      const big = { boulderBlock: 4, roar: 9, tracker: 3, chest: 5, eat: 4, tailgrab: 3, plate: 1, dinoRoar: 10, dinoBite: 4, weapon: 6, slay: 3 }[e.t] || 1.6, dur = ['roar', 'chest', 'eat', 'dinoRoar', 'dinoBite', 'weapon'].includes(e.t) ? 1.4 : 0.8;
      if (e.t === 'eat') { shakeAmt = Math.max(shakeAmt, 0.3); const bite = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex('🐍'), transparent: true, depthWrite: false })); bite.position.set(cx, cyF + 1.4, cz); addFx(bite, 2.2, (t) => { const k = 0.9 + Math.min(t, 0.5) * 2.4 + Math.sin(t * 9) * 0.05; bite.scale.set(k, k, 1); bite.material.opacity = t < 1.4 ? 1 : Math.max(0, 1 - (t - 1.4) / 0.8); }); }
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.55, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(cx, cyF + 0.08, cz);
      addFx(ring, dur, (t) => { const k = 1 + (t / dur) * big; ring.scale.set(k, k, k); ring.material.opacity = 0.9 * (1 - t / dur); });
      if (e.t === 'roar') { shakeAmt = Math.max(shakeAmt, 0.25); if (giantObjs[e.giant]) giantObjs[e.giant].userData.roarT = nowS; }
    } else if (e.t === 'vault') { // 벽넘기: 벽 위로 초록 호 + 🤸
      const ox = wx(e.over % W), oz = wzc(e.over), tx = wx(e.to % W), tz = wzc(e.to);
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(cx, cyF + 0.3, cz), new THREE.Vector3(ox, cyF + 3.2, oz), new THREE.Vector3(tx, cyF + 0.3, tz));
      const arc = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.06, 6, false), new THREE.MeshBasicMaterial({ color: 0x7dffc8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      addFx(arc, 1.2, (t) => { arc.material.opacity = 0.9 * (1 - t / 1.2); });
      const ic = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex('🤸'), transparent: true, depthWrite: false })); ic.position.set(ox, cyF + 2.6, oz); ic.scale.set(1.3, 1.3, 1);
      addFx(ic, 1.3, (t) => { ic.position.y = cyF + 2.6 + t * 0.8; ic.material.opacity = Math.max(0, 1 - t / 1.3); });
      for (const [px, pz] of [[cx, cz], [tx, tz]]) { const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.55, 40), new THREE.MeshBasicMaterial({ color: 0x7dffc8, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, fog: false })); ring.rotation.x = -Math.PI / 2; ring.position.set(px, cyF + 0.08, pz); addFx(ring, 0.8, (t) => { const k = 1 + t * 2.5; ring.scale.set(k, k, k); ring.material.opacity = 0.9 * (1 - t / 0.8); }); }
      shakeAmt = Math.max(shakeAmt, 0.06);
    } else if (e.t === 'barricadeBreak') {
      const mat = new THREE.MeshStandardMaterial({ color: 0x9b6a3c, roughness: 0.8, transparent: true, opacity: 1 });
      for (let k = 0; k < 12; k++) {
        const m = new THREE.Mesh(debrisGeo, mat); m.scale.set(2.2, 0.5, 0.6); m.position.set(cx + (Math.random() - 0.5) * 0.6, cyF + Math.random() * 0.9, cz + (Math.random() - 0.5) * 0.6); scene.add(m);
        debris.push({ floorY: cyF, mesh: m, v: new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4), r: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8), life: 0, mat });
      }
      if (giantObjs[e.giant]) giantObjs[e.giant].userData.swingT = nowS;
      shakeAmt = Math.max(shakeAmt, 0.15);
    } else if (e.t === 'barricadeHit') {
      const o = barObjs.get(e.cell); if (o) o.userData.hitT = nowS;
      if (giantObjs[e.giant]) giantObjs[e.giant].userData.punchT = nowS;
    }
  }
};
function updateFx(dt) {
  for (let i = fxObjs.length - 1; i >= 0; i--) {
    const f = fxObjs[i]; if (f.keep) continue;
    f.t += dt; if (f.upd) f.upd(f.t, dt);
    if (f.t >= f.life) { disposeGroup(f.obj); fxObjs.splice(i, 1); }
  }
}
function updateDebris(dt) {
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i]; d.life += dt;
    if (d.dust) { const s = 1 + d.life * 5; d.mesh.scale.set(s, s, s); d.mat.opacity = Math.max(0, 0.6 - d.life * 0.5); }
    else {
      d.v.y -= 9.8 * dt; d.mesh.position.addScaledVector(d.v, dt);
      const fl0 = (d.floorY || 0) + 0.08; if (d.mesh.position.y < fl0) { d.mesh.position.y = fl0; d.v.multiplyScalar(0.45); d.v.y = Math.abs(d.v.y) * 0.4; }
      d.mesh.rotation.x += d.r.x * dt; d.mesh.rotation.y += d.r.y * dt;
      if (d.life > 1.6) d.mat.opacity = Math.max(0, 1 - (d.life - 1.6) / 0.8);
    }
    if (d.life > 2.4) { scene.remove(d.mesh); if (d.dust) { d.mesh.geometry.dispose(); d.mat.dispose(); } debris.splice(i, 1); }
  }
}
// 1인칭 ↔ 3인칭 전환 시 장면 분위기(벽 높이·안개·조명·크기) 바꾸기
function applyModeVisuals() {
  const f = R3.camMode === 'fpv';
  for (const wm of wallsMeshes) { wm.scale.y = f ? FPV.WALL_SCALE : 1; wm.updateMatrixWorld(); }
  lastFocus = -1; // 층 보이기 다시 계산
  applyLevelLight();
  beacons.forEach((b) => (b.visible = f)); eyeGlows.forEach((e) => (e.visible = f));
  for (const o of itemObjs.values()) o.children.forEach((c) => { if (beacons.includes(c)) c.visible = f; });
  for (const o of [...stairObjs, ...gemObjs.filter(Boolean)]) o.children.forEach((c) => { if (beacons.includes(c)) c.visible = f; });
  if (runnerObj) runnerObj.visible = !f;
  // 1인칭에서는 벽 너머로 비치는 번호표를 숨김 (문 위치는 빛기둥으로 표시)
  giantObjs.forEach((o) => { if (o.userData.label) o.userData.label.visible = !f; });
  doorObjs.forEach((d) => { d.userData.label.visible = !f; });
  controls.enabled = !f && R3.camMode !== 'tps';
  camera.near = f ? 0.05 : 0.1;
  if (!f) { camera.fov = 48; camera.rotation.order = 'XYZ'; camera.up.set(0, 1, 0); }
  camera.updateProjectionMatrix();
}
function bindFpvDrag(el) {
  let px = 0, py = 0;
  el.addEventListener('pointerdown', (e) => { if (R3.camMode !== 'fpv') return; fpv.dragging = true; px = e.clientX; py = e.clientY; try { el.setPointerCapture(e.pointerId); } catch (_) {} });
  el.addEventListener('pointermove', (e) => {
    if (!fpv.dragging || R3.camMode !== 'fpv') return;
    fpv.lookYaw = Math.max(-2.6, Math.min(2.6, fpv.lookYaw - (e.clientX - px) * 0.006));
    fpv.lookPitch = Math.max(-0.7, Math.min(0.7, fpv.lookPitch - (e.clientY - py) * 0.005)); px = e.clientX; py = e.clientY;
  });
  const up = () => { if (fpv.dragging) { fpv.dragging = false; fpv.releasedAt = performance.now(); } };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
}
R3.setCamMode = function (mode) {
  const was = R3.camMode;
  R3.camMode = mode;
  if (mode === 'fpv' || was === 'fpv') { fpv.init = false; fpv.lookYaw = fpv.lookPitch = 0; applyModeVisuals(); }
  if (mode === 'tps' || was === 'tps') {
    tps.init = false;
    if (controls) { controls.autoRotate = false; controls.enabled = mode !== 'tps' && mode !== 'fpv'; }
    if (mode === 'tps') { camera.fov = TPS.FOV; camera.rotation.order = 'XYZ'; camera.up.set(0, 1, 0); camera.updateProjectionMatrix(); return; }
    if (mode !== 'fpv') { camera.fov = 48; camera.updateProjectionMatrix(); }
  }
  if (mode === 'fpv') return;
  if (mode === 'orbit') R3.resetCamera();
  else if (runnerObj) { const p = runnerObj.position; controls.target.copy(p); camera.position.set(p.x, p.y + 11, p.z + 5.5); controls.update(); }
};

function angLerp(a, b, t) { let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; }

// state: {runner:{x,y,dx,dy,sprint,hasKey}, giants:[{x,y,fx,fy,dash,ban}], keysLeft, open, vision:[tiles], visionVer, showVision, result, catcher, time}
// 보이는 층: 보고 있는 층만 실제로, 전체 시점에서는 위층을 유리처럼 흐리게(유령 벽), 1인칭에서는 다른 층을 완전히 숨김
function applyFloorVis() {
  const orbit = R3.camMode === 'orbit';
  for (let f = 0; f < NF; f++) {
    const on = f === focusF;
    wallsMeshes[f].visible = on; tileMeshes[f].visible = on; floorPlanes[f].visible = on || (f < focusF && false);
    ghostWalls[f].visible = !on && orbit && LZ(f) > LZ(focusF) && f !== B1;
  }
  doorZoneMesh.visible = focusF === 0;
  for (const d of doorObjs) d.visible = cellF(d.userData.cell) === focusF;
  const ug = B1 >= 0 && focusF === B1;
  if (torchPts) { torchPts.visible = ug; torchPts.userData.stick.visible = ug; }
  applyLevelLight();
}
// v21: 지하는 어둡게 (횃불 + 도망자 등불), 지상은 원래 조명
function applyLevelLight() {
  const f = R3.camMode === 'fpv', tp = R3.camMode === 'tps', ug = B1 >= 0 && focusF === B1;
  if (!ug) {
    scene.fog.near = f ? FPV.FOG_NEAR : 30; scene.fog.far = f ? FPV.FOG_FAR : 70;
    scene.fog.color.setHex(f ? FPV.BG : 0x0b0d1a); scene.background.setHex(f ? FPV.BG : 0x0b0d1a);
    hemiLight.intensity = f ? 0.55 : 1.25; dirLight.intensity = f ? 1.1 : 2.6; lantern.intensity = f ? 2.6 : 0;
    for (const l of torchLights) l.intensity = 0;
    return;
  }
  const bg = 0x030202; scene.fog.color.setHex(bg); scene.background.setHex(bg);
  if (f) { scene.fog.near = 1; scene.fog.far = 8; hemiLight.intensity = 0.16; dirLight.intensity = 0.1; lantern.intensity = 3.0; }
  else if (tp) { scene.fog.near = 8; scene.fog.far = 28; hemiLight.intensity = 0.42; dirLight.intensity = 0.32; lantern.intensity = 2.8; }
  else { scene.fog.near = 45; scene.fog.far = 120; hemiLight.intensity = 0.5; dirLight.intensity = 0.55; lantern.intensity = 1.6; }
}
const onF = (c) => cellF(c) === focusF;
R3.render = function (s) {
  if (!R3.ok || !map) return;
  const now = s.time / 1000;
  // 층 전환
  const nf = Math.max(0, Math.min(NF - 1, s.viewFloor | 0));
  if (nf !== focusF || lastFocus < 0 || lastCamForVis !== R3.camMode) {
    const dy = (LZ(nf) - LZ(focusF)) * FLOOR_Y; focusF = nf;
    if (R3.camMode !== 'fpv' && dy && lastFocus >= 0) { controls.target.y += dy; camera.position.y += dy; }
    lastFocus = nf; lastCamForVis = R3.camMode; applyFloorVis(); lastFogVer = -1; lastVisionVer = -1;
  }
  // 위층 유리 벽: 카메라가 위층 가까이 내려오면(1층 확대) 시야를 가리므로 숨김
  if (R3.camMode === 'orbit') for (let f = 0; f < NF; f++) { if (f === focusF || f === B1 || LZ(f) <= LZ(focusF)) continue; const show = camera.position.y - LZ(f) * FLOOR_Y > 9; if (ghostWalls[f].visible !== show) ghostWalls[f].visible = show; }
  // 도망자
  if (runnerObj) {
    const caught = s.result === 'giant', escaped = s.result === 'runner';
    runnerObj.visible = !caught && R3.camMode !== 'fpv'; // 1인칭에서는 자기 몸을 숨김
    runnerObj.position.set(wx(s.runner.x), (s.runner.f || 0) * FLOOR_Y + (escaped ? Math.min(1.5, (s.endT || 0) * 1.5) : 0) + (s.runner.jump || 0) * 1.6, wz(s.runner.y)); // 벽넘기 점프
    if (LV(s.runner) !== focusF && R3.camMode !== 'fpv') runnerObj.visible = false;
    if (B1 >= 0 && focusF === B1 && R3.camMode !== 'fpv') lantern.position.set(runnerObj.position.x, runnerObj.position.y + 1.7, runnerObj.position.z);
    if (runnerObj.userData.gem) { runnerObj.userData.gem.visible = !!s.runner.gem; runnerObj.userData.gem.rotation.y = now * 3; }
    if (s.runner.dx || s.runner.dy) runnerObj.rotation.y = angLerp(runnerObj.rotation.y, Math.atan2(s.runner.dx, s.runner.dy), 0.25);
    const u = runnerObj.userData; u.body.position.y = 0.38 + Math.abs(Math.sin(now * 12)) * 0.05;
    u.keyIcon.visible = s.runner.hasKey; u.keyIcon.rotation.y = now * 3;
    u.glow.material.color.setHex(s.runner.boost ? 0xff9a2a : s.runner.sprint ? 0xffe14a : 0x3fb6ff);
    // 투명망토: 반투명 + 푸른 일렁임
    const cl = !!s.runner.cloak;
    if (u.cloaked !== cl) { u.cloaked = cl; runnerObj.traverse((o) => { if (o.material && o.material !== u.glow.material) { o.material.transparent = cl || o.material.userData.wasT; o.material.opacity = cl ? 0.28 : 1; o.material.needsUpdate = true; } }); }
    if (cl) u.body.material.opacity = 0.2 + 0.12 * Math.sin(now * 8);
  }
  // 거인
  for (let k = s.giants.length; k < giantObjs.length; k++) giantObjs[k].visible = false; // 아직 등장하지 않은 거인(최대 10명분 준비)
  s.giants.forEach((gs, k) => {
    if (gs.out && gs.home && mapGroup) { const rm = respawnMark(k); if (rm.parent !== mapGroup) mapGroup.add(rm); drawRespawn(k, gs.outSec); rm.position.set(wx(gs.home.x), gs.home.f * FLOOR_Y, wz(gs.home.y)); rm.visible = LV(gs.home) === focusF && !gs.dead; rm.userData.ring.scale.setScalar(1 + 0.15 * Math.sin(now * 5)); }
    else if (respawnMarks[k]) respawnMarks[k].visible = false;
    const o = giantObjs[k]; if (!o) return;
    o.position.set(wx(gs.x), (gs.f || 0) * FLOOR_Y, wz(gs.y));
    o.visible = !gs.out && LV(gs) === focusF;
    o.rotation.y = angLerp(o.rotation.y, Math.atan2(gs.fx, gs.fy), 0.2);
    const sw = Math.sin(now * (gs.dash ? 16 : 7)) * 0.35;
    o.userData['arm-1'].rotation.x = sw; o.userData['arm1'].rotation.x = -sw;
    o.userData.fist.visible = now - o.userData.swingT < 0.6;
    const st = now - o.userData.swingT; if (st >= 0 && st < 0.6) { o.userData['arm1'].rotation.x = -2.6 + Math.min(1, st / 0.25) * 3.4; o.userData.fist.scale.setScalar(1 + Math.min(1, st / 0.2) * 0.8); } // 주먹으로 내려찍기
    o.userData['leg-1'].rotation.x = -sw * 0.6; o.userData['leg1'].rotation.x = sw * 0.6;
    o.userData.ring.material.opacity = gs.dash ? 0.9 : 0.45;
    // 기절: 별이 머리 위를 빙글빙글, 몸이 비틀거림, 팔이 축 늘어짐
    const stunned = !!gs.stun, u = o.userData;
    u.stars.visible = stunned;
    if (stunned) {
      u.stars.children.forEach((st, i) => { const a = now * 4 + (i * Math.PI) / 2; st.position.set(Math.cos(a) * 0.42, Math.sin(now * 6 + i) * 0.06, Math.sin(a) * 0.42); });
      o.rotation.z = Math.sin(now * 3) * 0.12; u['arm-1'].rotation.x = 0.1; u['arm1'].rotation.x = 0.1; u['leg-1'].rotation.x = 0; u['leg1'].rotation.x = 0;
    } else o.rotation.z = 0;
    const rt = now - (u.roarT || -9); if (rt < 0.8) { u.body.scale.set(1 + 0.15 * Math.sin(rt * 20), 1, 1 + 0.15 * Math.sin(rt * 20)); } else u.body.scale.set(1, 1, 1);
    const pt = now - (u.punchT || -9); if (pt < 0.3 && !stunned) u['arm1'].rotation.x = -1.6 + pt * 5;
    // 상태 아이콘: 추적기 🐾 / 연막 🌫 / 포효 아이템 🔊
    const icon = gs.track ? '🐾' : gs.blind ? '🌫️' : '';
    u.status.visible = !!icon && !stunned;
    if (icon && u.statusIcon !== icon) { u.statusIcon = icon; u.status.material.map = emojiTex(icon, gs.track ? '#59e39a' : '#aab'); u.status.material.needsUpdate = true; }
    eyeGlows[k * 2] && (eyeGlows[k * 2].material.opacity = stunned || gs.blind ? 0.15 : 1); eyeGlows[k * 2 + 1] && (eyeGlows[k * 2 + 1].material.opacity = stunned || gs.blind ? 0.15 : 1);
    o.scale.setScalar((R3.camMode === 'fpv' ? FPV.GIANT_SCALE : 1) * (s.result === 'giant' && s.catcher === k ? 1.15 + Math.sin(now * 10) * 0.05 : 1));
    const c = coneMeshes[k];
    c.visible = s.showVision && o.visible; c.position.x = o.position.x; c.position.y = o.position.y + 0.03; c.position.z = o.position.z; c.rotation.y = o.rotation.y;
    c.scale.setScalar(s.visionRadius || 5);
  });
  // 시야 타일 (벽 가림 반영)
  if (s.showVision && s.visionVer !== lastVisionVer) {
    lastVisionVer = s.visionVer; let n = 0;
    for (const i of s.vision) { if (!onF(i)) continue; tmpM.makeTranslation(wx(i % W), 0.02 + fy(i), wzc(i)); visionMesh.setMatrixAt(n++, tmpM); }
    visionMesh.count = n; visionMesh.instanceMatrix.needsUpdate = true;
  }
  visionMesh.visible = s.showVision;
  doorZoneMesh.material.opacity = s.anyBan ? 0.16 + 0.08 * Math.sin(now * 6) : 0.07;
  // 아이템 (도망자용=파란 테, 거인용=빨간 테)
  const its = s.items || [], ikeys = new Set();
  for (const it of its) {
    const key = it.cell + ':' + it.type; ikeys.add(key);
    let o = itemObjs.get(key);
    if (!o) { o = makeItem(it.type, it.side); setAt(o, it.cell, 0); mapGroup.add(o); itemObjs.set(key, o); }
    o.visible = onF(it.cell);
    o.userData.sp.position.y = 0.5 + Math.sin(now * 3 + it.cell) * 0.08;
    const fpvS = R3.camMode === 'fpv' ? 1.25 : 1; o.userData.sp.scale.set(0.62 * fpvS, 0.62 * fpvS, 1);
  }
  for (const [key, o] of itemObjs) if (!ikeys.has(key)) { disposeGroup(o); itemObjs.delete(key); }
  // 바리케이드
  const bs = s.barricades || [], bkeys = new Set();
  for (const b of bs) {
    bkeys.add(b.cell); let o = barObjs.get(b.cell);
    if (!o) { o = makeBarricade(b.by); setAt(o, b.cell, 0); o.userData.born = now; mapGroup.add(o); barObjs.set(b.cell, o); }
    o.visible = onF(b.cell);
    const grow = Math.min(1, (now - o.userData.born) / 0.25), ht = now - o.userData.hitT;
    o.userData.inner.scale.set(1, grow * (R3.camMode === 'fpv' ? 2.4 : 1), 1);
    o.userData.inner.rotation.z = ht < 0.3 ? Math.sin(ht * 50) * 0.08 : 0;
    o.userData.inner.rotation.y = (1 - (b.hp || 3) / 3) * 0.25;
    o.userData.sign.visible = R3.camMode !== 'fpv';
  }
  for (const [c, o] of barObjs) if (!bkeys.has(c)) { disposeGroup(o); barObjs.delete(c); }
  // 전장의 안개
  if (fogMesh) {
    fogMesh.visible = !!s.fog && R3.camMode !== 'fpv';
    if (fogMesh.visible && s.seen && s.seenVer !== lastFogVer) {
      lastFogVer = s.seenVer; let n = 0;
      const FL = map.levels ? map.levels[focusF] : { row0: focusF * FH, h: FH };
      for (let i = FL.row0 * W; i < (FL.row0 + FL.h) * W; i++) if (!s.seen[i]) { tmpM.makeTranslation(wx(i % W), fy(i), wzc(i)); fogMesh.setMatrixAt(n++, tmpM); }
      fogMesh.count = n; fogMesh.instanceMatrix.needsUpdate = true;
    }
  }
  // 파편 · 효과
  const dtR = Math.min(0.1, Math.max(0, now - (lastNow || now))); lastNow = now;
  if (debris.length) updateDebris(dtR);
  if (fxObjs.length) updateFx(dtR);
  // 열쇠
  const mis = s.missions || [];
  for (const [kk, o] of keyObjs) {
    const M = mis.find((x) => x.key === kk), open = !M || M.done;
    o.visible = s.keysLeft.includes(kk) && onF(kk) && open; o.rotation.y = now * 2 + kk; o.position.y = fy(kk) + 0.95 + Math.sin(now * 3 + kk) * 0.07;
    const ch = chestObjs.get(kk);
    if (ch) {
      const u = ch.userData; ch.visible = onF(kk);
      u.open += ((open ? 1 : 0) - u.open) * 0.08; u.lidPivot.rotation.x = -u.open * 1.9;
      u.lock.visible = !open; u.glow.material.color.setHex(open ? 0xffd54a : 0xff5050); u.glow.material.opacity = open ? 0.35 + 0.15 * Math.sin(now * 4) : 0.18 + 0.08 * Math.sin(now * 2);
      if (!open) u.lockMat.emissiveIntensity = 0.6 + 0.4 * Math.sin(now * 3);
    }
  }
  // 미션 물건
  mis.forEach((M, mi) => {
    if (M.type === 'switch') M.levers.forEach((lv, li) => { const o = leverObjs.get(mi + ':' + li); if (!o) return; o.visible = onF(lv.cell); const u = o.userData; u.pivot.rotation.z += ((lv.on ? -0.6 : 0.6) - u.pivot.rotation.z) * 0.15; if (u.on !== lv.on) { u.on = lv.on; u.knobMat.color.setHex(lv.on ? 0x59e39a : 0xff4a4a); u.knobMat.emissive.setHex(lv.on ? 0x108030 : 0x801010); u.label.material.map = emojiTex(lv.on ? '✅' : '🕹️', lv.on ? '#59e39a' : '#ffd54a'); u.label.material.needsUpdate = true; } });
    if (M.type === 'carry') {
      const g = gemObjs[mi], p = pedObjs[mi];
      if (g) { g.visible = !M.gemTaken && onF(M.gem); g.userData.gem.rotation.y = now * 2; g.userData.gem.position.y = 0.5 + Math.sin(now * 3) * 0.08; }
      if (p) { p.visible = onF(M.pedestal); p.userData.gem.visible = M.done; p.userData.gem.rotation.y = now * 2; p.userData.topMat.emissiveIntensity = M.done ? 2 : (s.runner.gem ? 1 + Math.sin(now * 6) : 0.6); p.userData.topMat.emissive.setHex(M.done ? 0x40e0ff : 0x0a2a3a); }
    }
    if (M.type === 'plate') {
      const o = plateObjs[mi]; if (!o) return; const u = o.userData; o.visible = onF(M.plate);
      const fr = M.done ? 1 : M.cnt / M.need, pressed = s.runner.onPlate === mi;
      u.plate.position.y = pressed ? 0.012 : 0.03;
      if (u.lastN !== M.cnt) { u.lastN = M.cnt; u.ring.geometry.dispose(); u.ring.geometry = new THREE.RingGeometry(0.32, 0.4, 32, 1, 0, Math.max(0.001, fr * Math.PI * 2)); }
      u.mat.emissive.setHex(M.done ? 0x20a040 : pressed ? 0xa06000 : 0x402000); u.mat.emissiveIntensity = pressed ? 1 + 0.6 * Math.sin(now * 12) : 0.6;
      u.ringMat.color.setHex(M.done ? 0x59e39a : 0xffd54a);
    }
  });
  // 계단 표시
  for (const o of stairObjs) { o.visible = o.userData.cells.some((c) => onF(c)) && (o.userData.steps ? cellF(o.userData.cells[0]) === focusF : true); if (o.userData.label) o.userData.label.position.y = 1.3 + Math.sin(now * 3) * 0.1; }
  // v21 공룡 · 무기 · 횃불
  updateUnderground(s, now);
  scoutObjs.forEach((o, i) => { const c = (s.scouts || [])[i]; o.visible = !!c && c.f === focusF; if (!o.visible) return; const px = wx(c.x), pz = wz(c.y); const dx = px - o.position.x, dz = pz - o.position.z; if (Math.hypot(dx, dz) > 0.002) o.rotation.y = Math.atan2(dx, dz); o.position.set(px, c.f * FLOOR_Y + Math.abs(Math.sin(now * 14)) * 0.05, pz); });
  updateBoulders(s, now, dtR);
  // 알약
  const ps = s.pills || [], pset = new Set(ps);
  for (const c of ps) { let o = pillObjs.get(c); if (!o) { o = makePill(); setAt(o, c, 0); mapGroup.add(o); pillObjs.set(c, o); } o.visible = onF(c); o.userData.cap.rotation.y = now * 2 + c; o.userData.cap.position.y = 0.32 + Math.sin(now * 4 + c) * 0.05; }
  for (const [c, o] of pillObjs) if (!pset.has(c)) { disposeGroup(o); pillObjs.delete(c); }
  // 뷱
  snakeObjs.forEach((o, i) => { if (!(s.snakes || [])[i]) o.visible = false; });
  (s.snakes || []).forEach((sn, i) => {
    // 뷱은 계단으로 두 층을 오가므로 마디마다 자기 층에 그림 (보고 있는 층의 마디만 보임)
    const o = snakeObjs[i]; if (!o) return; const u = o.userData; o.visible = true;
    const fpvS = R3.camMode === 'fpv' ? 1.35 : 1, sf = (p) => (p.f != null ? p.f : sn.f);
    if (sn.hidden) { u.segs.forEach((m) => (m.visible = false)); u.head.visible = false; u.mound.visible = Math.round(sf(sn.segs[0])) === focusF; u.mound.position.set(wx(sn.segs[0].x), sf(sn.segs[0]) * FLOOR_Y, wz(sn.segs[0].y)); return; }
    u.mound.visible = false;
    const n = sn.segs.length;
    u.segs.forEach((m, j) => {
      if (j === 0 || j >= n) { m.visible = false; return; }
      const p = sn.segs[j], pf = sf(p); m.visible = Math.round(pf) === focusF; const taper = 1 - (j / Math.max(n, 6)) * 0.45;
      m.position.set(wx(p.x), pf * FLOOR_Y + 0.24 * taper * fpvS + Math.sin(now * 8 - j * 0.9) * 0.03, wz(p.y)); m.scale.setScalar(taper * fpvS);
    });
    const h = sn.segs[0], nx = n > 1 ? sn.segs[1] : h, hf = sf(h);
    u.head.visible = Math.round(hf) === focusF;
    u.head.position.set(wx(h.x), hf * FLOOR_Y + 0.3 * fpvS, wz(h.y)); u.head.scale.setScalar(fpvS);
    const dx = h.x - nx.x, dz = h.y - nx.y; if (Math.abs(dx) + Math.abs(dz) > 0.01) u.head.rotation.y = angLerp(u.head.rotation.y, Math.atan2(dx, dz), 0.3);
    u.tongue.visible = Math.sin(now * 9) > 0.2; u.label.visible = R3.camMode !== 'fpv' && u.head.visible;
  });
  // 문
  doorObjs.forEach((d) => {
    const u = d.userData;
    if (s.open) { u.barrier.scale.y = Math.max(0.02, u.barrier.scale.y - 0.05); u.barrier.position.y = 0.72 * u.barrier.scale.y; u.glow.material.opacity = 0.35 + 0.2 * Math.sin(now * 4); }
    else { u.barrier.scale.y = 1; u.barrier.position.y = 0.72; u.glow.material.opacity = 0; u.barMat.emissiveIntensity = 1 + 0.3 * Math.sin(now * 3); }
    if (u.beam.visible) { u.beam.material.color.setHex(s.open ? 0x59e39a : 0xff9a2a); u.beam.userData.base = (s.open ? 0.45 : 0.3) + 0.08 * Math.sin(now * 3); }
  });
  // 카메라
  if (muzzle && R3.camMode !== 'fpv') muzzle.visible = false;
  // 1인칭: 도망자가 밟고 선 칸의 머리 위 표시(⏳·⬆ 등)가 화면을 가리지 않게 숨김
  { const fp = R3.camMode === 'fpv', tp = R3.camMode === 'tps', lim = tp ? 1.6 : 0.75; for (const o of [...stairObjs, ...leverObjs.values(), ...plateObjs, ...pedObjs, ...chestObjs.values()]) { const L = o && o.userData && o.userData.label; if (!L) continue; L.visible = !(fp || tp) || Math.hypot(o.position.x - camera.position.x, o.position.z - camera.position.z) > lim; } }
  if (R3.camMode === 'fpv' && runnerObj) {
    updateFpv(s, now);
    if (muzzle) {
      const mt = now - (R3.muzzleT || -9); muzzle.visible = mt < 0.16;
      if (muzzle.visible) { camera.getWorldDirection(tmpV); muzzle.position.copy(camera.position).addScaledVector(tmpV, 0.6); muzzle.position.y -= 0.12; const k = 0.5 + mt * 3; muzzle.scale.set(k, k, 1); muzzle.material.opacity = 1 - mt / 0.16; }
    }
    if (shakeAmt > 0.002) { camera.position.x += (Math.random() - 0.5) * shakeAmt; camera.position.y += (Math.random() - 0.5) * shakeAmt * 0.6; shakeAmt *= Math.exp(-dtR * 5); }
    renderer.render(scene, camera); return;
  }
  if (R3.camMode === 'tps' && runnerObj) {
    updateTps(s, now);
    if (shakeAmt > 0.002) { camera.position.x += (Math.random() - 0.5) * shakeAmt; camera.position.y += (Math.random() - 0.5) * shakeAmt * 0.6; shakeAmt *= Math.exp(-dtR * 5); }
    renderer.render(scene, camera); return;
  }
  if (R3.camMode === 'follow' && runnerObj) {
    const p = runnerObj.position; tmpV.copy(p).sub(controls.target).multiplyScalar(0.12);
    controls.target.add(tmpV); camera.position.add(tmpV);
  }
  controls.update();
  if (shakeAmt > 0.002) {
    const ox = (Math.random() - 0.5) * shakeAmt, oy = (Math.random() - 0.5) * shakeAmt;
    camera.position.x += ox; camera.position.y += oy; renderer.render(scene, camera); camera.position.x -= ox; camera.position.y -= oy;
    shakeAmt *= Math.exp(-dtR * 5);
  } else renderer.render(scene, camera);
};
// 도망자가 향하는 방향(yaw) 목표: 움직이면 이동 방향, 멈춰 있고 앞이 벽이면 가장 길게 트인 방향 (1인칭·3인칭 공용)
function cellAtL(x, y, lv) { const L = map && map.levels ? map.levels[lv] : { row0: lv * FH, h: FH, zOff: 0 }; if (!L) return -1; const ly = y + L.zOff; if (x < 0 || ly < 0 || x >= W || ly >= L.h) return -1; return (L.row0 + ly) * W + x; }
function isWallAt(x, y, lv) { const c = cellAtL(x, y, lv); return c < 0 || (wallIndex && wallIndex[c] >= 0) || barObjs.has(c); }
// v21: 공룡 위치·걸음·턱, 무기 반짝임, 횃불 깜빡임 + 가까운 횃불에 실제 빛
function updateUnderground(s, now) {
  const ug = B1 >= 0 && focusF === B1;
  dinoObjs.forEach((dinoObj, i) => {
    const d = (s.dinos || [])[i], u = dinoObj.userData;
    dinoObj.visible = !!d && ug;
    if (d && dinoObj.visible) {
      const fpS = R3.camMode === 'fpv' ? 1.25 : 1;
      dinoObj.position.set(wx(d.x + 0.5), LZ(B1) * FLOOR_Y, wz(d.y + 0.5)); dinoObj.scale.setScalar(fpS);
      if (d.fx || d.fy) dinoObj.rotation.y = angLerp(dinoObj.rotation.y, Math.atan2(d.fx, d.fy), d.chase ? 0.12 : 0.05); // 느리게 몸을 돌림
      const moving = !!d.moving, sp = d.chase ? 10 : d.sniff ? 3.5 : 3; u.walk += moving ? 0.016 * sp : 0;
      u.legs[0].rotation.x = Math.sin(u.walk) * 0.55; u.legs[1].rotation.x = -Math.sin(u.walk) * 0.55;
      u.body.position.y = Math.abs(Math.sin(u.walk)) * 0.06; u.body.rotation.z = Math.sin(u.walk) * 0.03;
      u.tail.rotation.z = Math.sin(now * (d.sniff ? 4 : 2.2)) * 0.25;
      const roar = now - (R3.dinoRoarT || -9) < 1.4 || s.result === 'giant' && s.catcher === -4;
      u.jaw.rotation.x = roar ? 0.55 + Math.sin(now * 18) * 0.08 : d.chase ? 0.25 + Math.sin(now * 6) * 0.15 : 0.06 + Math.sin(now * 1.5) * 0.04;
      // 킁킁: 냄새 추적 중엔 머리를 땅으로 숙이고 빠르게 까딱
      u.head.rotation.x = roar ? -0.35 : d.sniff ? 0.55 + Math.sin(now * 14 + i) * 0.12 : Math.sin(now * 1.3 + i) * 0.08;
      u.label.visible = R3.camMode !== 'fpv';
    }
  });
  if (weaponObj) {
    const w = s.weapon; weaponObj.visible = !!w && !w.taken && ug && onF(w.cell) && (!s.fog || (s.seen && s.seen[w.cell]));
    if (weaponObj.visible) { setAt(weaponObj, w.cell, 0); weaponObj.userData.inner.rotation.y = now * 1.6; weaponObj.userData.inner.position.y = 0.75 + Math.sin(now * 2.5) * 0.08; weaponObj.userData.glow.material.opacity = 0.6 + 0.3 * Math.sin(now * 5); }
  }
  if (torchPts && ug) {
    torchPts.material.size = (R3.camMode === 'fpv' ? 0.7 : 0.95) * (0.9 + 0.1 * Math.sin(now * 13));
    if (torchLights.length && runnerObj) {
      const p = runnerObj.position, near = torchList.slice().sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
      torchLights.forEach((l, k) => { const t = near[k]; if (!t) { l.intensity = 0; return; } l.position.set(t.x, t.y, t.z); l.intensity = 2.2 + 0.5 * Math.sin(now * 11 + k * 2) + 0.3 * Math.sin(now * 23 + k); });
    }
  } else for (const l of torchLights) l.intensity = 0;
}
function runYawTarget(R, cur) {
  let target = cur;
  if (R.dx || R.dy) return Math.atan2(-R.dx, -R.dy);
  const off = LV(R), cx = Math.round(R.x), cy = Math.round(R.y), wall = (x, y) => isWallAt(x, y, off);
  const fx = Math.round(-Math.sin(cur)), fy = Math.round(-Math.cos(cur));
  if (wall(cx + fx, cy + fy)) {
    let best = -1, bd = null;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { let n = 0; while (n < 12 && !wall(cx + dx * (n + 1), cy + dy * (n + 1))) n++; if (n > best) { best = n; bd = [dx, dy]; } }
    if (bd && best > 0) target = Math.atan2(-bd[0], -bd[1]);
  }
  return target;
}
// 3인칭 카메라: 도망자 뒤·조금 위에서 이동 방향을 바라봄. 뒤쪽 벽이 몸을 가리면 카메라를 앞으로 당기고 조금 더 위에서 내려다봄
function updateTps(s, now) {
  const p = runnerObj.position, R = s.runner, dt = Math.min(0.1, Math.max(0.001, now - (tps.lastT || now))); tps.lastT = now;
  let target = runYawTarget(R, tps.yaw), focus = p;
  const catcherObj = s.result === 'giant' && giantObjs[s.catcher] ? giantObjs[s.catcher] : null;
  if (catcherObj) { const dx = catcherObj.position.x - p.x, dz = catcherObj.position.z - p.z; if (Math.hypot(dx, dz) > 0.05) target = Math.atan2(-dx, -dz); focus = catcherObj.position; }
  if (!tps.init) { tps.yaw = target; tps.dist = TPS.DIST; }
  tps.yaw = angLerp(tps.yaw, target, 1 - Math.exp(-dt * 3.2));
  tps.yaw = Math.atan2(Math.sin(tps.yaw), Math.cos(tps.yaw));
  const fx = -Math.sin(tps.yaw), fz = -Math.cos(tps.yaw);
  // 몸(가슴 높이)에서 카메라 쪽으로 칸을 따라가며 벽에 막히는 거리 찾기 (벽 높이 0.95)
  const off = LV(R), baseY = (R.f || 0) * FLOOR_Y, chest = 0.55;
  let allow = TPS.DIST;
  for (let t = 0.3; t <= TPS.DIST; t += 0.1) {
    const h = chest + ((TPS.HEIGHT - chest) * t) / TPS.DIST; if (h > 1.0) break;
    const gx = Math.round(R.x - fx * t), gy = Math.round(R.y - fz * t);
    if ((gx !== Math.round(R.x) || gy !== Math.round(R.y)) && isWallAt(gx, gy, off)) { allow = Math.max(TPS.MIN, t - 0.15); break; }
  }
  // 거리 2.2 이내 뒤쪽이 막혀 있으면(코너·막다른 길) 조금 당겨서 벽 위에서 내려다보기
  for (let t = 0.6; t <= 2.2 && allow === TPS.DIST; t += 0.2) { const gx = Math.round(R.x - fx * t), gy = Math.round(R.y - fz * t); if ((gx !== Math.round(R.x) || gy !== Math.round(R.y)) && isWallAt(gx, gy, off)) allow = Math.max(TPS.MIN + 0.6, Math.min(TPS.DIST, t + 0.9)); }
  tps.dist += (allow - tps.dist) * Math.min(1, dt * (allow < tps.dist ? 10 : 2.5));
  const lift = (TPS.DIST - tps.dist) * 0.35;
  const want = tmpV.set(p.x - fx * tps.dist, baseY + TPS.HEIGHT + lift + (s.result === 'runner' ? p.y - baseY : 0), p.z - fz * tps.dist);
  const lookW = new THREE.Vector3(focus.x + fx * (catcherObj ? 0 : TPS.LOOK_AHEAD), (catcherObj ? focus.y + 1.2 : baseY + TPS.LOOK_UP), focus.z + fz * (catcherObj ? 0 : TPS.LOOK_AHEAD));
  if (!tps.init || !tps.pos) { tps.pos = want.clone(); tps.look = lookW.clone(); tps.init = true; }
  const kp = 1 - Math.exp(-dt * 7);
  tps.pos.lerp(want, kp); tps.look.lerp(lookW, kp);
  camera.position.copy(tps.pos); camera.up.set(0, 1, 0); camera.lookAt(tps.look);
  if (Math.abs(camera.fov - TPS.FOV) > 0.05) { camera.fov += (TPS.FOV - camera.fov) * Math.min(1, dt * 5); camera.updateProjectionMatrix(); }
  if (controls) controls.target.copy(p); // 다른 시점으로 돌아갈 때 자연스럽게
}
R3.tpsState = tps;
// 1인칭 카메라: 도망자 눈높이, 이동 방향을 부드럽게 따라 회전, 걸음 흔들림, 질주 시 시야 넓어짐, 거인 발소리 흔들림
function updateFpv(s, now) {
  const p = runnerObj.position, dt = Math.min(0.1, Math.max(0.001, now - (fpv.lastT || now))); fpv.lastT = now;
  const R = s.runner;
  let target = runYawTarget(R, fpv.yaw);
  let catcherObj = null;
  if (s.result === 'giant' && giantObjs[s.catcher]) catcherObj = giantObjs[s.catcher];
  let tPitch = 0.07;
  if (catcherObj) { const dx = catcherObj.position.x - p.x, dz = catcherObj.position.z - p.z; target = Math.atan2(-dx, -dz); tPitch = Math.atan2(2.6, Math.max(0.6, Math.hypot(dx, dz))); }
  if (!catcherObj) {
    // 앞쪽 가까이에 보이는 거인이 있으면 올려다봄
    const fx = -Math.sin(fpv.yaw), fz = -Math.cos(fpv.yaw);
    for (const o of giantObjs) { if (!o.visible) continue;
      const dx = o.position.x - p.x, dz = o.position.z - p.z, d = Math.hypot(dx, dz);
      if (d < 1.2 || d > 5.5 || (dx * fx + dz * fz) / d < 0.9) continue;
      if (!o.visible) continue;
      let clear = true; for (let t = 0.4; t < d - 0.4 && clear; t += 0.25) { const cx = Math.round(R.x + (dx * t) / d), cy = Math.round(R.y + (dz * t) / d); if (isWallAt(cx, cy, LV(R))) clear = false; }
      if (clear) tPitch = Math.max(tPitch, Math.min(0.42, Math.atan2(1.9 * FPV.GIANT_SCALE - FPV.EYE, d) * 0.75));
    }
  }
  if (!fpv.init) { fpv.yaw = target; fpv.pitch = tPitch; fpv.last = p.clone(); fpv.init = true; }
  const k = 1 - Math.exp(-dt * (catcherObj ? 5 : 6.5));
  fpv.yaw = angLerp(fpv.yaw, target, k); fpv.pitch += (tPitch - fpv.pitch) * k;
  // 드래그로 둘러보기 → 손을 떼고 잠시 후 원래 방향으로 복귀
  if (!fpv.dragging && performance.now() - fpv.releasedAt > 900) { const d = Math.exp(-dt * 3.5); fpv.lookYaw *= d; fpv.lookPitch *= d; }
  // 걸음 흔들림
  const moved = fpv.last ? Math.hypot(p.x - fpv.last.x, p.z - fpv.last.z) : 0; fpv.last.copy(p);
  const speed = moved / dt, moving = speed > 0.4 && !s.result;
  fpv.bob += dt * (R.sprint || R.boost ? 17 : 10.5) * (moving ? 1 : 0);
  const amp = moving ? (R.sprint ? 0.055 : 0.032) : 0;
  fpv.bobAmp = (fpv.bobAmp || 0) + (amp - (fpv.bobAmp || 0)) * Math.min(1, dt * 8);
  const bobY = Math.abs(Math.sin(fpv.bob)) * fpv.bobAmp, bobX = Math.sin(fpv.bob) * fpv.bobAmp * 0.5;
  // 가까운 거인 발소리 → 화면 흔들림
  let dmin = 99; for (const o of giantObjs) if (o.visible) dmin = Math.min(dmin, Math.hypot(o.position.x - p.x, o.position.z - p.z));
  const near = Math.max(0, (4.5 - dmin) / 4.5);
  const stomp = Math.pow(Math.abs(Math.sin(now * 7)), 18);
  fpv.shake = near * near * (0.03 + 0.09 * stomp);
  const sx = Math.sin(now * 61.7) * fpv.shake, sy = Math.cos(now * 53.3) * fpv.shake;
  // 시야각: 질주하면 넓어짐
  const tf = R.boost ? FPV.FOV_SPRINT + 6 : R.sprint ? FPV.FOV_SPRINT : FPV.FOV;
  if (Math.abs(camera.fov - tf) > 0.05) { camera.fov += (tf - camera.fov) * Math.min(1, dt * 5); camera.updateProjectionMatrix(); }
  const cy = Math.cos(fpv.yaw), sy2 = Math.sin(fpv.yaw);
  // 눈 위치를 칸 중심보다 살짝 뒤로 빼서 앞이 더 넓게 보이게
  const back = 0.28;
  camera.position.set(p.x + cy * bobX + sx + sy2 * back, p.y + FPV.EYE + bobY + sy, p.z - sy2 * bobX + cy * back);
  camera.rotation.order = 'YXZ';
  camera.rotation.set(fpv.pitch + fpv.lookPitch + sy * 0.6, fpv.yaw + fpv.lookYaw + sx * 0.4, Math.sin(fpv.bob) * fpv.bobAmp * 0.25);
  lantern.position.set(camera.position.x, camera.position.y + 0.15, camera.position.z);
  R3.fpvNear = dmin;
  // 빛기둥은 가까이 가면 흐려지게 (눈앞을 가리지 않도록)
  for (const bm of beacons) {
    if (!bm.visible) continue;
    bm.getWorldPosition(tmpV);
    const dd = Math.hypot(tmpV.x - camera.position.x, tmpV.z - camera.position.z);
    const base = bm.userData.base ?? (bm.userData.base = bm.material.opacity);
    bm.material.opacity = base * Math.max(0, Math.min(1, (dd - 0.8) / 2.2));
  }
}
R3.setAutoRotate = function (on, speed) { if (!controls) return; controls.autoRotate = !!on; controls.autoRotateSpeed = speed || 0.5; };
R3.setPixelRatioCap = function (cap) { if (!renderer) return; renderer.setPixelRatio(STREAM ? STREAM_Q : Math.min(window.devicePixelRatio || 1, cap)); R3.resize(); };
R3.fpvState = fpv; // 테스트/스크린샷용 (1인칭 시선 상태 읽기)
// 스크린샷/연출용: 특정 칸(층 f)을 가까이서 내려다보기 (전체 시점 상태에서 사용)
R3.lookAtCell = function (x, y, f, h = 7, back = 4.5, side = 0) { if (!controls) return; const ty = LZ(f) * FLOOR_Y; controls.target.set(wx(x), ty, wz(y)); camera.position.set(wx(x) + side, ty + h, wz(y) + back); controls.update(); };
R3.info = () => ({ calls: renderer ? renderer.info.render.calls : 0, triangles: renderer ? renderer.info.render.triangles : 0, mobile: MOBILE });

try {
  const test = document.createElement('canvas');
  if (!(test.getContext('webgl2') || test.getContext('webgl'))) throw new Error('WebGL 미지원');
  window.Render3D = R3;
  window.dispatchEvent(new Event('render3d-ready'));
} catch (e) {
  window.Render3DError = e.message;
  window.dispatchEvent(new Event('render3d-failed'));
}
