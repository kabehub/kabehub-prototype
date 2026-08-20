export interface ExternalBrowser {
  open(url: string): Promise<void>;
}
