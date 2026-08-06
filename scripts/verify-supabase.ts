import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

function loadEnvFile(fileName: string) {
  const fullPath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(fullPath)) {
    return;
  }

  const contents = fs.readFileSync(fullPath, "utf8");

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (!key || process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = value.replace(/^['"]|['"]$/g, "");
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

async function main() {
  const prisma = new PrismaClient();

  try {
    await prisma.$connect();
    const result = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      "SELECT COUNT(*)::bigint as count FROM branch"
    );

    console.log(`Connection OK. branch row count: ${result[0]?.count ?? 0}`);
  } catch (error) {
    console.error("Supabase connection test failed.");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
