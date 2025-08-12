export const PROMPT = `
Step 1. DETERMINE LANGUAGE AND CHECK FOR PII
- QUESTION_LANGUAGE: determine language of the question. 
- ALWAYS OUTPUT question language in ISO two-letter format wrapped in <originalLang> tags (eg. <originalLang>en</originalLang> or <originalLang>fr</originalLang> or <originalLang>ar</originalLang>)
- PII: check for personal identifying information (PII) in the question, particularly for people's names or country of residence/citizenship so that it can be redacted and replaced. Destination countries for travel questions can't be used to identify the person asking the question, so are not PII.
- OUTPUT the type of PII in upper case (not the PII itself),wrapped in <pii> tags (eg. <pii>NAME</pii> or <pii>NAME,COUNTRY</pii>) or <pii>null</pii> if no PII is found.
- This step is complete after <originalLang> and <pii> tags are output.

Step 2. TRANSLATE QUESTION AND REDACT PII
- If <originalLang> is not en or fr: TRANSLATE the question into English AND redact any PII found in <pii> tags, replacing it with the type of PII (eg. replace "Mein Name ist Klaus Weber" with "My name is NAME").
- If <originalLang> is en or fr: KEEP the question in the original French or English AND redact any PII found in <pii> tags, replacing it with the type of PII (eg. replace "My husband Paul Smith" with "My husband NAME", or replace "I'm China passport holder" with "I'm COUNTRY passport holder"). 
- ALWAYS OUTPUT the translated or original en or fr question, with PII redacted if found, wrapped in <translatedQuestion> tags.  
- This step is complete after <translatedQuestion> is output.

Step 3. CRAFT SEARCH QUERY
- GOOGLE_SEARCH_QUERY: craft the <translatedQuestion> into a search query compatible with Google Canada search on Government of Canada domains. 
- if <originalLang> is fr, craft the search query from <translatedQuestion> in French, otherwise craft the search query in English.
- Use keywords, shorten as needed and apply good search query design.
- CONTEXT FROM REFERRING URL: If a referring URL is provided, use it to add context to the search query. For example:
  * If user is on a passport page and mentions "my application", include "passport" in the search query
  * If user is on a tax page and mentions "my return", include "tax return" in the search query
  * If user is on a benefits page and mentions "my payment", include the specific benefit type in the search query
- Do not include redacted PII types (eg. "I'm COUNTRY passport holder. Do I need a visa" search query would be "find out if need visa", or "Je suis NAME, Je dois faire une demande RPC" search query would be "faire une demande RPC" ). 
- Never include a site: or domain: in the search query. They are added in the next step of the search query process. 
- Context: the query results will be used to help the next agent answer the user's question in Canada's official languages of English or French.
- OUTPUT the crafted search query wrapped in <query> tags. This step is complete after <query> is output.

`;