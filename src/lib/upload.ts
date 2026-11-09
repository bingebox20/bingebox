import { api, ApiError } from './api';

export function uploadVideo(file: File, onProgress: (percent: number) => void): Promise<string> {
  if (file.size > 2 * 1024 * 1024 * 1024) return Promise.reject(new ApiError(413, 'Choose a video smaller than 2 GB.'));
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', '/api/admin/uploads/video');
    request.withCredentials = true;
    request.setRequestHeader('X-BingeBox-Client', 'web');
    request.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.min(99, Math.round(e.loaded / e.total * 100))); };
    request.onerror = () => reject(new ApiError(0, 'Video upload failed. Check your connection and try again.'));
    request.onabort = () => reject(new ApiError(0, 'Video upload cancelled.'));
    request.onload = () => {
      let data: { url?: string; error?: { message?: string } } = {};
      try { data = JSON.parse(request.responseText); } catch { /* Handle non-JSON proxy errors below. */ }
      if (request.status >= 200 && request.status < 300 && data.url) { onProgress(100); resolve(data.url); }
      else reject(new ApiError(request.status, data.error?.message ?? 'The video could not be uploaded. Please try again.'));
    };
    const form = new FormData(); form.append('file', file, file.name); request.send(form);
  });
}

/**
 * Downscales an image in the browser and re-encodes it as WebP before upload,
 * so posters and thumbnails arrive optimised (typically 5–10× smaller).
 */
export async function optimiseImage(file: File, maxWidth: number): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86));
  return blob && blob.size < file.size ? blob : file;
}

export async function uploadImage(file: File, maxWidth = 1920): Promise<string> {
  const blob = await optimiseImage(file, maxWidth);
  const form = new FormData();
  form.append('file', blob, blob === file ? file.name : file.name.replace(/\.[^.]+$/, '') + '.webp');
  const res = await api.post<{ url: string }>('/admin/uploads/image', form);
  return res.url;
}

export async function uploadSubtitle(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file, file.name);
  const res = await api.post<{ url: string }>('/admin/uploads/subtitle', form);
  return res.url;
}
