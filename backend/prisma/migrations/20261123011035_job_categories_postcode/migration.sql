-- AlterTable
ALTER TABLE `sal_sales_order` ADD COLUMN `deliveryPostcode` VARCHAR(10) NULL,
    ADD COLUMN `deliveryState` VARCHAR(40) NULL;

-- AlterTable
ALTER TABLE `svc_job` ADD COLUMN `postcode` VARCHAR(10) NULL,
    ADD COLUMN `state` VARCHAR(40) NULL;

-- AlterTable
ALTER TABLE `svc_slot_group` ADD COLUMN `siteTypes` VARCHAR(60) NOT NULL DEFAULT 'LANDED,CONDO,COMMERCIAL';
