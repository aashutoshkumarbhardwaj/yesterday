# Family Graph Engine — v0.4 foundation

## What this milestone adds

- A normalized graph schema that separates people from authenticated family membership.
- Person aliases for names, nicknames and kinship terms.
- Atomic fact suggestions with source evidence and review state.
- Conversation/message tables with private-by-default visibility.
- A deterministic identity resolver: exact aliases can be linked; fuzzy matches are candidates only.
- Relationship validation for missing mentions, self-edges and ancestry cycles.
- `POST /v1/graph/analyze-conversation`, which extracts and validates graph proposals but deliberately does not persist or confirm them.

## Important migration note

Apply `0001_memory_schema.sql` and then `0002_family_graph_engine.sql` to a disposable Supabase project first. Migration 0002 renames the original `family_members` table to `people`, because v0.3 used that table name for relatives rather than authenticated app users. It then creates a new `family_members` membership table tied to `auth.users`.

Existing families have no authenticated owner in v0.3. The migration leaves `owner_user_id` null rather than guessing who owns them. Before enabling cloud access for an existing archive, assign its owner through a trusted administrative migration after verifying the account. Do not expose orphaned family rows to clients.

The RLS policies are intentionally restrictive and role-aware: contributors can propose content, reviewers can review graph claims, and only owners/admins can manage membership or delete core records. The role values exist in the schema, but trusted invitation and role-management endpoints are not part of this milestone. The initial family owner membership must be created by a trusted server operation. Family invitations and role changes require a trusted RPC/API operation; a client cannot grant itself admin access. Conversation visibility defaults to `private`; only its creator can read private conversation content. A family-visible conversation can be read by active family members.

## Analyze a conversation

`POST /v1/graph/analyze-conversation`

Request:

```json
{
  "source": "My Dadi Sushila had two brothers. My mother told me she grew up near Lucknow.",
  "existingPeople": [
    { "id": "person-uuid", "displayName": "Sushila Devi", "aliases": ["Dadi"] }
  ],
  "existingRelationships": []
}
```

Response includes:

- `extraction`: structured people, relationships and follow-up questions.
- `resolutions`: exact matches, candidate reviews, new-person suggestions or ambiguous matches.
- `validationIssues`: graph consistency issues.
- `persistence: not_persisted`: explicit signal that this endpoint does not write to the database.
- `reviewRequired: true`: no AI suggestion is automatically confirmed.

Every relationship's `evidenceText` must be an exact source substring or it is removed. Fuzzy name similarity never automatically merges two people. Names, aliases and relationship labels not present in the source are discarded from the proposal; free-form person notes are not accepted as verified facts.

## Run tests

```bash
pnpm --filter @yesterday/api test
pnpm --filter @yesterday/api typecheck
```

## Still not implemented

- Supabase client/repository and durable API persistence.
- Authenticated request identity and trusted family creation/invitation endpoints.
- Conversation UI and guided interview state machine.
- Interactive mobile graph visualization.
- Review APIs that commit suggestions to confirmed graph state.

Do not deploy the API publicly based on this milestone alone. The existing API's optional shared-token guard is development-only, not user authentication or family-level authorization.
