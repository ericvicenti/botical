#!/usr/bin/env bun
/**
 * GitHub Actions Runner Setup Script
 *
 * Sets up a self-hosted GitHub Actions runner on an exe.dev server.
 * Run once after initial deployment.
 *
 * Usage: bun scripts/setup-runner.ts <hostname> <github-token>
 *
 * Get the token from:
 * https://github.com/ericvicenti/iris/settings/actions/runners/new?arch=x64&os=linux
 */

import { spawn } from "bun";

const RUNNER_VERSION = "2.321.0";
const RUNNER_URL = `https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz`;
const REPO_URL = "https://github.com/ericvicenti/iris";

async function runLocal(
  cmd: string[]
): Promise<{ success: boolean; output: string }> {
  const proc = spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { success: exitCode === 0, output: stdout + stderr };
}

async function runRemote(
  host: string,
  command: string,
  options: { stream?: boolean } = {}
): Promise<{ success: boolean; output: string }> {
  const sshCmd = ["ssh", "-o", "StrictHostKeyChecking=accept-new", host, command];

  if (options.stream) {
    const proc = spawn(sshCmd, { stdout: "inherit", stderr: "inherit" });
    const exitCode = await proc.exited;
    return { success: exitCode === 0, output: "" };
  }

  return runLocal(sshCmd);
}

async function setupRunner(host: string, token: string): Promise<void> {
  console.log(`\n🏃 Setting up GitHub Actions runner on ${host}\n`);

  // Check connectivity
  console.log("📡 Checking SSH connectivity...");
  const sshCheck = await runRemote(host, "echo $HOME && whoami");
  if (!sshCheck.success) {
    throw new Error(`Cannot connect to ${host}`);
  }
  const [homeDir, user] = sshCheck.output.trim().split("\n");
  console.log(`   Connected as ${user}\n`);

  const runnerDir = `${homeDir}/actions-runner`;

  // Check if runner already exists
  const existsCheck = await runRemote(host, `test -d ${runnerDir} && echo 'exists'`);
  if (existsCheck.output.includes("exists")) {
    console.log("⚠️  Runner directory already exists.");
    console.log("   To reconfigure, first remove it: ssh " + host + " rm -rf ~/actions-runner");
    console.log("   Then run this script again.\n");
    return;
  }

  // Download and extract runner
  console.log("📥 Downloading GitHub Actions runner...");
  const downloadResult = await runRemote(
    host,
    `mkdir -p ${runnerDir} && cd ${runnerDir} && curl -sL ${RUNNER_URL} | tar xz`,
    { stream: true }
  );
  if (!downloadResult.success) {
    throw new Error("Failed to download runner");
  }

  // Configure runner
  console.log("\n⚙️  Configuring runner...");
  const configResult = await runRemote(
    host,
    `cd ${runnerDir} && ./config.sh --url ${REPO_URL} --token ${token} --name ${host} --labels self-hosted,linux,x64 --unattended`,
    { stream: true }
  );
  if (!configResult.success) {
    throw new Error("Failed to configure runner");
  }

  // Create systemd service
  console.log("\n📋 Creating systemd service...");
  const serviceContent = `[Unit]
Description=GitHub Actions Runner
After=network.target

[Service]
Type=simple
User=${user}
WorkingDirectory=${runnerDir}
ExecStart=${runnerDir}/run.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target`;

  await runRemote(
    host,
    `sudo tee /etc/systemd/system/gh-actions-runner.service > /dev/null << 'EOF'
${serviceContent}
EOF`
  );

  // Enable and start service
  console.log("🚀 Starting runner service...");
  const startResult = await runRemote(
    host,
    `sudo systemctl daemon-reload && sudo systemctl enable gh-actions-runner && sudo systemctl start gh-actions-runner`,
    { stream: true }
  );
  if (!startResult.success) {
    throw new Error("Failed to start runner service");
  }

  // Verify
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const statusResult = await runRemote(host, `sudo systemctl is-active gh-actions-runner`);

  if (statusResult.output.includes("active")) {
    console.log(`\n✅ GitHub Actions runner is now active!`);
    console.log(`\n   The runner will automatically pick up jobs from:`);
    console.log(`   ${REPO_URL}/actions`);
    console.log(`\n   View runner status: ssh ${host} sudo systemctl status gh-actions-runner`);
    console.log(`   View runner logs:   ssh ${host} sudo journalctl -u gh-actions-runner -f`);
  } else {
    console.log("\n⚠️  Runner may not have started correctly. Check logs:");
    await runRemote(host, `sudo journalctl -u gh-actions-runner -n 20 --no-pager`, {
      stream: true,
    });
  }

  console.log("");
}

// Main
const host = process.argv[2];
const token = process.argv[3];

if (!host || !token) {
  console.error("Usage: bun scripts/setup-runner.ts <hostname> <github-token>");
  console.error("");
  console.error("Get the token from:");
  console.error("https://github.com/ericvicenti/iris/settings/actions/runners/new?arch=x64&os=linux");
  console.error("");
  console.error("Look for the token in the './config.sh' command (starts with A...)");
  process.exit(1);
}

setupRunner(host, token).catch((error) => {
  console.error(`\n❌ Setup failed: ${error.message}\n`);
  process.exit(1);
});
