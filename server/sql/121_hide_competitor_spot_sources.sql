update places
set source_url = null,
    source_attribution = null,
    updated_at = now()
where lower(coalesce(source_url, '')) like '%sniffies.com%';
