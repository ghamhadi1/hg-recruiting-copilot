-- =====================================================================
-- HG- AI Recruiting Copilot — Supabase schema
-- Paste this whole file into Supabase → SQL Editor → Run. Safe to re-run.
-- All tables have RLS ON with no policies: only the service_role key
-- (used server-side by n8n and the portal) can read/write.
-- =====================================================================

create extension if not exists vector;
create extension if not exists pg_trgm;

-- ---------- tables ----------------------------------------------------

create table if not exists hg_settings (
  key   text primary key,
  value jsonb not null
);

create table if not exists hg_candidates (
  id            bigserial primary key,
  full_name     text not null,
  name_key      text,
  email         text,
  phone         text,
  phone_digits  text,
  location      text,
  timezone      text,
  headline      text,
  total_years   numeric,
  languages     jsonb not null default '[]',   -- [{"language":"Arabic","level":"native"}]
  skills        jsonb not null default '[]',   -- [{"name":"GoHighLevel","years":5}]
  current_cv_id bigint,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists hg_candidates_email_idx on hg_candidates (lower(email));
create index if not exists hg_candidates_phone_idx on hg_candidates (phone_digits);
create index if not exists hg_candidates_name_idx  on hg_candidates (name_key);

create table if not exists hg_cvs (
  id                bigserial primary key,
  candidate_id      bigint references hg_candidates(id) on delete set null,
  file_name         text not null,
  file_type         text,
  text_hash         text,
  raw_text          text,
  extraction_method text,                      -- text | ocr | none
  cv_date           date,                      -- "last updated" date found in the CV
  status            text not null check (status in ('active','superseded','duplicate','older_version','unreadable')),
  status_note       text,
  profile           jsonb,
  replaced_by       bigint references hg_cvs(id),
  uploaded_at       timestamptz not null default now()
);
create index if not exists hg_cvs_hash_idx on hg_cvs (text_hash);
create index if not exists hg_cvs_status_idx on hg_cvs (status);

alter table hg_candidates drop constraint if exists hg_candidates_current_cv_fk;
alter table hg_candidates add constraint hg_candidates_current_cv_fk
  foreign key (current_cv_id) references hg_cvs(id) on delete set null;

create table if not exists hg_cv_chunks (
  id           bigserial primary key,
  cv_id        bigint not null references hg_cvs(id) on delete cascade,
  candidate_id bigint not null references hg_candidates(id) on delete cascade,
  chunk_index  int not null,
  content      text not null,
  embedding    vector(1536) not null
);
create index if not exists hg_cv_chunks_cand_idx on hg_cv_chunks (candidate_id);

create table if not exists hg_roles (
  id            bigserial primary key,
  title         text not null,
  client_name   text,
  client_email  text,
  transcript    text,
  jd            jsonb,           -- structured job description
  jd_markdown   text,
  search_query  text,            -- plain-English query used for the auto-shortlist
  status        text not null default 'pending_approval'
                check (status in ('pending_approval','approved','rejected','changes_requested','closed')),
  version       int not null default 1,
  feedback      text,
  slack_channel text,
  slack_ts      text,
  decided_by    text,
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);

create table if not exists hg_searches (
  id         bigserial primary key,
  question   text not null,
  role_id    bigint references hg_roles(id) on delete set null,
  source     text,                -- slack | portal | eval | auto
  parsed     jsonb,
  no_match   boolean not null default false,
  message    text,
  created_at timestamptz not null default now()
);

create table if not exists hg_shortlist (
  id                 bigserial primary key,
  search_id          bigint references hg_searches(id) on delete cascade,
  role_id            bigint references hg_roles(id) on delete set null,
  candidate_id       bigint not null references hg_candidates(id) on delete cascade,
  cv_id              bigint references hg_cvs(id),
  cv_file_name       text not null,    -- every recommendation names its CV
  rank               int,
  score              int,
  reason             text,
  evidence           text,
  status             text not null default 'suggested' check (status in ('suggested','approved','rejected')),
  decided_by         text,
  decided_at         timestamptz,
  ghl_contact_id     text,
  ghl_opportunity_id text,
  created_at         timestamptz not null default now()
);
create index if not exists hg_shortlist_role_idx on hg_shortlist (role_id);

create table if not exists hg_outreach (
  id               bigserial primary key,
  shortlist_id     bigint not null unique references hg_shortlist(id) on delete cascade,
  candidate_id     bigint not null references hg_candidates(id) on delete cascade,
  role_id          bigint not null references hg_roles(id) on delete cascade,
  to_email         text not null,
  step             int not null default 0,     -- emails already sent
  max_steps        int not null default 3,
  next_send_at     timestamptz,
  locked_until     timestamptz,
  status           text not null default 'active' check (status in ('active','replied','completed','stopped')),
  thread_id        text,
  sent_message_ids text[] not null default '{}',
  last_sent_at     timestamptz,
  replied_at       timestamptz,
  stopped_reason   text,
  created_at       timestamptz not null default now()
);
create index if not exists hg_outreach_thread_idx on hg_outreach (thread_id);

create table if not exists hg_events (
  id         bigserial primary key,
  kind       text not null,
  message    text not null,
  data       jsonb,
  created_at timestamptz not null default now()
);

create table if not exists hg_eval_questions (
  id               int primary key,
  question         text not null,
  expected_answer  text not null,
  must_include     text[] not null default '{}',
  must_not_include text[] not null default '{}',
  required_cv      jsonb not null default '{}',
  expect_no_match  boolean not null default false,
  tests            text
);

create table if not exists hg_eval_runs (
  id          bigserial primary key,
  status      text not null default 'running',
  score       int,
  total       int,
  results     jsonb,
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);

-- RLS on, no policies → anon/authenticated keys get nothing.
do $$ declare t text; begin
  foreach t in array array['hg_settings','hg_candidates','hg_cvs','hg_cv_chunks','hg_roles','hg_searches',
                           'hg_shortlist','hg_outreach','hg_events','hg_eval_questions','hg_eval_runs'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ---------- default settings (setup script overwrites the blanks) -------
insert into hg_settings(key, value) values
  ('openai_model',            '"gpt-4.1-mini"'),
  ('embedding_model',         '"text-embedding-3-small"'),
  ('match_threshold',         '60'),
  ('test_mode',               'true'),
  ('test_recipient',          '""'),
  ('followup_delays_minutes', '[4320, 5760]'),
  ('sender_name',             '"HG Talent Team"'),
  ('slack_channel_id',        '""'),
  ('slack_verification_token','""'),
  ('ghl_location_id',         '""'),
  ('ghl_pipeline_id',         '""'),
  ('ghl_stage_ids',           '{}'),
  ('portal_url',              '""'),
  ('n8n_base_url',            '""')
on conflict (key) do nothing;

-- ---------- helpers ---------------------------------------------------

create or replace function hg_norm_name(p text) returns text language sql immutable as $$
  select nullif(regexp_replace(lower(regexp_replace(coalesce(p,''), '[^A-Za-z ]', '', 'g')), '\s+', ' ', 'g'), '')
$$;

create or replace function hg_parse_date(p text) returns date language plpgsql immutable as $$
begin
  if p is null or p = '' then return null; end if;
  if p ~ '^\d{4}-\d{2}$' then return (p || '-01')::date; end if;
  return p::date;
exception when others then return null;
end $$;

create or replace function hg_setting(p_key text) returns jsonb language sql stable as $$
  select value from hg_settings where key = p_key
$$;

create or replace function hg_log(p_kind text, p_message text, p_data jsonb default null)
returns void language sql as $$
  insert into hg_events(kind, message, data) values (p_kind, p_message, p_data)
$$;

-- ---------- CV ingest: dedup + "updated CV replaces old" ----------------
-- p = {file_name, file_type, raw_text, extraction_method, unreadable, unreadable_reason,
--      profile:{full_name,email,phone,location,timezone,headline,total_years,languages,skills,cv_date},
--      chunks:[{content, embedding:[...1536 floats]}]}
create or replace function hg_ingest_cv(p jsonb) returns jsonb language plpgsql as $$
declare
  prof     jsonb := coalesce(p->'profile', '{}');
  v_text   text  := coalesce(p->>'raw_text', '');
  v_hash   text;
  v_email  text  := lower(nullif(trim(prof->>'email'), ''));
  v_digits text  := right(regexp_replace(coalesce(prof->>'phone', ''), '\D', '', 'g'), 9);
  v_name   text  := hg_norm_name(prof->>'full_name');
  v_date   date  := hg_parse_date(prof->>'cv_date');
  v_cand   hg_candidates%rowtype;
  v_cur    hg_cvs%rowtype;
  v_found  boolean := false;
  v_match  text;
  v_cv_id  bigint;
  v_dup_of bigint;
  v_dup_cand bigint;
  v_new_d  date;
  v_cur_d  date;
begin
  -- 1. unreadable → flag loudly, never skip silently
  if coalesce((p->>'unreadable')::boolean, false) then
    insert into hg_cvs(file_name, file_type, raw_text, extraction_method, status, status_note)
    values (p->>'file_name', p->>'file_type', v_text, p->>'extraction_method', 'unreadable',
            coalesce(p->>'unreadable_reason', 'No readable text'))
    returning id into v_cv_id;
    perform hg_log('cv_unreadable', 'Unreadable CV: ' || (p->>'file_name'),
                   jsonb_build_object('cv_id', v_cv_id, 'reason', p->>'unreadable_reason'));
    return jsonb_build_object('action', 'unreadable', 'cv_id', v_cv_id, 'file_name', p->>'file_name',
                              'reason', coalesce(p->>'unreadable_reason', 'No readable text'));
  end if;

  -- 2. byte/text-identical file already stored
  v_hash := md5(regexp_replace(lower(v_text), '\s+', '', 'g'));
  select id, candidate_id into v_dup_of, v_dup_cand from hg_cvs
   where text_hash = v_hash and status <> 'unreadable' order by id limit 1;
  if v_dup_of is not null then
    insert into hg_cvs(candidate_id, file_name, file_type, text_hash, raw_text, extraction_method, status, status_note, profile)
    values (v_dup_cand, p->>'file_name', p->>'file_type', v_hash, v_text, p->>'extraction_method', 'duplicate',
            'Identical content to CV #' || v_dup_of, prof)
    returning id into v_cv_id;
    perform hg_log('cv_duplicate', 'Duplicate file ignored: ' || (p->>'file_name'), jsonb_build_object('cv_id', v_cv_id, 'same_as', v_dup_of));
    return jsonb_build_object('action', 'duplicate_file', 'cv_id', v_cv_id, 'same_as_cv_id', v_dup_of, 'candidate_id', v_dup_cand);
  end if;

  -- 3. is this a person we already know? email → phone → normalised name
  if v_email is not null then
    select * into v_cand from hg_candidates where lower(email) = v_email order by id limit 1;
    if found then v_found := true; v_match := 'email'; end if;
  end if;
  if not v_found and length(v_digits) >= 8 then
    select * into v_cand from hg_candidates where phone_digits = v_digits order by id limit 1;
    if found then v_found := true; v_match := 'phone'; end if;
  end if;
  if not v_found and v_name is not null then
    select * into v_cand from hg_candidates where name_key = v_name order by id limit 1;
    if found then v_found := true; v_match := 'name'; end if;
  end if;

  if not v_found then
    insert into hg_candidates(full_name, name_key, email, phone, phone_digits, location, timezone, headline,
                              total_years, languages, skills)
    values (coalesce(prof->>'full_name', p->>'file_name'), v_name, v_email, prof->>'phone', nullif(v_digits, ''),
            prof->>'location', prof->>'timezone', prof->>'headline', nullif(prof->>'total_years', '')::numeric,
            coalesce(prof->'languages', '[]'), coalesce(prof->'skills', '[]'))
    returning * into v_cand;
    insert into hg_cvs(candidate_id, file_name, file_type, text_hash, raw_text, extraction_method, cv_date, status, profile)
    values (v_cand.id, p->>'file_name', p->>'file_type', v_hash, v_text, p->>'extraction_method', v_date, 'active', prof)
    returning id into v_cv_id;
    insert into hg_cv_chunks(cv_id, candidate_id, chunk_index, content, embedding)
    select v_cv_id, v_cand.id, (c.ord - 1)::int, c.val->>'content', (c.val->'embedding')::text::vector
      from jsonb_array_elements(coalesce(p->'chunks', '[]')) with ordinality as c(val, ord);
    update hg_candidates set current_cv_id = v_cv_id where id = v_cand.id;
    return jsonb_build_object('action', 'new', 'cv_id', v_cv_id, 'candidate_id', v_cand.id, 'name', v_cand.full_name);
  end if;

  -- 4. known person: newer CV wins, same CV = duplicate, older = kept for history only
  select * into v_cur from hg_cvs where id = v_cand.current_cv_id;
  v_new_d := coalesce(v_date, current_date);
  v_cur_d := coalesce(v_cur.cv_date, v_cur.uploaded_at::date, date '1900-01-01');

  if v_cur.id is null or v_new_d > v_cur_d
     -- same date: < 0.75 text similarity = a different CV (calibrated: same CV in another format 0.84-0.91,
     -- updated CV 0.61-0.68, other person 0.35; see tests/calibrate_similarity.py)
     or (v_new_d = v_cur_d and similarity(v_text, coalesce(v_cur.raw_text, '')) < 0.75) then
    insert into hg_cvs(candidate_id, file_name, file_type, text_hash, raw_text, extraction_method, cv_date, status, profile)
    values (v_cand.id, p->>'file_name', p->>'file_type', v_hash, v_text, p->>'extraction_method', v_date, 'active', prof)
    returning id into v_cv_id;
    if v_cur.id is not null then
      update hg_cvs set status = 'superseded', replaced_by = v_cv_id,
             status_note = 'Replaced by newer CV ' || (p->>'file_name') where id = v_cur.id;
      delete from hg_cv_chunks where cv_id = v_cur.id;   -- old CV can never be searched again
    end if;
    insert into hg_cv_chunks(cv_id, candidate_id, chunk_index, content, embedding)
    select v_cv_id, v_cand.id, (c.ord - 1)::int, c.val->>'content', (c.val->'embedding')::text::vector
      from jsonb_array_elements(coalesce(p->'chunks', '[]')) with ordinality as c(val, ord);
    update hg_candidates set
      full_name = coalesce(prof->>'full_name', full_name), name_key = coalesce(v_name, name_key),
      email = coalesce(v_email, email), phone = coalesce(prof->>'phone', phone),
      phone_digits = coalesce(nullif(v_digits, ''), phone_digits), location = coalesce(prof->>'location', location),
      timezone = coalesce(prof->>'timezone', timezone), headline = coalesce(prof->>'headline', headline),
      total_years = coalesce(nullif(prof->>'total_years', '')::numeric, total_years),
      languages = coalesce(prof->'languages', languages), skills = coalesce(prof->'skills', skills),
      current_cv_id = v_cv_id, updated_at = now()
    where id = v_cand.id;
    perform hg_log('cv_replaced', v_cand.full_name || ': ' || coalesce(v_cur.file_name, '?') || ' replaced by ' || (p->>'file_name'),
                   jsonb_build_object('candidate_id', v_cand.id, 'old_cv_id', v_cur.id, 'new_cv_id', v_cv_id, 'matched_by', v_match));
    return jsonb_build_object('action', 'replaced', 'cv_id', v_cv_id, 'old_cv_id', v_cur.id, 'old_file', v_cur.file_name,
                              'candidate_id', v_cand.id, 'name', v_cand.full_name, 'matched_by', v_match);
  elsif v_new_d = v_cur_d then
    insert into hg_cvs(candidate_id, file_name, file_type, text_hash, raw_text, extraction_method, cv_date, status, status_note, profile)
    values (v_cand.id, p->>'file_name', p->>'file_type', v_hash, v_text, p->>'extraction_method', v_date, 'duplicate',
            'Same person (matched by ' || v_match || ') and same CV as ' || v_cur.file_name, prof)
    returning id into v_cv_id;
    perform hg_log('cv_duplicate', v_cand.full_name || ' sent the same CV twice: ' || (p->>'file_name'),
                   jsonb_build_object('candidate_id', v_cand.id, 'cv_id', v_cv_id, 'matched_by', v_match));
    return jsonb_build_object('action', 'duplicate_person', 'cv_id', v_cv_id, 'candidate_id', v_cand.id,
                              'name', v_cand.full_name, 'matched_by', v_match, 'kept_file', v_cur.file_name);
  else
    insert into hg_cvs(candidate_id, file_name, file_type, text_hash, raw_text, extraction_method, cv_date, status, status_note, profile)
    values (v_cand.id, p->>'file_name', p->>'file_type', v_hash, v_text, p->>'extraction_method', v_date, 'older_version',
            'Older than current CV ' || v_cur.file_name, prof)
    returning id into v_cv_id;
    perform hg_log('cv_older', v_cand.full_name || ': older CV ignored ' || (p->>'file_name'),
                   jsonb_build_object('candidate_id', v_cand.id, 'cv_id', v_cv_id));
    return jsonb_build_object('action', 'older_ignored', 'cv_id', v_cv_id, 'candidate_id', v_cand.id,
                              'name', v_cand.full_name, 'kept_file', v_cur.file_name);
  end if;
end $$;

-- ---------- hybrid search: keyword hits + vector similarity ------------
create or replace function hg_search_candidates(p_embedding vector(1536), p_terms text[] default '{}', p_limit int default 25)
returns table (candidate_id bigint, full_name text, email text, location text, headline text, total_years numeric,
               languages jsonb, skills jsonb, cv_id bigint, cv_file_name text, similarity double precision,
               keyword_hits int, cv_text text)
language sql stable as $$
  with active as (
    select c.*, v.id as v_id, v.file_name as v_file, v.raw_text as v_text
      from hg_candidates c join hg_cvs v on v.id = c.current_cv_id and v.status = 'active'
  ), sim as (
    select ch.candidate_id, max(1 - (ch.embedding <=> p_embedding)) as s
      from hg_cv_chunks ch join active a on a.v_id = ch.cv_id
     group by ch.candidate_id
  )
  select a.id, a.full_name, a.email, a.location, a.headline, a.total_years, a.languages, a.skills,
         a.v_id, a.v_file, coalesce(sim.s, 0)::double precision,
         (select count(*) from unnest(coalesce(p_terms, '{}')) t
           where length(t) > 1 and (a.v_text ilike '%' || t || '%' or a.skills::text ilike '%' || t || '%'
                                    or a.languages::text ilike '%' || t || '%'))::int as hits,
         left(a.v_text, 6000)
    from active a left join sim on sim.candidate_id = a.id
   order by hits desc, coalesce(sim.s, 0) desc
   limit p_limit
$$;

-- ---------- save a search + its shortlist -----------------------------
-- p = {question, role_id, source, parsed, no_match, message, results:[{candidate_id, cv_id, cv_file_name, rank, score, reason, evidence}]}
create or replace function hg_save_search(p jsonb) returns jsonb language plpgsql as $$
declare v_search bigint; v_role bigint := nullif(p->>'role_id', '')::bigint; v_items jsonb;
begin
  insert into hg_searches(question, role_id, source, parsed, no_match, message)
  values (p->>'question', v_role, p->>'source', p->'parsed', coalesce((p->>'no_match')::boolean, false), p->>'message')
  returning id into v_search;
  if v_role is not null then
    delete from hg_shortlist where role_id = v_role and status = 'suggested';   -- newest shortlist wins
  end if;
  with ins as (
    insert into hg_shortlist(search_id, role_id, candidate_id, cv_id, cv_file_name, rank, score, reason, evidence)
    select v_search, v_role, (r->>'candidate_id')::bigint, nullif(r->>'cv_id', '')::bigint, r->>'cv_file_name',
           (r->>'rank')::int, (r->>'score')::int, r->>'reason', r->>'evidence'
      from jsonb_array_elements(coalesce(p->'results', '[]')) r
    returning id, candidate_id, rank
  )
  select coalesce(jsonb_agg(jsonb_build_object('shortlist_id', id, 'candidate_id', candidate_id, 'rank', rank) order by rank), '[]')
    into v_items from ins;
  return jsonb_build_object('search_id', v_search, 'items', v_items);
end $$;

-- ---------- roles ---------------------------------------------------------
create or replace function hg_role_save(p jsonb) returns jsonb language plpgsql as $$
declare r hg_roles%rowtype; v_id bigint := nullif(p->>'id', '')::bigint;
begin
  if v_id is null then
    insert into hg_roles(title, client_name, client_email, transcript, jd, jd_markdown, search_query)
    values (p->>'title', p->>'client_name', p->>'client_email', p->>'transcript', p->'jd', p->>'jd_markdown', p->>'search_query')
    returning * into r;
  else
    update hg_roles set title = p->>'title', jd = p->'jd', jd_markdown = p->>'jd_markdown',
           search_query = p->>'search_query', status = 'pending_approval', version = version + 1
     where id = v_id returning * into r;
  end if;
  perform hg_log('jd_created', 'JD v' || r.version || ' for ' || r.title || ' waiting for approval', jsonb_build_object('role_id', r.id));
  return to_jsonb(r);
end $$;

create or replace function hg_role_set_slack(p_role_id bigint, p_channel text, p_ts text) returns void language sql as $$
  update hg_roles set slack_channel = p_channel, slack_ts = p_ts where id = p_role_id
$$;

-- decision: approve | reject | changes. Only a pending JD can be decided (double clicks are no-ops).
create or replace function hg_role_decide(p_role_id bigint, p_decision text, p_user text, p_feedback text default null)
returns jsonb language plpgsql as $$
declare r hg_roles%rowtype;
begin
  update hg_roles set
    status = case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'changes_requested' end,
    decided_by = p_user, decided_at = now(), feedback = coalesce(p_feedback, feedback)
  where id = p_role_id and status = 'pending_approval'
  returning * into r;
  if not found then
    select * into r from hg_roles where id = p_role_id;
    return jsonb_build_object('ok', false, 'already', true, 'role', to_jsonb(r));
  end if;
  perform hg_log('jd_' || p_decision, r.title || ': ' || p_decision || ' by ' || p_user, jsonb_build_object('role_id', r.id));
  return jsonb_build_object('ok', true, 'already', false, 'role', to_jsonb(r));
end $$;

-- ---------- candidate approval (the gate before any outreach) -------------
create or replace function hg_candidate_decide(p_shortlist_id bigint, p_decision text, p_user text, p_role_id bigint default null)
returns jsonb language plpgsql as $$
declare s hg_shortlist%rowtype; r hg_roles%rowtype; c hg_candidates%rowtype; v_role bigint; v_prev bigint;
begin
  select * into s from hg_shortlist where id = p_shortlist_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'Shortlist item not found'); end if;
  select * into c from hg_candidates where id = s.candidate_id;

  if p_decision = 'reject' then
    if s.status = 'approved' then
      return jsonb_build_object('ok', false, 'error', c.full_name || ' is already approved; stop outreach in the portal instead');
    end if;
    update hg_shortlist set status = 'rejected', decided_by = p_user, decided_at = now() where id = s.id;
    perform hg_log('candidate_rejected', c.full_name || ' rejected by ' || p_user, jsonb_build_object('shortlist_id', s.id));
    return jsonb_build_object('ok', true, 'already', false, 'decision', 'reject', 'candidate', to_jsonb(c));
  end if;

  if s.status = 'approved' then
    return jsonb_build_object('ok', true, 'already', true, 'candidate', to_jsonb(c));
  end if;
  v_role := coalesce(s.role_id, p_role_id);
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Pick a role first: outreach needs a role');
  end if;
  select * into r from hg_roles where id = v_role;
  if r.status <> 'approved' then
    return jsonb_build_object('ok', false, 'error', 'The JD for "' || r.title || '" is not approved yet');
  end if;
  -- same person already approved for this role from another search → do not start a 2nd sequence
  select id into v_prev from hg_shortlist
   where candidate_id = s.candidate_id and role_id = v_role and status = 'approved' and id <> s.id limit 1;
  update hg_shortlist set status = 'approved', role_id = v_role, decided_by = p_user, decided_at = now() where id = s.id;
  if v_prev is not null then
    return jsonb_build_object('ok', true, 'already', true, 'candidate', to_jsonb(c));
  end if;
  perform hg_log('candidate_approved', c.full_name || ' approved for ' || r.title || ' by ' || p_user,
                 jsonb_build_object('shortlist_id', s.id, 'role_id', r.id));
  return jsonb_build_object('ok', true, 'already', false, 'decision', 'approve', 'shortlist_id', s.id,
         'candidate', to_jsonb(c) - 'name_key', 'role', jsonb_build_object('id', r.id, 'title', r.title, 'client_name', r.client_name),
         'reason', s.reason, 'cv_file_name', s.cv_file_name);
end $$;

-- after GHL contact/opportunity exist: queue the sequence (idempotent)
create or replace function hg_start_outreach(p_shortlist_id bigint, p_contact_id text, p_opportunity_id text)
returns jsonb language plpgsql as $$
declare s hg_shortlist%rowtype; c hg_candidates%rowtype; v_to text; v_test text; o hg_outreach%rowtype;
begin
  update hg_shortlist set ghl_contact_id = p_contact_id, ghl_opportunity_id = p_opportunity_id
   where id = p_shortlist_id and status = 'approved' returning * into s;
  if not found then return jsonb_build_object('ok', false, 'error', 'not approved'); end if;
  select * into c from hg_candidates where id = s.candidate_id;
  v_test := hg_setting('test_recipient')#>>'{}';
  if coalesce((hg_setting('test_mode'))::text, 'true') = 'true' then
    if v_test is null or v_test = '' or position('@' in v_test) = 0 then
      return jsonb_build_object('ok', false, 'error', 'test_mode is on but test_recipient is empty');
    end if;
    v_to := split_part(v_test, '@', 1) || '+hg-c' || c.id || '@' || split_part(v_test, '@', 2);
  else
    v_to := c.email;
  end if;
  insert into hg_outreach(shortlist_id, candidate_id, role_id, to_email, next_send_at)
  values (s.id, s.candidate_id, s.role_id, v_to, now())
  on conflict (shortlist_id) do nothing
  returning * into o;
  if not found then select * into o from hg_outreach where shortlist_id = s.id; end if;
  return jsonb_build_object('ok', true, 'outreach', to_jsonb(o));
end $$;

-- ---------- outreach sequencer ------------------------------------------
-- claims due rows (skip locked) so two runs can never double-send
drop function if exists hg_claim_due_outreach(int);
create or replace function hg_claim_due_outreach(p_limit int default 20) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  with due as (
    select o.id from hg_outreach o
      join hg_shortlist s on s.id = o.shortlist_id and s.status = 'approved'
      join hg_roles r on r.id = o.role_id and r.status = 'approved'
     where o.status = 'active' and o.next_send_at <= now()
       and (o.locked_until is null or o.locked_until < now())
     order by o.next_send_at limit p_limit
     for update of o skip locked
  ), claimed as (
    update hg_outreach o set locked_until = now() + interval '10 minutes' from due where o.id = due.id returning o.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'outreach_id', cl.id, 'step', cl.step, 'max_steps', cl.max_steps, 'to_email', cl.to_email,
    'thread_id', cl.thread_id, 'sent_message_ids', to_jsonb(cl.sent_message_ids),
    'last_message_id', cl.sent_message_ids[array_length(cl.sent_message_ids, 1)],
    'candidate_name', c.full_name, 'first_name', split_part(c.full_name, ' ', 1),
    'role_title', r.title, 'role_summary', r.jd->>'about_the_role', 'hours', r.jd->>'hours',
    'rate', r.jd->>'rate_band', 'reason', s.reason, 'ghl_opportunity_id', s.ghl_opportunity_id)), '[]')
  into v
  from claimed cl
  join hg_candidates c on c.id = cl.candidate_id
  join hg_roles r on r.id = cl.role_id
  join hg_shortlist s on s.id = cl.shortlist_id;
  return v;
