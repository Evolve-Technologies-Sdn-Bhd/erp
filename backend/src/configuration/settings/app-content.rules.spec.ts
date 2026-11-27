import { appContentChanges, appContentErrors, EMPTY_APP_CONTENT, readAppContent } from './app-content.rules';

describe('what the phone app shows (phase 5)', () => {
  it('shows nothing that admin did not set, and leaves out what is malformed', () => {
    expect(readAppContent(null)).toEqual(EMPTY_APP_CONTENT);
    expect(readAppContent({ duitNowFileId: ' ', contacts: [{ label: 'Sales Admin', phone: '03-5524 1180' }, { label: '', phone: '1' }, 'x'], officeHours: 'Mon–Sat' })).toEqual({
      duitNowFileId: null, duitNowName: null, contacts: [{ label: 'Sales Admin', phone: '03-5524 1180' }], officeHours: 'Mon–Sat',
    });
  });

  it('needs the name customers see with a QR, and a label and phone for each contact', () => {
    expect(appContentErrors({ ...EMPTY_APP_CONTENT, duitNowFileId: 'f1' }).map((e) => e.field)).toEqual(['duitNowName']);
    expect(appContentErrors({ ...EMPTY_APP_CONTENT, contacts: [{ label: ' ', phone: '12' }] }).map((e) => e.field)).toEqual(['contacts[0].label', 'contacts[0].phone']);
    expect(appContentErrors({ duitNowFileId: 'f1', duitNowName: 'Intact Water Sdn Bhd', contacts: [{ label: 'Sales Admin', phone: '03-5524 1180' }], officeHours: null })).toEqual([]);
  });

  it('logs what changed', () => {
    const after = { duitNowFileId: 'f1', duitNowName: 'Intact Water Sdn Bhd', contacts: [{ label: 'Sales Admin', phone: '03-5524 1180' }], officeHours: 'Mon–Sat, 9 AM – 6 PM' };
    expect(appContentChanges(EMPTY_APP_CONTENT, after)).toEqual([
      'DuitNow QR added',
      'DuitNow name: none → Intact Water Sdn Bhd',
      'Contacts: none → Sales Admin 03-5524 1180',
      'Office hours: none → Mon–Sat, 9 AM – 6 PM',
    ]);
    expect(appContentChanges(after, { ...after, duitNowFileId: null })).toEqual(['DuitNow QR removed']);
  });
});
