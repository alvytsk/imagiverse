import { Camera } from 'lucide-react';

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="sticky bottom-0 z-30 border-t border-border/40 bg-card/80 shadow-[0_-1px_3px_0_oklch(0_0_0/0.06),0_-4px_12px_0_oklch(0_0_0/0.04)] backdrop-blur-xl dark:shadow-[0_-1px_3px_0_oklch(0_0_0/0.2),0_-4px_12px_0_oklch(0_0_0/0.15)]">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Camera className="h-3.5 w-3.5" />
            <span>&copy; {year} Imagiverse</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Share your world through photos.
          </p>
        </div>
      </div>
    </footer>
  );
}
