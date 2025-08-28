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

      const piiMatch = lastMessage.match(/<pii>(.*?)<\/pii>/s);
      const pii = piiMatch ? piiMatch[1].trim() : null;

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
