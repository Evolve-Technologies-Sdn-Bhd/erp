import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

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
}
