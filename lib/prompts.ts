// RAG-main/lib/prompts.ts

import type { FetchedArticle, FetchedClinicalTrial, ResearchPlan } from "./types";

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

export const searchRefinerPrompt = (plan: ResearchPlan, articles: FetchedArticle[]): string => `
  You are an expert research analyst. Your task is to determine if the current search results adequately cover all aspects of the user's research plan. If not, you must generate new search queries to fill the gaps.

  **Research Plan:**
  - Main Topic: "${plan.clarification}"
  - Sub-questions to address:
    ${plan.subQuestions.map((sq, i) => `${i + 1}. ${sq.question}`).join('\n    ')}

  **Current Search Results (first ${articles.length} titles and abstracts):**
  ${articles.map(article => `
  <article>
    <pmid>${article.pmid}</pmid>
    <title>${article.title}</title>
    <abstract>${article.abstract}</abstract>
  </article>
  `).join('\n')}

  **Your Analysis & Task:**
  1.  Review the sub-questions in the research plan.
  2.  Review the titles and abstracts of the articles found so far.
  3.  Identify any sub-questions that are **poorly covered** or **not covered at all** by the current results.
  4.  For each identified gap, formulate one or two new, specific, and effective PubMed search queries that are likely to find relevant articles. These queries can be more targeted than the initial broad search.
  5.  If you believe the current results are sufficient and all sub-questions are well-covered, return an empty array.

  **CRITICAL INSTRUCTIONS:**
  - Your final output MUST be a single, valid JSON object, with no markdown formatting or other text outside of the JSON.
  - The JSON object must have a single key "new_queries" which is an array of strings.
  - Example output: { "new_queries": ["(autism) AND (gut microbiota) AND (probiotics)", "serotonin pathway gut-brain axis"] }
  - If no new queries are needed, output: { "new_queries": [] }
`;

export const clinicalTrialSearchRefinerPrompt = (plan: ResearchPlan, trials: FetchedClinicalTrial[]): string => `
  You are an expert research analyst. Your task is to determine if the current clinical trial search results adequately cover all aspects of the user's research plan. If not, you must generate new search queries to fill the gaps.

  **Research Plan:**
  - Main Topic: "${plan.clarification}"
  - Sub-questions to address:
    ${plan.subQuestions.map((sq, i) => `${i + 1}. ${sq.question}`).join('\n    ')}

  **Current Clinical Trial Results (${trials.length} trials):**
  ${trials.map(trial => `
  <trial>
    <nctId>${trial.nctId}</nctId>
    <title>${trial.title}</title>
    <summary>${trial.summary}</summary>
    <conditions>${trial.conditions.join(', ')}</conditions>
  </trial>
  `).join('\n')}

  **Your Analysis & Task:**
  1.  Review the sub-questions in the research plan.
  2.  Review the titles, summaries, and conditions of the trials found so far.
  3.  Identify any sub-questions that are **poorly covered** or **not covered at all** by the current results.
  4.  For each identified gap, formulate one or two new, specific, and effective search queries for ClinicalTrials.gov.
  5.  If you believe the current results are sufficient and all sub-questions are well-covered, return an empty array.

  **CRITICAL INSTRUCTIONS:**
  - Your final output MUST be a single, valid JSON object, with no markdown formatting or other text outside of the JSON.
  - The JSON object must have a single key "new_queries" which is an array of strings.
  - Example output: { "new_queries": ["(metastatic breast cancer) AND (CDK4/6 inhibitor OR palbociclib)", "triple-negative breast cancer immunotherapy"] }
  - If no new queries are needed, output: { "new_queries": [] }
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

export const clinicalTrialReviewerPrompt = (plan: ResearchPlan, trials: FetchedClinicalTrial[]): string => `
  You are an expert clinical trial analyst. Your task is to evaluate a list of clinical trials based on their relevance to a given research plan.

  The research plan is as follows:
  - Main Topic: "${plan.clarification}" 
  - Sub-questions:
    ${plan.subQuestions.map(sq => `- ${sq.question}`).join('\n    ')}

  Here are the clinical trials you need to evaluate. Each has a title, summary, conditions, and interventions.
  ${trials.map(trial => `
  <trial>
    <nctId>${trial.nctId}</nctId>
    <title>${trial.title}</title>
    <status>${trial.status}</status>
    <summary>${trial.summary}</summary>
    <conditions>${trial.conditions.join(', ')}</conditions>
    <interventions>${trial.interventions.join(', ')}</interventions>
  </trial>
  `).join('\n')}

  Please evaluate each trial and provide a relevance score from 1 (not relevant) to 10 (highly relevant). Also, provide a single, concise sentence explaining your reasoning for the score, considering the trial's status, summary, and interventions in relation to the research questions.

  Your final output MUST be a single, valid JSON object, with no markdown formatting or other text outside of the JSON. The JSON object should be an array, where each item corresponds to a trial and has the following structure:
  [
    {
      "nctId": "The NCTId of the trial",
      "score": 9,
      "reason": "The concise reason for the score."
    },
    {
      "nctId": "Another NCTId",
      "score": 4,
      "reason": "Another reason."
    }
  ]
`;

// 【变更】重写了 synthesisWriterPrompt 以生成结构更丰富、更深入的报告
export const synthesisWriterPrompt = (plan: ResearchPlan, fullTexts: { pmid: string, text: string }[]): string => `
  You are a top-tier medical researcher and writer. Your task is to synthesize the information from the provided full-text articles into a comprehensive, structured, and insightful literature review.

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

  **CRITICAL INSTRUCTIONS:**
  Your final output MUST be a single, well-formatted Markdown document. Do not include any other text or explanations outside of the Markdown report itself. The report must be structured with the following sections using Markdown headings:

  1.  **核心见解摘要 (Executive Summary)**: Start with a bulleted list of 3-5 key takeaways from the entire review. This should be concise and high-level for quick understanding.

  2.  **引言 (Introduction)**: Write a brief introduction that sets the context for the research topic, states its importance, and outlines the structure of this review.

  3.  **方法论总览 (Methodology Overview)**: Briefly summarize the types of studies included in this review (e.g., "This review is based on three randomized controlled trials, one meta-analysis, and two cohort studies..."). Do not go into deep detail, just provide a high-level overview of the evidence base to establish its credibility.

  4.  **分主题综合分析 (Synthesis by Sub-question)**: This is the main body of the report. For each sub-question in the research plan, create a subsection and synthesize the findings from ALL relevant provided documents.
      - Do not just summarize one paper at a time.
      - Integrate findings, highlight corroborating evidence, and note any contradictions or gaps.
      - **Crucially, every piece of information or claim from a source must be immediately followed by its citation in the format [PMID:XXXXXX].**

  5.  **研究局限性 (Limitations)**: Based on the provided texts, write a dedicated section discussing the overall limitations of the current body of research. This could include small sample sizes, a lack of long-term studies, conflicting results, or specific populations that were under-studied.

  6.  **结论与未来研究方向 (Conclusion and Future Directions)**: Write a strong concluding paragraph that summarizes the main findings of the entire review. Then, provide a separate, detailed paragraph or bulleted list suggesting specific and actionable future research directions based on the identified gaps and limitations.

  **Formatting and Citation Style:**
  - Use Markdown headings (\`##\`) for each section title as specified above.
  - Inline citations are mandatory: **[PMID:XXXXXX]**.
`;