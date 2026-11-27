-- Apply after 003, before deploying code that writes recommend_yn.
BEGIN;

ALTER TABLE public.closet_items
    ADD COLUMN recommend_yn char(1) NOT NULL DEFAULT 'Y',
    ADD CONSTRAINT closet_items_recommend_yn_chk CHECK (recommend_yn IN ('Y', 'N'));

COMMIT;
