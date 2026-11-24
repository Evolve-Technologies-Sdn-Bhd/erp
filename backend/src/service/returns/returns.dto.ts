import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/** The store received a returned part (phase 5). Checked in returns.rules.ts. */
export class ReceiveReturnDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @IsString()
  @MaxLength(20)
  goodQty!: string;

  @IsString()
  @MaxLength(20)
  damagedQty!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
