#!/usr/bin/env bun
/**
 * Iris Deployment Script
 *
 * Deploys Iris to an exe.dev server with a single idempotent command.
 * See: docs/deployment.md
 *
 * Usage: bun scripts/deploy.ts <hostname>
 * Example: bun scripts/deploy.ts iris-vicenti.exe.xyz
 */

import { spawn, type SpawnOptions } from "bun";
import { resolve, dirname } from "path";

const REPO_URL = "git@github.com:ericvicenti/iris.git";
const SERVICE_NAME = "iris";

/**
 * Run a command locally and return the result
 */
async function runLocal(
  cmd: string[],
  options: SpawnOptions.OptionsObject = {}
): Promise<{ success: boolean; output: string }> {
  const proc = spawn(cmd, {
    ...options,
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return {
    success: exitCode === 0,
    output: stdout + stderr,
  };
}

/**
 * Run a command on the remote host via SSH
 */
async function runRemote(
  host: string,
  command: string,
  options: { stream?: boolean } = {}
): Promise<{ success: boolean; output: string }> {
  const sshCmd = ["ssh", "-o", "StrictHostKeyChecking=accept-new", host, command];

  if (options.stream) {
    // Stream output directly to console
    const proc = spawn(sshCmd, {
      stdout: "inherit",
      stderr: "inherit",
    });
    const exitCode = await proc.exited;
    return { success: exitCode === 0, output: "" };
  }

  return runLocal(sshCmd);
}

/**
 * Copy a file to the remote host via SCP
 */
async function copyToRemote(
  host: string,
  localPath: string,
  remotePath: string
): Promise<boolean> {
  const result = await runLocal([
    "scp",
    "-o",
    "StrictHostKeyChecking=accept-new",
    localPath,
    `${host}:${remotePath}`,
  ]);
  return result.success;
}

/**
 * Generate systemd service file content with correct paths
 */
function generateServiceFile(homeDir: string, user: string): string {
  const irisDir = `${homeDir}/iris`;
  const bunPath = `${homeDir}/.bun/bin/bun`;
  const dataDir = `${homeDir}/.iris`;

  return `[Unit]
Description=Iris AI Agent Workspace
After=network.target

[Service]
Type=simple
User=${user}
WorkingDirectory=${irisDir}
ExecStart=${bunPath} run src/index.ts
Restart=always
RestartSec=5

# Production environment
Environment=NODE_ENV=production
Environment=IRIS_PORT=8000
Environment=IRIS_HOST=0.0.0.0
Environment=IRIS_STATIC_DIR=${irisDir}/webui/dist
Environment=IRIS_DATA_DIR=${dataDir}

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=iris

[Install]
WantedBy=multi-user.target
`;
}

/**
 * Main deployment function
 */
async function deploy(host: string): Promise<void> {
  console.log(`\n🚀 Deploying Iris to ${host}\n`);

  // Step 1: Check SSH connectivity and get user info
  console.log("📡 Checking SSH connectivity...");
  const sshCheck = await runRemote(host, "echo $HOME && whoami");
  if (!sshCheck.success) {
    throw new Error(`Cannot connect to ${host}. Ensure SSH access is configured.`);
  }
  const [homeDir, user] = sshCheck.output.trim().split("\n");
  console.log(`   Connected as ${user} (home: ${homeDir})\n`);

  const remoteDir = `${homeDir}/iris`;

  // Step 2: Install Bun if not present
  console.log("📦 Checking Bun installation...");
  const bunCheck = await runRemote(host, "which bun || echo 'not found'");
  if (bunCheck.output.includes("not found")) {
    console.log("   Installing Bun...");
    const bunInstall = await runRemote(
      host,
      "curl -fsSL https://bun.sh/install | bash",
      { stream: true }
    );
    if (!bunInstall.success) {
      throw new Error("Failed to install Bun");
    }
  } else {
    console.log("   Bun already installed\n");
  }

  const bunPath = `${homeDir}/.bun/bin/bun`;

  // Step 3: Setup SSH for GitHub
  console.log("🔑 Setting up SSH for GitHub...");

  // Add GitHub to known hosts
  await runRemote(
    host,
    `mkdir -p ~/.ssh && chmod 700 ~/.ssh && ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts 2>/dev/null`
  );

  // Check if deploy key exists, generate if not
  const keyCheck = await runRemote(host, `test -f ~/.ssh/id_ed25519 && echo 'exists'`);
  if (!keyCheck.output.includes("exists")) {
    console.log("   Generating deploy key...");
    await runRemote(
      host,
      `ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N "" -C "iris-deploy@${host}"`
    );
  }

  // Test GitHub access
  const githubTest = await runRemote(host, `ssh -T git@github.com 2>&1 || true`);
  if (!githubTest.output.includes("successfully authenticated")) {
    // Show the public key and ask user to add it
    const pubKey = await runRemote(host, `cat ~/.ssh/id_ed25519.pub`);
    console.log("\n" + "=".repeat(70));
    console.log("⚠️  Deploy key not authorized for GitHub repository");
    console.log("=".repeat(70));
    console.log("\nAdd this deploy key to your GitHub repository:");
    console.log("  1. Go to: https://github.com/ericvicenti/iris/settings/keys");
    console.log("  2. Click 'Add deploy key'");
    console.log("  3. Title: iris-deploy@" + host);
    console.log("  4. Paste this key:\n");
    console.log(pubKey.output.trim());
    console.log("\n" + "=".repeat(70));
    console.log("\nAfter adding the key, run this deploy script again.");
    console.log("");
    process.exit(1);
  }
  console.log("   GitHub access confirmed\n");

  // Step 4: Clone or update repository
  console.log("📥 Updating repository...");
  const repoCheck = await runRemote(host, `test -d ${remoteDir}/.git && echo 'exists'`);
  if (repoCheck.output.includes("exists")) {
    // Pull latest changes
    console.log("   Pulling latest changes...");
    const pullResult = await runRemote(
      host,
      `cd ${remoteDir} && git fetch origin && git reset --hard origin/main`,
      { stream: true }
    );
    if (!pullResult.success) {
      throw new Error("Failed to pull latest changes");
    }
  } else {
    // Clone repository
    console.log("   Cloning repository...");
    const cloneResult = await runRemote(
      host,
      `rm -rf ${remoteDir} && git clone ${REPO_URL} ${remoteDir}`,
      { stream: true }
    );
    if (!cloneResult.success) {
      throw new Error("Failed to clone repository");
    }
  }
  console.log("");

  // Step 4: Install dependencies
  console.log("📦 Installing dependencies...");
  const installResult = await runRemote(
    host,
    `cd ${remoteDir} && ${bunPath} install`,
    { stream: true }
  );
  if (!installResult.success) {
    throw new Error("Failed to install root dependencies");
  }

  const webuiInstallResult = await runRemote(
    host,
    `cd ${remoteDir}/webui && ${bunPath} install`,
    { stream: true }
  );
  if (!webuiInstallResult.success) {
    throw new Error("Failed to install webui dependencies");
  }
  console.log("");

  // Step 5: Build frontend
  console.log("🔨 Building frontend...");
  const buildResult = await runRemote(
    host,
    `cd ${remoteDir}/webui && ${bunPath} run build`,
    { stream: true }
  );
  if (!buildResult.success) {
    throw new Error("Failed to build frontend");
  }
  console.log("");

  // Step 6: Install systemd service
  console.log("⚙️  Installing systemd service...");

  // Generate service file with correct paths
  const serviceContent = generateServiceFile(homeDir, user);

  // Write service file to remote via stdin
  const writeServiceResult = await runRemote(
    host,
    `sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null << 'SERVICEEOF'
${serviceContent}
SERVICEEOF`
  );
  if (!writeServiceResult.success) {
    throw new Error("Failed to write systemd service file");
  }

  // Reload systemd and enable service
  const systemdResult = await runRemote(
    host,
    `sudo systemctl daemon-reload && sudo systemctl enable ${SERVICE_NAME}`,
    { stream: true }
  );
  if (!systemdResult.success) {
    throw new Error("Failed to configure systemd service");
  }
  console.log("");

  // Step 7: Restart service
  console.log("🔄 Restarting service...");
  const restartResult = await runRemote(
    host,
    `sudo systemctl restart ${SERVICE_NAME}`,
    { stream: true }
  );
  if (!restartResult.success) {
    throw new Error("Failed to restart service");
  }

  // Wait a moment for service to start
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Check service status
  const statusResult = await runRemote(
    host,
    `sudo systemctl is-active ${SERVICE_NAME}`
  );
  if (!statusResult.output.includes("active")) {
    console.log("\n⚠️  Service may not have started correctly. Checking logs...\n");
    await runRemote(host, `sudo journalctl -u ${SERVICE_NAME} -n 20 --no-pager`, {
      stream: true,
    });
    throw new Error("Service failed to start");
  }

  // Step 8: Configure exe.dev proxy (make public, set port)
  // Extract VM name from hostname (e.g., "iris-vicenti" from "iris-vicenti.exe.xyz")
  const vmName = host.replace(/\.exe\.xyz$/, "");
  if (host.endsWith(".exe.xyz")) {
    console.log("🌐 Configuring exe.dev proxy...");

    // Set the proxy port to 8000
    const portResult = await runLocal(["ssh", "exe.dev", "share", "port", vmName, "8000"]);
    if (!portResult.success) {
      console.log("   Warning: Could not set proxy port (may already be configured)");
    }

    // Make public
    const publicResult = await runLocal(["ssh", "exe.dev", "share", "set-public", vmName]);
    if (!publicResult.success) {
      console.log("   Warning: Could not set public access (may already be configured)");
    } else {
      console.log("   Proxy configured: public on port 8000\n");
    }
  }

  console.log(`\n✅ Deployment complete!`);
  console.log(`\n   Server: https://${host}`);
  console.log(`   Health: https://${host}/health`);
  console.log(`\n   View logs: ssh ${host} sudo journalctl -u ${SERVICE_NAME} -f`);
  console.log(`   Restart:   ssh ${host} sudo systemctl restart ${SERVICE_NAME}`);
  console.log("");
}

// Main
const host = process.argv[2];

if (!host) {
  console.error("Usage: bun scripts/deploy.ts <hostname>");
  console.error("Example: bun scripts/deploy.ts iris-vicenti.exe.xyz");
  process.exit(1);
}

deploy(host).catch((error) => {
  console.error(`\n❌ Deployment failed: ${error.message}\n`);
  process.exit(1);
});
