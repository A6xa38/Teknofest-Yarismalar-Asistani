export type Role = "yarisci" | "hakem" | "koordinator" | "admin" | "icerik_yoneticisi";

export interface Env {
  DB: D1Database;
  VECTORIZE_INDEX: VectorizeIndex;
  AI: Ai;
  ASSETS: Fetcher;
  DOCS_BUCKET: R2Bucket;
  AUTH_SECRET: string;
}

export interface VectorMetadata {
  source_file: string;
  source_title: string;
  doc_type: string;
  competition_id: string;
  page: number;
  madde_no: string | null;
  madde_title: string | null;
  text: string;
}

export interface Ticket {
  id: number;
  user_id: number | null;
  type: "soru" | "itiraz";
  category: string | null;
  question: string;
  ai_answer: string | null;
  ai_confidence: number | null;
  ai_sources: string | null;
  decision_reason: string | null;
  team_id: string | null;
  application_id: string | null;
  status: string;
  assigned_to: number | null;
  human_answer: string | null;
  created_at: string;
  updated_at: string;
}

export type DocumentStatus = "isleniyor" | "aktif" | "pasif" | "hata";

export interface DocumentRow {
  id: number;
  competition_id: string;
  title: string;
  filename: string;
  version: string | null;
  status: DocumentStatus;
  chunk_count: number;
  total_chunks: number;
  uploaded_by: number | null;
  uploaded_at: string;
  r2_key: string | null;
}

export interface DocumentChunkRow {
  id: number;
  document_id: number;
  vector_id: string;
  page: number | null;
  madde_no: string | null;
  madde_title: string | null;
  text: string;
  embedded: number;
  created_at: string;
}
