import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CurrentContext } from '../context/context.decorators';
import type { RequestContext } from '../context/request-context';
import { NotificationsService } from './notifications.service';

/** The bell in the top bar: every signed-in person reads only their own alerts, so no permission is needed. */
@Controller('me/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentContext() ctx: RequestContext) {
    return this.notifications.list(ctx);
  }

  @Post('read-all')
  readAll(@CurrentContext() ctx: RequestContext) {
    return this.notifications.readAll(ctx);
  }

  @Post(':id/read')
  read(@CurrentContext() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.read(ctx, id);
  }
}
