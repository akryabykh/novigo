import { supabase } from './supabase';

const BUCKET = 'novigo-avatars';
const avatarPath = (userId: string) => `${userId}/avatar.jpg`;

/** A private signed URL is short-lived and never persisted in the profile row. */
export async function getAvatarUrl(userId: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(avatarPath(userId), 3600);
  if (error) {
    if (String(error.statusCode) === '404' || /not found/i.test(error.message)) return null;
    throw error;
  }
  return `${data.signedUrl}${data.signedUrl.includes('?') ? '&' : '?'}v=${Date.now()}`;
}

export async function uploadAvatar(userId: string, photo: Blob): Promise<string> {
  const { error } = await supabase.storage.from(BUCKET).upload(avatarPath(userId), photo, {
    upsert: true, contentType: 'image/jpeg', cacheControl: '0',
  });
  if (error) throw error;
  const url = await getAvatarUrl(userId);
  if (!url) throw new Error('Фото загружено, но его не удалось открыть');
  return url;
}

export async function deleteAvatar(userId: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([avatarPath(userId)]);
  if (error) throw error;
}
