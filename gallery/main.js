import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { Reflector } from "three/addons/objects/Reflector.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { DEFAULT_IMAGES, IMAGE_MANIFEST_URL } from "./gallery.js";

const app = document.getElementById("app");
const shotLabel = document.getElementById("shotLabel");
const artLabel = document.getElementById("artLabel");
const filmStrip = document.getElementById("filmStrip");
const fadeLayer = document.getElementById("fade");
const imageInput = document.getElementById("imageInput");
const settingsBtn = document.getElementById("settingsBtn");
const settingsPanel = document.getElementById("settingsPanel");
const cameraSelect = document.getElementById("cameraSelect");
const viewerSelect = document.getElementById("viewerSelect");
const displaySelect = document.getElementById("displaySelect");
const resolutionSelect = document.getElementById("resolutionSelect");
const cropControls = document.getElementById("cropControls");
const cropInputs = {
  x: document.getElementById("cropX"),
  y: document.getElementById("cropY"),
  w: document.getElementById("cropW"),
  h: document.getElementById("cropH"),
};
const copyTitle = document.getElementById("copyTitle");
const copyDescription = document.getElementById("copyDescription");
const copyAuthor = document.getElementById("copyAuthor");
const copyPanel = document.querySelector(".copyPanel");

const RESOLUTION_OPTIONS = {
  ultra: { maxTextureSize: 8192, segments: 1280, mobileSegments: 520 },
  high: { maxTextureSize: 6144, segments: 920, mobileSegments: 400 },
  standard: { maxTextureSize: 4096, segments: 640, mobileSegments: 300 },
  performance: { maxTextureSize: 2048, segments: 360, mobileSegments: 220 },
};

const state = {
  items: [],
  currentIndex: 0,
  shotIndex: 0,
  shotStartedAt: performance.now(),
  cinematic: true,
  cutting: false,
  cutFlashUntil: 0,
  settingsOpen: false,
  displayMode: "crop",
  resolution: "ultra",
  textureVersion: 0,
};

const localUrls = [];
const clock = new THREE.Clock();
const fbxLoader = new FBXLoader();
const gltfLoader = new GLTFLoader();
let pointerIdleTimer = null;

// All viewer models are rendered with the same untextured clay material.
const VIEWER_MODELS = [
  {
    id: "gesture-thoughtful",
    label: "Thoughtful",
    url: "./assets/rocketbox-male-adult-01.fbx",
    animationUrl: "./assets/rocketbox-anim-thoughtful.fbx",
    credit: "Microsoft Rocketbox Male Adult 01 with f_gestic_thoughtful_01, MIT",
    format: "fbx",
    pose: "none",
    targetHeight: 1.0,
    modelRotationY: 0,
    baseRotationY: -0.28,
    animationTimeScale: 0.32,
    animationPhase: 0.42,
  },
  {
    id: "gesture-touch-face",
    label: "Touch Face",
    url: "./assets/rocketbox-female-adult-01.fbx",
    animationUrl: "./assets/rocketbox-anim-touch-face.fbx",
    credit: "Microsoft Rocketbox Female Adult 01 with f_idle_touch_face_01, MIT",
    format: "fbx",
    pose: "none",
    targetHeight: 1.0,
    modelRotationY: 0,
    baseRotationY: -0.28,
    animationTimeScale: 0.3,
    animationPhase: 0.48,
  },
  {
    id: "gesture-scratch-head",
    label: "Scratch Head",
    url: "./assets/rocketbox-male-adult-01.fbx",
    animationUrl: "./assets/rocketbox-anim-scratch-head.fbx",
    credit: "Microsoft Rocketbox Male Adult 01 with f_idle_scratch_head_01, MIT",
    format: "fbx",
    pose: "none",
    targetHeight: 1.0,
    modelRotationY: 0,
    baseRotationY: -0.28,
    animationTimeScale: 0.3,
    animationPhase: 0.46,
  },
  {
    id: "gesture-look-around",
    label: "Look Around",
    url: "./assets/rocketbox-female-adult-01.fbx",
    animationUrl: "./assets/rocketbox-anim-look-around.fbx",
    credit: "Microsoft Rocketbox Female Adult 01 with f_idle_look_around_02, MIT",
    format: "fbx",
    pose: "none",
    targetHeight: 1.0,
    modelRotationY: 0,
    baseRotationY: -0.28,
    animationTimeScale: 0.28,
    animationPhase: 0.34,
  },
  {
    id: "gesture-listen-relaxed",
    label: "Listen Relaxed",
    url: "./assets/rocketbox-business-male-01.fbx",
    animationUrl: "./assets/rocketbox-anim-listen-relaxed.fbx",
    credit: "Microsoft Rocketbox Business Male 01 with f_gestic_listen_relaxed_01, MIT",
    format: "fbx",
    pose: "none",
    targetHeight: 1.0,
    modelRotationY: 0,
    baseRotationY: -0.28,
    animationTimeScale: 0.32,
    animationPhase: 0.38,
  },
  {
    id: "gesture-self-assured",
    label: "Self Assured",
    url: "./assets/rocketbox-business-female.fbx",
    animationUrl: "./assets/rocketbox-anim-self-assured.fbx",
    credit: "Microsoft Rocketbox Business Female 01 with f_gestic_listen_self-assured_01, MIT",
    format: "fbx",
    pose: "none",
    targetHeight: 1.0,
    modelRotationY: 0,
    baseRotationY: -0.28,
    animationTimeScale: 0.3,
    animationPhase: 0.42,
  },
  {
    id: "gesture-shrug",
    label: "Shrug",
    url: "./assets/rocketbox-male-adult-01.fbx",
    animationUrl: "./assets/rocketbox-anim-shrug.fbx",
    credit: "Microsoft Rocketbox Male Adult 01 with f_gestic_shrug_01, MIT",
    format: "fbx",
    pose: "none",
    targetHeight: 1.0,
    modelRotationY: 0,
    baseRotationY: -0.28,
    animationTimeScale: 0.34,
    animationPhase: 0.5,
  },
  {
    id: "gesture-presentation",
    label: "Presentation",
    url: "./assets/rocketbox-business-female.fbx",
    animationUrl: "./assets/rocketbox-anim-presentation.fbx",
    credit: "Microsoft Rocketbox Business Female 01 with f_gestic_presentation_right_01, MIT",
    format: "fbx",
    pose: "none",
    targetHeight: 1.0,
    modelRotationY: 0,
    baseRotationY: -0.28,
    animationTimeScale: 0.34,
    animationPhase: 0.44,
  },
];

function randomViewerModelId() {
  return VIEWER_MODELS[Math.floor(Math.random() * VIEWER_MODELS.length)]?.id || VIEWER_MODELS[0].id;
}

let activeViewerModelId = randomViewerModelId();
let viewerLoadToken = 0;
const isMobileViewport = window.matchMedia("(max-width: 760px)").matches;
const renderPixelRatio = Math.min(window.devicePixelRatio || 1, isMobileViewport ? 1.25 : 1.5);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(renderPixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.52;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02090d);
scene.fog = new THREE.FogExp2(0x02090d, 0.038);

const camera = new THREE.PerspectiveCamera(47, window.innerWidth / window.innerHeight, 0.05, 80);
const composer = new EffectComposer(renderer);
composer.setPixelRatio?.(Math.min(renderPixelRatio, isMobileViewport ? 1 : 1.25));
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.08, 0.86, 0.5);
composer.addPass(bloomPass);

const roomGroup = new THREE.Group();
const artGroup = new THREE.Group();
scene.add(roomGroup, artGroup);

const activeX = -2.08;
const surfaceZ = -5.55;
const surfaceY = 1.92;
const surfaceSize = 3.62;
const minDisplayAspect = 0.52;
const maxDisplayAspect = 2.18;
const activeMaxWidth = surfaceSize * 1.48;
const activeMaxHeight = surfaceSize;
const previewSurfaceSize = 1.62;
const previewBackSize = 1.85;
const previewMaxWidth = 2.42;
const previewMaxHeight = 1.75;
const viewerX = activeX + 0.4;
const viewerZ = -3.86;

const fallbackTexture = makeFallbackTexture();

