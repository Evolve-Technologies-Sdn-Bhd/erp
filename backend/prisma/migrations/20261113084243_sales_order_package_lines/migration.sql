-- AlterTable
ALTER TABLE `sal_sales_order_line` ADD COLUMN `lineKind` VARCHAR(10) NOT NULL DEFAULT 'ITEM',
    ADD COLUMN `packageCode` VARCHAR(20) NULL,
    ADD COLUMN `packageGroup` INTEGER NULL,
    ADD COLUMN `packageName` VARCHAR(100) NULL,
    ADD COLUMN `packagePrice` DECIMAL(18, 2) NULL,
    ADD COLUMN `packageQty` DECIMAL(18, 4) NULL,
    ADD COLUMN `packageUomCode` VARCHAR(10) NULL;

-- CreateIndex
CREATE INDEX `sal_sales_order_line_tenantId_packageCode_idx` ON `sal_sales_order_line`(`tenantId`, `packageCode`);
