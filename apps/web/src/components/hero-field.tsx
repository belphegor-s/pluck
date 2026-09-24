"use client";

import { useEffect, useRef } from "react";

/**
 * The hero background: a slow aurora. Two soft lights in the theme's accent
 * and leaf colours drift across the page and lean, gently, towards the
 * pointer, with a whisper of grain so the gradients never band.
 *
 * It is decoration, so it must never cost the page anything:
 * - no WebGL, a failed compile or a lost context: the canvas stays empty;
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

float hash(vec2 p) {
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// A soft light: brightest at its centre, fading smoothly to nothing.
float glow(vec2 p, vec2 c, float r) {
  float d = length(p - c) / r;
  return exp(-d * d);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float t = uTime * 0.05;

  // Gentle warping keeps the edges of each light organic rather than round.
  vec2 w = vec2(noise(p * 1.6 + t), noise(p * 1.6 - t + 7.3)) - 0.5;
  vec2 q = p + w * 0.35;

  vec2 pointer = vec2(uPointer.x * aspect, uPointer.y);
  vec2 ca = vec2(aspect * (0.72 + 0.10 * sin(t * 1.7)), 0.62 + 0.10 * cos(t * 1.3));
  vec2 cb = vec2(aspect * (0.22 + 0.10 * cos(t * 1.1)), 0.30 + 0.08 * sin(t * 1.9));
  ca = mix(ca, pointer, 0.12);
  cb = mix(cb, pointer, 0.06);

  float a = glow(q, ca, 0.55 * aspect * 0.55 + 0.25);
  float b = glow(q, cb, 0.50 * aspect * 0.50 + 0.22);

  vec3 color = (uA * a + uB * b) / max(a + b, 0.0001);
  float alpha = clamp(max(a, b) * uStrength, 0.0, 1.0);

  // Grain: tiny per-pixel noise that breaks up banding in the soft ramps.
  float grain = (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) * 0.035;
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
      pointer: gl.getUniformLocation(program, "uPointer"),
      a: gl.getUniformLocation(program, "uA"),
      b: gl.getUniformLocation(program, "uB"),
      strength: gl.getUniformLocation(program, "uStrength"),
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
      gl.uniform1f(u.strength, dark ? 0.26 : 0.16);
    };
    applyTheme();

    // The glow follows the pointer through an eased value, never jumping.
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
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 -z-10 size-full opacity-0 transition-opacity duration-1000 data-[ready=true]:opacity-100 [mask-image:linear-gradient(to_bottom,black_60%,transparent)]"
    />
  );
}
