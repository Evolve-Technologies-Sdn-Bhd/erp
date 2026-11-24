import { Body, Controller, Delete, Get, Put } from '@nestjs/common';
import { CurrentContext } from '../context/context.decorators';
import type { RequestContext } from '../context/request-context';
import { SaveTutorialDto, TutorialService } from './tutorial.service';

/**
 * Guided tours (Help): every signed-in person keeps their own, so no permission is needed. The tours never act for the
 * person; this only remembers where they are.
 */
@Controller('me/tutorial')
export class TutorialController {
  constructor(private readonly tutorial: TutorialService) {}

  @Get()
  view(@CurrentContext() ctx: RequestContext) {
    return this.tutorial.view(ctx);
  }

  /** The words the guides fill in (dev mode; neutral words without them). */
  @Get('guide-values')
  guideValues() {
    return this.tutorial.guideValues();
  }

  @Put()
  save(@CurrentContext() ctx: RequestContext, @Body() body: SaveTutorialDto) {
    return this.tutorial.save(ctx, body);
  }

  @Delete()
  reset(@CurrentContext() ctx: RequestContext) {
    return this.tutorial.reset(ctx);
  }
}
