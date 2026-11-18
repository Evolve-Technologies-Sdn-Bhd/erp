// The Service module runs only where it is turned on. Set before the app is loaded, as service-jobs.e2e-spec.ts does.
process.env.SERVICE_MODULE = 'on';

import { reseed, startApi, type Api } from './e2e-helpers';

interface Person { id: string; name: string; role: string; jobTypes: string[]; siteTypes: string[]; takesText: string; goesToText: string; version: number }
interface Group { id: string; code: string; name: string; slotMinutes: number; firstStart: number; lastEnd: number; jobTypes: string[]; defaultFor: string[]; isActive: boolean; version: number }
interface Settings { people: Person[]; slotGroups: Group[] }
interface Booking { personName: string; text: string; expectedText: string; extended: boolean; extendReason: string | null; runsInto: string[] }
interface Job {
  id: string; docNo: string; stage: string; version: number; siteType: string | null; siteTypeLabel: string | null;
  overdue: boolean; overdueSinceText: string | null; booking: Booking | null; allowedActions: string[];
  activity: { action: string; message: string; comment: string | null }[];
}
interface BoardJob { docNo: string; start: number; end: number; busyEnd: number; extendedText: string | null; overdue: boolean }
interface Board { people: { name: string; jobTypes: string[]; siteTypes: string[]; jobs: BoardJob[] }[]; notBooked: { docNo: string; siteTypeLabel: string | null; overdue: boolean }[] }

/**
 * The Service module, part 4 (phase 5, F3): job types and site types per person, a default slot group per job type,
 * the expected completion and extending it with a reason, and the overdue flag that stays until the visit is recorded
 * (CLAUDE.md → F3; the client's process diagrams ask for these, and none of them needs the client's answers to work).
 * Today is Tue 29 Sep 2026 (DEV_TODAY); time passing is simulated by moving a booked job's day into the past.
 */
