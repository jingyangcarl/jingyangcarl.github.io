import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Reflector } from "three/addons/objects/Reflector.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { FilmPass } from "three/addons/postprocessing/FilmPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

const canvas = document.querySelector("#c");
const fpsEl = document.querySelector("#fps");
const resEl = document.querySelector("#res");

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  preserveDrawingBuffer: false,
});
renderer.setClearColor(0x0b0d10, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b0d10, 6, 30);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0.0, 2.0, 9.0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1.8, -3.5);
controls.enabled = false; // keep the cinematic feel; toggle if you want

// ---------- lighting ----------
scene.add(new THREE.AmbientLight(0xffffff, 0.08));

const key = new THREE.DirectionalLight(0xffffff, 1.2);
key.position.set(5, 8, 6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 1;
key.shadow.camera.far = 30;
key.shadow.camera.left = -12;
key.shadow.camera.right = 12;
key.shadow.camera.top = 12;
key.shadow.camera.bottom = -12;
scene.add(key);

const cyan = new THREE.PointLight(0x7cf1ff, 2.2, 30, 2.0);
cyan.position.set(-5, 2.5, -6);
scene.add(cyan);

const warm = new THREE.PointLight(0xffc38a, 1.0, 18, 2.0);
warm.position.set(5.5, 1.4, -2.0);
scene.add(warm);

// ---------- room ----------
const roomMat = new THREE.MeshStandardMaterial({
  color: 0x0f131a,
  roughness: 0.92,
  metalness: 0.05,
  side: THREE.BackSide,
});
const room = new THREE.Mesh(new THREE.BoxGeometry(22, 10, 34), roomMat);
room.position.set(0, 4.0, -6.0);
room.receiveShadow = true;
scene.add(room);

// subtle wall ribs (adds that “hangar” feel)
const ribMat = new THREE.MeshStandardMaterial({
  color: 0x0b0f15,
  roughness: 0.85,
  metalness: 0.15,
});
const ribGeo = new THREE.BoxGeometry(0.12, 7.0, 0.4);
for (let i = 0; i < 18; i++) {
  const x = -10 + i * (20 / 17);
  const ribL = new THREE.Mesh(ribGeo, ribMat);
  ribL.position.set(x, 3.6, -21.5);
  ribL.castShadow = true;
  ribL.receiveShadow = true;
  scene.add(ribL);

  const ribR = ribL.clone();
  ribR.position.z = 9.5;
  scene.add(ribR);
}

// ---------- reflective floor ----------
const floor = new Reflector(new THREE.PlaneGeometry(40, 40), {
  textureWidth: 1024,
  textureHeight: 1024,
  color: 0x0b0d10,
});
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0;
scene.add(floor);

// dark “floor” under reflector to keep it moody
const floorBase = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({ color: 0x07090c, roughness: 1.0, metalness: 0.0 })
);
floorBase.rotation.x = -Math.PI / 2;
floorBase.position.y = -0.02;
floorBase.receiveShadow = true;
scene.add(floorBase);

// ---------- big screen with animated shader ----------
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

    // simple fbm-ish noise (fast, not “true” Perlin)
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

    void main(){
      vec2 uv = vUv;
      vec2 p = (uv - 0.5) * vec2(iResolution.x / iResolution.y, 1.0);

      float t = iTime * 0.20;

      // fluid-y turbulence
      float n1 = fbm(p*2.5 + vec2(0.0, t));
      float n2 = fbm(p*3.5 - vec2(t*0.7, 0.0));
      float n = 0.65*n1 + 0.35*n2;

      // bright “screen” energy
      float glow = smoothstep(0.35, 0.95, n);
      vec3 col = vec3(0.05, 0.10, 0.13);
      col += glow * vec3(0.55, 0.95, 1.10);

      // vignette inside the screen
      float v = smoothstep(0.95, 0.25, length(uv - 0.5));
      col *= mix(0.65, 1.1, v);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
});

const screen = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 5.3), screenMat);
screen.position.set(0, 3.2, -15.0);
screen.castShadow = false;
screen.receiveShadow = false;
scene.add(screen);

// frame around screen
const frame = new THREE.Mesh(
  new THREE.PlaneGeometry(10.1, 5.9),
  new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.7, metalness: 0.1 })
);
frame.position.copy(screen.position);
frame.position.z += 0.02;
frame.castShadow = true;
scene.add(frame);

// add a weak area light illusion: a point light near screen
const screenLight = new THREE.PointLight(0x8fefff, 4.0, 30, 2.0);
screenLight.position.set(0, 3.0, -14.4);
scene.add(screenLight);

// ---------- silhouette “person” ----------
function makeFigure() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x07090c,
    roughness: 0.8,
    metalness: 0.0,
  });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.9, 6, 12), mat);
  body.position.y = 1.05;
  body.castShadow = true;
  g.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), mat);
  head.position.y = 1.65;
  head.castShadow = true;
  g.add(head);

  const feet = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 0.22), mat);
  feet.position.set(0, 0.05, 0);
  feet.castShadow = true;
  g.add(feet);

  g.position.set(0, 0, -9.6);
  return g;
}
scene.add(makeFigure());

// ---------- volumetric-ish light cones (cheap cheat) ----------
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

const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.9, 0.7, 0.0);
composer.addPass(bloom);

const film = new FilmPass(0.35, 0.18, 648, false);
composer.addPass(film);

// vignette + letterbox in one pass
const vignetteLetterbox = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    vignette: { value: 0.55 },
    bars: { value: 1.0 }, // 1 = on
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

    float smoothBar(float y, float edge){
      return smoothstep(0.0, edge, y);
    }

    void main(){
      vec4 col = texture2D(tDiffuse, vUv);

      // vignette
      vec2 p = vUv * (1.0 - vUv);
      float v = pow(16.0 * p.x * p.y, vignette);
      col.rgb *= mix(0.78, 1.05, v);

      // letterbox based on target aspect
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

// ---------- resize ----------
const state = { autoCam: true };

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
window.addEventListener("resize", resize);
resize();

// ---------- cinematic camera ----------
function animateCamera(t) {
  // slow dolly + subtle sway (feels “filmic”)
  const z = 9.0 + Math.sin(t * 0.12) * 0.8;
  const x = Math.sin(t * 0.09) * 0.7;
  const y = 2.05 + Math.sin(t * 0.10) * 0.08;

  camera.position.set(x, y, z);
  camera.lookAt(0, 2.4, -10.5);
}

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

  // animate “volumetric” cones a bit
  coneA.material.opacity = 0.05 + 0.02 * (0.5 + 0.5 * Math.sin(time * 0.9));
  coneB.material.opacity = 0.035 + 0.015 * (0.5 + 0.5 * Math.sin(time * 0.7 + 1.2));
  cyan.intensity = 1.9 + 0.5 * (0.5 + 0.5 * Math.sin(time * 0.6));
  screenLight.intensity = 3.6 + 1.2 * (0.5 + 0.5 * Math.sin(time * 0.45));

  if (state.autoCam) animateCamera(time);
  controls.update();

  composer.render();
  tickFps();
}
loop();

// toggle auto camera
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "c") state.autoCam = !state.autoCam;
});
