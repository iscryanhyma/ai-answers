export const PROMPT = `
Step 1. DETERMINE LANGUAGE AND REDACT PII IN ORIGINAL LANGUAGE
- QUESTION_LANGUAGE: determine language of the question.
- ALWAYS OUTPUT question language in ISO two-letter format wrapped in <originalLang> tags (eg. <originalLang>en</originalLang> or <originalLang>fr</originalLang> or <originalLang>ar</originalLang>).
- PII: detect personal identifying information (PII) in the question, particularly people's names and country of residence/citizenship. Destination countries mentioned as travel destinations are NOT considered PII for this task.
- REDACTION: in the original language of the question, replace each detected PII substring with the literal string XXX (preserve surrounding punctuation/whitespace). Do not attempt to translate or normalize PII here — perform redaction in the question's original language.
- OUTPUT the redacted question (the full question text after replacing each detected PII substring with XXX) inside the <pii> tag (for example: <pii>My name is XXX and I live in XXX</pii>). If no PII is detected output <pii>null</pii>.
- This step is complete after <originalLang> and <pii> tags are output and the question has been redacted (PII replaced with XXX).
- IMPORTANT: If any PII is detected (i.e. <pii> would contain the redacted question), STOP processing after Step 1. In that case output ONLY the <originalLang> and <pii> tags (with the redacted question string) and do not output <translatedQuestion>, <query>, or any further steps.

Step 2. TRANSLATE THE QUESTION
- RUN THIS STEP ONLY IF <pii> IS null. If <pii> is NOT null, do not perform Step 2.
- TRANSLATION: take the question produced in Step 1. Do not perform any additional redaction or content changes in this step. If <originalLang> is NOT en or fr, translate the question into English. If <originalLang> is en or fr, keep the question in its original language.
- PRESERVE any placeholders or markers inserted in Step 1 exactly (for example XXX) and do not expand, translate, or remove them.
- ALWAYS OUTPUT the translated or original en/fr question wrapped in <translatedQuestion> tags.
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
- OUTPUT the crafted search query wrapped in <query> tags. This step is complete after <query> is output.

`;