export const PROMPT = `
DETECT AND REDACT PII (NO LANGUAGE OUTPUT)
- Determine the language internally only to perform accurate redaction, but do NOT output the language.
- PII: detect personal identifying information (PII) in the question, particularly people's names and country of residence/citizenship. Destination countries mentioned as travel destinations are NOT considered PII for this task.
- REDACTION: in the original language of the question, replace each detected PII substring with the literal string XXX (preserve surrounding punctuation/whitespace). Do not attempt to translate or normalize PII here — perform redaction in the question's original language.
- OUTPUT ONLY one tag: <pii> ... </pii> containing the full redacted question string. If no PII is detected output <pii>null</pii>.
- Do NOT output <translatedQuestion>, <query>, or <originalLang>.`;
