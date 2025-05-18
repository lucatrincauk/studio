
'use client';

import NextImage, { type ImageProps as NextImageProps } from 'next/image';
import { useState, useEffect } from 'react';

// Omit 'onError' and 'src' from NextImageProps for our SafeImageProps,
// as we'll manage them internally. 'alt' is required.
interface SafeImageProps extends Omit<NextImageProps, 'onError' | 'src' | 'alt'> {
  src?: string | null; // Allow src to be potentially null or undefined
  alt: string;
  fallbackSrc: string;
}

export function SafeImage({
  src: initialSrc,
  alt,
  fallbackSrc,
  ...props // Captures other props like fill, sizes, className, data-ai-hint, priority, etc.
}: SafeImageProps) {
  const [currentSrc, setCurrentSrc] = useState(initialSrc || fallbackSrc);

  useEffect(() => {
    // Update currentSrc if initialSrc prop changes or if initialSrc was undefined and then defined
    if (initialSrc && initialSrc !== currentSrc) {
      setCurrentSrc(initialSrc);
    } else if (!initialSrc && currentSrc !== fallbackSrc) {
      // If initialSrc becomes null/undefined, revert to fallback
      setCurrentSrc(fallbackSrc);
    }
  }, [initialSrc, fallbackSrc, currentSrc]);

  return (
    <NextImage
      src={currentSrc}
      alt={alt}
      onError={() => {
        // Only set to fallback if not already fallback, to prevent potential loops
        // if fallback itself errors (though unlikely for a placeholder).
        if (currentSrc !== fallbackSrc) {
          setCurrentSrc(fallbackSrc);
        }
      }}
      {...props} // Spreads other props
    />
  );
}
