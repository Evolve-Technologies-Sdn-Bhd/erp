import { Injectable, NotFoundException, type CanActivate } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';

/** The Service module's routes answer only where it is turned on (SERVICE_MODULE=on); elsewhere they do not exist. */
@Injectable()
export class ServiceOnGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(): boolean {
    if (!this.config.get('SERVICE_MODULE', { infer: true })) throw new NotFoundException({ code: 'NOT_FOUND', message: 'The Service module is not turned on.' });
    return true;
  }
}