const reliefVertex = `
  uniform sampler2D uMap;
  uniform vec4 uCrop;
  uniform float uImageAspect;
  uniform float uPlaneAspect;
  uniform float uTime;
  uniform float uRelief;
  uniform float uMotion;
  varying vec2 vUv;
  varying vec2 vSampleUv;
  varying float vLum;
  varying float vHeight;

  vec2 coverUv(vec2 uv) {
    vec2 p = uv;
    if (uImageAspect > uPlaneAspect) {
      float scale = uPlaneAspect / uImageAspect;
      p.x = (p.x - 0.5) * scale + 0.5;
    } else {
      float scale = uImageAspect / uPlaneAspect;
      p.y = (p.y - 0.5) * scale + 0.5;
    }
    return uCrop.xy + clamp(p, vec2(0.0), vec2(1.0)) * uCrop.zw;
  }

  void main() {
    vUv = uv;
    vSampleUv = coverUv(uv);
    vec3 texel = texture2D(uMap, vSampleUv).rgb;
    vLum = dot(texel, vec3(0.299, 0.587, 0.114));

    float flow = sin(uv.x * 15.0 + sin(uv.y * 8.0 + uTime * 0.24) * 2.4);
    flow += sin(uv.y * 18.0 + sin(uv.x * 11.0 - uTime * 0.2) * 1.7);
    float ridges = sin(vLum * 21.0 + flow + uTime * 0.36) * 0.018;
    float drift = sin(uv.x * 7.0 + uTime * 0.18) * sin(uv.y * 9.0 - uTime * 0.14) * 0.018 * uMotion;
    float basin = smoothstep(0.05, 0.92, vLum) * 0.48 - 0.12;
    vHeight = (basin + ridges + drift) * uRelief;

    vec3 transformed = position;
    transformed.z += vHeight;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

const reliefFragment = `
  uniform sampler2D uMap;
  uniform float uTime;
  uniform float uActive;
  uniform float uMotion;
  varying vec2 vUv;
  varying vec2 vSampleUv;
  varying float vLum;
  varying float vHeight;

  vec3 boostColor(vec3 color, float amount) {
    float lum = dot(color, vec3(0.299, 0.587, 0.114));
    return clamp(mix(vec3(lum), color, amount), vec3(0.0), vec3(1.35));
  }

  void main() {
    vec3 source = texture2D(uMap, vSampleUv).rgb;
    float relief = smoothstep(0.04, 0.86, vLum);
    float edge = smoothstep(0.39, 0.5, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)));
    float stripes = 0.98 + 0.02 * sin((vUv.y + uTime * 0.012) * 760.0);
    float flow = 0.5 + 0.5 * sin(vUv.x * 19.0 + vUv.y * 11.0 + uTime * 0.62);
    float ridge = smoothstep(0.015, 0.42, abs(vHeight));
    float contour = 0.5 + 0.5 * sin(vLum * 38.0 + flow * 5.0 + uTime * 0.28);
    float heightLight = clamp(0.66 + vHeight * 0.42 + flow * 0.055, 0.16, 1.16);
    float specular = pow(smoothstep(0.54, 1.0, relief) * contour, 2.35);
    float scan = smoothstep(0.06, 0.0, abs(vUv.x - (0.48 + sin(uTime * 0.18) * 0.18))) * relief * uMotion;

    vec3 chroma = boostColor(source, 1.55);
    vec3 reliefColor = chroma * (0.56 + relief * 0.62);
    vec3 porcelain = mix(vec3(0.36, 0.43, 0.45), vec3(0.9, 0.98, 0.96), relief);
    vec3 color = mix(porcelain, reliefColor, 0.72);
    color = mix(color, source * (0.88 + relief * 0.38), 0.34);
    color *= heightLight;
    color *= stripes;
    color += mix(chroma, vec3(0.96, 1.0, 0.98), 0.44) * pow(relief, 3.0) * (0.04 + uActive * 0.08);
    color += mix(chroma, vec3(0.62, 0.82, 0.82), 0.52) * ridge * (0.035 + uActive * 0.06);
    color += vec3(0.86, 0.98, 0.96) * edge * 0.025;
    color += vec3(0.86, 0.96, 0.96) * specular * 0.22;
    color += mix(chroma, vec3(0.8, 0.96, 0.95), 0.42) * scan * 0.06;
    color *= 0.94;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const auraFragment = `
  uniform float uTime;
  uniform float uIntensity;
  varying vec2 vUv;

  void main() {
    vec2 p = vUv - 0.5;
    float d = length(p);
    float pulse = 0.8 + 0.2 * sin(uTime * 1.15);
    float alpha = smoothstep(0.74, 0.0, d) * uIntensity * pulse;
    gl_FragColor = vec4(vec3(0.6, 0.88, 0.9), alpha);
  }
`;

const ghostFragment = `
  uniform sampler2D uMap;
  uniform vec4 uCrop;
  uniform float uImageAspect;
  uniform float uPlaneAspect;
  uniform float uTime;
  varying vec2 vUv;

  vec2 coverUv(vec2 uv) {
    vec2 p = uv;
    if (uImageAspect > uPlaneAspect) {
      float scale = uPlaneAspect / uImageAspect;
      p.x = (p.x - 0.5) * scale + 0.5;
    } else {
      float scale = uImageAspect / uPlaneAspect;
      p.y = (p.y - 0.5) * scale + 0.5;
    }
    return uCrop.xy + clamp(p, vec2(0.0), vec2(1.0)) * uCrop.zw;
  }

  void main() {
    vec3 source = texture2D(uMap, coverUv(vUv)).rgb;
    float lum = dot(source, vec3(0.299, 0.587, 0.114));
    float stripe = 0.9 + 0.1 * sin((vUv.y + uTime * 0.025) * 620.0);
    vec3 chroma = clamp(mix(vec3(lum), source, 1.4), vec3(0.0), vec3(1.2));
    vec3 color = mix(chroma * 0.34, chroma * 1.12 + vec3(0.04, 0.08, 0.075), smoothstep(0.08, 0.86, lum)) * stripe;
    gl_FragColor = vec4(color, 0.68);
  }
`;

const floorFragment = `
  uniform sampler2D uMap;
  uniform vec4 uCrop;
  uniform float uImageAspect;
  uniform float uPlaneAspect;
  uniform float uTime;
  uniform float uIntensity;
  varying vec2 vUv;

  vec2 coverUv(vec2 uv) {
    vec2 p = uv;
    if (uImageAspect > uPlaneAspect) {
      float scale = uPlaneAspect / uImageAspect;
      p.x = (p.x - 0.5) * scale + 0.5;
    } else {
      float scale = uImageAspect / uPlaneAspect;
      p.y = (p.y - 0.5) * scale + 0.5;
    }
    return uCrop.xy + clamp(p, vec2(0.0), vec2(1.0)) * uCrop.zw;
  }

  void main() {
    vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
    vec2 stretched = vec2((uv.x - 0.5) * 0.64 + 0.5, uv.y * 0.46 + 0.28);
    vec3 blurred = texture2D(uMap, coverUv(stretched)).rgb * 0.28;
    blurred += texture2D(uMap, coverUv(stretched + vec2(-0.09, -0.1))).rgb * 0.16;
    blurred += texture2D(uMap, coverUv(stretched + vec2(0.09, -0.1))).rgb * 0.16;
    blurred += texture2D(uMap, coverUv(stretched + vec2(-0.14, 0.08))).rgb * 0.12;
    blurred += texture2D(uMap, coverUv(stretched + vec2(0.14, 0.08))).rgb * 0.12;
    blurred += texture2D(uMap, coverUv(stretched + vec2(0.0, 0.18))).rgb * 0.16;

    float lum = dot(blurred, vec3(0.299, 0.587, 0.114));
    float emission = smoothstep(0.18, 0.86, lum);
    float center = 1.0 - smoothstep(0.0, 0.44, abs(vUv.x - 0.5));
    float sideFalloff = smoothstep(0.02, 0.2, vUv.x) * smoothstep(0.98, 0.8, vUv.x);
    float lengthFalloff = smoothstep(0.02, 0.18, vUv.y) * smoothstep(1.0, 0.18, vUv.y);
    float reflectedShape = pow(center, 1.85) * sideFalloff * lengthFalloff;
    float wetSheen = pow(center, 6.2) * smoothstep(0.0, 0.35, vUv.y) * smoothstep(0.98, 0.26, vUv.y);
    float floorRipple = 0.98 + 0.02 * sin(vUv.y * 34.0 + uTime * 0.2 + sin(vUv.x * 9.0) * 1.2);

    vec3 reflectedColor = clamp(mix(vec3(lum), blurred, 1.45), vec3(0.0), vec3(1.2));
    vec3 lightColor = mix(reflectedColor * 0.42, reflectedColor * 1.12 + vec3(0.06, 0.1, 0.095), emission);
    vec3 color = lightColor * reflectedShape * floorRipple * 0.62;
    color += mix(reflectedColor, vec3(0.72, 0.94, 0.92), 0.38) * wetSheen * 0.34;
    color += reflectedColor * 0.12 * reflectedShape;

    float alpha = (0.05 + emission * 0.2) * reflectedShape + wetSheen * 0.18;
    gl_FragColor = vec4(color, alpha * uIntensity);
  }
`;

const viewerReflectionFragment = `
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    vec2 p = vUv - 0.5;
    p.x *= 1.8;
    p.y = p.y * 0.54 + 0.07;
    float core = 1.0 - smoothstep(0.0, 0.7, length(p));
    float falloff = smoothstep(0.04, 0.18, vUv.y) * (1.0 - smoothstep(0.74, 1.0, vUv.y));
    float surface = 0.82 + 0.18 * sin(vUv.y * 46.0 + uTime * 0.26);
    gl_FragColor = vec4(0.0, 0.0, 0.0, core * falloff * surface * 0.55);
  }
`;

