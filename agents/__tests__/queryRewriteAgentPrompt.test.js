import { PROMPT } from '../prompts/queryRewriteAgentPrompt.js';
import { describe, it, expect } from 'vitest';

describe('queryRewriteAgentPrompt', () => {
  it('mentions translatedText and originalLanguage and <query> output', () => {
    expect(PROMPT).toContain('translatedQuestion');
    expect(PROMPT).toContain('originalLang');
    expect(PROMPT).toContain('<query>');
  });
});
