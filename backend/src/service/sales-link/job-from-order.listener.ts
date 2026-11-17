import { Inject, Injectable, Logger } from '@nestjs/common';
import { MASTER_DATA_PORT, type MasterDataPort } from '../../master-data/master-data.port';
import type { RequestContext } from '../../platform/context/request-context';
import { OutboxConsumers } from '../../platform/outbox/outbox.consumers';
import type { OutboxEnvelope } from '../../platform/outbox/outbox.types';
import type { Tx } from '../../platform/prisma/prisma.service';
import { readReleasedOrder } from '../jobs/jobs.rules';
import { JobsService } from '../jobs/jobs.service';
import { SYSTEM_USER } from '../service.constants';

/** The Sales event the Service module listens to (EVENTS.md → Service listens to). */
export const SALES_ORDER_RELEASED = 'sales.order.released';
const HANDLER = 'service.job-from-order';

/**
 * Service listens to `sales.order.released`: an order released with the Installation option (Sales, F1 part 5) makes
 * an installation job, *Not booked*, with the customer's preferred date or "after stock arrives". Delivery only,
 * collect, and companies that do not ask make none. Made by the system, once per order.
 */
@Injectable()
export class JobFromOrderListener {
  private readonly logger = new Logger(JobFromOrderListener.name);

  constructor(
    private readonly consumers: OutboxConsumers,
    private readonly jobs: JobsService,
    @Inject(MASTER_DATA_PORT) private readonly masterData: MasterDataPort,
  ) {}

  /** Called by ServiceModule only when the module is turned on. */
  register(): void {
    this.consumers.listen(SALES_ORDER_RELEASED, HANDLER, (event, tx) => this.onSalesOrderReleased(event, tx));
  }

  async onSalesOrderReleased(event: OutboxEnvelope, tx: Tx): Promise<void> {
    const order = readReleasedOrder(event.payload);
    if (!order) return;
    const tenantId = event.tenantId;
    const branches = await this.masterData.listBranches(tenantId);
    const ctx: RequestContext = {
      tenantId,
      branchCode: order.branchCode,
      correlationId: event.correlationId,
      user: {
        id: SYSTEM_USER.code, tenantId, code: SYSTEM_USER.code, name: SYSTEM_USER.name, email: '', roles: [],
        branchCodes: branches.map((b) => b.code), department: null, jobTitle: null,
      },
    };
    const job = await this.jobs.createFromOrder(tx, ctx, event.aggregateId, order);
    if (job) this.logger.log(`${job.docNo} made from ${order.soNo}`);
  }
}
