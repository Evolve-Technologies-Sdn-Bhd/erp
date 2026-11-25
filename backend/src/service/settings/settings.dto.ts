import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { PERSON_ROLES, SITE_TYPES } from '../board/booking.rules';
import { JOB_TYPES } from '../jobs/jobs.rules';

/** Service's own switches (phase 5). */
export class GeneralSettingsDto {
  @IsBoolean()
  warehouseConfirms!: boolean;

  /** Not sent: kept as it is. */
  @IsOptional()
  @IsBoolean()
  pickAndSign?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9-]{1,20}$/, { message: 'Use letters, numbers and dashes, up to 20.' })
  warrantyLocation?: string;
}

/** A person the office books (V05 · People). */
export class PersonDto {
  @IsString()
  @IsNotEmpty({ message: 'Type the name.' })
  @MaxLength(100)
  name!: string;

  @IsIn([...PERSON_ROLES], { message: 'Pick installer, technician or warranty.' })
  role!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  /** The jobs this person takes. Left out on a new person: what their role gives (F3 part 4). */
  @IsOptional()
  @IsArray()
  @IsIn([...JOB_TYPES], { each: true, message: 'Pick job types from the list.' })
  jobTypes?: string[];

  /** Claims a fee per job with their own invoice (F5). Left out on a new person: installers do, others do not. */
  @IsOptional()
  @IsBoolean()
  claimsFees?: boolean;

  /** The sites this person goes to. Left out on a new person: all of them. */
  @IsOptional()
  @IsArray()
  @IsIn([...SITE_TYPES], { each: true, message: 'Pick site types from the list.' })
  siteTypes?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePersonDto extends PersonDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

/** A slot group (V05 · Slot groups). Times are minutes from midnight. */
export class SlotGroupDto {
  @IsString()
  @IsNotEmpty({ message: 'Type a name for the slot group.' })
  @MaxLength(60)
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(600)
  slotMinutes!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1440)
  firstStart!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1440)
  lastEnd!: number;

  @IsArray()
  @ArrayMinSize(1, { message: 'Pick the job types this slot group is for.' })
  @IsIn([...JOB_TYPES], { each: true })
  jobTypes!: string[];

  /** The job types the Planning Board picks this group for first (F3 part 4). Kept when left out. */
  @IsOptional()
  @IsArray()
  @IsIn([...JOB_TYPES], { each: true })
  defaultFor?: string[];

  /** The installer's reference fee for a job of this category (F5); empty or null: not set. Kept when left out. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null && v !== '')
  @Matches(/^\d{1,14}(\.\d{1,2})?$/, { message: 'Type a fee like 120.00.' })
  feeAmount?: string | null;

  /** The sites the group is for. Left out: every site on a new group, kept on an update. */
  @IsOptional()
  @IsArray()
  @IsIn([...SITE_TYPES], { each: true, message: 'Pick site types from the list.' })
  siteTypes?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSlotGroupDto extends SlotGroupDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
