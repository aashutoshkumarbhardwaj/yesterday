import * as SQLite from 'expo-sqlite';

export type Story = { id: string; title: string; narrative: string; transcript: string | null; sourceType: string; sourceUri: string | null; createdAt: string; reviewStatus: string };
export type Person = { id: string; name: string; relationship: string | null; notes: string | null; gender?: 'male' | 'female' | 'other' | null; birthYear?: number | null; deathYear?: number | null; birthPlace?: string | null; avatarUri?: string | null; createdAt: string; reviewStatus: string };
export type SuggestedPerson = { name: string; relationshipToNarrator?: string | null; notes?: string | null; gender?: 'male' | 'female' | 'other' | null; birthYear?: number | null; deathYear?: number | null; birthPlace?: string | null };
export type SuggestedRelationship = { personA: string; personB: string; type: string; confidence?: string; evidence: string };
export type FamilyRelationship = { id: string; personA: string; personB: string; relation: string; status: string; evidence: string | null };
export type TreeMessage = { id: string; role: 'user' | 'assistant'; content: string; extractedJson?: string | null; createdAt: string };
export type PersonMedia = { id: string; personId: string; type: 'image' | 'audio' | 'video'; uri: string; title: string | null; caption: string | null; createdAt: string };

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
async function db() {
  if (!dbPromise) dbPromise = (async () => {
    const database = await SQLite.openDatabaseAsync('yesterday.db');
    await database.execAsync(`PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS stories (id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, narrative TEXT NOT NULL, transcript TEXT, source_type TEXT NOT NULL, source_uri TEXT, created_at TEXT NOT NULL, review_status TEXT NOT NULL DEFAULT 'suggested');
      CREATE TABLE IF NOT EXISTS people (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL COLLATE NOCASE UNIQUE, relationship TEXT, notes TEXT, created_at TEXT NOT NULL, review_status TEXT NOT NULL DEFAULT 'suggested');
      CREATE TABLE IF NOT EXISTS story_people (story_id TEXT NOT NULL, person_id TEXT NOT NULL, evidence TEXT, PRIMARY KEY(story_id, person_id), FOREIGN KEY(story_id) REFERENCES stories(id) ON DELETE CASCADE, FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS relationships (id TEXT PRIMARY KEY NOT NULL, person_a TEXT NOT NULL, person_b TEXT NOT NULL, relation TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'suggested', evidence TEXT);
      CREATE TABLE IF NOT EXISTS tree_messages (id TEXT PRIMARY KEY NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, extracted_json TEXT, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS person_media (id TEXT PRIMARY KEY NOT NULL, person_id TEXT NOT NULL, type TEXT NOT NULL, uri TEXT NOT NULL, title TEXT, caption TEXT, created_at TEXT NOT NULL, FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS pending_uploads (id TEXT PRIMARY KEY NOT NULL, type TEXT NOT NULL, local_uri TEXT, payload_json TEXT, status TEXT NOT NULL DEFAULT 'queued', retry_count INTEGER NOT NULL DEFAULT 0, error_msg TEXT, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS fact_suggestions (id TEXT PRIMARY KEY NOT NULL, fact_type TEXT NOT NULL, subject_name TEXT, object_name TEXT, value_json TEXT NOT NULL, confidence REAL NOT NULL, evidence_excerpt TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS life_events (id TEXT PRIMARY KEY NOT NULL, person_id TEXT NOT NULL, event_type TEXT NOT NULL, title TEXT NOT NULL, description TEXT, event_date TEXT, place TEXT, evidence TEXT, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS memory_comments (id TEXT PRIMARY KEY NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, author_id TEXT NOT NULL, author_name TEXT NOT NULL, content TEXT NOT NULL, parent_id TEXT, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS memory_reactions (id TEXT PRIMARY KEY NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, user_id TEXT NOT NULL, user_name TEXT NOT NULL, reaction_type TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(entity_type, entity_id, user_id, reaction_type));
      CREATE TABLE IF NOT EXISTS memory_contributions (id TEXT PRIMARY KEY NOT NULL, story_id TEXT NOT NULL, contributor_id TEXT NOT NULL, contributor_name TEXT NOT NULL, perspective_text TEXT NOT NULL, photo_uris_json TEXT, date_correction TEXT, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS user_notifications (id TEXT PRIMARY KEY NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, link_url TEXT, is_read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    `);

    // Ensure extra columns exist on people
    try {
      const cols = await database.getAllAsync<{ name: string }>('PRAGMA table_info(people)');
      const names = new Set(cols.map(c => c.name));
      if (!names.has('gender')) await database.execAsync('ALTER TABLE people ADD COLUMN gender TEXT');
      if (!names.has('birth_year')) await database.execAsync('ALTER TABLE people ADD COLUMN birth_year INTEGER');
      if (!names.has('death_year')) await database.execAsync('ALTER TABLE people ADD COLUMN death_year INTEGER');
      if (!names.has('birth_place')) await database.execAsync('ALTER TABLE people ADD COLUMN birth_place TEXT');
      if (!names.has('avatar_uri')) await database.execAsync('ALTER TABLE people ADD COLUMN avatar_uri TEXT');
    } catch (e) {
      console.warn('Migration note for people columns:', e);
    }

    return database;
  })();
  return dbPromise;
}
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
export async function listStories(search = ''): Promise<Story[]> {
  const d = await db(); const q = `%${search.trim()}%`;
  return d.getAllAsync<Story>(`SELECT id,title,narrative,transcript,source_type as sourceType,source_uri as sourceUri,created_at as createdAt,review_status as reviewStatus FROM stories WHERE title LIKE ? OR narrative LIKE ? OR COALESCE(transcript,'') LIKE ? ORDER BY created_at DESC`, q,q,q);
}
export async function saveStory(input: { title: string; narrative: string; transcript?: string | null; sourceType: string; sourceUri?: string | null; people?: SuggestedPerson[]; relationships?: SuggestedRelationship[]; }) {
  const d = await db(); const id = uid(); const now = new Date().toISOString();
  await d.runAsync('INSERT INTO stories(id,title,narrative,transcript,source_type,source_uri,created_at) VALUES(?,?,?,?,?,?,?)', id,input.title,input.narrative,input.transcript ?? null,input.sourceType,input.sourceUri ?? null,now);
  const personIds = new Map<string, string>();
  for (const p of input.people ?? []) {
    const name = p.name.trim(); if (!name) continue;
    await d.runAsync('INSERT OR IGNORE INTO people(id,name,relationship,notes,created_at) VALUES(?,?,?,?,?)', uid(),name,p.relationshipToNarrator ?? null,p.notes ?? null,now);
    const person = await d.getFirstAsync<{id:string}>('SELECT id FROM people WHERE name = ? COLLATE NOCASE', name);
    if (person) { personIds.set(name.toLocaleLowerCase(), person.id); await d.runAsync('INSERT OR IGNORE INTO story_people(story_id,person_id,evidence) VALUES(?,?,?)',id,person.id,input.transcript ?? input.narrative); }
  }
  for (const rel of input.relationships ?? []) {
    const a = personIds.get(rel.personA.trim().toLocaleLowerCase()); const b = personIds.get(rel.personB.trim().toLocaleLowerCase());
    if (a && b && a !== b) await d.runAsync('INSERT INTO relationships(id,person_a,person_b,relation,status,evidence) VALUES(?,?,?,?,?,?)',uid(),a,b,rel.type,'suggested',rel.evidence);
  }
  return id;
}
export async function seedSharmaHeritageIfEmpty(): Promise<boolean> {
  const d = await db();
  const countRow = await d.getFirstAsync<{ count: number }>('SELECT count(*) as count FROM people');
  if (countRow && countRow.count > 0) {
    return false;
  }

  const now = new Date().toISOString();
  // 1. Insert 7 Members of Sharma Heritage
  const peopleData = [
    {
      id: 'person-hariram',
      name: 'Hariram Sharma',
      relationship: 'Great-Grandfather',
      gender: 'male',
      birthYear: 1920,
      deathYear: 1998,
      birthPlace: 'Amritsar, Punjab',
      notes: 'Preserved 18 ancestral archives. Patriarch of the Sharma line.',
      avatarUri: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=240'
    },
    {
      id: 'person-kamla',
      name: 'Kamla Devi',
      relationship: 'Great-Grandmother',
      gender: 'female',
      birthYear: 1925,
      deathYear: 2004,
      birthPlace: 'Lahore / Amritsar',
      notes: 'Preserved 14 stories. Matriarch and custodian of family folklore.',
      avatarUri: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=240'
    },
    {
      id: 'person-ramesh',
      name: 'Ramesh Sharma',
      relationship: 'Grandfather',
      gender: 'male',
      birthYear: 1948,
      deathYear: 2015,
      birthPlace: 'Haridwar, Uttarakhand',
      notes: 'Preserved 24 memories. "The 1971 Ganges crossing oral history tapes".',
      avatarUri: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=240'
    },
    {
      id: 'person-sushila',
      name: 'Sushila Sharma',
      relationship: 'Grandmother',
      gender: 'female',
      birthYear: 1952,
      deathYear: null,
      birthPlace: 'Dehradun, Uttarakhand',
      notes: 'Preserved 9 cassette tapes. Educator and preserver of traditions.',
      avatarUri: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=240'
    },
    {
      id: 'person-vikram',
      name: 'Vikram Sharma',
      relationship: 'Father',
      gender: 'male',
      birthYear: 1974,
      deathYear: null,
      birthPlace: 'New Delhi',
      notes: 'Preserved 31 stories. Civil engineer and guardian of ancestral archives.',
      avatarUri: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=240'
    },
    {
      id: 'person-ananya',
      name: 'Ananya Sharma',
      relationship: 'Mother',
      gender: 'female',
      birthYear: 1978,
      deathYear: null,
      birthPlace: 'Jaipur, Rajasthan',
      notes: 'Preserved 19 chronicles. Artist and chronicler of family heritage.',
      avatarUri: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=240'
    },
    {
      id: 'person-aashutosh',
      name: 'Aashutosh Sharma',
      relationship: 'Self',
      gender: 'male',
      birthYear: 2003,
      deathYear: null,
      birthPlace: 'New Delhi',
      notes: 'Narrator and custodian building the living heritage archive.',
      avatarUri: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=240'
    }
  ];

  for (const p of peopleData) {
    await d.runAsync(
      'INSERT INTO people (id, name, relationship, notes, gender, birth_year, death_year, birth_place, avatar_uri, created_at, review_status) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      p.id, p.name, p.relationship, p.notes, p.gender, p.birthYear, p.deathYear ?? null, p.birthPlace, p.avatarUri, now, 'confirmed'
    );
  }

  // 2. Insert Core Generational Relationships
  const relsData = [
    { id: 'rel-1', a: 'person-hariram', b: 'person-kamla', rel: 'spouse', ev: 'Married in 1943 (m. 1943)' },
    { id: 'rel-2', a: 'person-hariram', b: 'person-ramesh', rel: 'parent', ev: 'Hariram is father of Ramesh' },
    { id: 'rel-3', a: 'person-kamla', b: 'person-ramesh', rel: 'parent', ev: 'Kamla is mother of Ramesh' },
    { id: 'rel-4', a: 'person-ramesh', b: 'person-sushila', rel: 'spouse', ev: 'Married in 1972 (m. 1972)' },
    { id: 'rel-5', a: 'person-ramesh', b: 'person-vikram', rel: 'parent', ev: 'Ramesh is father of Vikram' },
    { id: 'rel-6', a: 'person-sushila', b: 'person-vikram', rel: 'parent', ev: 'Sushila is mother of Vikram' },
    { id: 'rel-7', a: 'person-vikram', b: 'person-ananya', rel: 'spouse', ev: 'Married in 2001 (m. 2001)' },
    { id: 'rel-8', a: 'person-vikram', b: 'person-aashutosh', rel: 'parent', ev: 'Vikram is father of Aashutosh' },
    { id: 'rel-9', a: 'person-ananya', b: 'person-aashutosh', rel: 'parent', ev: 'Ananya is mother of Aashutosh' }
  ];

  for (const r of relsData) {
    await d.runAsync(
      'INSERT INTO relationships (id, person_a, person_b, relation, status, evidence) VALUES (?,?,?,?,?,?)',
      r.id, r.a, r.b, r.rel, 'confirmed', r.ev
    );
  }

  return true;
}

