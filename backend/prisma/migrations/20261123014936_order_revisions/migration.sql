-- AlterTable
ALTER TABLE `sal_sales_order` ADD COLUMN `installBookedAt` DATETIME(3) NULL,
    ADD COLUMN `installBooking` VARCHAR(150) NULL,
    ADD COLUMN `reviseReason` VARCHAR(300) NULL,
    ADD COLUMN `revisingSince` DATETIME(3) NULL,
    ADD COLUMN `revisionNo` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `sal_setting` ADD COLUMN `reviseOrders` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `sal_order_revision` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `salesOrderId` CHAR(36) NOT NULL,
    `revisionNo` INTEGER NOT NULL,
    `snapshot` JSON NOT NULL,
    `reason` VARCHAR(300) NOT NULL,
    `revisedBy` VARCHAR(100) NOT NULL,
    `revisedAt` DATETIME(3) NOT NULL,
    `replacedAt` DATETIME(3) NULL,
    `changes` TEXT NULL,

    INDEX `sal_order_revision_tenantId_salesOrderId_idx`(`tenantId`, `salesOrderId`),
    UNIQUE INDEX `sal_order_revision_salesOrderId_revisionNo_key`(`salesOrderId`, `revisionNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sal_order_revision` ADD CONSTRAINT `sal_order_revision_salesOrderId_fkey` FOREIGN KEY (`salesOrderId`) REFERENCES `sal_sales_order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
