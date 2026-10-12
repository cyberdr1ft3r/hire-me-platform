import { createHash, randomBytes } from 'node:crypto';

import forge from 'node-forge';
import graphene from 'graphene-pk11';

import { forgePublicKeyFromRsaComponents } from './forge-pkcs11-private-key.js';
import { signSha256DigestRsaPkcs1 } from './pkcs11-sha256-rsa-sign.js';
import { mapNativePkcs11Failure } from './pkcs11-lab.errors.js';
import { resolvePkcs11ModulePathForLab } from './pkcs11-module-path.js';
import type { LabCredentialKind, Pkcs11TokenClient } from './pkcs11-token-client.types.js';

type GrapheneModule = InstanceType<typeof graphene.Module>;
type GrapheneSession = ReturnType<graphene.Slot['open']>;
type GraphenePrivateKey = { handle: unknown };

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
    mod.finalize();
    throw mapNativePkcs11Failure('PKCS11_SLOT_NOT_FOUND');
  }
  const tokenSlot = resolvedSlot;

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
    provisionLabCredential(material) {
      const active = openSession();
      const objectId = randomBytes(8);
      let keyPair: graphene.IKeyPair;
      try {
        keyPair = active.generateKeyPair(
          graphene.KeyGenMechanism.RSA,
          {
            keyType: graphene.KeyType.RSA,
            modulusBits: 2048,
            publicExponent: Buffer.from([1, 0, 1]),
            label: material.privateKeyLabel,
            id: objectId,
            token: true,
            verify: true,
            encrypt: false,
            wrap: false,
          },
          {
            keyType: graphene.KeyType.RSA,
            label: material.privateKeyLabel,
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
        throw mapNativePkcs11Failure('PKCS11_KEY_NOT_FOUND');
      }

      const pubAttrs = keyPair.publicKey.getAttribute({ modulus: null, publicExponent: null }) as {
        modulus: Buffer;
        publicExponent: Buffer;
      };
      const publicKey = forgePublicKeyFromRsaComponents(pubAttrs.modulus, pubAttrs.publicExponent);
      const certificate = buildSelfSignedCertificate({
        kind: material.kind,
        commonName: material.commonName,
        publicKey,
        privateKeyHandle: keyPair.privateKey,
        session: active,
      });

      const certificateDer = Buffer.from(
        forge.asn1.toDer(forge.pki.certificateToAsn1(certificate)).getBytes(),
        'binary',
      );
      const certificatePem = forge.pki.certificateToPem(certificate);
      const trustAnchorPem = certificatePem;
      const certificateFingerprintSha256 = createHash('sha256')
        .update(certificateDer)
        .digest('hex');

      return {
        kind: material.kind,
        subjectCommonName: material.commonName,
        certificateDer,
        certificatePem,
        trustAnchorPem,
        certificateFingerprintSha256,
        privateKeyLabel: material.privateKeyLabel,
      };
    },
    findPrivateKeyByLabel(label: string) {
      const matches = openSession().find({ class: graphene.ObjectClass.PRIVATE_KEY, label });
      if (!matches.length) {
        throw mapNativePkcs11Failure('PKCS11_KEY_NOT_FOUND');
      }
      return matches.items(0);
    },
    signSha256RsaPkcs1(privateKey: unknown, digest: Buffer) {
      try {
        return signSha256DigestRsaPkcs1(openSession(), privateKey, digest);
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
      try {
        mod.finalize();
      } catch {
        // ignore
      }
    },
  };

  return client;
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

function buildSelfSignedCertificate(input: {
  kind: LabCredentialKind;
  commonName: string;
  publicKey: forge.pki.rsa.PublicKey;
  privateKeyHandle: GraphenePrivateKey;
  session: GrapheneSession;
}): forge.pki.Certificate {
  const cert = forge.pki.createCertificate();
  cert.publicKey = input.publicKey;
  cert.serialNumber = randomBytes(8).toString('hex');
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
  const algorithmOid = forge.pki.oids[`${cert.md.algorithm}WithRSAEncryption`];
  if (!algorithmOid) {
    throw mapNativePkcs11Failure('PKCS11_SIGN_MECHANISM_UNSUPPORTED');
  }
  cert.signatureOid = cert.siginfo.algorithmOid = algorithmOid;
  cert.tbsCertificate = (
    forge.pki as unknown as { getTBSCertificate(c: forge.pki.Certificate): forge.asn1.Asn1 }
  ).getTBSCertificate(cert);
  const tbsDer = forge.asn1.toDer(cert.tbsCertificate);
  try {
    const sign = input.session.createSign('SHA256_RSA_PKCS', input.privateKeyHandle as never);
    sign.update(Buffer.from(tbsDer.getBytes(), 'binary'));
    const signatureBytes = sign.final();
    cert.signature = Buffer.from(signatureBytes).toString('binary');
  } catch {
    throw mapNativePkcs11Failure('PKCS11_SIGN_FAILED');
  }
  return cert;
}
