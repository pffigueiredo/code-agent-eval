# **PRD: Claude Code Eval Library - MVP v0.1**

## **Executive Summary**

A lightweight, open-source TypeScript library for testing AI integration prompts (vendor-provided or custom) against real codebases using Claude Code. The library enables developers to validate prompt reliability by running them multiple times against their actual projects and scoring outputs using both deterministic (build/test/lint) and LLM-based evaluation patterns. Designed for weekend development, the MVP focuses on core functionality: running eval suites against user codebases, capturing code changes, scoring results, and supporting A/B comparison between prompt variations.

## **Vision & Problem Statement**

**Problem**: Library integration prompts (from vendor docs, internal teams, or AI tools like Cursor rules) have unknown reliability. Developers don't know if Supabase's "add auth" prompt or their custom integration instructions will work in their specific codebase until they try them manually. Testing prompt variations requires repetitive manual work.[1][2]

**Solution**: A standalone TypeScript library that automates prompt validation by:
- Running Claude Code Agent SDK against user-provided codebases multiple times
- Validating generated code changes through build/test/lint pipelines
- Scoring outputs using both deterministic checks and configurable LLM judges
- Supporting A/B comparison between prompt variations to identify the most reliable approach
- Providing actionable metrics on prompt reliability

**Use Cases**:
- Test vendor-published integration prompts before using them in production
- A/B test multiple prompts for the same integration task
- Validate prompt improvements through systematic iteration
- Regression test prompts after framework/library updates

**Not in MVP**: Hosted platform, visual dashboards, complex multi-agent workflows, production monitoring, curated prompt library.

## **Core Value Proposition**

Enable developers to answer: *"Does this prompt reliably work with MY codebase?"* through automated, repeatable evaluations that run locally against real projects during development.

## **Target Users (MVP)**

**Primary**: Solo developers and small teams who:
- Use AI tools (Claude Code, Cursor) for library integrations
- Test vendor-published prompts (from library docs, Cursor rules)
- Iterate on custom integration prompts for their specific stack
- Need to validate prompt reliability before using in production
- Want local-first evaluation without external dependencies
- Value simplicity and flexibility over enterprise features

## **Core Features (Weekend Scope)**

### **1. Eval Runner (Critical Path)**

**What**: Execute evaluation suites against user-provided codebases using Claude Code Agent SDK.

**Implementation**:
```typescript
interface EvalConfig {
  name: string;
  prompt: string;
  projectDir: string; // path to user's project directory
  iterations: number; // default: 3
  timeout: number; // ms, default: 600000 (10 minutes)
  scorers: Scorer[];
}

async function runEval(config: EvalConfig): Promise<EvalResult>
```

**Behavior**:
- Copy user's project to isolated temp directory for each iteration
- Initialize Claude Code Agent SDK with temp directory as working dir
- Run agent with user's prompt
- Capture generated code changes via git diff
- Run validation pipeline (build → lint → test) using project's package.json scripts
- Collect execution metadata (duration, tokens, costs)
- Cleanup temp directories (unless debug mode enabled)
- Return structured results

**Success Criteria**: Successfully runs 3 iterations of "Add Supabase authentication" prompt against a user's Next.js project, capturing file changes and scoring results.[5]

### **2. Built-in Scorers**

**What**: Pre-configured evaluation metrics inspired by Braintrust patterns.[6][1]

**Types**:

**Code-based Scorers** (deterministic):
```typescript
interface CodeScorer {
  buildSuccess: () => Score; // 1.0 if build passes
  lintSuccess: () => Score;  // 1.0 if lint passes  
  testSuccess: () => Score;  // 1.0 if tests pass
  allSuccess: () => Score;   // composite 1.0/0.0
}
```

**LLM Judge Scorers** (subjective):[2][7][8]
```typescript
interface LLMJudge {
  codeQuality: (output: string, criteria: string) => Promise<Score>;
  promptFollowing: (output: string, prompt: string) => Promise<Score>;
  // Score: 0-1 with explanation
}
```

**MVP Includes**:
- `buildSuccess`, `testSuccess`, `lintSuccess` (deterministic)
- 1 basic LLM judge for code quality using OpenAI/Anthropic[9][2]

