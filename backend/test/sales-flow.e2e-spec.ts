import { reseed, startApi, type Api } from './e2e-helpers';

interface Flow {
  switches: { useEnquiries: boolean; officeDraftsQuotations: boolean; askInstallation: boolean; agentsAddCustomers: boolean };
  labels: Record<string, string>;
  history: { message: string; userName: string }[];
  saved?: string[];
}

/**
 * Sales flow (S34, phase 5): the switches that let a company leave out steps it does not use. The standard flow is
 * the default and stays untouched; with enquiries off, a new enquiry is refused by the server, not only hidden.
 */
describe('Sales flow switches (end to end)', () => {
  let api: Api;

  beforeAll(async () => {
    reseed();
    api = await startApi();
  }, 300_000);

  afterAll(async () => {
    await api?.close();
    reseed();
  }, 300_000);

  const enquiry = async () => {
    const lookups = await api.get<{ types: { code: string }[]; sources: { code: string }[] }>('sales/lookups/enquiry-types', 'AR');
    return {
      customerCode: 'C-0102', branchCode: 'HQ', enquiryTypeCode: lookups.types[0]!.code, sourceCode: lookups.sources[0]!.code,
      description: 'Six bar stools for the pool bar', items: [{ itemCode: 'CH-BAR-01', qty: '6' }],
    };
  };

  it('starts on the standard flow: both steps on, nothing in the history', async () => {
    const flow = await api.get<Flow>('sales/settings/sales-flow', 'AR');
    expect(flow.switches).toEqual({ useEnquiries: true, officeDraftsQuotations: true, askInstallation: false, agentsAddCustomers: false, priceRange: false, useReceipts: false, reviseOrders: false, preOrders: false, autoCancel: false, shareWhatsapp: false, holdStock: false, autoDelivery: false, signedDelivery: false });
    expect(flow.labels).toEqual({ useEnquiries: 'Use enquiries', officeDraftsQuotations: 'Office drafts quotations', askInstallation: 'Ask for an installation option on the order', agentsAddCustomers: 'Salespeople add new customers on the order', priceRange: 'Salespeople set prices within a range of the price list', useReceipts: 'Salespeople record payments as official receipts', reviseOrders: 'Salespeople revise a released order until it is delivered', preOrders: 'Short stock makes the order a pre-order', autoCancel: 'Cancel an order with no receipt and no delivery after a number of days', shareWhatsapp: 'Share the sales order with the customer on WhatsApp', holdStock: 'Hold stock for booked installations', autoDelivery: 'Make the delivery order 24 hours before the installation', signedDelivery: 'The customer signs the delivery order' });
    expect(flow.history).toEqual([]);
  });

  it('lets only someone with Operation Policies rights change it', async () => {
    const r = await api.call('PUT', 'sales/settings/sales-flow', 'AR', { useEnquiries: false, officeDraftsQuotations: false, askInstallation: false });
    expect(r).toMatchObject({ status: 403, body: { message: 'Your role cannot do this. Permission needed: sales.settings.manage.' } });
    expect((await api.get<Flow>('sales/settings/sales-flow', 'AR')).switches.useEnquiries).toBe(true);
  });

  it('refuses a save that leaves a switch out', async () => {
    const r = await api.call('PUT', 'sales/settings/sales-flow', 'ADM', { useEnquiries: false });
    expect(r.status).toBe(400);
  });

  it('turns the steps off, writes the history, and then refuses a new enquiry', async () => {
    const saved = await api.call<Flow>('PUT', 'sales/settings/sales-flow', 'ADM', { useEnquiries: false, officeDraftsQuotations: false, askInstallation: false });
    expect(saved.status).toBe(200);
    expect(saved.body.saved).toEqual(['Use enquiries: On → Off', 'Office drafts quotations: On → Off']);
    expect(saved.body.switches).toEqual({ useEnquiries: false, officeDraftsQuotations: false, askInstallation: false, agentsAddCustomers: false, priceRange: false, useReceipts: false, reviseOrders: false, preOrders: false, autoCancel: false, shareWhatsapp: false, holdStock: false, autoDelivery: false, signedDelivery: false });
    expect(saved.body.history.map((h) => h.message).sort()).toEqual(['Office drafts quotations: On → Off', 'Use enquiries: On → Off']);

    const refused = await api.call('POST', 'sales/enquiries', 'AR', await enquiry());
    expect(refused).toMatchObject({
      status: 409,
      body: { code: 'ENQUIRIES_OFF', message: 'Enquiries are turned off for this company. Turn on "Use enquiries" in Operation Policies › Sales Flow to log one.' },
    });
  });

  it('keeps the enquiries already made readable, and quotations still work', async () => {
    const list = await api.get<{ total: number }>('sales/enquiries', 'AR');
    expect(list.total).toBeGreaterThan(0);
    expect((await api.call('GET', 'sales/quotations', 'AR')).status).toBe(200);
  });

  it('saving the same values again changes nothing', async () => {
    const again = await api.call<Flow>('PUT', 'sales/settings/sales-flow', 'ADM', { useEnquiries: false, officeDraftsQuotations: false, askInstallation: false });
    expect(again.body.saved).toEqual([]);
    expect(again.body.history).toHaveLength(2);
  });

  it('turns enquiries back on, and a new enquiry is taken again', async () => {
    const saved = await api.call<Flow>('PUT', 'sales/settings/sales-flow', 'ADM', { useEnquiries: true, officeDraftsQuotations: true, askInstallation: false });
    expect(saved.body.saved).toEqual(['Use enquiries: Off → On', 'Office drafts quotations: Off → On']);
    const made = await api.call('POST', 'sales/enquiries', 'AR', await enquiry());
    expect(made).toMatchObject({ status: 201, body: { docNo: 'EQ-2609-0011', status: 'NEW' } });
  });
});
