import forge from 'node-forge';

/** Forge RSA private key whose sign() delegates to PKCS#11 (private key never materialized in JS). */
export function createForgePrivateKeyFromPkcs11(
  publicKey: forge.pki.rsa.PublicKey,
  signDigest: (digest: Buffer) => Buffer,
): forge.pki.rsa.PrivateKey {
  const privateKey = forge.pki.setRsaPrivateKey(
    publicKey.n,
    publicKey.e,
    publicKey.n,
    publicKey.e,
    publicKey.e,
    publicKey.e,
    publicKey.e,
    publicKey.e,
  );
  const signingKey = privateKey;
  (
    signingKey as unknown as { sign(md: forge.md.MessageDigest): forge.util.ByteStringBuffer }
  ).sign = (md: forge.md.MessageDigest) => {
    const digest = Buffer.from(md.digest().getBytes(), 'binary');
    const signature = signDigest(digest);
    return signature.toString('latin1') as unknown as forge.util.ByteStringBuffer;
  };
  return signingKey;
}

export function forgePublicKeyFromRsaComponents(
  modulus: Buffer,
  publicExponent: Buffer,
): forge.pki.rsa.PublicKey {
  return forge.pki.setRsaPublicKey(
    new forge.jsbn.BigInteger(modulus.toString('hex'), 16),
    new forge.jsbn.BigInteger(publicExponent.toString('hex'), 16),
  );
}
