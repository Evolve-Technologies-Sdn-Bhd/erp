// The Service module runs only where it is turned on. Set before the app loads.
process.env.SERVICE_MODULE = 'on';

import { reseed, startApi, type Api } from './e2e-helpers';

interface Eligible { period: { start: string; end: string; payOn: string; text: string }; jobs: { id: string; docNo: string; late: boolean; referenceAmount: string; claimable: boolean; why: string | null }[] }
interface Claim {
  id: string; docNo: string; status: string; statusLabel: string; version: number; total: string; period: { text: string; payOn: string };
  lines: { jobNo: string; referenceAmount: string; amount: string; reason: string | null; late: boolean }[]; allowedActions: string[];
  code?: string; message?: string; errors?: { field: string; message: string }[];
}
interface Job { id: string; docNo: string; version: number }

/**
 * Installer claims (F5): installers claim a fee per complete job whose order is fully paid, once, in two claim periods a
 * month, with their invoice; technicians do not claim. A job updated more than 72 hours late gets no fee by rule.
 * Account (here the Finance Manager, given the permission as a company would) approves or sends back, and records the
 * payment voucher; whoever submitted a claim never approves it. Today is Tue 29 Sep 2026.
 */
describe('Installer claims (end to end)', () => {
  let api: Api;
  const people: Record<string, string> = {};
  const jobs: Record<string, Job> = {};
  let base = '';

  beforeAll(async () => {
    reseed();
    api = await startApi();
    base = `${(await api.app.getUrl()).replace('[::1]', '127.0.0.1')}/api/v1`;
  }, 300_000);

  afterAll(async () => {
    await api?.close();
    reseed();
  }, 300_000);

  const upload = async (entityId: string | null, name: string, type: string) => {
    const form = new FormData();
    form.append('file', new Blob([Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))], { type }), name);
    if (entityId) {
      form.append('kind', 'JOB_PHOTO');
      form.append('entityType', 'SVC_JOB');
      form.append('entityId', entityId);
    }
    const r = await fetch(`${base}/attachments`, { method: 'POST', headers: { 'x-dev-user': 'ADM' }, body: form });
    expect(r.status).toBe(201);
    return ((await r.json()) as { id: string }).id;
  };
  /** A job done by Hafiz on a day: booked, a photo, recorded complete. */
  const done = async (key: string, date: string, fromOrder = false) => {
    let id: string;
    if (fromOrder) {
      const o = await api.call<{ id: string; docNo: string; version: number }>('POST', 'sales/orders', 'AR', { customerCode: 'C-0102', lines: [{ itemCode: 'TB-DIN-06', qty: '1', unitPrice: '1450' }], installDate: date });
      await api.call('POST', `sales/orders/${o.body.id}/release`, 'AR', { version: o.body.version });
      id = (await api.until('the job', async () => (await api.get<{ items: (Job & { salesOrderNo: string })[] }>(`service/jobs?q=${o.body.docNo}`)).items.find((j) => j.salesOrderNo === o.body.docNo))).id;
    } else {
      id = (await api.call<Job>('POST', 'service/jobs', 'ADM', { jobType: 'INSTALLATION', customerCode: 'C-0045', preferredDate: date })).body.id;
    }
    let j = await api.get<Job>(`service/jobs/${id}`);
    expect((await api.call('POST', `service/jobs/${id}/book`, 'ADM', { version: j.version, personId: people.hafiz, date, slotGroupCode: 'STANDARD', start: 600 })).status).toBe(201);
    await upload(id, 'after.png', 'image/png');
    j = await api.get<Job>(`service/jobs/${id}`);
    expect((await api.call('POST', `service/jobs/${id}/record`, 'ADM', { version: j.version, result: 'COMPLETE', paidStatus: 'NO_CHARGE' })).status).toBe(201);
    jobs[key] = await api.get<Job>(`service/jobs/${id}`);
  };
  const eligible = (person: string) => api.call<Eligible & { errors?: { field: string; message: string }[] }>('GET', `service/claims/eligible?personId=${people[person]}&day=2026-10-01`, 'ADM');
  const claim = (id: string) => api.get<Claim>(`service/claims/${id}`, 'ADM');

  it('knows who claims fees and the fee for each job category', async () => {
    expect((await api.call('PUT', 'sales/settings/sales-flow', 'ADM', { useEnquiries: true, officeDraftsQuotations: true, askInstallation: true })).status).toBe(200);
    for (const [key, name, role] of [['hafiz', 'Hafiz Rahman', 'INSTALLER'], ['suresh', 'Suresh Nair', 'TECHNICIAN']] as const) {
      const r = await api.call<{ people: { id: string; name: string; claimsFees: boolean }[] }>('POST', 'service/settings/people', 'ADM', { name, role, ...(role === 'TECHNICIAN' && { jobTypes: ['INSTALLATION', 'SERVICE'] }) });
      const p = r.body.people.find((x) => x.name === name)!;
      people[key] = p.id;
      expect(p.claimsFees).toBe(role === 'INSTALLER');
    }
    const s = await api.get<{ slotGroups: { id: string; code: string; name: string; slotMinutes: number; firstStart: number; lastEnd: number; jobTypes: string[]; version: number }[] }>('service/settings');
    const g = s.slotGroups.find((x) => x.code === 'STANDARD')!;
    const saved = await api.call<{ slotGroups: { code: string; feeAmount: string | null }[] }>('PATCH', `service/settings/slot-groups/${g.id}`, 'ADM', {
      name: g.name, slotMinutes: g.slotMinutes, firstStart: g.firstStart, lastEnd: g.lastEnd, jobTypes: g.jobTypes, feeAmount: '120', version: g.version,
    });
    expect(saved.body.slotGroups.find((x) => x.code === 'STANDARD')!.feeAmount).toBe('120.00');
    expect(await eligible('suresh')).toMatchObject({ status: 400, body: { errors: [{ field: 'personId', message: 'Suresh Nair does not claim fees. Tick Claims fees for them in Slots and Stages if they should.' }] } });
  });

  it('offers the complete jobs of the period: a job whose order is not fully paid waits, a late one gets no fee', async () => {
    await done('manual', '2026-10-01');
    await done('ordered', '2026-10-02', true);
    await done('late', '2026-10-05');
    await api.prisma.svcJob.update({ where: { id: jobs.late!.id }, data: { recordedAt: new Date('2026-10-09T02:00:00.000Z') } });
    const e = (await eligible('hafiz')).body;
    expect(e.period).toEqual({ start: '2026-10-01', end: '2026-10-15', payOn: '2026-10-25', text: '1–15 Oct 2026' });
    expect(e.jobs.map((j) => [j.docNo, j.claimable, j.referenceAmount, j.late])).toEqual([
      [jobs.manual!.docNo, true, '120.00', false],
      [jobs.ordered!.docNo, false, '120.00', false],
      [jobs.late!.docNo, true, '0.00', true],
    ]);
    expect(e.jobs[1]!.why).toMatch(new RegExp(`^${jobs.ordered!.docNo}: SO-\\d+ is not fully paid yet \\(verified receipts\\)\\.$`));
  });

  let c: Claim;

  it('keys a claim: each job once, another amount with a reason', async () => {
    const lines = [{ jobId: jobs.manual!.id }, { jobId: jobs.ordered!.id }, { jobId: jobs.late!.id }];
    const refused = await api.call<Claim>('POST', 'service/claims', 'ADM', { personId: people.hafiz, day: '2026-10-01', lines });
    expect(refused.status).toBe(400);
    expect(refused.body.errors![0]!.field).toBe('lines[1].jobId');

    // Sales says the order is fully paid (sales.receipt.verified, tested with official receipts).
    await api.prisma.svcJob.update({ where: { id: jobs.ordered!.id }, data: { orderPayment: 'FULLY_PAID' } });
    const noReason = await api.call<Claim>('POST', 'service/claims', 'ADM', { personId: people.hafiz, day: '2026-10-01', lines: [lines[0], { ...lines[1], amount: '150' }, lines[2]] });
    expect(noReason.body.errors).toEqual([{ field: 'lines[1].reason', message: 'Say why the amount is not 120.00, the fee by rule.' }]);
    const r = await api.call<Claim>('POST', 'service/claims', 'ADM', { personId: people.hafiz, day: '2026-10-07', lines: [lines[0], { ...lines[1], amount: '150', reason: 'Extra pipe work' }, lines[2]] });
    expect(r.status).toBe(201);
    c = r.body;
    expect(c).toMatchObject({ docNo: 'CL-0001', status: 'DRAFT', total: '270.00', period: { text: '1–15 Oct 2026', payOn: '2026-10-25' }, allowedActions: ['edit', 'submit', 'cancel'] });
    expect(c.lines.map((l) => [l.referenceAmount, l.amount, l.reason, l.late])).toEqual([['120.00', '120.00', null, false], ['120.00', '150.00', 'Extra pipe work', false], ['0.00', '0.00', null, true]]);
    expect((await api.call('POST', 'service/claims', 'ADM', { personId: people.hafiz, day: '2026-10-01', lines: [lines[0]] })).body).toMatchObject({
      errors: [{ field: 'lines[0].jobId', message: `${jobs.manual!.docNo} is already on CL-0001.` }],
    });
  });

  it("needs the installer's invoice to submit, and tells Account", async () => {
    expect(await api.call('POST', `service/claims/${c.id}/submit`, 'ADM', { version: c.version })).toMatchObject({ status: 400, body: { errors: [{ field: 'invoiceNo' }, { field: 'invoiceFileIds' }] } });
    const pdf = await upload(null, 'invoice.pdf', 'application/pdf');
    const saved = await api.call<Claim>('PATCH', `service/claims/${c.id}`, 'ADM', { version: c.version, invoiceNo: 'HR-INV-0042', invoiceFileIds: [pdf] });
    expect(saved.status).toBe(200);

    // Account: the Finance Manager gets the claim permissions, as a company would in Roles.
    const roles = await api.get<{ items: { id: string; code: string }[] }>('config/roles', 'ADM');
    const fm = roles.items.find((r) => r.code === 'FINANCE_MANAGER')!;
    const role = await api.get<{ name: string; description: string | null; agentScopeCustomers: boolean; agentScopeDocuments: boolean; permissions: string[]; version: number }>(`config/roles/${fm.id}`, 'ADM');
    expect((await api.call('PATCH', `config/roles/${fm.id}`, 'ADM', { ...role, permissions: [...role.permissions, 'service.view', 'service.claim.approve'] })).status).toBe(200);

    const sent = await api.call<Claim>('POST', `service/claims/${c.id}/submit`, 'ADM', { version: saved.body.version });
    expect(sent.body).toMatchObject({ status: 'SUBMITTED', statusLabel: 'Waiting for Account', allowedActions: [] });
    const ri = await api.get<{ items: { kind: string; title: string }[] }>('me/notifications', 'RI');
    expect(ri.items[0]).toMatchObject({ kind: 'service.claim.submitted', title: 'CL-0001 to check: Hafiz Rahman' });
    c = sent.body;
  });

  it('lets Account send back and approve, never the person who submitted, then record the payment voucher', async () => {
    expect(await api.call('POST', `service/claims/${c.id}/approve`, 'ADM', { version: c.version })).toMatchObject({ status: 409, body: { code: 'OWN_CLAIM' } });
    const back = await api.call<Claim>('POST', `service/claims/${c.id}/send-back`, 'RI', { version: c.version, reason: 'Invoice total does not match' });
    expect(back.body).toMatchObject({ status: 'RETURNED', statusLabel: 'Sent back' });
    const again = await api.call<Claim>('POST', `service/claims/${c.id}/submit`, 'ADM', { version: back.body.version });
    const ok = await api.call<Claim>('POST', `service/claims/${c.id}/approve`, 'RI', { version: again.body.version });
    expect(ok.body).toMatchObject({ status: 'APPROVED', allowedActions: ['pay'] });
    const event = await api.prisma.sysOutbox.findFirstOrThrow({ where: { name: 'service.claim.approved', aggregateId: c.id } });
    expect(event.payload).toMatchObject({ claimNo: 'CL-0001', personName: 'Hafiz Rahman', payOn: '2026-10-25', invoiceNo: 'HR-INV-0042', total: '270.00' });
    expect(await api.call('POST', `service/claims/${c.id}/pay`, 'RI', { version: ok.body.version, paymentRef: ' ', paidOn: '2026-10-25' })).toMatchObject({ status: 400 });
    const paid = await api.call<Claim & { paymentRef: string }>('POST', `service/claims/${c.id}/pay`, 'RI', { version: ok.body.version, paymentRef: 'PV-2610-018', paidOn: '2026-10-25' });
    expect(paid.body).toMatchObject({ status: 'PAID', paymentRef: 'PV-2610-018', allowedActions: [] });
    const list = await api.get<{ items: { docNo: string; status: string; jobs: number }[]; sumTotal: string; statusCounts: Record<string, number> }>('service/claims');
    expect(list).toMatchObject({ items: [{ docNo: 'CL-0001', status: 'PAID', jobs: 3 }], sumTotal: '270.00', statusCounts: { all: 1, paid: 1 } });
  });
});
