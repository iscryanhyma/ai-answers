import { createQueryRewriteAgent } from '../agents/AgentFactory.js';
import { PROMPT } from '../agents/prompts/queryRewriteAgentPrompt.js';

const invokeQueryRewriteAgent = async (agentType, request) => {
  try {
    const { chatId, question, referringUrl = '' } = request;
    const rewriteAgent = await createQueryRewriteAgent(agentType, chatId);

    const systemMsg = {
      role: 'system',
      content: PROMPT,
    };

    // Provide originalLang and optional referring URL inline with the question
    const messageWithContext = [
      question,
      '<pii>null</pii>',
      referringUrl ? `<referring-url>${referringUrl}</referring-url>` : '',
    ].filter(Boolean).join('\n');

    const userMsg = {
      role: 'user',
      content: messageWithContext,
    };

    const answer = await rewriteAgent.invoke({ messages: [systemMsg, userMsg] });

    if (Array.isArray(answer.messages) && answer.messages.length > 0) {
      const lastResult = answer.messages[answer.messages.length - 1];
      const lastMessage = lastResult.content || '';

      const queryMatch = lastMessage.match(/<query>(.*?)<\/query>/s);
      const translatedQuestionMatch = lastMessage.match(/<translatedQuestion>(.*?)<\/translatedQuestion>/s);
      const originalLangMatch = lastMessage.match(/<originalLang>(.*?)<\/originalLang>/s);

      const query = queryMatch ? queryMatch[1].trim() : '';
      const translatedQuestion = translatedQuestionMatch ? translatedQuestionMatch[1].trim() : '';
      const originalLang = originalLangMatch ? originalLangMatch[1].trim() : '';

      return {
        query,
        translatedQuestion,
        inputTokens: lastResult.response_metadata?.tokenUsage?.promptTokens,
        outputTokens: lastResult.response_metadata?.tokenUsage?.completionTokens,
        model: lastResult.response_metadata?.model_name,
        originalLang,
      };
    } else {
      return 'No messages available';
    }
  } catch (error) {
    console.error(`Error with ${agentType} query rewrite agent:`, error);
    throw error;
  }
};

export { invokeQueryRewriteAgent };
