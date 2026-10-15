import { useRef, useState, type PointerEvent } from "react";
import { Box, CircularProgress, Typography } from "@mui/material";
import { regionColor, type MapRegion, type Rect } from "./mapsApi";

/** The state accents include a CSS variable, which MUI's alpha() cannot parse. */
const tint = (color: string, percent: number) =>
  `color-mix(in srgb, ${color} ${percent}%, transparent)`;

type Props = {
  imageUrl: string | null;
  regions: MapRegion[];
  selectedId: number | null;
  onSelect: (region: MapRegion) => void;
  /** On: dragging draws a new rectangle instead of selecting. */
  drawing: boolean;
  onDrawn: (rect: Rect) => void;
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** Below this (as a fraction of the image) a drag is a click, not a sector. */
const MIN_SIDE = 0.01;

/**
 * The map with its sectors on top. Everything is positioned in percentages of
 * the image, so the sectors stay on the same spot at any width.
 *
 * Drawing is plain pointer events with pointer capture: it works the same with
 * a mouse and a finger, and needs no canvas library.
 */
export default function MapCanvas({ imageUrl, regions, selectedId, onSelect, drawing, onDrawn }: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<Rect | null>(null);

  function point(event: PointerEvent) {
    const box = layerRef.current!.getBoundingClientRect();
    return {
      x: clamp((event.clientX - box.left) / box.width),
      y: clamp((event.clientY - box.top) / box.height),
    };
  }

  function rectFrom(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(a.x - b.x),
      h: Math.abs(a.y - b.y),
    };
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!drawing) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const p = point(event);
    setStart(p);
    setDraft({ ...p, w: 0, h: 0 });
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drawing || !start) return;
    setDraft(rectFrom(start, point(event)));
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!drawing || !start) return;
    const rect = rectFrom(start, point(event));
    setStart(null);
    setDraft(null);
    if (rect.w >= MIN_SIDE && rect.h >= MIN_SIDE) onDrawn(rect);
  }

  if (!imageUrl) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", minHeight: 240 }}>
        <CircularProgress />
      </Box>
    );
  }

  const pct = (value: number) => `${value * 100}%`;

  return (
    <Box
      sx={{
        position: "relative",
        borderRadius: "14px",
        overflow: "hidden",
        border: "1px solid var(--border)",
        lineHeight: 0,
        userSelect: "none",
      }}
    >
      <Box
        component="img"
        src={imageUrl}
        alt=""
        draggable={false}
        sx={{ width: "100%", height: "auto", display: "block" }}
      />

      <Box
        ref={layerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          setStart(null);
          setDraft(null);
        }}
        sx={{
          position: "absolute",
          inset: 0,
          cursor: drawing ? "crosshair" : "default",
          // While drawing the finger draws instead of scrolling the page.
          touchAction: drawing ? "none" : "auto",
        }}
      >
        {regions.map((region) => {
          const accent = regionColor(region);
          const selected = region.id === selectedId;
          return (
            <Box
              key={region.id}
              role="button"
              aria-label={region.title}
              onClick={() => !drawing && onSelect(region)}
              sx={{
                position: "absolute",
                left: pct(region.x),
                top: pct(region.y),
                width: pct(region.w),
                height: pct(region.h),
                border: `${selected ? 3 : 2}px solid ${accent}`,
                bgcolor: tint(accent, selected ? 32 : 18),
                borderRadius: "6px",
                cursor: drawing ? "crosshair" : "pointer",
                // Sectors do not swallow the drag of a new one drawn on top.
                pointerEvents: drawing ? "none" : "auto",
                boxShadow: selected ? `0 0 0 3px ${tint(accent, 35)}` : "none",
                transition: "background-color 120ms",
                "&:hover": { bgcolor: tint(accent, 30) },
              }}
            >
              <Typography
                component="span"
                sx={{
                  position: "absolute",
                  top: 4,
                  left: 4,
                  maxWidth: "calc(100% - 8px)",
                  px: 0.75,
                  py: 0.25,
                  borderRadius: "4px",
                  bgcolor: accent,
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  lineHeight: 1.4,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {region.title}
              </Typography>
            </Box>
          );
        })}

        {draft && (
          <Box
            sx={{
              position: "absolute",
              left: pct(draft.x),
              top: pct(draft.y),
              width: pct(draft.w),
              height: pct(draft.h),
              border: "2px dashed #fff",
              outline: "2px dashed rgba(0,0,0,0.6)",
              bgcolor: "rgba(255,255,255,0.15)",
              pointerEvents: "none",
            }}
          />
        )}
      </Box>
    </Box>
  );
}
