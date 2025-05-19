
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
  // State to hold the source for NextImage.
  // Initialize with initialSrc if available, otherwise use fallbackSrc.
  const [imageSrcToRender, setImageSrcToRender] = useState(initialSrc || fallbackSrc);

  // Effect to update imageSrcToRender if the initialSrc or fallbackSrc props change.
  useEffect(() => {
    if (initialSrc) {
      setImageSrcToRender(initialSrc);
    } else {
      // If initialSrc becomes null/undefined, or was never provided, ensure we use fallbackSrc.
      setImageSrcToRender(fallbackSrc);
    }
  }, [initialSrc, fallbackSrc]); // Rerun this effect only if these props change.

  return (
    <NextImage
      src={imageSrcToRender}
      alt={alt}
      onError={() => {
        // If the current imageSrcToRender (which might be initialSrc) fails to load,
        // and we are not already displaying the fallbackSrc, switch to fallbackSrc.
        // This prevents a loop if the fallbackSrc itself is somehow problematic.
        if (imageSrcToRender !== fallbackSrc) {
          setImageSrcToRender(fallbackSrc);
        }
      }}
      {...props} // Spreads other props
    />
  );
}
