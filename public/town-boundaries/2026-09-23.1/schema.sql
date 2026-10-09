CREATE TABLE town (
  id INTEGER PRIMARY KEY,
  area_id TEXT NOT NULL UNIQUE,
  division_id TEXT,
  name TEXT,
  subtype TEXT,
  country TEXT,
  region TEXT,
  geometry_zlib BLOB NOT NULL
);
CREATE VIRTUAL TABLE bounds USING rtree(id,xmin,xmax,ymin,ymax);
