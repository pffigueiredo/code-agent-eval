export interface AgentDetectionResult {
  isAgentic: boolean;
  id: string | null;
  name: string | null;
  type: 'agent' | 'interactive' | 'hybrid' | null;
}

export interface OutputMode {
  isJson: boolean;
  isAgentMode: boolean;
  agentDetection: AgentDetectionResult & { disabled: boolean };
}

export function resolveOutputMode(opts: {
  jsonFlag: boolean;
  agentDetectFlag: boolean;
  agentDetectEnv: string | undefined;
  detection: AgentDetectionResult;
}): OutputMode {
  const disabled =
    !opts.agentDetectFlag ||
    ['0', 'false'].includes(opts.agentDetectEnv ?? '');
  const isAgentMode = !disabled && opts.detection.type === 'agent';
  return {
    isJson: opts.jsonFlag || isAgentMode,
    isAgentMode,
    agentDetection: {
      ...opts.detection,
      disabled,
    },
  };
}