const vertex = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const shots = [
  {
    name: "Wide Hold",
    duration: 9200,
    from: new THREE.Vector3(0.2, 1.4, 2.88),
    cp1: new THREE.Vector3(0.12, 1.42, 2.84),
    cp2: new THREE.Vector3(-0.06, 1.43, 2.68),
    to: new THREE.Vector3(-0.22, 1.45, 2.54),
    targetFrom: new THREE.Vector3(activeX + 3.12, 2.16, surfaceZ),
    targetTo: new THREE.Vector3(activeX + 2.72, 2.08, surfaceZ + 0.02),
    fovFrom: 48,
    fovTo: 46,
    drift: 0.42,
    roll: 0.0018,
    showCopy: true,
  },
  {
    name: "Slow Lateral",
    duration: 8400,
    from: new THREE.Vector3(-0.86, 1.54, 2.18),
    cp1: new THREE.Vector3(-1.02, 1.56, 2.1),
    cp2: new THREE.Vector3(-1.18, 1.58, 1.86),
    to: new THREE.Vector3(-1.32, 1.58, 1.62),
    targetFrom: new THREE.Vector3(activeX + 1.88, 2.02, surfaceZ + 0.04),
    targetTo: new THREE.Vector3(activeX + 1.18, 1.98, surfaceZ + 0.08),
    fovFrom: 43,
    fovTo: 42,
    drift: 0.72,
    roll: 0.0028,
    showCopy: false,
  },
  {
    name: "Viewer Scale",
    duration: 8600,
    from: new THREE.Vector3(0.12, 0.98, 1.34),
    cp1: new THREE.Vector3(-0.08, 0.94, 1.28),
    cp2: new THREE.Vector3(-0.32, 0.9, 1.16),
    to: new THREE.Vector3(-0.5, 0.9, 1.08),
    targetFrom: new THREE.Vector3(activeX + 0.72, 1.82, surfaceZ + 0.02),
    targetTo: new THREE.Vector3(activeX + 0.2, 1.76, surfaceZ + 0.02),
    fovFrom: 43,
    fovTo: 40,
    drift: 0.64,
    roll: 0.0032,
    showCopy: false,
  },
  {
    name: "Shoulder Drift",
    duration: 7800,
    from: new THREE.Vector3(-1.06, 1.18, -1.64),
    cp1: new THREE.Vector3(-1.18, 1.18, -1.92),
    cp2: new THREE.Vector3(-1.48, 1.2, -2.2),
    to: new THREE.Vector3(-1.7, 1.22, -2.42),
    targetFrom: new THREE.Vector3(activeX + 0.36, 1.94, surfaceZ + 0.1),
    targetTo: new THREE.Vector3(activeX + 0.04, 2.02, surfaceZ + 0.1),
    fovFrom: 41,
    fovTo: 39,
    drift: 0.48,
    roll: 0.0025,
    showCopy: false,
  },
  {
    name: "Gallery Reveal",
    duration: 8400,
    from: new THREE.Vector3(0.94, 1.72, 2.9),
    cp1: new THREE.Vector3(0.52, 1.78, 2.76),
    cp2: new THREE.Vector3(0.08, 1.66, 2.64),
    to: new THREE.Vector3(-0.34, 1.52, 2.52),
    targetFrom: new THREE.Vector3(activeX + 3.08, 2.08, surfaceZ),
    targetTo: new THREE.Vector3(activeX + 2.32, 2.02, surfaceZ + 0.02),
    fovFrom: 47,
    fovTo: 44,
    drift: 0.72,
    roll: 0.0022,
    showCopy: false,
  },
  {
    name: "Wide Reset",
    duration: 7200,
    from: new THREE.Vector3(1.18, 1.56, 3.08),
    cp1: new THREE.Vector3(0.86, 1.5, 3.02),
    cp2: new THREE.Vector3(0.38, 1.44, 2.94),
    to: new THREE.Vector3(0.2, 1.4, 2.88),
    targetFrom: new THREE.Vector3(activeX + 3.22, 2.12, surfaceZ),
    targetTo: new THREE.Vector3(activeX + 3.12, 2.16, surfaceZ),
    fovFrom: 47,
    fovTo: 48,
    drift: 0.5,
    roll: 0.0018,
    showCopy: true,
  },
];

const cameraPathPoint = new THREE.Vector3();
const cameraFocusPoint = new THREE.Vector3();
const pointerCamera = {
  target: new THREE.Vector2(),
  current: new THREE.Vector2(),
  strength: 0,
  lastMovedAt: 0,
  insideScene: false,
};

function resolutionOption() {
  return RESOLUTION_OPTIONS[state.resolution] || RESOLUTION_OPTIONS.ultra;
}

function activeReliefSegments() {
  const option = resolutionOption();
  return isMobileViewport ? option.mobileSegments : option.segments;
}

function makeActiveSurfaceGeometry() {
  const segments = activeReliefSegments();
  return new THREE.PlaneGeometry(surfaceSize, surfaceSize, segments, segments);
}

const activeMaterial = makeReliefMaterial(1);
const activeSurface = new THREE.Mesh(makeActiveSurfaceGeometry(), activeMaterial);
activeSurface.position.set(activeX, surfaceY, surfaceZ + 0.04);
activeSurface.castShadow = true;
activeSurface.receiveShadow = true;
activeSurface.renderOrder = 3;

const slabCore = new THREE.Mesh(
  new THREE.BoxGeometry(surfaceSize * 1.22, surfaceSize * 1.25, 0.42, 8, 8, 1),
  new THREE.MeshPhysicalMaterial({
    color: 0x26373b,
    roughness: 0.64,
    metalness: 0.02,
    emissive: 0x081a1e,
    emissiveIntensity: 0.1,
    transparent: true,
    opacity: 0.62,
    transmission: 0.05,
  })
);
slabCore.position.set(activeX, surfaceY, surfaceZ - 0.38);
slabCore.castShadow = true;
slabCore.receiveShadow = true;
slabCore.renderOrder = 1;

const edgeFrame = createSlabEdgeFrame();
edgeFrame.position.set(activeX, surfaceY, surfaceZ + 0.12);
edgeFrame.visible = false;

const aura = new THREE.Mesh(new THREE.PlaneGeometry(surfaceSize * 1.7, surfaceSize * 1.55), makeAuraMaterial(0.12));
aura.position.set(activeX, surfaceY, surfaceZ - 0.07);

const reflection = new THREE.Mesh(new THREE.PlaneGeometry(surfaceSize * 1.18, surfaceSize * 2.08), makeFloorMaterial());
reflection.rotation.x = -Math.PI / 2;
reflection.position.set(activeX, 0.052, -3.56);

const floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(surfaceSize * 1.72, surfaceSize * 0.46), makeAuraMaterial(0.055));
floorGlow.rotation.x = -Math.PI / 2;
floorGlow.position.set(activeX, 0.058, -3.18);

const mist = createMistField();
mist.position.set(activeX, surfaceY, surfaceZ + 0.22);

const leftPreview = createPreviewSurface(-4.55, 1.86, -6.15, -0.12);
const rightPreview = createPreviewSurface(3.05, 1.86, -6.05, 0.12);
const farPreview = createPreviewSurface(5.75, 1.76, -6.45, 0.18);
leftPreview.group.visible = false;
rightPreview.group.visible = false;
farPreview.group.visible = false;

artGroup.add(aura, slabCore, edgeFrame, activeSurface, reflection, floorGlow, mist, leftPreview.group, rightPreview.group, farPreview.group);

let person = createViewerAnchor();
scene.add(person);

const viewerReflection = createViewerReflection();
scene.add(viewerReflection);

const activeLight = new THREE.PointLight(0xe8fffc, 0.85, 7.5, 1.65);
activeLight.position.set(activeX - 0.06, 2.12, -4.28);
scene.add(activeLight);

const rimLight = new THREE.SpotLight(0xe8fffb, 1.08, 6.2, Math.PI / 5, 0.74, 1.2);
rimLight.position.set(activeX - 0.36, 2.2, -2.35);
rimLight.target = person;
scene.add(rimLight);

const viewerFillLight = new THREE.SpotLight(0xd6d6d6, 0.68, 3.8, Math.PI / 5.6, 0.78, 1.25);
viewerFillLight.position.set(activeX + 0.72, 1.42, -2.72);
viewerFillLight.target = person;
scene.add(viewerFillLight);
setupViewerSelect();
loadViewerModel();

scene.add(new THREE.HemisphereLight(0x8aa9a6, 0x010507, 0.24));
const keyLight = new THREE.DirectionalLight(0xd9fbf8, 0.82);
keyLight.position.set(-3.6, 5.6, 2.1);
keyLight.castShadow = true;
scene.add(keyLight);

buildRoom();

function reportRuntimeError(error) {
  const message = error?.message || String(error);
  console.error(error);
  shotLabel.textContent = "Scene Error";
  artLabel.textContent = "Gallery failed to load";
  artLabel.dataset.error = message;
}

