import exifReader from 'exif-reader';
import type { ExifData } from 'imagiverse-shared';

// ── Exposure program labels (EXIF spec) ─────────────────────────────────────

const EXPOSURE_PROGRAMS: Record<number, string> = {
  0: 'Not Defined',
  1: 'Manual',
  2: 'Normal',
  3: 'Aperture Priority',
  4: 'Shutter Priority',
  5: 'Creative',
  6: 'Action',
  7: 'Portrait',
  8: 'Landscape',
};

// ── Metering mode labels (EXIF spec) ────────────────────────────────────────

const METERING_MODES: Record<number, string> = {
  0: 'Unknown',
  1: 'Average',
  2: 'Center-weighted',
  3: 'Spot',
  4: 'Multi-spot',
  5: 'Multi-segment',
  6: 'Partial',
  255: 'Other',
};

// ── White balance labels (EXIF spec) ────────────────────────────────────────

const WHITE_BALANCE: Record<number, string> = {
  0: 'Auto',
  1: 'Manual',
};

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert a raw exposure time (seconds) to a human-readable string.
 * Examples: 0.002 → "1/500s", 0.5 → "1/2s", 2.5 → "2.5s", 30 → "30s"
 */
export function formatExposureTime(seconds: number): string {
  if (seconds >= 1) {
    return Number.isInteger(seconds) ? `${seconds}s` : `${seconds.toFixed(1)}s`;
  }
  const denominator = Math.round(1 / seconds);
  return `1/${denominator}s`;
}

/**
 * Check if flash fired from the EXIF Flash field.
 * Bit 0 of the Flash value indicates whether the flash fired.
 */
function flashFired(flashValue: number): boolean {
  return (flashValue & 1) === 1;
}

// ── Main extraction function ────────────────────────────────────────────────

/**
 * Parses raw EXIF data from a Sharp metadata buffer and returns a curated
 * set of fields. Returns `null` if parsing fails or no useful data is found.
 *
 * GPS data is explicitly excluded (privacy-by-design).
 */
export function extractCuratedExif(exifBuffer: Buffer): ExifData | null {
  const parsed = exifReader(exifBuffer);

  const image = parsed.Image;
  const photo = parsed.Photo;

  // If neither Image nor Photo tags exist, there's nothing useful
  if (!image && !photo) return null;

  const cameraMake = image?.Make?.trim() ?? null;
  const cameraModel = image?.Model?.trim() ?? null;
  const lensMake = photo?.LensMake?.trim() ?? null;
  const lensModel = photo?.LensModel?.trim() ?? null;
  const focalLength = photo?.FocalLength ?? null;
  const focalLengthIn35mm = photo?.FocalLengthIn35mmFilm ?? null;
  const fNumber = photo?.FNumber ?? null;

  const rawExposureTime = photo?.ExposureTime ?? null;
  const exposureTime = rawExposureTime != null ? formatExposureTime(rawExposureTime) : null;

  const iso = photo?.ISOSpeedRatings ?? null;

  const rawDate = photo?.DateTimeOriginal ?? null;
  const dateTimeOriginal = rawDate instanceof Date ? rawDate.toISOString() : null;

  const rawFlash = photo?.Flash;
  const flash = rawFlash != null ? flashFired(rawFlash) : null;

  const rawExposureProgram = photo?.ExposureProgram;
  const exposureProgram =
    rawExposureProgram != null ? (EXPOSURE_PROGRAMS[rawExposureProgram] ?? null) : null;

  const rawMeteringMode = photo?.MeteringMode;
  const meteringMode = rawMeteringMode != null ? (METERING_MODES[rawMeteringMode] ?? null) : null;

  const rawWhiteBalance = photo?.WhiteBalance;
  const whiteBalance = rawWhiteBalance != null ? (WHITE_BALANCE[rawWhiteBalance] ?? null) : null;

  // Check if we got at least one meaningful field
  const hasAnyData =
    cameraMake ||
    cameraModel ||
    lensModel ||
    focalLength != null ||
    fNumber != null ||
    exposureTime ||
    iso != null;

  if (!hasAnyData) return null;

  return {
    cameraMake,
    cameraModel,
    lensMake,
    lensModel,
    focalLength,
    focalLengthIn35mm,
    fNumber,
    exposureTime,
    iso,
    dateTimeOriginal,
    flash,
    exposureProgram,
    meteringMode,
    whiteBalance,
  };
}
