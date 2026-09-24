export interface LegacyNote {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
}

export interface LegacyNotesResult {
  notes: LegacyNote[];
  raw: string | null;
  issue: string | null;
}
