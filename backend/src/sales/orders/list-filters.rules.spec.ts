import { installWhere, paymentSets, paymentWhere } from './list-filters.rules';

describe('order list filters for the salesperson home (phase 5)', () => {
  const today = new Date('2026-11-27T00:00:00.000Z');
  const LIVE = { status: { in: ['RELEASED', 'PARTIAL', 'DONE'] } };

  it('finds installations booked for today', () => {
    expect(installWhere('today', today)).toEqual({ ...LIVE, installBookedFor: today });
  });

  it('finds installations waiting to be booked, and of those the ones without a day', () => {
    expect(installWhere('toBook', today)).toEqual({ ...LIVE, installOption: 'INSTALLATION', installBooking: null, installDoneAt: null });
    expect(installWhere('dateTbc', today)).toEqual({ ...LIVE, installOption: 'INSTALLATION', installBooking: null, installDoneAt: null, installDate: null });
  });

  it('finds installations recorded complete', () => {
    expect(installWhere('donePaymentPending', today)).toEqual({ ...LIVE, installDoneAt: { not: null } });
  });

  it('counts an order fully paid only when verified receipts reach its total', () => {
    const totals = new Map<string, string>([['a', '100.00'], ['b', '100.00'], ['c', '0.00'], ['d', '50.00']]);
    const sets = paymentSets(
      [
        { salesOrderId: 'a', amount: '100.00' },
        { salesOrderId: 'b', amount: '40.00' },
        { salesOrderId: 'c', amount: '10.00' },
        { salesOrderId: 'd', amount: '0' },
        { salesOrderId: 'x', amount: '5' },
      ],
      totals,
    );
    expect(sets).toEqual({ paid: ['a'], partial: ['b', 'c'] });
  });

  it('turns the sets into filters on released orders', () => {
    const sets = { paid: ['a'], partial: ['b'] };
    expect(paymentWhere('paid', sets)).toEqual({ ...LIVE, id: { in: ['a'] } });
    expect(paymentWhere('partial', sets)).toEqual({ ...LIVE, id: { in: ['b'] } });
    expect(paymentWhere('unpaid', sets)).toEqual({ ...LIVE, id: { notIn: ['a', 'b'] } });
    expect(paymentWhere('notPaid', sets)).toEqual({ ...LIVE, id: { notIn: ['a'] } });
  });
});
