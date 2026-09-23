"use client";

import { startTransition, useActionState, useCallback, useEffect, useRef, useState } from "react";
import { type ProfileState, removeAvatar, uploadAvatar } from "@/lib/profile-actions";

const empty: ProfileState = {};

/** What the browser can decode for us here; HEIC and friends are not reliable. */
const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];
const MAX_FILE_BYTES = 15 * 1024 * 1024;
/** Large photos are scaled down on load; the crop never needs more than this. */
const MAX_SOURCE_EDGE = 2048;
const OUTPUT = 512;
const MAX_ZOOM = 5;

interface View {
  zoom: number;
  x: number;
  y: number;
  /** Quarter turns, 0–3. */
  turns: number;
}
const START: View = { zoom: 1, x: 0, y: 0, turns: 0 };

async function loadSource(file: File): Promise<ImageBitmap> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest <= MAX_SOURCE_EDGE) return bitmap;
  const k = MAX_SOURCE_EDGE / longest;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * k);
  canvas.height = Math.round(bitmap.height * k);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return createImageBitmap(canvas);
}

/** Scale at which the (rotated) image just covers a square of `size`. */
const coverScale = (img: ImageBitmap, turns: number, size: number) => {
  const [w, h] = turns % 2 ? [img.height, img.width] : [img.width, img.height];
  return Math.max(size / w, size / h);
};

/** Keeps the image covering the whole crop: no empty edges can be panned into view. */
function clamp(view: View, img: ImageBitmap, size: number): View {
  const scale = coverScale(img, view.turns, size) * view.zoom;
  const [w, h] = view.turns % 2 ? [img.height, img.width] : [img.width, img.height];
  const maxX = Math.max(0, (w * scale - size) / 2);
  const maxY = Math.max(0, (h * scale - size) / 2);
  return {
    ...view,
    x: Math.min(maxX, Math.max(-maxX, view.x)),
    y: Math.min(maxY, Math.max(-maxY, view.y)),
  };
}

/** Draws the image as the view says onto a square canvas of `size` device-independent pixels. */
function paint(
  ctx: CanvasRenderingContext2D,
  img: ImageBitmap,
  view: View,
  size: number,
  pixelRatio: number,
) {
  const scale = coverScale(img, view.turns, size) * view.zoom;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.translate(size / 2 + view.x, size / 2 + view.y);
  ctx.rotate((view.turns * Math.PI) / 2);
  ctx.scale(scale, scale);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);
}

function exportBlob(img: ImageBitmap, view: View, size: number): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT;
  canvas.height = OUTPUT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  // Same view, rendered at the output size: what you saw is what is saved.
  paint(ctx, img, view, size, OUTPUT / size);
  return new Promise((resolve) => {
    canvas.toBlob(
      (webp) => {
        // Browsers without a WebP encoder hand back PNG; JPEG keeps it small.
        if (webp && webp.type === "image/webp") return resolve(webp);
        canvas.toBlob((jpeg) => resolve(jpeg), "image/jpeg", 0.9);
      },
      "image/webp",
      0.9,
    );
  });
}

