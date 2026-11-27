import { Injectable } from '@nestjs/common';
import type { RequestContext } from '../context/request-context';
import { ConfigurationError } from '../http/errors';

/** A household customer a salesperson adds while keying an order (phase 5). Core fills in everything else. */
export interface NewOrderCustomer {
  name: string;
  phone: string;
  /** Billing and delivery address in one: where the goods go and the installer comes. */
  address: string;
  email: string | null;
  /** NRIC or another ID number, when the customer gives it. */
  idNumber: string | null;
  branchCode: string;
  /** The salesperson, when they are a sales agent; the customer then shows in their own customer list. */
  agentCode: string | null;
  /** The salesperson checked the customers that look like this one (same name or same address) and says it is someone else. */
  notDuplicate?: boolean;
}

/** A customer on file that looks like the one being added (phase 5): who has it and how it matches, never its contact details. */
export interface CustomerLookalike {
  id: string;
  code: string;
  name: string;
  status: string;
  branchCode: string;
  agentCode: string | null;
  agentName: string | null;
  mine: boolean;
  reasons: ('PHONE' | 'NAME' | 'ADDRESS')[];
  reasonText: string;
  same: boolean;
  pendingAgentName: string | null;
  pendingMine: boolean;
}

export interface CustomerOnboardingHandler {
  addFromOrder(ctx: RequestContext, input: NewOrderCustomer): Promise<{ id: string; code: string }>;
  /** Phase 5: customers that look like this one, in every branch and of every salesperson. */
  lookalikes(ctx: RequestContext, typed: { name: string; phone: string; address: string }): Promise<CustomerLookalike[]>;
  /** Phase 5: ask to take over another salesperson's customer; the office decides. */
  askTransfer(ctx: RequestContext, input: { customerCode: string; reason: string }): Promise<unknown>;
  /** Phase 5: the salesperson's own transfer requests. */
  myTransfers(ctx: RequestContext): Promise<unknown>;
}

/**
 * How a module that is not the owner of customers asks for one to be added. Core, the only writer of the mdm_ tables,
 * registers the handler at start-up (the way modules register outbox listeners and record-usage providers); Sales
 * calls it from the order form. Neither imports the other, and no business rule lives here.
 */
@Injectable()
export class CustomerOnboarding {
  private handler: CustomerOnboardingHandler | null = null;

  register(handler: CustomerOnboardingHandler): void {
    if (this.handler) throw new Error('A customer onboarding handler is already registered');
    this.handler = handler;
  }

  private core(): CustomerOnboardingHandler {
    if (!this.handler) throw new ConfigurationError('Customers cannot be added from an order: the Core module is not running.');
    return this.handler;
  }

  addFromOrder(ctx: RequestContext, input: NewOrderCustomer): Promise<{ id: string; code: string }> {
    return this.core().addFromOrder(ctx, input);
  }

  lookalikes(ctx: RequestContext, typed: { name: string; phone: string; address: string }): Promise<CustomerLookalike[]> {
    return this.core().lookalikes(ctx, typed);
  }

  askTransfer(ctx: RequestContext, input: { customerCode: string; reason: string }): Promise<unknown> {
    return this.core().askTransfer(ctx, input);
  }

  myTransfers(ctx: RequestContext): Promise<unknown> {
    return this.core().myTransfers(ctx);
  }
}
