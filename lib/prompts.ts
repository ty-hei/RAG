// lib/prompts.ts

import type { FetchedArticle, ResearchPlan } from "./types";

export const researchStrategistPrompt = (topic: string): string => `
  You are a highly skilled research strategist specializing in biomedical fields. Your task is to break down a user's broad research interest into a structured, actionable research plan.

  The user's topic is: "${topic}"

  Please perform the following steps:
  1.  Decompose the user's topic into 3 to 5 critical, distinct sub-questions. Each sub-question should represent a key facet of the topic that is worth investigating.
  2.  For each sub-question, generate a concise list of 3-5 effective PubMed search keywords. These keywords should be a mix of MeSH terms and common phrases, designed to yield relevant results.
  3.  Formulate a single, insightful clarification question to ask the user. This question should help narrow the focus of the research, for example, by asking about a specific population, intervention, or outcome.

  Your final output MUST be a single, valid JSON object, with no markdown formatting or other text outside of the JSON. The JSON object should have the following structure:
  {
    "subQuestions": [
      {
        "question": "The first sub-question text.",
        "keywords": ["keyword1", "keyword2", "keyword3"]
      },
      {
        "question": "The second sub-question text.",
        "keywords": ["keywordA", "keywordB"]
      }
    ],
    "clarification": "The single clarification question to the user."
  }
`;

export const literatureReviewerPrompt = (plan: ResearchPlan, articles: FetchedArticle[]): string => `
  You are a meticulous medical literature reviewer. Your task is to evaluate a list of article abstracts based on their relevance to a given research plan.

  The research plan is as follows:
  - Main Topic: "${plan.clarification}" 
  - Sub-questions:
    ${plan.subQuestions.map(sq => `- ${sq.question}`).join('\n    ')}

  Here are the articles you need to evaluate:
  ${articles.map(article => `
  <article>
    <pmid>${article.pmid}</pmid>
    <title>${article.title}</title>
    <abstract>${article.abstract}</abstract>
  </article>
  `).join('\n')}

  Please evaluate each article and provide a relevance score from 1 (not relevant) to 10 (highly relevant). Also, provide a single, concise sentence explaining your reasoning for the score.

  Your final output MUST be a single, valid JSON object, with no markdown formatting or other text outside of the JSON. The JSON object should be an array, where each item corresponds to an article and has the following structure:
  [
    {
      "pmid": "The PMID of the article",
      "score": 8,
      "reason": "The concise reason for the score."
    },
    {
      "pmid": "Another PMID",
      "score": 3,
      "reason": "Another reason."
    }
  ]
`;

// 新增：研究综述员Prompt
export const synthesisWriterPrompt = (plan: ResearchPlan, fullTexts: { pmid: string, text: string }[]): string => `
  You are a top-tier medical researcher and writer. Your task is to synthesize the information from the provided full-text articles into a cohesive, structured, and insightful literature review.

  The research is guided by the following plan:
  - Main Topic/Clarification: "${plan.clarification}"
  - Key Sub-questions to address:
    ${plan.subQuestions.map((sq, i) => `${i + 1}. ${sq.question}`).join('\n    ')}

  Here are the full texts of the selected articles. Each article is tagged with its PMID.
  ${fullTexts.map(doc => `
  <document pmid="${doc.pmid}">
    ${doc.text}
  </document>
  `).join('\n\n')}

  Please perform the following actions:
  1.  **Introduction**: Write a brief introduction that sets the context for the research topic based on the provided literature.
  2.  **Synthesis by Sub-question**: For each sub-question in the research plan, synthesize the findings from ALL relevant provided documents. Do not just summarize one paper at a time. Instead, integrate the information, highlight corroborating evidence, and note any contradictions or gaps.
  3.  **Conclusion**: Write a concise conclusion that summarizes the key findings and suggests potential future research directions.
  4.  **Citations**: CRITICALLY IMPORTANT: When you present a piece of information from a specific article, you MUST cite it immediately using its PubMed ID in the format [PMID:XXXXXX].

  Your final output MUST be a single, well-formatted Markdown document. Do not include any other text or explanations outside of the Markdown report itself.
`;