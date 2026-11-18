import { pictureError, pictureUrl } from './picture.rules';

describe('picture rules (items and packages)', () => {
  const file = (mimeType: string, entityType: string | null = null, entityId: string | null = null) => ({ mimeType, entityType, entityId });

  it('takes a JPG, PNG or WEBP that is not on another record', () => {
    expect(pictureError(file('image/jpeg'), 'MDM_PACKAGE', null)).toBeNull();
    expect(pictureError(file('image/png'), 'MDM_ITEM', 'i-1')).toBeNull();
    expect(pictureError(file('image/webp', 'MDM_ITEM', 'i-1'), 'MDM_ITEM', 'i-1')).toBeNull();
  });

  it('refuses a missing file, a PDF or HEIC, and another record’s file', () => {
    expect(pictureError(null, 'MDM_ITEM', 'i-1')).toBe('The picture was not found. Upload it again.');
    expect(pictureError(file('application/pdf'), 'MDM_ITEM', 'i-1')).toBe('A picture must be a JPG, PNG or WEBP file.');
    expect(pictureError(file('image/heic'), 'MDM_ITEM', 'i-1')).toBe('A picture must be a JPG, PNG or WEBP file.');
    expect(pictureError(file('image/png', 'SVC_JOB', 'j-1'), 'MDM_ITEM', 'i-1')).toBe('This file belongs to another record. Upload the picture again.');
    expect(pictureError(file('image/png', 'MDM_ITEM', 'i-2'), 'MDM_ITEM', 'i-1')).toBe('This file belongs to another record. Upload the picture again.');
  });

  it('gives the download path, or none', () => {
    expect(pictureUrl('a1')).toBe('/attachments/a1/download');
    expect(pictureUrl(null)).toBeNull();
  });
});
