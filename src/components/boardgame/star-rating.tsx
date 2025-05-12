'use client';

import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface StarRatingProps {
  rating: number;
  setRating?: (rating: number) => void;
  readOnly?: boolean;
  size?: number; // size of the star icon
  totalStars?: number;
  className?: string;
  iconClassName?: string;
}

export function StarRating({
  rating,
  setRating,
  readOnly = false,
  size = 24,
  totalStars = 5,
  className,
  iconClassName,
}: StarRatingProps) {
  const [hoverRating, setHoverRating] = useState(0);

  const handleStarClick = (index: number) => {
    if (!readOnly && setRating) {
      setRating(index);
    }
  };

  const handleMouseEnter = (index: number) => {
    if (!readOnly) {
      setHoverRating(index);
    }
  };

  const handleMouseLeave = () => {
    if (!readOnly) {
      setHoverRating(0);
    }
  };

  const currentRating = hoverRating || rating;

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {[...Array(totalStars)].map((_, i) => {
        const starValue = i + 1;
        return (
          <Star
            key={starValue}
            size={size}
            className={cn(
              'cursor-pointer transition-colors duration-150 ease-in-out',
              starValue <= currentRating ? 'text-accent fill-accent' : 'text-muted-foreground/50',
              readOnly ? 'cursor-default' : 'hover:text-accent/80 hover:fill-accent/80',
              iconClassName
            )}
            onClick={() => handleStarClick(starValue)}
            onMouseEnter={() => handleMouseEnter(starValue)}
            onMouseLeave={handleMouseLeave}
            aria-label={readOnly ? `${rating} out of ${totalStars} stars` : `Rate ${starValue} out of ${totalStars} stars`}
          />
        );
      })}
    </div>
  );
}
