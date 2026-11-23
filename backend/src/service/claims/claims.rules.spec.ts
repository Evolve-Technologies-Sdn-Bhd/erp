import { allowedClaimActions, claimPeriod, claimRefusal, invoiceFileError, lineErrors, periodText, referenceFee, submitErrors, updatedLate } from './claims.rules';

describe('claim periods: two a month', () => {
  it('pays the 1st–15th on the 25th and the 16th–end on the 10th of the next month', () => {
    expect(claimPeriod('2026-10-01')).toEqual({ start: '2026-10-01', end: '2026-10-15', payOn: '2026-10-25' });
    expect(claimPeriod('2026-10-15')).toEqual({ start: '2026-10-01', end: '2026-10-15', payOn: '2026-10-25' });
    expect(claimPeriod('2026-10-16')).toEqual({ start: '2026-10-16', end: '2026-10-31', payOn: '2026-11-10' });
    expect(claimPeriod('2026-12-20')).toEqual({ start: '2026-12-16', end: '2026-12-31', payOn: '2027-01-10' });
    expect(claimPeriod('2027-02-20').end).toBe('2027-02-28');
    expect(periodText(claimPeriod('2026-10-20'))).toBe('16–31 Oct 2026');
  });
});

describe('what can be claimed', () => {
  const period = claimPeriod('2026-10-01');
  const job = { docNo: 'JB-0012', stage: 'DONE', result: 'COMPLETE', personId: 'p1', jobDate: '2026-10-02', orderPayment: 'FULLY_PAID', salesOrderNo: 'SO-0040', claimedOn: null };
  it('takes a complete job of this person in the period whose order is fully paid, once', () => {
    expect(claimRefusal(job, 'p1', period)).toBeNull();
    expect(claimRefusal({ ...job, stage: 'CLOSED' }, 'p1', period)).toBeNull();
    expect(claimRefusal({ ...job, salesOrderNo: null, orderPayment: null }, 'p1', period)).toBeNull();
  });
  it('says why not', () => {
    expect(claimRefusal(job, 'p2', period)).toBe('JB-0012 was not done by this person.');
    expect(claimRefusal({ ...job, stage: 'BOOKED' }, 'p1', period)).toBe('JB-0012 is not done yet.');
    expect(claimRefusal({ ...job, result: 'PARTIAL' }, 'p1', period)).toBe('JB-0012 was not completed (only complete jobs are claimed).');
    expect(claimRefusal({ ...job, jobDate: '2026-10-16' }, 'p1', period)).toBe('JB-0012 was not done in this claim period.');
    expect(claimRefusal({ ...job, orderPayment: 'DEPOSIT' }, 'p1', period)).toBe('JB-0012: SO-0040 is not fully paid yet (verified receipts).');
    expect(claimRefusal({ ...job, claimedOn: 'CL-0003' }, 'p1', period)).toBe('JB-0012 is already on CL-0003.');
  });
  it('gives no fee for a job updated more than 72 hours after its expected finish', () => {
    // Thu 1 Oct, expected to finish at 12 PM in Kuala Lumpur (04:00 UTC).
    expect(updatedLate({ jobDate: '2026-10-01', expectedEnd: 720 }, new Date('2026-10-04T03:59:00Z'))).toBe(false);
    expect(updatedLate({ jobDate: '2026-10-01', expectedEnd: 720 }, new Date('2026-10-04T04:01:00Z'))).toBe(true);
    expect(referenceFee('120', false)).toBe('120.00');
    expect(referenceFee('120', true)).toBe('0.00');
    expect(referenceFee(null, false)).toBe('0.00');
  });
});

describe('claim lines and submitting', () => {
  it('needs a reason for an amount other than the fee by rule', () => {
    expect(lineErrors([{ amount: '120.00', referenceAmount: '120.00' }])).toEqual([]);
    expect(lineErrors([{ amount: '150', referenceAmount: '120.00', reason: 'Extra pipe work' }])).toEqual([]);
    expect(lineErrors([{ amount: '150', referenceAmount: '120.00' }, { amount: '-1', referenceAmount: '0' }])).toEqual([
      { field: 'lines[0].reason', message: 'Say why the amount is not 120.00, the fee by rule.' },
      { field: 'lines[1].amount', message: 'Type an amount like 120.00.' },
    ]);
  });
  it("needs the installer's invoice number and file unless self-billed", () => {
    expect(submitErrors({ lines: 2, invoiceNo: 'INV-77', selfBilled: false, invoiceFiles: 1 })).toEqual([]);
    expect(submitErrors({ lines: 2, invoiceNo: null, selfBilled: true, invoiceFiles: 0 })).toEqual([]);
    expect(submitErrors({ lines: 0, invoiceNo: ' ', selfBilled: false, invoiceFiles: 0 }).map((e) => e.field)).toEqual(['jobIds', 'invoiceNo', 'invoiceFileIds']);
    expect(invoiceFileError({ mimeType: 'application/pdf', entityType: null, entityId: null }, null)).toBeNull();
    expect(invoiceFileError({ mimeType: 'text/plain', entityType: null, entityId: null }, null)).toBe('The invoice must be a PDF or a photo.');
    expect(invoiceFileError({ mimeType: 'image/png', entityType: 'SVC_JOB', entityId: 'j1' }, 'c1')).toBe('This file is already kept on another document.');
  });
  it('lets the office edit and submit, and Account approve, send back and pay; never your own', () => {
    const all = { edit: true, approve: true };
    expect(allowedClaimActions('DRAFT', all, false)).toEqual(['edit', 'submit', 'cancel']);
    expect(allowedClaimActions('RETURNED', all, true)).toEqual(['edit', 'submit', 'cancel']);
    expect(allowedClaimActions('SUBMITTED', all, false)).toEqual(['approve', 'return']);
    expect(allowedClaimActions('SUBMITTED', all, true)).toEqual([]);
    expect(allowedClaimActions('APPROVED', all, true)).toEqual(['pay']);
    expect(allowedClaimActions('PAID', all, false)).toEqual([]);
  });
});
