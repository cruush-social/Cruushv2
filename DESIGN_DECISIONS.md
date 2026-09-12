# cruush design decisions

- Feed photo previews are 64px hearts, matching the approved sample page. One photo uses one heart. Two or three photos use separate equal-size hearts in one horizontal row with visible gaps. They never weld, overlap, cluster, or grow to the 80px map-heart size.
- Color-blind mode is an Accessibility toggle. Navigation-size and map-pin-size controls are not part of 1.6.
- Feed search searches Feed post tags only. It does not search member names, profiles, or post text.
- Feed reactions and replies are not part of 1.6. Do not build either.
- GitHub issue #135 is not a 1.6 release item. Do not invent or change checkbox visuals for it.
- The Spot board is called the Pink Book. Its section sits below source attribution. Check-in includes an optional Pink Book post. An active check-in is required to read other members' posts, but authors can always view and delete their own posts after checkout.
- Badge categories must be explicit on mobile, never discoverable only by horizontal scrolling. Preserve every deliberately selected custom, Hanky, role, position, and Pride badge glyph. Saved side badges sit beneath the heart photo on Feed, Messages, and Cruushes.
- Profile Tags are a separate field directly below Bio. They are moderated with the rest of the profile, display directly below About, and match the shared Seeking and Visibility text search with or without a leading `#`.
- Basic members can save up to 3 profile tags. cruush+ members can save up to 10. Basic Feed posts are text-only; cruush+ Feed posts can attach up to 3 photo hearts.
- Circular numbered map clusters are people-only and open only those profiles. Spot clusters stay separate, use the blue diamond Spot style, and open only those Spots.
- Profile protection answers always keep their field labels so repeated values such as "yes" remain understandable.
- Every benefit card on the cruush+ page uses the bright product gradient.
- A person's saved badge borders always use the exact same resolved color as their heart border. While MHC is active, both use the approved sky color `#77B9DA` across the app. Travel distance text, including `Far far away`, never overlaps identity actions.
- On cruush activity cards, identity plus last-active and distance stay centered beside the heart and Badges, with compact actions at right. Messages keeps its message-preview spacing. Marketing mock previews use gradient hearts instead of profile photos or photo placeholders.
- Mile High Club is a full page on mobile. On desktop it may replace Settings inside the existing map popup because desktop Settings itself is embedded there; it must not open a second popup.
- On mobile Spot detail, Here now and rating summaries stay compact so Pink Book and Who's Here appear in the initial screen.


## Historical crypto checkout decisions, September 12, 2026

Source: Julien's current session `01a095c7-d9c8-7d51-980b-24acbc0daf99` requests a longer payment window on the latest processor handoff branch, confirms 24 hours and fresh orders after method changes, and clarifies that copies means in-app text plus the blog.

- New payment windows default to 24 hours; preserve previously issued deadlines.
- Changing payment method cancels an unpaid order and resets checkout; starting the replacement checkout creates a fresh order, address and timer. Preserve received/confirming-payment handling.
- Venmo uses the existing PYUSD/Ethereum rail. Keep PayPal/PYUSD Arbitrum, Cash App/USDC Arbitrum, and compatible wallets/USDC Base.
- Preserve Cash App stablecoin availability for eligible users, including New Jersey and Pennsylvania. New York and other jurisdictions without Cash App stablecoins require another Cash App path. Bitcoin integration is requested and remains pending in this checkpoint.
- Bitcoin orders must lock their BTC amount at creation, including mandatory estimated collection cost; later market movement must not change an issued quote. Implementation and funding setup remain pending.
- Customers pay the mandatory collection fee. Research actual Cash App, PayPal and Venmo sending-fee quotes before claiming one guaranteed upfront funding amount. An estimate of a public-chain fee is not a quote from a custodial app.
- Blog voice is casual, positive founder prose. Crypto was always planned; circumstances accelerated it. Fixed-term crypto purchases do not auto-renew. Name Feeld as a shared-provider reference without naming the moderation provider in public copy. Include profiles/messages screened for trafficking, CSAM, hateful symbols and abuse; avoid unsupported market-wide superiority claims.

- Sending-fee quote research and integration scope is Cash App, Venmo and PayPal only. No MoonPay or new customer apps/accounts. Other wallets must explicitly state that sending fees are not included and the customer determines and covers them in their chosen wallet. Checkout must distinguish the included processing/collection fee from the app’s sending fee; never label an unquoted fee as zero or included. Source: Julien’s September 12 continuation in the same session.

- Latest September 12 clarification: Bitcoin must be offered for Cash App, PayPal and Venmo, while preserving their stablecoin options. Estimated total costs are acceptable; embedded purchasing, a partner integration and an exact provider quote are not prerequisites to that estimation work. Keep the exact amount cruush receives separate from the estimated customer balance needed. A particular flat allowance and the Bitcoin confirmation threshold remain undecided; no numeric policy has been approved.

## Current processor decisions, September 12, 2026

Source: Julien's session `01a095c7-d9c8-7d51-980b-24acbc0daf99`, including “okay so lets do 6”, “first do the code work ... then ill set up the bitcoin”, “dont do blog”, and the final two-amount instructions. These supersede the pending/undecided checkpoints above.

- Deliver the real Bitcoin, stablecoin, settlement and automatic-forwarding implementation for local testing, security review and production. Owner Bitcoin/private setup follows code completion. No mock or canary-only substitute.
- Native Bitcoin serves Cash App, PayPal and Venmo and requires six canonical confirmations. Display observed confirmation progress; do not derive it from elapsed time. Lock the BTC amount at order issuance.
- Preserve the 24-hour arrival window and fresh order/address/timer after changing method. Confirmation may finish after the arrival deadline.
- Automatically forward paid receiving-address funds to ELLIPAL through the separate signing service. No manual per-order collection. Website holds public keys only; the service never uses ELLIPAL recovery words.
- The exact recipient amount includes product price and cruush's quoted automatic-collection cost. Show a different suggested available balance that adds a generous named-app sending allowance. Unused allowance stays in the customer's app. This supersedes the earlier request to collect the surplus.
- The implemented estimate uses a $5 floor, or $10 for Venmo/Ethereum, 10% of product price rounded upward to dollars, and three times the observed collection cost, whichever is largest. It is a balance estimate, not a provider quote or guaranteed maximum. See `docs/crypto-checkout-fees.md` for every item and option.
- Generic wallets have no sender-fee estimate; users determine and cover that fee in their wallet. No MoonPay or new customer signup flow.
- Apply the shared processor to `/store` and `/store/pulse`. Add Pulse checkout links from the cruush+ information page and cruush+ checkout, and a cruush+ checkout link from Pulse. Preserve unrelated controls and styles. No group-Pulse work.
- Fixed-term subscriptions never auto-renew; Pulse credits are a one-time purchase. Blog work is deferred by Julien; preserve its draft.
