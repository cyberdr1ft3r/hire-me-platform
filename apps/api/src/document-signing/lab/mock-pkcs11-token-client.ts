import { createHash } from 'node:crypto';

import forge from 'node-forge';

import { mapNativePkcs11Failure } from './pkcs11-lab.errors.js';
import type { Pkcs11TokenClient, SimulatedPkcs11Failure } from './pkcs11-token-client.types.js';

/** In-memory PKCS#11 stand-in for failure-matrix tests without SoftHSM (Issue #183). */
export function createMockPkcs11TokenClient(options: {
  pin: string;
  failures?: SimulatedPkcs11Failure[];
}): Pkcs11TokenClient {
  const keys = new Map<string, forge.pki.rsa.PrivateKey>();
  const failures = options.failures ?? [];

  function nextFailure(at: SimulatedPkcs11Failure['at']) {
    const index = failures.findIndex((entry) => entry.at === at);
    if (index >= 0) {
      const failure = failures.splice(index, 1)[0];
      if (failure) {
        throw mapNativePkcs11Failure(failure.code);
      }
    }
  }

  return {
    login(pin: string) {
      nextFailure('login');
      if (pin !== options.pin) {
        throw mapNativePkcs11Failure('PKCS11_LOGIN_FAILED');
      }
    },
    logout() {
      // no-op
    },
    provisionLabCredential(material) {
      const keypair = forge.pki.rsa.generateKeyPair(2048);
      keys.set(material.privateKeyLabel, keypair.privateKey);
      const cert = forge.pki.createCertificate();
      cert.publicKey = keypair.publicKey;
      cert.serialNumber = '01';
      cert.validity.notBefore = new Date(Date.now() - 86_400_000);
      cert.validity.notAfter = new Date(Date.now() + 86_400_000 * 365);
      const attrs = [{ name: 'commonName', value: material.commonName }];
      cert.setSubject(attrs);
      cert.setIssuer(attrs);
      cert.sign(keypair.privateKey, forge.md.sha256.create());
      const certificateDer = Buffer.from(
        forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(),
        'binary',
      );
      const certificatePem = forge.pki.certificateToPem(cert);
      return {
        kind: material.kind,
        subjectCommonName: material.commonName,
        certificateDer,
        certificatePem,
        trustAnchorPem: certificatePem,
        certificateFingerprintSha256: createHash('sha256').update(certificateDer).digest('hex'),
        privateKeyLabel: material.privateKeyLabel,
      };
    },
    findPrivateKeyByLabel(label: string) {
      nextFailure('findKey');
      const key = keys.get(label);
      if (!key) {
        throw mapNativePkcs11Failure('PKCS11_KEY_NOT_FOUND');
      }
      return key;
    },
    signSha256RsaPkcs1(privateKey: unknown, digest: Buffer) {
      nextFailure('sign');
      const md = {
        algorithm: 'sha256',
        digest: () => forge.util.createBuffer(digest.toString('binary')),
      } as forge.md.MessageDigest;
      const signed = (privateKey as forge.pki.rsa.PrivateKey).sign(
        md,
      ) as unknown as forge.util.ByteStringBuffer;
      return Buffer.from(signed.getBytes(), 'binary');
    },
    close() {
      keys.clear();
    },
    dispose() {
      keys.clear();
    },
  };
}
