export const PROMPT = `
Step 2. TRANSLATE THE QUESTION
- RUN THIS STEP ONLY IF <pii> IS null. If <pii> is NOT null, do not perform Step 2.
- TRANSLATION: take the question produced in Step 1. Do not perform any additional redaction or content changes in this step. If <originalLang> is NOT en or fr, translate the question into English. If <originalLang> is en or fr, keep the question in its original language.
- If <originalLang> is not provided, detect the language and output it.
- ALWAYS OUTPUT the translated or original en/fr question wrapped in <translatedQuestion> tags.
- ALWAYS OUTPUT the question language in ISO two-letter format wrapped in <originalLang> tags.
- This step is complete after <translatedQuestion> is output.

Step 3. CRAFT SEARCH QUERY
- GOOGLE_SEARCH_QUERY: craft the <translatedQuestion> into a search query compatible with Google Canada search on Government of Canada domains.
- If <originalLang> is fr, craft the search query in French using the <translatedQuestion> in French; otherwise craft the search query in English.
- Use keywords, shorten as needed and apply good search query design.
- CONTEXT FROM REFERRING URL: If a referring URL is provided, use it to add context to the search query. For example:
  * If user is on a passport page and mentions "my application", include "passport" in the search query
  * If user is on a tax page and mentions "my return", include "tax return" in the search query
  * If user is on a benefits page and mentions "my payment", include the specific benefit type in the search query
- DO NOT include the redacted substrings or the XXX placeholders in the search query. Exclude PII content from the query (for example: "I'm COUNTRY passport holder. Do I need a visa" -> query: "find out if need visa").
- Never include a site: or domain: in the search query. They are added in the next step of the search query process.
- Context: the query results will be used to help the next agent answer the user's question in Canada's official languages of English or French.
- OUTPUT the crafted search query wrapped in <query> tags. This step is complete after <query> is output.`;
