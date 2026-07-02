import { describe, expect, it } from "vitest";
import { z } from "zod";
import { jsonConfigSchema } from "../src/scorers/schema";

describe("schema generation", () => {
	it("toJSONSchema does not throw and is strict", () => {
		const schema = z.toJSONSchema(jsonConfigSchema) as Record<string, unknown>;
		expect(schema.additionalProperties).toBe(false);
	});
});
