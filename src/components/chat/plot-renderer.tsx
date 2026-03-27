"use client";

import { useState } from "react";
import { Maximize2, X } from "lucide-react";

interface PlotRendererProps {
  plots: string[];
}

export function PlotRenderer({ plots }: PlotRendererProps) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  if (!plots || plots.length === 0) return null;

  return (
    <>
      <div className="mt-3 flex flex-col gap-3">
        {plots.map((src, i) => (
          <div
            key={i}
            className="group relative overflow-hidden rounded-lg border border-border bg-muted/30"
          >
            <img
              src={src}
              alt={`Python plot ${i + 1}`}
              className="max-w-full"
              loading="lazy"
            />
            <button
              onClick={() => setLightboxSrc(src)}
              className="absolute right-2 top-2 rounded bg-black/50 p-1 opacity-0 transition-opacity group-hover:opacity-100"
              title="View full size"
            >
              <Maximize2 className="size-3.5 text-white" />
            </button>
          </div>
        ))}
      </div>

      {lightboxSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setLightboxSrc(null)}
        >
          <button
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2"
            onClick={() => setLightboxSrc(null)}
          >
            <X className="size-5 text-white" />
          </button>
          <img
            src={lightboxSrc}
            alt="Plot full size"
            className="max-h-[90vh] max-w-[90vw] rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