window.addEventListener("error", (event) => {
  reportRuntimeError(event.error || event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  reportRuntimeError(event.reason || "Unhandled promise rejection");
});

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleFromPath(value) {
  const clean = String(value || "").split("?")[0].split("#")[0];
  const file = clean.slice(clean.lastIndexOf("/") + 1);
  return decodeURIComponent(file.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ")).trim();
}

function resolveAsset(value, baseUrl) {
  if (!value) return "";
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return value;
  }
}

function normalizeCrop(rawCrop) {
  if (Array.isArray(rawCrop) && rawCrop.length === 4) {
    return rawCrop.map((value) => Number(value));
  }
  if (rawCrop && typeof rawCrop === "object") {
    return [rawCrop.x, rawCrop.y, rawCrop.w, rawCrop.h].map((value) => Number(value));
  }
  return [0, 0, 1, 1];
}

function normalizeImage(raw, baseUrl, index) {
  const data = typeof raw === "string" ? { src: raw } : { ...raw };
  const src = resolveAsset(data.src || data.url, baseUrl);
  const thumb = resolveAsset(data.thumb || data.thumbnail || src, baseUrl);
  const title = data.title || titleFromPath(src) || `Image ${index + 1}`;

  return {
    id: data.id || slugify(title) || `image-${index + 1}`,
    title,
    author: data.author || "Image",
    description: data.description || "",
    src,
    thumb,
    crop: normalizeCrop(data.crop),
    date: data.date || "",
    order: Number.isFinite(data.order) ? data.order : index,
    texture: fallbackTexture,
    aspect: Number.isFinite(Number(data.aspect)) && Number(data.aspect) > 0 ? Number(data.aspect) : 16 / 9,
  };
}

function uniqueImages(items) {
  const seen = new Map();
  for (const item of items) {
    const key = item.id || item.src;
    if (!seen.has(key)) seen.set(key, item);
  }
  return [...seen.values()];
}

async function loadManifestImages() {
  try {
    const response = await fetch(IMAGE_MANIFEST_URL, { cache: "no-store" });
    if (!response.ok) return [];
    const manifest = await response.json();
    const entries = Array.isArray(manifest) ? manifest : manifest.images || manifest.gallery || [];
    return entries.map((item, index) => normalizeImage(item, response.url, index));
  } catch {
    return [];
  }
}

function loadQueryImages() {
  const params = new URLSearchParams(window.location.search);
  const singles = params.getAll("image");
  const packed = (params.get("images") || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return [...singles, ...packed].map((src, index) =>
    normalizeImage({ src, author: "URL" }, window.location.href, index)
  );
}

function configureTexture(texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  texture.needsUpdate = true;
  return texture;
}

function textureMaxSize() {
  return Math.min(resolutionOption().maxTextureSize, renderer.capabilities.maxTextureSize || 4096);
}

function drawBitmapToCanvas(bitmap, maxSize = textureMaxSize()) {
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function makeThumbDataUrl(canvas) {
  const thumb = document.createElement("canvas");
  thumb.width = 208;
  thumb.height = 116;
  const context = thumb.getContext("2d");
  const scale = Math.max(thumb.width / canvas.width, thumb.height / canvas.height);
  const width = canvas.width * scale;
  const height = canvas.height * scale;
  context.drawImage(canvas, (thumb.width - width) * 0.5, (thumb.height - height) * 0.5, width, height);
  return thumb.toDataURL("image/jpeg", 0.82);
}

async function loadCanvasTexture(src, maxSize = textureMaxSize()) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(src, { cache: "force-cache", signal: controller.signal });
    if (!response.ok) throw new Error(`Image request failed: ${response.status}`);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = drawBitmapToCanvas(bitmap, maxSize);
    bitmap.close?.();
    return {
      texture: configureTexture(new THREE.CanvasTexture(canvas)),
      aspect: canvas.width / canvas.height,
      thumbData: makeThumbDataUrl(canvas),
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function makeFallbackTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");

  const image = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const nx = x / canvas.width - 0.5;
      const ny = y / canvas.height - 0.5;
      const warpX = nx + Math.sin(ny * 18.0) * 0.09 + Math.sin((nx + ny) * 9.0) * 0.04;
      const warpY = ny + Math.sin(nx * 16.0) * 0.09 + Math.cos((nx - ny) * 11.0) * 0.04;
      const rings = Math.sin((warpX * warpX + warpY * warpY) * 58.0 + Math.sin(warpX * 24.0) * 2.2);
      const veins = Math.sin(warpX * 34.0 + Math.cos(warpY * 20.0) * 4.0);
      const ridges = Math.sin((warpX + warpY) * 42.0 + rings * 3.2);
      const value = Math.max(0, Math.min(255, 150 + rings * 42 + veins * 28 + ridges * 34));
      const index = (y * canvas.width + x) * 4;
      image.data[index] = value * 0.9;
      image.data[index + 1] = value;
      image.data[index + 2] = Math.min(255, value * 1.05);
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);

  return configureTexture(new THREE.CanvasTexture(canvas));
}

async function loadTexture(item, textureVersion = state.textureVersion) {
  const maxSize = textureMaxSize();
  try {
    const loaded = await loadCanvasTexture(item.src, maxSize);
    if (textureVersion !== state.textureVersion) {
      loaded.texture.dispose();
      return item;
    }
    const previousTexture = item.texture;
    item.texture = loaded.texture;
    item.aspect = loaded.aspect;
    item.thumbData = loaded.thumbData;
    item.textureMaxSize = maxSize;
    item.loaded = true;
    if (previousTexture && previousTexture !== fallbackTexture && previousTexture !== item.texture) {
      previousTexture.dispose();
    }
  } catch {
    if (textureVersion !== state.textureVersion) return item;
    const previousTexture = item.texture;
    item.texture = fallbackTexture;
    item.aspect = 16 / 9;
    item.textureMaxSize = maxSize;
    item.loaded = false;
    if (previousTexture && previousTexture !== fallbackTexture) previousTexture.dispose();
  }
  return item;
}

function boundedCrop(rawCrop) {
  const crop = normalizeCrop(rawCrop);
  const width = THREE.MathUtils.clamp(Number.isFinite(crop[2]) ? crop[2] : 1, 0.05, 1);
  const height = THREE.MathUtils.clamp(Number.isFinite(crop[3]) ? crop[3] : 1, 0.05, 1);
  const x = THREE.MathUtils.clamp(Number.isFinite(crop[0]) ? crop[0] : 0, 0, 1 - width);
  const y = THREE.MathUtils.clamp(Number.isFinite(crop[1]) ? crop[1] : 0, 0, 1 - height);
  return [x, y, width, height];
}

function displayCropForItem(item) {
  if (!item || state.displayMode === "full") return [0, 0, 1, 1];
  return boundedCrop(item.crop);
}

function cropAspect(item) {
  const crop = displayCropForItem(item);
  const aspect = Number.isFinite(item?.aspect) && item.aspect > 0 ? item.aspect : 16 / 9;
  const cropWidth = Number.isFinite(crop[2]) && crop[2] > 0 ? crop[2] : 1;
  const cropHeight = Number.isFinite(crop[3]) && crop[3] > 0 ? crop[3] : 1;
  return aspect * cropWidth / cropHeight;
}

function displayDimensionsForItem(item, maxWidth, maxHeight) {
  const aspect = THREE.MathUtils.clamp(cropAspect(item), minDisplayAspect, maxDisplayAspect);
  let width = maxHeight * aspect;
  let height = maxHeight;
  if (width > maxWidth) {
    width = maxWidth;
    height = maxWidth / aspect;
  }
  return { width, height, aspect: width / height };
}

function setObjectBaseScale(object, x, y, z = 1) {
  if (!object.userData.baseScale) object.userData.baseScale = new THREE.Vector3(1, 1, 1);
  object.userData.baseScale.set(x, y, z);
  object.scale.copy(object.userData.baseScale);
}

function pulseObjectScale(object, pulse) {
  const base = object.userData.baseScale || { x: 1, y: 1, z: 1 };
  object.scale.set(base.x * pulse, base.y * pulse, base.z * pulse);
}

function applyActiveArtworkLayout(item) {
  const dimensions = displayDimensionsForItem(item, activeMaxWidth, activeMaxHeight);
  const surfaceScaleX = dimensions.width / surfaceSize;
  const surfaceScaleY = dimensions.height / surfaceSize;

  setObjectBaseScale(activeSurface, surfaceScaleX, surfaceScaleY);
  setObjectBaseScale(slabCore, surfaceScaleX, surfaceScaleY);
  setObjectBaseScale(edgeFrame, surfaceScaleX, surfaceScaleY);
  setObjectBaseScale(aura, surfaceScaleX, surfaceScaleY);
  setObjectBaseScale(reflection, surfaceScaleX, Math.max(surfaceScaleY, 0.74));
  setObjectBaseScale(floorGlow, Math.max(surfaceScaleX, 0.74), 1);
  setObjectBaseScale(mist, Math.max(surfaceScaleX, 0.82), Math.max(surfaceScaleY, 0.82));
  return dimensions;
}

function applyPreviewLayout(preview, item) {
  const dimensions = displayDimensionsForItem(item, previewMaxWidth, previewMaxHeight);
  preview.surface.scale.set(dimensions.width / previewSurfaceSize, dimensions.height / previewSurfaceSize, 1);
  preview.back.scale.set(dimensions.width / previewBackSize, dimensions.height / previewBackSize, 1);
  preview.material.uniforms.uPlaneAspect.value = dimensions.aspect;
  return dimensions;
}

function applyItemToMaterial(material, item, planeAspect = cropAspect(item)) {
  material.uniforms.uMap.value = item?.texture || fallbackTexture;
  material.uniforms.uCrop.value.set(...displayCropForItem(item));
  material.uniforms.uImageAspect.value = cropAspect(item);
  if (material.uniforms.uPlaneAspect) material.uniforms.uPlaneAspect.value = planeAspect;
}

function makeReliefMaterial(active = 1) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: fallbackTexture },
      uCrop: { value: new THREE.Vector4(0, 0, 1, 1) },
      uImageAspect: { value: 1 },
      uPlaneAspect: { value: 1 },
      uTime: { value: 0 },
      uActive: { value: active },
      uRelief: { value: active ? 0.44 : 0.18 },
      uMotion: { value: active ? 1 : 0.24 },
    },
    vertexShader: reliefVertex,
    fragmentShader: reliefFragment,
    side: THREE.DoubleSide,
  });
}

