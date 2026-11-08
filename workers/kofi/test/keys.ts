export interface TestKeys {
  privateKeyPem: string;
  publicKey: CryptoKey;
}

const toPem = (der: ArrayBuffer): string => {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(der)));
  const lines = base64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----\n`;
};

export const generateTestKeys = async (): Promise<TestKeys> => {
  const pair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const der = (await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer;
  return { privateKeyPem: toPem(der), publicKey: pair.publicKey };
};

export const serviceAccountJson = (privateKeyPem: string): string =>
  JSON.stringify({
    type: "service_account",
    project_id: "demo-project",
    private_key_id: "key-1",
    private_key: privateKeyPem,
    client_email: "kofi-receiver@demo-project.iam.gserviceaccount.com",
    token_uri: "https://oauth2.googleapis.com/token",
  });
