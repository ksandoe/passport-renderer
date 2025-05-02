// renderer/utils/logToFile.ts
export function logToFile(message: string) {
  if (window.electronAPI && window.electronAPI.logToFile) {
    window.electronAPI.logToFile(message);
  }
}
