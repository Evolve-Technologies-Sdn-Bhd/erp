/**
 * Pictures of items and packages (phase 5): the picture a salesperson sees when picking. It is an uploaded file kept
 * by the platform (POST /attachments) and linked to the record when the record is saved. Pure functions.
 */

/** What a browser can show on every device. HEIC photos straight from a phone are refused: save them as JPG. */
export const PICTURE_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

export interface PictureFile {
  mimeType: string;
  entityType: string | null;
  entityId: string | null;
}

/** Why an uploaded file cannot be this record's picture, or null when it can. A new record has no id yet. */
export function pictureError(file: PictureFile | null, entityType: string, entityId: string | null): string | null {
  if (!file) return 'The picture was not found. Upload it again.';
  if (!PICTURE_TYPES.includes(file.mimeType)) return 'A picture must be a JPG, PNG or WEBP file.';
  if (file.entityId && (file.entityType !== entityType || file.entityId !== entityId)) return 'This file belongs to another record. Upload the picture again.';
  return null;
}

/** Where the screens fetch a picture from (with the signed-in user's token). */
export const pictureUrl = (pictureId: string | null): string | null => (pictureId ? `/attachments/${pictureId}/download` : null);
