export interface ApiClient {
  request(path: `/api/${string}`, init?: RequestInit): Promise<Response>;
}
