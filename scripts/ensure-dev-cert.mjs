import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const rootDirectory = process.cwd();
const certDirectory = path.join(rootDirectory, ".dev", "certs");
const keyPath = path.join(certDirectory, "localhost-key.pem");
const certPath = path.join(certDirectory, "localhost-cert.pem");

if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  console.log(`Using existing local HTTPS certificate at ${certDirectory}`);
  process.exit(0);
}

fs.mkdirSync(certDirectory, { recursive: true });

const opensslConfigPath = path.join(os.tmpdir(), `cruush-local-openssl-${process.pid}.cnf`);

const opensslConfig = `
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = req_distinguished_name
x509_extensions = v3_req

[req_distinguished_name]
CN = localhost

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
IP.1 = 127.0.0.1
`;

try {
  fs.writeFileSync(opensslConfigPath, opensslConfig);

  execFileSync("openssl", [
    "req",
    "-x509",
    "-nodes",
    "-days",
    "3650",
    "-newkey",
    "rsa:2048",
    "-keyout",
    keyPath,
    "-out",
    certPath,
    "-config",
    opensslConfigPath,
  ], { stdio: "ignore" });

  console.log(`Generated local HTTPS certificate at ${certDirectory}`);
} catch (error) {
  console.error("Failed to generate a local HTTPS certificate with openssl.");
  throw error;
} finally {
  if (fs.existsSync(opensslConfigPath)) {
    fs.rmSync(opensslConfigPath);
  }
}
