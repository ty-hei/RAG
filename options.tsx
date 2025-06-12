// options.tsx

import { useStorage } from "@plasmohq/storage/hook"
import React, { useState, useEffect } from "react"
import type { LLMConfig } from "./lib/types"

// 默认配置，用于初始化
const defaultConfig: LLMConfig = {
  provider: "gemini",
  apiKey: "",
  apiEndpoint: "",
  fastModel: "gemini-1.5-flash-latest",
  smartModel: "gemini-1.5-pro-latest",
  fetchRateLimit: 15
}

function OptionsPage() {
  // `savedConfig` 是从 chrome.storage 中读取的持久化状态
  // `setSavedConfig` 是我们用来写入存储的唯一函数
  const [savedConfig, setSavedConfig] = useStorage<LLMConfig>("llmConfig", (v) => v ?? defaultConfig)

  // `localConfig` 是一个临时的本地状态，用于绑定UI输入框
  // 这样可以避免每次按键都触发存储写入，只在点击保存时才写
  const [localConfig, setLocalConfig] = useState<LLMConfig>(savedConfig)
  
  // 当从存储加载的 `savedConfig` 变化时，同步到本地UI状态
  useEffect(() => {
    setLocalConfig(savedConfig)
  }, [savedConfig])

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // 这是核心修改：handleSave现在会调用 setSavedConfig 来执行真正的保存操作
  const handleSave = () => {
    setSaveStatus('saving');
    // 将本地UI的状态一次性保存到持久化存储中
    setSavedConfig(localConfig).then(() => {
      setTimeout(() => {
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000); 
      }, 500);
    }).catch(error => {
      console.error("Failed to save config:", error);
      setSaveStatus('idle');
      alert("保存失败，请查看控制台日志！");
    });
  }

  const getButtonText = () => {
    if (saveStatus === 'saving') return "正在保存...";
    if (saveStatus === 'saved') return "已保存！";
    return "保存设置";
  }
  
  // 一个辅助函数，用于更新 localConfig 中的某个字段
  const handleConfigChange = (field: keyof LLMConfig, value: any) => {
    setLocalConfig(prev => ({...prev, [field]: value}));
  }

  return (
    <div style={styles.container}>
      <h1>PubMed RAG 智能助理 - 设置</h1>
      <p style={styles.description}>
        请在此处配置您的语言模型API密钥和其它设置。您的数据将安全地存储在本地。
      </p>

      <div style={styles.formGroup}>
        <label style={styles.label}>AI 提供商</label>
        <select
          value={localConfig.provider}
          onChange={(e) => handleConfigChange('provider', e.target.value)}
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
          value={localConfig.apiKey}
          onChange={(e) => handleConfigChange('apiKey', e.target.value)}
        />
      </div>

      {localConfig.provider === 'openai' && (
        <div style={styles.formGroup}>
          <label style={styles.label}>API Endpoint URL (仅OpenAI兼容API需要)</label>
          <input
            type="text"
            style={styles.input}
            placeholder="例如: https://api.openai.com/v1/chat/completions"
            value={localConfig.apiEndpoint}
            onChange={(e) => handleConfigChange('apiEndpoint', e.target.value)}
          />
        </div>
      )}

      <div style={styles.formGroup}>
        <label style={styles.label}>快速模型名称 (用于规划和初筛)</label>
        <input
          type="text"
          style={styles.input}
          placeholder="例如: gemini-1.5-flash-latest 或 gpt-4o-mini"
          value={localConfig.fastModel}
          onChange={(e) => handleConfigChange('fastModel', e.target.value)}
        />
        <p style={styles.fieldDescription}>
          一个速度快、成本效益高的模型，用于研究规划、摘要评分等任务。
        </p>
      </div>

      <div style={styles.formGroup}>
        <label style={styles.label}>增强模型名称 (用于生成最终报告)</label>
        <input
          type="text"
          style={styles.input}
          placeholder="例如: gemini-1.5-pro-latest 或 gpt-4o"
          value={localConfig.smartModel}
          onChange={(e) => handleConfigChange('smartModel', e.target.value)}
        />
        <p style={styles.fieldDescription}>
          一个能力强、更深入的模型，用于从全文生成高质量的文献综述报告。
        </p>
      </div>

       <div style={styles.formGroup}>
        <label style={styles.label}>全文抓取速率限制（秒/篇）</label>
        <input
          type="number"
          style={styles.input}
          min="5"
          max="60"
          value={localConfig.fetchRateLimit}
          onChange={(e) => handleConfigChange('fetchRateLimit', parseInt(e.target.value, 10))}
        />
        <p style={styles.fieldDescription}>
          为了避免被网站屏蔽，插件将以这个速度逐一打开标签页抓取全文。建议15-30秒。
        </p>
      </div>

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