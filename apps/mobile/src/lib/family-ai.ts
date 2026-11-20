import { archiveContext, type SuggestedPerson } from './database';
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://192.168.1.87:3333';
import { getServerUrl } from './sync-client';

const API_TOKEN = process.env.EXPO_PUBLIC_API_TOKEN;
async function post<T>(path:string, body:unknown):Promise<T>{
  const response = await fetch(`${API_URL}${path}`,{method:'POST',headers:{'content-type':'application/json', ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {})},body:JSON.stringify(body)});
  const data = await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.message ?? data.error ?? `Request failed (${response.status})`);

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${getServerUrl()}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(API_TOKEN ? { Authorization: `Bearer ${API_TOKEN}` } : {})
    },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message ?? data.error ?? `Request failed (${response.status})`);
  return data as T;
}
export async function extractFamilyFacts(source:string):Promise<{people:SuggestedPerson[];relationships:{personA:string;personB:string;type:string;confidence:'low'|'medium'|'high';evidence:string}[];summary:string}>{
  return post('/v1/ai/extract-family',{source});

export async function extractFamilyFacts(source: string): Promise<{
  people: SuggestedPerson[];
  relationships: { personA: string; personB: string; type: string; confidence: 'low' | 'medium' | 'high'; evidence: string }[];
  summary: string;
}> {
  return post('/v1/ai/extract-family', { source });
}
export async function askArchive(question:string){

export async function askArchive(question: string) {
  const context = await archiveContext(question);
  return post<{answer:string;citations:{title:string;excerpt:string;createdAt:string}[];notFound:boolean}>('/v1/ai/ask',{question,context});
  return post<{ answer: string; citations: { title: string; excerpt: string; createdAt: string }[]; notFound: boolean }>(
    '/v1/ai/ask',
    { question, context }
  );
}

export interface TreeInterviewResponse {
  reply: string;
  extractedPeople: SuggestedPerson[];
  extractedRelationships: { personA: string; personB: string; relation: string; evidence: string }[];
  conflicts: { type: string; message: string }[];
  suggestedQuestions: string[];
}

export async function interviewTreeAgent(input: {
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  currentPeople: Array<{ id: string; name: string; gender?: 'male' | 'female' | 'other' | null | undefined; relationshipToUser?: string | null | undefined }>;
  currentRelationships: Array<{ id?: string | undefined; personA: string; personB: string; relation: string; evidence?: string | undefined }>;
}): Promise<TreeInterviewResponse> {
  return post<TreeInterviewResponse>('/v1/graph/interview', input);
}

export async function queryKinship(input: {
  person1: string;
  person2: string;
  people: Array<{ id: string; name: string; gender?: 'male' | 'female' | 'other' | null | undefined; relationshipToUser?: string | null | undefined }>;
  relationships: Array<{ id?: string | undefined; personA: string; personB: string; relation: string; evidence?: string | undefined }>;
}): Promise<{ found: boolean; relationDescription: string; path: string[]; explanation: string }> {
  return post<{ found: boolean; relationDescription: string; path: string[]; explanation: string }>('/v1/graph/query-kinship', input);
  return post<{ found: boolean; relationDescription: string; path: string[]; explanation: string }>(
    '/v1/graph/query-kinship',
    input
  );
}