function makeAuraMaterial(intensity) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: intensity },
    },
    vertexShader: vertex,
    fragmentShader: auraFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

function makeGhostMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: fallbackTexture },
      uCrop: { value: new THREE.Vector4(0, 0, 1, 1) },
      uImageAspect: { value: 1 },
      uPlaneAspect: { value: 1 },
      uTime: { value: 0 },
    },
    vertexShader: vertex,
    fragmentShader: ghostFragment,
    transparent: true,
    depthWrite: false,
  });
}

function makeFloorMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: fallbackTexture },
      uCrop: { value: new THREE.Vector4(0, 0, 1, 1) },
      uImageAspect: { value: 1 },
      uPlaneAspect: { value: 0.62 },
      uTime: { value: 0 },
      uIntensity: { value: 0.78 },
    },
    vertexShader: vertex,
    fragmentShader: floorFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

function createSlabEdgeFrame() {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    color: 0xaafff7,
    transparent: true,
    opacity: 0.64,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const long = new THREE.BoxGeometry(surfaceSize * 1.02, 0.035, 0.085);
  const tall = new THREE.BoxGeometry(0.035, surfaceSize * 1.02, 0.085);
  const top = new THREE.Mesh(long, material);
  const bottom = new THREE.Mesh(long, material.clone());
  const left = new THREE.Mesh(tall, material.clone());
  const right = new THREE.Mesh(tall, material.clone());
  top.position.y = surfaceSize * 0.505;
  bottom.position.y = -surfaceSize * 0.505;
  left.position.x = -surfaceSize * 0.505;
  right.position.x = surfaceSize * 0.505;
  bottom.material.opacity = 0.42;
  left.material.opacity = 0.5;
  right.material.opacity = 0.5;
  group.add(top, bottom, left, right);

  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) {
      const corner = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 10), material.clone());
      corner.position.set(x * surfaceSize * 0.505, y * surfaceSize * 0.505, 0.02);
      corner.material.opacity = 0.78;
      group.add(corner);
    }
  }
  group.children.forEach((child) => {
    child.userData.baseOpacity = child.material.opacity;
  });
  group.renderOrder = 4;
  return group;
}

function seededRandom(index) {
  const value = Math.sin(index * 91.97) * 43758.5453;
  return value - Math.floor(value);
}

function createMistField() {
  const count = 190;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (seededRandom(i + 1) - 0.5) * 4.5;
    positions[i * 3 + 1] = (seededRandom(i + 8) - 0.5) * 4.0;
    positions[i * 3 + 2] = (seededRandom(i + 19) - 0.5) * 1.05;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xa9fff4,
    size: 0.02,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geometry, material);
}

function createViewerReflection() {
  const reflectionMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: vertex,
    fragmentShader: viewerReflectionFragment,
    transparent: true,
    depthWrite: false,
  });
  const reflectionMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 2.15), reflectionMaterial);
  reflectionMesh.rotation.x = -Math.PI / 2;
  reflectionMesh.position.set(viewerX, 0.052, viewerZ + 0.86);
  reflectionMesh.renderOrder = 2;
  return reflectionMesh;
}

function createPreviewSurface(x, y, z, rotationY) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = rotationY;

  const back = new THREE.Mesh(
    new THREE.BoxGeometry(1.85, 1.85, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x030b0e, roughness: 0.52, metalness: 0.28 })
  );
  back.position.z = -0.08;

  const surface = new THREE.Mesh(new THREE.PlaneGeometry(1.62, 1.62, 70, 70), makeGhostMaterial());
  surface.position.z = 0.02;
  group.add(back, surface);
  return { group, back, surface, material: surface.material };
}

function buildRoom() {
  const floorMat = new THREE.MeshPhysicalMaterial({
    color: 0x010607,
    roughness: 0.04,
    metalness: 0.9,
    clearcoat: 1.0,
    clearcoatRoughness: 0.055,
    reflectivity: 0.9,
  });
  const wallMatA = new THREE.MeshStandardMaterial({ color: 0x061014, roughness: 0.76, metalness: 0.06 });
  const wallMatB = new THREE.MeshStandardMaterial({ color: 0x020b10, roughness: 0.9, metalness: 0.03 });
  const trimMat = new THREE.MeshBasicMaterial({ color: 0x0f2428 });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 16), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, -2.5);
  floor.receiveShadow = true;
  roomGroup.add(floor);

  const mirrorBase = Math.min(window.innerWidth, window.innerHeight) * renderer.getPixelRatio();
  const mirrorSize = Math.min(isMobileViewport ? 384 : 768, Math.max(isMobileViewport ? 256 : 512, Math.round(mirrorBase * 0.72)));
  const mirrorFloor = new Reflector(new THREE.PlaneGeometry(18, 16), {
    clipBias: 0.006,
    textureWidth: mirrorSize,
    textureHeight: mirrorSize,
    color: 0x253234,
  });
  mirrorFloor.rotation.x = -Math.PI / 2;
  mirrorFloor.position.set(0, 0.012, -2.5);
  mirrorFloor.renderOrder = 0;
  const renderMirror = mirrorFloor.onBeforeRender.bind(mirrorFloor);
  const mirrorUpdateEvery = isMobileViewport ? 4 : 3;
  let mirrorFrame = mirrorUpdateEvery - 1;
  mirrorFloor.onBeforeRender = (rendererInstance, renderScene, renderCamera) => {
    mirrorFrame = (mirrorFrame + 1) % mirrorUpdateEvery;
    if (mirrorFrame !== 0) return;
    renderMirror(rendererInstance, renderScene, renderCamera);
  };
  roomGroup.add(mirrorFloor);

  const backWall = new THREE.Group();
  for (let i = 0; i < 14; i += 1) {
    const x = (i - 6.5) * 1.25;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.24, 5.0, 0.08), i % 2 ? wallMatA : wallMatB);
    panel.position.set(x, 2.5, -6.38 - Math.abs(x) * 0.02);
    panel.receiveShadow = true;
    backWall.add(panel);
  }
  roomGroup.add(backWall);

  const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(16, 5), wallMatB);
  leftWall.rotation.y = Math.PI / 2;
  leftWall.position.set(-7.4, 2.5, -2.6);
  roomGroup.add(leftWall);

  const rightWall = leftWall.clone();
  rightWall.rotation.y = -Math.PI / 2;
  rightWall.position.x = 7.4;
  roomGroup.add(rightWall);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(18, 16), wallMatB);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 5, -2.5);
  roomGroup.add(ceiling);

  for (const y of [4.18, 0.18]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.018, 0.025), trimMat);
    bar.position.set(activeX, y, -5.76);
    roomGroup.add(bar);
  }

  for (let i = -3; i <= 3; i += 1) {
    const shaft = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 4.25), makeAuraMaterial(0.018));
    shaft.position.set(activeX + i * 0.42, 2.28, -5.57);
    roomGroup.add(shaft);
  }
}

function createViewerAnchor() {
  const group = new THREE.Group();
  group.position.set(viewerX, 0, viewerZ);
  group.userData.baseRotationY = getViewerModelOption().baseRotationY;
  return group;
}

function setupViewerSelect() {
  if (!viewerSelect) return;
  viewerSelect.replaceChildren(
    ...VIEWER_MODELS.map((option) => {
      const item = document.createElement("option");
      item.value = option.id;
      item.textContent = option.label;
      return item;
    })
  );
  viewerSelect.value = activeViewerModelId;
  viewerSelect.addEventListener("change", () => {
    activeViewerModelId = viewerSelect.value;
    loadViewerModel(activeViewerModelId);
  });
}

function getViewerModelOption(modelId = activeViewerModelId) {
  return VIEWER_MODELS.find((option) => option.id === modelId) || VIEWER_MODELS[0];
}

function loadViewerModel(modelId = activeViewerModelId) {
  const option = getViewerModelOption(modelId);
  const loadToken = ++viewerLoadToken;
  viewerSelect?.setAttribute("aria-busy", "true");

  loadViewerModelAsset(option)
    .then((asset) => {
      if (loadToken !== viewerLoadToken) return;
      const model = createModelViewer(asset, option);
      const previousPerson = person;
      scene.add(model);
      person = model;
      rimLight.target = person;
      viewerFillLight.target = person;
      scene.remove(previousPerson);
      disposeViewerModel(previousPerson);
      viewerSelect?.removeAttribute("aria-busy");
    })
    .catch((error) => {
      if (loadToken !== viewerLoadToken) return;
      viewerSelect?.removeAttribute("aria-busy");
      console.warn(`Could not load viewer model from ${option.url}`, error);
    });
}

function loadGltf(url) {
  return new Promise((resolve, reject) => {
    gltfLoader.load(url, resolve, undefined, reject);
  });
}

function loadFbx(url) {
  return new Promise((resolve, reject) => {
    fbxLoader.load(url, resolve, undefined, reject);
  });
}

