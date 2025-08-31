import ServerLoggingService from '../services/ServerLoggingService.js';

class AgentOrchestratorServiceClass {
  async invokeWithStrategy({
    chatId = 'system',
    agentType = 'openai',
    request = {},
    createAgentFn, // (agentType, chatId) => agent
    strategy,
  }) {
    if (!createAgentFn) throw new Error('createAgentFn is required');
    if (!strategy || typeof strategy.buildMessages !== 'function' || typeof strategy.parse !== 'function') {
      throw new Error('strategy with buildMessages and parse is required');
    }

    try {
      const agent = await createAgentFn(agentType, chatId);
      const messages = strategy.buildMessages(request);

      const answer = await agent.invoke({ messages });

      // LangGraph/LLM response shape with { messages: [...] }
      const lastResult = Array.isArray(answer?.messages) && answer.messages.length
        ? answer.messages[answer.messages.length - 1]
        : null;

      if (!lastResult) {
        if (typeof ServerLoggingService?.warn === 'function') {
          ServerLoggingService.warn('No messages returned by agent', chatId);
        }
        return { error: 'no_messages' };
      }

      // Minimal unified metadata extraction
      const meta = lastResult.response_metadata || {};
      const tokenUsage = meta.tokenUsage || meta.usage || {};
      const normalized = {
        content: lastResult.content,
        model: meta.model_name || meta.model || null,
        inputTokens: tokenUsage.promptTokens ?? tokenUsage.prompt_tokens ?? null,
        outputTokens: tokenUsage.completionTokens ?? tokenUsage.completion_tokens ?? null,
        raw: lastResult,
      };

      const parsed = await strategy.parse(normalized, request);

      // Attach common telemetry fields if not provided
      if (parsed && typeof parsed === 'object') {
        return {
          ...parsed,
          model: parsed.model ?? normalized.model,
          inputTokens: parsed.inputTokens ?? normalized.inputTokens,
          outputTokens: parsed.outputTokens ?? normalized.outputTokens,
        };
      }
      return parsed;
    } catch (err) {
      if (typeof ServerLoggingService?.error === 'function') {
        ServerLoggingService.error('Agent orchestrator error', chatId, err);
      }
      if (typeof strategy.onError === 'function') {
        const mapped = await strategy.onError(err, request);
        if (mapped !== undefined) return mapped;
      }
      throw err;
    }
  }
}

export const AgentOrchestratorService = new AgentOrchestratorServiceClass();
export { AgentOrchestratorServiceClass };
export default AgentOrchestratorService;
