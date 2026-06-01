# jingyangcarl.github.io

# dev instruction
1 Install the extension Live Server
Right-click the file index.html

## gallery
The `/gallery/` page is a CineShader-style 3D cinema gallery for arbitrary images, where each image becomes a glowing displaced shader-map surface.
It loads image works from `gallery/manifest.json`.
Add any image by adding an object to the `images` array:

```json
{
  "title": "My Image",
  "author": "Jing Yang",
  "description": "Optional caption",
  "src": "../path/to/image.jpg",
  "thumb": "../path/to/image.jpg",
  "date": "2026-01-01"
}
```

The gallery also accepts local images at runtime with the `Add Images` button or drag/drop.
Those images are browser-session only.
