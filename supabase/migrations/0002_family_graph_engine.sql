-- Yesterday v0.4: convert the original family-member-as-person model into
-- separate people and authenticated family membership tables.
-- Apply after 0001_memory_schema.sql in a Supabase project.

-- Preserve existing person rows and relationship foreign keys.
alter table family_members rename to people;
alter table people add constraint people_family_id_id_unique unique (family_id, id);
alter table relationships rename column person_a_id to from_person_id;
alter table relationships rename column person_b_id to to_person_id;
alter table relationships rename column confirmation_status to status;
alter table relationships add column if not exists created_at timestamptz not null default now();
alter table relationships add column if not exists reviewed_by uuid references auth.users(id) on delete set null;
alter table relationships add column if not exists reviewed_at timestamptz;
alter table relationships add constraint relationships_from_same_family_fk foreign key (family_id, from_person_id) references people(family_id, id) on delete cascade;
alter table relationships add constraint relationships_to_same_family_fk foreign key (family_id, to_person_id) references people(family_id, id) on delete cascade;
-- Keep legacy free-text relationship labels intact; new API writes use a validated vocabulary.

alter table families add column if not exists owner_user_id uuid references auth.users(id) on delete set null;

alter table people add column if not exists gender text;
alter table people add column if not exists birth_date date;
alter table people add column if not exists death_date date;
alter table people add column if not exists updated_at timestamptz not null default now();
alter table people add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table memories add constraint memories_family_id_id_unique unique (family_id, id);
alter table memory_episodes add constraint memory_episodes_family_id_id_unique unique (family_id, id);

-- A membership row is an authenticated user’s access to a family archive.
create table family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'contributor' check (role in ('owner','admin','contributor','reviewer','viewer')),
  status text not null default 'active' check (status in ('invited','active','suspended')),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  unique (family_id, user_id)
);

create table person_aliases (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  alias text not null check (char_length(alias) between 1 and 120),
  normalized_alias text generated always as (lower(regexp_replace(trim(alias), '[[:space:]]+', ' ', 'g'))) stored,
  language text,
  source_memory_id uuid references memories(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (person_id, normalized_alias),
  foreign key (family_id, person_id) references people(family_id, id) on delete cascade,
  foreign key (family_id, source_memory_id) references memories(family_id, id)
);

alter table memory_episode_sources add column family_id uuid;
update memory_episode_sources mes set family_id = me.family_id from memory_episodes me where me.id = mes.episode_id;
alter table memory_episode_sources alter column family_id set not null;
alter table memory_episode_sources add constraint memory_episode_sources_family_fk foreign key (family_id) references families(id) on delete cascade;
alter table memory_episode_sources add constraint memory_episode_sources_memory_family_fk foreign key (family_id, memory_id) references memories(family_id, id) on delete cascade;
alter table memory_episode_sources add constraint memory_episode_sources_episode_family_fk foreign key (family_id, episode_id) references memory_episodes(family_id, id) on delete cascade;

create table conversations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text,
  interview_mode text not null default 'family_introduction'
    check (interview_mode in ('family_introduction','life_stories','person_interview','memory_discovery')),
  visibility text not null default 'private' check (visibility in ('private','family')),
  status text not null default 'active' check (status in ('active','completed','archived')),
  subject_person_id uuid references people(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (family_id, subject_person_id) references people(family_id, id)
);

alter table conversations add constraint conversations_family_id_id_unique unique (family_id, id);

create table conversation_messages (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_type text not null check (sender_type in ('user','assistant','system')),
  content text not null,
  source_memory_id uuid references memories(id) on delete set null,
  sequence_number integer not null,
  created_at timestamptz not null default now(),
  unique (conversation_id, sequence_number),
  unique (family_id, id),
  foreign key (family_id, conversation_id) references conversations(family_id, id) on delete cascade,
  foreign key (family_id, source_memory_id) references memories(family_id, id)
);

-- A fact claim is an atomic assertion. Its evidence and review state are separate.
create table fact_suggestions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  fact_type text not null check (fact_type in ('person_identity','relationship','date','place','event','alias','other')),
  subject_person_id uuid references people(id) on delete set null,
  object_person_id uuid references people(id) on delete set null,
  proposed_value jsonb not null default '{}'::jsonb,
  confidence numeric(4,3) check (confidence between 0 and 1),
  status text not null default 'pending' check (status in ('pending','confirmed','rejected','disputed','superseded')),
  extraction_model text,
  created_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (family_id, subject_person_id) references people(family_id, id),
  foreign key (family_id, object_person_id) references people(family_id, id)
);

