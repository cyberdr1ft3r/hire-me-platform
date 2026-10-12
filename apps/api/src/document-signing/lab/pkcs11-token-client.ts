import { createHash, randomBytes } from 'node:crypto';

import forge from 'node-forge';
import graphene from 'graphene-pk11';

import { forgePublicKeyFromRsaComponents } from './forge-pkcs11-private-key.js';
import { signSha256DigestRsaPkcs1 } from './pkcs11-sha256-rsa-sign.js';
import { mapNativePkcs11Failure } from './pkcs11-lab.errors.js';
import { resolvePkcs11ModulePathForLab } from './pkcs11-module-path.js';
import type {
  LabCredentialKind,
  LabTokenCredentialReference,
  LabTokenResolvedCredential,
  Pkcs11TokenClient,
} from './pkcs11-token-client.types.js';

type GrapheneModule = InstanceType<typeof graphene.Module>;
type GrapheneSession = ReturnType<graphene.Slot['open']>;
type GrapheneSessionObject = ReturnType<GrapheneSession['create']>;

const REQUIRED_MECHANISMS = ['RSA_PKCS', 'SHA256_RSA_PKCS'] as const;

export type Pkcs11TokenClientOptions = {
  modulePath?: string;
  tokenLabel: string;
};

export function createPkcs11TokenClient(options: Pkcs11TokenClientOptions): Pkcs11TokenClient {
  const modulePath = options.modulePath ?? resolvePkcs11ModulePathForLab();
  if (!modulePath) {
    throw mapNativePkcs11Failure('PKCS11_MODULE_UNAVAILABLE');
  }

  let mod: GrapheneModule;
  try {
    mod = graphene.Module.load(modulePath, options.tokenLabel);
    mod.initialize();
  } catch {
    throw mapNativePkcs11Failure('PKCS11_MODULE_LOAD_FAILED');
  }

  const resolvedSlot = findSlotByTokenLabel(mod, options.tokenLabel);
  if (!resolvedSlot) {
    finalizeQuietly(mod);
    throw mapNativePkcs11Failure('PKCS11_SLOT_NOT_FOUND');
  }
  const tokenSlot = resolvedSlot;
  if (!slotSupportsMechanisms(tokenSlot)) {
    finalizeQuietly(mod);
    throw mapNativePkcs11Failure('PKCS11_SIGN_MECHANISM_UNSUPPORTED');
  }

  let session: GrapheneSession | null = null;

  function openSession(): GrapheneSession {
    if (!session) {
      try {
        session = tokenSlot.open(
          graphene.SessionFlag.RW_SESSION | graphene.SessionFlag.SERIAL_SESSION,
        );
      } catch {
        throw mapNativePkcs11Failure('PKCS11_SESSION_FAILED');
      }
    }
    return session;
  }

  function storeCertificateObject(input: {
    certificateDer: Buffer;
    certificateLabel: string;
    objectId: Buffer;
  }): void {
    const certificate = parseCertificateDer(input.certificateDer);
    if (!certificate) {
      throw mapNativePkcs11Failure('PKCS11_PROVISIONING_FAILED');
    }
    try {
      openSession().create({
        class: graphene.ObjectClass.CERTIFICATE,
        certType: graphene.CertificateType.X_509,
        token: true,
        private: false,
        modifiable: false,
        label: input.certificateLabel,
        id: input.objectId,
        subject: nameDer(certificate.subject),
        issuer: nameDer(certificate.issuer),
        serial: serialNumberDer(certificate),
        value: input.certificateDer,
      });
    } catch {
      throw mapNativePkcs11Failure('PKCS11_PROVISIONING_FAILED');
    }
  }

  const client: Pkcs11TokenClient = {
    login(pin: string) {
      try {
        openSession().login(pin);
      } catch {
        throw mapNativePkcs11Failure('PKCS11_LOGIN_FAILED');
      }
    },
    logout() {
      if (session) {
        try {
          session.logout();
        } catch {
          // ignore logout failures during lab teardown
        }
      }
    },
    provisionLabCredential(spec) {
      const active = openSession();
      const objectId = randomBytes(16);
      let keyPair: graphene.IKeyPair;
      try {
        keyPair = active.generateKeyPair(
          graphene.KeyGenMechanism.RSA,
          {
            keyType: graphene.KeyType.RSA,
            modulusBits: 2048,
            publicExponent: Buffer.from([1, 0, 1]),
            label: spec.privateKeyLabel,
            id: objectId,
            token: true,
            verify: true,
            encrypt: false,
            wrap: false,
          },
          {
            keyType: graphene.KeyType.RSA,
            label: spec.privateKeyLabel,
            id: objectId,
            token: true,
            private: true,
            sensitive: true,
            extractable: false,
            sign: true,
            decrypt: false,
            unwrap: false,
          },
        );
      } catch {
        throw mapNativePkcs11Failure('PKCS11_PROVISIONING_FAILED');
      }

      const certificate = buildTokenSignedCertificate({
        kind: spec.kind,
        commonName: spec.commonName,
        publicKeyObject: keyPair.publicKey,
        privateKeyObject: keyPair.privateKey,
        session: active,
      });
      storeCertificateObject({
        certificateDer: certificateToDer(certificate),
        certificateLabel: spec.certificateLabel,
        objectId,
      });

      return {
        kind: spec.kind,
        privateKeyLabel: spec.privateKeyLabel,
        certificateLabel: spec.certificateLabel,
      };
    },
    storeLabCertificate(input) {
      storeCertificateObject({
        certificateDer: input.certificateDer,
        certificateLabel: input.certificateLabel,
        objectId: Buffer.from(input.objectIdHex, 'hex'),
      });
    },
    resolveLabCredential(reference) {
      return resolveCredentialFromToken(openSession(), reference);
    },
    signSha256RsaPkcs1(credential, digest: Buffer) {
      try {
        return signSha256DigestRsaPkcs1(openSession(), credential.privateKeyHandle, digest);
      } catch {
        throw mapNativePkcs11Failure('PKCS11_SIGN_FAILED');
      }
    },
    close() {
      client.logout();
      if (session) {
        try {
          session.close();
        } catch {
          // ignore
        }
        session = null;
      }
    },
    dispose() {
      client.close();
      finalizeQuietly(mod);
    },
  };

  return client;
}

