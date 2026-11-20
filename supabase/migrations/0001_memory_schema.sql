create extension if not exists vector;

create table if not exists families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

create table if not exists family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  display_name text not null,
  birth_year integer,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists relationships (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  person_a_id uuid not null references family_members(id) on delete cascade,
  person_b_id uuid not null references family_members(id) on delete cascade,
  relationship_type text not null,
  confirmation_status text not null default 'suggested' check (confirmation_status in ('suggested','confirmed','disputed')),
  evidence jsonb not null default '[]'::jsonb,
  check (person_a_id <> person_b_id)
);

create table if not exists memories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  source_type text not null check (source_type in ('audio','image','video','text','document')),
  original_object_key text,
  original_local_only boolean not null default true,
  title text,
  transcript text,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists memory_episodes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  title text not null,
  narrative text not null,
  event_start date,
  event_end date,
  review_status text not null default 'suggested' check (review_status in ('suggested','confirmed','disputed')),
  facts_to_confirm jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists memory_episode_sources (
  episode_id uuid not null references memory_episodes(id) on delete cascade,
  memory_id uuid not null references memories(id) on delete cascade,
  start_ms integer,
  end_ms integer,
  excerpt text,
  primary key (episode_id, memory_id, start_ms)
);

-- 768 dimensions match the configured Gemini embedding output dimensionality.
create table if not exists memory_embeddings (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  episode_id uuid references memory_episodes(id) on delete cascade,
  source_id uuid references memories(id) on delete cascade,
  content text not null,
  embedding vector(768) not null,
  embedding_model text not null,
  created_at timestamptz not null default now(),
  check (episode_id is not null or source_id is not null)
);

create index if not exists memory_embeddings_family_idx on memory_embeddings(family_id);
create index if not exists memory_embeddings_vector_idx on memory_embeddings using hnsw (embedding vector_cosine_ops);
create index if not exists memories_family_created_idx on memories(family_id, created_at desc);
