export type PiiType =
  | "email"
  | "iban"
  | "phone"
  | "tax_id"
  | "api_key"
  | "name"
  | "city"
  | "credit_card"
  | "bank_account"
  | "reference";

export interface PiiMatch {
  /** PII category */
  type: PiiType;
  /** Original text found */
  original: string;
  /** Replacement placeholder (e.g. <EMAIL_1>) */
  replacement: string;
  /** Start index in the input text */
  startIndex: number;
  /** End index in the input text */
  endIndex: number;
}

export interface AnonymizedContent {
  /** Text with all PII replaced by placeholders */
  text: string;
  /** Detected PII matches with replacements */
  matches: PiiMatch[];
  /** Total number of PII instances found */
  count: number;
}

export interface Detector {
  /** Detector name for logging */
  name: string;
  /** Detect PII in text and return matches */
  detect(text: string): PiiMatch[];
}
