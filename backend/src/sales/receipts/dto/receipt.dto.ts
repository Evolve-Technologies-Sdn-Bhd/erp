import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min } from 'class-validator';
import { ListQueryDto } from '../../../platform/http/list-query.dto';
import { RECEIPT_KINDS, RECEIPT_METHODS } from '../receipt.rules';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class ReceiptListQueryDto extends ListQueryDto {
  /** The receipts of one sales order. */
  @IsOptional()
  @IsUUID()
  order?: string;
}

class ReceiptFieldsDto {
  /** The day the money was received. */
  @Matches(DATE_ONLY, { message: 'Pick the day the money was received.' })
  docDate!: string;

  @IsIn([...RECEIPT_KINDS], { message: 'Pick deposit or balance.' })
  kind!: string;

  @IsIn([...RECEIPT_METHODS], { message: 'Pick how the customer paid.' })
  method!: string;

  /** "500.00": checked in receipt.rules.ts. */
  @IsString()
  @MaxLength(20)
  amount!: string;

  /** Cheque number, transfer reference or card approval code. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  payerRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /** Files uploaded first (POST /attachments): photos or PDFs of the slip. On a change, new files only. */
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('all', { each: true })
  proofIds!: string[];
}

export class CreateReceiptDto extends ReceiptFieldsDto {
  @IsUUID('all', { message: 'Pick the sales order the payment is for.' })
  salesOrderId!: string;
}

export class UpdateReceiptDto extends ReceiptFieldsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class VerifyReceiptDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  /** The bank transaction or card settlement slip the receipt matches. */
  @IsString()
  @MaxLength(60)
  reference!: string;
}

export class ReceiptReasonDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @IsString()
  @MaxLength(300)
  reason!: string;
}
