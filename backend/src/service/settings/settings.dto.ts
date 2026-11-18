import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PERSON_ROLES, SITE_TYPES } from '../board/booking.rules';
import { JOB_TYPES } from '../jobs/jobs.rules';

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
