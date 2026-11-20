export type ID = string;
export type StoryStatus = "captured" | "transcribing" | "ready" | "needs_review" | "failed";
export type MemorySourceType = "audio" | "image" | "video" | "text" | "document";

export interface FamilyPerson { id: ID; familyId: ID; displayName: string; birthYear?: number; notes?: string; }
export interface Story { id: ID; familyId: ID; title: string; recordedAt: string; durationSeconds: number; audioUri?: string; transcript?: string; status: StoryStatus; }
export interface SourceEvidence { memoryId: ID; startMs?: number; endMs?: number; excerpt: string; }
export interface ExtractedFact<T> { value: T; confidence: number; confirmedByUser: boolean; evidence: SourceEvidence[]; }
export interface MemoryEpisode { id: ID; familyId: ID; title: string; narrative: string; people: ID[]; places: string[]; eventDate?: string; sourceEvidence: SourceEvidence[]; reviewStatus: "suggested" | "confirmed" | "disputed"; }
export interface ImageUnderstanding { description: string; visibleDetails: string[]; possibleEra: string | null; questionsForFamily: string[]; caution: string; }
export interface StoryDraft { title: string; narrative: string; suggestedTags: string[]; factsToConfirm: string[]; sourceSummary: string; }
