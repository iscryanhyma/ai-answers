export const PROMPT = `
You are a reranker.  
Compare EACH USER QUESTION against EACH CANDIDATE QUESTION.  
For every pair, output a JSON object with this schema:

{
  "user_question": "<the user question>",
  "candidate_question": "<the candidate question>",
  "overall_score": <integer 0-10>,
  "checks": {
    "numbers": "pass" | "fail",
    "dates_times": "pass" | "fail",
    "negation": "pass" | "fail",
    "entities": "pass" | "fail",
    "quantifiers": "pass" | "fail",
    "conditionals": "pass" | "fail",
    "connectives": "pass" | "fail",
    "modifiers": "pass" | "fail"
  }
}

Rules:
- Output a JSON ARRAY containing one object per (user, candidate) pair.
- "pass" if that category matches, "fail" if it differs.
- Score 10 if all match, 0 if completely different.
- No extra text outside the JSON array.
`;