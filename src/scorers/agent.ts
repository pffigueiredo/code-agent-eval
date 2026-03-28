import type { ScorerContext, ScorerResult } from '../types';
import { BaseScorer } from './base';

interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface AgentMessage {
  type: string;
  message?: {
    content?: Array<{ type: string; [key: string]: unknown }>;
  };
}

function isAgentMessage(msg: unknown): msg is AgentMessage {
  return typeof msg === 'object' && msg !== null && 'type' in msg;
}

function isToolUseBlock(block: unknown): block is ToolUseBlock {
  return (
    typeof block === 'object' &&
    block !== null &&
    'type' in block &&
    (block as ToolUseBlock).type === 'tool_use'
  );
}

/**
 * Scorer that checks if a specific skill was invoked during the agent's run.
 * Parses `agentOutput` JSON to find Skill tool invocations matching `skillName`.
 *
 * Scorer name follows the pattern `skill-picked-up:{skillName}` to support multiple instances.
 */
export class SkillPickedUpScorer extends BaseScorer {
  readonly name: string;

  constructor(private readonly skillName: string) {
    super();
    this.name = `skill-picked-up:${skillName}`;
  }

  async evaluate({ agentOutput }: ScorerContext): Promise<ScorerResult> {
    let messages: unknown[];
    try {
      messages = JSON.parse(agentOutput);
    } catch {
      return { score: 0.0, reason: 'Failed to parse agent output' };
    }

    if (!Array.isArray(messages)) {
      return { score: 0.0, reason: 'Agent output is not an array' };
    }

    const found = messages
      .filter(isAgentMessage)
      .filter((msg) => msg.type === 'assistant')
      .some((msg) => {
        if (!Array.isArray(msg.message?.content)) return false;
        return msg.message!.content.some((block) => {
          if (!isToolUseBlock(block)) return false;
          return block.name === 'Skill' && block.input['skill'] === this.skillName;
        });
      });

    return found
      ? { score: 1.0, reason: `Skill '${this.skillName}' was invoked` }
      : { score: 0.0, reason: `Skill '${this.skillName}' was not invoked` };
  }
}
