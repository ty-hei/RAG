// options.tsx

import { useStorage } from "@plasmohq/storage/hook"
import React, { useState } from "react"
import type { LLMConfig } from "~lib/types"

function OptionsPage() {
  const [config, setConfig] = useStorage<LLMConfig>("llmConfig", (v) =>
    v ?? {
      provider: "gemini",
      apiKey: "",
      apiEndpoint: "",
      model: "gemini-1.5-flash-latest",
      fetchRateLimit: 15
    }
  )
  
  // 新增保存状态，用于提供即时反馈
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const handleSave = () => {
    setSaveStatus('saving');
    // setConfig 会自动保存，我们只需要模拟一个短暂的延迟来显示状态
    setTimeout(() => {
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000); // 2秒后重置状态
    }, 500);
  }

  const getButtonText = () => {
    if (saveStatus === 'saving') return "正在保存...";
    if (saveStatus === 'saved') return "已保存！";
    return "保存设置";
  }

  return (
    <div style={styles.container}>
      <h1>PubMed RAG 智能助理 - 设置</h1>
      <p style={styles.description}>
        请在此处配置您的语言模型API密钥和其它设置。您的数据将安全地存储在本地。
      </p>

      {/* 表单内容保持不变... */}
      <div style={styles.formGroup}>
        <label style={styles.label}>AI 提供商</label>
        <select
          value={config.provider}
          onChange={(e) => setConfig({ ...config, provider: e.target.value as 'gemini' | 'openai' })}
          style={styles.input}
        >
          <option value="gemini">Google Gemini</option>
          <option value="openai">OpenAI 兼容 API</option>
        </select>
      </div>

      <div style={styles.formGroup}>
        <label style={styles.label}>API 密钥</label>
        <input
          type="password"
          style={styles.input}
          placeholder="在此处粘贴您的API密钥"
          value={config.apiKey}
          onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
        />
      </div>

      {config.provider === 'openai' && (
        <div style={styles.formGroup}>
          <label style={styles.label}>API Endpoint URL (仅OpenAI兼容API需要)</label>
          <input
            type="text"
            style={styles.input}
            placeholder="例如: https://api.openai.com/v1/chat/completions"
            value={config.apiEndpoint}
            onChange={(e) => setConfig({ ...config, apiEndpoint: e.target.value })}
          />
        </div>
      )}

      <div style={styles.formGroup}>
        <label style={styles.label}>模型名称</label>
        <input
          type="text"
          style={styles.input}
          placeholder="例如: gemini-1.5-flash-latest 或 gpt-4o"
          value={config.model}
          onChange={(e) => setConfig({ ...config, model: e.target.value })}
        />
      </div>

       <div style={styles.formGroup}>
        <label style={styles.label}>全文抓取速率限制（秒/篇）</label>
        <input
          type="number"
          style={styles.input}
          min="5"
          max="60"
          value={config.fetchRateLimit}
          onChange={(e) => setConfig({ ...config, fetchRateLimit: parseInt(e.target.value, 10) })}
        />
        <p style={styles.fieldDescription}>
          为了避免被网站屏蔽，插件将以这个速度逐一打开标签页抓取全文。建议15-30秒。
        </p>
      </div>

      {/* 新增保存按钮 */}
      <div style={styles.formGroup}>
        <button 
          onClick={handleSave} 
          style={styles.button}
          disabled={saveStatus === 'saving'}
        >
          {getButtonText()}
        </button>
      </div>
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { maxWidth: 600, margin: "50px auto", padding: 20, fontFamily: "sans-serif" },
  description: { color: "#555" },
  formGroup: { marginBottom: 20 },
  label: { display: "block", marginBottom: 5, fontWeight: "bold" },
  input: { width: "100%", padding: 8, boxSizing: "border-box" },
  fieldDescription: { fontSize: 12, color: "#777", marginTop: 5 },
  button: {
    width: "100%",
    padding: "10px 15px",
    backgroundColor: "#007bff",
    color: "white",
    border: "none",
    borderRadius: 5,
    cursor: "pointer",
    fontSize: 16,
    opacity: 1,
  }
}

export default OptionsPage