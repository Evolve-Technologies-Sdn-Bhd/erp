import { Transform, Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min, ValidateNested } from 'class-validator';
import { GIFT_RULES, PACKAGE_CODE, type GiftRule } from '../packages.rules';

const MONEY = /^\d{1,14}(\.\d{1,2})?$/;
const QTY = /^\d{1,14}(\.\d{1,4})?$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const trimmed = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);
const blankToNull = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value);

/** One item of the package, or one gift: the item, how many, in which unit. */
export class PackageLineDto {
  @IsString()
  @IsNotEmpty({ message: 'Pick the item.' })
  @MaxLength(30)
  itemCode!: string;

  @Transform(trimmed)
  @Matches(QTY, { message: 'The quantity must be a number with up to 4 decimals.' })
  qty!: string;

  @IsString()
  @IsNotEmpty({ message: 'Pick the unit.' })
  @MaxLength(10)
  uomCode!: string;
}

/** What the package form (C16) saves. */
class PackageFieldsDto {
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty({ message: 'Give the package the name customers see.' })
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty({ message: 'Pick the unit the package is sold in.' })
  @MaxLength(10)
  uomCode!: string;

  @IsString()
  @IsNotEmpty({ message: 'Pick the sales tax.' })
  @MaxLength(10)
  salesTaxCode!: string;

  @IsString()
  @IsNotEmpty({ message: 'Pick the price list the items are priced from.' })
  @MaxLength(20)
  priceListCode!: string;

  @Transform(trimmed)
  @Matches(MONEY, { message: 'The package price must be an amount with up to 2 decimals.' })
  packagePrice!: string;

  @IsIn(GIFT_RULES, { message: 'Choose how the gift is given.' })
  giftRule!: GiftRule;

  @Matches(DATE_ONLY, { message: 'Runs from must look like 2026-09-01.' })
  runsFrom!: string;

  @IsOptional()
  @Transform(blankToNull)
  @Matches(DATE_ONLY, { message: 'Runs until must look like 2026-12-31, or be empty for no end.' })
  runsUntil?: string | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PackageLineDto)
  items!: PackageLineDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PackageLineDto)
  gifts!: PackageLineDto[];
}

export class CreatePackageDto extends PackageFieldsDto {
  @Transform(upper)
  @Matches(PACKAGE_CODE, { message: 'Use capitals, digits and dashes, like PK-DIN-06 (up to 20).' })
  code!: string;
}

export class UpdatePackageDto extends PackageFieldsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class PackageVersionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
