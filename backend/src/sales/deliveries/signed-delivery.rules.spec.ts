import { cancelAfterDelivery, needsSignature, refuseErrors, signActions, signErrors, signLabel, signState, type Signable } from './signed-delivery.rules';

const now = new Date('2026-09-29T08:00:00Z');
const draft: Signable = { status: 'DRAFT', isMigrated: false, collectedAt: null, refusedAt: null, signedAt: null, unsignedByName: null };
const all = { store: true, sign: true, manage: true, isRefuser: false };
const base = ['edit', 'delete', 'attach', 'confirm'] as const;

describe('the signed delivery order', () => {
  it('applies to orders with installation while the switch is on', () => {
    expect(needsSignature(true, 'INSTALLATION')).toBe(true);
    expect(needsSignature(true, 'DELIVERY')).toBe(false);
    expect(needsSignature(false, 'INSTALLATION')).toBe(false);
  });

  it('goes from to collect, to collected, to delivered, with its chip', () => {
    expect([signState(draft), signLabel(draft)]).toEqual(['TO_COLLECT', null]);
    expect([signState({ ...draft, collectedAt: now }), signLabel({ ...draft, collectedAt: now })]).toEqual(['COLLECTED', 'Collected']);
    expect([signState({ ...draft, collectedAt: now, refusedAt: now }), signLabel({ ...draft, collectedAt: now, refusedAt: now })]).toEqual(['REFUSED', 'Not signed']);
    expect([signState({ ...draft, status: 'CONFIRMED', signedAt: now }), signLabel({ ...draft, status: 'CONFIRMED', signedAt: now })]).toEqual(['DELIVERED', null]);
    expect(signLabel({ ...draft, status: 'CONFIRMED', refusedAt: now, unsignedByName: 'Director' })).toBe('Delivered, not signed');
  });

  it('offers collect first, then sign, refuse and check in, and never Confirm', () => {
    expect(signActions(draft, [...base], all)).toEqual(['edit', 'delete', 'attach', 'collect']);
    expect(signActions(draft, ['edit', 'delete', 'attach'], all)).not.toContain('collect'); // credit approval still needed
    expect(signActions({ ...draft, collectedAt: now }, [...base], all)).toEqual(['attach', 'checkIn', 'sign', 'refuse']);
    expect(signActions({ ...draft, collectedAt: now }, [], { ...all, store: false, manage: false })).toEqual(['sign', 'refuse', 'attach']);
  });

  it('lets Management decide a refusal, never whoever recorded it, and a customer may still sign', () => {
    const refused = { ...draft, collectedAt: now, refusedAt: now };
    expect(signActions(refused, [...base], all)).toEqual(['attach', 'sign', 'acceptUnsigned', 'returnRefusal']);
    expect(signActions(refused, [...base], { ...all, isRefuser: true })).toEqual(['attach', 'sign']);
    expect(signActions({ ...draft, status: 'CONFIRMED' }, ['attach'], all)).toEqual(['attach']);
  });

  it('needs who signed and the signed paper, or why not and a photo', () => {
    expect(signErrors({ signerName: ' ', files: 0 }).map((e) => e.field)).toEqual(['signerName', 'fileIds']);
    expect(signErrors({ signerName: 'Puan Salmah', files: 1 })).toEqual([]);
    expect(refuseErrors({ reason: '', files: 0 }).map((e) => e.field)).toEqual(['reason', 'fileIds']);
    expect(refuseErrors({ reason: 'Not at home', files: 1 })).toEqual([]);
  });

  it('keeps cancelling after the delivery order to Management, and never with the goods out', () => {
    expect(cancelAfterDelivery([], false, 'SO-0009')).toBeNull();
    expect(cancelAfterDelivery([{ docNo: 'DO-0004', collected: false }], false, 'SO-0009')).toMatchObject({ code: 'MANAGEMENT_NEEDED' });
    expect(cancelAfterDelivery([{ docNo: 'DO-0004', collected: false }], true, 'SO-0009')).toBeNull();
    expect(cancelAfterDelivery([{ docNo: 'DO-0004', collected: true }], true, 'SO-0009')).toMatchObject({ code: 'GOODS_COLLECTED' });
  });
});