**Not in MVP**: Custom scorer DSL, multi-dimensional rubrics, human-in-the-loop scoring.

### **3. Result Collection & Export**

**What**: Structured output format for analysis.

**Schema**:
```typescript
interface EvalResult {
  evalName: string;
  timestamp: string;
  iterations: IterationResult[];
  summary: {
    passRate: number;
    avgDuration: number;
    avgTokens: number;
    scores: Record<string, number>;
  }
}

interface IterationResult {
  id: string;
  success: boolean;
  duration: number;
  scores: Record<string, Score>;
  errors?: string[];
  diff?: string; // git diff output
}
```

**Output Formats**:
- JSON file (primary)
- Markdown summary table
- Terminal pretty-print

**Success Criteria**: Generate a JSON report that can be committed to git and diffed between runs.[10][1]

### **4. Project Directory Handling**

**What**: User-provided codebases to test prompts against.

**MVP Behavior**:
- Users provide path to their existing project directory
- Library copies entire directory to isolated temp location for each iteration
- Each iteration gets a fresh copy to ensure independence
- Original codebase is NEVER modified
- Temp directories deleted after eval (unless `EVAL_DEBUG=1` env var set)
- Git history preserved in copies (for diff capture)

**API**:
```typescript
await runEval({
  name: 'test-supabase-prompt',
  prompt: 'Add Supabase authentication with email/password',
  projectDir: './my-nextjs-app', // User's actual project
  iterations: 5,
  scorers: [...]
});
```

**Implementation Notes**:
- Library does NOT validate or understand project structure
- Does NOT handle dependency installation (assumes projects are already set up)
- Does NOT provide smart monorepo handling (user specifies exact directory)
- Just copies directory and runs Claude Code Agent SDK against it
- Delegates all "smarts" to Claude Code Agent and user configuration

**Not in MVP**: Template validation, automatic dependency installation, smart monorepo detection, provided starter templates.

### **5. Prompt Comparison Mode**

**What**: Run multiple prompts for the same task and compare results to identify the most reliable approach.

**Use Cases**:
- A/B test vendor prompt vs custom prompt
- Compare different phrasings of the same instruction
- Test multiple approaches (e.g., "use Supabase" vs "use NextAuth")
- Identify which prompt works best with specific codebase

**API**:
```typescript
const comparison = await comparePrompts({
  name: 'auth-integration-comparison',
  prompts: {
    'supabase-official': 'Add Supabase auth with email/password...',
    'supabase-detailed': 'Integrate Supabase authentication. Use TypeScript...',
    'custom-v1': 'Add authentication using Supabase. Follow Next.js 15 patterns...'
  },
  projectDir: './my-app',
  iterations: 5,
  scorers: [
    scorers.buildSuccess(),
    scorers.testSuccess(),
    scorers.codeQuality({ criteria: 'TypeScript best practices' })
  ]
});

// Results include comparative metrics
console.log(comparison.winner); // 'custom-v1'
console.log(comparison.results);
// {
//   'supabase-official': { passRate: 0.6, avgScore: 0.72, iterations: [...] },
//   'supabase-detailed': { passRate: 0.8, avgScore: 0.85, iterations: [...] },
//   'custom-v1': { passRate: 1.0, avgScore: 0.92, iterations: [...] }
// }
```

**Implementation**:
- Internally runs `runEval()` for each prompt sequentially
- Aggregates results into comparison structure
- Identifies "winner" based on composite score (configurable)
- Generates side-by-side comparison table

**Success Criteria**: Can compare 3 different prompts and correctly identify which has highest pass rate and average score.

## **Technical Architecture**

### **Core Dependencies**

**Essential**:
- `@anthropic-ai/claude-agent-sdk` - Claude Code integration[11][12]
- `execa` - Shell command execution
- `fs-extra` - File system operations
- `zod` - Schema validation
- `openai` or `anthropic` SDK - LLM judge calls[2]

**Dev**:
- `vitest` - Testing framework
- `typescript` - Type safety
- `tsup` - Bundling

