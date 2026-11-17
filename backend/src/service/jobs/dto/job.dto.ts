import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { ListQueryDto } from '../../../platform/http/list-query.dto';
import { JOB_TYPES } from '../jobs.rules';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class JobListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsIn([...JOB_TYPES], { message: 'Pick a job type from the list.' })
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  branch?: string;
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
