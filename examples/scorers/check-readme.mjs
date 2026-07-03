/** Check that README.md exists and is non-empty.
 *  @param {import('code-agent-eval').ScorerContext} ctx */
export default async function evaluate(ctx) {
	const result = await ctx.execCommand({
		command: "test",
		args: ["-s", "README.md"],
	});
	if (result.score === 1) {
		return { score: 1, reason: "README.md exists and is non-empty" };
	}
	return { score: 0, reason: "README.md missing or empty" };
}
