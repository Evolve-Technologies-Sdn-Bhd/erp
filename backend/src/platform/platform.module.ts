import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import type { Env } from '../config/env';
import { ActivityService } from './activity/activity.service';
import { ApprovalsService } from './approvals/approvals.service';
import { AttachmentsController } from './attachments/attachments.controller';
import { AttachmentsService } from './attachments/attachments.service';
import { ClockModule } from './clock/clock.service';
import { ContextModule } from './context/context.module';
import { DashboardBoardsService } from './indicators/dashboard-boards.service';
import { IndicatorRegistry } from './indicators/indicator.registry';
import { NotificationsController } from './notifications/notifications.controller';
import { NotificationsService } from './notifications/notifications.service';
import { NumberingService } from './numbering/numbering.service';
import { CustomerOnboarding } from './onboarding/customer-onboarding.registry';
import { OutboxConsumers } from './outbox/outbox.consumers';
import { OutboxDispatcher } from './outbox/outbox.dispatcher';
import { OutboxWriter } from './outbox/outbox.writer';
import { PrismaModule } from './prisma/prisma.module';
import { TutorialController } from './tutorial/tutorial.controller';
import { TutorialService } from './tutorial/tutorial.service';
import { RecordUsageRegistry } from './usage/record-usage.registry';

/**
 * Shared building blocks with no business rules: database, clock, current user, numbering, activity,
 * approvals, outbox, attachments, the record-usage registry, customer onboarding, the home-dashboard indicators, each person's guided tours and their alerts. Global, so business modules just inject the services.
 */
@Global()
@Module({
  imports: [
    PrismaModule,
    ClockModule,
    ContextModule,
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        limits: { fileSize: config.get('UPLOAD_MAX_BYTES', { infer: true }), files: 1 },
      }),
    }),
  ],
  controllers: [AttachmentsController, TutorialController, NotificationsController],
  providers: [
    NumberingService,
    ActivityService,
    ApprovalsService,
    OutboxWriter,
    OutboxConsumers,
    OutboxDispatcher,
    AttachmentsService,
    RecordUsageRegistry,
    CustomerOnboarding,
    IndicatorRegistry,
    DashboardBoardsService,
    TutorialService,
    NotificationsService,
  ],
  exports: [
    PrismaModule,
    ClockModule,
    ContextModule,
    NumberingService,
    ActivityService,
    ApprovalsService,
    OutboxWriter,
    OutboxConsumers,
    AttachmentsService,
    RecordUsageRegistry,
    CustomerOnboarding,
    IndicatorRegistry,
    DashboardBoardsService,
    NotificationsService,
  ],
})
export class PlatformModule {}
