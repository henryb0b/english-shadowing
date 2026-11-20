import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { Story } from '../types';

/* Shared lesson storage on Supabase. Students read; only the signed-in teacher writes (see supabase/schema.sql). */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const cloudEnabled = Boolean(url && anonKey);
const client: SupabaseClient | null = cloudEnabled ? createClient(url!, anonKey!) : null;
const MEDIA_BUCKET = 'lesson-media';

export async function fetchLessons(): Promise<Story[]> {
  if (!client) return [];
  const { data, error } = await client.from('lessons').select('data').order('created_at', { ascending: true });
  if (error) throw new Error(`Không tải được bài chung: ${error.message}`);
  return (data ?? []).map((row) => row.data as Story);
}

/** Uploads optional media, then saves the lesson row. Returns the public media URL on the story. */
export async function insertLesson(story: Story, media: File | null): Promise<void> {
  if (!client) throw new Error('Chưa cấu hình lưu chung.');
  if (media) {
    const ext = media.name.includes('.') ? media.name.split('.').pop() : 'bin';
    const path = `${story.id}.${ext}`;
    const { error: upErr } = await client.storage
      .from(MEDIA_BUCKET)
      .upload(path, media, { contentType: media.type || undefined, upsert: false });
    if (upErr) throw new Error(`Không tải được file lên: ${upErr.message}`);
    story.audioUrl = client.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
  }
  const { error } = await client.from('lessons').insert({ id: story.id, data: story });
  if (error) throw new Error(`Không lưu được bài: ${error.message}`);
}

export async function deleteLesson(story: Story): Promise<void> {
  if (!client) return;
  const { error } = await client.from('lessons').delete().eq('id', story.id);
  if (error) throw new Error(`Không xóa được bài: ${error.message}`);
  if (story.audioUrl) {
    const path = decodeURIComponent(story.audioUrl.split('/').pop() ?? '');
    if (path) await client.storage.from(MEDIA_BUCKET).remove([path]);
  }
}

export async function getSession(): Promise<Session | null> {
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session;
}

export function onSessionChange(cb: (session: Session | null) => void): () => void {
  if (!client) return () => {};
  const { data } = client.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

export async function signIn(email: string, password: string): Promise<void> {
  if (!client) throw new Error('Chưa cấu hình lưu chung.');
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error('Đăng nhập chưa thành công. Kiểm tra email và mật khẩu.');
}

export async function signOut(): Promise<void> {
  await client?.auth.signOut();
}
