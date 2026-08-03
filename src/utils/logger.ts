import chalk from "chalk";

/** Soft terminal logger with consistent Codebase styling. */
export const logger = {
  info(message: string): void {
    console.log(chalk.cyan("ℹ"), message);
  },

  success(message: string): void {
    console.log(chalk.green("✔"), message);
  },

  warn(message: string): void {
    console.log(chalk.yellow("⚠"), message);
  },

  error(message: string): void {
    console.error(chalk.red("✖"), message);
  },

  dim(message: string): void {
    console.log(chalk.dim(message));
  },

  agent(message: string): void {
    console.log();
    console.log(chalk.bold.white("Codebase"), chalk.dim("›"));
    console.log(message);
    console.log();
  },

  thought(message: string): void {
    console.log(chalk.dim(`  thought: ${message}`));
  },

  tool(name: string, detail?: string): void {
    const suffix = detail ? chalk.dim(` ${detail}`) : "";
    console.log(chalk.magenta("  ⚙"), chalk.magenta(name) + suffix);
  },

  banner(): void {
    console.log();
    console.log(
      chalk.bold.white("  Codebase"),
      chalk.dim("— terminal-first AI vehicle agent"),
    );
    console.log(
      chalk.dim(
        "  Taste-aware · local-first · type /help inside a session",
      ),
    );
    console.log();
  },
};
