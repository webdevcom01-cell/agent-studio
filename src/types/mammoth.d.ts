declare module "mammoth" {
  interface ExtractResult {
    value: string;
  }

  function extractRawText(options: { buffer: Buffer }): Promise<ExtractResult>;
}