function resolveCredentialFromToken(
  session: GrapheneSession,
  reference: LabTokenCredentialReference,
): LabTokenResolvedCredential {
  const certificateObject = findSingleObject(
    session,
    {
      class: graphene.ObjectClass.CERTIFICATE,
      certType: graphene.CertificateType.X_509,
      label: reference.certificateLabel,
    },
    'PKCS11_CERT_NOT_FOUND',
  );
  const certificateAttrs = readAttributes(certificateObject, { id: null, value: null }) as {
    id: Buffer;
    value: Buffer;
  };
  const certificateDer = Buffer.from(certificateAttrs.value);
  const certificate = parseCertificateDer(certificateDer);
  if (!certificate) {
    throw mapNativePkcs11Failure('PKCS11_CERT_NOT_FOUND');
  }

  const privateKeyObject = findSingleObject(
    session,
    { class: graphene.ObjectClass.PRIVATE_KEY, label: reference.privateKeyLabel },
    'PKCS11_KEY_NOT_FOUND',
  );
  const keyAttrs = readAttributes(privateKeyObject, {
    id: null,
    modulus: null,
    publicExponent: null,
    sensitive: null,
    extractable: null,
  }) as {
    id: Buffer;
    modulus: Buffer;
    publicExponent: Buffer;
    sensitive: boolean;
    extractable: boolean;
  };

  const objectId = Buffer.from(certificateAttrs.id);
  if (objectId.length === 0 || !objectId.equals(Buffer.from(keyAttrs.id))) {
    throw mapNativePkcs11Failure('PKCS11_CERT_KEY_MISMATCH');
  }

  const tokenPublicKey = {
    modulusHex: unsignedHex(keyAttrs.modulus),
    publicExponentHex: unsignedHex(keyAttrs.publicExponent),
  };
  const certificatePublicKey = certificate.publicKey as forge.pki.rsa.PublicKey;
  if (
    !certificatePublicKey.n ||
    certificatePublicKey.n.toString(16) !== tokenPublicKey.modulusHex ||
    certificatePublicKey.e.toString(16) !== tokenPublicKey.publicExponentHex
  ) {
    throw mapNativePkcs11Failure('PKCS11_CERT_KEY_MISMATCH');
  }

  const publicKeyObjectMatched = publicKeyObjectMatches(session, objectId, tokenPublicKey);

  const certificatePem = forge.pki.certificateToPem(certificate);
  const commonName = certificate.subject.getField('CN') as { value?: unknown } | null;
  return {
    kind: reference.kind,
    privateKeyLabel: reference.privateKeyLabel,
    certificateLabel: reference.certificateLabel,
    objectIdHex: objectId.toString('hex'),
    subjectCommonName: typeof commonName?.value === 'string' ? commonName.value : '',
    certificateDer,
    certificatePem,
    trustAnchorPem: certificatePem,
    certificateFingerprintSha256: createHash('sha256').update(certificateDer).digest('hex'),
    tokenPublicKey,
    publicKeyObjectMatched,
    privateKeyProtection: {
      sensitive: keyAttrs.sensitive,
      extractable: keyAttrs.extractable,
    },
    privateKeyHandle: privateKeyObject.toType<graphene.PrivateKey>(),
  };
}

