import { Inject, Injectable } from '@nestjs/common';
import type { MdmCustomer, Prisma } from '@prisma/client';
import { MASTER_DATA_PORT, type MasterDataPort } from '../../master-data/master-data.port';
import { PermissionRegistry } from '../../platform/context/permission.registry';
import type { RequestContext } from '../../platform/context/request-context';
import { dec } from '../../platform/http/decimal';
import { BusinessRuleError, ConfigurationError, PermissionDeniedError, StaleVersionError, ValidationFailedError, type FieldError } from '../../platform/http/errors';
import { NotificationsService } from '../../platform/notifications/notifications.service';
import { NumberingService } from '../../platform/numbering/numbering.service';
import type { NewOrderCustomer } from '../../platform/onboarding/customer-onboarding.registry';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { asSystem } from '../../platform/scope/data-scope';
import { RecordUsageRegistry } from '../../platform/usage/record-usage.registry';
import { CORE_DOC_TYPE, CORE_ENTITY, CORE_EVENT } from '../core.constants';
import { CORE_PERMISSIONS as P } from '../core.permissions';
import { changeMessage, diffRecord } from '../shared/audit.rules';
import { CoreRecordsService } from '../shared/core-records.service';
import type { RecordPreview } from '../shared/record-preview';
import { deactivateRefusal, deleteRefusal } from '../usage/usage.rules';
import type { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import {
  activationGaps,
  addedFromOrderMessage,
  CUSTOMER_LABELS,
  customerAudit,
  customerFromOrder,
  customerSnapshot,
  limitError,
  permissionsNeeded,
  PHONE_DIGITS_MIN,
  phoneKey,
  lookalikeInput,
  looksText,
  officeDuplicateMessage,
  sameCustomerMessage,
  setupProblemMessage,
  STATUS_LABEL,
  statusActions,
  type CustomerRecord,
  type CustomerStatus,
} from './customers.rules';
import { CustomersQuery } from './customers.query';
import { customerRecord } from './customers.record';
import { CustomerTransfersService } from './transfers.service';

type CustomerInput = Omit<CreateCustomerDto, 'status' | 'cameFromEnquiry'>;
const DONE_WORD = { block: 'blocked', activate: 'activated' } as const;

const record = customerRecord;

/** Customer commands (C05): create, update, block, activate and delete. One transaction each, with activity and event. */
@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly records: CoreRecordsService,
    private readonly usage: RecordUsageRegistry,
    private readonly numbering: NumberingService,
    private readonly permissions: PermissionRegistry,
    private readonly query: CustomersQuery,
    private readonly transfers: CustomerTransfersService,
    private readonly notifications: NotificationsService,
    @Inject(MASTER_DATA_PORT) private readonly masterData: MasterDataPort,
  ) {}

  /**
   * A new customer gets the next C-#### number, or `keptCode` when the import brings it from another system.
   * With an enquiry number, Sales links that enquiry to it (decision 7).
   */
  /**
   * `checkDuplicates` (the office's C05, phase 5): customers that look like this one (phone, name, address) are shown
   * first; the office may still add it once it says it is someone else, and the activity says what it looked like.
   * An import shows the same in its preview instead.
   */
  async create(ctx: RequestContext, dto: CreateCustomerDto, keptCode?: string, checkDuplicates = false) {
    const preview = await this.preview(ctx, dto, null);
    if (preview.errors.length) throw new ValidationFailedError(preview.errors);
    if (preview.permission) throw new PermissionDeniedError(preview.permission);
    const looks = checkDuplicates ? await this.transfers.matches(ctx, lookalikeInput(dto)) : [];
    if (looks.length && !dto.notDuplicate) {
      throw new BusinessRuleError(looks.some((m) => m.same) ? 'SAME_CUSTOMER' : 'POSSIBLE_DUPLICATE', officeDuplicateMessage(looks));
    }
    const status = dto.status ?? 'ACTIVE';
    const { id } = await this.insert(ctx, dto, {
      keptCode,
      status,
      cameFromEnquiry: dto.cameFromEnquiry ?? null,
      message: (code) =>
        `${status === 'PROSPECT' ? 'Prospect' : 'Customer'} ${code} created${dto.cameFromEnquiry ? ` from enquiry ${dto.cameFromEnquiry}` : ''}${looks.length ? `, although it looks like ${looksText(looks)}` : ''}`.slice(0, 500),
      extra: { enquiryNo: dto.cameFromEnquiry ?? null },
    });
    return this.query.detail(ctx, id);
  }

  /**
   * Phase 5: a salesperson adds a household customer while keying an order. Sales checks its Sales Flow switch and
   * asks through the platform's customer onboarding, so Core stays the only writer of customers. The customer is
   * active at once, on cash terms with no credit limit and the cash customer's price list, and marked to complete
   * for the office. A phone already on file is refused, whoever's customer it is.
   */
  async addFromOrder(ctx: RequestContext, input: NewOrderCustomer): Promise<{ id: string; code: string }> {
    const tenantId = ctx.tenantId;
    const key = phoneKey(input.phone);
    if (key.length < PHONE_DIGITS_MIN) throw ValidationFailedError.field('phone', "Type the customer's phone number.");
    // Phone, name and address against every customer (phase 5): the same customer is never added again; a maybe (the name
    // or the address alone) needs the salesperson to say it is someone else.
    const found = await this.transfers.matches(ctx, { name: input.name, phone: input.phone, address: input.address });
    const same = found.find((m) => m.same);
    if (same) throw new BusinessRuleError(same.reasons.includes('PHONE') ? 'PHONE_IN_USE' : 'SAME_CUSTOMER', sameCustomerMessage(same, same.reasons));
    if (found.length && !input.notDuplicate) {
      throw new BusinessRuleError('POSSIBLE_DUPLICATE', `${found.map((m) => `${m.name} (${m.code}, ${m.reasonText})`).join('; ')} may be this customer. Check, then say it is someone else to add them.`);
    }
    const cash = await asSystem(() => this.prisma.mdmCustomer.findFirst({ where: { tenantId, isCash: true }, select: { priceListCode: true } }));
    if (!cash) throw new ConfigurationError('There is no cash customer to take the price list from. Set one up in Core first.');
    const dto = customerFromOrder(input, cash);
    const preview = await this.preview(ctx, dto, null);
    if (preview.errors.length) throw new BusinessRuleError('NEW_CUSTOMER_SETUP', setupProblemMessage(preview.errors.map((e) => e.message)));
    const made = await this.insert(ctx, dto, {
      status: 'ACTIVE',
      toComplete: true,
      message: (code) => addedFromOrderMessage(code, ctx.user.name),
      extra: { enquiryNo: null, addedFrom: 'SALES_ORDER' },
    });
    // Alerts (phase 5): whoever edits customers at the branch completes it.
    const office = await this.notifications.whoCan(tenantId, P.CUSTOMER_EDIT, dto.branchCode);
    await this.prisma.$transaction((tx) =>
      this.notifications.send(tx, ctx, {
        to: office, kind: 'core.customer.to_complete', title: `New customer to complete: ${dto.name}`,
        body: `${made.code} added by ${ctx.user.name} from a sales order, on cash terms. Check it and fill in what is missing.`,
        link: `/core/customers/${made.id}`, entityType: CORE_ENTITY.CUSTOMER, entityId: made.id,
      }),
    );
    return made;
  }

  /** The office has checked a customer a salesperson added from an order, and filled in what was missing. */
  async complete(ctx: RequestContext, id: string, version: number) {
    const tenantId = ctx.tenantId;
    const c = await this.query.load(ctx, id);
    if (c.version !== version) throw new StaleVersionError();
    if (!c.toComplete) throw new BusinessRuleError('ALREADY_COMPLETE', `${c.code} is already complete.`);
    await this.prisma.$transaction(async (tx) => {
      const saved = await tx.mdmCustomer.updateMany({ where: { id, tenantId, version }, data: { toComplete: false, version: { increment: 1 }, updatedBy: ctx.user.code } });
      if (saved.count === 0) throw new StaleVersionError();
      await this.records.record(tx, ctx, {
        entityType: CORE_ENTITY.CUSTOMER,
        entityId: id,
        code: c.code,
        action: 'completed',
        message: `Customer ${c.code} checked and marked complete`,
        changes: [{ field: 'toComplete', label: 'To complete', from: 'Yes', to: 'No' }],
        event: CORE_EVENT.CUSTOMER_UPDATED,
        snapshot: customerSnapshot(record(c)),
      });
    });
    return this.query.detail(ctx, id);
  }

  /** Credit fields need core.customer.credit, the others core.customer.edit (decision 2, rule 9). */
  async update(ctx: RequestContext, id: string, dto: UpdateCustomerDto) {
    const tenantId = ctx.tenantId;
    const before = await this.query.load(ctx, id);
    if (before.version !== dto.version) throw new StaleVersionError();
    const preview = await this.preview(ctx, dto, before);
    const changes = preview.changes;
    if (!changes.length) return this.query.detail(ctx, id);
    if (preview.permission) throw new PermissionDeniedError(preview.permission);
    if (preview.errors.length) throw new ValidationFailedError(preview.errors);
    const data = this.data(dto);
    const after: CustomerRecord = { ...record(before), ...data };
    const needed = permissionsNeeded(changes.map((c) => c.field));

    await this.prisma.$transaction(async (tx) => {
      const saved = await tx.mdmCustomer.updateMany({ where: { id, tenantId, version: dto.version }, data: { ...data, version: { increment: 1 }, updatedBy: ctx.user.code } });
      if (saved.count === 0) throw new StaleVersionError();
      await this.records.record(tx, ctx, {
        entityType: CORE_ENTITY.CUSTOMER,
        entityId: id,
        code: before.code,
        action: needed.credit && !needed.details ? 'credit_changed' : 'updated',
        message: changeMessage(changes),
        changes,
        event: CORE_EVENT.CUSTOMER_UPDATED,
        snapshot: customerSnapshot(after),
      });
    });
    return this.query.detail(ctx, id);
  }

  /** Block (refused while open documents use the customer) or activate (needs the fields of rule 5). */
  async setStatus(ctx: RequestContext, id: string, action: 'block' | 'activate', version: number) {
    const tenantId = ctx.tenantId;
    const c = await this.query.load(ctx, id);
    if (c.version !== version) throw new StaleVersionError();
    const status = c.status as CustomerStatus;
    if (!statusActions(status).includes(action)) {
      throw new BusinessRuleError('CUSTOMER_STATUS', `${c.code} is ${STATUS_LABEL[status].toLowerCase()}, so it cannot be ${DONE_WORD[action]}.`);
    }
    if (action === 'activate') {
      const gaps = activationGaps(c);
      if (gaps.length) throw new ValidationFailedError(gaps, `Fill these in before activating ${c.code}.`);
    } else {
      const refusal = deactivateRefusal(c.code, await this.usage.check({ tenantId, kind: 'CUSTOMER', code: c.code }));
      if (refusal) throw new BusinessRuleError('IN_USE', refusal);
    }
    const next: CustomerStatus = action === 'block' ? 'BLOCKED' : 'ACTIVE';
    await this.prisma.$transaction(async (tx) => {
      const saved = await tx.mdmCustomer.updateMany({ where: { id, tenantId, version }, data: { status: next, version: { increment: 1 }, updatedBy: ctx.user.code } });
      if (saved.count === 0) throw new StaleVersionError();
      await this.records.record(tx, ctx, {
        entityType: CORE_ENTITY.CUSTOMER,
        entityId: id,
        code: c.code,
        action: DONE_WORD[action],
        message: status === 'PROSPECT' && action === 'activate' ? `Prospect ${c.code} made a customer` : `Customer ${c.code} ${DONE_WORD[action]}`,
        changes: [{ field: 'status', label: 'Status', from: STATUS_LABEL[status], to: STATUS_LABEL[next] }],
        event: CORE_EVENT.CUSTOMER_UPDATED,
        snapshot: customerSnapshot({ ...record(c), status: next }),
      });
    });
    return this.query.detail(ctx, id);
  }

  /** Delete only while no Sales document of any status uses the customer (rule 3). The number is not used again. */
  async remove(ctx: RequestContext, id: string, version: number) {
    const tenantId = ctx.tenantId;
    const c = await this.query.load(ctx, id);
    if (c.version !== version) throw new StaleVersionError();
    const refusal = deleteRefusal('CUSTOMER', c.code, await this.usage.check({ tenantId, kind: 'CUSTOMER', code: c.code }));
    if (refusal) throw new BusinessRuleError('IN_USE', refusal);
    if (c.isCash) throw new BusinessRuleError('CASH_CUSTOMER', `${c.code} is the cash customer that cash sales use. It cannot be deleted.`);
    await this.prisma.$transaction(async (tx) => {
      const gone = await tx.mdmCustomer.deleteMany({ where: { id, tenantId, version } });
      if (gone.count === 0) throw new StaleVersionError();
      await this.records.record(tx, ctx, {
        entityType: CORE_ENTITY.CUSTOMER,
        entityId: id,
        code: c.code,
        action: 'deleted',
        message: `Customer ${c.code} deleted (nothing used it)`,
        event: CORE_EVENT.CUSTOMER_DELETED,
        snapshot: customerSnapshot(record(c)),
      });
    });
    return { deleted: true, code: c.code };
  }

  /**
   * What saving would do, without saving: the changes, a missing permission (credit fields need core.customer.credit,
   * the others core.customer.edit) and the field problems. Create, update and the import's Check use it.
   */
  async preview(ctx: RequestContext, dto: CustomerInput, before: MdmCustomer | null): Promise<RecordPreview> {
    const has = (permission: string) => this.permissions.has(ctx.user.roles, permission);
    const data = this.data(dto);
    if (!before) {
      const credit = data.creditLimit !== null || data.overdueLimit !== null || data.creditScope !== null;
      return { changes: [], permission: credit && !has(P.CUSTOMER_CREDIT) ? P.CUSTOMER_CREDIT : null, errors: await this.check(ctx, dto, null) };
    }
    const changes = diffRecord(customerAudit(record(before)), customerAudit({ ...record(before), ...data }), CUSTOMER_LABELS);
    if (!changes.length) return { changes, permission: null, errors: [] };
    const needed = permissionsNeeded(changes.map((c) => c.field));
    const permission = needed.details && !has(P.CUSTOMER_EDIT) ? P.CUSTOMER_EDIT : needed.credit && !has(P.CUSTOMER_CREDIT) ? P.CUSTOMER_CREDIT : null;
    return { changes, permission, errors: await this.check(ctx, dto, before) };
  }

  /** One new customer in one transaction: the next C-#### (or the kept code), its activity with the values, and the event. */
  private async insert(
    ctx: RequestContext,
    dto: CustomerInput,
    opts: {
      keptCode?: string;
      status: 'ACTIVE' | 'PROSPECT';
      cameFromEnquiry?: string | null;
      toComplete?: boolean;
      message: (code: string) => string;
      extra: Record<string, Prisma.InputJsonValue | null>;
    },
  ): Promise<{ id: string; code: string }> {
    const tenantId = ctx.tenantId;
    const data = this.data(dto);
    return this.prisma.$transaction(async (tx) => {
      const code = opts.keptCode ?? (await this.numbering.next(tx, tenantId, CORE_DOC_TYPE.CUSTOMER));
      const row = await tx.mdmCustomer.create({
        data: {
          tenantId, code, ...data, cameFromEnquiry: opts.cameFromEnquiry ?? null, toComplete: opts.toComplete ?? false, status: opts.status,
          createdBy: ctx.user.code, updatedBy: ctx.user.code,
        },
      });
      await this.records.record(tx, ctx, {
        entityType: CORE_ENTITY.CUSTOMER,
        entityId: row.id,
        code,
        action: 'created',
        message: opts.message(code),
        changes: diffRecord(null, customerAudit(record(row)), CUSTOMER_LABELS),
        event: CORE_EVENT.CUSTOMER_CREATED,
        snapshot: customerSnapshot(record(row)),
        extra: opts.extra,
      });
      return { id: row.id, code };
    });
  }


  private data(dto: CustomerInput) {
    return {
      name: dto.name,
      category: dto.category ?? null,
      area: dto.area ?? null,
      branchCode: dto.branchCode,
      defaultAgentCode: dto.defaultAgentCode ?? null,
      billingAddress: dto.billingAddress ?? null,
      deliveryAddress: dto.deliveryAddress ?? null,
      contactName: dto.contactName ?? null,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      tin: dto.tin ?? null,
      idType: dto.idType ?? null,
      idNumber: dto.idNumber ?? null,
      salesTaxNo: dto.salesTaxNo ?? null,
      serviceTaxNo: dto.serviceTaxNo ?? null,
      einvoiceEmail: dto.einvoiceEmail ?? null,
      taxMode: dto.taxMode,
      creditTermDays: dto.creditTermDays,
      creditLimit: dto.creditLimit ? dec(dto.creditLimit) : null,
      overdueLimit: dto.overdueLimit ? dec(dto.overdueLimit) : null,
      creditScope: dto.creditScope ?? null,
      priceListCode: dto.priceListCode,
      // A7 (FR-SEC-033): left as it is when not sent, e.g. by an import file without the column.
      ...(dto.visibleToAllBranches !== undefined && { visibleToAllBranches: dto.visibleToAllBranches }),
    };
  }

  /**
   * Picked values exist and are active: category, area, branch, sales agent, price list and credit term. A value the
   * customer already had may stay even if its list entry was made inactive since.
   */
  private async check(ctx: RequestContext, dto: CustomerInput, before: MdmCustomer | null): Promise<FieldError[]> {
    const tenantId = ctx.tenantId;
    const [category, area, branch, agent, priceList, term] = await Promise.all([
      dto.category ? this.prisma.mdmCustomerCategory.findFirst({ where: { tenantId, name: dto.category } }) : null,
      dto.area ? this.prisma.mdmArea.findFirst({ where: { tenantId, name: dto.area } }) : null,
      this.masterData.listBranches(tenantId).then((all) => all.find((b) => b.code === dto.branchCode) ?? null),
      dto.defaultAgentCode ? this.masterData.findUserByCode(tenantId, dto.defaultAgentCode) : null,
      this.prisma.mdmPriceList.findFirst({ where: { tenantId, code: dto.priceListCode } }),
      this.prisma.mdmCreditTerm.findFirst({ where: { tenantId, days: dto.creditTermDays } }),
    ]);
    const kept = <K extends keyof MdmCustomer>(field: K, value: MdmCustomer[K]) => before !== null && before[field] === value;
    const errors: FieldError[] = [];
    if (dto.category && (!category || (!category.isActive && !kept('category', dto.category)))) errors.push({ field: 'category', message: 'Pick the category from the list.' });
    if (dto.area && (!area || (!area.isActive && !kept('area', dto.area)))) errors.push({ field: 'area', message: 'Pick the area from the list.' });
    if (!branch || (!branch.isActive && !kept('branchCode', dto.branchCode))) errors.push({ field: 'branchCode', message: 'Pick the branch from the list.' });
    const roles = agent?.roles ?? [];
    if (dto.defaultAgentCode && (!agent || ((!agent.isActive || !roles.includes('SALES_AGENT')) && !kept('defaultAgentCode', dto.defaultAgentCode)))) {
      errors.push({ field: 'defaultAgentCode', message: 'Pick an active sales agent.' });
    }
    if (!priceList || (!priceList.isActive && !kept('priceListCode', dto.priceListCode))) errors.push({ field: 'priceListCode', message: 'Pick an active price list.' });
    if (!term || (!term.isActive && !kept('creditTermDays', dto.creditTermDays))) errors.push({ field: 'creditTermDays', message: 'Pick the credit term from the list.' });
    for (const [field, label] of [['creditLimit', 'Credit limit'], ['overdueLimit', 'Overdue limit']] as const) {
      const message = limitError(dto[field], label);
      if (message) errors.push({ field, message });
    }
    return errors;
  }
}
