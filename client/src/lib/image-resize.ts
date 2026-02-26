const MAX_DIMENSION = 2048;
const JPEG_QUALITY = 0.9;

const SKIP_TYPES = new Set(['image/heic', 'image/heif']);

export async function resizeImageForUpload(file: File): Promise<File> {
  if (SKIP_TYPES.has(file.type)) {
    return file;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const { width, height } = bitmap;

  if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
    bitmap.close();
    return file;
  }

  const scale = MAX_DIMENSION / Math.max(width, height);
  const newWidth = Math.round(width * scale);
  const newHeight = Math.round(height * scale);

  const canvas = new OffscreenCanvas(newWidth, newHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }

  ctx.drawImage(bitmap, 0, 0, newWidth, newHeight);
  bitmap.close();

  const blob = await canvas.convertToBlob({
    type: 'image/jpeg',
    quality: JPEG_QUALITY,
  });

  return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
}
