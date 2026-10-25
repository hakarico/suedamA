declare module '*.css' { const source: string; export default source }
declare module '*.svg' { const source: string; export default source }
declare const chrome: {
  storage: {
    local: {
      get(key: string): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
    onChanged: { addListener(callback: (changes: Record<string, {oldValue?:unknown;newValue?: unknown}>, area: string) => void): void;removeListener(callback: (changes: Record<string, {oldValue?:unknown;newValue?: unknown}>, area: string) => void):void };
  };
  runtime: {
    onMessage: {addListener(callback: (message: {type?: string}) => void): void};
    lastError?: {message: string};
  };
  action: {onClicked: {addListener(callback: (tab: {id?: number; url?: string}) => void): void}};
  tabs: {sendMessage(id: number, data: unknown): Promise<unknown>};
};
