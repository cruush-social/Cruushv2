# Side Quests

Every Side Quest cruush can award, read from `server/src/side-quests.ts`. Each is
claimed once. Claiming scratches off a reward card.

| Quest | What earns it | Reward |
|---|---|---|
| `complete_tutorial` | Complete the tutorial | 1 Pulse |
| `view_profile` | View a profile | 1 Pulse |
| `send_ping` | Send your first Pulse | 1 Pulse |
| `send_cruush` | Send your first cruush | 1 Pulse |
| `send_message` | Send your first message | 1 day of cruush+ |
| `post_feed` | Make your first Feed post | 1 day of cruush+ |
| `upload_first_photo` | Upload your first profile photo | 1 Pulse |
| `complete_profile` | Finish your profile | 2 Pulses |
| `upload_four_photos` | Upload four profile photos | 3 Pulses |
| `first_mutual_cruush` | Make your first mutual cruush | 1 day of cruush+ |
| `send_three_messages` | Send three messages | 2 Pulses |
| `post_three_feed` | Make three Feed posts | 2 Pulses |
| `check_in_spot` | Check in at a Spot | 1 Pulse |
| `post_spot_board` | Post on a Spot board | 1 day of cruush+ |
| `rate_spot` | Rate your first Spot | 1 Pulse |
| `save_visibility_set` | Save a Visibility set | 2 Pulses |

16 quests in total: 18 Pulses and 4 days of cruush+ if every one is claimed.

Claiming is rate limited: one claim per day, and cruush+ day rewards are also
capped per week (`cruushPlusWeeklyLimit`, currently 2).
