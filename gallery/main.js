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
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setClearColor(0x05070a, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.65; // brighter, like your reference

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// ---------- scene ----------
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x05070a, 6.0, 34.0);

// Composition constants (match your screenshot layout)
const ART = {
  center: new THREE.Vector3(-4.2, 3.1, -16.0), // LEFT
  size: new THREE.Vector2(8.6, 5.1),
};

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 140);

// Camera is front-ish, slightly right of center to keep space for right panel
const CAM_BASE = {
  pos: new THREE.Vector3(2.8, 2.65, 9.8),
  look: ART.center.clone(),
};

// Pointer parallax (subtle museum-like)
const PARALLAX = {
  maxX: 0.85,
  maxY: 0.40,
  maxZ: 0.55,
  damping: 0.085,
};

camera.position.copy(CAM_BASE.pos);
camera.lookAt(CAM_BASE.look);

// ---------- lighting ----------
scene.add(new THREE.AmbientLight(0xffffff, 0.10));
scene.add(new THREE.HemisphereLight(0xbfd7ff, 0x0a0b0d, 0.25));

// key overhead
const key = new THREE.DirectionalLight(0xffffff, 0.75);
key.position.set(6, 10, 10);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -18;
key.shadow.camera.right = 18;
key.shadow.camera.top = 18;
key.shadow.camera.bottom = -18;
key.shadow.camera.near = 1;
key.shadow.camera.far = 60;
scene.add(key);

// cool rim (adds silhouette separation)
const rim = new THREE.PointLight(0x7cf1ff, 2.0, 40, 2.0);
rim.position.set(-10, 3.2, -10);
scene.add(rim);

// warm accent
const warm = new THREE.PointLight(0xffc38a, 0.95, 22, 2.0);
warm.position.set(8, 1.8, -6);
scene.add(warm);

// ---------- room ----------
const room = new THREE.Mesh(
  new THREE.BoxGeometry(30, 12, 42),
  new THREE.MeshStandardMaterial({
    color: 0x0f131a,
    roughness: 0.92,
    metalness: 0.06,
    side: THREE.BackSide,
  })
);
room.position.set(0, 5.0, -8.0);
room.receiveShadow = true;
scene.add(room);

// ribs for industrial feel
const ribMat = new THREE.MeshStandardMaterial({ color: 0x0b0f15, roughness: 0.85, metalness: 0.20 });
const ribGeo = new THREE.BoxGeometry(0.12, 8.5, 0.5);
for (let i = 0; i < 21; i++) {
  const x = -13 + i * (26 / 20);
  const a = new THREE.Mesh(ribGeo, ribMat);
  a.position.set(x, 4.3, -28.0);
  a.castShadow = true;
  a.receiveShadow = true;
  scene.add(a);

  const b = a.clone();
  b.position.z = 10.5;
  scene.add(b);
}

// ---------- reflective floor ----------
const floor = new Reflector(new THREE.PlaneGeometry(60, 60), {
  textureWidth: 1024,
  textureHeight: 1024,
  color: 0x05070a,
});
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0;
scene.add(floor);

const floorBase = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x07090c, roughness: 1.0, metalness: 0.0 })
);
floorBase.rotation.x = -Math.PI / 2;
floorBase.position.y = -0.03;
floorBase.receiveShadow = true;
scene.add(floorBase);

// ---------- artwork shader (bright, cinematic) ----------
const screenUniforms = {
  iTime: { value: 0 },
  iResolution: { value: new THREE.Vector2(1, 1) },
};

