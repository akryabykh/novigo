/** Resize a selected phone photo to a small, square JPEG before uploading it. */
export async function prepareAvatar(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Выбери изображение');
  if (file.size > 25 * 1024 * 1024) throw new Error('Фото слишком большое (максимум 25 МБ)');
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Не удалось обработать фото');
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2,
      side, side, 0, 0, 512, 512);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob || blob.size > 5 * 1024 * 1024) throw new Error('Не удалось подготовить фото');
    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
