import type { NextConfig } from "next";
import withPWA from "@ducanh2912/next-pwa";
import { execSync } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";

// Generate version.json at build time for version-check polling
function generateVersionFile() {
  let version: string;
  try {
    version = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    version = Date.now().toString();
  }
  const versionData = { version, buildTime: new Date().toISOString() };
  writeFileSync(join(__dirname, "public", "version.json"), JSON.stringify(versionData));
  return version;
}

const buildVersion = generateVersionFile();

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    NEXT_PUBLIC_BUILD_VERSION: buildVersion,
  },
};

export default withPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
})(nextConfig);
