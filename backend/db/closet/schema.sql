-- Fresh installations only. Existing databases use the migrations in order.
BEGIN;

CREATE TABLE public.user_info (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_name text,
    nick_name text,
    email text,
    auth_provider text NOT NULL,
    provider_user_id text NOT NULL,
    preferred_styles text[] NOT NULL DEFAULT '{}',
    status text NOT NULL DEFAULT 'ACTIVE',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (auth_provider, provider_user_id)
);

CREATE TABLE public.closet_items (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES public.user_info(id),
    name varchar(50),
    category text NOT NULL,
    subcategory text,
    color text NOT NULL,
    color_hex varchar(7) CHECK (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
    material text,
    styles text[] NOT NULL DEFAULT '{}',
    tags text[] NOT NULL DEFAULT '{}',
    memo text,
    meta_json jsonb,
    image_blob text,
    status text NOT NULL,
    disp_yn char(1) NOT NULL DEFAULT 'Y',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT closet_items_status_chk CHECK (status IN ('DRAFT', 'CONFIRMED')),
    CONSTRAINT closet_items_disp_yn_chk CHECK (disp_yn IN ('Y', 'N'))
);

CREATE INDEX closet_items_user_id_idx ON public.closet_items (user_id);

COMMIT;
