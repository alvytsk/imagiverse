/**
 * Client-side image preparation for upload.
 *
 * Previously this resized large images via OffscreenCanvas, but canvas
 * `convertToBlob()` strips all EXIF metadata. The server already generates
 * properly sized thumbnails via Sharp (which preserves EXIF), so we now
 * pass the original file through unchanged.
 */
export async function resizeImageForUpload(file: File): Promise<File> {
  return file;
}
