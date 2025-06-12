import { createContextMenus } from './lib/menus'

// 当插件安装时运行
chrome.runtime.onInstalled.addListener(() => {
  // 这里可以保留或移除创建右键菜单的逻辑
  // createContextMenus()
})

// 设置点击插件图标时打开侧边栏
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error))

// 监听标签页更新事件，以便在用户导航到 PubMed 时启用侧边栏图标
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (!tab.url) return
  if (info.status !== 'complete') return // 确保页面加载完成后再操作

  const url = new URL(tab.url)
  if (url.origin === 'https://pubmed.ncbi.nlm.nih.gov') {
    await chrome.sidePanel.setOptions({
      tabId,
      path: 'sidepanel.html',
      enabled: true
    })
  } else {
    // 在其他网站禁用侧边栏
    await chrome.sidePanel.setOptions({
      tabId,
      enabled: false
    })
  }
})

// 【新增】监听插件图标点击事件
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url) return

  const url = new URL(tab.url)
  // 如果当前页面是 PubMed，则主动打开侧边栏
  if (url.origin === 'https://pubmed.ncbi.nlm.nih.gov') {
    await chrome.sidePanel.open({ tabId: tab.id! })
  }
})