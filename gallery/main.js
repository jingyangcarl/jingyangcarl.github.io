import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { GALLERY } from "./gallery.js";

const overlay = document.getElementById("overlay");
const enterBtn = document.getElementById("enterBtn");
const hint = document.getElementById("hint");

const viewer = document.getElementById("viewer");
const viewerTitle = document.getElementById("viewerTitle");
const viewerMeta = document.getElementById("viewerMeta");
const viewerDesc = document.getElementById("viewerDesc");
const viewerClose = document.getElementById("viewerClose");

let mode = "museum"; // "museum" | "viewer"
let selectedArtwork = null;

// --- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const app = document.getElementById("app");
app.prepend(renderer.domElement); // put canvas behind HUD/overlay
renderer.domElement.style.position = "absolute";
renderer.domElement.style.inset = "0";
renderer.domElement.style.zIndex = "0";


// --- scenes/cameras
const museumScene = new THREE.Scene();
museumScene.background = new THREE.Color(0x070a10);
museumScene.fog = new THREE.Fog(0x070a10, 6, 40);

const museumCamera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 140);
museumCamera.position.set(0, 1.65, 4);

const viewerScene = new THREE.Scene();
const viewerCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
viewerCamera.position.z = 1;

// full-screen quad for viewer mode
const viewerQuad = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.MeshBasicMaterial({ color: 0x000000 })
);
viewerScene.add(viewerQuad);

// --- controls (pointer lock FPS)
const controls = new PointerLockControls(museumCamera, document.body);

// movement state
const keys = { w: false, a: false, s: false, d: false };
const vel = new THREE.Vector3();
const dir = new THREE.Vector3();

function setHint(text, show = true) {
  if (!show) {
    hint.classList.add("hidden");
    hint.textContent = "";
    return;
  }
  hint.textContent = text;
  hint.classList.remove("hidden");
}

// --- lighting
museumScene.add(new THREE.AmbientLight(0xffffff, 0.15));

const keyLight = new THREE.DirectionalLight(0xffffff, 0.35);
keyLight.position.set(2, 6, 5);
museumScene.add(keyLight);

const fillLight = new THREE.PointLight(0x88aaff, 0.7, 18, 2);
fillLight.position.set(0, 2.4, 0);
museumScene.add(fillLight);

// --- museum geometry (simple corridor)
const corridor = {
  halfWidth: 3.6,
  height: 3.2,
  segmentLen: 5.0,
  segments: Math.max(GALLERY.length, 6),
};

const floorMat = new THREE.MeshStandardMaterial({ color: 0x0c1220, roughness: 0.95, metalness: 0.0 });
const wallMat  = new THREE.MeshStandardMaterial({ color: 0x101a2d, roughness: 0.95, metalness: 0.0 });
const trimMat  = new THREE.MeshStandardMaterial({ color: 0x0a0f1a, roughness: 0.6,  metalness: 0.15 });

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(corridor.halfWidth * 2, corridor.segmentLen * corridor.segments + 10),
  floorMat
);
floor.rotation.x = -Math.PI / 2;
floor.position.set(0, 0, -((corridor.segmentLen * corridor.segments) / 2));
museumScene.add(floor);

const ceiling = new THREE.Mesh(
  new THREE.PlaneGeometry(corridor.halfWidth * 2, corridor.segmentLen * corridor.segments + 10),
  wallMat
);
ceiling.rotation.x = Math.PI / 2;
ceiling.position.set(0, corridor.height, -((corridor.segmentLen * corridor.segments) / 2));
museumScene.add(ceiling);

const leftWall = new THREE.Mesh(
  new THREE.PlaneGeometry(corridor.segmentLen * corridor.segments + 10, corridor.height),
  wallMat
);
leftWall.rotation.y = Math.PI / 2;
leftWall.position.set(-corridor.halfWidth, corridor.height / 2, -((corridor.segmentLen * corridor.segments) / 2));
museumScene.add(leftWall);

const rightWall = leftWall.clone();
rightWall.rotation.y = -Math.PI / 2;
rightWall.position.x = corridor.halfWidth;
museumScene.add(rightWall);

