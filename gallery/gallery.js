export const GALLERY = [
  {
    id: "plasma",
    title: "Plasma Study",
    author: "You",
    description: "A simple time-varying plasma field. Replace this with your own shader artworks.",
    fragment: `
      void mainImage(out vec4 fragColor, in vec2 fragCoord) {
        vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
        float t = iTime * 0.9;

        float a = sin(uv.x*3.0 + t) + sin(uv.y*4.0 - t);
        float b = sin((uv.x+uv.y)*5.0 + t*1.3);
        float c = sin(length(uv)*10.0 - t*1.6);
        float v = (a + b + c) / 3.0;

        vec3 col = 0.5 + 0.5 * cos(6.2831*(vec3(0.2,0.45,0.75) + v + vec3(0.0,0.33,0.67)));
        fragColor = vec4(col, 1.0);
      }
    `
  },
  {
    id: "neonGrid",
    title: "Neon Grid",
    author: "You",
    description: "A glowing perspective grid with subtle motion.",
    fragment: `
      float hash21(vec2 p){
        p = fract(p*vec2(123.34,345.45));
        p += dot(p, p+34.345);
        return fract(p.x*p.y);
      }

      void mainImage(out vec4 fragColor, in vec2 fragCoord){
        vec2 uv = (fragCoord - 0.5*iResolution.xy)/iResolution.y;
        float t = iTime*0.7;

        // fake perspective
        float z = 1.0/(uv.y+1.4);
        vec2 p = uv * z;
        p.y += t*0.6;

        vec2 g = abs(fract(p*2.0)-0.5);
        float line = 1.0 - smoothstep(0.0, 0.03, min(g.x, g.y));

        float fog = smoothstep(4.0, 0.8, z);
        vec3 base = vec3(0.02,0.03,0.06);
        vec3 glow = vec3(0.2,0.6,1.0) * line * fog;

        // occasional spark
        vec2 cell = floor(p*2.0);
        float h = hash21(cell);
        float spark = smoothstep(0.995,1.0, h) * (0.5 + 0.5*sin(t*8.0 + h*50.0));
        glow += vec3(1.0,0.3,0.9)*spark*fog;

        fragColor = vec4(base + glow, 1.0);
      }
    `
  },
  {
    id: "marble",
    title: "Marble Flow",
    author: "You",
    description: "Procedural marble-like bands using domain warping.",
    fragment: `
      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        float a = fract(sin(dot(i, vec2(127.1,311.7)))*43758.5453);
        float b = fract(sin(dot(i+vec2(1,0), vec2(127.1,311.7)))*43758.5453);
        float c = fract(sin(dot(i+vec2(0,1), vec2(127.1,311.7)))*43758.5453);
        float d = fract(sin(dot(i+vec2(1,1), vec2(127.1,311.7)))*43758.5453);
        vec2 u = f*f*(3.0-2.0*f);
        return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
      }

      void mainImage(out vec4 fragColor, in vec2 fragCoord){
        vec2 uv = fragCoord / iResolution.xy;
        vec2 p = (uv - 0.5) * vec2(iResolution.x/iResolution.y, 1.0);
        float t = iTime*0.2;

        float n1 = noise(p*3.0 + t);
        float n2 = noise(p*6.0 - t*1.2);
        vec2 warp = vec2(n1, n2) - 0.5;

        float m = sin((p.x + warp.x*0.8)*6.0 + (p.y + warp.y*0.8)*4.0);
        m = 0.5 + 0.5*m;

        vec3 colA = vec3(0.04,0.06,0.10);
        vec3 colB = vec3(0.85,0.88,0.95);
        vec3 col = mix(colA, colB, smoothstep(0.2, 0.9, m));
        col *= 0.85 + 0.15*sin(10.0*m + iTime*0.6);

        fragColor = vec4(col,1.0);
      }
    `
  },
];
