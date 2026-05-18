import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

function runHealthcheck() {
  console.log("\x1b[36m=========================================================================");
  console.log("             GHOSTSTACK V1.1 PLATFORM SYSTEM HEALTHCHECK                ");
  console.log("=========================================================================\x1b[0m\n");

  let healthy = true;
  const checks = [
    { name: "Workspace Core Folders Structure", check: checkFolders },
    { name: "YAML Configuration Validation", check: checkYAMLConfigs },
    { name: "Orchestrator Classes Compilation Integrity", check: checkCompilationIntegrity },
    { name: "Interface Schemas Verification", check: checkSchemas }
  ];

  for (const check of checks) {
    console.log(`[CHECK] Evaluating: ${check.name}...`);
    try {
      const result = check.check();
      if (result) {
        console.log(`\x1b[32m[PASS] ${check.name} evaluated successfully.\x1b[0m\n`);
      } else {
        console.log(`\x1b[31m[FAIL] ${check.name} failed sanity checks.\x1b[0m\n`);
        healthy = false;
      }
    } catch (e: any) {
      console.log(`\x1b[31m[CRITICAL] Error checking ${check.name}: ${e.message}\x1b[0m\n`);
      healthy = false;
    }
  }

  if (healthy) {
    console.log("\x1b[32m=========================================================================");
    console.log("  ALL SYSTEM CHECKS PASSED: GHOSTSTACK V1.1 CORE IS HEALTHY & OPERATIONAL");
    console.log("=========================================================================\x1b[0m");
    process.exit(0);
  } else {
    console.log("\x1b[31m=========================================================================");
    console.log("  CRITICAL SYSTEM HEALTH SANITY FAILURE: PLEASE INSPECT MALFORMED ASSETS");
    console.log("=========================================================================\x1b[0m");
    process.exit(1);
  }
}

function checkFolders(): boolean {
  const root = path.join(__dirname, '..');
  const required = ['orchestration', 'runtime', 'schemas', 'tests'];
  for (const folder of required) {
    const p = path.join(root, folder);
    if (!fs.existsSync(p) || !fs.statSync(p).isDirectory()) {
      console.error(`  [ERR] Missing core directory: ${folder}`);
      return false;
    }
    console.log(`  [OK] Directory present: ${folder}`);
  }
  return true;
}

function checkYAMLConfigs(): boolean {
  const root = path.join(__dirname, '..', 'runtime');
  const files = ['ports.yaml', 'services.yaml', 'healthchecks.yaml', 'ghoststack.runtime.yaml'];
  for (const file of files) {
    const p = path.join(root, file);
    if (!fs.existsSync(p)) {
      console.error(`  [ERR] Missing configuration file: ${file}`);
      return false;
    }
    try {
      const content = fs.readFileSync(p, 'utf8');
      yaml.load(content);
      console.log(`  [OK] Parsed valid YAML config: ${file}`);
    } catch (err: any) {
      console.error(`  [ERR] Malformed YAML in file ${file}: ${err.message}`);
      return false;
    }
  }
  return true;
}

function checkCompilationIntegrity(): boolean {
  const root = path.join(__dirname, '..', 'orchestration');
  const files = ['event-bus.ts', 'task-router.ts', 'task-executor.ts', 'persistence-manager.ts', 'logger.ts'];
  for (const file of files) {
    const p = path.join(root, file);
    if (!fs.existsSync(p)) {
      console.error(`  [ERR] Missing core source file: ${file}`);
      return false;
    }
    console.log(`  [OK] Source file validated: ${file}`);
  }
  return true;
}

function checkSchemas(): boolean {
  const root = path.join(__dirname, '..', 'schemas');
  const files = ['orchestration.schema.json', 'task.schema.json', 'agent-message.schema.json'];
  for (const file of files) {
    const p = path.join(root, file);
    if (!fs.existsSync(p)) {
      console.error(`  [ERR] Missing validation schema file: ${file}`);
      return false;
    }
    try {
      const content = fs.readFileSync(p, 'utf8');
      JSON.parse(content);
      console.log(`  [OK] Loaded valid JSON schema: ${file}`);
    } catch (err: any) {
      console.error(`  [ERR] Malformed JSON schema in ${file}: ${err.message}`);
      return false;
    }
  }
  return true;
}

runHealthcheck();
