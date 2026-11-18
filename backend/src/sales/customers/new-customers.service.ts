import { Inject, Injectable } from '@nestjs/common';
import { MASTER_DATA_PORT, type MasterDataPort } from '../../master-data/master-data.port';
import type { RequestContext } from '../../platform/context/request-context';
import { BusinessRuleError, NotFoundError } from '../../platform/http/errors';
import { CustomerOnboarding } from '../../platform/onboarding/customer-onboarding.registry';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { NEW_CUSTOMERS_OFF_MESSAGE } from '../settings/sales-flow.rules';
import { SAL_ROLE } from '../shared/sales.constants';
import type { NewCustomerDto } from './dto/new-customer.dto';

/**
 * Phase 5 · a salesperson adds a household customer while keying an order, when the company turns it on in Sales Flow
 * (S34). Sales never writes customers: it asks through the platform's customer onboarding, and Core makes the
 * customer (cash terms, no credit limit, marked for the office to complete). The answer is the customer as the order
 * form's picker shows it, so the order can use it at once.
 */
@Injectable()
export class SalesNewCustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly onboarding: CustomerOnboarding,
    @Inject(MASTER_DATA_PORT) private readonly masterData: MasterDataPort,
  ) {}

  async add(ctx: RequestContext, dto: NewCustomerDto) {
    const setting = await this.prisma.salSetting.findUnique({ where: { tenantId: ctx.tenantId }, select: { agentsAddCustomers: true } });
    if (!setting?.agentsAddCustomers) throw new BusinessRuleError('NEW_CUSTOMERS_OFF', NEW_CUSTOMERS_OFF_MESSAGE);
    const { code } = await this.onboarding.addFromOrder(ctx, {
      name: dto.name,
      phone: dto.phone,
      address: dto.address,
      email: dto.email ?? null,
      idNumber: dto.idNumber ?? null,
      // The salesperson's branch, so the order stays in it; a sales agent becomes the customer's agent.
      branchCode: ctx.branchCode,
      agentCode: ctx.user.roles.includes(SAL_ROLE.AGENT) ? ctx.user.code : null,
    });
    const c = await this.masterData.findCustomer(ctx.tenantId, code);
    if (!c) throw new NotFoundError('Customer');
    return {
      code: c.code, name: c.name, branchCode: c.branchCode, contactName: c.contactName, deliveryAddress: c.deliveryAddress,
      creditTermDays: c.creditTermDays, priceListCode: c.priceListCode, creditLimit: c.creditLimit, defaultAgentCode: c.defaultAgentCode,
    };
  }
}
