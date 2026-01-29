import { generateKeyPair } from "node:crypto";

generateKeyPair(
  "ed25519",
  {
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  },
  (err, pub, priv) => {
    console.log(priv);
    console.log(pub);
  },
);