/** A public key object sharing the CKA_ID is optional, but if present it must match. */
function publicKeyObjectMatches(
  session: GrapheneSession,
  objectId: Buffer,
  expected: { modulusHex: string; publicExponentHex: string },
): boolean {
  let matches: graphene.SessionObjectCollection;
  try {
    matches = session.find({ class: graphene.ObjectClass.PUBLIC_KEY, id: objectId });
  } catch {
    throw mapNativePkcs11Failure('PKCS11_SESSION_FAILED');
  }
  if (matches.length === 0) {
    return false;
  }
  if (matches.length > 1) {
    throw mapNativePkcs11Failure('PKCS11_OBJECT_AMBIGUOUS');
  }
  const attrs = readAttributes(matches.items(0), { modulus: null, publicExponent: null }) as {
    modulus: Buffer;
    publicExponent: Buffer;
  };
  if (
    unsignedHex(attrs.modulus) !== expected.modulusHex ||
    unsignedHex(attrs.publicExponent) !== expected.publicExponentHex
  ) {
    throw mapNativePkcs11Failure('PKCS11_CERT_KEY_MISMATCH');
  }
  return true;
}

function findSingleObject(
  session: GrapheneSession,
  template: graphene.ITemplate,
  notFoundCode: 'PKCS11_CERT_NOT_FOUND' | 'PKCS11_KEY_NOT_FOUND',
): GrapheneSessionObject {
  let matches: graphene.SessionObjectCollection;
  try {
    matches = session.find(template);
  } catch {
    throw mapNativePkcs11Failure('PKCS11_SESSION_FAILED');
  }
  if (matches.length === 0) {
    throw mapNativePkcs11Failure(notFoundCode);
  }
  if (matches.length > 1) {
    throw mapNativePkcs11Failure('PKCS11_OBJECT_AMBIGUOUS');
  }
  return matches.items(0);
}

function readAttributes(object: GrapheneSessionObject, template: graphene.ITemplate): unknown {
  try {
    return object.getAttribute(template);
  } catch {
    throw mapNativePkcs11Failure('PKCS11_SESSION_FAILED');
  }
}

