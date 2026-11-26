-- Apply after 002. User-selected swatches are separate from ML metadata.
BEGIN;

ALTER TABLE public.closet_items
    ADD COLUMN color_hex varchar(7) CHECK (color_hex ~ '^#[0-9A-Fa-f]{6}$');

COMMIT;
