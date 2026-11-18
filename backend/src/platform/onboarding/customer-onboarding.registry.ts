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
}

export interface CustomerOnboardingHandler {
  addFromOrder(ctx: RequestContext, input: NewOrderCustomer): Promise<{ id: string; code: string }>;
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

  addFromOrder(ctx: RequestContext, input: NewOrderCustomer): Promise<{ id: string; code: string }> {
    if (!this.handler) throw new ConfigurationError('Customers cannot be added from an order: the Core module is not running.');
    return this.handler.addFromOrder(ctx, input);
  }
}
