import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, ValidateNested } from 'class-validator';
import { ListQueryDto } from '../../../platform/http/list-query.dto';

const DECIMAL_4 = /^\d{1,14}(\.\d{1,4})?$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class DeliveryListQueryDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  customer?: string;
}

export class CreateDeliveryDto {
  @IsUUID('all', { message: 'Pick a released sales order.' })
  salesOrderId!: string;
}

export class DeliveryLineDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  lineNo!: number;

  @Matches(DECIMAL_4, { message: 'Deliver now must be a number with up to 4 decimals.' })
  qty!: string;
}

export class UpdateDeliveryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @IsOptional()
  @Matches(DATE_ONLY, { message: 'Delivery date must look like 2026-09-29.' })
  docDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  vehicle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  driver?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  consignmentNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  deliverTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  receiver?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  warehouseNote?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliveryLineDto)
  lines?: DeliveryLineDto[];
}

export class DeliveryVersionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

/** The customer signed (phase 5): who, and the signed delivery order already uploaded (or on the delivery order). */
export class SignDeliveryDto extends DeliveryVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  signerName?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  fileIds?: string[];
}

export class RefuseDeliveryDto extends DeliveryVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  fileIds?: string[];
}

/** Management's decision on a delivery order the customer did not sign, or goods checked back in. */
export class DeliveryNoteDto extends DeliveryVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class DeliveryApprovalDto extends DeliveryVersionDto {
  @IsString()
  @IsNotEmpty({ message: 'Type a reason for the approver.' })
  @MaxLength(1000)
  reason!: string;
}
