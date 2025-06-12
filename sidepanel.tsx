// sidepanel.tsx

import React, { useState, useEffect } from "react"
import { useStore } from "./lib/store"
import type { ResearchPlan, ScoredArticle } from "./lib/types"

// 该文件包含原 pubmed-sidebar.tsx 的所有UI和逻辑
// 但去除了用于注入页面的固定定位样式

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

  useEffect(() => {
    if (globalPlan) {
      setEditablePlan(JSON.parse(JSON.stringify(globalPlan)))
    }
  }, [globalPlan])
  
  // 处理计划更改的函数 (之前缺失，现在补上)
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
      alert("请输入一个研究主题。")
      return
    }
    chrome.runtime.sendMessage({ type: "START_RESEARCH", topic });
  }

  const handleConfirmPlan = () => {
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
      alert("请至少选择一篇文章。");
      return;
    }
    chrome.runtime.sendMessage({ 
      type: "GET_FULL_TEXT_AND_SYNTHESIZE", 
      plan: globalPlan,
      articles: articlesToProcess,
    });
  }

  const renderFinalReport = () => (
    <div>
      <h3>文献综述报告</h3>
      <p style={{fontSize: 14}}>您的AI研究助理已根据您选择的文献和研究计划生成了以下报告。</p>
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
      <button onClick={reset} style={{ width: '100%', padding: '10px', marginTop: '10px' }}>
        开始新的研究
      </button>
    </div>
  )

  const renderContent = () => {
    if (loading) {
      const messages = {
        PLANNING: "正在为您规划研究方向...",
        SCREENING: "正在检索和评估文献摘要... (这可能需要1-2分钟)",
        SYNTHESIZING: "正在深度阅读全文并撰写报告... (这可能需要2-5分钟)",
      }
      return <p>{messages[stage] || "AI 正在工作中，请稍候..."}</p>
    }
    if (error) {
      return (
        <div>
          <p style={{ color: 'red' }}>发生错误: {error}</p>
          <button onClick={reset}>重新开始</button>
        </div>
      )
    }
    switch (stage) {
      case 'IDLE':
      case 'PLANNING':
        return (
          <div>
            <h3>您想研究什么？</h3>
            <p style={{fontSize: 14}}>请输入一个主题，AI将为您分解为可调查的子问题和关键词。</p>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="例如：肠道菌群与抑郁症的最新研究进展"
              style={{ width: '100%', minHeight: '80px', boxSizing: 'border-box' }}
            />
            <button onClick={handleStart} style={{ width: '100%', padding: '10px', marginTop: '10px' }}>
              开始研究
            </button>
          </div>
        )
      case 'SCREENING':
        return scoredAbstracts && scoredAbstracts.length > 0
          ? <div>
              <h3>文献评估结果</h3>
              <p style={{fontSize: 14}}>AI已为您评估了相关文献。请勾选您认为最值得精读的文章（建议3-5篇）。</p>
              <div style={{ maxHeight: '60vh', overflowY: 'auto', border: '1px solid #eee', padding: '5px' }}>
                {scoredAbstracts.map((article) => (
                  <div key={article.pmid} style={{ borderBottom: '1px solid #eee', padding: '10px' }}>
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
              <button onClick={handleGenerateReport} disabled={selectedArticles.size === 0} style={{ width: '100%', padding: '10px', marginTop: '20px' }}>
                获取全文并生成报告 ({selectedArticles.size})
              </button>
            </div>
          : <div>
              <h3>研究计划已生成</h3>
              <p style={{fontSize: 14}}>请审核并修改以下研究计划，然后开始文献检索。</p>
              {editablePlan?.subQuestions.map((sq, index) => (
                <div key={index} style={{ border: '1px solid #ccc', padding: '10px', margin: '10px 0', borderRadius: '5px' }}>
                  <label style={{ fontWeight: 'bold' }}>子问题 {index + 1}</label>
                  <textarea value={sq.question} onChange={(e) => handlePlanChange('question', e.target.value, index)} style={{ width: '100%', minHeight: '60px', boxSizing: 'border-box', marginTop: '5px' }}/>
                  <label style={{ fontWeight: 'bold', marginTop: '10px', display: 'block' }}>关键词 (逗号分隔)</label>
                  <input type="text" value={sq.keywords.join(', ')} onChange={(e) => handlePlanChange('keywords', e.target.value, index)} style={{ width: '100%', boxSizing: 'border-box', marginTop: '5px', padding: '8px' }}/>
                </div>
              ))}
              <div style={{ marginTop: '20px' }}>
                <label style={{ fontWeight: 'bold' }}>AI 提出的澄清问题 (供您参考)</label>
                <p style={{ fontStyle: 'italic', color: '#555', background: '#f8f9fa', padding: '10px', borderRadius: '5px' }}>{editablePlan?.clarification}</p>
              </div>
              <button onClick={handleConfirmPlan} style={{ width: '100%', padding: '10px', marginTop: '20px' }}>
                确认计划，开始检索
              </button>
            </div>;
      case 'SYNTHESIZING':
      case 'DONE':
        return renderFinalReport();
      default:
        return <p>当前阶段: {stage}</p>
    }
  }

  // 容器的样式已被移除，因为它将由Chrome Side Panel API提供
  return (
    <div style={{ padding: '10px', boxSizing: 'border-box' }}>
      <h1>PubMed RAG 助理</h1>
      {renderContent()}
    </div>
  )
}

export default SidePanel