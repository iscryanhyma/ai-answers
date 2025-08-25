import ContextService from '../services/ContextService.js';
import AnswerService from '../services/AnswerService.js';
import DataStoreService from '../services/DataStoreService.js';
import { urlToSearch } from '../utils/urlToSearch.js';
import RedactionService from '../services/RedactionService.js';
import LoggingService from '../services/ClientLoggingService.js';

import { RedactionError, ShortQueryValidation, WorkflowStatus } from '../services/ChatWorkflowService.js';

export class DefaultWithVector {
  constructor() {}

  sendStatusUpdate(onStatusUpdate, status) {
    const displayableStatuses = [
      WorkflowStatus.MODERATING_QUESTION,
      WorkflowStatus.SEARCHING,
      WorkflowStatus.GENERATING_ANSWER,
      WorkflowStatus.VERIFYING_CITATION,
      WorkflowStatus.MODERATING_ANSWER,
      WorkflowStatus.ERROR,
      WorkflowStatus.NEED_CLARIFICATION
    ];
    if (onStatusUpdate && displayableStatuses.includes(status)) {
      onStatusUpdate(status);
    }
  }

  countWords(text) {
    if (!text || typeof text !== 'string') return 0;
    const words = text.trim().split(/\s+/);
    return Math.min(words.length, 4);
  }

  isShortQuery(wordCount) {
    return wordCount <= 2;
  }

  hasAnyLongUserMessage(conversationHistory) {
    return conversationHistory.some(m => m.sender === 'user' && !m.error && this.countWords(m.text) > 2);
  }

  validateShortQueryOrThrow(conversationHistory, userMessage, lang, department, translationF) {
    const wordCount = this.countWords(userMessage);
    if (!this.hasAnyLongUserMessage(conversationHistory) && this.isShortQuery(wordCount)) {
      const searchUrl = urlToSearch.generateFallbackSearchUrl(lang, userMessage, department, translationF);
      throw new ShortQueryValidation('Short query detected', userMessage, searchUrl.fallbackUrl);
    }
  }

  async processRedaction(userMessage, lang) {
    await RedactionService.ensureInitialized(lang);
    const { redactedText, redactedItems } = RedactionService.redactText(userMessage, lang);
    const hasBlockedContent = redactedText.includes('#') || redactedText.includes('XXX');
    if (hasBlockedContent) {
      throw new RedactionError('Blocked content detected', redactedText, redactedItems);
    }
  }

  async verifyCitation(originalCitationUrl, lang, redactedText, selectedDepartment, t, chatId = null) {
    const validationResult = await urlToSearch.validateAndCheckUrl(
      originalCitationUrl,
      lang,
      redactedText,
      selectedDepartment,
      t,
      chatId
    );
    await LoggingService.info(chatId, 'Validated URL:', validationResult);
    return validationResult;
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
    this.sendStatusUpdate(onStatusUpdate, WorkflowStatus.MODERATING_QUESTION);

    this.validateShortQueryOrThrow(conversationHistory, userMessage, lang, department, translationF);

    await this.processRedaction(userMessage, lang);
  await LoggingService.info(chatId, 'Starting DefaultWithVector with data:', {
      userMessage,
      lang,
      department,
      referringUrl,
      selectedAI,
    });

    let context = null;
    conversationHistory = conversationHistory.filter((message) => !message.error);
    conversationHistory = conversationHistory.filter((message) => message.sender === 'ai');
    if (
      conversationHistory.length > 0 &&
      !conversationHistory[conversationHistory.length - 1].interaction.answer.answerType.includes('question')
    ) {
      const lastMessage = conversationHistory[conversationHistory.length - 1];
      context = lastMessage.interaction.context;
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

    this.sendStatusUpdate(onStatusUpdate, WorkflowStatus.GENERATING_ANSWER);

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
      this.sendStatusUpdate(onStatusUpdate, WorkflowStatus.VERIFYING_CITATION);
      const citationResult = await this.verifyCitation(
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
      this.sendStatusUpdate(onStatusUpdate, WorkflowStatus.NEED_CLARIFICATION);
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
      referringUrl:referringUrl,
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
