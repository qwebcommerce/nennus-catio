"use client";
import { useState } from "react";
import Image from "next/image";
import { ImageOff } from "lucide-react";
export function Photo({
  src,
  alt,
  className = "",
  priority = false,
  unavailableLabel,
  sizes = "(max-width: 800px) 100vw, 70vw",
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
  unavailableLabel?: string;
  sizes?: string;
}) {
  const [failed, setFailed] = useState("");
  const uploaded = src.startsWith("/api/media/");
  const valid =
    !!src &&
    (src.startsWith("/images/") ||
      uploaded ||
      src.startsWith("data:image/") ||
      src.startsWith("https:"));
  const image = !valid || failed === src ? "/images/essentials.png" : src;
  if ((!valid || failed === src) && unavailableLabel)
    return (
      <div
        className={`${className} photo-unavailable`}
        role="img"
        aria-label={unavailableLabel}
      >
        <ImageOff size={26} />
        <span>{unavailableLabel}</span>
      </div>
    );
  return (
    <Image
      src={image}
      alt={alt}
      width={1440}
      height={900}
      sizes={sizes}
      className={className}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      onError={() => setFailed(src)}
      // Uploaded images are already resized WebP served by the API (6b).
      unoptimized={image.startsWith("data:") || image.startsWith("https:") || image.startsWith("/api/media/")}
    />
  );
}