const screenMat = new THREE.ShaderMaterial({
  uniforms: screenUniforms,
  vertexShader: `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
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
      for(int i=0;i<6;i++){ v += a * noise(p); p *= 2.0; a *= 0.5; }
      return v;
    }

    vec3 aces(vec3 x){
      float a=2.51, b=0.03, c=2.43, d=0.59, e=0.14;
      return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
    }

    void main(){
      vec2 uv = vUv;
      vec2 p = (uv - 0.5) * vec2(iResolution.x / iResolution.y, 1.0);

      float t = iTime * 0.18;

      // "domain warping-ish" look (simple and stable)
      vec2 w = vec2(fbm(p*2.1 + t), fbm(p*2.1 - t));
      float n = fbm(p*3.0 + 1.6*w);

      // bright, almost white marble energy
      float m = smoothstep(0.25, 0.95, n);
      vec3 col = vec3(0.05, 0.06, 0.07);
      col += m * vec3(1.8, 1.9, 2.05);

      // subtle cool shadows
      col *= mix(vec3(0.88,0.92,1.05), vec3(1.0), smoothstep(-0.6,0.6,p.x));

      // screen vignette
      float v = smoothstep(0.95, 0.25, length(uv - 0.5));
      col *= mix(0.62, 1.05, v);

      // mild tonemap inside (helps bloom)
      col = aces(col);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
});

const screen = new THREE.Mesh(new THREE.PlaneGeometry(ART.size.x, ART.size.y), screenMat);
screen.position.copy(ART.center);
screen.rotation.y = 0.06; // tiny yaw for depth
scene.add(screen);

const frame = new THREE.Mesh(
  new THREE.PlaneGeometry(ART.size.x + 0.55, ART.size.y + 0.55),
  new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.7, metalness: 0.08 })
);
frame.position.copy(ART.center);
frame.position.z += 0.02;
frame.rotation.copy(screen.rotation);
frame.castShadow = true;
scene.add(frame);

// screen “light spill”
const screenLight = new THREE.PointLight(0xc8fbff, 7.2, 45, 2.0);
screenLight.position.set(ART.center.x + 0.6, ART.center.y, ART.center.z + 0.8);
scene.add(screenLight);

// ---------- silhouette person ----------
function makeFigure() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x050608, roughness: 0.9, metalness: 0.0 });

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

  // centered in front of the artwork
  g.position.set(ART.center.x, 0, -10.2);
  return g;
}
scene.add(makeFigure());

// ---------- light shafts (cheap but effective) ----------
function makeRayTexture() {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(128, 40, 10, 128, 40, 180);
  g.addColorStop(0.0, "rgba(255,255,255,0.85)");
  g.addColorStop(0.35, "rgba(255,255,255,0.25)");
  g.addColorStop(1.0, "rgba(255,255,255,0.0)");
  ctx.fillStyle = g;
  ctx.fillRect(0,0,256,256);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
const rayTex = makeRayTexture();
const rayMat = new THREE.MeshBasicMaterial({
  color: 0x9fefff,
  map: rayTex,
  transparent: true,
  opacity: 0.14,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});

function addRayPlane(x, y, z, rx, ry, sx, sy, op){
  const m = rayMat.clone();
  m.opacity = op;
  const p = new THREE.Mesh(new THREE.PlaneGeometry(1,1), m);
  p.position.set(x,y,z);
  p.rotation.set(rx,ry,0);
  p.scale.set(sx,sy,1);
  scene.add(p);
  return p;
}

// a few layered rays from top-left
const rays = [
  addRayPlane(-12, 8.5, -8, -1.2, 0.25, 20, 12, 0.10),
  addRayPlane(-10, 8.2, -10, -1.25, 0.18, 18, 10, 0.09),
  addRayPlane(-8,  8.0, -12, -1.28, 0.10, 16,  9, 0.08),
];

// ---------- post FX ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloom = new UnrealBloomPass(new THREE.Vector2(1,1), 1.25, 0.85, 0.0);
composer.addPass(bloom);

const film = new FilmPass(0.35, 0.18, 648, false);
composer.addPass(film);

// vignette + letterbox (ShaderPass needs clip-space vertex)
const vignetteLetterbox = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1,1) },
    vignette: { value: 0.55 },
    targetAspect: { value: 16/9 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float vignette;
    uniform float targetAspect;
    varying vec2 vUv;

    float hash12(vec2 p){
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main(){
      vec4 col = texture2D(tDiffuse, vUv);

      // vignette
      vec2 p = vUv*(1.0-vUv);
      float v = pow(16.0*p.x*p.y, vignette);
      col.rgb *= mix(0.78, 1.06, v);

      // subtle extra grain (in addition to FilmPass)
      float n = hash12(vUv*resolution + fract(col.rg*13.0));
      col.rgb += (n-0.5)*0.012;

      // letterbox if window taller than 16:9
      float viewAspect = resolution.x/resolution.y;
      float barSize = 0.0;
      if(viewAspect < targetAspect){
        float targetH = resolution.x/targetAspect;
        float used = targetH/resolution.y;
        barSize = (1.0-used)*0.5;
      }
      float top = smoothstep(0.0, 0.004, vUv.y - (1.0 - barSize));
      float bot = smoothstep(0.0, 0.004, barSize - vUv.y);
      float m = clamp(top+bot, 0.0, 1.0);
      col.rgb = mix(col.rgb, vec3(0.0), m);

      gl_FragColor = col;
    }
  `,
});
composer.addPass(vignetteLetterbox);

