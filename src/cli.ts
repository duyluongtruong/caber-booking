#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { loadConfig, resolveConfigPath } from "./loadConfig.js";

const program = new Command()
  .name("tennis-booking")
  .description("Local helper for multi-account Clubspark (Caber Park) booking");

const configCmd = new Command("config").description("Account JSON on disk");

configCmd
  .command("check")
  .description("Validate accounts file; print label, id, and username only (never passwords)")
  .option("-c, --config <path>", "accounts JSON path (else TENNIS_BOOKING_ACCOUNTS or config/accounts.local.json)")
  .action((opts: { config?: string }) => {
    const configPath = opts.config
      ? path.isAbsolute(opts.config)
        ? opts.config
        : path.resolve(process.cwd(), opts.config)
      : resolveConfigPath();

    if (!existsSync(configPath)) {
      console.error(`tennis-booking: config file not found: ${configPath}`);
      process.exitCode = 1;
      return;
    }

    try {
      const cfg = loadConfig(configPath);
      for (const a of cfg.accounts) {
        console.log(`${a.label}\t${a.id}\t${a.username}`);
      }
    } catch (e) {
      console.error("tennis-booking:", e instanceof Error ? e.message : e);
      process.exitCode = 1;
    }
  });

program.addCommand(configCmd);
program.showHelpAfterError();
program.parse();