async function loadViewerModelAsset(option) {
  const model = option.format === "fbx" ? await loadFbx(option.url) : (await loadGltf(option.url)).scene;
  const animationSource = option.animationUrl ? await loadFbx(option.animationUrl) : null;
  return {
    model,
    animations: animationSource?.animations || model.animations || [],
  };
}

function createModelViewer(asset, option) {
  const holder = new THREE.Group();
  holder.name = "Gallery viewer";
  holder.userData.baseRotationY = option.baseRotationY;
  holder.userData.credit = option.credit;
  holder.userData.modelId = option.id;

  const model = asset.model;
  model.name = "Human viewer";
  model.rotation.y = option.modelRotationY;
  model.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.frustumCulled = false;
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => makeViewerModelMaterial(material))
      : makeViewerModelMaterial(object.material);
  });

  normalizeViewerModel(model, option.targetHeight);
  configureHumanThinkingPose(model, holder, option.pose);
  holder.userData.animationRoot = model;
  attachSourcedGestureAnimation(holder, model, asset.animations, option);
  holder.add(model);
  holder.add(createViewerContactShadow());
  holder.position.set(viewerX, 0, viewerZ);
  holder.rotation.x = -0.012;
  return holder;
}

function makeViewerModelMaterial(material) {
  const nextMaterial = new THREE.MeshStandardMaterial({
    color: 0x151515,
    roughness: 0.76,
    metalness: 0.02,
    emissive: 0x050505,
    emissiveIntensity: 0.06,
  });
  nextMaterial.side = THREE.FrontSide;
  return nextMaterial;
}

function disposeViewerModel(root) {
  if (!root) return;
  root.userData.mixer?.stopAllAction();
  if (root.userData.mixer && root.userData.animationRoot) {
    root.userData.mixer.uncacheRoot(root.userData.animationRoot);
  }
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => material?.dispose?.());
  });
}

function attachSourcedGestureAnimation(holder, model, animations, option) {
  const clip = animations?.[0];
  if (!clip) return;
  const mixer = new THREE.AnimationMixer(model);
  const action = mixer.clipAction(clip);
  action.reset();
  action.setLoop(THREE.LoopRepeat, Infinity);
  action.setEffectiveTimeScale(option.animationTimeScale ?? 0.64);
  action.play();
  if (Number.isFinite(option.animationPhase)) {
    action.time = clip.duration * THREE.MathUtils.clamp(option.animationPhase, 0, 1);
  }
  holder.userData.mixer = mixer;
  holder.userData.action = action;
  holder.userData.animationClipName = clip.name;
}

function findViewerBone(root, name) {
  const exact = root.getObjectByName(name);
  if (exact) return exact;
  const normalizedName = name.replace(/[\s_.:]/g, "").toLowerCase();
  let match = null;
  root.traverse((object) => {
    const normalizedObjectName = object.name.replace(/[\s_.:]/g, "").toLowerCase();
    if (!match && (object.name === name || object.name.endsWith(name) || normalizedObjectName === normalizedName)) {
      match = object;
    }
  });
  return match;
}

function applyBoneAxisPose(root, pose, name, axis, angle) {
  const bone = findViewerBone(root, name);
  if (!bone) return;
  bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...axis), angle));
  pose[name] = { bone, base: bone.quaternion.clone() };
}

function configureHumanThinkingPose(root, holder, poseType) {
  const pose = {};
  if (poseType === "godot") {
    configureGodotThinkingPose(root, pose);
  }
  holder.userData.pose = Object.keys(pose).length ? pose : null;
}

function configureGodotThinkingPose(root, pose) {
  applyBoneAxisPose(root, pose, "spine.001", [1, 0, 0], 0.035);
  applyBoneAxisPose(root, pose, "spine.002", [1, 0, 0], 0.035);
  applyBoneAxisPose(root, pose, "spine.003", [1, 0, 0], 0.035);
  applyBoneAxisPose(root, pose, "spine.004", [1, 0, 0], 0.08);
  applyBoneAxisPose(root, pose, "spine.005", [1, 0, 0], 0.1);

  applyBoneAxisPose(root, pose, "upper_arm.L", [1, 0, 0], 0.06);
  applyBoneAxisPose(root, pose, "forearm.L", [1, 0, 0], 0.04);
  applyBoneAxisPose(root, pose, "hand.L", [0, 0, 1], -0.08);

  applyBoneAxisPose(root, pose, "shoulder.R", [1, 0, 0], -0.16);
  applyBoneAxisPose(root, pose, "upper_arm.R", [0, 0, 1], -1.3);
  applyBoneAxisPose(root, pose, "upper_arm.R", [1, 0, 0], -0.16);
  applyBoneAxisPose(root, pose, "forearm.R", [1, 0, 0], -2.8);
  applyBoneAxisPose(root, pose, "hand.R", [0, 0, 1], 0.34);
  applyBoneAxisPose(root, pose, "hand.R", [1, 0, 0], -0.12);
}

function animateHumanThinkingPose(holder, elapsed) {
  const pose = holder.userData.pose;
  if (!pose) return;
  const breath = Math.sin(elapsed * 0.72);
  const thought = Math.sin(elapsed * 0.34 + 0.8);
  const headDrift = Math.sin(elapsed * 0.2 + 1.7);
  const apply = (entry, axis, angle) => {
    if (!entry) return;
    entry.bone.quaternion.copy(entry.base);
    entry.bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...axis), angle));
  };

  apply(pose["spine.002"], [1, 0, 0], breath * 0.012);
  apply(pose["spine.004"], [1, 0, 0], breath * 0.01);
  apply(pose["spine.005"], [0, 1, 0], headDrift * 0.018);
  apply(pose["forearm.R"], [1, 0, 0], thought * 0.018);
  apply(pose["hand.R"], [0, 0, 1], thought * 0.014);
}

function normalizeViewerModel(model, targetHeight) {
  model.updateMatrixWorld(true);
  const initialBox = new THREE.Box3().setFromObject(model);
  const initialSize = initialBox.getSize(new THREE.Vector3());
  const scale = targetHeight / Math.max(initialSize.y, 0.001);
  model.scale.multiplyScalar(scale);
  model.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(model);
  const center = scaledBox.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= scaledBox.min.y;
}

function createViewerContactShadow() {
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 54),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.08, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  shadow.scale.set(0.58, 0.95, 1);
  shadow.castShadow = false;
  return shadow;
}

function galleryItems() {
  return state.items;
}

function normalizeGalleryIndex(index, itemCount = galleryItems().length) {
  if (!itemCount) return 0;
  return ((index % itemCount) + itemCount) % itemCount;
}

function clampCurrentGalleryIndex(items = galleryItems()) {
  state.currentIndex = normalizeGalleryIndex(state.currentIndex, items.length);
  return state.currentIndex;
}

function activeItem() {
  const items = galleryItems();
  if (!items.length) return null;
  return items[clampCurrentGalleryIndex(items)] || null;
}

function itemAt(offset) {
  const items = galleryItems();
  if (!items.length) return null;
  const activeIndex = clampCurrentGalleryIndex(items);
  return items[normalizeGalleryIndex(activeIndex + offset, items.length)];
}

function updateMaterials() {
  const active = activeItem();
  if (!active) return;

  artLabel.textContent = active.title;
  if (copyTitle) copyTitle.textContent = active.title || "Untitled";
  if (copyDescription) copyDescription.textContent = formatCopyDescription(active.description);
  if (copyAuthor) copyAuthor.textContent = active.author || "Unknown";
  const activeDimensions = applyActiveArtworkLayout(active);
  applyItemToMaterial(activeMaterial, active, activeDimensions.aspect);
  applyItemToMaterial(reflection.material, active, activeDimensions.aspect);

  const leftItem = itemAt(-1);
  const rightItem = itemAt(1);
  const farItem = itemAt(2);
  applyItemToMaterial(leftPreview.material, leftItem, applyPreviewLayout(leftPreview, leftItem).aspect);
  applyItemToMaterial(rightPreview.material, rightItem, applyPreviewLayout(rightPreview, rightItem).aspect);
  applyItemToMaterial(farPreview.material, farItem, applyPreviewLayout(farPreview, farItem).aspect);
  updateCropControls();

  const activeIndex = normalizeGalleryIndex(state.currentIndex);
  filmStrip.querySelectorAll(".imageThumb").forEach((button, index) => {
    button.classList.toggle("isActive", index === activeIndex);
  });
}

function formatCopyDescription(description) {
  const text = description || "An image transformed into a luminous relief surface";
  if (window.innerWidth <= 760 && text === "A domain distortion noise technique invented by") {
    return "A domain distortion noise\ntechnique invented by";
  }
  return text;
}

function updateShotChrome() {
  const shot = shots[state.shotIndex];
  copyPanel?.classList.toggle("isMuted", shot?.showCopy === false);
}

function setSettingsOpen(open) {
  state.settingsOpen = open;
  app.classList.toggle("isSettingsOpen", open);
  app.classList.toggle("isGalleryOpen", open);
  settingsBtn?.setAttribute("aria-expanded", String(open));
  settingsPanel?.setAttribute("aria-hidden", String(!open));
  if (settingsPanel) settingsPanel.inert = !open;
  if (open) {
    setPointerActive(true);
    window.clearTimeout(pointerIdleTimer);
  } else {
    markPointerActive();
  }
}

