# Yesterday

A private, conversation-first family history archive. Yesterday helps families preserve oral histories and gradually build an evidence-backed family graph. It does not require users to upload their entire photo library.

## v0.4 — Family Graph Foundation

This build starts the first v0.4 milestone on top of the v0.3 local archive:

- A Supabase migration that separates people from authenticated family membership.
- Person aliases, conversations, messages, fact suggestions, evidence, merge candidates and audit logs.
- Restrictive family-scoped Row Level Security policies.
- A structured Gemini family-graph extraction endpoint.
- Deterministic identity resolution: exact alias matches can be linked; fuzzy matches require review.
- Validation for self-relationships, missing person references and ancestry cycles.
- Exact-source evidence checking before a relationship proposal is returned.
- Tests for identity resolution, evidence grounding and graph validation.

The graph analysis endpoint is intentionally proposal-only. It does not persist people, merge identities or confirm relationships. Durable cloud repositories, auth-backed family creation/invitations, the conversation UI and the interactive graph screen are the next milestones.

## Stack

- Mobile: Expo + React Native + TypeScript + Expo Router + SQLite.
- API: Fastify + TypeScript + Zod.
- Transcription: Sarvam.
- Structured extraction and story drafts: Gemini.
- Cloud data: Supabase PostgreSQL with Row Level Security.
- Optional media storage: Cloudflare R2 (not enabled by this milestone).

## Requirements

- Node.js 22.13+ for Expo SDK 58.
- pnpm 10.
- A Gemini API key for graph extraction.
- Supabase project only when applying the cloud schema; the current local mobile archive can still run without cloud persistence.

## Install

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env
```

Add provider keys to `apps/api/.env`. Never put provider keys in mobile environment variables. Set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` to the API machine's LAN IP when using a physical phone.

## Start

```bash
pnpm dev:api
pnpm dev:mobile
```

API health: `http://localhost:3333/health`

## Test the graph engine

```bash
pnpm --filter @yesterday/api test
pnpm --filter @yesterday/api typecheck
```

## Supabase migration

Apply these in order in a disposable Supabase project first:

1. `supabase/migrations/0001_memory_schema.sql`
2. `supabase/migrations/0002_family_graph_engine.sql`

Migration 0002 renames the old v0.3 `family_members` table to `people` and creates a new `family_members` table for authenticated users. Existing family archives have no known owner; `owner_user_id` remains null until an administrator explicitly assigns ownership. Do not guess ownership or expose those rows.

See `docs/family-graph-engine.md` for API payloads, migration details, security constraints and current limitations.

## Product safety rules

1. Original recordings and photos remain immutable.
2. AI facts and relationships are suggestions until reviewed.
3. Every claim must retain source evidence.
4. Similar names are not enough to merge people.
5. Contradictory family accounts are preserved, not silently overwritten.
6. Conversations are private by default; contributors choose what becomes family-visible.
7. Obtain consent before sending relatives' voices or private content to external AI providers.
8. Never clone or impersonate a relative's voice by default.

## Not production-ready

This is a development milestone, not a deployable multi-family service. The existing API's optional shared-token guard is not authentication. Supabase persistence, authenticated API identity, trusted family creation/invitations, durable suggestion review, sync, rate limits, quotas, privacy workflows and full security testing remain to be implemented. Do not expose the API publicly yet.
