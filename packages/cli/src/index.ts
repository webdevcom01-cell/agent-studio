#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { devCommand } from "./commands/dev.js";

const VERSION = "0.1.0";

const program = new Command();

program
  .name("agent-studio")
  .description("Agent Studio CLI — visual AI agent builder")
  .version(VERSION);

program
  .command("init")
  .description("Initialize Agent Studio project with interactive setup")
  .action(initCommand);

program
  .command("dev")
  .description("Start the development server")
  .action(devCommand);

program
  .command("build")
  .description("Create a production build")
  .action(async () => {
    const { execa } = await import("execa");
    const ora = (await import("ora")).default;

    const spinner = ora("Building for production...").start();
    try {
      await execa("pnpm", ["build"], { stdio: "inherit" });
      spinner.succeed("Production build complete");
    } catch {
      spinner.fail("Build failed");
      process.exit(1);
    }
  });

program.parse();