function setPointerActive(active) {
  app.classList.toggle("isPointerActive", active);
  if (!active && state.settingsOpen) return;
}

function markPointerActive() {
  setPointerActive(true);
  window.clearTimeout(pointerIdleTimer);
  if (state.settingsOpen) return;
  pointerIdleTimer = window.setTimeout(() => setPointerActive(false), 1800);
}

function updatePointerCamera(event) {
  markPointerActive();

  if (event.target.closest("button, input, select, .hudControls, .filmStrip, .siteHeader")) {
    pointerCamera.insideScene = false;
    return;
  }

  const rect = app.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const x = THREE.MathUtils.clamp(((event.clientX - rect.left) / rect.width - 0.5) * 2, -1, 1);
  const y = THREE.MathUtils.clamp((0.5 - (event.clientY - rect.top) / rect.height) * 2, -1, 1);
  pointerCamera.target.set(x, y);
  pointerCamera.insideScene = true;
  pointerCamera.lastMovedAt = performance.now();
}

function fadePointerCamera() {
  pointerCamera.insideScene = false;
  pointerCamera.target.set(0, 0);
}

function updateDisplayControl() {
  if (displaySelect) displaySelect.value = state.displayMode;
  settingsPanel?.classList.toggle("isFullDisplay", state.displayMode === "full");
}

function updateResolutionControl() {
  if (resolutionSelect) resolutionSelect.value = state.resolution;
}

function updateCropControls() {
  const active = activeItem();
  const crop = boundedCrop(active?.crop);
  const disabled = !active || state.displayMode === "full";
  const hidden = state.displayMode === "full";

  updateDisplayControl();
  Object.entries(cropInputs).forEach(([key, input], index) => {
    if (!input) return;
    input.value = String(crop[index]);
    input.disabled = disabled;
    input.setAttribute("aria-disabled", String(disabled));
  });
  cropControls?.setAttribute("aria-disabled", String(disabled));
  cropControls?.setAttribute("aria-hidden", String(hidden));
}

function updateActiveCropFromControls() {
  const active = activeItem();
  if (!active) return;

  state.displayMode = "crop";
  active.crop = boundedCrop([cropInputs.x?.value, cropInputs.y?.value, cropInputs.w?.value, cropInputs.h?.value]);
  updateDisplayControl();
  updateMaterials();
}

function updateCameraControl() {
  if (!cameraSelect) return;
  cameraSelect.value = state.cinematic ? "on" : "off";
}

function updateReliefResolution() {
  const previousGeometry = activeSurface.geometry;
  activeSurface.geometry = makeActiveSurfaceGeometry();
  previousGeometry.dispose();
}

function cutTo(nextShotIndex, nextArtIndex = state.currentIndex) {
  const items = galleryItems();
  if (!items.length || state.cutting) return;
  const currentIndex = clampCurrentGalleryIndex(items);
  const scopedNextIndex = normalizeGalleryIndex(nextArtIndex, items.length);
  const changesArtwork = scopedNextIndex !== currentIndex;
  const cutStartedAt = performance.now();
  state.cutting = changesArtwork;
  state.cutFlashUntil = changesArtwork ? 0 : cutStartedAt + 95;
  fadeLayer.classList.remove("isCutFlash");
  fadeLayer.classList.toggle("isVisible", changesArtwork);
  state.shotIndex = nextShotIndex;
  state.currentIndex = scopedNextIndex;
  state.shotStartedAt = cutStartedAt;
  shotLabel.textContent = shots[state.shotIndex].name;
  updateShotChrome();
  updateMaterials();
  if (!changesArtwork) {
    fadeLayer.classList.remove("isVisible");
    fadeLayer.classList.add("isCutFlash");
  }
}

function stepArtwork(delta) {
  const items = galleryItems();
  if (!items.length) return;
  const nextIndex = normalizeGalleryIndex(state.currentIndex + delta, items.length);
  cutTo(0, nextIndex);
}

function renderFilmStrip() {
  filmStrip.replaceChildren();
  const addButton = document.createElement("button");
  addButton.className = "thumb addThumb";
  addButton.type = "button";
  addButton.title = "Add images";
  addButton.setAttribute("aria-label", "Add images");
  addButton.textContent = "+";
  addButton.addEventListener("click", () => imageInput?.click());
  filmStrip.append(addButton);

  galleryItems().forEach((item, index) => {
    const button = document.createElement("button");
    button.className = "thumb imageThumb";
    button.type = "button";
    button.title = item.title;

    const image = document.createElement("img");
    image.src = item.thumbData || item.thumb || item.src;
    image.alt = item.title;
    image.loading = "eager";
    image.decoding = "async";

    button.append(image);
    button.addEventListener("click", () => cutTo(0, index));
    filmStrip.append(button);
  });
  updateMaterials();
}

function hydrateImages(items) {
  const textureVersion = state.textureVersion;
  items.forEach((item) => {
    loadTexture(item, textureVersion).then(() => {
      if (textureVersion !== state.textureVersion) return;
      updateMaterials();
      renderFilmStrip();
    });
  });
}

