import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Matches, MaxLength, Min, ValidateNested } from 'class-validator';

const MONTH_MESSAGE = 'Month must look like 2026-11.';

export class TargetMonthQueryDto {
  /** "2026-11"; this month when empty. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: MONTH_MESSAGE })
  month?: string;
}

export class AgentTargetDto {
  @IsString()
  @MaxLength(20)
  agentCode!: string;

  /** Empty or null: no target for this salesperson. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  amount?: string | null;
}

/** One branch's month: its own target and its salespeople's, saved together (phase 5). Checked in targets.rules.ts. */
export class SaveTargetsDto {
  @Matches(/^\d{4}-\d{2}$/, { message: MONTH_MESSAGE })
  month!: string;

  @IsString()
  @MaxLength(10)
  branchCode!: string;

  /** Empty or null: no branch target. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  amount?: string | null;

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AgentTargetDto)
  agents!: AgentTargetDto[];

  /** The branch-month's version as loaded (0 when it had none). */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;
}
