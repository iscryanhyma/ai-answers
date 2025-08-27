// src/ContextService.js
import loadContextSystemPrompt from './contextSystemPrompt.js';
import { getProviderApiUrl, getApiUrl } from '../utils/apiToUrl.js';
import LoggingService from './ClientLoggingService.js';
import { RedactionError } from './ChatWorkflowService.js';


const ContextService = {
  prepareMessage: async (
    message,
    lang = 'en',
    department = '',
    referringUrl = '',
    searchResults = null,
    searchProvider = null,
    conversationHistory = [],
    chatId = 'system'
  ) => {
    await LoggingService.info(
      chatId,
      `Context Service: Processing message in ${lang.toUpperCase()}`
    );

    const SYSTEM_PROMPT = await loadContextSystemPrompt(lang, department);
    const messageWithReferrer = `${message}${referringUrl ? `\n<referring-url>${referringUrl}</referring-url>` : ''}`;

    return {
      message: messageWithReferrer,
      systemPrompt: SYSTEM_PROMPT,
      searchResults,
      searchProvider,
      conversationHistory,
      referringUrl,
      chatId,
    };
  },

  sendMessage: async (
    aiProvider,
    message,
    lang = 'en',
    department = '',
    referringUrl,
    searchResults,
    searchProvider,
    conversationHistory = [],
    chatId = 'system'
  ) => {
    try {
      const messagePayload = await ContextService.prepareMessage(
        message,
        lang,
        department,
        referringUrl,
        searchResults,
        searchProvider,
        conversationHistory,
        chatId
      );
      await LoggingService.info(chatId, 'Calling context agent with:', { context: messagePayload });
      let url = getProviderApiUrl(aiProvider, 'context');
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messagePayload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        await LoggingService.error(chatId, 'Context API error response:', { errorText });
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      await LoggingService.error(chatId, 'Error calling Context API:', error);
      throw error;
    }
  },

  contextSearch: async (message, searchProvider, lang = 'en', chatId = 'system', agentType = 'openai', referringUrl = '') => {
    try {
      const searchResponse = await fetch(getApiUrl('search-context'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message,
          lang: lang,
          searchService: searchProvider,
          chatId,
          agentType,
          referringUrl,
        }),
      });

      if (!searchResponse.ok) {
        const errorText = await searchResponse.text();
        await LoggingService.error(chatId, 'Search API error response:', { errorText });
        throw new Error(`HTTP error! status: ${searchResponse.status}`);
      }

      return await searchResponse.json();
    } catch (error) {
      await LoggingService.error(chatId, 'Error searching context:', error);
      throw error;
    }
  },
  deriveContext: async (
    aiProvider,
    question,
    lang = 'en',
    department = '',
    referringUrl,
    searchProvider,
    conversationHistory = [],
    chatId = 'system',
    
  ) => {
    try {
      await LoggingService.info(
        chatId,
        `Context Service: Analyzing question: page lang: ${lang}: ${JSON.stringify(question)}`
      );
      const searchResults = await ContextService.contextSearch(
        question,
        searchProvider,
        lang,
        chatId,
        aiProvider,
        referringUrl
      );
      await LoggingService.info(
        chatId,
        "Context Service: Agent Search completed:",searchResults
      );
      // Extract agent values from searchResults
      const { query: searchQuery, translatedQuestion, originalLang, pii = null } = searchResults;

      // If the search agent returned PII (redacted question in <pii>), throw RedactionError to stop processing
      if (pii && String(pii).toLowerCase() !== 'null' && String(pii).trim() !== '') {
        await LoggingService.info(chatId, 'Context Service: PII detected, throwing RedactionError', { pii });
        // Per request: use the pii (redacted question with XXX) as redactedText and leave redactedItems as null
        throw new RedactionError('PII detected in user message', pii, null);
      }
      const parsedContext = ContextService.parseContext(
        await ContextService.sendMessage(
          aiProvider,
          question,
          lang,
          department,
          referringUrl,
          searchResults.results,
          searchProvider,
          conversationHistory,
          chatId
        )
      );
      // Add agent values to context object
      return {
        ...parsedContext,
        searchQuery,
        translatedQuestion,
        originalLang
      };
    } catch (error) {
      await LoggingService.error(chatId, 'Error deriving context:', error);
      throw error;
    }
  },
  parseContext: (context) => {
    const topicMatch = context.message.match(/<topic>([\s\S]*?)<\/topic>/);
    const topicUrlMatch = context.message.match(/<topicUrl>([\s\S]*?)<\/topicUrl>/);
    const departmentMatch = context.message.match(/<department>([\s\S]*?)<\/department>/);
    const departmentUrlMatch = context.message.match(/<departmentUrl>([\s\S]*?)<\/departmentUrl>/);

    return {
      topic: topicMatch ? topicMatch[1] : null,
      topicUrl: topicUrlMatch ? topicUrlMatch[1] : null,
      department: departmentMatch ? departmentMatch[1] : null,
      departmentUrl: departmentUrlMatch ? departmentUrlMatch[1] : null,
      searchResults: context.searchResults,
      searchProvider: context.searchProvider,
      model: context.model,
      inputTokens: context.inputTokens,
      outputTokens: context.outputTokens,
    };
  },
  
};

export default ContextService;