export function AvatarEditor({
  name,
  image,
  custom,
}: {
  name: string;
  image: string | null;
  /** Whether the current picture is one uploaded here (and so can be removed). */
  custom: boolean;
}) {
  const [uploadState, upload, uploading] = useActionState(uploadAvatar, empty);
  const [removeState, remove, removing] = useActionState(removeAvatar, empty);
  const [source, setSource] = useState<ImageBitmap | null>(null);
  const [view, setView] = useState<View>(START);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState(288);

  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);

  // The outcome of whichever action ran last, not both at once.
  const [notice, setNotice] = useState<ProfileState>({});
  useEffect(() => setNotice(uploadState), [uploadState]);
  useEffect(() => setNotice(removeState), [removeState]);
  const initial = (name || "?").trim().charAt(0).toUpperCase();

  const update = useCallback(
    (next: (v: View) => View) => {
      if (!source) return;
      setView((v) => clamp(next(v), source, size));
    },
    [source, size],
  );

  // The crop square fits small phones: 288px, or less when the screen is narrower.
  useEffect(() => {
    const fit = () => setSize(Math.min(288, Math.floor(window.innerWidth * 0.72)));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  // A smaller crop area (a rotated phone) must still be fully covered.
  useEffect(() => {
    if (source) setView((v) => clamp(v, source, size));
  }, [source, size]);

  // Resizing a canvas reallocates it, so that happens only when the size does;
  // panning and zooming just repaint.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * ratio);
    canvas.height = Math.round(size * ratio);
  }, [source, size]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !source) return;
    const ratio = window.devicePixelRatio || 1;
    const frame = requestAnimationFrame(() => paint(ctx, source, view, size, ratio));
    return () => cancelAnimationFrame(frame);
  }, [source, view, size]);

  // Wheel zoom needs a non-passive listener to keep the page from scrolling.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.0015);
      update((v) => {
        const zoom = Math.min(MAX_ZOOM, Math.max(1, v.zoom * factor));
        const k = zoom / v.zoom;
        return { ...v, zoom, x: v.x * k, y: v.y * k };
      });
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [source, update]);

  const close = useCallback(() => {
    dialogRef.current?.close();
    setSource((current) => {
      current?.close();
      return null;
    });
    pointers.current.clear();
    pinch.current = null;
  }, []);

  // A successful upload closes the editor.
  useEffect(() => {
    if (uploadState.ok) close();
  }, [uploadState, close]);

  const choose = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!ACCEPT.includes(file.type))
      return setError("Choose a PNG, JPEG, WebP, GIF or AVIF image.");
    if (file.size > MAX_FILE_BYTES)
      return setError("That image is over 15 MB. Choose a smaller one.");
    try {
      const bitmap = await loadSource(file);
      setView(START);
      setSource(bitmap);
      dialogRef.current?.showModal();
    } catch {
      setError("That image could not be opened. Try another file.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const zoomTo = (zoom: number) =>
    update((v) => {
      const next = Math.min(MAX_ZOOM, Math.max(1, zoom));
      const k = next / v.zoom;
      return { ...v, zoom: next, x: v.x * k, y: v.y * k };
    });

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a!.x - b!.x, a!.y - b!.y), zoom: view.zoom };
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const last = pointers.current.get(event.pointerId);
    if (!last) return;
    const dx = event.clientX - last.x;
    const dy = event.clientY - last.y;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      zoomTo((pinch.current.zoom * distance) / pinch.current.distance);
      return;
    }
    update((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    const step = event.shiftKey ? 32 : 8;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      update((v) => ({ ...v, x: v.x + move[0], y: v.y + move[1] }));
    } else if (event.key === "+" || event.key === "=") zoomTo(view.zoom * 1.1);
    else if (event.key === "-") zoomTo(view.zoom / 1.1);
    else if (event.key.toLowerCase() === "r") update((v) => ({ ...v, turns: (v.turns + 1) % 4 }));
  };

  const save = async () => {
    if (!source) return;
    setError(null);
    const blob = await exportBlob(source, view, size);
    if (!blob) return setError("This browser could not export the image.");
    const data = new FormData();
    data.set("avatar", new File([blob], "avatar", { type: blob.type }));
    startTransition(() => upload(data));
  };

  const busy = uploading || removing;
  const message = error ?? notice.error ?? notice.ok;

  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
      {image ? (
        // An avatar URL: small, already sized, not worth the image optimiser.
        // biome-ignore lint/performance/noImgElement: see above.
        <img
          src={image}
          alt=""
          width={80}
          height={80}
          referrerPolicy="no-referrer"
          className="size-20 shrink-0 rounded-full border border-[var(--line)] object-cover"
        />
      ) : (
        <span className="flex size-20 shrink-0 items-center justify-center rounded-full bg-[var(--accent-wash)] text-2xl text-[var(--accent)]">
          {initial}
        </span>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer bg-[var(--ink)] px-4 py-2 text-sm text-[var(--paper)] transition-opacity hover:opacity-85 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--accent)]">
            Upload a picture
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT.join(",")}
              className="sr-only"
              disabled={busy}
              onChange={(event) => void choose(event.target.files?.[0])}
            />
          </label>
          {custom && (
            <form action={remove}>
              <button
                type="submit"
                disabled={busy}
                className="text-sm text-[var(--ink-soft)] underline underline-offset-4 hover:text-[var(--accent)] disabled:opacity-60"
              >
                {removing ? "Removing…" : "Remove"}
              </button>
            </form>
          )}
        </div>
        <p className="text-xs text-[var(--ink-faint)]">
          PNG, JPEG, WebP, GIF or AVIF. You can crop, zoom and rotate before saving.
        </p>
        {message && (
          <p
            className={`text-sm ${error || notice.error ? "text-[var(--accent)]" : "text-[var(--leaf)]"}`}
            role="status"
          >
            {message}
          </p>
        )}
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="avatar-editor-title"
        onCancel={(event) => {
          event.preventDefault();
          if (!uploading) close();
        }}
        className="m-auto w-[min(26rem,calc(100vw-2rem))] border border-[var(--line)] bg-[var(--sheet)] p-0 text-[var(--ink)] shadow-2xl backdrop:bg-[color-mix(in_srgb,var(--ink)_45%,transparent)]"
      >
        <div className="border-b border-[var(--line)] px-5 py-3">
          <h2 id="avatar-editor-title" className="text-base">
            Crop your picture
          </h2>
        </div>

        <div className="space-y-4 p-5">
          <div
            // Clips the dimming around the circle to the crop square.
            className="relative mx-auto touch-none select-none overflow-hidden"
            style={{ width: size, height: size }}
          >
            <canvas
              ref={canvasRef}
              tabIndex={0}
              role="img"
              aria-label="Crop area. Drag or use the arrow keys to move, the mouse wheel or plus and minus to zoom, R to rotate."
              style={{ width: size, height: size }}
              className="block cursor-grab bg-[var(--paper)] outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={onKeyDown}
            />
            {/* The circle is what shows everywhere; outside it is dimmed. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] ring-1 ring-white/70"
            />
          </div>

          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="text-xs text-[var(--ink-faint)]">
              −
            </span>
            <input
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={view.zoom}
              aria-label="Zoom"
              onChange={(event) => zoomTo(Number(event.target.value))}
              className="flex-1 accent-[var(--accent)]"
            />
            <span aria-hidden="true" className="text-xs text-[var(--ink-faint)]">
              +
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => update((v) => ({ ...v, turns: (v.turns + 1) % 4 }))}
              className="border border-[var(--line)] px-3 py-1.5 hover:border-[var(--ink-faint)]"
            >
              Rotate
            </button>
            <button
              type="button"
              onClick={() => update(() => START)}
              className="border border-[var(--line)] px-3 py-1.5 hover:border-[var(--ink-faint)]"
            >
              Reset
            </button>
          </div>

          {(error || uploadState.error) && (
            <p className="text-sm text-[var(--accent)]" role="status">
              {error ?? uploadState.error}
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[var(--line)] px-5 py-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={close}
            disabled={uploading}
            className="px-4 py-2 text-sm text-[var(--ink-soft)] hover:text-[var(--ink)] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={uploading || !source}
            className="bg-[var(--ink)] px-4 py-2 text-sm text-[var(--paper)] disabled:opacity-60"
          >
            {uploading ? "Saving…" : "Save picture"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
