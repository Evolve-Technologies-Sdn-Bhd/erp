-- AlterTable
ALTER TABLE `svc_job` ADD COLUMN `expectedEnd` INTEGER NULL,
    ADD COLUMN `extendReason` VARCHAR(300) NULL,
    ADD COLUMN `overdueSince` DATETIME(3) NULL,
    ADD COLUMN `siteType` VARCHAR(12) NULL;

-- AlterTable
ALTER TABLE `svc_person` ADD COLUMN `jobTypes` VARCHAR(60) NOT NULL DEFAULT '',
    ADD COLUMN `siteTypes` VARCHAR(60) NOT NULL DEFAULT 'LANDED,CONDO,COMMERCIAL';

-- AlterTable
ALTER TABLE `svc_slot_group` ADD COLUMN `defaultFor` VARCHAR(60) NOT NULL DEFAULT '';

-- Existing people keep taking what their role gave them; booked jobs expect to finish at the end of their slot;
-- the starter slot groups become the defaults the board picks first.
UPDATE `svc_person` SET `jobTypes` = CASE `role` WHEN 'INSTALLER' THEN 'INSTALLATION' WHEN 'TECHNICIAN' THEN 'SERVICE,REPAIR' WHEN 'WARRANTY' THEN 'WARRANTY' ELSE '' END;
UPDATE `svc_job` SET `expectedEnd` = `slotEnd` WHERE `slotEnd` IS NOT NULL;
UPDATE `svc_slot_group` SET `defaultFor` = 'INSTALLATION' WHERE `code` = 'STANDARD';
UPDATE `svc_slot_group` SET `defaultFor` = 'SERVICE,WARRANTY,REPAIR' WHERE `code` = 'SHORT';
