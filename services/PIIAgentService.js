import { createPIIAgent } from '../agents/AgentFactory.js';
import { PROMPT } from '../agents/prompts/piiAgentPrompt.js';
import ServerLoggingService from './ServerLoggingService.js';

const invokePIIAgent = async (agentType, request) => {
  const { chatId, question } = request;
  try {

    const piiAgent = await createPIIAgent(agentType, chatId);

    const messages = [
      {
        role: 'system',
        content: PROMPT,
      },
      {
        role: 'user',
        content: question,
      },
    ];

    const answer = await piiAgent.invoke({ messages });

    if (Array.isArray(answer.messages) && answer.messages.length > 0) {
      const lastResult = answer.messages[answer.messages.length - 1];
      const lastMessage = lastResult.content || '';

      // Check finish_reason and return blocked if not "stop"
      const finishReason = lastResult.response_metadata?.finish_reason;
      if (finishReason && finishReason !== 'stop') {
        return {
          pii: null,
          blocked: true,
          inputTokens: lastResult.response_metadata?.tokenUsage?.promptTokens,
          outputTokens: lastResult.response_metadata?.tokenUsage?.completionTokens,
          model: lastResult.response_metadata?.model_name,
        };
      }

      const piiMatch = lastMessage.match(/<pii>(.*?)<\/pii>/s);
      let pii = piiMatch ? piiMatch[1].trim() : null;
      if (pii === 'null') {
        pii = null;
      }

      return {
        blocked: false,
        pii,
        inputTokens: lastResult.response_metadata?.tokenUsage?.promptTokens,
        outputTokens: lastResult.response_metadata?.tokenUsage?.completionTokens,
        model: lastResult.response_metadata?.model_name,
      };
    } else {
      return 'No messages available';
    }
  } catch (err) {
    // Azure content filter commonly throws 400 with an error message/code.
    const status = err?.response?.status;
    const dataErr = err?.response?.data?.error;
    const code = (dataErr?.code || err?.code || '').toString().toLowerCase();
    const msg = dataErr?.message || err?.message || '';


    const contentFilter =
      (
        code.includes('content_filter') ||
        code.includes('content_policy') ||
        /response was filtered due to the prompt triggering Azure OpenAI/i.test(msg)
      );
    ServerLoggingService.error("contentFilter", chatId, { contentFilter, status, code, msg });
    if (contentFilter) {
      const usage = err?.response?.data?.usage || {};
      return {
        pii: null,
        blocked: true,
        inputTokens: usage.prompt_tokens ?? null,
        outputTokens: usage.completion_tokens ?? null,
        model: err?.response?.data?.model ?? null,
      };
    }

    throw err;
  }
};

export { invokePIIAgent };
