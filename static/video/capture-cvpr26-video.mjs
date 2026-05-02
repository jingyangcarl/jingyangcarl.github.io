#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');

const width = intEnv('CVPR_VIDEO_WIDTH', 1280);
const height = intEnv('CVPR_VIDEO_HEIGHT', 720);
const fps = intEnv('CVPR_ENCODE_FPS', 24);
const playbackSeconds = numberEnv('CVPR_PLAYBACK_SECONDS', 60);
const bitrate = intEnv('CVPR_VIDEO_BITRATE', 7_000_000);
const timelineScale = numberEnv('CVPR_TIMELINE_SCALE', 1.55);
const temporalBlend = numberEnv('CVPR_TEMPORAL_BLEND', 0.02);
const outputPath = path.resolve(repoRoot, process.env.CVPR_OUTPUT_PATH || 'static/video/cvpr26-art-demo.mp4');
const chromePath = process.env.CHROME_PATH || '/home/jingya/.local/bin/google-chrome';

function intEnv(name, fallback) {
    const value = Number.parseInt(process.env[name] || '', 10);
    return Number.isFinite(value) ? value : fallback;
}

function numberEnv(name, fallback) {
    const value = Number.parseFloat(process.env[name] || '');
    return Number.isFinite(value) ? value : fallback;
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function mimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.mjs': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.wasm': 'application/wasm',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.hdr': 'application/octet-stream',
        '.exr': 'application/octet-stream',
        '.glb': 'model/gltf-binary',
        '.gltf': 'model/gltf+json',
        '.bin': 'application/octet-stream',
        '.mp4': 'video/mp4',
    }[ext] || 'application/octet-stream';
}

async function startStaticServer(root) {
    const server = createServer(async (req, res) => {
        try {
            const url = new URL(req.url || '/', 'http://127.0.0.1');
            let pathname = decodeURIComponent(url.pathname);
            if (pathname === '/') pathname = '/index.html';

            let filePath = path.resolve(root, `.${pathname}`);
            if (!(filePath === root || filePath.startsWith(`${root}${path.sep}`))) {
                res.writeHead(403);
                res.end('Forbidden');
                return;
            }

            let info = await stat(filePath);
            if (info.isDirectory()) {
                filePath = path.join(filePath, 'index.html');
                info = await stat(filePath);
            }

            res.writeHead(200, {
                'Content-Type': mimeType(filePath),
                'Content-Length': info.size,
                'Cache-Control': 'no-store',
            });
            createReadStream(filePath).pipe(res);
        } catch (err) {
            res.writeHead(404);
            res.end(String(err && err.message ? err.message : err));
        }
    });

    const preferred = intEnv('CVPR_SERVER_PORT', 0);
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(preferred, '127.0.0.1', resolve);
    });

    return {
        server,
        port: server.address().port,
        close: () => new Promise((resolve) => server.close(resolve)),
    };
}

async function waitForCdp(port, timeoutMs = 15000) {
    const start = Date.now();
    let lastError = null;
    while (Date.now() - start < timeoutMs) {
        try {
            const response = await fetch(`http://127.0.0.1:${port}/json/version`);
            if (response.ok) return response.json();
            lastError = new Error(`CDP status ${response.status}`);
        } catch (err) {
            lastError = err;
        }
        await sleep(150);
    }
    throw lastError || new Error('Timed out waiting for Chrome DevTools');
}

