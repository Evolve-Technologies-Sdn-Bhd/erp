import type { MdmCustomer } from '@prisma/client';
import type { CustomerRecord } from './customers.rules';

/** A customer row as Core's activity and events carry it. */
export const customerRecord = (c: MdmCustomer): CustomerRecord => ({
  code: c.code,
  name: c.name,
  category: c.category,
  area: c.area,
  branchCode: c.branchCode,
  defaultAgentCode: c.defaultAgentCode,
  billingAddress: c.billingAddress,
  deliveryAddress: c.deliveryAddress,
  contactName: c.contactName,
  email: c.email,
  phone: c.phone,
  tin: c.tin,
  idType: c.idType,
  idNumber: c.idNumber,
  salesTaxNo: c.salesTaxNo,
  serviceTaxNo: c.serviceTaxNo,
  einvoiceEmail: c.einvoiceEmail,
  taxMode: c.taxMode,
  creditTermDays: c.creditTermDays,
  creditLimit: c.creditLimit,
  overdueLimit: c.overdueLimit,
  creditScope: c.creditScope,
  priceListCode: c.priceListCode,
  visibleToAllBranches: c.visibleToAllBranches,
  isCash: c.isCash,
  status: c.status,
});
