import express, { Express } from "express";
import http from "http";
import https from "https";
import path from "path";
import favicon from "serve-favicon";
import cors from "cors";
import cookieParser from "cookie-parser";
import expressSession from "express-session";
import connectRedis from "connect-redis";
import compression from "compression";
import ms from "ms";
import responseTime from "response-time";
import config from "config";

import { generateJwtKeys, log } from "./utils";
import { mongoConnect } from "./db/mongo";
import { redisClient } from "./db/redis";
import { admin, home, user } from "./routes";
import extractFromKS from "./certificate/https/generateKeys";

// extract configuration options
const port = config.get<number>("port");
const cookieSecretKey = config.get<string>("cookieSecretKey");
const cookieName = config.get<string>("cookieName");
const { accessTokenTtl, refreshTokenTtl, accessTokenFlag, refreshTokenFlag } =
  config.get<{
    accessTokenTtl: string;
    refreshTokenTtl: string;
    accessTokenFlag: string;
    refreshTokenFlag: string;
  }>("jwt");
const mongo = config.get<{ uri: string; options: object }>("mongo");

export function main(): Express {
  // app
  const app = express();
  const RedisStore = connectRedis(expressSession);

  // app set
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));
  app.set("view cache", true);
  app.set("trust proxy", 1);

  // app middleware
  app.use(cors({ origin: "*" }));
  app.use("/", express.static(path.join(__dirname, "public")));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser(cookieSecretKey));
  app.use(
    expressSession({
      cookie: {
        httpOnly: false,
        secure: false,
        sameSite: true,
        path: "/",
        signed: false,
        encode: decodeURI,
      },
      name: cookieName,
      secret: cookieSecretKey,
      rolling: false,
      resave: false,
      saveUninitialized: false,
      store: new RedisStore({
        client: redisClient,
        disableTouch: true,
        ttl: ms(refreshTokenTtl) / 1000,
      }),
    })
  );

  app.use(favicon(path.join(__dirname, "favicon.ico")));
  app.use(compression());
  app.use(responseTime());

  // http -> https
  app.use(function (req, res, next) {
    if (!req.secure) {
      res.redirect(301, `https://${req.hostname}${req.url}`);
    } else {
      return next();
    }
  });

  // routes
  app.use("/", home);
  app.use("/api/user", user);
  app.use("/api/admin", admin);

  // generate jwt keys - private and public
  generateJwtKeys(accessTokenFlag);
  generateJwtKeys(refreshTokenFlag);

  return app;
}

// http server
const httpServer = http.createServer(main());
httpServer.listen(port);
httpServer.on("listening", () => log.info(`server:listening ${port} 🔓`));
httpServer.on("error", (error: any) =>
  log.error(`server:error: ${error.message}`)
);

const httpsKeys = extractFromKS();
const httpsServer = https.createServer(
  {
    cert: httpsKeys.cert,
    key: httpsKeys.key,
  },
  main()
);
httpsServer.listen(443);
httpsServer.on("listening", () => log.info(`server:listening: 443 🔐`));
httpsServer.on("error", (error: any) =>
  log.error(`server:error: ${error.message}`)
);

// database
mongoConnect(mongo.uri, mongo.options);
