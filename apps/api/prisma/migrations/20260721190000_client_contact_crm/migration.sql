-- Add approved client CRM contact and location fields without changing existing data.
ALTER TABLE "Client"
  ADD COLUMN "website" TEXT,
  ADD COLUMN "mainPhone" TEXT,
  ADD COLUMN "country" TEXT,
  ADD COLUMN "city" TEXT;

CREATE INDEX "Client_industry_idx" ON "Client"("industry");
CREATE INDEX "Client_country_idx" ON "Client"("country");
CREATE INDEX "Client_city_idx" ON "Client"("city");