### **Claude Code Integration**

**Uses**: `@anthropic-ai/claude-agent-sdk` which provides pre-built agent loop with file system tools.

**Reference Implementation**: Vercel's next-evals-oss [claude-code-runner.ts](https://github.com/vercel/next-evals-oss/blob/main/lib/claude-code-runner.ts)[5]

**Integration Pattern**:
```typescript
import { Agent } from '@anthropic-ai/claude-agent-sdk';

async function runSingleIteration(config: EvalConfig): Promise<IterationResult> {
  // 1. Copy project to temp directory
  const tempDir = await fs.copy(config.projectDir, `/tmp/eval-${uuid()}`);

  // 2. Initialize Claude Code Agent SDK
  const agent = new Agent({
    apiKey: process.env.ANTHROPIC_API_KEY,
    workingDirectory: tempDir,
    timeout: config.timeout
  });

  // 3. Run agent with user's prompt
  const agentResult = await agent.run(config.prompt);

  // 4. Capture file changes
  const diff = await execInDir(tempDir, 'git diff HEAD');

  // 5. Run scorers
  const scores = await Promise.all(
    config.scorers.map(scorer => scorer.fn({
      output: agentResult,
      diff,
      workingDir: tempDir
    }))
  );

  // 6. Cleanup
  if (!process.env.EVAL_DEBUG) {
    await fs.remove(tempDir);
  }

  return { agentResult, diff, scores };
}
```

**Key Points**:
- Agent SDK handles tool calling (read/write/edit files) automatically
- No need to implement agent loop manually
- Working directory isolation prevents conflicts
- Timeout handling built-in

### **Project Structure**

```
claude-code-evals/
├── src/
│   ├── runner.ts        // Core eval execution
│   ├── scorers/         // Built-in scorers
│   │   ├── code.ts      // Build/test/lint
│   │   └── llm.ts       // LLM judge
│   ├── templates/       // Starter templates
│   ├── types.ts         // TypeScript interfaces
│   └── index.ts         // Public API
├── examples/
│   └── basic-eval.ts    // Usage example
├── tests/
│   └── runner.test.ts
└── package.json
```

### **API Design**

**Testing a Single Prompt**:
```typescript
import { runEval, scorers } from 'claude-code-evals';

// Test vendor's integration prompt
const result = await runEval({
  name: 'supabase-auth-reliability',
  prompt: 'Add Supabase authentication with email/password to the Next.js app',
  projectDir: './my-nextjs-app', // User's actual project
  iterations: 5,
  scorers: [
    scorers.buildSuccess(),
    scorers.testSuccess(),
    scorers.codeQuality({ criteria: 'Uses TypeScript best practices' })
  ]
});

console.log(`Pass rate: ${result.summary.passRate}%`);
console.log(`Avg score: ${result.summary.avgScore}`);
```

**A/B Testing Multiple Prompts**:
```typescript
import { comparePrompts, scorers } from 'claude-code-evals';

const comparison = await comparePrompts({
  name: 'auth-prompt-comparison',
  prompts: {
    'vendor-official': 'Add Supabase authentication...',
    'custom-detailed': 'Integrate Supabase auth with TypeScript...'
  },
  projectDir: './my-app',
  iterations: 5,
  scorers: [scorers.buildSuccess(), scorers.testSuccess()]
});

console.log(`Winner: ${comparison.winner}`); // 'custom-detailed'
```

**Custom Scorer (Advanced)**:
```typescript
// Custom scorer for specific validation
const customScorer: Scorer = {
  name: 'has-error-handling',
  fn: async ({ output, workingDir }) => {
    const code = await fs.readFile(`${workingDir}/app/auth/page.tsx`, 'utf-8');
    const hasErrorHandling = code.includes('try') && code.includes('catch');
    return {
      score: hasErrorHandling ? 1.0 : 0.0,
      reason: hasErrorHandling ? 'Has error handling' : 'Missing error handling'
    };
  }
};
```

## **Non-Goals (Out of Scope for MVP)**

