declare module "nodejieba" {
  export function cut(text: string): string[];
  export function cutAll(text: string): string[];
  export function cutForSearch(text: string): string[];
  export function tag(text: string): Array<[string, string]>;
  export function load(dict?: {
    dict?: string;
    hmmDict?: string;
    userDict?: string;
    idfDict?: string;
    stopWordDict?: string;
  }): void;
  export function insertWord(word: string): boolean;
}
