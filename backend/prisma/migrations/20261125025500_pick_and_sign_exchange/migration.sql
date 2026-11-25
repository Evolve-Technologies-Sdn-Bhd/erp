-- DropIndex
DROP INDEX `svc_return_jobId_itemCode_key` ON `svc_return`;

-- AlterTable
ALTER TABLE `mdm_item` ADD COLUMN `hasTag` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `svc_job` ADD COLUMN `exchange` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `pickSignedBy` VARCHAR(100) NULL;

-- AlterTable
ALTER TABLE `svc_job_item` ADD COLUMN `extra` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `svc_return` ADD COLUMN `grnNo` VARCHAR(30) NULL,
    ADD COLUMN `location` VARCHAR(40) NULL,
    ADD COLUMN `reason` VARCHAR(12) NOT NULL DEFAULT 'UNUSED',
    ADD COLUMN `visitNo` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `svc_setting` ADD COLUMN `pickAndSign` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `warrantyLocation` VARCHAR(40) NOT NULL DEFAULT 'WNTY';

-- CreateIndex
CREATE UNIQUE INDEX `svc_return_jobId_itemCode_reason_visitNo_key` ON `svc_return`(`jobId`, `itemCode`, `reason`, `visitNo`);

