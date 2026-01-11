/* CineShader Lite (Vanilla)
 * - WebGL2 Shadertoy-style fragment runner
 * - Optional cinematic post FX
 * - Shadertoy API loader (needs your API key)
 */

const $ = (sel) => document.querySelector(sel);

const canvas = $("#gl");
const ui = {
  shaderId: $("#shaderId"),
  apiKey: $("#apiKey"),
  btnLoad: $("#btnLoad"),
  btnCompile: $("#btnCompile"),
  btnPlay: $("#btnPlay"),
  btnShot: $("#btnShot"),
  cinematic: $("#cinematic"),
  quality: $("#quality"),
  code: $("#code"),
  errors: $("#errors"),
  statusLeft: $("#statusLeft"),
  fps: $("#fps"),
  res: $("#res"),
  slot: $("#slot"),
  btnSaveSlot: $("#btnSaveSlot"),
  btnLoadSlot: $("#btnLoadSlot"),
  btnReset: $("#btnReset"),
};

const DEFAULT_CODE = `
// Minimal Shadertoy-style example.
// Try changing colors, shapes, or add noise.

float sdCircle(vec2 p, float r){
  return length(p) - r;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

  float t = iTime;
  vec2 p = uv;

  // animated circle
  float d = sdCircle(p + 0.25 * vec2(cos(t), sin(t*0.9)), 0.35);
  float edge = smoothstep(0.01, 0.0, d);

  // background gradient
  vec3 bg = mix(vec3(0.02,0.03,0.05), vec3(0.10,0.06,0.12), uv.y*0.5+0.5);
  vec3 col = bg + edge * vec3(0.3, 0.9, 1.2);

  fragColor = vec4(col, 1.0);
}
`.trim();

function nowSec(){ return performance.now() * 0.001; }

function setStatus(msg){ ui.statusLeft.textContent = msg; }
function showError(text){
  ui.errors.textContent = text;
  ui.errors.classList.remove("hidden");
}
function clearError(){
  ui.errors.textContent = "";
  ui.errors.classList.add("hidden");
}

function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }

