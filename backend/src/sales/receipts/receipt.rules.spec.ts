import { allowedReceiptActions, orderPayment, proofError, receiptErrors, receiptText } from './receipt.rules';

describe('official receipts (phase 5)', () => {
  it('lets Account verify or send back a waiting receipt, but never the person who recorded it', () => {
    const all = { edit: true, verify: true };
    expect(allowedReceiptActions('WAITING', all, false)).toEqual(['edit', 'cancel', 'verify', 'sendBack']);
    expect(allowedReceiptActions('WAITING', all, true)).toEqual(['edit', 'cancel']);
    expect(allowedReceiptActions('WAITING', { edit: false, verify: true }, false)).toEqual(['verify', 'sendBack']);
    expect(allowedReceiptActions('RETURNED', all, false)).toEqual(['edit', 'cancel']);
    expect(allowedReceiptActions('VERIFIED', all, false)).toEqual([]);
    expect(allowedReceiptActions('CANCELLED', all, false)).toEqual([]);
  });

  it('counts only verified receipts as paid, and keeps those waiting apart', () => {
    expect(orderPayment('2970', [])).toMatchObject({ status: 'UNPAID', label: 'Unpaid' });
    const part = orderPayment('2970', [{ status: 'VERIFIED', amount: '500' }, { status: 'WAITING', amount: '1000' }, { status: 'CANCELLED', amount: '99' }, { status: 'RETURNED', amount: '7' }]);
    expect(part).toMatchObject({ status: 'DEPOSIT', label: 'Deposit paid' });
    expect([part.verified.toFixed(2), part.waiting.toFixed(2), part.open.toFixed(2)]).toEqual(['500.00', '1000.00', '1470.00']);
    expect(orderPayment('2970', [{ status: 'VERIFIED', amount: '500' }, { status: 'VERIFIED', amount: '2470' }])).toMatchObject({ status: 'FULLY_PAID', label: 'Fully paid' });
    // Only waiting money: still unpaid.
    expect(orderPayment('2970', [{ status: 'WAITING', amount: '2970' }]).status).toBe('UNPAID');
  });

  it('needs the day received, an amount the order still owes, and a proof', () => {
    const ok = { docDate: '2026-09-29', amount: '500.00', proofs: 1 };
    expect(receiptErrors(ok, { today: '2026-09-29', open: '2970' })).toEqual([]);
    expect(receiptErrors({ docDate: '2026-09-30', amount: '0', proofs: 0 }, { today: '2026-09-29', open: '2970' })).toEqual([
      { field: 'docDate', message: 'The day the money was received cannot be in the future.' },
      { field: 'amount', message: 'Type the amount received, more than 0, like 500.00.' },
      { field: 'proofIds', message: 'Add the payment proof: a photo or PDF of the slip.' },
    ]);
    expect(receiptErrors({ ...ok, amount: '3000.00' }, { today: '2026-09-29', open: '2970' })).toEqual([
      { field: 'amount', message: 'More than the order still owes (RM 2,970.00).' },
    ]);
    expect(receiptErrors({ ...ok, amount: '12.345' }, { today: '2026-09-29', open: '2970' })[0]!.field).toBe('amount');
  });

  it('takes a photo or a PDF as proof, not a file of another document', () => {
    expect(proofError({ mimeType: 'application/pdf', entityType: null, entityId: null }, 'SAL_RECEIPT', null)).toBeNull();
    expect(proofError({ mimeType: 'image/heic', entityType: 'SAL_RECEIPT', entityId: 'r1' }, 'SAL_RECEIPT', 'r1')).toBeNull();
    expect(proofError({ mimeType: 'text/plain', entityType: null, entityId: null }, 'SAL_RECEIPT', null)).toBe('The proof must be a photo (JPG, PNG, WEBP, HEIC) or a PDF.');
    expect(proofError({ mimeType: 'image/png', entityType: 'SVC_JOB', entityId: 'j1' }, 'SAL_RECEIPT', null)).toBe('This file belongs to another document. Upload it again.');
    expect(proofError(null, 'SAL_RECEIPT', null)).toBe('The proof was not found. Upload it again.');
  });

  it('writes the activity line', () => {
    expect(receiptText({ kind: 'DEPOSIT', amount: '1500', method: 'CARD_EPP' })).toBe('Deposit RM 1,500.00 by card instalment (EPP)');
  });
});
