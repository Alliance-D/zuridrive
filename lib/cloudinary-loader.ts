// =============================================================================
// ZuriDrive — Cloudinary image loader for next/image
//
// Every user-uploaded photo on the platform already lives on Cloudinary, which
// resizes and re-encodes on its own CDN. Sending those through Next's image
// optimizer would mean paying our host to redo work Cloudinary does better and
// closer to the user.
//
// So we keep next/image for the things it is genuinely good at — lazy loading,
// reserved space so the page doesn't jump, correct srcset — and hand the actual
// transformation back to Cloudinary via this loader.
//
// Anything that isn't a Cloudinary URL passes through untouched, so a seeded
// placeholder or a legacy URL still renders instead of 404ing on a mangled path.
// =============================================================================

"use client";

import type { ImageLoaderProps } from "next/image";

/** Marks the point in a Cloudinary URL where transformations are inserted. */
const UPLOAD_SEGMENT = "/upload/";

export default function cloudinaryLoader({
  src,
  width,
  quality,
}: ImageLoaderProps): string {
  if (!src.includes("res.cloudinary.com") || !src.includes(UPLOAD_SEGMENT)) {
    return src;
  }

  const [prefix, rest] = src.split(UPLOAD_SEGMENT);

  // A URL that already carries transformations is left alone — re-wrapping it
  // would silently override whatever the caller asked for.
  if (/^(?:[a-z]_[^/]+,?)+\//.test(rest)) return src;

  const params = [
    "f_auto", // let Cloudinary pick webp/avif per browser
    "c_limit", // never upscale past the original
    `w_${width}`,
    `q_${quality ?? "auto"}`,
  ].join(",");

  return `${prefix}${UPLOAD_SEGMENT}${params}/${rest}`;
}
