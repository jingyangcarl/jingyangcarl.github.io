import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { FilmPass } from "three/addons/postprocessing/FilmPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

const canvas = document.querySelector("#c");
const fpsEl = document.querySelector("#fps");
const resEl = document.querySelector("#res");

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
});
renderer.setClearColor(0x0b0d10, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

// Make it feel cinematic but not crushed
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// ---------- scene ----------
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b0d10, 5.5, 28);

// Camera stays “front view”, parallax only
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);

// Where the artwork is
const ART_CENTER = new THREE.Vector3(0, 3.25, -15.0);

// Base camera pose (front of art)
const CAM_BASE = {
  pos: new THREE.Vector3(0.0, 2.8, 8.8),
  look: ART_CENTER.clone(),
};

// Parallax limits (tune these)
const PARALLAX = {
  maxX: 0.9,   // left-right sway
  maxY: 0.45,  // up-down sway
  maxZ: 0.45,  // slight dolly in/out
  damping: 0.08,
};

camera.position.copy(CAM_BASE.pos);
camera.lookAt(CAM_BASE.look);

// ---------- lighting: “person in front of art” ----------
scene.add(new THREE.AmbientLight(0xffffff, 0.10)); // keep low

// Very soft fill from camera side (prevents the scene being too dark)
const fill = new THREE.HemisphereLight(0xbfd7ff, 0x101218, 0.22);
scene.add(fill);

// Rim/back accents for silhouette separation
const rim = new THREE.PointLight(0x7cf1ff, 1.8, 28, 2.0);
rim.position.set(-6.5, 2.6, -8.5);
scene.add(rim);

const warm = new THREE.PointLight(0xffc38a, 0.9, 18, 2.0);
warm.position.set(6.0, 1.4, -4.0);
scene.add(warm);

// A subtle directional “dust” light
const key = new THREE.DirectionalLight(0xffffff, 0.55);
key.position.set(4.5, 8.0, 7.0);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 1;
key.shadow.camera.far = 40;
key.shadow.camera.left = -14;
key.shadow.camera.right = 14;
key.shadow.camera.top = 14;
key.shadow.camera.bottom = -14;
scene.add(key);

// ---------- room ----------
const roomMat = new THREE.MeshStandardMaterial({
  color: 0x0f131a,
  roughness: 0.92,
  metalness: 0.05,
  side: THREE.BackSide,
});
const room = new THREE.Mesh(new THREE.BoxGeometry(24, 10, 36), roomMat);
room.position.set(0, 4.0, -6.0);
room.receiveShadow = true;
scene.add(room);

// Wall ribs to give depth/scale
const ribMat = new THREE.MeshStandardMaterial({
  color: 0x0b0f15,
  roughness: 0.85,
  metalness: 0.18,
});
const ribGeo = new THREE.BoxGeometry(0.12, 7.2, 0.45);
for (let i = 0; i < 19; i++) {
  const x = -10.8 + i * (21.6 / 18);
  const a = new THREE.Mesh(ribGeo, ribMat);
  a.position.set(x, 3.6, -22.0);
  a.castShadow = true;
  a.receiveShadow = true;
  scene.add(a);

  const b = a.clone();
  b.position.z = 9.8;
  scene.add(b);
}

// ---------- reflective floor ----------
const floor = new Reflector(new THREE.PlaneGeometry(44, 44), {
  textureWidth: 1024,
  textureHeight: 1024,
  color: 0x0b0d10,
});
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0;
scene.add(floor);

const floorBase = new THREE.Mesh(
  new THREE.PlaneGeometry(44, 44),
  new THREE.MeshStandardMaterial({ color: 0x07090c, roughness: 1.0, metalness: 0.0 })
);
floorBase.rotation.x = -Math.PI / 2;
floorBase.position.y = -0.02;
floorBase.receiveShadow = true;
scene.add(floorBase);

// ---------- “artwork” screen (cinematic shader) ----------
const screenUniforms = {
  iTime: { value: 0 },
  iResolution: { value: new THREE.Vector2(1, 1) },
};

