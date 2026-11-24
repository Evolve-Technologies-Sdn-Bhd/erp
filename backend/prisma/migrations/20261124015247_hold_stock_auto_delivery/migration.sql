-- AlterTable
ALTER TABLE `sal_sales_order` ADD COLUMN `autoDoNote` VARCHAR(300) NULL;

-- AlterTable
ALTER TABLE `sal_setting` ADD COLUMN `autoDelivery` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `holdStock` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `svc_job` ADD COLUMN `deliveryId` CHAR(36) NULL,
    ADD COLUMN `deliveryNo` VARCHAR(30) NULL,
    ADD COLUMN `stockConfirmedAt` DATETIME(3) NULL,
    ADD COLUMN `stockConfirmedBy` VARCHAR(100) NULL;

-- CreateTable
CREATE TABLE `svc_setting` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `warehouseConfirms` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedBy` VARCHAR(20) NOT NULL,

    UNIQUE INDEX `svc_setting_tenantId_key`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