// subtle light strips
for (let i = 0; i < corridor.segments; i++) {
  const z = -i * corridor.segmentLen;
  const strip = new THREE.PointLight(0xffffff, 0.55, 10, 2);
  strip.position.set(0, corridor.height - 0.25, z);
  museumScene.add(strip);

  const stripGeo = new THREE.BoxGeometry(corridor.halfWidth * 1.4, 0.06, 0.12);
  const stripMesh = new THREE.Mesh(stripGeo, trimMat);
  stripMesh.position.copy(strip.position);
  museumScene.add(stripMesh);
}

// --- shadertoy-ish shader wrapper
const VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

function makeShadertoyFragment(userMainImageCode) {
  // Provides: iTime, iResolution, iMouse
  return `
    precision highp float;

    uniform float iTime;
    uniform vec3  iResolution;
    uniform vec4  iMouse;

    varying vec2 vUv;

    ${userMainImageCode}

    void main() {
      vec2 fragCoord = vUv * iResolution.xy;
      vec4 color = vec4(0.0);
      mainImage(color, fragCoord);
      gl_FragColor = vec4(color.rgb, 1.0);
    }
  `;
}

function createArtworkMaterial(fragmentMainImage) {
  const uniforms = {
    iTime: { value: 0 },
    iResolution: { value: new THREE.Vector3(window.innerWidth, window.innerHeight, 1) },
    iMouse: { value: new THREE.Vector4(0, 0, 0, 0) },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: makeShadertoyFragment(fragmentMainImage),
  });
}

// --- frames / artworks
const artworks = []; // { data, group, screenMesh, material, z }

function buildFrame({ data, index }) {
  const side = index % 2 === 0 ? -1 : 1;
  const z = -index * corridor.segmentLen - 2.0;

  const group = new THREE.Group();
  group.position.set(side * (corridor.halfWidth - 0.55), 1.55, z);
  group.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;

  // outer frame
  const frameGeo = new THREE.BoxGeometry(1.35, 0.95, 0.12);
  const frame = new THREE.Mesh(frameGeo, trimMat);
  group.add(frame);

  // screen (shader)
  const mat = createArtworkMaterial(data.fragment);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.75), mat);
  screen.position.z = 0.061;
  group.add(screen);

  // small spotlight aimed at the painting
  const spot = new THREE.SpotLight(0xffffff, 1.25, 6, Math.PI / 7, 0.5, 1.2);
  spot.position.set(-0.9 * side, 2.4, z + 0.4);
  spot.target = group;
  museumScene.add(spot);

  museumScene.add(group);

  artworks.push({ data, group, screenMesh: screen, material: mat, z });
}

GALLERY.forEach((data, index) => buildFrame({ data, index }));

// --- input
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyW") keys.w = true;
  if (e.code === "KeyA") keys.a = true;
  if (e.code === "KeyS") keys.s = true;
  if (e.code === "KeyD") keys.d = true;

  if (e.code === "KeyE") {
    if (mode === "museum") tryInspect();
  }

  if (e.code === "Escape") {
    if (mode === "viewer") closeViewer();
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "KeyW") keys.w = false;
  if (e.code === "KeyA") keys.a = false;
  if (e.code === "KeyS") keys.s = false;
  if (e.code === "KeyD") keys.d = false;
});

// mouse for iMouse (optional)
let mouseDown = false;
renderer.domElement.addEventListener("mousedown", (e) => {
  mouseDown = true;
  setMouse(e);
});
window.addEventListener("mouseup", () => (mouseDown = false));
window.addEventListener("mousemove", (e) => setMouse(e));

function setMouse(e) {
  // Map to viewport pixels
  const x = e.clientX;
  const y = window.innerHeight - e.clientY;
  const z = mouseDown ? 1 : 0;
  const w = mouseDown ? 1 : 0;
  for (const a of artworks) a.material.uniforms.iMouse.value.set(x, y, z, w);
}

// --- enter / pointer lock
enterBtn.addEventListener("click", () => {
  overlay.classList.add("hidden");
  controls.lock();
});

