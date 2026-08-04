// DL Mode masks a person's primary photo wherever that person is rendered, so
// every list that returns `photo` also has to return whether that photo was
// classified explicit. This emits the same lookup the profile endpoints use.
export function primaryPhotoExplicitSelect(profileAlias: string, alias = "photo_explicit") {
  return `coalesce((
    select media.explicit_classification = 'explicit'
    from media_objects media
    where media.owner_user_id = ${profileAlias}.id
      and media.public_url = ${profileAlias}.photos[1]
      and media.surface = 'profile_photo'
      and media.deleted_at is null
    limit 1
  ), false) as ${alias}`;
}

// Same lookup where the owner id lives on a different table than the photos
// array (feed posts, cruush rows, conversation participants).
export function primaryPhotoExplicitSelectFor(
  ownerAlias: string,
  ownerIdColumn: string,
  profileAlias: string,
  alias = "photo_explicit"
) {
  return `coalesce((
    select media.explicit_classification = 'explicit'
    from media_objects media
    where media.owner_user_id = ${ownerAlias}.${ownerIdColumn}
      and media.public_url = ${profileAlias}.photos[1]
      and media.surface = 'profile_photo'
      and media.deleted_at is null
    limit 1
  ), false) as ${alias}`;
}
