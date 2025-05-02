interface ElectronAPI {
  onExamId: (callback: (id: string) => void) => void;
  onAuthTokens: (callback: (tokens: { access_token: string; refresh_token: string; exam_id: string }) => void) => void;
  logToFile: (msg: string) => void;
}

interface Window {
  electronAPI: ElectronAPI;
}
