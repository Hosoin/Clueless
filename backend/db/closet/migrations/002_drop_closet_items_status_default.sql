-- Apply after 001_closet_drafts.sql. Writers must supply a status explicitly.
BEGIN;

ALTER TABLE public.closet_items ALTER COLUMN status DROP DEFAULT;

COMMIT;