alter table fact_suggestions add constraint fact_suggestions_family_id_id_unique unique (family_id, id);

create table fact_evidence (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  suggestion_id uuid not null references fact_suggestions(id) on delete cascade,
  memory_id uuid references memories(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,
  message_id uuid references conversation_messages(id) on delete set null,
  excerpt text not null,
  start_ms integer check (start_ms is null or start_ms >= 0),
  end_ms integer check (end_ms is null or end_ms >= 0),
  contributor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_ms is null or start_ms is null or end_ms >= start_ms),
  check (memory_id is not null or conversation_id is not null or message_id is not null),
  foreign key (family_id, suggestion_id) references fact_suggestions(family_id, id) on delete cascade,
  foreign key (family_id, memory_id) references memories(family_id, id),
  foreign key (family_id, conversation_id) references conversations(family_id, id),
  foreign key (family_id, message_id) references conversation_messages(family_id, id)
);

create table person_merge_candidates (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  person_a_id uuid not null references people(id) on delete cascade,
  person_b_id uuid not null references people(id) on delete cascade,
  reason text not null,
  confidence numeric(4,3) check (confidence between 0 and 1),
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (person_a_id <> person_b_id),
  foreign key (family_id, person_a_id) references people(family_id, id) on delete cascade,
  foreign key (family_id, person_b_id) references people(family_id, id) on delete cascade
);

create table family_audit_logs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index people_family_name_idx on people(family_id, lower(display_name));
create index relationships_family_from_idx on relationships(family_id, from_person_id);
create index relationships_family_to_idx on relationships(family_id, to_person_id);
create index person_aliases_family_alias_idx on person_aliases(family_id, normalized_alias);
create index conversations_family_updated_idx on conversations(family_id, updated_at desc);
create index conversation_messages_conversation_seq_idx on conversation_messages(conversation_id, sequence_number);
create index fact_suggestions_family_status_idx on fact_suggestions(family_id, status, created_at desc);
create index fact_evidence_suggestion_idx on fact_evidence(suggestion_id);

-- Security-definer helpers avoid recursive RLS evaluation on family_members.
create or replace function public.is_active_family_member(target_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.family_members fm
    where fm.family_id = target_family_id
      and fm.user_id = auth.uid()
      and fm.status = 'active'
  );
$$;

create or replace function public.has_family_role(target_family_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.family_members fm
    where fm.family_id = target_family_id
      and fm.user_id = auth.uid()
      and fm.status = 'active'
      and fm.role = any(allowed_roles)
  );
$$;

revoke all on function public.is_active_family_member(uuid) from public;
revoke all on function public.has_family_role(uuid, text[]) from public;
grant execute on function public.is_active_family_member(uuid) to authenticated;
grant execute on function public.has_family_role(uuid, text[]) to authenticated;

alter table families enable row level security;
alter table family_members enable row level security;
alter table people enable row level security;
alter table relationships enable row level security;
alter table person_aliases enable row level security;
alter table memories enable row level security;
alter table memory_episodes enable row level security;
alter table memory_episode_sources enable row level security;
alter table memory_embeddings enable row level security;
alter table conversations enable row level security;
alter table conversation_messages enable row level security;
alter table fact_suggestions enable row level security;
alter table fact_evidence enable row level security;
alter table person_merge_candidates enable row level security;
alter table family_audit_logs enable row level security;