export async function listPeople(): Promise<Person[]> {
  const d = await db();
  const people = await d.getAllAsync<Person>(
    'SELECT id, name, relationship, notes, gender, birth_year as birthYear, death_year as deathYear, birth_place as birthPlace, avatar_uri as avatarUri, created_at as createdAt, review_status as reviewStatus FROM people ORDER BY name COLLATE NOCASE'
  );
  if (people.length === 0) {
    await seedSharmaHeritageIfEmpty();
    return d.getAllAsync<Person>(
      'SELECT id, name, relationship, notes, gender, birth_year as birthYear, death_year as deathYear, birth_place as birthPlace, avatar_uri as avatarUri, created_at as createdAt, review_status as reviewStatus FROM people ORDER BY name COLLATE NOCASE'
    );
  }
  return people;
}
export async function updatePersonReview(id: string, status: 'confirmed'|'disputed') { const d = await db(); await d.runAsync('UPDATE people SET review_status=? WHERE id=?',status,id); }

export async function updatePersonProfile(
  id: string,
  updates: {
    name?: string;
    relationship?: string | null;
    gender?: 'male' | 'female' | 'other' | null;
    birthYear?: number | null;
    birthPlace?: string | null;
    notes?: string | null;
    avatarUri?: string | null;
  }
): Promise<void> {
  const d = await db();
  const current = await d.getFirstAsync<Person>('SELECT * FROM people WHERE id = ?', id);
  if (!current) return;

  const newName = updates.name !== undefined ? updates.name : current.name;
  const newRel = updates.relationship !== undefined ? updates.relationship : current.relationship;
  const newGender = updates.gender !== undefined ? updates.gender : (current.gender ?? null);
  const newBirthYear = updates.birthYear !== undefined ? updates.birthYear : (current.birthYear ?? null);
  const newBirthPlace = updates.birthPlace !== undefined ? updates.birthPlace : (current.birthPlace ?? null);
  const newNotes = updates.notes !== undefined ? updates.notes : (current.notes ?? null);
  const newAvatarUri = updates.avatarUri !== undefined ? updates.avatarUri : (current.avatarUri ?? null);

  await d.runAsync(
    'UPDATE people SET name = ?, relationship = ?, gender = ?, birth_year = ?, birth_place = ?, notes = ?, avatar_uri = ? WHERE id = ?',
    newName, newRel, newGender, newBirthYear, newBirthPlace, newNotes, newAvatarUri, id
  );
}

