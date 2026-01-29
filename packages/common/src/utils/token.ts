import { sign, verify } from "hono/jwt";
import type { SignatureAlgorithm } from "hono/utils/jwt/jwa";
import type { JWTPayload } from "hono/utils/jwt/types";

export async function generateToken({
  payload,
  algorithm,
  expiresIn,
}: {
  payload: Record<string, unknown>;
  algorithm: SignatureAlgorithm;
  expiresIn: number;
}) {
  const currentTime = Date.now();

  const exp = Math.floor(currentTime / 1000) + expiresIn;

  if (algorithm === "EdDSA") {
    return await sign({ ...payload, exp }, process.env.PRIVATE_JWK!, algorithm);
  }
  return await sign({ ...payload, exp }, process.env.JWT_SECRET!, algorithm);
}

export const verifyToken = async (
  token: string,
  algorithm: SignatureAlgorithm,
) => {
  try {
    let decoded: Record<string, unknown> | null = null;
    if (algorithm === "EdDSA") {
      decoded = (await verify(token, process.env.PUBLIC_JWK!, {
        alg: algorithm,
      })) as Record<string, unknown> & JWTPayload;
    } else {
      decoded = (await verify(token, process.env.JWT_SECRET!, {
        alg: algorithm,
      })) as Record<string, unknown> & JWTPayload;
    }

    return decoded;
  } catch (error) {
    console.error(error);

    return null;
  }
};