document.addEventListener("click", () => {
  if (!controls.isLocked && mode === "museum" && overlay.classList.contains("hidden")) {
    controls.lock();
  }
});

controls.addEventListener("lock", () => {
  setHint("", false);
});

controls.addEventListener("unlock", () => {
  if (mode === "museum") setHint("Click to resume", true);
});

// --- inspect logic
function nearestArtwork() {
  const p = museumCamera.position;
  let best = null;
  let bestDist = Infinity;

  for (const a of artworks) {
    const wp = new THREE.Vector3();
    a.group.getWorldPosition(wp);
    const d = wp.distanceTo(p);
    if (d < bestDist) {
      bestDist = d;
      best = a;
    }
  }
  return { best, dist: bestDist };
}

function tryInspect() {
  const { best, dist } = nearestArtwork();
  if (!best || dist > 2.3) return;
  openViewer(best);
}

function openViewer(art) {
  mode = "viewer";
  selectedArtwork = art;

  // show UI
  viewer.classList.remove("hidden");
  viewerTitle.textContent = art.data.title;
  viewerMeta.textContent = `by ${art.data.author}`;
  viewerDesc.textContent = art.data.description;

  // switch to full-screen quad with same material
  viewerQuad.material = art.material;

  // release pointer lock so user can click "Back"
  if (controls.isLocked) controls.unlock();
  setHint("Press Esc to go back", true);
}

function closeViewer() {
  mode = "museum";
  selectedArtwork = null;
  viewer.classList.add("hidden");
  viewerQuad.material = new THREE.MeshBasicMaterial({ color: 0x000000 });
  setHint("Click to resume", true);
}

viewerClose.addEventListener("click", closeViewer);

// --- resize
window.addEventListener("resize", () => {
  museumCamera.aspect = window.innerWidth / window.innerHeight;
  museumCamera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);

  for (const a of artworks) {
    a.material.uniforms.iResolution.value.set(window.innerWidth, window.innerHeight, 1);
  }
});

// --- animation loop
const clock = new THREE.Clock();

function clampPlayer() {
  // keep player inside corridor + keep height fixed
  const p = museumCamera.position;
  p.y = 1.65;
  p.x = THREE.MathUtils.clamp(p.x, -corridor.halfWidth + 0.4, corridor.halfWidth - 0.4);

  // keep within Z bounds
  const minZ = -(corridor.segmentLen * corridor.segments) - 4.0;
  const maxZ = 6.0;
  p.z = THREE.MathUtils.clamp(p.z, minZ, maxZ);
}

function updateMovement(dt) {
  if (!controls.isLocked) return;

  // desired direction in local space
  dir.set(0, 0, 0);
  if (keys.w) dir.z -= 1;
  if (keys.s) dir.z += 1;
  if (keys.a) dir.x -= 1;
  if (keys.d) dir.x += 1;
  dir.normalize();

  // accelerate
  const speed = 5.5;
  const accel = 18.0;
  const damping = 10.0;

  // get forward/right vectors from camera
  const forward = new THREE.Vector3();
  museumCamera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();

  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).multiplyScalar(-1);

  const wish = new THREE.Vector3()
    .addScaledVector(forward, dir.z)
    .addScaledVector(right, dir.x)
    .normalize();

  vel.addScaledVector(wish, accel * dt * speed);
  vel.addScaledVector(vel, -damping * dt); // friction

  controls.moveRight(vel.x * dt);
  controls.moveForward(vel.z * dt);

  clampPlayer();
}

function updateHints() {
  if (mode !== "museum") return;

  const { best, dist } = nearestArtwork();
  if (best && dist < 2.3) {
    setHint(`Press E to inspect: ${best.data.title}`, true);
  } else if (controls.isLocked) {
    setHint("", false);
  }
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.033);
  const t = clock.elapsedTime;

  // update shader uniforms
  for (const a of artworks) a.material.uniforms.iTime.value = t;

  updateMovement(dt);
  updateHints();

  if (mode === "museum") {
    renderer.render(museumScene, museumCamera);
  } else {
    // viewer mode
    renderer.render(viewerScene, viewerCamera);
  }
}

renderer.setAnimationLoop(animate);
