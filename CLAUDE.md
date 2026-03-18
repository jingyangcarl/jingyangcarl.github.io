# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal academic portfolio website for a PhD researcher, featuring 3D WebGL visualizations. It is a **static, zero-build site** deployed via GitHub Pages — no package manager, no build step, no bundler.

## Development

**Run locally:**
```bash
python -m http.server 8000
# or
npx http-server
```
Then open http://localhost:8000. The Live Server VS Code extension also works (right-click `index.html` → Open with Live Server).

**Deploy:** Commit and push to `master` — GitHub Pages auto-deploys.

There are no tests, no linting tools, and no CI configuration.

## Architecture

### Libraries
All dependencies are loaded via CDN using ES6 `importmap` in HTML files — no `node_modules`. Key libraries:
- **Three.js** (v0.157.0 / v0.182.0) — 3D rendering
- **lil-gui** — runtime parameter controls
- **three-mesh-bvh** — BVH acceleration for raycasting
- **Bulma** — CSS framework

### Main Components

**Landing page (`/index.html` + `/static/js/index.js`):**
WebGL/WebGPU Three.js scene with OrbitControls, CSS2DRenderer for labels, FBXLoader for models, and lil-gui parameter panel. Showcases a 3D Light Stage research visualization.

**Shader Gallery (`/gallery/`):**
- `main.js` — dual-mode Three.js app: "Museum" mode (FPS navigation via PointerLockControls + WASD) and "Viewer" mode (full-screen shader inspection)
- `gallery.js` — exports `GALLERY` array; each entry has `{ id, title, author, description, fragmentShader }` — add new artworks here
- Shaders follow Shadertoy conventions with uniforms: `iTime`, `iResolution`, `iMouse`
- Fragment shaders are compiled at runtime via Three.js `ShaderMaterial`

**Research sub-pages** (`/RelightableStudio/`, `/MaterialAuthoring/`, `/PolarizedReflectanceField/`, `/LightSamplingField/`):
Standalone `index.html` files for individual research projects.

**3D assets:** `/static/mesh/` holds GLB and USDZ models. Images are in `/static/img/`.

### Browser Compatibility
The gallery uses PointerLock API — test in Chrome or Edge (Firefox has known issues with this flow).
