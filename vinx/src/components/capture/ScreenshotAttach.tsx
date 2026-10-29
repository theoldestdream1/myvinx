import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ImagePlus, X } from 'lucide-react';

interface ButtonProps {
  onFile: (file: File | undefined) => void;
  disabled?: boolean;
  className?: string;
}

/** Icon button that opens the file picker (on phones this offers camera / gallery). */
export function ScreenshotButton({ onFile, disabled, className }: ButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/heic"
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = ''; // allow re-picking the same file
        }}
      />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        title="Attach a screenshot"
        className={className ?? 'h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10'}
      >
        <ImagePlus className="w-4 h-4" />
      </Button>
    </>
  );
}

export function ScreenshotPreview({ url, onRemove }: { url: string | null; onRemove: () => void }) {
  if (!url) return null;
  return (
    <div className="relative inline-block">
      <img src={url} alt="Attached screenshot" className="h-24 rounded-md border border-border/50 object-cover" />
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove screenshot"
        className="absolute -top-2 -right-2 rounded-full bg-background border border-border p-1 text-muted-foreground hover:text-foreground"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
