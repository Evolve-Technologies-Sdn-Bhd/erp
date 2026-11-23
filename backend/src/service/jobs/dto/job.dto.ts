import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { MY_STATES, POSTCODE_MESSAGE, POSTCODE_OR_EMPTY, STATE_MESSAGE } from '../../../platform/address/address';
import { SITE_TYPES } from '../../board/booking.rules';
import { ListQueryDto } from '../../../platform/http/list-query.dto';
import { JOB_TYPES } from '../jobs.rules';
import { PAID_METHODS, PAID_STATUSES, RESULTS, type PaidMethod, type PaidStatus, type VisitResult } from '../visit.rules';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class JobListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsIn([...JOB_TYPES], { message: 'Pick a job type from the list.' })
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  branch?: string;

  /** ?overdue=1: only the jobs overdue now (F3 part 4). */
  @IsOptional()
  @IsIn(['1'])
  overdue?: string;
}

class JobFieldsDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  siteAddress?: string;

  /** The site address's postcode and state: needed before booking, warned only. Empty clears them. */
  @IsOptional()
  @Matches(POSTCODE_OR_EMPTY, { message: POSTCODE_MESSAGE })
  postcode?: string | null;

  @IsOptional()
  @IsIn(['', ...MY_STATES], { message: STATE_MESSAGE })
  state?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  area?: string;

  @IsOptional()
  @Matches(DATE_ONLY, { message: 'Preferred date must look like 2026-10-01.' })
  preferredDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  /** Landed house, condo / apartment or shop / office; null when not known (F3 part 4). */
  @IsOptional()
  @IsIn([...SITE_TYPES], { message: 'Pick landed house, condo / apartment or shop / office.' })
  siteType?: string | null;
}

/** A job the office adds by hand: service, warranty or repair at a customer's site (or an installation not from an order). */
export class CreateJobDto extends JobFieldsDto {
  @IsIn([...JOB_TYPES], { message: 'Pick installation, service, warranty or repair.' })
  jobType!: string;

  @IsString()
  @IsNotEmpty({ message: 'Pick the customer from Master Data.' })
  @MaxLength(20)
  customerCode!: string;
}

export class UpdateJobDto extends JobFieldsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class CancelJobDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @IsString()
  @IsNotEmpty({ message: 'Type why the job is cancelled.' })
  @MaxLength(300)
  reason!: string;
}

export class VersionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

/** Book a job, or move a booked one (Planning Board, F3 part 2). */
export class BookJobDto extends VersionDto {
  @IsString()
  @IsNotEmpty({ message: 'Pick a person from the list.' })
  @MaxLength(36)
  personId!: string;

  @Matches(DATE_ONLY, { message: 'Date must look like 2026-10-01.' })
  date!: string;

  @IsString()
  @IsNotEmpty({ message: 'Pick a slot group from the list.' })
  @MaxLength(20)
  slotGroupCode!: string;

  /** Minutes from midnight: 720 = 12 PM. */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  start!: number;
}

/** Give a booked job longer (F3 part 4): a later expected completion that day, and why. Checked in timing.rules.ts. */
export class ExtendJobDto extends VersionDto {
  @IsString()
  @MaxLength(5)
  until!: string;

  @IsString()
  @MaxLength(300)
  reason!: string;
}

/** What happened at the visit (F3 part 3). Photos are uploaded first, to /attachments with entity SVC_JOB. */
export class RecordVisitDto extends VersionDto {
  @IsIn([...RESULTS], { message: 'Pick complete, partly done or postponed.' })
  result!: VisitResult;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  arrivedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  finishedAt?: string;

  @IsOptional()
  @IsIn([...PAID_STATUSES], { message: 'Pick paid, not paid or no charge.' })
  paidStatus?: PaidStatus;

  @IsOptional()
  @IsIn([...PAID_METHODS], { message: 'Pick cash, bank transfer, card or cheque.' })
  paidMethod?: PaidMethod;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notPaidReason?: string;

  /** The work done, in a line or two. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /** Postponed: the day the customer now asks for, if known. */
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'Date must look like 2026-10-01.' })
  nextDate?: string;
}
