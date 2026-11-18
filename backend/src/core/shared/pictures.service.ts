import { Injectable } from '@nestjs/common';
import type { FieldChange } from '../../platform/activity/audit.rules';
import { AttachmentsService } from '../../platform/attachments/attachments.service';
import type { RequestContext } from '../../platform/context/request-context';
import type { FieldError } from '../../platform/http/errors';
import { PrismaService, type Tx } from '../../platform/prisma/prisma.service';
import { pictureError } from './picture.rules';

export interface PictureChange {
  /** The picture the record keeps after the save. */
  pictureId: string | null;
  /** "Picture: sofa.jpg → sofa-2026.jpg" for the activity line, or null when it stays. */
  change: FieldChange | null;
  error: FieldError | null;
}

/**
 * The picture of an item or package (phase 5). The form uploads the file first (POST /attachments) and sends its id;
 * the save checks it and links it to the record in the same transaction. The activity names the files.
 */
@Injectable()
export class CorePictures {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attachments: AttachmentsService,
  ) {}

  /** `next` undefined: the form did not send a picture, so it stays as it is. Null removes it. */
  async change(tenantId: string, entityType: string, entityId: string | null, before: string | null, next: string | null | undefined): Promise<PictureChange> {
    if (next === undefined || next === before) return { pictureId: before, change: null, error: null };
    const ids = [before, next].filter((id): id is string => Boolean(id));
    const files = await this.prisma.sysAttachment.findMany({
      where: { tenantId, id: { in: ids } },
      select: { id: true, fileName: true, mimeType: true, entityType: true, entityId: true },
    });
    const file = (id: string | null) => (id ? (files.find((f) => f.id === id) ?? null) : null);
    const problem = next ? pictureError(file(next), entityType, entityId) : null;
    return {
      pictureId: next,
      change: { field: 'picture', label: 'Picture', from: before ? (file(before)?.fileName ?? 'picture') : null, to: next ? (file(next)?.fileName ?? 'picture') : null },
      error: problem ? { field: 'pictureId', message: problem } : null,
    };
  }

  /** Links the new picture to the record, inside the record's save. */
  async attach(tx: Tx, ctx: RequestContext, picture: PictureChange, entityType: string, entityId: string): Promise<void> {
    if (picture.change && picture.pictureId) await this.attachments.attach(tx, ctx, [picture.pictureId], entityType, entityId);
  }
}