❌ **UI/Dashboard**: CLI and programmatic only
❌ **Braintrust Integration**: Focus on standalone usage first[1][10]
❌ **Multi-model Support**: Claude Agent SDK only (uses Claude 3.5 Sonnet)
❌ **Dataset Management**: Use simple JSON/YAML files for test cases
❌ **Parallel Execution**: Sequential runs sufficient for MVP
❌ **Cost Optimization**: Basic token tracking only
❌ **Caching**: Fresh runs every time
❌ **Complex Workflows**: Single-step evals only (no multi-turn interactions)
❌ **Provided Templates**: Users bring their own codebases
❌ **Smart Validation**: No automatic project structure detection or validation  

## **Success Metrics**

**MVP Complete (Week 1)**:
- ✅ Can run 1 prompt against user-provided codebase 5 times
- ✅ Captures file changes via git diff after each iteration
- ✅ Runs build/test commands and captures results
- ✅ Generates JSON output with pass/fail + scores
- ✅ LLM judge returns 0-1 score with explanation
- ✅ `comparePrompts()` compares 2+ prompts and identifies winner
- ✅ Published to npm as `claude-code-eval@0.1.0`
- ✅ README with 2 usage examples:
  - Single prompt reliability test
  - A/B comparison of 2 prompts
- ✅ Works with user's existing Next.js/React projects

**Not Required for MVP**:
- UI/Dashboard
- Prompt library/marketplace
- Parallel execution
- Advanced cost optimization
- Windows support
- Provided starter templates

**Week 2-4 (Validation)**:
- 10+ GitHub stars
- 3+ external users testing it
- Feedback collected on API ergonomics

## **Development Plan (Weekend Breakdown)**

### **Saturday Morning (4 hours)**
- [ ] Project setup (TypeScript, tsup, vitest, Claude Agent SDK)
- [ ] Core `EvalConfig` and `EvalResult` types
- [ ] Basic `runEval()` function skeleton
- [ ] File system operations (copy project dir, cleanup)

### **Saturday Afternoon (4 hours)**
- [ ] Claude Agent SDK integration (Agent initialization, run prompt)
- [ ] Git diff capture after agent runs
- [ ] Code-based scorers (build/test/lint execution via execa)

### **Sunday Morning (4 hours)**
- [ ] LLM judge scorer implementation[7][2]
- [ ] `comparePrompts()` function (runs multiple evals, aggregates)
- [ ] Result formatting (JSON, markdown)

### **Sunday Afternoon (4 hours)**
- [ ] Terminal output with colors/pretty-print
- [ ] 2 example scripts (single eval + comparison)
- [ ] Basic integration tests
- [ ] README with quickstart + API docs
- [ ] Publish to npm as alpha

**Total Time**: ~16 hours of focused development

**Key Simplifications**:
- Agent SDK handles file operations (no custom tool implementation)
- Sequential execution only (no parallelization)
- Users provide ready-to-run projects (no dep installation)
- Basic scorers only (extensible via custom scorer API)

## **Key Design Decisions**

**1. TypeScript-First**: Native typing reduces runtime errors, better DX.[13][14]

**2. Local Execution**: No cloud dependencies keeps it simple and privacy-friendly.[10][1]

**3. Git-Based Diffs**: Leverage existing tooling rather than custom diff engine.[5]

**4. Score Simplicity**: 0-1 scale following Braintrust conventions for future compatibility.[6][1]

**5. Flexible Scorers**: Combine deterministic + LLM judges like industry tools.[8][7][2]

## **Risks & Mitigations**

| Risk | Impact | Mitigation |
|------|--------|------------|
| Anthropic API rate limits | High | Add configurable delays between iterations, clear error messages |
| LLM judge costs | Medium | Make optional, cap iterations at 10, document expected costs (~$2-3 per eval) |
| User project compatibility issues | Medium | Document that projects must be pre-configured (deps installed, ready to build) |
| Eval timeouts | Medium | Default 10-minute timeout, make configurable via config.timeout |
| Security (malicious project code) | Low-Medium | Document that evals run user code locally, recommend sandboxing for untrusted projects |

## **Post-MVP Roadmap**

