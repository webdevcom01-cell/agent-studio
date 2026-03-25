import { generateSecret, checkEnvExists, writeEnvFile } from "../utils/env.js";

interface InitAnswers {
  deepseekKey: string;
  openaiKey: string;
  authSecret: string;
  databaseUrl: string;
}

export async function initCommand(): Promise<void> {
  const chalk = (await import("chalk")).default;
  const { prompt } = await import("enquirer");
  const { execa } = await import("execa");
  const ora = (await import("ora")).default;

  console.log(chalk.bold("\nAgent Studio — Project Setup\n"));

  if (checkEnvExists()) {
    const { overwrite } = await prompt<{ overwrite: boolean }>({
      type: "confirm",
      name: "overwrite",
      message: ".env file already exists. Overwrite?",
      initial: false,
    });

    if (!overwrite) {
      console.log(chalk.yellow("Skipping .env creation. Running install...\n"));
      await runInstall(ora, execa);
      return;
    }
  }

  const answers = await prompt<InitAnswers>([
    {
      type: "input",
      name: "deepseekKey",
      message: "DeepSeek API Key (https://platform.deepseek.com):",
      validate: (v: string) => v.length > 0 || "Required",
    },
    {
      type: "input",
      name: "openaiKey",
      message: "OpenAI API Key (https://platform.openai.com):",
      validate: (v: string) => v.length > 0 || "Required for embeddings",
    },
    {
      type: "input",
      name: "authSecret",
      message: "Auth secret (leave empty to auto-generate):",
    },
    {
      type: "input",
      name: "databaseUrl",
      message: "Database URL:",
      initial: "postgresql://postgres:postgres@localhost:5432/agent_studio",
    },
  ]);

  const authSecret = answers.authSecret || generateSecret();

  writeEnvFile({
    DEEPSEEK_API_KEY: answers.deepseekKey,
    OPENAI_API_KEY: answers.openaiKey,
    AUTH_SECRET: authSecret,
    DATABASE_URL: answers.databaseUrl,
    DIRECT_URL: answers.databaseUrl,
  });

  console.log(chalk.green("\n.env file created.\n"));

  await runInstall(ora, execa);

  console.log(chalk.bold.green("\nSetup complete!\n"));
  console.log("Next steps:");
  console.log(`  ${chalk.cyan("agent-studio dev")}    Start the dev server`);
  console.log(`  ${chalk.cyan("agent-studio build")}  Create production build`);
  console.log("");
}

async function runInstall(
  ora: typeof import("ora").default,
  execa: typeof import("execa").execa,
): Promise<void> {
  let spinner = ora("Installing dependencies...").start();
  try {
    await execa("pnpm", ["install"], { stdio: "pipe" });
    spinner.succeed("Dependencies installed");
  } catch {
    spinner.fail("pnpm install failed");
    process.exit(1);
  }

  spinner = ora("Pushing database schema...").start();
  try {
    await execa("pnpm", ["db:push"], { stdio: "pipe" });
    spinner.succeed("Database schema synced");
  } catch {
    spinner.fail("db:push failed — check DATABASE_URL in .env");
    process.exit(1);
  }

  spinner = ora("Generating Prisma client...").start();
  try {
    await execa("pnpm", ["db:generate"], { stdio: "pipe" });
    spinner.succeed("Prisma client generated");
  } catch {
    spinner.fail("db:generate failed");
    process.exit(1);
  }
}