export async function addPersonMedia(input: {
  personId: string;
  type: 'image' | 'audio' | 'video';
  uri: string;
  title?: string;
  caption?: string;
}): Promise<string> {
  const d = await db();
  const id = uid();
  const now = new Date().toISOString();
  await d.runAsync(
    'INSERT INTO person_media(id, person_id, type, uri, title, caption, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)',
    id, input.personId, input.type, input.uri, input.title ?? null, input.caption ?? null, now
  );
  return id;
}

export async function listPersonMedia(personId: string): Promise<PersonMedia[]> {
  const d = await db();
  return d.getAllAsync<PersonMedia>(
    'SELECT id, person_id as personId, type, uri, title, caption, created_at as createdAt FROM person_media WHERE person_id = ? ORDER BY created_at DESC',
    personId
  );
}

export async function deletePersonMedia(id: string): Promise<void> {
  const d = await db();
  await d.runAsync('DELETE FROM person_media WHERE id = ?', id);
}
export async function updateRelationshipReview(id: string, status: 'confirmed'|'disputed') { const d = await db(); await d.runAsync('UPDATE relationships SET status=? WHERE id=?',status,id); }
export async function listRelationships(): Promise<FamilyRelationship[]> {
  const d = await db();
  return d.getAllAsync<FamilyRelationship>(`SELECT r.id, a.name as personA, b.name as personB, r.relation, r.status, r.evidence FROM relationships r JOIN people a ON a.id=r.person_a JOIN people b ON b.id=r.person_b ORDER BY r.rowid DESC`);
}
export async function getStats() {
  const d = await db();
  const stories = await d.getFirstAsync<{count:number}>('SELECT COUNT(*) as count FROM stories');
  const people = await d.getFirstAsync<{count:number}>('SELECT COUNT(*) as count FROM people');
  return { stories: stories?.count ?? 0, people: people?.count ?? 0 };
}
export async function archiveContext(question = '') {
  const d = await db();
  const allStories = await d.getAllAsync<{title:string;narrative:string;transcript:string|null;createdAt:string}>('SELECT title,narrative,transcript,created_at as createdAt FROM stories ORDER BY created_at DESC LIMIT 300');
  const terms = question.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 2 && !['what','when','where','which','with','from','about','does','did','have','this','that','tell','show','stories','story','family'].includes(word));
  const stories = allStories.map((story) => { const haystack = `${story.title} ${story.narrative} ${story.transcript ?? ''}`.toLocaleLowerCase(); const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0); return { story, score }; }).sort((a,b) => b.score-a.score || b.story.createdAt.localeCompare(a.story.createdAt)).slice(0,20).map((item) => item.story);
  const people = await listPeople();
  return { stories, people };
}
export async function addSuggestedRelationship(personA: string, personB: string, relation: string, evidence: string) {
  const d = await db();
  await d.runAsync('INSERT INTO relationships(id,person_a,person_b,relation,status,evidence) VALUES(?,?,?,?,?,?)',uid(),personA,personB,relation,'suggested',evidence);
}

