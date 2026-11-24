import {
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createConnection } from 'node:net';

import { loadEnvironment } from '../config/environment.js';
import type { UploadMalwareScanProvider } from '../storage/upload-malware-scan.provider.js';

const unavailable = () =>
  new ServiceUnavailableException({
    error: {
      code: 'CANDIDATE_SCAN_UNAVAILABLE',
      message: 'File scanning is unavailable. Try again.',
    },
  });

@Injectable()
export class CandidateClamav implements UploadMalwareScanProvider {
  async scan(content: Buffer): Promise<void> {
    const { CANDIDATE_CLAMAV_PORT: port, CANDIDATE_CLAMAV_SOCKET: path } = loadEnvironment();
    if (!port && !path) throw unavailable();

    await new Promise<void>((resolve, reject) => {
      const socket = createConnection(path ? { path } : { host: '127.0.0.1', port: port! });
      const rejectUnavailable = () => finish(unavailable());
      const timer = setTimeout(rejectUnavailable, 8000);
      let response = Buffer.alloc(0);
      function finish(error?: Error) {
        clearTimeout(timer);
        socket.destroy();
        if (error) reject(error);
        else resolve();
      }
      socket.once('error', rejectUnavailable);
      socket.once('end', rejectUnavailable);
      socket.once('connect', () => {
        const header = Buffer.alloc(4);
        header.writeUInt32BE(content.length);
        socket.write(Buffer.concat([Buffer.from('zINSTREAM\0'), header, content, Buffer.alloc(4)]));
      });
      socket.on('data', (chunk: Buffer) => {
        if (response.length + chunk.length > 1024) return rejectUnavailable();
        response = Buffer.concat([response, chunk]);
        const end = response.indexOf(0);
        if (end < 0) return;
        const message = response.subarray(0, end).toString('utf8');
        if (message === 'stream: OK') finish();
        else if (/^stream: .+ FOUND$/.test(message))
          finish(
            new UnprocessableEntityException({
              error: { code: 'CANDIDATE_FILE_UNSAFE', message: 'This file could not be accepted.' },
            }),
          );
        else rejectUnavailable();
      });
    });
  }
}
