// options.tsx

import { Storage } from "@plasmohq/storage"
import React, { useState, useEffect } from "react"
import type { LLMConfig } from "./lib/types"

// 创建一个存储实例，供整个组件使用
const storage = new Storage({ area: "local" })

// 默认配置，用于在存储中没有任何内容时进行初始化
const defaultConfig: LLMConfig = {
  provider: "gemini",
  apiKey: "",
  apiEndpoint: "",
  fastModel: "gemini-1.5-flash-latest",
  smartModel: "gemini-1.5-pro-latest",
  fetchRateLimit: 15
}

function OptionsPage() {
  // 使用单一状态来管理表单的全部配置
  const [config, setConfig] = useState<LLMConfig>(defaultConfig)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle")

  // 当组件首次加载时，从 chrome.storage 中异步加载配置
  useEffect(() => {
    const loadConfig = async () => {
      const savedConfig = await storage.get<LLMConfig>("llmConfig")
      // 如果找到了已保存的配置，则用它来更新UI状态
      if (savedConfig) {
        setConfig(savedConfig)
      }
    }
    loadConfig()
  }, []) // 空依赖数组确保此 effect 只在组件挂载时运行一次

  // 处理保存操作
  const handleSave = async () => {
    setSaveStatus("saving")
    try {
      // 将当前UI上的配置数据直接写入存储
      await storage.set("llmConfig", config)
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 2000)
    } catch (error) {
      console.error("Failed to save config:", error)
      setSaveStatus("idle")
      alert("保存失败，请查看控制台日志！")
    }
  }

  // 更新按钮文本以提供用户反馈
  const getButtonText = () => {
    if (saveStatus === "saving") return "正在保存..."
    if (saveStatus === "saved") return "已保存！"
    return "保存设置"
  }

  // 通用的配置更改处理函数
  const handleConfigChange = (field: keyof LLMConfig, value: any) => {
    setConfig((prev) => ({ ...prev, [field]: value }))
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
          value={config.provider}
          onChange={(e) => handleConfigChange("provider", e.target.value)}
          style={styles.input}>
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
          onChange={(e) => handleConfigChange("apiKey", e.target.value)}
        />
      </div>

      {config.provider === "openai" && (
        <div style={styles.formGroup}>
          <label style={styles.label}>API Endpoint URL (仅OpenAI兼容API需要)</label>
          <input
            type="text"
            style={styles.input}
            placeholder="例如: https://api.openai.com/v1"
            value={config.apiEndpoint}
            onChange={(e) => handleConfigChange("apiEndpoint", e.target.value)}
          />
        </div>
      )}

      <div style={styles.formGroup}>
        <label style={styles.label}>快速模型名称 (用于规划和初筛)</label>
        <input
          type="text"
          style={styles.input}
          placeholder="例如: gemini-1.5-flash-latest 或 gpt-4o-mini"
          value={config.fastModel}
          onChange={(e) => handleConfigChange("fastModel", e.target.value)}
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
          value={config.smartModel}
          onChange={(e) => handleConfigChange("smartModel", e.target.value)}
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
          value={config.fetchRateLimit}
          onChange={(e) => handleConfigChange("fetchRateLimit", parseInt(e.target.value, 10))}
        />
        <p style={styles.fieldDescription}>
          为了避免被网站屏蔽，插件将以这个速度逐一打开标签页抓取全文。建议15-30秒。
        </p>
      </div>

      <div style={styles.formGroup}>
        <button
          onClick={handleSave}
          style={{ ...styles.button, ...(saveStatus === 'saving' ? styles.buttonDisabled : {}) }}
          disabled={saveStatus === "saving"}>
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
    transition: "background-color 0.2s"
  },
  buttonDisabled: {
    backgroundColor: "#aaa",
    cursor: "not-allowed"
  }
}

export default OptionsPage