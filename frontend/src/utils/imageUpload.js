import { launchImageLibrary } from 'react-native-image-picker';
import legendsApi from '../services/LegendsApi';

/**
 * Pick an image from the library, compress it, and upload it to the Vercel Blob
 * store via the backend. Returns { url } on success or { cancelled } / { error }.
 *
 * folder ∈ 'avatars' | 'feed' | 'gallery' | 'marketplace' | 'teams'
 */
export async function pickAndUploadImage(folder = 'feed') {
  const result = await launchImageLibrary({
    mediaType: 'photo',
    includeBase64: true,
    // Compress client-side so the base64 payload stays well under the body limit.
    maxWidth: folder === 'avatars' ? 640 : 1400,
    maxHeight: folder === 'avatars' ? 640 : 1400,
    quality: 0.7,
    selectionLimit: 1,
  });

  if (result.didCancel) return { cancelled: true };
  if (result.errorCode) return { error: result.errorMessage || result.errorCode };
  const asset = result.assets?.[0];
  if (!asset?.base64) return { error: 'Could not read the selected image' };

  const up = await legendsApi.uploadImage({
    folder,
    dataBase64: asset.base64,
    contentType: asset.type || 'image/jpeg',
  });
  if (!up.success) return { error: up.error || 'Upload failed' };
  return { url: up.url };
}
