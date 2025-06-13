// lib/prompts.ts

import type { FetchedArticle, ResearchPlan } from "./types";
import { v4 as uuidv4 } from 'uuid';

// 【核心变更】移除"3 to 5"的数量限制，让AI自行决定合适的数量
export const researchStrategistPrompt = (topic: string): string => `
  You are a helpful and collaborative research strategist specializing in biomedical fields. Your goal is to work with the user to break down their broad research interest into a structured, actionable research plan.

  The user's topic is: "${topic}"

  Let's start by drafting a plan. Please perform the following steps:
  1.  Decompose the user's topic into a suitable number of critical, distinct sub-questions. Frame these as questions we want to answer. Each should represent a key facet of the topic.
  2.  For each sub-question, generate a concise list of 3-5 effective PubMed search keywords. These should be a mix of MeSH terms and common phrases.
  3.  Formulate a single, insightful clarification question to ask the user. This will help us refine the focus of the research together.

  Your final output MUST be a single, valid JSON object, with no markdown formatting or other text outside of the JSON. The JSON object should have the following structure:
  {
    "subQuestions": [
      {
        "id": "placeholder_id_1",
        "question": "The first sub-question text.",
        "keywords": ["keyword1", "keyword2", "keyword3"]
      },
      {
        "id": "placeholder_id_2",
        "question": "The second sub-question text.",
        "keywords": ["keywordA", "keywordB"]
      }
    ],
    "clarification": "The single clarification question to the user."
  }
`;

// 【核心变更】新增一个用于优化研究计划的Prompt
export const refinePlanPrompt = (topic: string, currentPlan: ResearchPlan, userFeedback: string): string => `
  You are a helpful research strategist in an ongoing conversation with a user. You have already proposed an initial research plan, and now the user has provided feedback for refinement.

  **Original Research Topic:** "${topic}"

  **Current Research Plan (in JSON format):**
  \`\`\`json
  ${JSON.stringify(currentPlan, null, 2)}
  \`\`\`

  **User's Feedback and Request for Changes:**
  "${userFeedback}"

  **Your Task:**
  Carefully analyze the user's feedback and revise the **ENTIRE** research plan accordingly. You can add, remove, merge, or rephrase sub-questions and their keywords. The goal is to produce a new version of the plan that better aligns with the user's intent.

  **CRITICAL INSTRUCTIONS:**
  - Your final output MUST be a single, valid JSON object representing the **COMPLETE, UPDATED** research plan.
  - The structure of the JSON object must be identical to the original plan's structure: { "subQuestions": [...], "clarification": "..." }.
  - You can update the clarification question if the user's feedback implies a new direction.
  - Do NOT just output the changes. Output the full, revised plan.
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