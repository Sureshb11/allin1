import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import legendsApi from '../services/LegendsApi';

// Shared options: compress client-side so the base64 payload stays well under
// the body limit. Avatars are squared down harder than gallery/feed shots.
const optionsFor = (folder) => ({
  mediaType: 'photo',
  includeBase64: true,
  maxWidth: folder === 'avatars' ? 640 : 1400,
  maxHeight: folder === 'avatars' ? 640 : 1400,
  quality: 0.7,
  selectionLimit: 1,
  saveToPhotos: false,
});

// Upload a picked/captured asset to the Vercel Blob store via the backend.
async function uploadAsset(asset, folder) {
  if (!asset?.base64) return { error: 'Could not read the selected image' };
  const up = await legendsApi.uploadImage({
    folder,
    dataBase64: asset.base64,
    contentType: asset.type || 'image/jpeg',
  });
  if (!up.success) return { error: up.error || 'Upload failed' };
  return { url: up.url };
}

/**
 * Pick an image from the library, compress it, and upload it to the Vercel Blob
 * store. Returns { url } on success or { cancelled } / { error }.
 *
 * folder ∈ 'avatars' | 'feed' | 'gallery' | 'marketplace' | 'teams'
 */
export async function pickAndUploadImage(folder = 'feed') {
  const result = await launchImageLibrary(optionsFor(folder));
  if (result.didCancel) return { cancelled: true };
  if (result.errorCode) return { error: result.errorMessage || result.errorCode };
  return uploadAsset(result.assets?.[0], folder);
}

/**
 * Take a photo with the camera, compress it, and upload it — same contract as
 * pickAndUploadImage. Requires camera permission (the OS prompts on first use).
 */
export async function captureAndUploadImage(folder = 'gallery') {
  const result = await launchCamera(optionsFor(folder));
  if (result.didCancel) return { cancelled: true };
  if (result.errorCode) return { error: result.errorMessage || result.errorCode };
  return uploadAsset(result.assets?.[0], folder);
}
