import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { VersionDto } from '../jobs/dto/job.dto';

export class UpdateWarrantyDto extends VersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  serialNo?: string;
}

export class VoidWarrantyDto extends VersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

/** A claim on a unit: a warranty job, not booked. */
export class WarrantyJobDto {
  @IsString({ message: 'Type what is wrong.' })
  @MaxLength(2000)
  problem!: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Preferred date must look like 2026-10-01.' })
  preferredDate?: string;
}

/** The office's decision on a warranty job. Checked in warranty.rules.ts. */
export class AssessJobDto extends VersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(12)
  result?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
