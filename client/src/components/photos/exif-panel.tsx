import type { ExifData } from 'imagiverse-shared';
import {
  Aperture,
  Calendar,
  Camera,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Focus,
  Gauge,
  SunDim,
  Timer,
  Zap,
} from 'lucide-react';
import { useState } from 'react';

interface ExifPanelProps {
  exifData: ExifData;
}

// ── Formatting helpers ──────────────────────────────────────────────────────

/** Strip common suffixes like "Inc.", "Corporation" from camera make. */
function cleanMake(make: string): string {
  return make
    .replace(/\s*(Inc\.?|Corporation|Co\.?,?\s*Ltd\.?|CORPORATION)\s*$/i, '')
    .trim();
}

/** Format camera make + model into a single readable string. */
function formatCamera(exif: ExifData): string | null {
  if (!exif.cameraModel) return null;
  const make = exif.cameraMake ? cleanMake(exif.cameraMake) : null;
  let model = exif.cameraModel;
  // Strip redundant make prefix from model
  if (make && model.toUpperCase().startsWith(make.toUpperCase())) {
    model = model.slice(make.length).trim();
  }
  return make ? `${make} ${model}` : model;
}

/** Format focal length with 35mm equivalent if different. */
function formatFocalLength(exif: ExifData): string | null {
  if (exif.focalLength == null) return null;
  const fl = `${Math.round(exif.focalLength)}mm`;
  if (exif.focalLengthIn35mm != null && exif.focalLengthIn35mm !== Math.round(exif.focalLength)) {
    return `${fl} (${Math.round(exif.focalLengthIn35mm)}mm eq)`;
  }
  return fl;
}

/** Format date from ISO string to locale date. */
function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ── Component ───────────────────────────────────────────────────────────────

export function ExifPanel({ exifData }: ExifPanelProps) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem('exif-panel-open') !== 'false';
    } catch {
      return true;
    }
  });

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem('exif-panel-open', String(next));
    } catch {
      // ignore storage errors
    }
  };

  const camera = formatCamera(exifData);
  const focalLength = formatFocalLength(exifData);

  const rows: Array<{ icon: React.ReactNode; label: string; value: string }> = [];

  if (camera) rows.push({ icon: <Camera className="h-3.5 w-3.5" />, label: 'Camera', value: camera });
  if (exifData.lensModel) rows.push({ icon: <Focus className="h-3.5 w-3.5" />, label: 'Lens', value: exifData.lensModel });
  if (focalLength) rows.push({ icon: <CircleDot className="h-3.5 w-3.5" />, label: 'Focal', value: focalLength });
  if (exifData.fNumber != null) rows.push({ icon: <Aperture className="h-3.5 w-3.5" />, label: 'Aperture', value: `ƒ/${exifData.fNumber}` });
  if (exifData.exposureTime) rows.push({ icon: <Timer className="h-3.5 w-3.5" />, label: 'Shutter', value: exifData.exposureTime });
  if (exifData.iso != null) rows.push({ icon: <Gauge className="h-3.5 w-3.5" />, label: 'ISO', value: String(exifData.iso) });
  if (exifData.flash != null) rows.push({ icon: <Zap className="h-3.5 w-3.5" />, label: 'Flash', value: exifData.flash ? 'On' : 'Off' });
  if (exifData.exposureProgram) rows.push({ icon: <SunDim className="h-3.5 w-3.5" />, label: 'Mode', value: exifData.exposureProgram });
  if (exifData.whiteBalance) rows.push({ icon: <SunDim className="h-3.5 w-3.5" />, label: 'White Bal', value: exifData.whiteBalance });
  if (exifData.dateTimeOriginal) rows.push({ icon: <Calendar className="h-3.5 w-3.5" />, label: 'Taken', value: formatDate(exifData.dateTimeOriginal) });

  if (rows.length === 0) return null;

  return (
    <div className="mt-2 mb-4">
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Camera className="h-4 w-4" />
          Camera Details
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="mt-1 rounded-lg bg-muted/30 px-3 py-2 space-y-1.5">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground shrink-0">{row.icon}</span>
              <span className="text-muted-foreground w-16 shrink-0">{row.label}</span>
              <span className="font-medium truncate">{row.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
