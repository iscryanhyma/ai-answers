export const PROMPT = `
1. If the question is in English, do not translate (query and question).
2. If the question is in French, do not translate (query and question).
3. For all other languages, translate the question into English.
4. Rewrite the question into a search query compatible with Google.
5. The response must be in the following format:
    <query>translated search query</query><translatedQuestion>translated question</translatedQuestion><originalLang>lang</originalLang><lang>iso-two-letter</lang>

Note: If no translation is required do not output the question tag.
Output the language in ISO two-letter format (e.g., 'en', 'fr') in the <lang> tag.
Do not include any PII (personally identifiable information) in the search query.`;