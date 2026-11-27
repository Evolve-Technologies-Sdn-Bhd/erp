import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { MY_STATES, POSTCODE_MESSAGE, POSTCODE_OR_EMPTY, STATE_MESSAGE } from '../../../platform/address/address';
import { ListQueryDto } from '../../../platform/http/list-query.dto';
import { INSTALL_FILTERS, PAYMENT_FILTERS, type InstallFilter, type PaymentFilter } from '../list-filters.rules';

const DECIMAL_4 = /^\d{1,14}(\.\d{1,4})?$/;
const PERCENT = /^\d{1,3}(\.\d{1,2})?$/;
const MONEY = /^\d{1,14}(\.\d{1,2})?$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class OrderListQueryDto extends ListQueryDto {
  /** Phase 5, the salesperson's home: where the installation stands (list-filters.rules.ts). */
  @IsOptional()
  @IsIn(INSTALL_FILTERS)
  install?: InstallFilter;

  /** Phase 5, the salesperson's home: how much is paid by verified official receipts. */
  @IsOptional()
  @IsIn(PAYMENT_FILTERS)
  payment?: PaymentFilter;

  /** Phase 5: ?preOrder=1, only pre-orders. */
  @IsOptional()
  @IsIn(['1'])
  preOrder?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  customer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  agent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  branch?: string;
}

export class OrderLineDto {
  @IsString()
  @IsNotEmpty({ message: 'Pick an item from Master Data.' })
  @MaxLength(30)
  itemCode!: string;

  @Matches(DECIMAL_4, { message: 'Quantity must be a number with up to 4 decimals.' })
  qty!: string;

  @Matches(DECIMAL_4, { message: 'Unit price must be a number with up to 4 decimals.' })
  unitPrice!: string;

  @IsOptional()
  @Matches(PERCENT, { message: 'Discount must be a percentage like 5 or 7.5.' })
  discountPct?: string;
}

/**
 * A line on a sales order: an item with its price, or a package (phase 5) with the number of sets and the free gift
 * the customer chose. A package is priced from Core, so it carries no price or discount.
 */
export class OrderEntryLineDto {
  @ValidateIf((l: OrderEntryLineDto) => !l.packageCode)
  @IsString()
  @IsNotEmpty({ message: 'Pick an item from Master Data.' })
  @MaxLength(30)
  itemCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  packageCode?: string;

  @Matches(DECIMAL_4, { message: 'Quantity must be a number with up to 4 decimals.' })
  qty!: string;

  @ValidateIf((l: OrderEntryLineDto) => !l.packageCode)
  @Matches(DECIMAL_4, { message: 'Unit price must be a number with up to 4 decimals.' })
  unitPrice?: string;

  @ValidateIf((l: OrderEntryLineDto) => !l.packageCode && l.discountPct !== undefined)
  @Matches(PERCENT, { message: 'Discount must be a percentage like 5 or 7.5.' })
  discountPct?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  giftItemCode?: string | null;
}

/** A voucher on the order (phase 5): the number the agent types and the amount off before tax. */
export class OrderVoucherDto {
  @IsString()
  @IsNotEmpty({ message: 'Type the voucher number.' })
  @MaxLength(30)
  voucherNo!: string;

  @Matches(MONEY, { message: 'Amount must be a number with up to 2 decimals.' })
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  taxCode?: string | null;
}

class OrderFieldsDto {
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'Order date must look like 2026-09-29.' })
  docDate?: string;

  @IsOptional()
  @Matches(DATE_ONLY, { message: 'Delivery wanted by must look like 2026-10-12.' })
  deliveryWantedBy?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  customerPoRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  project?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  deliveryAddress?: string;

  @IsOptional()
  @IsIn(['STD', 'BTO', 'PRJ'], { message: 'Pick an order type from the list.' })
  orderTypeCode?: string;

  /** Phase 5: asked only when the company turns on "Ask for an installation option on the order". */
  @IsOptional()
  @IsIn(['INSTALLATION', 'DELIVERY', 'COLLECT'], { message: 'Pick installation, delivery only or collect.' })
  installOption?: string | null;

  @IsOptional()
  @Matches(DATE_ONLY, { message: 'Preferred date must look like 2026-10-01.' })
  installDate?: string | null;

  /** Phase 5: the delivery address's postcode and state, kept with the installation option. Empty clears them. */
  @IsOptional()
  @Matches(POSTCODE_OR_EMPTY, { message: POSTCODE_MESSAGE })
  deliveryPostcode?: string | null;

  @IsOptional()
  @IsIn(['', ...MY_STATES], { message: STATE_MESSAGE })
  deliveryState?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string;
}

export class CreateOrderDto extends OrderFieldsDto {
  @IsString()
  @IsNotEmpty({ message: 'Pick the customer from Master Data.' })
  @MaxLength(20)
  customerCode!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Add at least one line.' })
  @ValidateNested({ each: true })
  @Type(() => OrderEntryLineDto)
  lines!: OrderEntryLineDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderVoucherDto)
  vouchers?: OrderVoucherDto[];
}

export class UpdateOrderDto extends OrderFieldsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  customerCode?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Add at least one line.' })
  @ValidateNested({ each: true })
  @Type(() => OrderEntryLineDto)
  lines?: OrderEntryLineDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderVoucherDto)
  vouchers?: OrderVoucherDto[];
}

export class VersionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

/** Phase 5: starts the next revision of a released order, with why. */
export class ReviseOrderDto extends VersionDto {
  @IsString()
  @Matches(/\S/, { message: 'Type why the order is revised.' })
  @MaxLength(300)
  reason!: string;
}

export class RequestApprovalDto extends VersionDto {
  @IsString()
  @IsNotEmpty({ message: 'Type a reason for the approver.' })
  @MaxLength(1000)
  reason!: string;
}