const screenMat = new THREE.ShaderMaterial({
  uniforms: screenUniforms,
  vertexShader: `
    varying vec2 vUv;
    void main(){
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    precision highp float;
    varying vec2 vUv;
    uniform float iTime;
    uniform vec2 iResolution;

    float hash(vec2 p){
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 34.345);
      return fract(p.x * p.y);
    }
    float noise(vec2 p){
      vec2 i = floor(p);
      vec2 f = fract(p);
      float a = hash(i);
      float b = hash(i + vec2(1,0));
      float c = hash(i + vec2(0,1));
      float d = hash(i + vec2(1,1));
      vec2 u = f*f*(3.0-2.0*f);
      return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
    }
    float fbm(vec2 p){
      float v = 0.0;
      float a = 0.5;
      for(int i=0;i<6;i++){
        v += a * noise(p);
        p *= 2.0;
        a *= 0.5;
      }
      return v;
    }

    // soft filmic curve-ish
    vec3 liftGammaGain(vec3 c, float lift, float gamma, float gain){
      c = c + lift;
      c = pow(max(c, 0.0), vec3(1.0/gamma));
      c = c * gain;
      return c;
    }

    void main(){
      vec2 uv = vUv;
      vec2 p = (uv - 0.5) * vec2(iResolution.x / iResolution.y, 1.0);

      float t = iTime * 0.18;

      float n1 = fbm(p*2.4 + vec2(0.0, t));
      float n2 = fbm(p*3.6 - vec2(t*0.7, 0.0));
      float n = 0.62*n1 + 0.38*n2;

      // bright core + cinematic teal highlights
      float core = smoothstep(0.40, 0.96, n);
      vec3 base = vec3(0.03, 0.05, 0.06);
      vec3 teal = vec3(0.18, 0.95, 1.10);
      vec3 warm = vec3(1.10, 0.55, 0.18);

      // subtle warm/cool split
      float split = smoothstep(-0.6, 0.6, p.x);
      vec3 tint = mix(warm, teal, split);

      vec3 col = base + core * tint * 1.35;

      // inner vignette (keeps “art” framed)
      float v = smoothstep(0.95, 0.25, length(uv - 0.5));
      col *= mix(0.60, 1.15, v);

      // mild filmic grading
      col = liftGammaGain(col, -0.02, 1.12, 1.10);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
});

const screen = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 5.4), screenMat);
screen.position.copy(ART_CENTER);
scene.add(screen);

// Frame behind the screen (helps contrast)
const frame = new THREE.Mesh(
  new THREE.PlaneGeometry(10.25, 6.05),
  new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.7, metalness: 0.08 })
);
frame.position.copy(ART_CENTER);
frame.position.z += 0.02;
frame.castShadow = true;
scene.add(frame);

// Make the screen “light the scene” (key light)
const screenLight = new THREE.PointLight(0x9af6ff, 5.6, 34, 2.0);
screenLight.position.set(0, 3.3, -14.4);
scene.add(screenLight);

// ---------- silhouette person ----------
function makeFigure() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x07090c,
    roughness: 0.85,
    metalness: 0.0,
  });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.92, 6, 12), mat);
  body.position.y = 1.05;
  body.castShadow = true;
  g.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), mat);
  head.position.y = 1.66;
  head.castShadow = true;
  g.add(head);

  const feet = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 0.22), mat);
  feet.position.y = 0.05;
  feet.castShadow = true;
  g.add(feet);

  // put the person in front of the art
  g.position.set(0, 0, -9.8);
  return g;
}
scene.add(makeFigure());

// ---------- cheap “haze” cones ----------
function addLightCone(pos, rotY, colorHex, opacity) {
  const geo = new THREE.ConeGeometry(2.2, 8.5, 32, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const cone = new THREE.Mesh(geo, mat);
  cone.position.copy(pos);
  cone.rotation.set(-Math.PI / 2, rotY, 0);
  scene.add(cone);
  return cone;
}
const coneA = addLightCone(new THREE.Vector3(-6, 7.5, -6), 0.2, 0x7cf1ff, 0.06);
const coneB = addLightCone(new THREE.Vector3(6, 7.5, -4), -0.25, 0xffc38a, 0.04);

// ---------- post FX ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 1.05, 0.8, 0.0);
composer.addPass(bloom);

// grain
const film = new FilmPass(0.35, 0.18, 648, false);
composer.addPass(film);

// vignette + letterbox
const vignetteLetterbox = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    vignette: { value: 0.55 },
    bars: { value: 1.0 },
    targetAspect: { value: 16 / 9 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main(){
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float vignette;
    uniform float bars;
    uniform float targetAspect;
    varying vec2 vUv;

    void main(){
      vec4 col = texture2D(tDiffuse, vUv);

      // vignette
      vec2 p = vUv * (1.0 - vUv);
      float v = pow(16.0 * p.x * p.y, vignette);
      col.rgb *= mix(0.80, 1.06, v);

      // letterbox (only if window is taller than target aspect)
      float viewAspect = resolution.x / resolution.y;
      float barSize = 0.0;
      if (bars > 0.5 && viewAspect < targetAspect) {
        float targetH = resolution.x / targetAspect;
        float used = targetH / resolution.y;
        barSize = (1.0 - used) * 0.5;
      }

      float top = smoothstep(0.0, 0.004, vUv.y - (1.0 - barSize));
      float bot = smoothstep(0.0, 0.004, barSize - vUv.y);
      float m = clamp(top + bot, 0.0, 1.0);
      col.rgb = mix(col.rgb, vec3(0.0), m);

      gl_FragColor = col;
    }
  `,
});
composer.addPass(vignetteLetterbox);

