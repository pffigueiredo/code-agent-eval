import fs from "node:fs";
import path from "node:path";
import { execa } from "execa";
import { describe, expect, it } from "vitest";

const CLI = path.resolve("dist/cli.mjs");
const jsonExamples = fs
	.readdirSync("examples")
	.filter((f) => f.endsWith(".json"));

describe("examples/*.json all pass --dry-run", () => {
	for (const f of jsonExamples) {
		it(`${f} dry-runs cleanly`, async () => {
			const { exitCode } = await execa(
				"node",
				[CLI, "--eval-file", path.join("examples", f), "--dry-run"],
				{
					reject: false,
				},
			);
			expect(exitCode).toBe(0);
		});
	}
});
