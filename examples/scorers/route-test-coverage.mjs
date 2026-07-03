/** Score = (new routes that have a matching test) / (new routes).
 *  @param {import('code-agent-eval').ScorerContext} ctx */
export default async function evaluate(ctx) {
	const routes = [
		...ctx.diff.matchAll(/^\+\+\+ b\/src\/routes\/(\w+)\.ts$/gm),
	].map((m) => m[1]);
	if (routes.length === 0) return { score: 0, reason: "no new routes added" };
	let covered = 0;
	for (const name of routes) {
		const res = await ctx.execCommand({
			command: "test",
			args: ["-f", `src/routes/${name}.test.ts`],
		});
		if (res.score === 1) covered++;
	}
	return {
		score: covered / routes.length,
		reason: `${covered}/${routes.length} new routes have tests`,
		metadata: { routes, covered },
	};
}
