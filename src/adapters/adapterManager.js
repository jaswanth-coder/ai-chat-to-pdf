/**
 * Adapter Manager to register and find active platform adapter
 */
class AdapterManager {
  constructor() {
    this.adapters = [
      new window.ChatGPTAdapter(),
      new window.ClaudeAdapter(),
      new window.GeminiAdapter()
    ];
  }

  getActiveAdapter() {
    for (const adapter of this.adapters) {
      if (adapter.isMatching()) {
        return adapter;
      }
    }
    return null;
  }
}

window.AdapterManager = AdapterManager;