create policy family_select_member on families for select to authenticated
  using (public.is_active_family_member(id) or owner_user_id = auth.uid());
create policy family_insert_owner on families for insert to authenticated
  with check (owner_user_id = auth.uid());
create policy family_update_admin on families for update to authenticated
  using (public.has_family_role(id, array['owner','admin']))
  with check (public.has_family_role(id, array['owner','admin']));

create policy family_members_select on family_members for select to authenticated
  using (user_id = auth.uid() or public.is_active_family_member(family_id));
-- Owner self-membership is the only client-side membership insert. Invitations and
-- role changes are trusted-server operations and cannot be self-assigned by clients.
create policy family_members_insert_owner_self on family_members for insert to authenticated
  with check (user_id = auth.uid() and role = 'owner' and exists (
    select 1 from families f where f.id = family_members.family_id and f.owner_user_id = auth.uid()
  ));

create policy people_select on people for select to authenticated
  using (public.is_active_family_member(family_id));
create policy people_insert on people for insert to authenticated
  with check (public.has_family_role(family_id, array['owner','admin','contributor']));
create policy people_update on people for update to authenticated
  using (public.has_family_role(family_id, array['owner','admin','contributor']))
  with check (public.has_family_role(family_id, array['owner','admin','contributor']));
create policy people_delete on people for delete to authenticated
  using (public.has_family_role(family_id, array['owner','admin']));

create policy relationships_select on relationships for select to authenticated
  using (public.is_active_family_member(family_id));
create policy relationships_insert on relationships for insert to authenticated
  with check (public.has_family_role(family_id, array['owner','admin','contributor']));
create policy relationships_update on relationships for update to authenticated
  using (public.has_family_role(family_id, array['owner','admin','reviewer']))
  with check (public.has_family_role(family_id, array['owner','admin','reviewer']));
create policy relationships_delete on relationships for delete to authenticated
  using (public.has_family_role(family_id, array['owner','admin']));

create policy aliases_select on person_aliases for select to authenticated
  using (public.is_active_family_member(family_id));
create policy aliases_insert on person_aliases for insert to authenticated
  with check (public.has_family_role(family_id, array['owner','admin','contributor']));
create policy aliases_update on person_aliases for update to authenticated
  using (public.has_family_role(family_id, array['owner','admin']))
  with check (public.has_family_role(family_id, array['owner','admin']));
create policy aliases_delete on person_aliases for delete to authenticated
  using (public.has_family_role(family_id, array['owner','admin']));

create policy memories_select on memories for select to authenticated
  using (public.is_active_family_member(family_id));
create policy memories_insert on memories for insert to authenticated
  with check (public.has_family_role(family_id, array['owner','admin','contributor']));
create policy memories_update on memories for update to authenticated
  using (public.has_family_role(family_id, array['owner','admin','contributor']))
  with check (public.has_family_role(family_id, array['owner','admin','contributor']));
create policy memories_delete on memories for delete to authenticated
  using (public.has_family_role(family_id, array['owner','admin']));

create policy episodes_select on memory_episodes for select to authenticated
  using (public.is_active_family_member(family_id));
create policy episodes_insert on memory_episodes for insert to authenticated
  with check (public.has_family_role(family_id, array['owner','admin','contributor']));
create policy episodes_update on memory_episodes for update to authenticated
  using (public.has_family_role(family_id, array['owner','admin','reviewer']))
  with check (public.has_family_role(family_id, array['owner','admin','reviewer']));
create policy episodes_delete on memory_episodes for delete to authenticated
  using (public.has_family_role(family_id, array['owner','admin']));

create policy episode_sources_select on memory_episode_sources for select to authenticated
  using (public.is_active_family_member(family_id));
create policy episode_sources_insert on memory_episode_sources for insert to authenticated
  with check (public.has_family_role(family_id, array['owner','admin','contributor']));