function unsignedHex(bytes: Buffer): string {
  return new forge.jsbn.BigInteger(Buffer.from(bytes).toString('hex'), 16).toString(16);
}

function parseCertificateDer(der: Buffer): forge.pki.Certificate | null {
  try {
    return forge.pki.certificateFromAsn1(forge.asn1.fromDer(der.toString('binary')));
  } catch {
    return null;
  }
}

function certificateToDer(certificate: forge.pki.Certificate): Buffer {
  return Buffer.from(
    forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes(),
    'binary',
  );
}

function nameDer(name: forge.pki.Certificate['subject']): Buffer {
  const asn1 = (
    forge.pki as unknown as { distinguishedNameToAsn1(n: typeof name): forge.asn1.Asn1 }
  ).distinguishedNameToAsn1(name);
  return Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary');
}

function serialNumberDer(certificate: forge.pki.Certificate): Buffer {
  const asn1 = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.INTEGER,
    false,
    forge.util.hexToBytes(certificate.serialNumber),
  );
  return Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary');
}

function slotSupportsMechanisms(slot: graphene.Slot): boolean {
  try {
    const mechanisms = slot.getMechanisms();
    const names = new Set<string>();
    for (let index = 0; index < mechanisms.length; index += 1) {
      names.add(mechanisms.items(index).name);
    }
    return REQUIRED_MECHANISMS.every((name) => names.has(name));
  } catch {
    return false;
  }
}

function finalizeQuietly(mod: GrapheneModule): void {
  try {
    mod.finalize();
  } catch {
    // ignore
  }
}

function findSlotByTokenLabel(mod: GrapheneModule, label: string): graphene.Slot | null {
  const slots = mod.getSlots(true);
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots.items(index);
    try {
      const token = slot.getToken();
      if (token.label.trim() === label.trim()) {
        return slot;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function buildTokenSignedCertificate(input: {
  kind: LabCredentialKind;
  commonName: string;
  publicKeyObject: graphene.PublicKey;
  privateKeyObject: graphene.PrivateKey;
  session: GrapheneSession;
}): forge.pki.Certificate {
  const pubAttrs = input.publicKeyObject.getAttribute({ modulus: null, publicExponent: null }) as {
    modulus: Buffer;
    publicExponent: Buffer;
  };
  const cert = forge.pki.createCertificate();
  cert.publicKey = forgePublicKeyFromRsaComponents(pubAttrs.modulus, pubAttrs.publicExponent);
  cert.serialNumber = `01${randomBytes(8).toString('hex')}`;
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 86_400_000 * 365);
  const attrs = [
    { name: 'commonName', value: input.commonName },
    { name: 'organizationName', value: 'Hire-Me PKCS#11 Lab' },
    { name: 'countryName', value: 'MA' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    {
      name: 'basicConstraints',
      cA: false,
      critical: true,
    },
    {
      name: 'keyUsage',
      digitalSignature: true,
      nonRepudiation: input.kind === 'PERSON_SIGNATURE',
      critical: true,
    },
  ]);

  cert.md = forge.md.sha256.create();
  cert.signatureOid = cert.siginfo.algorithmOid = forge.pki.oids.sha256WithRSAEncryption ?? '';
  cert.tbsCertificate = (
    forge.pki as unknown as { getTBSCertificate(c: forge.pki.Certificate): forge.asn1.Asn1 }
  ).getTBSCertificate(cert);
  const tbsDer = forge.asn1.toDer(cert.tbsCertificate);
  try {
    const sign = input.session.createSign('SHA256_RSA_PKCS', input.privateKeyObject);
    sign.update(Buffer.from(tbsDer.getBytes(), 'binary'));
    cert.signature = Buffer.from(sign.final()).toString('binary');
  } catch {
    throw mapNativePkcs11Failure('PKCS11_PROVISIONING_FAILED');
  }
  return cert;
}
