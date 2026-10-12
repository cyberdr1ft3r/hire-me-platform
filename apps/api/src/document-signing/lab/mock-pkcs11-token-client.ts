import { createHash, randomBytes } from 'node:crypto';

import forge from 'node-forge';

import { mapNativePkcs11Failure } from './pkcs11-lab.errors.js';
import type { Pkcs11TokenClient, SimulatedPkcs11Failure } from './pkcs11-token-client.types.js';

type MockKeyObject = { id: Buffer; privateKey: forge.pki.rsa.PrivateKey };
type MockCertificateObject = { id: Buffer; der: Buffer };

/**
 * In-memory PKCS#11 stand-in for failure-matrix tests without SoftHSM (Issue #183).
 * Results from this client are mock evidence only, never SoftHSM/token evidence.
 */
export function createMockPkcs11TokenClient(options: {
  pin: string;
  failures?: SimulatedPkcs11Failure[];
}): Pkcs11TokenClient {
  const keys = new Map<string, MockKeyObject[]>();
  const certificates = new Map<string, MockCertificateObject[]>();
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

  function addObject<T>(store: Map<string, T[]>, label: string, value: T) {
    store.set(label, [...(store.get(label) ?? []), value]);
  }

  function single<T>(
    store: Map<string, T[]>,
    label: string,
    notFound: 'PKCS11_CERT_NOT_FOUND' | 'PKCS11_KEY_NOT_FOUND',
  ): T {
    const matches = store.get(label) ?? [];
    if (matches.length === 0) {
      throw mapNativePkcs11Failure(notFound);
    }
    if (matches.length > 1) {
      throw mapNativePkcs11Failure('PKCS11_OBJECT_AMBIGUOUS');
    }
    return matches[0] as T;
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
    provisionLabCredential(spec) {
      const id = randomBytes(16);
      const keypair = forge.pki.rsa.generateKeyPair(2048);
      addObject(keys, spec.privateKeyLabel, { id, privateKey: keypair.privateKey });
      const cert = forge.pki.createCertificate();
      cert.publicKey = keypair.publicKey;
      cert.serialNumber = `01${randomBytes(8).toString('hex')}`;
      cert.validity.notBefore = new Date(Date.now() - 86_400_000);
      cert.validity.notAfter = new Date(Date.now() + 86_400_000 * 365);
      const attrs = [{ name: 'commonName', value: spec.commonName }];
      cert.setSubject(attrs);
      cert.setIssuer(attrs);
      cert.sign(keypair.privateKey, forge.md.sha256.create());
      addObject(certificates, spec.certificateLabel, {
        id,
        der: Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(), 'binary'),
      });
      return {
        kind: spec.kind,
        privateKeyLabel: spec.privateKeyLabel,
        certificateLabel: spec.certificateLabel,
      };
    },
    storeLabCertificate(input) {
      addObject(certificates, input.certificateLabel, {
        id: Buffer.from(input.objectIdHex, 'hex'),
        der: Buffer.from(input.certificateDer),
      });
    },
    resolveLabCredential(reference) {
      nextFailure('resolve');
      const certificateObject = single(
        certificates,
        reference.certificateLabel,
        'PKCS11_CERT_NOT_FOUND',
      );
      const keyObject = single(keys, reference.privateKeyLabel, 'PKCS11_KEY_NOT_FOUND');
      if (!certificateObject.id.equals(keyObject.id)) {
        throw mapNativePkcs11Failure('PKCS11_CERT_KEY_MISMATCH');
      }
      const cert = forge.pki.certificateFromAsn1(
        forge.asn1.fromDer(certificateObject.der.toString('binary')),
      );
      const certPublicKey = cert.publicKey as forge.pki.rsa.PublicKey;
      if (
        certPublicKey.n.toString(16) !== keyObject.privateKey.n.toString(16) ||
        certPublicKey.e.toString(16) !== keyObject.privateKey.e.toString(16)
      ) {
        throw mapNativePkcs11Failure('PKCS11_CERT_KEY_MISMATCH');
      }
      const certificatePem = forge.pki.certificateToPem(cert);
      const commonName = cert.subject.getField('CN') as { value?: unknown } | null;
      return {
        kind: reference.kind,
        privateKeyLabel: reference.privateKeyLabel,
        certificateLabel: reference.certificateLabel,
        objectIdHex: certificateObject.id.toString('hex'),
        subjectCommonName: typeof commonName?.value === 'string' ? commonName.value : '',
        certificateDer: certificateObject.der,
        certificatePem,
        trustAnchorPem: certificatePem,
        certificateFingerprintSha256: createHash('sha256')
          .update(certificateObject.der)
          .digest('hex'),
        tokenPublicKey: {
          modulusHex: keyObject.privateKey.n.toString(16),
          publicExponentHex: keyObject.privateKey.e.toString(16),
        },
        publicKeyObjectMatched: false,
        certificateObjectOnToken: false,
        privateKeyAttributes: {
          token: false,
          private: false,
          sensitive: false,
          extractable: true,
          local: false,
          alwaysSensitive: false,
          neverExtractable: false,
        },
        privateKeyHandle: keyObject.privateKey,
      };
    },
    signSha256RsaPkcs1(credential, digest: Buffer) {
      nextFailure('sign');
      const md = {
        algorithm: 'sha256',
        digest: () => forge.util.createBuffer(digest.toString('binary')),
      } as forge.md.MessageDigest;
      const signed = (credential.privateKeyHandle as forge.pki.rsa.PrivateKey).sign(md);
      return Buffer.from(signed, 'binary');
    },
    close() {
      keys.clear();
      certificates.clear();
    },
    dispose() {
      keys.clear();
      certificates.clear();
    },
  };
}
