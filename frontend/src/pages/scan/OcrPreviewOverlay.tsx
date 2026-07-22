import { useMemo } from 'react';
import { cn } from '../../lib/utils';
import {
  findOcrBoxesForValue,
  type OcrWordBox,
  type ReviewReason,
} from '../../lib/ocrHighlight';

type Props = {
  previewUrl: string | null;
  words?: OcrWordBox[] | null;
  highlightValue?: unknown;
  highlightField?: string | null;
  onSelectField?: (field: string) => void;
  reasons?: ReviewReason[] | null;
  pageWidth?: number;
  pageHeight?: number;
  className?: string;
};

/**
 * Source-image preview with OCR bounding-box overlays for the active flagged field.
 */
export function OcrPreviewOverlay({
  previewUrl,
  words,
  highlightValue,
  highlightField,
  onSelectField,
  reasons,
  pageWidth,
  pageHeight,
  className,
}: Props) {
  const fieldKeys = useMemo(() => {
    const keys: string[] = [];
    for (const r of reasons || []) {
      if (r.field && !keys.includes(r.field)) keys.push(r.field);
    }
    return keys;
  }, [reasons]);

  const boxes = useMemo(
    () =>
      findOcrBoxesForValue(words, highlightValue, {
        pageWidth,
        pageHeight,
      }),
    [words, highlightValue, pageWidth, pageHeight]
  );

  if (!previewUrl) {
    return (
      <div className={cn('rounded-lg border border-border bg-bg-subtle p-4 text-xs text-text-secondary', className)}>
        No preview image — OCR highlights unavailable for this file type.
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {fieldKeys.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {fieldKeys.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => onSelectField?.(f)}
              className={cn(
                'text-[10px] px-2 py-0.5 rounded border transition-colors',
                highlightField === f
                  ? 'bg-accent/20 border-accent text-accent'
                  : 'border-border text-text-secondary hover:border-accent/50'
              )}
            >
              {f.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      )}
      <div className="relative inline-block max-w-full rounded-lg overflow-hidden border border-border bg-black/40">
        <img
          src={previewUrl}
          alt="Invoice preview"
          className="max-h-72 max-w-full object-contain block"
        />
        {boxes.map((b, i) => (
          <div
            key={`${b.text}-${i}`}
            title={b.text}
            className="absolute pointer-events-none border-2 border-amber-400 bg-amber-400/25 rounded-sm"
            style={{
              left: `${b.left}%`,
              top: `${b.top}%`,
              width: `${b.width}%`,
              height: `${b.height}%`,
            }}
          />
        ))}
      </div>
      {boxes.length === 0 && words && words.length > 0 && (
        <p className="text-[10px] text-text-secondary">
          No OCR box matched this field value — check the image manually.
        </p>
      )}
      {(!words || words.length === 0) && (
        <p className="text-[10px] text-text-secondary">
          Enable OCR (`OCR_ENABLED=1`) on scan to get location highlights.
        </p>
      )}
    </div>
  );
}
