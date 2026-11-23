import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, ValidateNested } from 'class-validator';
import { ListQueryDto } from '../../platform/http/list-query.dto';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class ClaimListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsUUID()
  personId?: string;
}

export class EligibleQueryDto {
  @IsUUID('all', { message: 'Pick the installer.' })
  personId!: string;

  /** Any day in the claim period. */
  @Matches(DATE_ONLY, { message: 'Day must look like 2026-10-01.' })
  day!: string;

  /** Editing a claim: its own jobs still count as free. */
  @IsOptional()
  @IsUUID()
  claimId?: string;
}

export class ClaimLineDto {
  @IsUUID('all', { message: 'Pick a job from the list.' })
  jobId!: string;

  /** Left out: the fee by rule. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  amount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

class ClaimFieldsDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClaimLineDto)
  lines?: ClaimLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  invoiceNo?: string;

  @IsOptional()
  @IsBoolean()
  selfBilled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /** The installer's invoice, uploaded first with POST /attachments and kept with the claim on save. */
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  invoiceFileIds?: string[];
}

/** An installer's claim for one claim period (F5). */
export class CreateClaimDto extends ClaimFieldsDto {
  @IsUUID('all', { message: 'Pick the installer.' })
  personId!: string;

  /** Any day in the claim period. */
  @Matches(DATE_ONLY, { message: 'Day must look like 2026-10-01.' })
  day!: string;
}

export class VersionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class UpdateClaimDto extends ClaimFieldsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class ReturnClaimDto extends VersionDto {
  @IsString()
  @Matches(/\S/, { message: 'Type why the claim is sent back.' })
  @MaxLength(300)
  reason!: string;
}

export class PayClaimDto extends VersionDto {
  @IsString()
  @Matches(/\S/, { message: 'Type the payment voucher (PV) number.' })
  @MaxLength(40)
  paymentRef!: string;

  @Matches(DATE_ONLY, { message: 'Paid on must look like 2026-10-25.' })
  paidOn!: string;
}