export async function listTreeMessages(): Promise<TreeMessage[]> {
  const d = await db();
  return d.getAllAsync<TreeMessage>('SELECT id, role, content, extracted_json as extractedJson, created_at as createdAt FROM tree_messages ORDER BY rowid ASC');
}

export async function saveTreeMessage(role: 'user' | 'assistant', content: string, extractedJson?: string | null): Promise<string> {
  const d = await db();
  const id = uid();
  const now = new Date().toISOString();
  await d.runAsync('INSERT INTO tree_messages(id, role, content, extracted_json, created_at) VALUES(?,?,?,?,?)', id, role, content, extractedJson ?? null, now);
  return id;
}

export async function clearTreeMessages(): Promise<void> {
  const d = await db();
  await d.runAsync('DELETE FROM tree_messages');
}

export async function upsertTreeEntities(
  people: SuggestedPerson[],
  relationships: SuggestedRelationship[]
): Promise<{ addedPeople: number; addedRelationships: number }> {
  const d = await db();
  const now = new Date().toISOString();
  const personIds = new Map<string, string>();
  let addedPeople = 0;
  let addedRelationships = 0;

  for (const p of people) {
    const name = p.name.trim();
    if (!name) continue;
    const existing = await d.getFirstAsync<{ id: string }>('SELECT id FROM people WHERE name = ? COLLATE NOCASE', name);
    if (!existing) {
      const newId = uid();
      await d.runAsync(
        'INSERT INTO people(id, name, relationship, notes, gender, birth_year, birth_place, created_at, review_status) VALUES(?,?,?,?,?,?,?,?,?)',
        newId, name, p.relationshipToNarrator ?? null, p.notes ?? null, p.gender ?? null, p.birthYear ?? null, p.birthPlace ?? null, now, 'confirmed'
      );
      personIds.set(name.toLowerCase(), newId);
      addedPeople++;
    } else {
      personIds.set(name.toLowerCase(), existing.id);
      // Update relationship or details if provided
      if (p.relationshipToNarrator || p.gender || p.birthYear || p.birthPlace) {
        await d.runAsync(
          'UPDATE people SET relationship = COALESCE(?, relationship), gender = COALESCE(?, gender), birth_year = COALESCE(?, birth_year), birth_place = COALESCE(?, birth_place) WHERE id = ?',
          p.relationshipToNarrator ?? null, p.gender ?? null, p.birthYear ?? null, p.birthPlace ?? null, existing.id
        );
      }
    }
  }

  // Pre-load all existing people into map for relationship matching
  const allExisting = await d.getAllAsync<{ id: string; name: string }>('SELECT id, name FROM people');
  for (const person of allExisting) {
    if (!personIds.has(person.name.toLowerCase())) {
      personIds.set(person.name.toLowerCase(), person.id);
    }
  }

  for (const r of relationships) {
    let a = personIds.get(r.personA.trim().toLowerCase());
    let b = personIds.get(r.personB.trim().toLowerCase());

    // If person refers to 'Me' or 'User', make sure a 'Me' profile exists
    if (!a && (r.personA.toLowerCase() === 'me' || r.personA.toLowerCase() === 'i')) {
      const me = await d.getFirstAsync<{ id: string }>('SELECT id FROM people WHERE name = ? COLLATE NOCASE', 'Me');
      if (me) {
        a = me.id;
      } else {
        const meId = uid();
        await d.runAsync('INSERT INTO people(id, name, relationship, created_at, review_status) VALUES(?,?,?,?,?)', meId, 'Me', 'Self', now, 'confirmed');
        a = meId;
        personIds.set('me', meId);
      }
    }
    if (!b && (r.personB.toLowerCase() === 'me' || r.personB.toLowerCase() === 'i')) {
      const me = await d.getFirstAsync<{ id: string }>('SELECT id FROM people WHERE name = ? COLLATE NOCASE', 'Me');
      if (me) {
        b = me.id;
      } else {
        const meId = uid();
        await d.runAsync('INSERT INTO people(id, name, relationship, created_at, review_status) VALUES(?,?,?,?,?)', meId, 'Me', 'Self', now, 'confirmed');
        b = meId;
        personIds.set('me', meId);
      }
    }

    if (a && b && a !== b) {
      // Check if relationship already exists
      const existingRel = await d.getFirstAsync<{ id: string }>(
        'SELECT id FROM relationships WHERE (person_a = ? AND person_b = ? AND relation = ?) OR (person_a = ? AND person_b = ? AND relation = ?)',
        a, b, r.type, b, a, r.type
      );
      if (!existingRel) {
        await d.runAsync(
          'INSERT INTO relationships(id, person_a, person_b, relation, status, evidence) VALUES(?,?,?,?,?,?)',
          uid(), a, b, r.type, 'confirmed', r.evidence ?? 'Stated in tree interview'
        );
        addedRelationships++;
      }
    }
  }

  return { addedPeople, addedRelationships };
}

