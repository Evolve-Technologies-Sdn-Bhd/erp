import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { ListQueryDto } from '../../platform/http/list-query.dto';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class VoucherListQueryDto extends ListQueryDto {}

/** A voucher as the list keeps it (phase 5). Checked in vouchers.rules.ts. */
export class SaveVoucherDto {
  @IsString()
  @MaxLength(30)
  voucherNo!: string;

  @IsString()
  @MaxLength(100)
  description!: string;

  @IsString()
  @MaxLength(20)
  amount!: string;

  @Matches(DATE_ONLY, { message: 'Pick the first day.' })
  validFrom!: string;

  @IsOptional()
  @Matches(/^(\d{4}-\d{2}-\d{2})?$/, { message: 'The last day must look like 2026-12-31.' })
  validUntil?: string | null;

  /** How many orders may use it; empty for no limit. */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'A whole number of 1 or more, or leave it empty for no limit.' })
  maxUses?: number | null;

  /** Needed when changing one. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;
}

export class VoucherVersionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
