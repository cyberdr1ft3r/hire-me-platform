import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { plainAddPlaceholder } from '@signpdf/placeholder-plain';

@Injectable()
export class PreparedSigningArtifactService {
  buildPreparedArtifact(sourcePdf: Buffer): Buffer {
    return plainAddPlaceholder({
      pdfBuffer: sourcePdf,
      reason: 'Hire Me signing placeholder',
      contactInfo: 'signing@hireme.local',
      name: 'Hire Me',
      location: 'Prepared artifact',
    });
  }

  preparedArtifactSha256(preparedPdf: Buffer): string {
    return createHash('sha256').update(preparedPdf).digest('hex');
  }
}