**Phase 2** (Weeks 2-4):
- Braintrust export adapter[1][10]
- Parallel execution for large eval suites
- Dataset loader (YAML/JSON for batch prompt testing)
- Better error reporting and debugging tools

**Phase 3** (Months 2-3):
- Visual HTML reports
- GitHub Action integration
- Prompt versioning and history tracking
- Multi-turn conversation evals

**Phase 4** (Managed Service):
- Hosted evaluation platform
- Community prompt library with reliability scores
- "CanIUse for AI prompts" - browse tested vendor prompts
- Team collaboration and shared eval history
- Analytics dashboard showing prompt performance trends

## **Open Questions (To Resolve During Build)**

1. Should LLM judge be required or optional?
   *Decision: Optional - if API key missing, only run deterministic scorers*

2. Store eval temp directories on disk or auto-cleanup?
   *Decision: Auto-cleanup by default, preserve with `EVAL_DEBUG=1` env var*

3. Auto-detect package manager (npm/pnpm/yarn/bun)?
   *Decision: Check for lockfiles (package-lock.json, pnpm-lock.yaml, etc.), default to npm*

4. How to handle prompts that ask clarifying questions?
   *Decision: Agent SDK should handle timeout if no progress. Document that prompts should be unambiguous.*

5. Winner selection in comparePrompts()?
   *Decision: Highest composite score (average of all scorer results). Make configurable via `winnerStrategy` option.*

## **Inspiration & References**

- **Vercel next-evals-oss**: Eval structure, template patterns[5]
- **Braintrust**: Scoring framework, result formats[6][10][1]
- **DeepEval**: TypeScript eval patterns, scorer architecture[15][14]
- **LLM-as-a-Judge**: Evaluation methodology[7][8][2]

## **Getting Started (For Implementers)**

**Prerequisites**:
- Node.js 18+
- Anthropic API key (for Claude Agent SDK)
- Optional: OpenAI/Anthropic API key for LLM judge scorer
- Basic TypeScript knowledge

**Setup**:
```bash
# Initialize project
npm init -y
npm install @anthropic-ai/claude-agent-sdk execa fs-extra zod

# Dev dependencies
npm install -D typescript tsup vitest @types/node
npx tsc --init
```

**Core Implementation Focus**:
1. `runEval()` - Single prompt reliability testing
2. `comparePrompts()` - A/B comparison
3. Deterministic scorers (build/test/lint)
4. Optional LLM judge scorer
5. Git diff capture
6. JSON result export

