import chalk from "chalk";
import { APP_DISPLAY_NAME, APP_TAGLINE } from "../brand.js";
import { formatSafetyForTerminal } from "../agent/safety.js";

/** Soft terminal logger with consistent Bay styling. */
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

  divider(): void {
    console.log(chalk.dim("  ────────────────────────────────────────"));
  },

  section(title: string): void {
    console.log();
    console.log(chalk.bold.white(`  ${title}`));
    console.log(chalk.dim("  ────────────────────────────────────────"));
  },

  agent(message: string): void {
    console.log();
    console.log(chalk.bold.white(APP_DISPLAY_NAME), chalk.dim("›"));
    console.log(formatSafetyForTerminal(wrapLongLines(message, 100)));
    console.log();
  },

  thought(message: string): void {
    console.log(chalk.dim(`  thought: ${truncate(message, 160)}`));
  },

  tool(name: string, detail?: string): void {
    const suffix = detail ? chalk.dim(` ${truncate(detail, 80)}`) : "";
    console.log(chalk.magenta("  ⚙"), chalk.magenta(name) + suffix);
  },

  banner(): void {
    console.log();
    console.log(chalk.bold.white(`  ${APP_DISPLAY_NAME}`), chalk.dim(`— ${APP_TAGLINE}`));
    console.log(
      chalk.dim("  Taste-aware · local-first · private · /help · /about · /quick"),
    );
    console.log();
  },
};

function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Soft-wrap long lines for terminal readability without breaking tables much. */
function wrapLongLines(text: string, width: number): string {
  return text
    .split("\n")
    .map((line) => {
      if (line.length <= width) return line;
      // Don't wrap table-like lines
      if (/\s{2,}/.test(line) && !line.startsWith(" ")) return line;
      const words = line.split(" ");
      const out: string[] = [];
      let cur = "";
      for (const w of words) {
        if (!cur) {
          cur = w;
          continue;
        }
        if ((cur + " " + w).length > width) {
          out.push(cur);
          cur = w;
        } else {
          cur += " " + w;
        }
      }
      if (cur) out.push(cur);
      return out.join("\n");
    })
    .join("\n");
}