create policy episode_sources_delete on memory_episode_sources for delete to authenticated
  using (public.has_family_role(family_id, array['owner','admin']));

create policy embeddings_select on memory_embeddings for select to authenticated
  using (public.is_active_family_member(family_id));
create policy embeddings_insert on memory_embeddings for insert to authenticated
  with check (public.has_family_role(family_id, array['owner','admin','contributor']));
create policy embeddings_delete on memory_embeddings for delete to authenticated
  using (public.has_family_role(family_id, array['owner','admin']));

create policy conversations_select on conversations for select to authenticated
  using (public.is_active_family_member(family_id) and (visibility = 'family' or created_by = auth.uid()));
create policy conversations_insert on conversations for insert to authenticated
  with check (public.is_active_family_member(family_id) and created_by = auth.uid());
create policy conversations_update on conversations for update to authenticated
  using (public.is_active_family_member(family_id) and (created_by = auth.uid() or public.has_family_role(family_id, array['owner','admin'])))
  with check (public.is_active_family_member(family_id) and (created_by = auth.uid() or public.has_family_role(family_id, array['owner','admin'])));
create policy conversations_delete on conversations for delete to authenticated
  using (public.is_active_family_member(family_id) and (created_by = auth.uid() or public.has_family_role(family_id, array['owner','admin'])));

create policy messages_select on conversation_messages for select to authenticated
  using (public.is_active_family_member(family_id) and exists (
    select 1 from conversations c where c.id = conversation_id and (c.visibility = 'family' or c.created_by = auth.uid())
  ));
create policy messages_insert on conversation_messages for insert to authenticated
  with check (public.is_active_family_member(family_id) and exists (
    select 1 from conversations c where c.id = conversation_id and c.created_by = auth.uid()
  ));
create policy messages_delete on conversation_messages for delete to authenticated
  using (public.is_active_family_member(family_id) and (public.has_family_role(family_id, array['owner','admin']) or exists (
    select 1 from conversations c where c.id = conversation_id and c.created_by = auth.uid()
  )));

create policy suggestions_select on fact_suggestions for select to authenticated
  using (public.is_active_family_member(family_id));
create policy suggestions_insert on fact_suggestions for insert to authenticated
  with check (public.has_family_role(family_id, array['owner','admin','contributor']));
create policy suggestions_update on fact_suggestions for update to authenticated
  using (public.has_family_role(family_id, array['owner','admin','reviewer']))
  with check (public.has_family_role(family_id, array['owner','admin','reviewer']));
create policy suggestions_delete on fact_suggestions for delete to authenticated
  using (public.has_family_role(family_id, array['owner','admin']));

create policy evidence_select on fact_evidence for select to authenticated
  using (public.is_active_family_member(family_id));
create policy evidence_insert on fact_evidence for insert to authenticated
  with check (public.has_family_role(family_id, array['owner','admin','contributor']));
create policy evidence_delete on fact_evidence for delete to authenticated
  using (public.has_family_role(family_id, array['owner','admin']));

create policy merge_candidates_select on person_merge_candidates for select to authenticated
  using (public.is_active_family_member(family_id));
create policy merge_candidates_insert on person_merge_candidates for insert to authenticated
  with check (public.has_family_role(family_id, array['owner','admin','contributor']));
create policy merge_candidates_update on person_merge_candidates for update to authenticated
  using (public.has_family_role(family_id, array['owner','admin','reviewer']))
  with check (public.has_family_role(family_id, array['owner','admin','reviewer']));
create policy merge_candidates_delete on person_merge_candidates for delete to authenticated
  using (public.has_family_role(family_id, array['owner','admin']));

create policy audit_logs_select on family_audit_logs for select to authenticated
  using (public.is_active_family_member(family_id));
create policy audit_logs_insert on family_audit_logs for insert to authenticated
  with check (public.is_active_family_member(family_id) and actor_user_id = auth.uid());

-- Owner/membership creation and invitations still require trusted server flows.
