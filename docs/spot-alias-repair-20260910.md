# Spot alias duplicate repair

Current item: SPOT-ALIASES-20260910, active.

User source: current thread 01a08cc1-59ca-7ae1-b080-d59c8761f139, attachment batch 83235029-709f-4afe-ad33-9bbee1189309: “I still see duplicate spots like this”. Both supplied screenshots show Lincoln Terrace and Lincoln Terrace aka Arthur Somers Park.

Prior authority: /Users/julienlenaz/.codex/sessions/2026/09/08/rollout-2026-09-08T15-32-27-01a08281-ec99-7630-b7a1-fbbcb8575d5e.jsonl, user rows 6823 (remove alternate-spelling duplicates), 18465 (repeat duplicate cleanup), 18891 (“Deploy”), 19262 (comb more thoroughly), and 19888 (preserve public parks/gyms). Current report reopens incomplete alias cleanup.

Worktree: /Volumes/good/cruush-spot-alias-duplicates-20260910, branch fix/spot-alias-duplicates-20260910, baseline d29a1cf. Existing dirty work in other checkouts remains untouched. The inherited task contract is preserved locally in .ai-task-inherited.json; unrelated queue items remain owned by their existing sessions.

Scope: inspect complete current published Spot list for the reported alias mechanism; archive only confirmed imported duplicates with recoverable records, preserving survivor fields and member data. No new UI, name, coordinate, category, or privacy changes.

Evidence: user screenshots confirm two pins. Exact source coordinates imply 388.59 metres separation. Migration 152 uses 0.0014-degree axis cutoffs, excluding this pair. Current import replay uses ON CONFLICT DO NOTHING and must remain unchanged.

Next action: fetch fresh live records, review exact alias targets, prepare and verify a guarded migration. Current task has no other added requests. Broader existing queue remains in docs/bug-queue-20260908.md.

Fresh production discovery: 4,085 records, exactly one title containing an explicit aka/also-known-as/formerly alias. Both Lincoln records are published. Read-only production queries found no member references for either record across the member tables. Each has one imported amenity; popular-time baselines have 28 rows for Lincoln Terrace and 21 for the fuller title. These source records remain intact.

Reviewed target: archive 4d7674b5-fb45-5c58-aa0d-eab754f8d30d, retain b7d34990-a819-5159-a24e-64197ff8c7b7. Names, IDs, slugs, park category, provenance, coordinates and published survivor are guarded in migration 159. NYC Parks lists both names as B054: https://council.nyc.gov/public-advocate/park-funding/.

## Final reviewed scope

All 4,085 published records were scanned. A normalized word-prefix search within 1,000 metres produced 45 candidate pairs. Primary venue evidence confirmed 11; 34 ambiguous pairs remain untouched. Explicit aka/parenthetical checks found no additional confirmed alias pair. This is a bounded alias check, not a claim that every possible duplicate is gone.

| Archive import | Retain venue | Identity evidence |
| --- | --- | --- |
| Nowadays  Bar (`80749d5a-cbda-4ae4-87e6-9ce64706f261`) | Nowadays (`10000000-0000-4000-8000-000000000014`) | https://nowadays.nyc/location/ |
| Adult World - Montgomeryville (`087031b3-35d6-55b5-8fb6-ae7afe7d3104`) | Adult World (`3d8eb14e-2583-43da-88a1-13e01084cc69`) | https://www.adultworldx.com/our-stores/ |
| Adult World - Quakertown (`3787c4c6-2781-5f0f-9c1c-9798b8b1c260`) | Adult World (`322abf19-ffdc-4d4a-9b53-7a731626e72e`) | https://www.adultworldx.com/our-stores/ |
| Partners Cafe (`16e02537-97cd-4f82-a60c-e17ebb702fc5`) | Partners (`23099cf4-a119-4ce1-936d-04b4d42c71b7`) | https://partnersnewhaven.com/ |
| YMCA Bedford (`d01d20ec-1404-4e00-8a07-cf914c33ce4b`) | YMCA (`1c6ba87b-0b5d-453e-9370-f717bc79e1fd`) | https://ymcanyc.org/locations; https://www.ymca.org/locations/bedford-stuyvesant-branch-ymca |
| YMCA- westfield (`3c9552a8-2509-435d-b1a5-b459ad0b9282`) | YMCA (`45b0ca7c-9ac0-4d16-8f16-02c983a3e632`) | https://www.westfieldynj.org/locations/westfield-area-ymca-main-facility |
| Romantix Adult Boutique (`fa42eb4b-7a00-5183-b9b4-218279009861`) | Romantix (`78110c0c-2693-4d55-94e9-a57d5f3dbc74`) | https://www.romantix.com/pages/romantix-bridgeport-ct-6606-410-north-ave |
| Purgatory Bar (`250f0b39-3ed8-4791-8c6d-875a96858d6f`) | Purgatory (`11800000-0000-4000-8000-000000000009`) | https://a856-cityrecord.nyc.gov/RequestDetail/20250318004 |
| YMCA Bethlehem (`962d3602-2e21-4fbd-87f8-331f339d3916`) | YMCA (`e97e1347-ca37-4b5b-8cb5-edfb4f1436da`) | https://www.ymcarivercrossing.org/locations/bethlehem |
| Citi Field Mets (`137f4247-d81b-5dba-8dc8-df7d9a551dd8`) | Citi Field (`a4eca2a4-076e-4a1d-940f-df6d91fb3704`) | https://www.mlb.com/mets/official-information/contact |
| Lincoln Terrace (`4d7674b5-fb45-5c58-aa0d-eab754f8d30d`) | Lincoln Terrace aka Arthur Somers Park (`b7d34990-a819-5159-a24e-64197ff8c7b7`) |  |

Read-only production checks covered all 22 archived/retained IDs and every public table with a place_id column. No member data exists for these pairs; imported amenities, tags and popular-time baselines are preserved. Before-state hashes: evidence/member-references-before.json.

Focused real PostgreSQL verification passed: 11 exact archives, all 4,074 other input rows unchanged, member row retained, original backups stable, exact current import INSERT blocks replayed without republication, changed identity/moved location/unpublished survivor skipped, original high-precision coordinates accepted. Verification script and JSON are in evidence/. Client build passed. The required pnpm filter command matched no workspace; the actual server tsc build was run successfully with pnpm --dir server build. Casing, copy and security checks passed.

Release changes: SQL migration159, its registry entry, necessary task/evidence records, and shell version v124. No environment variables added, removed or changed. No app presentation source changed. Live deployment and fresh route verification are pending.

Independent review passed all 11 manifest rows and all 22 live identities; no scope/safety findings. Final wording removes the internal reviewer reference from the Lincoln backup reason only. No app layout source changes exist; the automatic layout gate would start a dev server and was not run under the standing no-server-start boundary. Actual production route renders are the relevant visual check.
