import forge from 'node-forge';
import type graphene from 'graphene-pk11';

/** Sign a raw SHA-256 digest (32 bytes) the way forge RSA PKCS#1 v1.5 expects, via PKCS#11 CKM_RSA_PKCS. */
export function signSha256DigestRsaPkcs1(
  session: ReturnType<graphene.Slot['open']>,
  privateKey: unknown,
  digest: Buffer,
): Buffer {
  if (digest.length !== 32) {
    throw new Error('Expected SHA-256 digest length 32.');
  }
  const digestInfo = forge.asn1.toDer(
    forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
        forge.asn1.create(
          forge.asn1.Class.UNIVERSAL,
          forge.asn1.Type.OID,
          false,
          forge.asn1.oidToDer(forge.pki.oids.sha256 ?? '2.16.840.1.101.3.4.2.1').getBytes(),
        ),
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, ''),
      ]),
      forge.asn1.create(
        forge.asn1.Class.UNIVERSAL,
        forge.asn1.Type.OCTETSTRING,
        false,
        digest.toString('binary'),
      ),
    ]),
  );
  const sign = session.createSign('RSA_PKCS', privateKey as never);
  return sign.once(Buffer.from(digestInfo.getBytes(), 'binary'));
}