class ShaderRunner {
  constructor(canvas){
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl2", {
      antialias: true,
      alpha: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
    });

    if (!this.gl) throw new Error("WebGL2 not supported in this browser.");

    this.program = null;
    this.uniforms = {};
    this.startTime = nowSec();
    this.lastTime = nowSec();
    this.frame = 0;
    this.playing = true;

    this.mouse = { x: 0, y: 0, down: false, clickX: 0, clickY: 0 };
    this.cinematic = true;
    this.quality = 1.0;

    this._initGL();
    this._initEvents();
    this.resize();
  }

  _initGL(){
    const gl = this.gl;

    // Fullscreen triangle: gl_VertexID trick (no VBO).
    const vs = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  // 3 vertices: (0,0), (2,0), (0,2) in clip-space mapping
  vec2 p = vec2((gl_VertexID << 1) & 2, (gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`.trim();

    this.baseVS = vs;

    // Compile default program
    this.compile(DEFAULT_CODE, true);
  }

  _initEvents(){
    const c = this.canvas;

    const toLocal = (e) => {
      const rect = c.getBoundingClientRect();
      const x = (e.clientX - rect.left);
      const y = (e.clientY - rect.top);
      return { x, y, rect };
    };

    const onMove = (e) => {
      const p = toLocal(e);
      // Shadertoy iMouse expects origin bottom-left
      this.mouse.x = p.x;
      this.mouse.y = (p.rect.height - p.y);
    };

    c.addEventListener("mousemove", onMove);
    c.addEventListener("mousedown", (e) => {
      const p = toLocal(e);
      this.mouse.down = true;
      this.mouse.clickX = p.x;
      this.mouse.clickY = (p.rect.height - p.y);
      onMove(e);
    });
    window.addEventListener("mouseup", () => {
      this.mouse.down = false;
    });

    // Touch
    c.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const t = e.touches[0];
      const p = toLocal(t);
      this.mouse.down = true;
      this.mouse.clickX = p.x;
      this.mouse.clickY = (p.rect.height - p.y);
      this.mouse.x = p.x;
      this.mouse.y = p.rect.height - (t.clientY - p.rect.top);
    }, { passive: false });

    c.addEventListener("touchmove", (e) => {
      e.preventDefault();
      const t = e.touches[0];
      const rect = c.getBoundingClientRect();
      this.mouse.x = (t.clientX - rect.left);
      this.mouse.y = rect.height - (t.clientY - rect.top);
    }, { passive: false });

    window.addEventListener("touchend", () => { this.mouse.down = false; });

    window.addEventListener("resize", () => this.resize());
  }

  setQuality(q){
    this.quality = q;
    this.resize();
  }

  setCinematic(on){
    this.cinematic = !!on;
  }

  resize(){
    const dpr = window.devicePixelRatio || 1;
    const q = this.quality || 1;
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr * q));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr * q));
    if (this.canvas.width !== w || this.canvas.height !== h){
      this.canvas.width = w;
      this.canvas.height = h;
      this.gl.viewport(0, 0, w, h);
    }
  }

  _wrapFragment(userCode, cinematic){
    // Shadertoy-like wrapper with cinematic post FX
    // Note: no textures / buffers.
    return `#version 300 es
precision highp float;

out vec4 outColor;

uniform vec3 iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform int iFrame;
uniform vec4 iMouse;
uniform vec4 iDate;

float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 acesTonemap(vec3 x){
  // Simple ACES approximation
  float a = 2.51;
  float b = 0.03;
  float c = 2.43;
  float d = 0.59;
  float e = 0.14;
  return clamp((x*(a*x+b)) / (x*(c*x+d)+e), 0.0, 1.0);
}

vec3 filmGrain(vec2 uv, float t){
  float n = hash12(uv*vec2(1200.0, 700.0) + fract(t)*10.0);
  n = n*2.0 - 1.0;
  return vec3(n);
}

// --- User code begins ---
${userCode}
// --- User code ends ---

void main(){
  vec2 fragCoord = gl_FragCoord.xy;

  vec4 col = vec4(0.0);
  mainImage(col, fragCoord);

  vec3 rgb = col.rgb;

  ${cinematic ? `
  // Cinematic treatment
  vec2 uv = fragCoord / iResolution.xy;

  // mild exposure + tonemap
  rgb *= 1.15;
  rgb = acesTonemap(rgb);

  // vignette
  vec2 p = uv * (1.0 - uv);
  float vig = pow(16.0 * p.x * p.y, 0.22);
  rgb *= mix(0.78, 1.02, vig);

  // subtle grain
  rgb += 0.03 * filmGrain(uv, iTime);

  // letterbox (bars)
  float bar = 0.11; // size
  float top = smoothstep(0.0, 0.002, uv.y - (1.0 - bar));
  float bot = smoothstep(0.0, 0.002, (bar) - uv.y);
  float mask = 1.0 - clamp(top + bot, 0.0, 1.0);
  rgb *= mask;
  ` : ``}

  outColor = vec4(rgb, 1.0);
}
`.trim();
  }

  _compileShader(type, src){
    const gl = this.gl;
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)){
      const log = gl.getShaderInfoLog(sh) || "Unknown shader compile error";
      gl.deleteShader(sh);
      throw new Error(log);
    }
    return sh;
  }

  _linkProgram(vsSrc, fsSrc){
    const gl = this.gl;
    const vs = this._compileShader(gl.VERTEX_SHADER, vsSrc);
    const fs = this._compileShader(gl.FRAGMENT_SHADER, fsSrc);

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);

    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)){
      const log = gl.getProgramInfoLog(prog) || "Unknown program link error";
      gl.deleteProgram(prog);
      throw new Error(log);
    }
    return prog;
  }

  compile(userCode, cinematic){
    const gl = this.gl;
    const fs = this._wrapFragment(userCode, cinematic);

    const prog = this._linkProgram(this.baseVS, fs);

    if (this.program) gl.deleteProgram(this.program);
    this.program = prog;

    // Cache uniform locations
    this.uniforms = {
      iResolution: gl.getUniformLocation(prog, "iResolution"),
      iTime: gl.getUniformLocation(prog, "iTime"),
      iTimeDelta: gl.getUniformLocation(prog, "iTimeDelta"),
      iFrame: gl.getUniformLocation(prog, "iFrame"),
      iMouse: gl.getUniformLocation(prog, "iMouse"),
      iDate: gl.getUniformLocation(prog, "iDate"),
    };

    // Reset timing to feel responsive after compile
    this.startTime = nowSec();
    this.lastTime = nowSec();
    this.frame = 0;
  }

  render(){
    const gl = this.gl;
    if (!this.program) return;

    const t = nowSec();
    const time = t - this.startTime;
    const dt = t - this.lastTime;
    this.lastTime = t;

    const w = this.canvas.width;
    const h = this.canvas.height;

    // iDate: (year, month, day, seconds)
    const d = new Date();
    const seconds = d.getHours()*3600 + d.getMinutes()*60 + d.getSeconds();

    gl.useProgram(this.program);

    gl.uniform3f(this.uniforms.iResolution, w, h, 1.0);
    gl.uniform1f(this.uniforms.iTime, time);
    gl.uniform1f(this.uniforms.iTimeDelta, dt);
    gl.uniform1i(this.uniforms.iFrame, this.frame);

    // iMouse: xy = current pos, zw = click pos (if down)
    const mx = this.mouse.x;
    const my = this.mouse.y;
    const cx = this.mouse.down ? this.mouse.clickX : -Math.abs(this.mouse.clickX);
    const cy = this.mouse.down ? this.mouse.clickY : -Math.abs(this.mouse.clickY);
    gl.uniform4f(this.uniforms.iMouse, mx, my, cx, cy);

    gl.uniform4f(this.uniforms.iDate, d.getFullYear(), d.getMonth()+1, d.getDate(), seconds);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    this.frame++;
  }
}

// --- App wiring ---
let runner;
let fpsSmoothed = 0;
let lastFpsTime = performance.now();
let frameCount = 0;

function updateFps(){
  frameCount++;
  const now = performance.now();
  const dt = now - lastFpsTime;
  if (dt >= 500){
    const fps = (frameCount / dt) * 1000;
    fpsSmoothed = fpsSmoothed ? (0.85 * fpsSmoothed + 0.15 * fps) : fps;
    ui.fps.textContent = `${fpsSmoothed.toFixed(1)} fps`;
    frameCount = 0;
    lastFpsTime = now;
  }
}

function setResolutionLabel(){
  ui.res.textContent = `${canvas.width}×${canvas.height}`;
}

function parseShaderId(input){
  // Accept raw ID or full URL
  const s = (input || "").trim();
  if (!s) return "";
  const m = s.match(/shadertoy\\.com\\/view\\/([a-zA-Z0-9_]+)/);
  if (m) return m[1];
  return s;
}

async function loadFromShadertoy(shaderId, apiKey){
  // Shadertoy API: /api/v1/shaders/<id>?key=<appkey>
  // Only shaders that are Public+API will work.
  // Some responses include multiple renderpasses; we pick the "Image" pass.
  const id = parseShaderId(shaderId);
  if (!id) throw new Error("Please enter a Shadertoy shader ID.");
  if (!apiKey) throw new Error("Please enter your Shadertoy API key (app key).");

  const url = `https://www.shadertoy.com/api/v1/shaders/${encodeURIComponent(id)}?key=${encodeURIComponent(apiKey)}`;
  const r = await fetch(url, { mode: "cors" });
  if (!r.ok) throw new Error(`Shadertoy API request failed (${r.status}). The shader may not be Public+API.`);
  const json = await r.json();

  const shader = json.Shader;
  if (!shader || !shader.renderpass) throw new Error("Unexpected API response (missing Shader.renderpass).");

  // Prefer the Image pass
  const imagePass = shader.renderpass.find(p => (p.type || "").toLowerCase() === "image") || shader.renderpass[0];
  const code = (imagePass && imagePass.code) ? imagePass.code : "";

  if (!code.trim()) throw new Error("No shader code found in the selected pass.");

  // Warn if inputs are present (we don't support textures/buffers here)
  const inputs = (imagePass.inputs || []);
  const hasInputs = inputs.length > 0;
  return { code, hasInputs, title: shader.info?.name || id, description: shader.info?.description || "" };
}

function slotKey(n){ return `cineshader_lite_slot_${n}`; }

function saveSlot(n, code){
  localStorage.setItem(slotKey(n), code);
}
function loadSlot(n){
  return localStorage.getItem(slotKey(n));
}

function resetToDefault(){
  ui.code.value = DEFAULT_CODE;
  setStatus("Reset to default template.");
}

function tryCompile(){
  clearError();
  try {
    runner.setCinematic(ui.cinematic.checked);
    runner.compile(ui.code.value, ui.cinematic.checked);
    setStatus("Compiled successfully.");
  } catch (e){
    showError(String(e.message || e));
    setStatus("Compile failed.");
  }
}

function snapshot(){
  // preserveDrawingBuffer enabled, so we can use toDataURL
  const a = document.createElement("a");
  a.download = `snapshot_${Date.now()}.png`;
  a.href = canvas.toDataURL("image/png");
  a.click();
}

function animate(){
  requestAnimationFrame(animate);

  runner.resize();
  setResolutionLabel();

  if (runner.playing){
    runner.render();
    updateFps();
  }
}

function init(){
  ui.code.value = loadSlot(ui.slot.value) || DEFAULT_CODE;

  runner = new ShaderRunner(canvas);

  // Restore user prefs
  ui.apiKey.value = localStorage.getItem("cineshader_lite_api_key") || "";
  ui.cinematic.checked = (localStorage.getItem("cineshader_lite_cinematic") ?? "1") === "1";
  ui.quality.value = localStorage.getItem("cineshader_lite_quality") || "1";
  runner.setQuality(parseFloat(ui.quality.value));
  runner.setCinematic(ui.cinematic.checked);

  ui.quality.addEventListener("change", () => {
    localStorage.setItem("cineshader_lite_quality", ui.quality.value);
    runner.setQuality(parseFloat(ui.quality.value));
    setStatus(`Quality set to ${ui.quality.value}×`);
  });

  ui.cinematic.addEventListener("change", () => {
    localStorage.setItem("cineshader_lite_cinematic", ui.cinematic.checked ? "1" : "0");
    tryCompile(); // recompile wrapper to include/exclude cinematic code
  });

  ui.btnCompile.addEventListener("click", () => tryCompile());

  ui.btnPlay.addEventListener("click", () => {
    runner.playing = !runner.playing;
    ui.btnPlay.textContent = runner.playing ? "Pause" : "Play";
    setStatus(runner.playing ? "Playing." : "Paused.");
  });

  ui.btnShot.addEventListener("click", () => snapshot());

  ui.btnLoad.addEventListener("click", async () => {
    clearError();
    const id = ui.shaderId.value;
    const key = ui.apiKey.value.trim();
    localStorage.setItem("cineshader_lite_api_key", key);

    setStatus("Loading from Shadertoy...");
    try {
      const data = await loadFromShadertoy(id, key);
      ui.code.value = data.code.trim();
      setStatus(`Loaded: ${data.title}${data.hasInputs ? " (inputs not supported in lite)" : ""}`);
      tryCompile();
    } catch (e){
      showError(String(e.message || e));
      setStatus("Load failed.");
    }
  });

  ui.btnSaveSlot.addEventListener("click", () => {
    saveSlot(ui.slot.value, ui.code.value);
    setStatus(`Saved to slot ${ui.slot.value}.`);
  });

  ui.btnLoadSlot.addEventListener("click", () => {
    const code = loadSlot(ui.slot.value);
    if (!code){
      setStatus(`Slot ${ui.slot.value} is empty.`);
      return;
    }
    ui.code.value = code;
    setStatus(`Loaded slot ${ui.slot.value}.`);
    tryCompile();
  });

  ui.btnReset.addEventListener("click", () => {
    resetToDefault();
    tryCompile();
  });

  // Compile once on load
  tryCompile();

  animate();
}

try {
  init();
} catch (e){
  // If WebGL2 not available
  const msg = String(e.message || e);
  showError(msg);
  setStatus("Initialization failed.");
}
