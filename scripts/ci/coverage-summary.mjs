// Prints coverage/coverage-summary.json as a Markdown table for the GitHub job summary.
import { existsSync, readFileSync } from "node:fs";

const file = "coverage/coverage-summary.json";
if (!existsSync(file)) {
  console.log("### Coverage\n\nNo coverage report was produced.");
  process.exit(0);
}

const { total } = JSON.parse(readFileSync(file, "utf8"));
const row = (label, m) => `| ${label} | ${m.pct}% | ${m.covered} / ${m.total} |`;

console.log(
  [
    "### Coverage (unit + component)",
    "",
    "| Metric | % | Covered |",
    "| --- | --- | --- |",
    row("Lines", total.lines),
    row("Statements", total.statements),
    row("Branches", total.branches),
    row("Functions", total.functions),
    "",
    "_SQL functions are exercised by the `db` project and the E2E suite; V8 coverage can't measure them._",
  ].join("\n"),
);
