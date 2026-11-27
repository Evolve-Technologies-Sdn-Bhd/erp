-- AlterTable
ALTER TABLE `sal_sales_order` ADD COLUMN `jobCategory` VARCHAR(20) NULL,
    ADD COLUMN `contactPhone` VARCHAR(30) NULL,
    ADD COLUMN `billingName` VARCHAR(150) NULL,
    ADD COLUMN `billingAddress` VARCHAR(300) NULL,
    ADD COLUMN `paymentMode` VARCHAR(10) NULL,
    ADD COLUMN `paymentMethod` VARCHAR(12) NULL;

-- AlterTable
ALTER TABLE `svc_job` ADD COLUMN `categoryCode` VARCHAR(20) NULL;