**Key Reference**: See [Vercel's next-evals-oss claude-code-runner.ts](https://github.com/vercel/next-evals-oss/blob/main/lib/claude-code-runner.ts) for Agent SDK integration pattern.

**Philosophy**: Ship something that works for 1 use case perfectly (testing library integration prompts), rather than something that handles 10 use cases poorly. Keep the library simple and delegate complexity to the Agent SDK and users.

***

**Document Version**: 2.0
**Last Updated**: October 25, 2025
**Status**: Ready for Implementation

**Key Changes from v1.0**:
- Clarified focus: Testing library integration prompts (vendor-provided or custom)
- Changed from "starter templates" to "user-provided codebases"
- Added Prompt Comparison Mode as core MVP feature
- Explicit Claude Agent SDK integration pattern
- Updated use cases, examples, and terminology throughout

[1](https://www.braintrust.dev/blog/measuring-what-matters)
[2](https://www.confident-ai.com/blog/why-llm-as-a-judge-is-the-best-llm-evaluation-method)
[3](https://docs.claude.com/en/api/claude-code-analytics-api)
[4](https://eval.16x.engineer/blog/claude-vs-claude-api-vs-claude-code)
[5](https://github.com/vercel/next-evals-oss)
[6](https://www.latent.space/p/braintrust)
[7](https://arize.com/llm-as-a-judge/)
[8](https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge)
[9](https://www.evidentlyai.com/llm-guide/llm-as-a-judge)
[10](https://www.braintrust.dev/docs/platform/experiments)
[11](https://docs.claude.com/en/docs/claude-code/sdk/migration-guide)
[12](https://github.com/anthropics/anthropic-sdk-typescript)
[13](https://spin.atomicobject.com/ai-agent-eval-framework/)
[14](https://github.com/evalkit/evalkit)
[15](https://dev.to/guybuildingai/-top-5-open-source-llm-evaluation-frameworks-in-2024-98m)
[16](https://www.helicone.ai/blog/evaluating-claude-code)
[17](https://www.youtube.com/watch?v=a4BV0gGmXgA)
[18](https://aws.amazon.com/blogs/machine-learning/llm-as-a-judge-on-amazon-bedrock-model-evaluation/)
[19](https://www.reddit.com/r/ClaudeAI/comments/1gfqsvm/using_claudes_evaluation_access_free_to_evaluate/)
[20](https://www.braintrust.dev/docs/reference/platform/architecture)
[21](https://www.anthropic.com/engineering/claude-code-best-practices)
[22](https://www.braintrust.dev)
[23](https://arxiv.org/abs/2411.15594)
[24](https://docs.claude.com/en/docs/test-and-evaluate/eval-tool)
[25](https://www.youtube.com/watch?v=bk0TmxoZlUY)
[26](https://huggingface.co/learn/cookbook/en/llm_judge)
[27](https://www.reddit.com/r/LLMDevs/comments/1i6r1h9/top_6_open_source_llm_evaluation_frameworks/)
[28](https://www.reddit.com/r/PromptEngineering/comments/1bigrpb/tools_for_prompt_management_and_testing/)
[29](https://www.braintrust.dev/docs/start/eval-sdk)
[30](https://learn.microsoft.com/en-us/ai-builder/batch-testing-prompts)
[31](https://www.reddit.com/r/node/comments/1d09u4b/introducing_evalkit_the_open_source_typescript/)
[32](https://posthog.com/blog/best-open-source-llm-observability-tools)
[33](https://blog.promptlayer.com/top-5-prompt-engineering-tools-for-evaluating-prompts/)
[34](https://blog.risingstack.com/writing-a-javascript-framework-sandboxed-code-evaluation/)
[35](https://github.com/openai/evals)
[36](https://promptmetheus.com)
[37](https://www.confident-ai.com/blog/how-to-build-an-llm-evaluation-framework-from-scratch)
[38](https://deepeval.com)
[39](https://testguild.com/7-innovative-ai-test-automation-tools-future-third-wave/)
[40](https://learn.microsoft.com/en-us/dotnet/ai/evaluation/libraries)
[41](https://www.prompthub.us)
[42](https://mastra.ai)
[43](https://github.com/confident-ai/deepeval)
[44](https://miro.com/product-development/what-is-mvp-minimum-viable-product/)
[45](https://www.oneseventech.com/blog/minimum-viable-product-scope)
[46](https://www.reddit.com/r/ClaudeAI/comments/1c6phzi/migrating_from_openai_to_claude_in_typescript/)
[47](https://powerslides.com/powerpoint-business/startups-pitch-decks-templates/minimum-viable-product/)
[48](https://www.upsilonit.com/blog/how-to-define-mvp-scope-tips-for-those-planning-development)
[49](https://github.com/ruvnet/claude-flow/wiki/CLAUDE-MD-TypeScript)
[50](https://www.atlassian.com/software/confluence/templates/mvp-ideation)
[51](https://www.toptal.com/product-managers/product-leader/how-to-define-an-mvp-scope-in-three-hours)
[52](https://kromatic.com/blog/cheat-sheet-minimum-viable-product/)
[53](https://www.atlassian.com/agile/product-management/minimum-viable-product)
[54](https://apidog.com/blog/mcp-server-connect-claude-desktop/)
[55](https://lucid.co/templates/minimum-viable-platform-canvas)
[56](https://gojilabs.com/blog/essentials-of-mvp-development/)
[57](https://miro.com/templates/minimum-viable-product/)
[58](https://www.f22labs.com/blogs/mvp-planning-scope-management/)
[59](https://www.anthropic.com/learn/build-with-claude)
[60](https://www.softkraft.co/mvp-template/)
[61](https://www.reddit.com/r/startups/comments/mtie5r/how_to_determine_what_is_truly_mvp_and_limit/)