// ---------- full-window resize (auto adapts) ----------
function resize(){
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.floor(window.innerWidth * dpr));
  const h = Math.max(1, Math.floor(window.innerHeight * dpr));

  renderer.setSize(w, h, false);
  composer.setSize(w, h);

  camera.aspect = w/h;
  camera.updateProjectionMatrix();

  bloom.setSize(w,h);
  vignetteLetterbox.uniforms.resolution.value.set(w,h);
  screenUniforms.iResolution.value.set(w,h);

  resEl.textContent = `${w}×${h}`;
}
window.addEventListener("resize", resize, { passive: true });
resize();

// ---------- pointer-driven parallax (front view, always focuses on art) ----------
const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

function onMove(e){
  const nx = (e.clientX / window.innerWidth) * 2 - 1;
  const ny = -((e.clientY / window.innerHeight) * 2 - 1);
  pointer.tx = THREE.MathUtils.clamp(nx, -1, 1);
  pointer.ty = THREE.MathUtils.clamp(ny, -1, 1);
}
window.addEventListener("pointermove", onMove, { passive: true });

function damp(a, b, k){ return a + (b-a)*k; }

// ---------- FPS ----------
let fpsSmoothed = 0, frames = 0, t0 = performance.now();
function tickFps(){
  frames++;
  const t = performance.now();
  const dt = t - t0;
  if(dt > 500){
    const fps = (frames/dt)*1000;
    fpsSmoothed = fpsSmoothed ? (0.85*fpsSmoothed + 0.15*fps) : fps;
    fpsEl.textContent = `${fpsSmoothed.toFixed(1)} fps`;
    frames = 0;
    t0 = t;
  }
}

// ---------- loop ----------
function loop(){
  requestAnimationFrame(loop);

  const time = performance.now() * 0.001;
  screenUniforms.iTime.value = time;

  // subtle breathing in shafts + lights
  rays[0].material.opacity = 0.09 + 0.03*(0.5+0.5*Math.sin(time*0.7));
  rays[1].material.opacity = 0.08 + 0.03*(0.5+0.5*Math.sin(time*0.6+1.1));
  rays[2].material.opacity = 0.07 + 0.03*(0.5+0.5*Math.sin(time*0.55+2.0));
  screenLight.intensity = 6.6 + 1.2*(0.5+0.5*Math.sin(time*0.35));
  rim.intensity = 1.7 + 0.5*(0.5+0.5*Math.sin(time*0.52));

  // parallax
  pointer.x = damp(pointer.x, pointer.tx, PARALLAX.damping);
  pointer.y = damp(pointer.y, pointer.ty, PARALLAX.damping);

  const px = pointer.x * PARALLAX.maxX;
  const py = pointer.y * PARALLAX.maxY;
  const pz = (Math.abs(pointer.x)+Math.abs(pointer.y))*0.5 * PARALLAX.maxZ;

  camera.position.set(
    CAM_BASE.pos.x + px,
    CAM_BASE.pos.y + py,
    CAM_BASE.pos.z - pz
  );
  camera.lookAt(CAM_BASE.look);

  composer.render();
  tickFps();
}
loop();
