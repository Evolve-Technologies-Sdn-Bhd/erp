-- AlterTable
ALTER TABLE `sal_sales_order` ADD COLUMN `installBookedFor` DATE NULL,
    ADD COLUMN `installDoneAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `sal_target` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `month` CHAR(7) NOT NULL,
    `branchCode` VARCHAR(10) NOT NULL,
    `agentCode` VARCHAR(20) NOT NULL DEFAULT '',
    `amount` DECIMAL(18, 2) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdBy` VARCHAR(20) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedBy` VARCHAR(20) NOT NULL,

    UNIQUE INDEX `sal_target_tenantId_month_branchCode_agentCode_key`(`tenantId`, `month`, `branchCode`, `agentCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `sal_sales_order_tenantId_installBookedFor_idx` ON `sal_sales_order`(`tenantId`, `installBookedFor`);

-- Orders already booked or installed before this change: what Service had told Sales, copied once from the jobs
-- (from now on Sales keeps them from Service's events).
UPDATE `sal_sales_order` o
  JOIN `svc_job` j ON j.`salesOrderId` = o.`id` AND j.`tenantId` = o.`tenantId`
  SET o.`installBookedFor` = j.`jobDate`
  WHERE o.`installBooking` IS NOT NULL AND j.`jobDate` IS NOT NULL AND j.`jobType` = 'INSTALLATION' AND j.`stage` <> 'CANCELLED' AND j.`stage` <> 'NOT_BOOKED';

UPDATE `sal_sales_order` o
  JOIN `svc_job` j ON j.`salesOrderId` = o.`id` AND j.`tenantId` = o.`tenantId`
  SET o.`installDoneAt` = j.`doneAt`
  WHERE j.`jobType` = 'INSTALLATION' AND j.`result` = 'COMPLETE' AND j.`doneAt` IS NOT NULL;
