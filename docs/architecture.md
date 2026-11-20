# Yesterday architecture — milestone 1

## Client
- Expo SDK 58 + React Native + TypeScript.
- Keep the binary free of model weights. The app records audio to its document directory and selects photos using the OS picker.
- AI is opt-in per action; local capture and viewing must not require a network connection.

## API
- Fastify + TypeScript is retained for the first working integration so the current starter can be extended without a backend rewrite.
- Provider keys live only on the API server.
- `/v1/ai/transcribe`: Sarvam Saaras v4 synchronous REST for audio <=30 seconds. `/v1/ai/transcribe/batch` and its status route handle longer audio with speaker diarization and chunk timestamps.
- `/v1/ai/understand-image`: Gemini multimodal image understanding.
- `/v1/ai/generate-story`: evidence-constrained story draft generation.
- `/v1/ai/embed`: Gemini embedding output, 768 dimensions.
- `/v1/ai/providers`: provider configuration status, never returns secrets.

## Audio workflow
Short recordings use the synchronous REST endpoint. Longer recordings use Sarvam Batch: initiate, presigned upload, start, poll, download. The mobile recorder selects the route using its duration. The batch poller currently waits up to three minutes while the recording remains saved locally.

## Data
The Supabase migration adds family, people, relationships, memories, episodes, source links and pgvector embeddings. It is a schema only; auth, RLS policies, persistence APIs and storage uploads are not yet wired.

## Evidence rules
- Image descriptions are observations, not identities.
- The model must not infer who a person is or their family relationship from appearance.
- Generated stories are drafts and expose facts that require family confirmation.
- Preserve the original recording/photo; derived AI outputs never replace source media.
