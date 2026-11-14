import { supabase } from '@/lib/supabaseClient';

const allowedImageTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);

export const storageService = {
  uploadLogo: async (file, bucket = 'logos') => {
    if (!allowedImageTypes.has(file?.type)) {
      throw new Error('Tipo de arquivo não permitido. Aceitos: JPEG, PNG, GIF, WebP e SVG.');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('Arquivo muito grande. Máximo permitido: 5MB.');
    }

    const fileName = `${Date.now()}-${file.name}`;
    const { error } = await supabase.storage
      .from(bucket)
      .upload(fileName, file, { contentType: file.type, upsert: false });
    if (error) throw error;

    const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return { file_url: data.publicUrl };
  },
};
