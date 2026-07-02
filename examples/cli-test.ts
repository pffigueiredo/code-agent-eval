// Example eval config file for CLI usage
// Run: npx code-agent-eval --eval-file ./examples/cli-test.ts

import type { ScorerContext } from "../src";

export default {
	name: "cli-test",
	prompts: [{ id: "v1", prompt: "Add a TODO comment to the main entry file" }],
	projectDir: ".",
	iterations: 1,
	scorers: [
		{
			name: "build",
			evaluate: async ({ execCommand }: ScorerContext) =>
				execCommand({ command: "npm", args: ["run", "build"], timeout: 60000 }),
		},
	],
};
