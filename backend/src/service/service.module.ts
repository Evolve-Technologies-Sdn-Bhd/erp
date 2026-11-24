import { Module, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { PermissionCatalogue } from '../platform/context/permission-catalogue';
import { ScopeRegistry } from '../platform/scope/scope.registry';
import { ServiceBoardController, ServiceSettingsController } from './board/board.controller';
import { BoardQuery } from './board/board.query';
import { ServiceHomeController, ServiceJobsController } from './jobs/jobs.controller';
import { ServiceSettingsService } from './settings/settings.service';
import { ServiceClaimsController } from './claims/claims.controller';
import { ClaimsQuery } from './claims/claims.query';
import { ClaimsService } from './claims/claims.service';
import { ServiceRemindersController } from './reminders/reminders.controller';
import { RemindersService } from './reminders/reminders.service';
import { JobsQuery } from './jobs/jobs.query';
import { JobsService } from './jobs/jobs.service';
import { StockCheckService } from './jobs/stock-check.service';
import { JobStockService } from './stock/job-stock.service';
import { ServiceStockController } from './stock/job-stock.controller';
import { ReturnsService } from './returns/returns.service';
import { ServiceReturnsController } from './returns/returns.controller';
import { JobDeliveryListener } from './sales-link/job-delivery.listener';
import { JobFromOrderListener } from './sales-link/job-from-order.listener';
import { OrderPaymentListener } from './sales-link/order-payment.listener';
import { ServiceOnGuard } from './service-on.guard';
import { SERVICE_PERMISSION_CATALOGUE } from './service.permissions';
import { SERVICE_SCOPE_RULES } from './service.scope';

/**
 * The Service module (CLAUDE.md → Phase 5 · Installation module): installation, service, warranty and repair jobs.
 * Owns svc_ tables only and never imports sales/: jobs come from `sales.order.released`, and each job keeps its order's
 * payment from `sales.receipt.verified`. It does nothing unless the
 * server runs with SERVICE_MODULE=on: no permissions in the role editor, no listener, and its routes answer 404.
 */
@Module({
  controllers: [ServiceJobsController, ServiceHomeController, ServiceBoardController, ServiceSettingsController, ServiceRemindersController, ServiceClaimsController, ServiceStockController, ServiceReturnsController],
  providers: [ServiceOnGuard, JobsQuery, JobsService, JobFromOrderListener, OrderPaymentListener, JobDeliveryListener, JobStockService, ReturnsService, BoardQuery, ServiceSettingsService, RemindersService, StockCheckService, ClaimsQuery, ClaimsService],
})
export class ServiceModule implements OnModuleInit {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly permissions: PermissionCatalogue,
    private readonly scopes: ScopeRegistry,
    private readonly listener: JobFromOrderListener,
    private readonly payments: OrderPaymentListener,
    private readonly deliveries: JobDeliveryListener,
    private readonly reminders: RemindersService,
    private readonly stockCheck: StockCheckService,
  ) {}

  onModuleInit(): void {
    // Off, nothing reads svc_ tables (the routes answer 404 and no listener runs), so nothing needs scoping.
    if (!this.config.get('SERVICE_MODULE', { infer: true })) return;
    this.scopes.register(SERVICE_SCOPE_RULES);
    this.permissions.register(SERVICE_PERMISSION_CATALOGUE);
    this.listener.register();
    this.payments.register();
    this.deliveries.register();
    this.reminders.schedule();
    this.stockCheck.schedule();
  }
}
