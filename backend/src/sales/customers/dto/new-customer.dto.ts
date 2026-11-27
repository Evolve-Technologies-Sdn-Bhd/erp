import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const trimmed = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const blankToNull = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value);
const upperOrNull = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() || null : value);

/** What a salesperson types for a new household customer on the order form (S11). Core fills in the rest. */
export class NewCustomerDto {
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty({ message: "Type the customer's name." })
  @MaxLength(150)
  name!: string;

  @Transform(trimmed)
  @IsString()
  @IsNotEmpty({ message: "Type the customer's phone number." })
  @MaxLength(30)
  phone!: string;

  /** Billing and delivery in one: where the goods go and the installer comes. */
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty({ message: 'Type the address. It is used for delivery and installation.' })
  @MaxLength(300)
  address!: string;

  @IsOptional()
  @Transform(blankToNull)
  @IsEmail({}, { message: 'Type a valid email address.' })
  @MaxLength(150)
  email?: string | null;

  @IsOptional()
  @Transform(upperOrNull)
  @Matches(/^[A-Z0-9-]{4,30}$/, { message: 'An NRIC number is digits and hyphens, like 900101-01-1234.' })
  idNumber?: string | null;

  /** Phase 5: the customers that look like this one (same name or same address) were checked and it is someone else. */
  @IsOptional()
  @IsBoolean()
  notDuplicate?: boolean;
}

/** Phase 5: what to check before adding a customer (phone, name and address). */
export class CheckCustomerDto {
  @Transform(trimmed)
  @IsString()
  @MaxLength(150)
  name!: string;

  @Transform(trimmed)
  @IsString()
  @MaxLength(30)
  phone!: string;

  @Transform(trimmed)
  @IsString()
  @MaxLength(300)
  address!: string;
}

/** Phase 5: ask to take over another salesperson's customer. */
export class TransferRequestDto {
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  customerCode!: string;

  @Transform(trimmed)
  @IsString()
  @IsNotEmpty({ message: 'Say why the customer should be yours.' })
  @MaxLength(300)
  reason!: string;
}
