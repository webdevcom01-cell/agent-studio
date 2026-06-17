DO $$ BEGIN
  IF to_regclass('"SomaReviewPost"') IS NOT NULL THEN
    ALTER TABLE "SomaReviewPost" ADD COLUMN IF NOT EXISTS "qualityFlags" JSONB;
  END IF;
END $$;