end $$;

create or replace function hg_outreach_sent(p_id bigint, p_message_id text, p_thread_id text) returns jsonb language plpgsql as $$
declare o hg_outreach%rowtype; v_delays jsonb := hg_setting('followup_delays_minutes');
begin
  update hg_outreach set
    step = step + 1,
    sent_message_ids = array_append(sent_message_ids, p_message_id),
    thread_id = coalesce(thread_id, p_thread_id),
    last_sent_at = now(), locked_until = null,
    status = case when step + 1 >= max_steps then 'completed' else status end,
    next_send_at = case when step + 1 >= max_steps then null
                        else now() + make_interval(mins => coalesce((v_delays->>(step))::int, 4320)) end
  where id = p_id and status = 'active'
  returning * into o;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'outreach not active (replied/stopped?)');
  end if;
  perform hg_log('outreach_sent', 'Outreach email ' || o.step || ' sent to ' || o.to_email, jsonb_build_object('outreach_id', p_id));
  return to_jsonb(o);
end $$;

-- a message arrived in a tracked thread that we did not send → reply → stop
create or replace function hg_mark_reply(p_thread_id text, p_message_id text) returns jsonb language plpgsql as $$
declare o hg_outreach%rowtype; c hg_candidates%rowtype; r hg_roles%rowtype; s hg_shortlist%rowtype;
begin
  select * into o from hg_outreach where thread_id = p_thread_id limit 1;
  if not found then return jsonb_build_object('matched', false); end if;
  if p_message_id = any(o.sent_message_ids) then return jsonb_build_object('matched', false, 'why', 'our own email'); end if;
  if o.status = 'replied' then return jsonb_build_object('matched', true, 'already', true); end if;
  update hg_outreach set status = 'replied', replied_at = now(), stopped_reason = 'Candidate replied',
         next_send_at = null, locked_until = null where id = o.id returning * into o;
  select * into c from hg_candidates where id = o.candidate_id;
  select * into r from hg_roles where id = o.role_id;
  select * into s from hg_shortlist where id = o.shortlist_id;
  perform hg_log('candidate_replied', c.full_name || ' replied: sequence stopped', jsonb_build_object('outreach_id', o.id));
  return jsonb_build_object('matched', true, 'already', false, 'outreach_id', o.id, 'candidate_name', c.full_name,
                            'role_title', r.title, 'ghl_opportunity_id', s.ghl_opportunity_id, 'emails_sent', o.step);
end $$;

-- manual stop from the portal
create or replace function hg_stop_outreach(p_id bigint, p_reason text) returns void language sql as $$
  update hg_outreach set status = 'stopped', stopped_reason = p_reason, next_send_at = null where id = p_id and status = 'active';
$$;

-- lock down: functions callable only by service_role
do $$ declare f text; begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'hg\_%' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- newer Supabase projects no longer auto-grant table access: give service_role (only) the hg_ tables + sequences
do $$ declare t text; begin
  for t in select quote_ident(tablename) from pg_tables where schemaname = 'public' and tablename like 'hg\_%' loop
    execute format('grant select, insert, update, delete on table public.%s to service_role', t);
  end loop;
end $$;
grant usage, select on all sequences in schema public to service_role;
