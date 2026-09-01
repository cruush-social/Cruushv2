# cruush design decisions

- Feed photo previews are 64px hearts, matching the approved sample page. One photo uses one heart. Two or three photos use separate equal-size hearts in one horizontal row with visible gaps. They never weld, overlap, cluster, or grow to the 80px map-heart size.
- Color-blind mode is an Accessibility toggle. Navigation-size and map-pin-size controls are not part of 1.6.
- Feed search searches Feed post tags only. It does not search member names, profiles, or post text.
- Feed reactions and replies are not part of 1.6. Do not build either.
- GitHub issue #135 is not a 1.6 release item. Do not invent or change checkbox visuals for it.
- The Spot board is called the Pink Book. Its section sits below source attribution. Check-in includes an optional Pink Book post. An active check-in is required to read other members' posts, but authors can always view and delete their own posts after checkout.
- Badge categories must be explicit on mobile, never discoverable only by horizontal scrolling. Preserve every deliberately selected custom, Hanky, role, position, and Pride badge glyph. Saved side badges sit beneath the heart photo on Feed, Messages, and Cruushes.
