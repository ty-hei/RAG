// sidepanel.tsx

import React, { useState, useEffect } from "react"
import { useStore } from "./lib/store"
import type { ResearchPlan, ScoredArticle } from "./lib/types"

function SidePanel() {
  const { 
    stage, 
    topic: globalTopic,
    researchPlan: globalPlan, 
    scoredAbstracts,
    finalReport,
    loading, 
    error, 
    setResearchPlan,
    reset 
  } = useStore()

  const [topic, setTopic] = useState(globalTopic || "")
  const [editablePlan, setEditablePlan] = useState<ResearchPlan | null>(null)
  const [selectedArticles, setSelectedArticles] = useState<Set<string>>(new Set())
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    if (globalPlan) {
      setEditablePlan(JSON.parse(JSON.stringify(globalPlan)))
    }
  }, [globalPlan])
  
  const handlePlanChange = (field: 'question' | 'keywords', value: string, index: number) => {
    if (!editablePlan) return;
    const newSubQuestions = [...editablePlan.subQuestions];
    if (field === 'keywords') {
      newSubQuestions[index] = { ...newSubQuestions[index], keywords: value.split(',').map(k => k.trim()) };
    } else {
      newSubQuestions[index] = { ...newSubQuestions[index], question: value };
    }
    setEditablePlan({ ...editablePlan, subQuestions: newSubQuestions });
  };

  const handleStart = () => {
    if (!topic.trim()) {
      setValidationError("请输入一个研究主题。")
      return
    }
    setValidationError(null)
    chrome.runtime.sendMessage({ type: "START_RESEARCH", topic });
  }

  const handleConfirmPlan = () => {
    // 在发送消息前，应该先进入加载状态，以提供更快的UI反馈
    // useStore.getState().setLoading(true); // 这是一个可以优化的点，但当前逻辑在background中处理
    setResearchPlan(editablePlan)
    chrome.runtime.sendMessage({ type: "EXECUTE_SEARCH", plan: editablePlan })
  }

  const handleArticleSelection = (pmid: string) => {
    setSelectedArticles(prevSelected => {
      const newSelected = new Set(prevSelected)
      if (newSelected.has(pmid)) {
        newSelected.delete(pmid)
      } else {
        newSelected.add(pmid)
      }
      return newSelected
    })
  }

  const handleGenerateReport = () => {
    const articlesToProcess = scoredAbstracts.filter(a => selectedArticles.has(a.pmid));
    if (articlesToProcess.length === 0) {
      setValidationError("请至少选择一篇文章。")
      return;
    }
    setValidationError(null)
    chrome.runtime.sendMessage({ 
      type: "GET_FULL_TEXT_AND_SYNTHESIZE", 
      plan: globalPlan,
      articles: articlesToProcess,
    });
  }
  
  const renderFinalReport = () => (
    <div>
      <h3>文献综述报告</h3>
      <p style={{fontSize: 14, color: '#555'}}>您的AI研究助理已根据您选择的文献和研究计划生成了以下报告。</p>
      <textarea
        readOnly
        value={finalReport}
        style={{ 
          width: '100%', 
          height: '65vh', 
          boxSizing: 'border-box', 
          marginTop: '10px',
          fontSize: '13px',
          fontFamily: 'monospace',
          whiteSpace: 'pre-wrap' 
        }}
      />
      <button onClick={reset} style={styles.button}>
        开始新的研究
      </button>
    </div>
  )

  const renderContent = () => {
    if (error) {
      return (
        <div style={styles.errorBox}>
          <h4>发生错误</h4>
          <p>{error}</p>
          <button onClick={reset} style={styles.button}>重试</button>
        </div>
      )
    }

    if (loading) {
      const messages = {
        PLANNING: "AI正在为您规划研究方向，请稍候...",
        SCREENING: "正在检索和评估文献摘要... (这可能需要1-2分钟)",
        SYNTHESIZING: "正在深度阅读全文并撰写报告... (这可能需要2-5分钟)",
      }
      return <div style={styles.loadingBox}><p>{messages[stage] || "AI 正在工作中..."}</p></div>
    }

    switch (stage) {
      case 'IDLE':
      case 'PLANNING':
        return (
          <div>
            <h3>您想研究什么？</h3>
            <p style={styles.description}>请输入一个主题，AI将为您分解为可调查的子问题和关键词。</p>
            <textarea
              value={topic}
              onChange={(e) => {
                setTopic(e.target.value)
                if (validationError) setValidationError(null)
              }}
              placeholder="例如：肠道菌群与抑郁症的最新研究进展"
              style={{ ...styles.textarea, ...(validationError ? styles.inputError : {}) }}
            />
            {validationError && <p style={styles.errorText}>{validationError}</p>}
            <button 
              onClick={handleStart} 
              disabled={loading}
              style={{...styles.button, ...(loading ? styles.buttonDisabled : {})}}
            >
              {loading ? "正在规划..." : "开始研究"}
            </button>
          </div>
        )
      case 'SCREENING':
        return scoredAbstracts && scoredAbstracts.length > 0
          ? <div>
              <h3>文献评估结果</h3>
              <p style={styles.description}>AI已为您评估了相关文献。请勾选您认为最值得精读的文章（建议3-5篇）。</p>
              <div style={styles.articleList}>
                {scoredAbstracts.map((article) => (
                  <div key={article.pmid} style={styles.articleItem}>
                    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                      <input type="checkbox" style={{ marginRight: '10px', marginTop: '5px' }} checked={selectedArticles.has(article.pmid)} onChange={() => handleArticleSelection(article.pmid)} />
                      <div style={{ flex: 1 }}>
                        <h4 style={{ margin: 0, fontSize: '14px' }}>{article.title}</h4>
                        <p style={{ margin: '5px 0', fontSize: '12px' }}><strong>PMID:</strong> {article.pmid}</p>
                        <p style={{ margin: '5px 0', fontStyle: 'italic', color: '#007bff' }}>
                          <strong>AI评分: {article.score}/10</strong> - {article.reason}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {validationError && <p style={styles.errorText}>{validationError}</p>}
              <button 
                onClick={handleGenerateReport} 
                disabled={loading || selectedArticles.size === 0} 
                style={{...styles.button, ...((loading || selectedArticles.size === 0) ? styles.buttonDisabled : {})}}
              >
                {/* 修正：移除不可能的 stage === 'SYNTHESIZING' 判断 */}
                {loading ? '正在生成...' : `获取全文并生成报告 (${selectedArticles.size})`}
              </button>
            </div>
          : <div>
              <h3>研究计划已生成</h3>
              <p style={styles.description}>请审核并修改以下研究计划，然后开始文献检索。</p>
              {editablePlan?.subQuestions.map((sq, index) => (
                <div key={index} style={styles.planBox}>
                  <label style={styles.label}>子问题 {index + 1}</label>
                  <textarea value={sq.question} onChange={(e) => handlePlanChange('question', e.target.value, index)} style={styles.textarea}/>
                  <label style={{...styles.label, marginTop: '10px'}}>关键词 (逗号分隔)</label>
                  <input type="text" value={sq.keywords.join(', ')} onChange={(e) => handlePlanChange('keywords', e.target.value, index)} style={styles.input}/>
                </div>
              ))}
              <div style={{ marginTop: '20px' }}>
                <label style={styles.label}>AI 提出的澄清问题 (供您参考)</label>
                <p style={styles.clarification}>{editablePlan?.clarification}</p>
              </div>
              <button onClick={handleConfirmPlan} disabled={loading} style={{...styles.button, ...(loading ? styles.buttonDisabled : {})}}>
                 {/* 修正：移除冗余的 stage === 'SCREENING' 判断 */}
                 {loading ? "正在检索..." : "确认计划，开始检索"}
              </button>
            </div>;
      case 'SYNTHESIZING':
      case 'DONE':
        return renderFinalReport();
      default:
        return <p>当前阶段: {stage}</p>
    }
  }

  return (
    <div style={styles.container}>
      <h1>PubMed RAG 助理</h1>
      {renderContent()}
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { padding: '15px', boxSizing: 'border-box', fontFamily: "sans-serif" },
  description: { fontSize: 14, color: '#555' },
  textarea: { width: '100%', minHeight: '80px', boxSizing: 'border-box', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', marginTop: '5px' },
  input: { width: '100%', boxSizing: 'border-box', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', marginTop: '5px' },
  button: { 
    width: '100%', 
    padding: '10px 15px', 
    marginTop: '20px',
    backgroundColor: "#007bff",
    color: "white",
    border: "none",
    borderRadius: 5,
    cursor: "pointer",
    fontSize: 16,
    transition: 'background-color 0.2s'
  },
  buttonDisabled: {
    backgroundColor: "#aaa",
    cursor: "not-allowed"
  },
  inputError: {
    border: '1px solid red',
  },
  errorText: {
    color: 'red',
    fontSize: '13px',
    marginTop: '5px'
  },
  errorBox: {
    padding: '15px',
    backgroundColor: '#ffebee',
    border: '1px solid #ef5350',
    borderRadius: '5px',
    color: '#c62828'
  },
  loadingBox: {
    textAlign: 'center',
    padding: '40px 20px',
    color: '#555'
  },
  articleList: { maxHeight: '60vh', overflowY: 'auto', border: '1px solid #eee', padding: '5px', borderRadius: '5px' },
  articleItem: { borderBottom: '1px solid #eee', padding: '10px' },
  planBox: { border: '1px solid #ccc', padding: '10px', margin: '10px 0', borderRadius: '5px' },
  label: { fontWeight: 'bold', display: 'block' },
  clarification: { fontStyle: 'italic', color: '#555', background: '#f8f9fa', padding: '10px', borderRadius: '5px', border: '1px solid #eee' }
}

export default SidePanel