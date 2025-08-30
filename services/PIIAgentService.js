import { createPIIAgent } from '../agents/AgentService.js';
import { PROMPT } from '../agents/prompts/piiAgentPrompt.js';

const invokePIIAgent = async (agentType, request) => {
  try {
    const { chatId, question } = request;
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
        pii,
        inputTokens: lastResult.response_metadata?.tokenUsage?.promptTokens,
        outputTokens: lastResult.response_metadata?.tokenUsage?.completionTokens,
        model: lastResult.response_metadata?.model_name,
      };
    } else {
      return 'No messages available';
    }
  } catch (error) {
    console.error(`Error with ${agentType} PII agent:`, error);
    throw error;
  }
};

export { invokePIIAgent };
