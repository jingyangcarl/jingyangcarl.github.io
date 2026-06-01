# Repository Guidelines

## Project Structure & Module Organization

This is a static GitHub Pages site with no package manager or build step. The root `index.html` is the main portfolio page, backed by shared scripts and styles in `static/js/` and `static/css/`. Research project pages live in standalone directories such as `RelightableStudio/`, `MaterialAuthoring/`, `PolarizedReflectanceField/`, `ICTPolarReal/`, and `LightSamplingField/`. Shared media and generated assets belong under `static/img/`, `static/video/`, `static/mesh/`, and `static/cache/`. The interactive image gallery is isolated in `gallery/`, with data in `gallery/manifest.json`, behavior in `gallery/main.js`, and styles in `gallery/styles.css`.

## Build, Test, and Development Commands

- `python -m http.server 8000`: serve the repository locally at `http://localhost:8000`.
- `npx http-server`: alternate static server if Node tooling is available.
- VS Code Live Server: right-click `index.html` and open with Live Server.

There is no build command. Deployment is handled by GitHub Pages after pushing to `master`.

## Coding Style & Naming Conventions

Use plain HTML, CSS, and browser JavaScript. Prefer ES modules and import maps already present in page HTML over adding bundlers or `node_modules`. Keep indentation consistent with the surrounding file, usually two spaces in HTML/CSS/JS blocks. Use descriptive, lower-case directory names for project pages and stable asset paths under `static/`. For gallery entries, keep JSON fields consistent with existing objects: `id`, `title`, `author`, `description`, `src`, `thumb`, and `date`.

## Testing Guidelines

There is no automated test framework or coverage requirement. Verify changes manually in a local static server, not by opening files directly, so module imports and asset paths match GitHub Pages behavior. Check the root page, any modified project page, and `gallery/` when touching shared assets or JavaScript. For visual changes, test at both desktop and mobile widths and confirm WebGL scenes, videos, and model assets load without console errors.

## Commit & Pull Request Guidelines

Recent commits use short imperative subjects such as `Add gallery startup poster` and `Fix gallery display shader`. Follow that pattern: one focused change per commit, with a concise subject that explains the outcome. Pull requests should include a short summary, affected pages or directories, manual test steps, and screenshots or screen recordings for visible UI, gallery, video, or 3D scene changes. Link related issues when available and call out large media additions explicitly.

## Agent-Specific Instructions

Do not introduce a build system, formatter, dependency manager, or test framework unless the task explicitly requires it. Keep edits scoped, preserve existing media paths, and avoid rewriting unrelated static pages.