export async function deletePerson(id: string): Promise<void> {
  const d = await db();
  await d.runAsync('DELETE FROM relationships WHERE person_a = ? OR person_b = ?', id, id);
  await d.runAsync('DELETE FROM story_people WHERE person_id = ?', id);
  await d.runAsync('DELETE FROM people WHERE id = ?', id);
}

export async function deleteRelationship(id: string): Promise<void> {
  const d = await db();
  await d.runAsync('DELETE FROM relationships WHERE id = ?', id);
}

export async function getSetting(key: string): Promise<string | null> {
  try {
    const d = await db();
    const row = await d.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', key);
    return row?.value ?? null;
  } catch (err) {
    console.warn(`Failed to get setting ${key}:`, err);
    return null;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  try {
    const d = await db();
    await d.runAsync('INSERT OR REPLACE INTO app_settings(key, value) VALUES(?, ?)', key, value);
  } catch (err) {
    console.warn(`Failed to set setting ${key}:`, err);
  }
}

// Offline Queue Operations
export interface PendingUpload {
  id: string;
  type: 'audio' | 'story' | 'image';
  localUri: string | null;
  payloadJson: string;
  status: 'queued' | 'uploading' | 'failed' | 'synced';
  retryCount: number;
  errorMsg: string | null;
  createdAt: string;
}

export async function queuePendingUpload(input: {
  type: 'audio' | 'story' | 'image';
  localUri?: string | null;
  payload: Record<string, unknown>;
}): Promise<string> {
  const d = await db();
  const id = uid();
  const now = new Date().toISOString();
  await d.runAsync(
    'INSERT INTO pending_uploads(id, type, local_uri, payload_json, status, retry_count, error_msg, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)',
    id, input.type, input.localUri ?? null, JSON.stringify(input.payload), 'queued', 0, null, now
  );
  return id;
}

export async function listPendingUploads(): Promise<PendingUpload[]> {
  const d = await db();
  return d.getAllAsync<PendingUpload>(
    'SELECT id, type, local_uri as localUri, payload_json as payloadJson, status, retry_count as retryCount, error_msg as errorMsg, created_at as createdAt FROM pending_uploads ORDER BY created_at DESC'
  );
}

export async function updateUploadStatus(
  id: string,
  status: 'queued' | 'uploading' | 'failed' | 'synced',
  errorMsg?: string
): Promise<void> {
  const d = await db();
  await d.runAsync(
    'UPDATE pending_uploads SET status = ?, error_msg = ?, retry_count = retry_count + 1 WHERE id = ?',
    status, errorMsg ?? null, id
  );
}

// Local Fact Suggestions & Review
export interface LocalSuggestion {
  id: string;
  factType: string;
  subjectName: string | null;
  objectName: string | null;
  valueJson: string;
  confidence: number;
  evidenceExcerpt: string;
  status: 'pending' | 'confirmed' | 'rejected';
  createdAt: string;
}

export async function addLocalSuggestion(input: {
  factType: string;
  subjectName?: string | null;
  objectName?: string | null;
  value: Record<string, unknown>;
  confidence: number;
  evidenceExcerpt: string;
}): Promise<string> {
  const d = await db();
  const id = uid();
  const now = new Date().toISOString();
  await d.runAsync(
    'INSERT INTO fact_suggestions(id, fact_type, subject_name, object_name, value_json, confidence, evidence_excerpt, status, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, input.factType, input.subjectName ?? null, input.objectName ?? null, JSON.stringify(input.value), input.confidence, input.evidenceExcerpt, 'pending', now
  );
  return id;
}

export async function listLocalSuggestions(status = 'pending'): Promise<LocalSuggestion[]> {
  const d = await db();
  return d.getAllAsync<LocalSuggestion>(
    'SELECT id, fact_type as factType, subject_name as subjectName, object_name as objectName, value_json as valueJson, confidence, evidence_excerpt as evidenceExcerpt, status, created_at as createdAt FROM fact_suggestions WHERE status = ? ORDER BY created_at DESC',
    status
  );
}

export async function reviewLocalSuggestion(
  id: string,
  status: 'confirmed' | 'rejected'
): Promise<void> {
  const d = await db();
  await d.runAsync('UPDATE fact_suggestions SET status = ? WHERE id = ?', status, id);
}

// Life Events & Timeline
export interface LocalLifeEvent {
  id: string;
  personId: string;
  eventType: string;
  title: string;
  description: string | null;
  eventDate: string | null;
  place: string | null;
  evidence: string | null;
  createdAt: string;
}

export async function addPersonEvent(input: {
  personId: string;
  eventType: string;
  title: string;
  description?: string | null;
  eventDate?: string | null;
  place?: string | null;
  evidence?: string | null;
}): Promise<string> {
  const d = await db();
  const id = uid();
  const now = new Date().toISOString();
  await d.runAsync(
    'INSERT INTO life_events(id, person_id, event_type, title, description, event_date, place, evidence, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, input.personId, input.eventType, input.title, input.description ?? null, input.eventDate ?? null, input.place ?? null, input.evidence ?? null, now
  );
  return id;
}

export async function listPersonEvents(personId: string): Promise<LocalLifeEvent[]> {
  const d = await db();
  return d.getAllAsync<LocalLifeEvent>(
    'SELECT id, person_id as personId, event_type as eventType, title, description, event_date as eventDate, place, evidence, created_at as createdAt FROM life_events WHERE person_id = ? ORDER BY event_date ASC, created_at ASC',
    personId
  );
}

export async function listAllTimelineEvents(): Promise<LocalLifeEvent[]> {
  const d = await db();
  return d.getAllAsync<LocalLifeEvent>(
    'SELECT id, person_id as personId, event_type as eventType, title, description, event_date as eventDate, place, evidence, created_at as createdAt FROM life_events ORDER BY event_date ASC, created_at DESC'
  );
}

// ---------------------------------------------------------------------------
// COMMENTS & SOCIAL LOCAL STORAGE
// ---------------------------------------------------------------------------

export type LocalComment = {
  id: string;
  entityType: string;
  entityId: string;
  authorId: string;
  authorName: string;
  content: string;
  parentId: string | null;
  createdAt: string;
};

export async function saveLocalComment(input: {
  id?: string;
  entityType: string;
  entityId: string;
  authorId: string;
  authorName: string;
  content: string;
  parentId?: string | null;
}): Promise<string> {
  const d = await db();
  const id = input.id || uid();
  const now = new Date().toISOString();
  await d.runAsync(
    'INSERT OR REPLACE INTO memory_comments(id, entity_type, entity_id, author_id, author_name, content, parent_id, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)',
    id, input.entityType, input.entityId, input.authorId, input.authorName, input.content, input.parentId ?? null, now
  );
  return id;
}

export async function listLocalComments(entityType: string, entityId: string): Promise<LocalComment[]> {
  const d = await db();
  return d.getAllAsync<LocalComment>(
    'SELECT id, entity_type as entityType, entity_id as entityId, author_id as authorId, author_name as authorName, content, parent_id as parentId, created_at as createdAt FROM memory_comments WHERE entity_type = ? AND entity_id = ? ORDER BY created_at ASC',
    entityType, entityId
  );
}

export async function deleteLocalComment(id: string): Promise<void> {
  const d = await db();
  await d.runAsync('DELETE FROM memory_comments WHERE id = ?', id);
}

// ---------------------------------------------------------------------------
// REACTIONS LOCAL STORAGE
// ---------------------------------------------------------------------------

export type LocalReaction = {
  id: string;
  entityType: string;
  entityId: string;
  userId: string;
  userName: string;
  reactionType: string;
  createdAt: string;
};

export async function saveLocalReaction(input: {
  entityType: string;
  entityId: string;
  userId: string;
  userName: string;
  reactionType: string;
}): Promise<boolean> {
  const d = await db();
  const existing = await d.getFirstAsync<LocalReaction>(
    'SELECT * FROM memory_reactions WHERE entity_type = ? AND entity_id = ? AND user_id = ? AND reaction_type = ?',
    input.entityType, input.entityId, input.userId, input.reactionType
  );

  if (existing) {
    await d.runAsync(
      'DELETE FROM memory_reactions WHERE entity_type = ? AND entity_id = ? AND user_id = ? AND reaction_type = ?',
      input.entityType, input.entityId, input.userId, input.reactionType
    );
    return false; // untoggled
  } else {
    const id = uid();
    await d.runAsync(
      'INSERT INTO memory_reactions(id, entity_type, entity_id, user_id, user_name, reaction_type, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)',
      id, input.entityType, input.entityId, input.userId, input.userName, input.reactionType, new Date().toISOString()
    );
    return true; // toggled on
  }
}

export async function listLocalReactions(entityType: string, entityId: string): Promise<LocalReaction[]> {
  const d = await db();
  return d.getAllAsync<LocalReaction>(
    'SELECT id, entity_type as entityType, entity_id as entityId, user_id as userId, user_name as userName, reaction_type as reactionType, created_at as createdAt FROM memory_reactions WHERE entity_type = ? AND entity_id = ?',
    entityType, entityId
  );
}

// ---------------------------------------------------------------------------
// CONTRIBUTIONS LOCAL STORAGE
// ---------------------------------------------------------------------------

export type LocalContribution = {
  id: string;
  storyId: string;
  contributorId: string;
  contributorName: string;
  perspectiveText: string;
  photoUrisJson: string | null;
  dateCorrection: string | null;
  createdAt: string;
};

export async function saveLocalContribution(input: {
  id?: string;
  storyId: string;
  contributorId: string;
  contributorName: string;
  perspectiveText: string;
  photoUris?: string[];
  dateCorrection?: string | null;
}): Promise<string> {
  const d = await db();
  const id = input.id || uid();
  const now = new Date().toISOString();
  await d.runAsync(
    'INSERT OR REPLACE INTO memory_contributions(id, story_id, contributor_id, contributor_name, perspective_text, photo_uris_json, date_correction, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)',
    id, input.storyId, input.contributorId, input.contributorName, input.perspectiveText, JSON.stringify(input.photoUris || []), input.dateCorrection ?? null, now
  );
  return id;
}

export async function listLocalContributions(storyId: string): Promise<LocalContribution[]> {
  const d = await db();
  return d.getAllAsync<LocalContribution>(
    'SELECT id, story_id as storyId, contributor_id as contributorId, contributor_name as contributorName, perspective_text as perspectiveText, photo_uris_json as photoUrisJson, date_correction as dateCorrection, created_at as createdAt FROM memory_contributions WHERE story_id = ? ORDER BY created_at ASC',
    storyId
  );
}

// ---------------------------------------------------------------------------
// NOTIFICATIONS LOCAL STORAGE
// ---------------------------------------------------------------------------

export type LocalNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: string;
};

export async function saveLocalNotification(input: {
  id?: string;
  type: string;
  title: string;
  body: string;
  linkUrl?: string | null;
}): Promise<string> {
  const d = await db();
  const id = input.id || uid();
  const now = new Date().toISOString();
  await d.runAsync(
    'INSERT OR REPLACE INTO user_notifications(id, type, title, body, link_url, is_read, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)',
    id, input.type, input.title, input.body, input.linkUrl ?? null, 0, now
  );
  return id;
}

export async function listLocalNotifications(): Promise<LocalNotification[]> {
  const d = await db();
  return d.getAllAsync<LocalNotification>(
    'SELECT id, type, title, body, link_url as linkUrl, is_read as isRead, created_at as createdAt FROM user_notifications ORDER BY created_at DESC LIMIT 50'
  );
}

export async function markLocalNotificationRead(id: string): Promise<void> {
  const d = await db();
  await d.runAsync('UPDATE user_notifications SET is_read = 1 WHERE id = ?', id);
}

export async function markAllLocalNotificationsRead(): Promise<void> {
  const d = await db();
  await d.runAsync('UPDATE user_notifications SET is_read = 1');
}