async function launchChrome() {
    const cdpPort = intEnv('CVPR_CDP_PORT', 9227 + Math.floor(Math.random() * 400));
    const userDataDir = path.join(tmpdir(), `cvpr26-capture-${process.pid}-${Date.now()}`);
    await mkdir(userDataDir, { recursive: true });

    const args = [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        '--enable-unsafe-swiftshader',
        '--disable-dev-shm-usage',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-frame-rate-limit',
        '--disable-features=CalculateNativeWinOcclusion',
        '--autoplay-policy=no-user-gesture-required',
        '--no-first-run',
        `--remote-debugging-address=127.0.0.1`,
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${userDataDir}`,
        'about:blank',
    ];

    const chrome = spawn(chromePath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    chrome.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
        if (stderr.length > 16000) stderr = stderr.slice(-16000);
    });

    chrome.once('exit', (code, signal) => {
        if (code !== 0 && signal !== 'SIGTERM') {
            console.error(`Chrome exited early: code=${code} signal=${signal}`);
            if (stderr.trim()) console.error(stderr.trim());
        }
    });

    await waitForCdp(cdpPort);

    return {
        cdpPort,
        chrome,
        async close() {
            chrome.kill('SIGTERM');
            await sleep(300);
            await rm(userDataDir, { recursive: true, force: true });
        },
    };
}

class CdpClient {
    constructor(wsUrl) {
        this.wsUrl = wsUrl;
        this.ws = null;
        this.nextId = 1;
        this.pending = new Map();
        this.listeners = new Map();
    }

    async connect() {
        this.ws = new WebSocket(this.wsUrl);
        await new Promise((resolve, reject) => {
            this.ws.addEventListener('open', resolve, { once: true });
            this.ws.addEventListener('error', reject, { once: true });
        });
        this.ws.addEventListener('message', (event) => this.handleMessage(event.data));
        this.ws.addEventListener('close', () => {
            for (const { reject } of this.pending.values()) reject(new Error('CDP socket closed'));
            this.pending.clear();
        });
    }

    handleMessage(data) {
        const message = JSON.parse(data);
        if (message.id && this.pending.has(message.id)) {
            const { resolve, reject, method } = this.pending.get(message.id);
            this.pending.delete(message.id);
            if (message.error) reject(new Error(`${method}: ${message.error.message || 'CDP error'} ${message.error.data || ''}`.trim()));
            else resolve(message.result || {});
            return;
        }
        const callbacks = this.listeners.get(message.method);
        if (callbacks) callbacks.forEach((callback) => callback(message.params || {}));
    }

    send(method, params = {}) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject, method });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    on(method, callback) {
        if (!this.listeners.has(method)) this.listeners.set(method, new Set());
        this.listeners.get(method).add(callback);
        return () => this.listeners.get(method).delete(callback);
    }

    waitFor(method, predicate = () => true, timeoutMs = 30000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                cleanup();
                reject(new Error(`Timed out waiting for ${method}`));
            }, timeoutMs);
            const cleanup = this.on(method, (params) => {
                if (!predicate(params)) return;
                clearTimeout(timer);
                cleanup();
                resolve(params);
            });
        });
    }

    close() {
        if (this.ws) this.ws.close();
    }
}

async function createPage(cdpPort) {
    const response = await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: 'PUT' });
    if (!response.ok) throw new Error(`Unable to create Chrome target: ${response.status}`);
    const target = await response.json();
    const client = new CdpClient(target.webSocketDebuggerUrl);
    await client.connect();
    return client;
}

async function evaluate(client, expression, options = {}) {
    let result;
    try {
        result = await client.send('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true,
            ...options,
        });
    } catch (err) {
        const snippet = expression.replace(/\s+/g, ' ').slice(0, 160);
        throw new Error(`${err.message}\nExpression: ${snippet}`);
    }
    if (result.exceptionDetails) {
        const text = result.exceptionDetails.text || 'Evaluation failed';
        const detail = result.exceptionDetails.exception?.description || '';
        throw new Error(`${text}\n${detail}`.trim());
    }
    return result.result ? result.result.value : undefined;
}

async function waitForExpression(client, expression, timeoutMs = 120000, intervalMs = 250) {
    const start = Date.now();
    let lastError = null;
    while (Date.now() - start < timeoutMs) {
        try {
            if (await evaluate(client, `Boolean(${expression})`)) return;
        } catch (err) {
            lastError = err;
        }
        await sleep(intervalMs);
    }
    throw lastError || new Error(`Timed out waiting for expression: ${expression}`);
}

async function readBrowserString(client, name, chunkSize = 1_000_000) {
    const length = await evaluate(client, `window.${name}.length`);
    const chunks = [];
    for (let start = 0; start < length; start += chunkSize) {
        const end = Math.min(length, start + chunkSize);
        chunks.push(await evaluate(client, `window.${name}.slice(${start}, ${end})`));
    }
    return chunks.join('');
}

function installTimelineExpression(scale) {
    return `(() => {
        const api = window.__cvpr26Demo;
        if (!api) throw new Error('CVPR demo API is not available');

        const timelineScale = ${JSON.stringify(scale)};
        const scaleFps = (value) => Math.max(1, Math.round(value / Math.max(1, timelineScale)));
        const log = [];
        const olatFps = scaleFps(10.5);
        let lastBeatIndex = -1;
        let lastSideIndex = -1;
        let lastOlatIdx = -1;
        let lastCameraBucket = '';

        document.body.classList.add('cvpr-video-capture');
        if (!document.getElementById('cvprVideoCaptureStyle')) {
            const style = document.createElement('style');
            style.id = 'cvprVideoCaptureStyle';
            style.textContent = '#statsPanel{display:none!important}.cvpr-video-capture .lil-gui{display:none!important}';
            document.head.appendChild(style);
        }

        function record(label, videoTime) {
            const state = api.getState ? api.getState() : {};
            log.push({
                label,
                videoTime: Number((videoTime || 0).toFixed(3)),
                time: Math.round(performance.now()),
                pattern: state.pattern,
                hdriPattern: state.hdriPattern,
                material: state.material,
                cameraIndex: state.cameraIndex,
                modelLoading: state.modelLoading,
            });
            window.__cvpr26VideoTimelineLog = log;
        }

        function run(label, videoTime, fn) {
            try {
                fn();
                record(label, videoTime);
            } catch (err) {
                log.push({
                    label,
                    videoTime: Number((videoTime || 0).toFixed(3)),
                    error: String(err && err.stack ? err.stack : err),
                    time: Math.round(performance.now()),
                });
                window.__cvpr26VideoTimelineLog = log;
            }
        }

        const hdriBase = {
            autoplay: false,
            hdriIntensity: 1.05,
            hdriLightIntensity: 1.55,
            hdriOlatLightBudget: 40,
            hdriContrast: 0.55,
            hdriVerticalRotation: 4,
        };

        function hdri(pattern, rotation, extra = {}) {
            api.setMaterial('metal');
            api.setPattern('hdri', {
                ...hdriBase,
                ...extra,
                hdriPattern: pattern,
                hdriHorizontalRotation: rotation,
            });
        }

        function setOlatFrame(idx = 12) {
            api.setMaterial('metal');
            if (typeof api.setOlatFrame === 'function') {
                api.setOlatFrame(idx, {
                    fps: olatFps,
                    olatColor: 0xffffff,
                    olatIntensity: 3.25,
                    hdriPattern: 'sunset',
                });
                return;
            }
            api.setPattern('olat', {
                autoplay: false,
                fps: olatFps,
                idx,
                olatColor: 0xffffff,
                olatIntensity: 3.25,
                hdriPattern: 'sunset',
            });
        }

        function smoothstep(edge0, edge1, value) {
            const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(0.0001, edge1 - edge0)));
            return t * t * (3 - 2 * t);
        }

        function lerp(a, b, t) {
            return a + (b - a) * t;
        }

        function setMainCameraForTime(videoTime) {
            if (typeof api.setMainCameraPose !== 'function') return;
            function cinematicPose(t) {
                const u = smoothstep(28.0, 48.0, t);
                const orbit = Math.max(0, Math.min(1, (t - 28.0) / 20.0));
                const theta = -0.08 + orbit * Math.PI * 1.34 + Math.sin(orbit * Math.PI * 2.0) * 0.06;
                const phi = lerp(1.48, 1.08, smoothstep(0.08, 0.92, u)) + Math.sin(orbit * Math.PI * 2.5) * 0.08;
                const radius = lerp(2.5, 1.14, u);
                const target = [
                    Math.sin(orbit * Math.PI * 1.4) * 0.035,
                    Math.sin(orbit * Math.PI) * 0.055,
                    0,
                ];
                return {
                    target,
                    position: [
                    target[0] + radius * Math.sin(phi) * Math.sin(theta),
                    target[1] + radius * Math.cos(phi),
                    target[2] + radius * Math.sin(phi) * Math.cos(theta),
                    ],
                    fov: lerp(74, 47, smoothstep(0.0, 0.9, u)),
                };
            }
            let pose;
            if (videoTime < 28.0) {
                pose = { position: [0, 0, 2.5], target: [0, 0, 0], fov: 75 };
            } else if (videoTime < 48.0) {
                pose = cinematicPose(videoTime);
            } else if (videoTime < 54.0) {
                const from = cinematicPose(48.0);
                const to = { position: [0, 0, 2.5], target: [0, 0, 0], fov: 75 };
                const u = smoothstep(48.0, 54.0, videoTime);
                pose = {
                    position: [0, 1, 2].map((i) => lerp(from.position[i], to.position[i], u)),
                    target: [0, 1, 2].map((i) => lerp(from.target[i], to.target[i], u)),
                    fov: lerp(from.fov, to.fov, u),
                };
            } else {
                pose = { position: [0, 0, 2.5], target: [0, 0, 0], fov: 75 };
            }
            const bucket = [
                Math.round(videoTime * 24),
                pose.position.map((v) => Math.round(v * 1000)).join(','),
                Math.round(pose.fov * 100),
            ].join('|');
            if (bucket === lastCameraBucket) return;
            lastCameraBucket = bucket;
            api.setMainCameraPose({ position: pose.position, target: pose.target, fov: pose.fov, near: 0.1, far: 1000 });
        }

        const beats = [
            {
                time: 0.0,
                label: 'init_wide_horizon',
                action: () => {
                    api.setView({
                        sideRender: true,
                        illumination: true,
                        showCamera: true,
                        autoRotate: false,
                        autoRotateSpeed: 0,
                        meshAutoRotate: true,
                        meshAutoRotateSpeed: 0.035,
                    });
                    api.setCameraCount(6);
                    hdri('horizon', 8, { hdriIntensity: 1.0, hdriContrast: 0.48 });
                },
            },
            {
                time: 5.2,
                label: 'boot_finish',
                action: () => {
                    if (typeof window.__finishBootPreview === 'function') window.__finishBootPreview();
                },
            },
            { time: 5.4, label: 'hdri_horizon_metal', action: () => hdri('horizon', 8, { hdriIntensity: 1.0, hdriContrast: 0.48 }) },
            { time: 8.4, label: 'hdri_sunrise_metal', action: () => hdri('sunrise', 58, { hdriLightIntensity: 1.45, hdriContrast: 0.52 }) },
            { time: 11.4, label: 'hdri_cool_sky_metal', action: () => hdri('coolSky', 126, { hdriLightIntensity: 1.55, hdriContrast: 0.58 }) },
            { time: 14.4, label: 'hdri_sunset_metal', action: () => hdri('sunset', 204, { hdriIntensity: 1.12, hdriLightIntensity: 1.65 }) },
            { time: 17.4, label: 'hdri_night_metal', action: () => hdri('night', 285, { hdriIntensity: 1.18, hdriLightIntensity: 1.75, hdriContrast: 0.68 }) },
            { time: 20.6, label: 'olat_start_metal', action: () => setOlatFrame(14) },
        ];

        const sideBeatStart = 5.4;
        const sideBeatStep = 7.8;
        const sideCameraSequence = [0, 1, 2, 3, 4, 5, 0, 2];

        function updateSideCamera(videoTime) {
            const index = Math.max(0, Math.min(
                sideCameraSequence.length - 1,
                Math.floor((videoTime - sideBeatStart) / sideBeatStep)
            ));
            if (videoTime < sideBeatStart || index === lastSideIndex) return;
            lastSideIndex = index;
            run('side_camera_' + sideCameraSequence[index], videoTime, () => api.setCamera(sideCameraSequence[index]));
        }

        function updateOlat(videoTime) {
            const olatStart = 20.6;
            if (videoTime < olatStart) return;
            const state = api.getState ? api.getState() : {};
            const boardCount = Math.max(1, state.lightboards || 1);
            const prelude = olatFps + Math.max(1, Math.round(olatFps / 2));
            const boardOffset = Math.floor((videoTime - olatStart) * olatFps);
            const idx = prelude + ((14 + boardOffset) % boardCount);
            if (idx === lastOlatIdx) return;
            lastOlatIdx = idx;
            setOlatFrame(idx);
        }

        function updateEvents(videoTime) {
            while (lastBeatIndex + 1 < beats.length && videoTime >= beats[lastBeatIndex + 1].time) {
                lastBeatIndex += 1;
                const beat = beats[lastBeatIndex];
                run(beat.label, videoTime, beat.action);
            }
        }

        window.__cvpr26VideoTimelineLog = log;
        window.__cvpr26VideoFrame = (videoTime, frameIndex, frameCount) => {
            updateEvents(videoTime);
            updateSideCamera(videoTime);
            setMainCameraForTime(videoTime);
            updateOlat(videoTime);
            window.__cvpr26VideoTime = { videoTime, frameIndex, frameCount, olatFps };
        };
        window.__cvpr26VideoFrame(0, 0, 1);

        return { ok: true, timelineScale, timingMode: 'output-frame', olatFps, initialState: api.getState ? api.getState() : null };
    })()`;
}

function captureExpression(options) {
    return `window.__cvpr26CapturePromise = (async () => {
        const options = ${JSON.stringify(options)};
        const width = options.width;
        const height = options.height;
        const fps = options.fps;
        const seconds = options.playbackSeconds;
        const bitrate = options.bitrate;
        const temporalBlend = Math.max(0, Math.min(0.18, options.temporalBlend || 0));
        const frameCount = Math.round(seconds * fps);
        const frameDurationUs = Math.round(1000000 / fps);
        const keyInterval = Math.max(1, Math.round(fps * 2));

        if (!window.VideoEncoder) throw new Error('VideoEncoder is not available in this browser');

        const captureCanvas = document.createElement('canvas');
        captureCanvas.width = width;
        captureCanvas.height = height;
        captureCanvas.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;pointer-events:none;opacity:0;';
        document.body.appendChild(captureCanvas);

        const ctx = captureCanvas.getContext('2d', { alpha: false, desynchronized: true });
        const historyCanvas = temporalBlend > 0 ? document.createElement('canvas') : null;
        const historyCtx = historyCanvas ? historyCanvas.getContext('2d', { alpha: false, desynchronized: true }) : null;
        if (historyCanvas) {
            historyCanvas.width = width;
            historyCanvas.height = height;
        }

        const chunks = [];
        let decoderDescription = null;
        let encodedBytes = 0;
        const errors = [];

        const encoder = new VideoEncoder({
            output(chunk, metadata) {
                const data = new Uint8Array(chunk.byteLength);
                chunk.copyTo(data);
                chunks.push({
                    type: chunk.type,
                    timestamp: chunk.timestamp,
                    duration: chunk.duration || frameDurationUs,
                    data,
                });
                encodedBytes += data.byteLength;
                if (metadata && metadata.decoderConfig && metadata.decoderConfig.description) {
                    decoderDescription = new Uint8Array(metadata.decoderConfig.description);
                }
            },
            error(err) {
                errors.push(String(err && err.stack ? err.stack : err));
            },
        });

        const config = {
            codec: 'avc1.42001f',
            width,
            height,
            bitrate,
            framerate: fps,
            latencyMode: 'realtime',
            avc: { format: 'avc' },
        };
        const support = await VideoEncoder.isConfigSupported(config);
        if (!support.supported) throw new Error('H.264 WebCodecs encoder is not supported');
        encoder.configure(config);

        function parseZIndex(style) {
            const value = Number.parseInt(style.zIndex || '0', 10);
            return Number.isFinite(value) ? value : 0;
        }

        function visibleCanvases() {
            return Array.from(document.querySelectorAll('canvas'))
                .map((canvas, order) => {
                    const rect = canvas.getBoundingClientRect();
                    const style = window.getComputedStyle(canvas);
                    const opacity = Number.parseFloat(style.opacity || '1');
                    return {
                        canvas,
                        order,
                        rect,
                        opacity: Number.isFinite(opacity) ? opacity : 1,
                        z: parseZIndex(style),
                        visible: style.display !== 'none'
                            && style.visibility !== 'hidden'
                            && rect.width > 1
                            && rect.height > 1
                            && opacity > 0.001,
                    };
                })
                .filter((entry) => entry.visible)
                .sort((a, b) => (a.z - b.z) || (a.order - b.order));
        }

        let outroPointCache = null;
        let outroTextPointCache = null;

        function outroClamp01(value) {
            return Math.max(0, Math.min(1, value));
        }

        function outroSmoothstep(edge0, edge1, value) {
            const t = outroClamp01((value - edge0) / Math.max(0.0001, edge1 - edge0));
            return t * t * (3 - 2 * t);
        }

        function outroLerp(a, b, t) {
            return a + (b - a) * t;
        }

        function outroHash(index, salt = 0) {
            const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
            return value - Math.floor(value);
        }

        function getOutroLedColor(targetIndex) {
            const channel = targetIndex % 6;
            if (channel === 1) return [255, 80, 70];
            if (channel === 3) return [80, 255, 130];
            if (channel === 5) return [80, 130, 255];
            return [235, 245, 255];
        }

        function getOutroParticleColor(point, local) {
            const ledColor = getOutroLedColor(point.ledIndex || 0);
            const textColor = point.line === 'subtitle' ? [140, 205, 255] : [238, 246, 255];
            const colorT = outroSmoothstep(0.08, 0.88, local);
            return [
                Math.round(outroLerp(ledColor[0], textColor[0], colorT)),
                Math.round(outroLerp(ledColor[1], textColor[1], colorT)),
                Math.round(outroLerp(ledColor[2], textColor[2], colorT)),
            ];
        }

        function drawLoopTextPose(alpha) {
            const textAlpha = Math.max(0, Math.min(1, alpha));
            if (textAlpha <= 0.001) return;
            const points = buildOutroTextPoints();
            ctx.save();
            ctx.globalAlpha = textAlpha;
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, width, height);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < points.length; i += 1) {
                const p = points[i];
                const radius = p.line === 'subtitle'
                    ? 0.72 + p.textDepth * 0.24
                    : 0.92 + p.textDepth * 0.34;
                const alphaValue = textAlpha * (p.line === 'subtitle' ? 0.78 : 0.84);
                const color = p.line === 'subtitle' ? '140,205,255' : '238,246,255';
                ctx.fillStyle = 'rgba(' + color + ',' + alphaValue.toFixed(3) + ')';
                ctx.beginPath();
                ctx.arc(p.tx, p.ty, radius, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        function drawLoopIntro(videoTime) {
            if (videoTime > 0.95) return;
            const alpha = 1 - outroSmoothstep(0.42, 0.95, videoTime);
            drawLoopTextPose(alpha);
        }

        function getOutroParticleCount(targetCount) {
            const compactViewport = Math.min(width || 1, height || 1) < 680;
            const sizeBudget = compactViewport ? 820 : 980;
            const areaBudget = Math.floor(Math.sqrt(Math.max(1, (width || 1) * (height || 1))) * (compactViewport ? 1.35 : 0.95));
            const sourceBudget = targetCount > 0 ? targetCount : sizeBudget;
            return Math.max(360, Math.min(sourceBudget, sizeBudget, areaBudget));
        }

        function getOutroTargetIndex(particleIndex, particleCount, targetCount) {
            if (targetCount <= 0) return 0;
            if (targetCount <= particleCount) return particleIndex % targetCount;
            return Math.min(targetCount - 1, Math.floor((particleIndex + 0.5) * targetCount / particleCount));
        }

        function getOutroLedProjection() {
            let projection = null;
            const api = window.__cvpr26Demo;
            if (api && typeof api.getProjectedLedTargets === 'function') {
                try {
                    projection = api.getProjectedLedTargets();
                } catch (err) {
                    if (errors.length < 20) errors.push(String(err && err.message ? err.message : err));
                }
            }
            const projectedTargets = projection && Array.isArray(projection.projectedTargets) && projection.projectedTargets.length
                ? projection.projectedTargets
                : window.__BOOT_LIGHTSTAGE_PROJECTED_TARGETS__;
            const worldTargets = projection && Array.isArray(projection.targets) && projection.targets.length
                ? projection.targets
                : window.__BOOT_LIGHTSTAGE_LED_TARGETS__;
            const meta = projection && projection.projectedMeta
                ? projection.projectedMeta
                : window.__BOOT_LIGHTSTAGE_PROJECTED_TARGETS_META__;
            if (!Array.isArray(projectedTargets) || !projectedTargets.length) {
                return {
                    key: 'fallback',
                    projectedTargets: [],
                    worldTargets: [],
                };
            }

            const sourceWidth = Math.max(1, Number(meta && meta.width) || window.innerWidth || width);
            const sourceHeight = Math.max(1, Number(meta && meta.height) || window.innerHeight || height);
            const scaleX = width / sourceWidth;
            const scaleY = height / sourceHeight;
            const scaledTargets = [];
            const scaledWorldTargets = [];
            for (let i = 0; i < projectedTargets.length; i += 1) {
                const projected = projectedTargets[i];
                if (!projected || projected.length < 2) continue;
                const x = Number(projected[0]) * scaleX;
                const y = Number(projected[1]) * scaleY;
                if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
                const depth = Number.isFinite(Number(projected[2])) ? outroClamp01(Number(projected[2])) : 0.5;
                scaledTargets.push([x, y, depth, i]);
                scaledWorldTargets.push(Array.isArray(worldTargets) && worldTargets[i] ? worldTargets[i] : null);
            }

            return {
                key: scaledTargets.length + ':' + Math.round(sourceWidth) + 'x' + Math.round(sourceHeight) + ':' + Math.round(width) + 'x' + Math.round(height),
                projectedTargets: scaledTargets,
                worldTargets: scaledWorldTargets,
            };
        }

        function getOutroTextPoints(count) {
            const safeCount = Math.max(1, count || 1);
            const key = safeCount + ':' + Math.round(width) + ':' + Math.round(height);
            if (outroTextPointCache && outroTextPointCache.key === key) return outroTextPointCache.points;

            const textCanvas = document.createElement('canvas');
            const textCtx = textCanvas.getContext('2d', { willReadFrequently: true });
            if (!textCtx) return [];

            const maxLineWidth = Math.max(300, Math.min(width * 0.74, 780));
            let titleSize = Math.max(22, Math.min(58, width * 0.049, height * 0.084));
            let subtitleSize = titleSize * 0.68;
            const title = 'The Algorithmic Aura';
            const subtitle = '(CVPR 2026 Art)';
            const titleFont = () => '800 ' + titleSize + 'px Arial, Helvetica, sans-serif';
            const subtitleFont = () => '800 ' + subtitleSize + 'px Arial, Helvetica, sans-serif';
            const setFonts = () => {
                textCtx.font = titleFont();
                const titleWidth = textCtx.measureText(title).width;
                textCtx.font = subtitleFont();
                const subtitleWidth = textCtx.measureText(subtitle).width;
                return Math.max(titleWidth, subtitleWidth);
            };

            while (titleSize > 20 && setFonts() > maxLineWidth) {
                titleSize *= 0.92;
                subtitleSize = titleSize * 0.68;
            }

            const maskScale = 0.58;
            const textWidth = Math.ceil(Math.min(maxLineWidth, setFonts() + titleSize * 0.95));
            const textHeight = Math.ceil(titleSize * 2.38);
            textCanvas.width = Math.max(1, Math.ceil(textWidth * maskScale));
            textCanvas.height = Math.max(1, Math.ceil(textHeight * maskScale));
            textCtx.clearRect(0, 0, textCanvas.width, textCanvas.height);
            textCtx.save();
            textCtx.scale(maskScale, maskScale);
            textCtx.textAlign = 'center';
            textCtx.textBaseline = 'middle';
            textCtx.fillStyle = '#fff';
            textCtx.strokeStyle = '#fff';
            textCtx.lineJoin = 'round';
            textCtx.lineWidth = Math.max(1.4, titleSize * 0.04);
            textCtx.font = titleFont();
            textCtx.strokeText(title, textWidth * 0.5, titleSize * 0.72);
            textCtx.fillText(title, textWidth * 0.5, titleSize * 0.72);
            textCtx.font = subtitleFont();
            textCtx.lineWidth = Math.max(1.1, subtitleSize * 0.045);
            textCtx.strokeText(subtitle, textWidth * 0.5, titleSize * 1.66);
            textCtx.fillText(subtitle, textWidth * 0.5, titleSize * 1.66);
            textCtx.restore();

            const imageData = textCtx.getImageData(0, 0, textCanvas.width, textCanvas.height).data;
            const textPixelCount = textCanvas.width * textCanvas.height;
            const textMask = new Uint8Array(textPixelCount);
            for (let index = 0; index < textPixelCount; index += 1) {
                if (imageData[index * 4 + 3] > 28) textMask[index] = 1;
            }

            const candidates = [];
            const centerX = textCanvas.width * 0.5;
            const centerY = textCanvas.height * 0.5;
            const lineSplitY = titleSize * 1.24 * maskScale;
            const hasText = (x, y) => (
                x >= 0
                && x < textCanvas.width
                && y >= 0
                && y < textCanvas.height
                && textMask[y * textCanvas.width + x]
            );
            const pushContourPoint = (sourceX, sourceY, x, y) => {
                const alpha = imageData[((sourceY * textCanvas.width + sourceX) * 4) + 3];
                const sweep = (Math.atan2(y - centerY, x - centerX) + Math.PI) / (Math.PI * 2);
                const seed = outroHash((x + 19) * 12.9898 + (y + 31) * 78.233, 0.37);
                candidates.push({
                    x,
                    y,
                    alpha,
                    line: y < lineSplitY ? 'title' : 'subtitle',
                    reveal: sweep * 0.09 + seed * 0.025,
                });
            };
            for (let y = 0; y < textCanvas.height; y += 1) {
                for (let x = 0; x < textCanvas.width; x += 1) {
                    const index = y * textCanvas.width + x;
                    if (!textMask[index]) continue;
                    if (!hasText(x - 1, y)) pushContourPoint(x, y, x - 0.5, y);
                    if (!hasText(x + 1, y)) pushContourPoint(x, y, x + 0.5, y);
                    if (!hasText(x, y - 1)) pushContourPoint(x, y, x, y - 0.5);
                    if (!hasText(x, y + 1)) pushContourPoint(x, y, x, y + 0.5);
                }
            }
            candidates.sort((a, b) => a.reveal - b.reveal || a.y - b.y || a.x - b.x);

            const originX = width * 0.5 - textWidth * 0.5;
            const originY = height * 0.43 - textHeight * 0.5;
            const toDisplayX = (x) => x / maskScale;
            const toDisplayY = (y) => y / maskScale;
            const points = [];
            if (!candidates.length) {
                for (let i = 0; i < safeCount; i += 1) {
                    points.push({ x: width * 0.5, y: height * 0.5, depth: 0.5, rim: 0.3, line: 'title', reveal: 0, seed: outroHash(i, 1) });
                }
            } else {
                const titleCandidates = candidates.filter((candidate) => candidate.line === 'title');
                const subtitleCandidates = candidates.filter((candidate) => candidate.line === 'subtitle');
                const fallbackCandidates = candidates;
                const subtitleCount = subtitleCandidates.length
                    ? Math.min(safeCount - 1, Math.max(1, Math.floor(safeCount * 0.32)))
                    : 0;
                const titleCount = safeCount - subtitleCount;
                const addSamples = (source, sampleCount, offset) => {
                    if (!sampleCount) return;
                    const list = source.length ? source : fallbackCandidates;
                    const step = list.length / sampleCount;
                    for (let j = 0; j < sampleCount; j += 1) {
                        const pointIndex = offset + j;
                        const candidate = list[Math.min(list.length - 1, Math.floor((j + 0.5) * step))];
                        const seed = outroHash((candidate.x + 19) * 12.9898 + (candidate.y + 31) * 78.233 + pointIndex * 0.37, 0.19);
                        const nx = (candidate.x / Math.max(1, textCanvas.width)) * 2 - 1;
                        const ny = (candidate.y / Math.max(1, textCanvas.height)) * 2 - 1;
                        points.push({
                            x: originX + toDisplayX(candidate.x),
                            y: originY + toDisplayY(candidate.y),
                            depth: outroClamp01(0.46 + (1 - Math.abs(nx)) * 0.22 - Math.abs(ny) * 0.08 + (seed - 0.5) * 0.18),
                            rim: outroClamp01(0.2 + Math.abs(nx) * 0.28 + (1 - Math.abs(ny)) * 0.12 + seed * 0.16),
                            line: candidate.line,
                            reveal: candidate.reveal,
                            seed,
                        });
                    }
                };
                addSamples(titleCandidates, titleCount, 0);
                addSamples(subtitleCandidates, subtitleCount, titleCount);
                while (points.length < safeCount) {
                    const pointIndex = points.length;
                    const candidate = fallbackCandidates[Math.min(fallbackCandidates.length - 1, Math.floor((pointIndex + 0.5) * fallbackCandidates.length / safeCount))];
                    const seed = outroHash((candidate.x + 19) * 12.9898 + (candidate.y + 31) * 78.233 + pointIndex * 0.37, 0.19);
                    const nx = (candidate.x / Math.max(1, textCanvas.width)) * 2 - 1;
                    const ny = (candidate.y / Math.max(1, textCanvas.height)) * 2 - 1;
                    points.push({
                        x: originX + toDisplayX(candidate.x),
                        y: originY + toDisplayY(candidate.y),
                        depth: outroClamp01(0.46 + (1 - Math.abs(nx)) * 0.22 - Math.abs(ny) * 0.08 + (seed - 0.5) * 0.18),
                        rim: outroClamp01(0.2 + Math.abs(nx) * 0.28 + (1 - Math.abs(ny)) * 0.12 + seed * 0.16),
                        line: candidate.line,
                        reveal: candidate.reveal,
                        seed,
                    });
                }
            }

            outroTextPointCache = { key, points };
            return points;
        }

        function buildOutroTextPoints() {
            const projection = getOutroLedProjection();
            const targetCount = projection.projectedTargets.length;
            const count = getOutroParticleCount(targetCount);
            const key = width + 'x' + height + ':' + count + ':' + projection.key;
            if (outroPointCache && outroPointCache.key === key) return outroPointCache.points;

            const textPoints = getOutroTextPoints(count);
            const order = textPoints.map((_, index) => index);
            order.sort((a, b) => {
                const pa = textPoints[a];
                const pb = textPoints[b];
                return (pa.reveal || 0) - (pb.reveal || 0) || a - b;
            });
            const points = [];
            for (let i = 0; i < count; i += 1) {
                const particleIndex = order[i] !== undefined ? order[i] : i;
                const textPoint = textPoints[particleIndex] || textPoints[i % Math.max(1, textPoints.length)] || {
                    x: width * 0.5,
                    y: height * 0.43,
                    depth: 0.5,
                    rim: 0.3,
                    line: 'title',
                    seed: outroHash(i, 7),
                };
                const sourceIndex = getOutroTargetIndex(particleIndex, count, targetCount);
                const projected = targetCount > 0 ? projection.projectedTargets[sourceIndex] : null;
                const worldTarget = targetCount > 0 ? projection.worldTargets[sourceIndex] : null;
                let sourceX;
                let sourceY;
                let projectedDepth = 0.5;
                let sourceDepth = 0.5;
                let sourceRim = 0.35;
                let ledIndex = sourceIndex;
                if (projected) {
                    sourceX = projected[0];
                    sourceY = projected[1];
                    projectedDepth = projected[2];
                    ledIndex = projected[3] !== undefined ? projected[3] : sourceIndex;
                } else {
                    const angle = i * Math.PI * (3 - Math.sqrt(5));
                    const z = 1 - 2 * ((i + 0.5) / count);
                    const r = Math.sqrt(Math.max(0, 1 - z * z));
                    sourceX = width * 0.5 + Math.cos(angle) * r * width * 0.31;
                    sourceY = height * 0.52 + Math.sin(angle) * r * height * 0.31;
                    projectedDepth = (z + 1) * 0.5;
                }
                if (worldTarget && worldTarget.length >= 3) {
                    sourceDepth = outroSmoothstep(0.08, 0.98, outroClamp01((worldTarget[2] + 1.8) / 3.6));
                    const length = Math.hypot(worldTarget[0], worldTarget[1], worldTarget[2]) || 1;
                    const sideOn = 1 - Math.abs(worldTarget[2]) / length;
                    sourceRim = outroSmoothstep(0.58, 0.98, sideOn);
                } else {
                    sourceDepth = projectedDepth;
                    sourceRim = outroClamp01(0.25 + projectedDepth * 0.55);
                }
                points.push({
                    sx: sourceX,
                    sy: sourceY,
                    tx: textPoint.x,
                    ty: textPoint.y,
                    depth: sourceDepth,
                    projectedDepth,
                    rim: sourceRim,
                    textDepth: textPoint.depth || 0.5,
                    textRim: textPoint.rim || 0.3,
                    line: textPoint.line,
                    ledIndex,
                    orderIndex: i,
                    seed: textPoint.seed || outroHash(i, 8),
                });
            }
            outroPointCache = { key, points };
            return points;
        }

        function drawLoopOutro(videoTime) {
            const start = 54.0;
            const end = 59.95;
            if (videoTime < start) return;
            const t = Math.max(0, Math.min(1, (videoTime - start) / (end - start)));
            const cover = outroSmoothstep(0.08, 0.3, t);
            ctx.save();
            ctx.globalAlpha = cover;
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, width, height);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'lighter';

            const points = buildOutroTextPoints();
            const reveal = outroSmoothstep(0.0, 0.15, t);
            const morphClock = outroClamp01((t - 0.26) / 0.7);
            if (morphClock >= 1) {
                ctx.restore();
                drawLoopTextPose(reveal);
                return;
            }
            for (let i = 0; i < points.length; i += 1) {
                const p = points[i];
                const delay = (p.orderIndex / Math.max(1, points.length)) * 0.1;
                const local = outroSmoothstep(0.0 + delay, 0.9 + delay, morphClock);
                const sourceHold = 1 - local;
                const tinyDrift = sourceHold * 0.28;
                const textDrift = local * (1 - local) * 5.0;
                const x = outroLerp(p.sx, p.tx, local)
                    + Math.sin(videoTime * 1.8 + p.ledIndex * 0.11) * tinyDrift * (0.35 + p.rim)
                    + Math.sin(videoTime * 2.0 + i * 0.13) * textDrift;
                const y = outroLerp(p.sy, p.ty, local)
                    + Math.cos(videoTime * 1.5 + p.ledIndex * 0.17) * tinyDrift * (0.2 + p.depth)
                    + Math.cos(videoTime * 1.7 + i * 0.09) * textDrift * 0.35;
                const sourceRadius = (0.62 + p.depth * p.depth * 3.15 + p.rim * 0.55) * (0.9 + p.seed * 0.28);
                const textRadius = p.line === 'subtitle'
                    ? 0.72 + p.textDepth * 0.24
                    : 0.92 + p.textDepth * 0.34;
                const radius = outroLerp(sourceRadius, textRadius, local);
                const sourceAlpha = 0.2 + p.depth * 0.5 + p.rim * 0.16;
                const textAlpha = p.line === 'subtitle' ? 0.78 : 0.84;
                const alpha = Math.min(1, reveal * outroLerp(sourceAlpha, textAlpha, local));
                const color = getOutroParticleColor(p, local);
                const colorCss = String(color[0]) + ',' + String(color[1]) + ',' + String(color[2]);
                if (local < 0.18 && p.orderIndex % 4 === 0) {
                    ctx.beginPath();
                    ctx.fillStyle = 'rgba(' + colorCss + ',' + (alpha * (0.025 + p.rim * 0.055)).toFixed(3) + ')';
                    ctx.arc(x, y, radius * (1.5 + p.rim * 0.5), 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.fillStyle = 'rgba(' + colorCss + ',' + alpha.toFixed(3) + ')';
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        function drawFrame(videoTime) {
            const viewportW = Math.max(1, window.innerWidth || document.documentElement.clientWidth || width);
            const viewportH = Math.max(1, window.innerHeight || document.documentElement.clientHeight || height);
            const sx = width / viewportW;
            const sy = height / viewportH;

            ctx.globalAlpha = 1;
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, width, height);

            for (const entry of visibleCanvases()) {
                try {
                    ctx.globalAlpha = entry.opacity;
                    ctx.drawImage(
                        entry.canvas,
                        Math.round(entry.rect.left * sx),
                        Math.round(entry.rect.top * sy),
                        Math.round(entry.rect.width * sx),
                        Math.round(entry.rect.height * sy)
                    );
                } catch (err) {
                    if (errors.length < 20) errors.push(String(err && err.message ? err.message : err));
                }
            }

            ctx.globalAlpha = 1;
            drawLoopIntro(videoTime);
            drawLoopOutro(videoTime);
            if (historyCanvas && historyCtx) {
                if (window.__cvpr26CaptureHasHistory) {
                    ctx.globalAlpha = temporalBlend;
                    ctx.drawImage(historyCanvas, 0, 0);
                    ctx.globalAlpha = 1;
                }
                historyCtx.drawImage(captureCanvas, 0, 0);
                window.__cvpr26CaptureHasHistory = true;
            }
        }

        function nextAnimationFrame() {
            return new Promise((resolve) => requestAnimationFrame(resolve));
        }

        const start = performance.now();
        for (let i = 0; i < frameCount; i += 1) {
            const target = start + (i * 1000 / fps);
            const waitMs = target - performance.now();
            if (waitMs > 1) await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 12)));
            if (typeof window.__cvpr26VideoFrame === 'function') {
                try {
                    window.__cvpr26VideoFrame(i / fps, i, frameCount);
                } catch (err) {
                    if (errors.length < 20) errors.push(String(err && err.stack ? err.stack : err));
                }
            }
            await nextAnimationFrame();

            drawFrame(i / fps);
            const frame = new VideoFrame(captureCanvas, {
                timestamp: i * frameDurationUs,
                duration: frameDurationUs,
            });
            encoder.encode(frame, { keyFrame: i % keyInterval === 0 });
            frame.close();

            if (encoder.encodeQueueSize > 8) await new Promise((resolve) => setTimeout(resolve, 0));
            if (i % Math.max(1, Math.round(fps * 2)) === 0) {
                window.__cvpr26CaptureProgress = {
                    frame: i,
                    frameCount,
                    encodedChunks: chunks.length,
                    encodedBytes,
                    elapsedMs: Math.round(performance.now() - start),
                };
            }
        }

        await encoder.flush();
        encoder.close();

        function bytesToBase64(bytes) {
            let binary = '';
            const step = 0x8000;
            for (let i = 0; i < bytes.length; i += step) {
                binary += String.fromCharCode(...bytes.subarray(i, i + step));
            }
            return btoa(binary);
        }

        window.__cvpr26EncodedPayload = JSON.stringify({
            width,
            height,
            fps,
            playbackSeconds: seconds,
            frameDurationUs,
            encodedFrameCount: chunks.length,
            encodedBytes,
            errors,
            decoderConfigDescription: decoderDescription ? bytesToBase64(decoderDescription) : '',
            timelineLog: window.__cvpr26VideoTimelineLog || [],
            chunks: chunks.map((chunk) => ({
                type: chunk.type,
                timestamp: chunk.timestamp,
                duration: chunk.duration || frameDurationUs,
                data: bytesToBase64(chunk.data),
            })),
        });

        window.__cvpr26CaptureProgress = {
            frame: frameCount,
            frameCount,
            encodedChunks: chunks.length,
            encodedBytes,
            elapsedMs: Math.round(performance.now() - start),
            done: true,
        };

        return {
            width,
            height,
            fps,
            playbackSeconds: seconds,
            frameCount,
            encodedFrameCount: chunks.length,
            encodedBytes,
            errors: errors.slice(0, 8),
            elapsedMs: Math.round(performance.now() - start),
            timelineLog: window.__cvpr26VideoTimelineLog || [],
        };
    })()`;
}

function u8(...values) {
    return Buffer.from(values);
}

function u16(value) {
    const buffer = Buffer.alloc(2);
    buffer.writeUInt16BE(value);
    return buffer;
}

function u24(value) {
    return Buffer.from([(value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
}

function u32(value) {
    const buffer = Buffer.alloc(4);
    buffer.writeUInt32BE(value >>> 0);
    return buffer;
}

function i32(value) {
    const buffer = Buffer.alloc(4);
    buffer.writeInt32BE(value);
    return buffer;
}

function str(value) {
    return Buffer.from(value, 'ascii');
}

function box(type, ...payloads) {
    const size = 8 + payloads.reduce((sum, payload) => sum + payload.length, 0);
    return Buffer.concat([u32(size), str(type), ...payloads], size);
}

function fullBox(type, version, flags, ...payloads) {
    return box(type, Buffer.concat([u8(version), u24(flags), ...payloads]));
}

function fixed16(value) {
    return u32(Math.round(value * 65536));
}

function makeMp4({ width, height, fps, chunks, avcC }) {
    const timescale = fps;
    const duration = chunks.length;
    const mdatPayload = Buffer.concat(chunks.map((sample) => sample.data));
    const sampleSizes = chunks.map((sample) => sample.data.length);
    const keyFrameSamples = chunks
        .map((sample, index) => (sample.type === 'key' ? index + 1 : 0))
        .filter(Boolean);

    const ftyp = box('ftyp', str('isom'), u32(0x200), str('isom'), str('iso2'), str('avc1'), str('mp41'));
    const free = box('free', Buffer.alloc(8));

    function makeMoov(chunkOffset) {
        const mvhd = fullBox(
            'mvhd',
            0,
            0,
            u32(0),
            u32(0),
            u32(timescale),
            u32(duration),
            fixed16(1),
            u16(0x0100),
            u16(0),
            Buffer.alloc(8),
            fixed16(1), u32(0), u32(0),
            u32(0), fixed16(1), u32(0),
            u32(0), u32(0), fixed16(1),
            Buffer.alloc(24),
            u32(2)
        );

        const tkhd = fullBox(
            'tkhd',
            0,
            0x000007,
            u32(0),
            u32(0),
            u32(1),
            u32(0),
            u32(duration),
            Buffer.alloc(8),
            u16(0),
            u16(0),
            u16(0),
            u16(0),
            fixed16(1), u32(0), u32(0),
            u32(0), fixed16(1), u32(0),
            u32(0), u32(0), fixed16(1),
            u32(width << 16),
            u32(height << 16)
        );

        const mdhd = fullBox('mdhd', 0, 0, u32(0), u32(0), u32(timescale), u32(duration), u16(0x55c4), u16(0));
        const hdlr = fullBox(
            'hdlr',
            0,
            0,
            u32(0),
            str('vide'),
            Buffer.alloc(12),
            Buffer.from('VideoHandler\0', 'ascii')
        );

        const vmhd = fullBox('vmhd', 0, 1, u16(0), u16(0), u16(0), u16(0));
        const dref = fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1));
        const dinf = box('dinf', dref);

        const avc1 = box(
            'avc1',
            Buffer.alloc(6),
            u16(1),
            Buffer.alloc(16),
            u16(width),
            u16(height),
            u32(0x00480000),
            u32(0x00480000),
            u32(0),
            u16(1),
            Buffer.concat([Buffer.alloc(32)]),
            u16(0x0018),
            u16(0xffff),
            box('avcC', avcC)
        );
        const stsd = fullBox('stsd', 0, 0, u32(1), avc1);
        const stts = fullBox('stts', 0, 0, u32(1), u32(chunks.length), u32(1));
        const stsc = fullBox('stsc', 0, 0, u32(1), u32(1), u32(chunks.length), u32(1));
        const stsz = fullBox('stsz', 0, 0, u32(0), u32(chunks.length), ...sampleSizes.map(u32));
        const stco = fullBox('stco', 0, 0, u32(1), u32(chunkOffset));
        const stss = fullBox('stss', 0, 0, u32(keyFrameSamples.length), ...keyFrameSamples.map(u32));
        const stbl = box('stbl', stsd, stts, stsc, stsz, stco, stss);
        const minf = box('minf', vmhd, dinf, stbl);
        const mdia = box('mdia', mdhd, hdlr, minf);
        const trak = box('trak', tkhd, mdia);
        return box('moov', mvhd, trak);
    }

    let moov = makeMoov(ftyp.length + free.length + 8);
    moov = makeMoov(ftyp.length + moov.length + free.length + 8);
    const mdat = box('mdat', mdatPayload);
    return Buffer.concat([ftyp, moov, free, mdat]);
}

async function run() {
    const staticServer = await startStaticServer(repoRoot);
    const chrome = await launchChrome();
    const client = await createPage(chrome.cdpPort);
    const pageUrl = `http://127.0.0.1:${staticServer.port}/index.html?cvprVideo=1`;

    const consoleMessages = [];
    const exceptions = [];
    client.on('Runtime.consoleAPICalled', (params) => {
        const text = (params.args || []).map((arg) => arg.value || arg.description || '').join(' ');
        if (text) consoleMessages.push(text);
    });
    client.on('Runtime.exceptionThrown', (params) => {
        exceptions.push(params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || 'unknown exception');
    });

    try {
        await client.send('Page.enable');
        await client.send('Runtime.enable');
        await client.send('Log.enable');
        await client.send('Emulation.setDeviceMetricsOverride', {
            width,
            height,
            deviceScaleFactor: 1,
            mobile: false,
            screenWidth: width,
            screenHeight: height,
        });

        const loadEvent = client.waitFor('Page.loadEventFired', () => true, 120000).catch(() => null);
        await client.send('Page.navigate', { url: pageUrl });
        await loadEvent;

        await waitForExpression(client, `window.__cvpr26Demo && typeof window.__cvpr26Demo.getState === 'function'`, 180000);
        await evaluate(client, installTimelineExpression(timelineScale));

        const captureSummary = await evaluate(client, captureExpression({
            width,
            height,
            fps,
            playbackSeconds,
            bitrate,
            temporalBlend,
        }));

        const payloadJson = await readBrowserString(client, '__cvpr26EncodedPayload');
        const payload = JSON.parse(payloadJson);
        const avcC = Buffer.from(payload.decoderConfigDescription, 'base64');
        if (!avcC.length) throw new Error('Missing avcC decoder description from WebCodecs');

        const chunks = payload.chunks.map((chunk) => ({
            type: chunk.type,
            timestamp: chunk.timestamp,
            duration: chunk.duration,
            data: Buffer.from(chunk.data, 'base64'),
        }));

        const mp4 = makeMp4({
            width: payload.width,
            height: payload.height,
            fps: payload.fps,
            chunks,
            avcC,
        });

        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(outputPath, mp4);

        const summary = {
            outputPath: path.relative(repoRoot, outputPath),
            bytes: mp4.length,
            width,
            height,
            fps,
            playbackSeconds,
            bitrate,
            timelineScale,
            temporalBlend,
            encodedFrameCount: chunks.length,
            keyFrameCount: chunks.filter((chunk) => chunk.type === 'key').length,
            captureElapsedMs: captureSummary.elapsedMs,
            captureErrors: payload.errors || captureSummary.errors || [],
            runtimeExceptions: exceptions.slice(0, 8),
            timelineLog: payload.timelineLog || captureSummary.timelineLog || [],
            consoleMessages: consoleMessages.slice(-8),
        };
        console.log(JSON.stringify(summary, null, 2));
    } finally {
        client.close();
        await chrome.close();
        await staticServer.close();
    }
}

run().catch((err) => {
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
});
