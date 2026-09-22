import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  base: { app: "abt-mailer" },
  redact: {
    paths: ["password", "hashedPassword", "*.password", "*.hashedPassword", "authorization", "*.authorization"],
    remove: true,
  },
});
