import path from "node:path";
import type { PrismaConfig } from "prisma";

export default {
  earlyAccess: true,
  schema: path.join(__dirname, "schema.prisma"),

  migrate: {
    async development() {
      return {
        url: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL!,
        shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
      };
    },
    async production() {
      return {
        url: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL!,
      };
    },
  },
} satisfies PrismaConfig;
