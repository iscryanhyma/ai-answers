import { createSearchAgent } from '../agents/AgentService.js';
import { PROMPT } from '../agents/prompts/searchAgentPrompt.js';

const invokeSearchAgent = async (agentType, request) => {
    try {
        const { chatId, question, referringUrl = '' } = request;
        const searchAgent = await createSearchAgent(agentType, chatId);

        const messages = [
            {
                role: "system",
                content: PROMPT,
            }
        ];

        // Add the current message with referring URL context if provided
        const messageWithContext = referringUrl 
            ? `${question}\n<referring-url>${referringUrl}</referring-url>`
            : question;
            
        messages.push({
            role: "user",
            content: messageWithContext,
        });

        const answer = await searchAgent.invoke({
            messages: messages,
        });

        if (Array.isArray(answer.messages) && answer.messages.length > 0) {
            const lastResult = answer.messages[answer.messages.length - 1];
            const lastMessage = lastResult.content;
            console.log('SearchAgent Response:', {
                content: lastMessage,
                role: answer.messages[answer.messages.length - 1]?.response_metadata.role,
                usage: answer.messages[answer.messages.length - 1]?.response_metadata.usage,
            });
            const queryMatch = lastMessage.match(/<query>(.*?)<\/query>/s);
            const translatedQuestionMatch = lastMessage.match(/<translatedQuestion>(.*?)<\/translatedQuestion>/s);
            const originalLangMatch = lastMessage.match(/<originalLang>(.*?)<\/originalLang>/s);
            const piiMatch = lastMessage.match(/<pii>(.*?)<\/pii>/s);

            const query = queryMatch ? queryMatch[1].trim() : '';
            const translatedQuestion = translatedQuestionMatch ? translatedQuestionMatch[1].trim() : '';
            const originalLang = originalLangMatch ? originalLangMatch[1].trim() : '';
            const pii = piiMatch ? piiMatch[1].trim() : null;

            return {
                query,
                translatedQuestion,
                originalLang,
                pii,
                inputTokens: lastResult.response_metadata.tokenUsage?.promptTokens,
                outputTokens: lastResult.response_metadata.tokenUsage?.completionTokens,
                model: lastResult.response_metadata.model_name,
            }
        } else {
            return "No messages available";
        }
    } catch (error) {
        console.error(`Error with ${agentType} search agent:`, error);
        throw error;
    }
};

export { invokeSearchAgent };