// ---------- resize (full window + adapt) ----------
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  bloom.setSize(w, h);
  vignetteLetterbox.uniforms.resolution.value.set(w, h);
  screenUniforms.iResolution.value.set(w, h);

  resEl.textContent = `${w}×${h}`;
}

// Robust: observe actual canvas size changes
new ResizeObserver(resize).observe(canvas);
resize();

// ---------- pointer-driven “front view parallax” ----------
const pointer = {
  x: 0, y: 0,
  tx: 0, ty: 0,
  inside: false,
};

// normalize pointer to [-1, 1] in both axes
function updatePointerFromEvent(e) {
  const r = canvas.getBoundingClientRect();
  const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
  const ny = -(((e.clientY - r.top) / r.height) * 2 - 1);
  pointer.tx = THREE.MathUtils.clamp(nx, -1, 1);
  pointer.ty = THREE.MathUtils.clamp(ny, -1, 1);
}

canvas.addEventListener("pointerenter", () => { pointer.inside = true; });
canvas.addEventListener("pointerleave", () => {
  pointer.inside = false;
  pointer.tx = 0;
  pointer.ty = 0;
});
canvas.addEventListener("pointermove", updatePointerFromEvent);

// ---------- FPS ----------
let fpsSmoothed = 0;
let frames = 0;
let t0 = performance.now();
function tickFps() {
  frames++;
  const t = performance.now();
  const dt = t - t0;
  if (dt > 500) {
    const fps = (frames / dt) * 1000;
    fpsSmoothed = fpsSmoothed ? (0.85 * fpsSmoothed + 0.15 * fps) : fps;
    fpsEl.textContent = `${fpsSmoothed.toFixed(1)} fps`;
    frames = 0;
    t0 = t;
  }
}

// ---------- loop ----------
function loop() {
  requestAnimationFrame(loop);

  const time = performance.now() * 0.001;
  screenUniforms.iTime.value = time;

  // animate haze & lights subtly
  coneA.material.opacity = 0.05 + 0.02 * (0.5 + 0.5 * Math.sin(time * 0.9));
  coneB.material.opacity = 0.035 + 0.015 * (0.5 + 0.5 * Math.sin(time * 0.7 + 1.2));
  rim.intensity = 1.6 + 0.6 * (0.5 + 0.5 * Math.sin(time * 0.55));
  screenLight.intensity = 5.2 + 1.2 * (0.5 + 0.5 * Math.sin(time * 0.35));

  // pointer smoothing (damped)
  pointer.x = THREE.MathUtils.lerp(pointer.x, pointer.tx, PARALLAX.damping);
  pointer.y = THREE.MathUtils.lerp(pointer.y, pointer.ty, PARALLAX.damping);

  // parallax camera: stay front-facing, just “slide” around
  const px = pointer.x * PARALLAX.maxX;
  const py = pointer.y * PARALLAX.maxY;
  const pz = (Math.abs(pointer.x) + Math.abs(pointer.y)) * 0.5 * PARALLAX.maxZ;

  camera.position.set(
    CAM_BASE.pos.x + px,
    CAM_BASE.pos.y + py,
    CAM_BASE.pos.z - pz
  );

  // Always focus on the art center
  camera.lookAt(CAM_BASE.look);

  composer.render();
  tickFps();
}
loop();