describe('Service planning: who takes what, expected completion and overdue (end to end)', () => {
  let api: Api;
  const people: Record<string, string> = {};

  beforeAll(async () => {
    reseed();
    api = await startApi();
  }, 300_000);

  afterAll(async () => {
    await api?.close();
    reseed();
  }, 300_000);

  const settings = () => api.get<Settings>('service/settings');
  const job = (id: string) => api.get<Job>(`service/jobs/${id}`);
  const addJob = async (jobType: string, siteType: string | null = null) => {
    const r = await api.call<Job>('POST', 'service/jobs', 'ADM', { jobType, customerCode: 'C-0045', preferredDate: '2026-10-01', siteType });
    expect(r.status).toBe(201);
    return r.body;
  };
  const book = async (id: string, person: string, date: string, slotGroupCode: string, start: number) => {
    const latest = await job(id);
    return api.call<Job & { message?: string }>('POST', `service/jobs/${id}/book`, 'ADM', { version: latest.version, personId: people[person], date, slotGroupCode, start });
  };
  const extend = async (id: string, until: string, reason: string) => {
    const latest = await job(id);
    return api.call<Job & { errors?: { field: string; message: string }[] }>('POST', `service/jobs/${id}/extend`, 'ADM', { version: latest.version, until, reason });
  };
  const updatePerson = async (name: string, body: Record<string, unknown>) => {
    const p = (await settings()).people.find((x) => x.name === name)!;
    return api.call<Settings>('PATCH', `service/settings/people/${p.id}`, 'ADM', { name: p.name, role: p.role, version: p.version, ...body });
  };
  const updateGroup = async (code: string, body: Record<string, unknown>) => {
    const g = (await settings()).slotGroups.find((x) => x.code === code)!;
    const { id, code: _c, defaultFor: _d, ...rest } = g;
    return api.call<Settings & { errors?: { field: string; message: string }[] }>('PATCH', `service/settings/slot-groups/${id}`, 'ADM', { ...rest, ...body });
  };
  const overdueList = async () => (await api.get<{ items: { docNo: string; overdue: boolean }[] }>('service/jobs?overdue=1')).items.map((j) => j.docNo);
  /** Time passes: the booked day is now behind us. */
  const intoThePast = (id: string, date: string) => api.prisma.svcJob.update({ where: { id }, data: { jobDate: new Date(`${date}T00:00:00.000Z`) } });

  it('gives each person their own job types and the sites they go to, starting from their role', async () => {
    for (const [name, body] of [
      ['Hafiz Rahman', { role: 'INSTALLER' }],
      ['Lee Jun Wei', { role: 'INSTALLER', jobTypes: ['INSTALLATION', 'WARRANTY'], siteTypes: ['LANDED'] }],
      ['Suresh Nair', { role: 'TECHNICIAN' }],
    ] as const) {
      const r = await api.call<Settings>('POST', 'service/settings/people', 'ADM', { name, ...body });
      expect(r.status).toBe(201);
      people[name] = r.body.people.find((p) => p.name === name)!.id;
    }
    expect((await settings()).people.map((p) => [p.name, p.takesText, p.goesToText])).toEqual([
      ['Hafiz Rahman', 'Installation', 'any site'],
      ['Lee Jun Wei', 'Installation, Warranty', 'Landed house'],
      ['Suresh Nair', 'Service, Repair', 'any site'],
    ]);
    expect(await api.call('POST', 'service/settings/people', 'ADM', { name: 'Nobody', role: 'INSTALLER', jobTypes: [] })).toMatchObject({
      status: 400, body: { errors: [{ field: 'jobTypes', message: 'Pick the jobs this person takes.' }] },
    });

    // A technician who also installs: the role stays a label.
    const r = await updatePerson('Suresh Nair', { jobTypes: ['INSTALLATION', 'SERVICE', 'REPAIR'] });
    expect(r.body.people.find((p) => p.name === 'Suresh Nair')).toMatchObject({ role: 'TECHNICIAN', jobTypes: ['INSTALLATION', 'SERVICE', 'REPAIR'] });
    const log = await api.prisma.sysActivity.findFirstOrThrow({ where: { entityId: people['Suresh Nair'], action: 'saved' } });
    expect(log.message).toBe('Takes: Service, Repair → Installation, Service, Repair');
    const board = await api.get<Board>('service/board?date=2026-10-01');
    expect(board.people.map((p) => `${p.name}: ${p.jobTypes.join(',')} / ${p.siteTypes.join(',')}`)).toEqual([
      'Hafiz Rahman: INSTALLATION / LANDED,CONDO,COMMERCIAL',
      'Lee Jun Wei: INSTALLATION,WARRANTY / LANDED',
      'Suresh Nair: INSTALLATION,SERVICE,REPAIR / LANDED,CONDO,COMMERCIAL',
    ]);
  });

  it('keeps one default slot group per job type', async () => {
    expect((await settings()).slotGroups.map((g) => [g.code, g.defaultFor])).toEqual([
      ['STANDARD', ['INSTALLATION']], ['EARLY', []], ['SHORT', ['SERVICE', 'WARRANTY', 'REPAIR']], ['LONG', []],
    ]);
    const r = await updateGroup('LONG', { defaultFor: ['INSTALLATION'] });
    expect(r.body.slotGroups.map((g) => [g.code, g.defaultFor])).toEqual([
      ['STANDARD', []], ['EARLY', []], ['SHORT', ['SERVICE', 'WARRANTY', 'REPAIR']], ['LONG', ['INSTALLATION']],
    ]);
    const log = await api.prisma.sysActivity.findFirstOrThrow({ where: { docNo: 'Standard', action: 'saved' }, orderBy: { createdAt: 'desc' } });
    expect(log.message).toBe('Slot group Standard is no longer the default for Installation');
    expect(await updateGroup('LONG', { defaultFor: ['SERVICE'] })).toMatchObject({
      status: 400, body: { errors: [{ field: 'defaultFor', message: 'A slot group can only be the default for job types it is used for.' }] },
    });
    // Back to the starting defaults for the steps below; a save that leaves the defaults out keeps them.
    await updateGroup('STANDARD', { defaultFor: ['INSTALLATION'] });
    await updateGroup('SHORT', { name: 'Short' });
    expect((await settings()).slotGroups.map((g) => g.defaultFor.join(','))).toEqual(['INSTALLATION', '', 'SERVICE,WARRANTY,REPAIR', '']);
  });

  const jobs: Record<string, Job> = {};

  it('books only someone who takes the job and goes to that kind of site', async () => {
    jobs.condo = await addJob('INSTALLATION', 'CONDO');
    expect(jobs.condo).toMatchObject({ siteType: 'CONDO', siteTypeLabel: 'Condo / apartment', overdue: false });
    const board = await api.get<Board>('service/board?date=2026-10-01');
    expect(board.notBooked.find((j) => j.docNo === jobs.condo!.docNo)).toMatchObject({ siteTypeLabel: 'Condo / apartment', overdue: false });

    expect(await book(jobs.condo.id, 'Lee Jun Wei', '2026-10-01', 'STANDARD', 720)).toMatchObject({ status: 409, body: { message: 'Lee Jun Wei does not go to condo / apartment sites.' } });
    const booked = await book(jobs.condo.id, 'Hafiz Rahman', '2026-10-01', 'STANDARD', 720);
    expect(booked.body.booking).toMatchObject({ personName: 'Hafiz Rahman', text: 'Thu, 1 Oct · 12 PM – 2 PM', expectedText: '2 PM', extended: false, runsInto: [] });
    expect(booked.body.allowedActions).toEqual(['edit', 'cancel', 'book', 'unbook', 'extend', 'record']);

    // An installer who also takes warranty jobs; a technician who also installs.
    jobs.warranty = await addJob('WARRANTY');
    expect((await book(jobs.warranty.id, 'Lee Jun Wei', '2026-10-01', 'SHORT', 540)).status).toBe(201);
    jobs.landed = await addJob('INSTALLATION');
    expect((await book(jobs.landed.id, 'Suresh Nair', '2026-10-01', 'STANDARD', 600)).status).toBe(201);
    expect((await api.call('POST', `service/jobs/${jobs.landed.id}/unbook`, 'ADM', { version: (await job(jobs.landed.id)).version })).status).toBe(201);

    // The site type cannot change to one the person booked does not go to.
    expect((await book(jobs.landed.id, 'Lee Jun Wei', '2026-10-01', 'STANDARD', 720)).status).toBe(201);
    const latest = await job(jobs.landed.id);
    expect(await api.call('PATCH', `service/jobs/${jobs.landed.id}`, 'ADM', { version: latest.version, siteType: 'CONDO' })).toMatchObject({
      status: 409, body: { message: 'Lee Jun Wei, who is booked, does not go to condo / apartment sites. Move the job to someone who does first.' },
    });
    const landed = await api.call<Job>('PATCH', `service/jobs/${jobs.landed.id}`, 'ADM', { version: latest.version, siteType: 'LANDED' });
    expect(landed.body).toMatchObject({ siteType: 'LANDED', siteTypeLabel: 'Landed house' });
  });

  it('extends a booked job with a reason, keeps the person busy, and names the jobs it runs into', async () => {
    jobs.later = await addJob('INSTALLATION');
    expect((await book(jobs.later.id, 'Hafiz Rahman', '2026-10-01', 'STANDARD', 840)).status).toBe(201);

    expect(await extend(jobs.condo!.id, '13:00', ' ')).toMatchObject({
      status: 400, body: { errors: [{ field: 'until', message: 'Pick a time after 2 PM, the expected completion now.' }, { field: 'reason', message: 'Type why the job needs longer.' }] },
    });
    const r = await extend(jobs.condo!.id, '15:30', 'Wall needed hacking');
    expect(r.status).toBe(201);
    expect(r.body.booking).toMatchObject({ expectedText: '3:30 PM', extended: true, extendReason: 'Wall needed hacking', runsInto: [`${jobs.later.docNo} at 2 PM – 4 PM`] });
    expect(r.body.activity[0]).toMatchObject({
      action: 'extended', message: `Expected completion extended from 2 PM to 3:30 PM by Admin; it runs into ${jobs.later.docNo} at 2 PM – 4 PM`, comment: 'Wall needed hacking',
    });
    const event = await api.prisma.sysOutbox.findFirstOrThrow({ where: { name: 'service.job.extended', aggregateId: jobs.condo!.id } });
    expect(event.payload).toMatchObject({ jobNo: jobs.condo!.docNo, personName: 'Hafiz Rahman', date: '2026-10-01', from: 840, to: 930, reason: 'Wall needed hacking', runsInto: [jobs.later.docNo] });

    const board = await api.get<Board>('service/board?date=2026-10-01');
    expect(board.people[0]!.jobs.find((j) => j.docNo === jobs.condo!.docNo)).toMatchObject({ start: 720, end: 840, busyEnd: 930, extendedText: 'Extended to 3:30 PM', overdue: false });

    // Nothing new is booked over the extension.
    expect((await api.call('POST', `service/jobs/${jobs.later.id}/unbook`, 'ADM', { version: (await job(jobs.later.id)).version })).status).toBe(201);
    expect(await book(jobs.later.id, 'Hafiz Rahman', '2026-10-01', 'STANDARD', 840)).toMatchObject({
      status: 409, body: { message: `Hafiz Rahman already has ${jobs.condo!.docNo} at 12 PM – 3:30 PM that day.` },
    });
    expect((await book(jobs.later.id, 'Hafiz Rahman', '2026-10-01', 'STANDARD', 960)).status).toBe(201);
    expect((await job(jobs.condo!.id)).booking!.runsInto).toEqual([]);
  });

  it('flags a job overdue once its expected completion has passed, and keeps the flag until the visit is recorded', async () => {
    expect(await overdueList()).toEqual([]);
    await intoThePast(jobs.condo!.id, '2026-09-28');
    expect(await job(jobs.condo!.id)).toMatchObject({ overdue: true, overdueSinceText: 'Mon, 28 Sep, 3:30 PM' });
    expect(await overdueList()).toEqual([jobs.condo!.docNo]);
    expect((await api.get<{ overdue: number }>('service/home')).overdue).toBe(1);

    // Extending it again, taking it off the board or moving it does not clear the flag.
    const again = await extend(jobs.condo!.id, '17:00', 'Still at it');
    expect(again.body.activity[0]!.message).toBe('Expected completion extended from 3:30 PM to 5 PM by Admin; it stays overdue (since Mon, 28 Sep, 3:30 PM)');
    expect(again.body.overdue).toBe(true);
    const off = await api.call<Job>('POST', `service/jobs/${jobs.condo!.id}/unbook`, 'ADM', { version: again.body.version });
    expect(off.body).toMatchObject({ stage: 'NOT_BOOKED', overdue: true, overdueSinceText: 'Mon, 28 Sep, 3:30 PM', booking: null });
    expect((await api.get<Board>('service/board?date=2026-10-02')).notBooked.find((j) => j.docNo === jobs.condo!.docNo)?.overdue).toBe(true);
    const moved = await book(jobs.condo!.id, 'Hafiz Rahman', '2026-10-02', 'STANDARD', 600);
    expect(moved.body).toMatchObject({ overdue: true, booking: { expectedText: '12 PM', extended: false } });
    expect(await overdueList()).toEqual([jobs.condo!.docNo]);

    // Recording the visit ends it; the job keeps that it was late.
    const base = `${(await api.app.getUrl()).replace('[::1]', '127.0.0.1')}/api/v1`;
    const form = new FormData();
    form.append('file', new Blob([Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))], { type: 'image/png' }), 'after.png');
    form.append('kind', 'JOB_PHOTO');
    form.append('entityType', 'SVC_JOB');
    form.append('entityId', jobs.condo!.id);
    expect((await fetch(`${base}/attachments`, { method: 'POST', headers: { 'x-dev-user': 'ADM' }, body: form })).status).toBe(201);
    const done = await api.call<Job>('POST', `service/jobs/${jobs.condo!.id}/record`, 'ADM', { version: moved.body.version, result: 'COMPLETE', paidStatus: 'PAID' });
    expect(done.body).toMatchObject({ stage: 'DONE', overdue: false, overdueSinceText: 'Mon, 28 Sep, 3:30 PM' });
    expect(done.body.activity[0]!.message).toBe('Complete · paid on site · 1 photo, recorded by Admin for Hafiz Rahman · late: overdue since Mon, 28 Sep, 3:30 PM');
    expect(await overdueList()).toEqual([]);
    expect((await api.get<{ overdue: number }>('service/home')).overdue).toBe(0);
  });

  it('ends the flag when an overdue visit is recorded as postponed, and says it was overdue', async () => {
    await intoThePast(jobs.later!.id, '2026-09-28');
    expect(await overdueList()).toEqual([jobs.later!.docNo]);
    const latest = await job(jobs.later!.id);
    const r = await api.call<Job>('POST', `service/jobs/${jobs.later!.id}/record`, 'ADM', { version: latest.version, result: 'POSTPONED', reason: 'Customer not in' });
    expect(r.body).toMatchObject({ stage: 'NOT_BOOKED', overdue: false, overdueSinceText: null });
    expect(r.body.activity[0]!.message).toBe('Postponed, recorded by Admin for Hafiz Rahman; waiting to be booked again (it was overdue since Mon, 28 Sep, 6 PM)');
    expect(await overdueList()).toEqual([]);
  });
});
