import ContextService from '../services/ContextService.js';
import AnswerService from '../services/AnswerService.js';
import DataStoreService from '../services/DataStoreService.js';
import LoggingService from '../services/ClientLoggingService.js';
import { getApiUrl } from '../utils/apiToUrl.js';
import AuthService from '../services/AuthService.js';

import { ChatWorkflowService, WorkflowStatus } from '../services/ChatWorkflowService.js';

export class DefaultWithVector {
  constructor() { }

  // Query the chat-similar-answer endpoint and return a short-circuit
  // response object if an answer is available. Returns null to continue
  // the normal workflow when no similar answer is found or an error occurs.
  async checkSimilarAnswer(chatId, userMessage, onStatusUpdate, selectedAI) {
    try {
      const similarResp = await AuthService.fetchWithAuth(getApiUrl('chat-similar-answer'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, question: userMessage, selectedAI })
      });
      if (similarResp && similarResp.ok) {
        const similarJson = await similarResp.json();
        if (similarJson && similarJson.answer) {
          await LoggingService.info(chatId, 'chat-similar-answer returned, short-circuiting workflow', {
            similar: similarJson
          });
          ChatWorkflowService.sendStatusUpdate(onStatusUpdate, WorkflowStatus.GENERATING_ANSWER);
          // Build an answer object that matches the UI's expected shape so
          // the message content is displayed. Prefer `paragraphs` (rendered
          // first), but also include `sentences` and `content` for safety.
          const answerText = similarJson.answer;
          return {
            answer: {
              answerType: 'external',
              content: answerText,
              paragraphs: [answerText],
              sentences: [answerText],
              // expose metadata for potential UI display
              providedByInteractionId: similarJson.interactionId || null,
              similarity: similarJson.similarity || null
            },
            context: null,
            question: userMessage,
            citationUrl: null,
            confidenceRating: similarJson.similarity || null
          };
        }
      } else {
        await LoggingService.info(chatId, 'chat-similar-answer call failed or returned no result', {
          status: similarResp && similarResp.status
        });
      }
    } catch (err) {
      await LoggingService.info(chatId, 'chat-similar-answer error, continuing workflow', { error: err && err.message });
    }
    return null;
  }


  async processResponse(
    chatId,
    userMessage,
    userMessageId,
    conversationHistory,
    lang,
    department,
    referringUrl,
    selectedAI,
    translationF,
    onStatusUpdate,
    searchProvider
  ) {
    const startTime = Date.now();
    ChatWorkflowService.sendStatusUpdate(onStatusUpdate, WorkflowStatus.MODERATING_QUESTION);

    ChatWorkflowService.validateShortQueryOrThrow(conversationHistory, userMessage, lang, department, translationF);

    await ChatWorkflowService.processRedaction(userMessage, lang);
    const similarShortCircuit = await this.checkSimilarAnswer(chatId, userMessage, onStatusUpdate, selectedAI);
    if (similarShortCircuit) {
      // Only run PII check when we are short-circuiting without deriving new context
      await ChatWorkflowService.checkPIIOnNoContextOrThrow(chatId, userMessage, selectedAI);
      return similarShortCircuit;
    }
    await LoggingService.info(chatId, 'Starting DefaultWithVector with data:', {
      lang,
      department,
      referringUrl,
      selectedAI,
    });

    let context = null;
    conversationHistory = conversationHistory.filter((message) => !message.error);
    conversationHistory = conversationHistory.filter((message) => message.sender === 'ai');
    const usedExistingContext = (
      conversationHistory.length > 0 &&
      !conversationHistory[conversationHistory.length - 1].interaction.answer.answerType.includes('question')
    );

    if (usedExistingContext) {
      const lastMessage = conversationHistory[conversationHistory.length - 1];
      context = lastMessage.interaction.context;
      // Only run PII check when we did NOT derive new context
      await ChatWorkflowService.checkPIIOnNoContextOrThrow(chatId, userMessage, selectedAI);
    } else {
      context = await ContextService.deriveContext(
        selectedAI,
        userMessage,
        lang,
        department,
        referringUrl,
        searchProvider,
        conversationHistory,
        chatId
      );
    }
    await LoggingService.info(chatId, 'Derived context:', { context });

  ChatWorkflowService.sendStatusUpdate(onStatusUpdate, WorkflowStatus.GENERATING_ANSWER);

    const answer = await AnswerService.sendMessage(
      selectedAI,
      userMessage,
      conversationHistory,
      lang,
      context,
      false,
      referringUrl,
      chatId
    );
    await LoggingService.info(chatId, 'Answer Received:', { answer });
    let finalCitationUrl,
      confidenceRating = null;

    if (answer.answerType === 'normal') {
  ChatWorkflowService.sendStatusUpdate(onStatusUpdate, WorkflowStatus.VERIFYING_CITATION);
      const citationResult = await ChatWorkflowService.verifyCitation(
        answer.citationUrl,
        lang,
        userMessage,
        department,
        translationF,
        chatId
      );
      finalCitationUrl = citationResult.url || citationResult.fallbackUrl;
      confidenceRating = citationResult.confidenceRating;
      await LoggingService.info(chatId, 'Citation validated:', {
        originalUrl: answer.citationUrl,
        finalCitationUrl,
        confidenceRating,
      });
    }

    if (answer.answerType && answer.answerType.includes('question')) {
  ChatWorkflowService.sendStatusUpdate(onStatusUpdate, WorkflowStatus.NEED_CLARIFICATION);
    }

    const endTime = Date.now();
    const totalResponseTime = endTime - startTime;
    await LoggingService.info(chatId, 'Total response time:', {
      totalResponseTime: `${totalResponseTime} ms`,
    });

    DataStoreService.persistInteraction({
      selectedAI: selectedAI,
      question: userMessage,
      userMessageId: userMessageId,
      referringUrl: referringUrl,
      answer: answer,
      finalCitationUrl: finalCitationUrl,
      confidenceRating: confidenceRating,
      context: context,
      chatId: chatId,
      pageLanguage: lang,
      responseTime: totalResponseTime,
      searchProvider: searchProvider
    });

    await LoggingService.info(chatId, 'workflow complete');
    return {
      answer: answer,
      context: context,
      question: userMessage,
      citationUrl: finalCitationUrl,
      confidenceRating: confidenceRating,
    };
  }
}
