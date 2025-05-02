export {};

declare global {
  interface Window {
    electronAPI: {
      onExamId: (callback: (id: string) => void) => void;
      // Add other APIs as needed
    };
  }
}
