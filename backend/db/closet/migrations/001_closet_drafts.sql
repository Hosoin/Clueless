-- Apply once, before deploying code that reads closet_items.status or disp_yn.
-- Existing rows keep their contents and start CONFIRMED, visible, and unnamed.
BEGIN;

ALTER TABLE public.closet_items
    ADD COLUMN status text NOT NULL DEFAULT 'CONFIRMED',
    ADD COLUMN name varchar(50),
    ADD COLUMN disp_yn char(1) NOT NULL DEFAULT 'Y',
    ADD CONSTRAINT closet_items_status_chk CHECK (status IN ('DRAFT', 'CONFIRMED')),
    ADD CONSTRAINT closet_items_disp_yn_chk CHECK (disp_yn IN ('Y', 'N'));

COMMIT;
