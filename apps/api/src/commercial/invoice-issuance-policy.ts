import { Injectable } from '@nestjs/common';

import { forbidden } from './commercial.errors.js';
import { loadEnvironment } from '../config/environment.js';

@Injectable()
export class InvoiceIssuancePolicy {
  assertEnabled(): void {
    const environment = loadEnvironment();
    const enabled = environment.INVOICE_ISSUANCE_ENABLED ?? environment.NODE_ENV !== 'production';

    if (!enabled) {
      throw forbidden(
        'INVOICE_ISSUANCE_DISABLED',
        'Invoice issuance is disabled pending business acceptance.',
      );
    }
  }
}
