"use client";

// =============================================================================
// ZuriDrive — Car Photo Gallery
// Full-width swipeable gallery for car detail page
// Desktop: main photo + thumbnails strip
// Mobile: swipeable single photo with dot indicators
// =============================================================================

import { useState, useCallback } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import type { CarPhoto } from "@prisma/client";

interface CarGalleryProps {
  photos: CarPhoto[];
  carName: string;
}

export default function CarGallery({ photos, carName }: CarGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const prev = useCallback(() => {
    setActiveIndex((i) => (i === 0 ? photos.length - 1 : i - 1));
  }, [photos.length]);

  const next = useCallback(() => {
    setActiveIndex((i) => (i === photos.length - 1 ? 0 : i + 1));
  }, [photos.length]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") prev();
    if (e.key === "ArrowRight") next();
    if (e.key === "Escape") setLightboxOpen(false);
  }, [prev, next]);

  if (photos.length === 0) {
    return (
      <div className="flex h-[clamp(280px,45vw,520px)] items-center justify-center bg-sand">
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
          <rect width="80" height="80" rx="16" fill="var(--color-surface-2)" />
          <path d="M20 52l8-18h24l8 18" stroke="var(--color-border)" strokeWidth="2.5" strokeLinecap="round" />
          <rect x="18" y="50" width="44" height="14" rx="5" fill="none" stroke="var(--color-border)" strokeWidth="2.5" />
        </svg>
      </div>
    );
  }

  return (
    <>
      {/* Main gallery */}
      <div className="bg-sand-dark" onKeyDown={handleKeyDown} tabIndex={0}>
        {/* Primary photo */}
        <div
          className="relative h-[clamp(280px,45vw,520px)] cursor-pointer overflow-hidden"
          onClick={() => setLightboxOpen(true)}
        >
          <Image
            src={photos[activeIndex].url}
            alt={`${carName} — photo ${activeIndex + 1}`}
            fill
            priority={activeIndex === 0}
            className="object-cover transition-opacity duration-[250ms]"
            sizes="100vw"
          />

          {/* Expand hint */}
          <button
            onClick={(e) => { e.stopPropagation(); setLightboxOpen(true); }}
            className="absolute right-4 top-4 flex cursor-pointer items-center gap-1.5 rounded-2xl border-none bg-black/50 p-2 font-mono text-fluid-xs text-white backdrop-blur-[8px]"
          >
            <Maximize2 size={14} />
            {photos.length} photos
          </button>

          {/* Arrow buttons */}
          {photos.length > 1 && (
            <>
              <GalleryArrow direction="left" onClick={(e) => { e.stopPropagation(); prev(); }} />
              <GalleryArrow direction="right" onClick={(e) => { e.stopPropagation(); next(); }} />
            </>
          )}

          {/* Dot indicators (mobile) */}
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
            {photos.slice(0, 8).map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setActiveIndex(i); }}
                className={`h-1.5 cursor-pointer rounded-[3px] border-none p-0 transition-all duration-[250ms] ${
                  i === activeIndex ? "w-5 bg-white" : "w-1.5 bg-white/40"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Thumbnails strip — desktop only */}
        {photos.length > 1 && (
          <div className="flex gap-1 overflow-x-auto bg-sand-dark p-2 [scrollbar-width:none]">
            {photos.map((photo, i) => (
              <button
                key={photo.id}
                onClick={() => setActiveIndex(i)}
                className={`relative h-14 w-20 shrink-0 cursor-pointer overflow-hidden rounded border-2 bg-none p-0 transition-all ${
                  i === activeIndex
                    ? "border-accent opacity-100"
                    : "border-transparent opacity-60"
                }`}
              >
                <Image
                  src={photo.url}
                  alt={`${carName} thumbnail ${i + 1}`}
                  fill
                  className="object-cover"
                  sizes="80px"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 flex animate-[fadeIn_0.2s_ease] items-center justify-center bg-black/[0.96]"
          style={{ zIndex: "var(--z-modal)" }}
          onClick={() => setLightboxOpen(false)}
          onKeyDown={handleKeyDown}
          tabIndex={0}
        >
          {/* Close */}
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute right-5 top-5 z-[1] cursor-pointer rounded-2xl border-none bg-white/10 p-2 text-white"
          >
            <X size={20} />
          </button>

          {/* Image */}
          <div
            className="relative h-[85vh] w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={photos[activeIndex].url}
              alt={`${carName} — photo ${activeIndex + 1}`}
              fill
              className="object-contain"
              sizes="90vw"
            />
          </div>

          {/* Arrows */}
          {photos.length > 1 && (
            <>
              <GalleryArrow direction="left" onClick={(e) => { e.stopPropagation(); prev(); }} large />
              <GalleryArrow direction="right" onClick={(e) => { e.stopPropagation(); next(); }} large />
            </>
          )}

          {/* Counter */}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 font-mono text-fluid-sm text-white/60">
            {activeIndex + 1} / {photos.length}
          </div>
        </div>
      )}
    </>
  );
}

function GalleryArrow({
  direction, onClick, large = false,
}: { direction: "left" | "right"; onClick: (e: React.MouseEvent) => void; large?: boolean }) {
  const isLeft = direction === "left";
  return (
    <button
      onClick={onClick}
      aria-label={isLeft ? "Previous photo" : "Next photo"}
      // Hover was two handlers writing to element.style; hover: does it in CSS.
      className={`absolute top-1/2 z-[2] flex -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-none bg-black/50 text-white backdrop-blur-[8px] transition-colors hover:bg-black/75 ${
        isLeft ? "left-4" : "right-4"
      } ${large ? "h-12 w-12" : "h-9 w-9"}`}
    >
      {isLeft ? <ChevronLeft size={large ? 22 : 18} /> : <ChevronRight size={large ? 22 : 18} />}
    </button>
  );
}
