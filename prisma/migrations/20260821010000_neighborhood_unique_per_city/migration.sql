-- Neighbourhood names were unique across the whole platform, so the second
-- city with an "Industrial Area" could not have one. That blocks expansion
-- within Rwanda — Musanze, Rubavu — before it ever blocks another country.
DROP INDEX IF EXISTS "neighborhoods_name_key";

CREATE UNIQUE INDEX "neighborhoods_name_city_key" ON "neighborhoods"("name", "city");
