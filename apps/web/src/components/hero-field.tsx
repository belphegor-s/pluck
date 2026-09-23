"use client";

import { useEffect, useRef } from "react";

/**
 * The hero background: a field of fine strings, like lines of text, that your
 * pointer plucks. Ripples travel along each string and fade, warming to the
 * accent as they go. On the left the strings wander, the raw web; to the right
 * they settle, the clean output.
 *
 * It is decoration, so it must never cost the page anything:
 * - no WebGL, a failed compile or a lost context: the canvas stays empty;
 * - reduced motion or Save-Data: one still frame, no loop;
 * - off screen or in a background tab: the loop stops;
 * - slow frames: resolution drops, then the loop stops on the last frame;
 * - it never takes pointer events, so nothing under it stops being clickable.
 */

const CREDIT =
  "Hero background: a hand-written WebGL string field made for Pluck. The slow drift uses domain-warped noise, after Inigo Quilez's technique (iquilezles.org/articles/warp).";

const MAX_PLUCKS = 6;

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAGMENT = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uSpacing;
uniform float uDpr;
uniform vec4 uPluck[${MAX_PLUCKS}];
uniform vec3 uLine;
uniform vec3 uAccent;
uniform vec3 uLeaf;
uniform vec4 uQuiet;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 uv = px / uRes.y;
  float t = uTime;
  float across = px.x / uRes.x;

  // Domain warping: noise sampled at a point pushed around by more noise.
  vec2 q = vec2(fbm(uv * 1.3 + vec2(0.0, t * 0.03)),
                fbm(uv * 1.3 + vec2(5.2, 1.3 - t * 0.02)));
  float wander = mix(1.5, 0.18, smoothstep(0.05, 0.85, across));
  float drift = (fbm(uv * 1.1 + 2.2 * q + t * 0.015) - 0.5) * uSpacing * 2.2 * wander;

  float pluck = 0.0;
  float glow = 0.0;
  for (int i = 0; i < ${MAX_PLUCKS}; i++) {
    vec4 p = uPluck[i];
    float age = t - p.z;
    if (p.w <= 0.0 || age < 0.0 || age > 4.5) continue;
    float dy = px.y - p.y;
    float dx = abs(px.x - p.x) / uDpr;
    float env = exp(-age * 1.35) * p.w;
    float reach = uSpacing * 2.2;
    float band = exp(-(dy * dy) / (2.0 * reach * reach));
    float wave = sin(dx * 0.05 - age * 16.0) * exp(-dx * 0.0035);
    pluck += env * band * wave * uSpacing * 0.85;
    glow += env * band * exp(-dx * 0.005);
  }

  float y = px.y + drift + pluck;
  float d = abs(fract(y / uSpacing + 0.5) - 0.5) * uSpacing;
  float width = 0.55 * uDpr;
  float line = 1.0 - smoothstep(width, width + 1.1 * uDpr, d);

  float heat = clamp(glow, 0.0, 1.0);
  vec3 tint = mix(uLeaf, uAccent, smoothstep(0.15, 0.9, heat));
  vec3 color = mix(uLine, tint, heat);
  // Behind the headline and copy the field falls back, so the words stay easy to read.
  vec2 inside = min(px - uQuiet.xy, uQuiet.zw - px);
  float quiet = smoothstep(0.0, 56.0 * uDpr, min(inside.x, inside.y));
  float alpha = line * mix(0.7, 1.0, heat) * mix(1.0, 0.28 + 0.4 * heat, quiet);
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
    if (!gl) return;

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
      spacing: gl.getUniformLocation(program, "uSpacing"),
      dpr: gl.getUniformLocation(program, "uDpr"),
      pluck: gl.getUniformLocation(program, "uPluck"),
      line: gl.getUniformLocation(program, "uLine"),
      accent: gl.getUniformLocation(program, "uAccent"),
      leaf: gl.getUniformLocation(program, "uLeaf"),
      quiet: gl.getUniformLocation(program, "uQuiet"),
    };

    const probe = document.createElement("span");
    probe.style.display = "none";
    canvas.parentElement?.appendChild(probe);
    const applyTheme = () => {
      if (!gl) return;
      gl.uniform3fv(u.line, readColor(probe, "--line"));
      gl.uniform3fv(u.accent, readColor(probe, "--accent"));
      gl.uniform3fv(u.leaf, readColor(probe, "--leaf"));
    };
    applyTheme();

    const plucks = new Float32Array(MAX_PLUCKS * 4);
    let nextPluck = 0;
    const started = performance.now();
    const now = () => (performance.now() - started) / 1000;

    let scale = Math.min(window.devicePixelRatio || 1, window.innerWidth < 640 ? 1 : 1.5);
    const resize = () => {
      if (!gl) return;
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(u.res, canvas.width, canvas.height);
      gl.uniform1f(u.dpr, scale);
      gl.uniform1f(u.spacing, (window.innerWidth < 640 ? 15 : 19) * scale);
      // The copy block, in canvas pixels with the origin at the bottom left.
      const copy = canvas.parentElement?.querySelector("[data-hero-copy]")?.getBoundingClientRect();
      const box = canvas.getBoundingClientRect();
      if (copy)
        gl.uniform4f(
          u.quiet,
          (copy.left - box.left - 24) * scale,
          (box.bottom - copy.bottom - 24) * scale,
          (copy.right - box.left + 24) * scale,
          (box.bottom - copy.top + 24) * scale,
        );
      else gl.uniform4f(u.quiet, 0, 0, 0, 0);
    };
    resize();

    const pluckAt = (x: number, y: number, strength: number) => {
      const i = nextPluck++ % MAX_PLUCKS;
      plucks.set([x * scale, (canvas.clientHeight - y) * scale, now(), strength], i * 4);
    };

    const draw = () => {
      if (!gl) return;
      gl.uniform1f(u.time, now());
      gl.uniform4fv(u.pluck, plucks);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const still = reduced.matches || saveData;
    let frame = 0;
    let running = false;
    let visible = true;
    let lastPointer = 0;
    let lastAmbient = 0;
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
        if (scale > 0.75) {
          scale = 0.75;
          resize();
        } else {
          stop();
          return;
        }
      }
      // With no pointer about, a string is plucked now and then so the field breathes.
      const t = now();
      if (t - lastPointer > 3 && t - lastAmbient > 2.6) {
        lastAmbient = t;
        pluckAt(
          canvas.clientWidth * (0.15 + Math.random() * 0.7),
          canvas.clientHeight * (0.15 + Math.random() * 0.7),
          0.55,
        );
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

    let lastX = 0;
    let lastY = 0;
    let lastMove = 0;
    const onPointer = (event: PointerEvent) => {
      if (!running) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
      const t = now();
      lastPointer = t;
      const speed = Math.hypot(x - lastX, y - lastY) / Math.max(0.016, t - lastMove);
      lastX = x;
      lastY = y;
      if (t - lastMove < 0.09) return;
      lastMove = t;
      pluckAt(x, y, Math.min(1, 0.25 + speed / 2400));
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
      gl = null;
    };

    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerdown", onPointer, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    canvas.addEventListener("webglcontextlost", onLost);

    if (still) {
      // One composed frame: a couple of settled ripples, no motion.
      pluckAt(canvas.clientWidth * 0.62, canvas.clientHeight * 0.4, 0.5);
      draw();
    } else {
      pluckAt(canvas.clientWidth * 0.55, canvas.clientHeight * 0.45, 0.9);
      start();
    }
    canvas.dataset.ready = "true";

    return () => {
      stop();
      observer.disconnect();
      themeObserver.disconnect();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      probe.remove();
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 -z-10 size-full opacity-0 transition-opacity duration-700 data-[ready=true]:opacity-100 [mask-image:linear-gradient(to_bottom,black_55%,transparent)]"
      />
      <span
        title={CREDIT}
        className="mono absolute bottom-3 right-4 z-10 cursor-help select-none text-[10px] text-[var(--ink-faint)] opacity-60 transition-opacity hover:opacity-100 sm:right-6"
      >
        ✦ shader
      </span>
    </>
  );
}
