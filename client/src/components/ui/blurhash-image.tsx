import { decode } from 'blurhash';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

const BLURHASH_WIDTH = 32;
const BLURHASH_HEIGHT = 32;

interface BlurhashImageProps {
  blurhash: string | null;
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  loading?: 'lazy' | 'eager';
}

export function BlurhashImage({
  blurhash,
  src,
  alt,
  className,
  style,
  loading = 'lazy',
}: BlurhashImageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !blurhash) return;

    try {
      const pixels = decode(blurhash, BLURHASH_WIDTH, BLURHASH_HEIGHT);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = BLURHASH_WIDTH;
      canvas.height = BLURHASH_HEIGHT;
      const imageData = ctx.createImageData(BLURHASH_WIDTH, BLURHASH_HEIGHT);
      imageData.data.set(pixels);
      ctx.putImageData(imageData, 0, 0);
    } catch {
      // invalid blurhash string — silently ignore
    }
  }, [blurhash]);

  return (
    <div className={cn('relative overflow-hidden bg-muted', className)} style={style}>
      {blurhash && (
        <canvas
          ref={canvasRef}
          className={cn(
            'absolute inset-0 h-full w-full object-cover',
            loaded && 'hidden',
          )}
          aria-hidden
        />
      )}
      <img
        src={src}
        alt={alt}
        loading={loading}
        onLoad={() => setLoaded(true)}
        className={cn(
          'absolute inset-0 h-full w-full object-cover',
          !loaded && 'invisible',
        )}
      />
    </div>
  );
}
