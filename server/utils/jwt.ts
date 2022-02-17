import jwt from "jsonwebtoken";
import config from "config";
import _ from "lodash";
import path from "path";
import fsPromises from "fs/promises";
import crypto from "crypto";

import { UserDocument } from "../db/mongo/models";
import { log } from "../utils";

// extract configuration options
const { accessTokenTtl, refreshTokenTtl, accessTokenFlag, refreshTokenFlag } =
  config.get<{
    accessTokenTtl: string;
    refreshTokenTtl: string;
    accessTokenFlag: string;
    refreshTokenFlag: string;
  }>("jwt");

export async function generateJwtToken(
  user: UserDocument,
  expiresIn: any,
  tokenFlag: string
): Promise<string> {
  const typeToken =
    tokenFlag === accessTokenFlag ? "access token" : "refresh token";

  try {
    const { email, role } = _.pick(user, ["email", "role"]);

    const privateKeyFilePath = path.join(
      __dirname,
      "..",
      "certificate",
      "jwt",
      `rsa_private.${tokenFlag}.pem`
    );
    const privateKey = await fsPromises.readFile(privateKeyFilePath, {
      encoding: "utf8",
    });

    const jwtToken = jwt.sign({ email, role }, privateKey, {
      expiresIn,
      issuer: "localhost",
      audience: "localhost",
      subject: email,
      algorithm: "RS256",
    });

    if (!jwtToken) {
      throw new Error(`Have a problem with ${typeToken}!`);
    }

    return jwtToken;
  } catch (error: any) {
    log.error(`${generateJwtToken.name}:${typeToken}: ${error.message}`);
    return error;
  }
}

export function generateJwtKeys() {
  try {
    [accessTokenFlag, refreshTokenFlag].forEach(async (tokenFlag) => {
      const keyPair = crypto.generateKeyPairSync("rsa", {
        modulusLength: 1024 * 2,
        publicKeyEncoding: {
          type: "pkcs1",
          format: "pem",
        },
        privateKeyEncoding: {
          type: "pkcs1",
          format: "pem",
        },
      });

      const publicKeyFilePath = path.join(
        __dirname,
        "..",
        "certificate",
        "jwt",
        `rsa_public.${tokenFlag}.pem`
      );
      await fsPromises.writeFile(publicKeyFilePath, keyPair.publicKey, {
        encoding: "utf8",
      });

      const privateKeyFilePath = path.join(
        __dirname,
        "..",
        "certificate",
        "jwt",
        `rsa_private.${tokenFlag}.pem`
      );
      await fsPromises.writeFile(privateKeyFilePath, keyPair.privateKey, {
        encoding: "utf8",
      });
    });
  } catch (error: any) {
    log.error(`${generateJwtKeys.name}: ${error.message}`);
  }
}
