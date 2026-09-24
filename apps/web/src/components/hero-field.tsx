"use client";

import { useEffect, useRef } from "react";

/**
 * The hero background: a sheet of silk. A domain-warped height field folds
 * slowly in the theme's accent and leaf colours, lit by a light that hovers
 * where the pointer is, with faint contour threads traced along the folds
 * like a survey map, and a whisper of grain so the gradients never band.
 *
 * It is decoration, so it must never cost the page anything:
 * - no WebGL, a failed compile or a lost context: the canvas stays hidden
 *   (a lost context paints white, so it must never stay on screen);
 * - reduced motion or Save-Data: one still frame, no loop;
 * - off screen or in a background tab: the loop stops;
 * - slow frames: resolution drops, then the loop stops on the last frame;
 * - it never takes pointer events, so nothing under it stops being clickable.
 */

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAGMENT = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uPointer;
uniform vec3 uA;
uniform vec3 uB;
uniform float uStrength;
uniform float uDark;

float hash(vec2 p) {
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// Octaves rotate as they shrink, so no grid axis ever shows through.
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = m * p;
    a *= 0.45;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * aspect, uv.y) * 0.8;
  vec2 m = vec2(uPointer.x * aspect, uPointer.y) * 0.8;
  float t = uTime * 0.035;

  // The pointer presses gently into the cloth.
  vec2 dm = p - m;
  p -= dm * 0.16 * exp(-dot(dm, dm) * 5.0);

  // Warp the warp (after Inigo Quilez): folds that fold over themselves.
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t * 0.8));
  vec2 r = vec2(fbm(p + 2.2 * q + vec2(1.7, 9.2) + t * 0.5),
                fbm(p + 2.2 * q + vec2(8.3, 2.8) - t * 0.4));
  vec2 s = p + 2.2 * r;

  // Height and its slope one pixel over: enough for light and for threads.
  float e = 0.8 / uRes.y;
  float h = fbm(s);
  vec2 d = vec2(fbm(s + vec2(e, 0.0)), fbm(s + vec2(0.0, e))) - h;
  vec3 n = normalize(vec3(-d / e * 0.6, 1.0));

  // A low light near the pointer rakes across the folds, so only the faces
  // turned towards it catch it; the viewer looks straight down.
  vec3 l = normalize(vec3(m - p, 0.45));
  vec3 hv = normalize(l + vec3(0.0, 0.0, 1.0));
  float diffuse = max(dot(n, l), 0.0);
  float spec = pow(max(dot(n, hv), 0.0), 72.0);

  // Colour follows the warp; where the cloth turns away it shifts hue,
  // like the sheen on real silk.
  vec3 base = mix(uB, uA, smoothstep(0.25, 0.95, length(q) * 1.1 + r.x * 0.35 - 0.2));
  float tilt = clamp((1.0 - n.z) * 7.0, 0.0, 1.0);
  base = mix(base, mix(uA, uB, 0.5 + 0.5 * sin(h * 9.0 + t * 3.0)), tilt * 0.45);

  // Contour threads: lines of equal height, one pixel wide at any slope,
  // faded out on flat ground where they would smear.
  float levels = 14.0;
  float slope = length(d) * levels;
  float dist = 0.5 - abs(fract(h * levels) - 0.5);
  float thread = (1.0 - smoothstep(0.0, 1.0, dist / max(slope, 0.0001)))
               * smoothstep(0.012, 0.04, slope);

  vec3 highlight = mix(base, vec3(1.0), uDark * 0.7);
  float shade = 0.35 + 0.65 * diffuse;
  vec3 color = base * shade + highlight * spec * 0.55;
  color = clamp(mix(color, highlight, thread * (0.3 + 0.5 * diffuse)), 0.0, 1.0);

  // Calmer under the headline on the left, fuller behind the demo.
  float veil = mix(0.35, 1.0, smoothstep(0.05, 0.85, uv.x));
  float alpha = uStrength * veil * (0.4 + 0.35 * shade + 0.6 * spec + 0.9 * thread * diffuse);

  // Grain: tiny per-pixel noise that breaks up banding in the soft ramps.
  float grain = (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) * 0.05;
  alpha = clamp(alpha + grain * alpha, 0.0, 1.0);

  gl_FragColor = vec4(color * alpha, alpha);
}
`;

function readColor(probe: HTMLElement, token: string): [number, number, number] {
  probe.style.color = `var(${token})`;
  const match = getComputedStyle(probe).color.match(/[\d.]+/g);
  if (!match || match.length < 3) return [0.5, 0.5, 0.5];
  return [Number(match[0]) / 255, Number(match[1]) / 255, Number(match[2]) / 255];
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function HeroField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const saveData = Boolean(
      (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData,
    );

    let gl: WebGLRenderingContext | null = null;
    try {
      gl = canvas.getContext("webgl", {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: true,
        powerPreference: "low-power",
        failIfMajorPerformanceCaveat: true,
      });
    } catch {
      gl = null;
    }
    if (!gl || gl.isContextLost()) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vs || !fs || !program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook.
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const u = {
      res: gl.getUniformLocation(program, "uRes"),
      time: gl.getUniformLocation(program, "uTime"),
      pointer: gl.getUniformLocation(program, "uPointer"),
      a: gl.getUniformLocation(program, "uA"),
      b: gl.getUniformLocation(program, "uB"),
      strength: gl.getUniformLocation(program, "uStrength"),
      dark: gl.getUniformLocation(program, "uDark"),
    };

    const probe = document.createElement("span");
    probe.style.display = "none";
    canvas.parentElement?.appendChild(probe);
    const applyTheme = () => {
      if (!gl) return;
      gl.uniform3fv(u.a, readColor(probe, "--accent"));
      gl.uniform3fv(u.b, readColor(probe, "--leaf"));
      // Light paper needs less colour than dark ink to read as the same glow.
      const dark = document.documentElement.classList.contains("dark");
      gl.uniform1f(u.strength, dark ? 0.34 : 0.26);
      gl.uniform1f(u.dark, dark ? 1 : 0);
    };
    applyTheme();

    // The light follows the pointer through an eased value, never jumping.
    const target = { x: 0.6, y: 0.55 };
    const eased = { x: 0.6, y: 0.55 };
    const started = performance.now();
    const now = () => (performance.now() - started) / 1000;

    // Soft gradients need few pixels: a lower resolution costs nothing visible.
    let scale = Math.min(window.devicePixelRatio || 1, 1) * 0.5;
    const resize = () => {
      if (!gl) return;
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(u.res, canvas.width, canvas.height);
    };
    resize();

    const draw = () => {
      if (!gl) return;
      eased.x += (target.x - eased.x) * 0.04;
      eased.y += (target.y - eased.y) * 0.04;
      gl.uniform1f(u.time, now());
      gl.uniform2f(u.pointer, eased.x, eased.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const still = reduced.matches || saveData;
    let frame = 0;
    let running = false;
    let visible = true;
    let slowFrames = 0;
    let previous = 0;

    const loop = (stamp: number) => {
      frame = requestAnimationFrame(loop);
      // Budget: a run of slow frames lowers resolution once, then stops.
      if (previous && stamp - previous > 42) slowFrames++;
      else slowFrames = Math.max(0, slowFrames - 1);
      previous = stamp;
      if (slowFrames > 45) {
        slowFrames = 0;
        if (scale > 0.3) {
          scale = 0.3;
          resize();
        } else {
          stop();
          return;
        }
      }
      draw();
    };
    const start = () => {
      if (running || still || !visible || document.hidden) return;
      running = true;
      previous = 0;
      frame = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(frame);
    };

    const onPointer = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = 1 - (event.clientY - rect.top) / rect.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      target.x = x;
      target.y = y;
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
      if (visible) start();
      else stop();
    });
    observer.observe(canvas);
    const onVisibility = () => (document.hidden ? stop() : start());
    const onResize = () => {
      resize();
      if (!running) draw();
    };
    const themeObserver = new MutationObserver(() => {
      applyTheme();
      if (!running) draw();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    });
    const onLost = (event: Event) => {
      event.preventDefault();
      stop();
      delete canvas.dataset.ready;
      gl = null;
    };

    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    canvas.addEventListener("webglcontextlost", onLost);

    draw();
    if (!still) start();
    canvas.dataset.ready = "true";

    return () => {
      stop();
      observer.disconnect();
      themeObserver.disconnect();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      probe.remove();
      delete canvas.dataset.ready;
      // Free what we made, but never lose the context on purpose: the canvas
      // has only one, and a remount (StrictMode does one in development)
      // would get it back dead.
      if (gl && !gl.isContextLost()) {
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 -z-10 size-full opacity-0 transition-opacity duration-1000 data-[ready=true]:opacity-100 [mask-image:linear-gradient(to_bottom,black_60%,transparent)]"
    />
  );
}