function addImages(items) {
  const incoming = uniqueImages(items);
  if (!incoming.length) return;

  const firstIncomingIndex = state.items.length;
  state.items = uniqueImages([...state.items, ...incoming]);
  state.currentIndex = Math.min(firstIncomingIndex, state.items.length - 1);
  state.shotIndex = 0;
  state.shotStartedAt = performance.now();
  shotLabel.textContent = shots[state.shotIndex].name;
  updateShotChrome();
  renderFilmStrip();
  setSettingsOpen(true);
  hydrateImages(incoming);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function addFiles(files) {
  const imageFiles = [...files].filter((file) => file.type.startsWith("image/"));
  if (!imageFiles.length) return;

  const items = imageFiles.map((file, index) => {
    const objectUrl = URL.createObjectURL(file);
    localUrls.push(objectUrl);
    return normalizeImage(
      {
        id: `local-${Date.now()}-${index}`,
        title: titleFromPath(file.name) || file.name,
        author: "Local image",
        description: formatBytes(file.size),
        src: objectUrl,
        thumb: objectUrl,
        date: new Date().toISOString(),
      },
      window.location.href,
      state.items.length + index
    );
  });

  addImages(items);
}

function filmEase(progress) {
  const p = THREE.MathUtils.clamp(progress, 0, 1);
  return p * p * p * (p * (p * 6 - 15) + 10);
}

function cubicBezierVector(from, cp1, cp2, to, progress, out) {
  const inv = 1 - progress;
  const inv2 = inv * inv;
  const p2 = progress * progress;
  return out
    .copy(from)
    .multiplyScalar(inv2 * inv)
    .addScaledVector(cp1, 3 * inv2 * progress)
    .addScaledVector(cp2, 3 * inv * p2)
    .addScaledVector(to, p2 * progress);
}

function resolveShotVector(from, cp1, cp2, to, progress, out) {
  if (cp1 && cp2) return cubicBezierVector(from, cp1, cp2, to, progress, out);
  return out.lerpVectors(from, to || from, progress);
}

function resolveCameraPosition(shot, progress, out) {
  return resolveShotVector(shot.from, shot.cp1, shot.cp2, shot.to, progress, out);
}

function resolveCameraTarget(shot, progress, out) {
  const from = shot.targetFrom || shot.target;
  const to = shot.targetTo || from;
  return resolveShotVector(from, shot.targetCp1, shot.targetCp2, to, progress, out);
}

function hasImageFiles(event) {
  return [...(event.dataTransfer?.items || [])].some((item) => item.kind === "file" && item.type.startsWith("image/"));
}

function applyPointerCameraFollow(now, dt) {
  const recentlyMoved = pointerCamera.insideScene && now - pointerCamera.lastMovedAt < 1400;
  const motionTarget = recentlyMoved ? 1 : 0;
  const followSmoothing = 1 - Math.exp(-dt * 6.2);
  const strengthSmoothing = 1 - Math.exp(-dt * 4.4);
  pointerCamera.current.lerp(pointerCamera.target, followSmoothing);
  pointerCamera.strength += (motionTarget - pointerCamera.strength) * strengthSmoothing;

  const x = pointerCamera.current.x * pointerCamera.strength;
  const y = pointerCamera.current.y * pointerCamera.strength;
  camera.position.x += x * 0.055;
  camera.position.y += y * 0.032;
  camera.position.z += Math.abs(x) * 0.012;
  cameraFocusPoint.x += x * 0.085;
  cameraFocusPoint.y += y * 0.045;
}

function animateCamera(now, dt) {
  const shot = shots[state.shotIndex];
  const elapsed = now - state.shotStartedAt;
  const progress = Math.min(elapsed / shot.duration, 1);
  const eased = filmEase(progress);
  const movementEnvelope = Math.sin(progress * Math.PI);
  const drift = shot.drift ?? 1;
  const shotPhase = state.shotIndex * 1.913;

  resolveCameraPosition(shot, eased, cameraPathPoint);
  resolveCameraTarget(shot, eased, cameraFocusPoint);
  camera.position.copy(cameraPathPoint);

  cameraFocusPoint.x +=
    (Math.sin(elapsed * 0.00062 + shotPhase) * 0.035 + Math.sin(elapsed * 0.00117 + 1.8) * 0.014) *
    drift *
    movementEnvelope;
  cameraFocusPoint.y += Math.cos(elapsed * 0.00074 + shotPhase * 0.7) * 0.024 * drift * movementEnvelope;
  camera.position.x += Math.sin(elapsed * 0.00051 + shotPhase + 0.9) * 0.018 * drift * movementEnvelope;
  camera.position.y += Math.sin(elapsed * 0.00083 + shotPhase * 0.4) * 0.014 * drift * movementEnvelope;
  camera.position.z += Math.cos(elapsed * 0.00046 + shotPhase) * 0.02 * drift * movementEnvelope;
  applyPointerCameraFollow(now, dt);
  camera.fov = THREE.MathUtils.lerp(shot.fovFrom ?? camera.fov, shot.fovTo ?? shot.fovFrom ?? camera.fov, eased);
  camera.updateProjectionMatrix();
  camera.lookAt(cameraFocusPoint);
  camera.rotateZ(Math.sin(elapsed * 0.00058 + shotPhase) * (shot.roll ?? 0.002) * movementEnvelope);

  if (state.cinematic && progress >= 1 && !state.cutting) {
    const items = galleryItems();
    const nextShot = (state.shotIndex + 1) % shots.length;
    const nextArt = nextShot === 0 ? normalizeGalleryIndex(state.currentIndex + 1, items.length) : state.currentIndex;
    cutTo(nextShot, nextArt);
  }
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.033);
  const elapsed = clock.elapsedTime;
  const now = performance.now();
  if (state.cutting && now - state.shotStartedAt > 220) {
    fadeLayer.classList.remove("isVisible");
    state.cutting = false;
  }
  if (state.cutFlashUntil && now >= state.cutFlashUntil) {
    fadeLayer.classList.remove("isCutFlash");
    state.cutFlashUntil = 0;
  }
  const cinematicEnergy = state.cinematic ? 1 : 0.35;
  const reliefPulse = 1 + Math.sin(elapsed * 0.42) * 0.06 * cinematicEnergy;

  activeMaterial.uniforms.uTime.value = elapsed;
  activeMaterial.uniforms.uRelief.value = 0.44 * reliefPulse;
  activeMaterial.uniforms.uMotion.value = cinematicEnergy;
  aura.material.uniforms.uTime.value = elapsed;
  aura.material.uniforms.uIntensity.value = 0.11 + Math.sin(elapsed * 0.64) * 0.018 * cinematicEnergy;
  reflection.material.uniforms.uTime.value = elapsed;
  reflection.material.uniforms.uIntensity.value = 0.7 + Math.sin(elapsed * 0.48) * 0.045 * cinematicEnergy;
  viewerReflection.material.uniforms.uTime.value = elapsed;
  viewerReflection.position.z = viewerZ + 0.86 + Math.sin(elapsed * 1.25) * 0.012;
  floorGlow.material.uniforms.uTime.value = elapsed;
  floorGlow.material.uniforms.uIntensity.value = 0.045 + Math.sin(elapsed * 0.5) * 0.01 * cinematicEnergy;
  leftPreview.material.uniforms.uTime.value = elapsed;
  rightPreview.material.uniforms.uTime.value = elapsed;
  farPreview.material.uniforms.uTime.value = elapsed;

  person.position.z = viewerZ + Math.sin(elapsed * 1.25) * 0.012;
  person.rotation.y = (person.userData.baseRotationY || 0) + Math.sin(elapsed * 0.6) * 0.018;
  if (person.userData.head) {
    person.userData.head.rotation.x = 0.08 + Math.sin(elapsed * 0.48) * 0.018;
  }
  if (person.userData.shoulders) {
    person.userData.shoulders.rotation.z = Math.sin(elapsed * 0.52) * 0.006;
  }
  if (person.userData.upperCoat && person.userData.lowerCoat) {
    const breath = Math.sin(elapsed * 0.7) * 0.006;
    person.userData.upperCoat.scale.x = 1.0 + breath;
    person.userData.lowerCoat.scale.x = 1.0 + breath * 0.65;
  }
  person.userData.mixer?.update(dt);
  animateHumanThinkingPose(person, elapsed);
  activeSurface.position.z = surfaceZ + 0.04 + Math.sin(elapsed * 0.55) * 0.018 * cinematicEnergy;
  activeSurface.rotation.z = Math.sin(elapsed * 0.19) * 0.004 * cinematicEnergy;
  pulseObjectScale(activeSurface, 1 + Math.sin(elapsed * 0.72) * 0.006 * cinematicEnergy);
  pulseObjectScale(edgeFrame, 1 + Math.sin(elapsed * 0.72) * 0.004);
  edgeFrame.children.forEach((child, index) => {
    child.material.opacity = child.userData.baseOpacity * (0.82 + Math.sin(elapsed * 1.4 + index) * 0.12);
  });
  slabCore.material.opacity = 0.52 + Math.sin(elapsed * 0.9) * 0.035 * cinematicEnergy;
  mist.rotation.z = elapsed * 0.012;
  mist.material.opacity = 0.18 + Math.sin(elapsed * 0.75) * 0.05 * cinematicEnergy;
  activeLight.position.x = activeX - 0.06 + Math.sin(elapsed * 0.37) * 0.16 * cinematicEnergy;
  activeLight.position.y = 2.12 + Math.cos(elapsed * 0.31) * 0.08 * cinematicEnergy;
  activeLight.intensity = 0.85 + Math.sin(elapsed * 1.4) * 0.11 * cinematicEnergy;
  bloomPass.strength = 0.065 + Math.sin(elapsed * 0.9) * 0.015 * cinematicEnergy;

  if (state.cinematic) animateCamera(now, dt);
  composer.render(dt);
}

settingsBtn?.addEventListener("click", (event) => {
  event.stopPropagation();
  markPointerActive();
  setSettingsOpen(!state.settingsOpen);
});

settingsPanel?.addEventListener("click", (event) => {
  event.stopPropagation();
});

cameraSelect?.addEventListener("change", () => {
  state.cinematic = cameraSelect.value === "on";
  updateCameraControl();
  state.shotStartedAt = performance.now();
});

displaySelect?.addEventListener("change", () => {
  state.displayMode = displaySelect.value === "full" ? "full" : "crop";
  updateMaterials();
});

resolutionSelect?.addEventListener("change", () => {
  const nextResolution = resolutionSelect.value;
  if (!RESOLUTION_OPTIONS[nextResolution] || nextResolution === state.resolution) return;
  state.resolution = nextResolution;
  state.textureVersion += 1;
  updateResolutionControl();
  updateReliefResolution();
  hydrateImages(galleryItems());
});

Object.values(cropInputs).forEach((input) => {
  input?.addEventListener("input", updateActiveCropFromControls);
});

imageInput?.addEventListener("change", (event) => {
  addFiles(event.target.files);
  imageInput.value = "";
});

document.addEventListener("click", (event) => {
  if (!state.settingsOpen || event.target.closest(".hudControls, .filmStrip")) return;
  setSettingsOpen(false);
});

app.addEventListener("pointermove", updatePointerCamera);
app.addEventListener("pointerleave", () => {
  window.clearTimeout(pointerIdleTimer);
  setPointerActive(false);
  fadePointerCamera();
});

window.addEventListener("dragover", (event) => {
  if (!hasImageFiles(event)) return;
  event.preventDefault();
  document.body.classList.add("isDragging");
});

window.addEventListener("dragleave", (event) => {
  if (event.clientX <= 0 || event.clientY <= 0 || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight) {
    document.body.classList.remove("isDragging");
  }
});

window.addEventListener("drop", (event) => {
  if (!hasImageFiles(event)) return;
  event.preventDefault();
  document.body.classList.remove("isDragging");
  addFiles(event.dataTransfer.files);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") stepArtwork(-1);
  if (event.key === "ArrowRight") stepArtwork(1);
  if (event.key.toLowerCase() === "c") {
    state.cinematic = !state.cinematic;
    updateCameraControl();
    state.shotStartedAt = performance.now();
  }
  if (event.key.toLowerCase() === "g") {
    markPointerActive();
    settingsBtn?.click();
  }
  if (event.key === "Escape") setSettingsOpen(false);
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener("beforeunload", () => {
  localUrls.forEach((url) => URL.revokeObjectURL(url));
});

async function init() {
  const manifestImages = await loadManifestImages();
  const fallbackImages = DEFAULT_IMAGES.map((item, index) => normalizeImage(item, import.meta.url, index));
  const queryImages = loadQueryImages();
  state.items = uniqueImages([...manifestImages, ...fallbackImages, ...queryImages]);
  state.currentIndex = normalizeGalleryIndex(0);
  shotLabel.textContent = shots[state.shotIndex].name;
  updateShotChrome();
  updateCameraControl();
  updateResolutionControl();
  setSettingsOpen(false);
  renderFilmStrip();
  camera.fov = shots[state.shotIndex].fovFrom || camera.fov;
  camera.updateProjectionMatrix();
  camera.position.copy(shots[state.shotIndex].from);
  resolveCameraTarget(shots[state.shotIndex], 0, cameraFocusPoint);
  camera.lookAt(cameraFocusPoint);
  renderer.setAnimationLoop(animate);
  hydrateImages(state.items);
}

init().catch(reportRuntimeError);
