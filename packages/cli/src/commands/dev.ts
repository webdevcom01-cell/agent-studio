import { checkEnvExists } from "../utils/env.js";

export async function devCommand(): Promise<void> {
  const chalk = (await import("chalk")).default;
  const { execa } = await import("execa");

  if (!checkEnvExists()) {
    console.log(chalk.yellow("No .env file found. Running setup first...\n"));
    const { initCommand } = await import("./init.js");
    await initCommand();
  }

  console.log(chalk.bold("\nStarting Agent Studio dev server...\n"));
  console.log(`  ${chalk.cyan("http://localhost:3000")}\n`);

  try {
    await execa("pnpm", ["dev"], { stdio: "inherit" });
  } catch {
    process.exit(1);
  }
}
