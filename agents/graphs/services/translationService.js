import { AgentOrchestratorService } from '../../../agents/AgentOrchestratorService.js';
import { createTranslationAgent } from '../../../agents/AgentFactory.js';
import { translationStrategy } from '../../../agents/strategies/translationStrategy.js';

export async function translateQuestion({ text, desiredLanguage, selectedAI = 'openai', chatId = 'translate' }) {
  const createAgentFn = async (agentType, id) => {
    return createTranslationAgent(agentType, id);
  };

  const response = await AgentOrchestratorService.invokeWithStrategy({
    chatId,
    agentType: selectedAI,
    request: { text, desired_language: desiredLanguage },
    createAgentFn,
    strategy: translationStrategy,
  });

  if (!response) {
    return {
      originalLanguage: null,
      translatedLanguage: desiredLanguage,
      translatedText: text,
      noTranslation: true,
      originalText: text,
    };
  }

  if (response.noTranslation === true) {
    return {
      originalLanguage: response.originalLanguage || null,
      translatedLanguage: desiredLanguage,
      translatedText: text,
      noTranslation: true,
      originalText: text,
    };
  }

  return {
    ...response,
    originalText: text,
  };
}
