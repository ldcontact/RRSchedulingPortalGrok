-- RLS behaviour tests. Run with: npm run test:db   (expects a fresh database)
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), false);
  if p is null then execute 'reset role'; else execute 'set role authenticated'; end if;
end $$;
create or replace function pg_temp.check(label text, ok boolean) returns void language plpgsql as $$
begin if not ok then raise exception 'FAIL: %', label; end if; raise notice 'ok  %', label; end $$;
create or replace function pg_temp.fails(label text, stmt text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then raise notice 'ok  % (blocked: %)', label, sqlerrm; return; end;
  raise exception 'FAIL: % (statement was allowed)', label;
end $$;

-- invites first (as superuser), then users sign up
insert into public.invites (email, role, full_name) values
  ('luke@example.com','admin','Luke Dlugosz'), ('maria@gmail.com','manager','Maria Santos'),
  ('carlos@yahoo.com','tech','Carlos Mendez'), ('emily@outlook.com','tech','Emily Chen');
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000000a','Luke@Example.com', now()),
  ('00000000-0000-0000-0000-00000000000b','maria@gmail.com', now()),
  ('00000000-0000-0000-0000-00000000000c','carlos@yahoo.com', now()),
  ('00000000-0000-0000-0000-00000000000d','emily@outlook.com', now()),
  ('00000000-0000-0000-0000-00000000000e','stranger@hotmail.com', now());
-- invited email squatted via raw signup API without confirming -> no role until confirmed
insert into invites (email, role) values ('newtech@gmail.com','tech');
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000f','newtech@gmail.com');

select pg_temp.check('admin profile got admin role', (select role from profiles where email='luke@example.com')='admin');
select pg_temp.check('uninvited user has no role', (select role from profiles where email='stranger@hotmail.com') is null);
select pg_temp.check('unconfirmed signup gets no role', (select role from profiles where email='newtech@gmail.com') is null);
update auth.users set email_confirmed_at = now() where email='newtech@gmail.com';
select pg_temp.check('role granted once email confirmed', (select role from profiles where email='newtech@gmail.com')='tech');
select pg_temp.check('invite marked accepted', (select accepted_at is not null from invites where email='carlos@yahoo.com'));

-- seed business data as superuser
insert into customers (id, name) values ('10000000-0000-0000-0000-000000000001','Lakeview Dental'), ('10000000-0000-0000-0000-000000000002','Golf Rd Auto');
insert into projects (id, customer_id, name, scope) values
  ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','LED Troffers','Replace 42 troffers'),
  ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','High-bays','Replace 18 MH');
insert into jobs (id, project_id, title, starts_at, ends_at) values
  ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Install','2026-11-02 13:00Z','2026-11-02 20:00Z'),
  ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','Install','2026-11-03 13:00Z','2026-11-03 20:00Z');
insert into job_assignments values ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c'),
                                   ('30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000d');
insert into photos (project_id, kind, storage_path) values
  ('20000000-0000-0000-0000-000000000001','before','20000000-0000-0000-0000-000000000001/before/a.jpg'),
  ('20000000-0000-0000-0000-000000000002','before','20000000-0000-0000-0000-000000000002/before/b.jpg');
insert into messages (customer_id, channel, body) values ('10000000-0000-0000-0000-000000000001','text','On my way');

-- ---- stranger (signed in, not invited)
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.check('stranger sees no customers', (select count(*) from customers)=0);
select pg_temp.check('stranger sees only own profile', (select count(*) from profiles)=1);
select pg_temp.fails('stranger cannot self-promote', $$update profiles set role='admin' where id=auth.uid()$$);
reset role;

-- ---- tech Carlos
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.check('tech sees only assigned job', (select count(*) from jobs)=1);
select pg_temp.check('tech sees only that project', (select count(*) from projects)=1 and (select scope from projects)='Replace 42 troffers');
select pg_temp.check('tech sees that customer only', (select count(*) from customers)=1);
select pg_temp.check('tech sees only own project before photos', (select count(*) from photos)=1);
select pg_temp.check('tech cannot read messages', (select count(*) from messages)=0);
select pg_temp.check('tech cannot read invites', (select count(*) from invites)=0);
select pg_temp.fails('tech cannot add customer', $$insert into customers(name) values ('x')$$);
select pg_temp.fails('tech cannot change role', $$update profiles set role='admin' where id=auth.uid()$$);
select pg_temp.fails('tech cannot reschedule', $$update jobs set starts_at=starts_at+interval '1 day' where id='30000000-0000-0000-0000-000000000001'$$);
select pg_temp.fails('tech cannot approve', $$update jobs set status='approved' where id='30000000-0000-0000-0000-000000000001'$$);
update jobs set status='in_progress' where id='30000000-0000-0000-0000-000000000001';
select pg_temp.fails('tech cannot submit without photo + note', $$update jobs set status='completed' where id='30000000-0000-0000-0000-000000000001'$$);
insert into photos (project_id, job_id, kind, storage_path, uploaded_by) values
  ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','completion','20000000-0000-0000-0000-000000000001/completion/c1.jpg', auth.uid());
insert into notes (job_id, body) values ('30000000-0000-0000-0000-000000000001','24 of 42 panels done');
insert into storage.objects (bucket_id, name) values ('photos','20000000-0000-0000-0000-000000000001/completion/c1.jpg');
select pg_temp.fails('tech cannot upload before photo row', $$insert into photos (project_id, job_id, kind, storage_path, uploaded_by) values ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','before','x/before/z.jpg', auth.uid())$$);
select pg_temp.fails('tech cannot upload to other job', $$insert into photos (project_id, job_id, kind, storage_path, uploaded_by) values ('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','completion','y.jpg', auth.uid())$$);
select pg_temp.fails('tech cannot store object in other project', $$insert into storage.objects (bucket_id, name) values ('photos','20000000-0000-0000-0000-000000000002/completion/x.jpg')$$);
select pg_temp.fails('tech cannot note other job', $$insert into notes (job_id, body) values ('30000000-0000-0000-0000-000000000002','x')$$);
update jobs set status='completed' where id='30000000-0000-0000-0000-000000000001';
select pg_temp.check('project moves to awaiting_review', (select status from projects where id='20000000-0000-0000-0000-000000000001')='awaiting_review');
select pg_temp.check('completion stamped by trigger', (select completed_by = auth.uid() and completed_at is not null from jobs where id='30000000-0000-0000-0000-000000000001'));
reset role;

-- ---- manager Maria
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check('manager sees all customers', (select count(*) from customers)=2);
select pg_temp.check('manager sees all jobs', (select count(*) from jobs)=2);
insert into customers (name, city) values ('Prairie Bean','Palatine');
update jobs set status='approved', approved_by=auth.uid(), approved_at=now() where id='30000000-0000-0000-0000-000000000001';
select pg_temp.check('approving last visit completes project', (select status from projects where id='20000000-0000-0000-0000-000000000001')='complete');
select pg_temp.check('manager sees team', (select count(*) from profiles)=6);
select pg_temp.check('manager cannot see invites', (select count(*) from invites)=0);
select pg_temp.fails('manager cannot invite', $$insert into invites(email, role) values ('new@gmail.com','tech')$$);
update profiles set role='admin' where email='carlos@yahoo.com';  -- RLS: matches 0 rows
select pg_temp.check('manager cannot change roles', (select role from profiles where email='carlos@yahoo.com')='tech');
reset role;

-- ---- admin Luke
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into invites (email, role, full_name) values ('stranger@hotmail.com','tech','Now Invited');
select pg_temp.check('invite after signup grants role', (select role from profiles where email='stranger@hotmail.com')='tech');
update invites set role='manager' where email='carlos@yahoo.com';
select pg_temp.check('admin role change syncs to profile', (select role from profiles where email='carlos@yahoo.com')='manager');
delete from invites where email='emily@outlook.com';
select pg_temp.check('removing from team list revokes role', (select role from profiles where email='emily@outlook.com') is null);
reset role;


-- ---- required photo checklist
reset role;
-- reopen Emily's job for checklist tests (Carlos already completed his)
update jobs set status='in_progress', completed_at=null, completed_by=null where id='30000000-0000-0000-0000-000000000002';
insert into project_photo_requirements (id, project_id, label, sort_order) values
  ('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','400W MH',0),
  ('40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','Wall pack',1),
  ('40000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','Lobby panel',0);

select pg_temp.as_user('00000000-0000-0000-0000-00000000000d'); -- Emily
select pg_temp.check('tech can read project photo requirements', (select count(*) from project_photo_requirements)=2);
select pg_temp.fails('tech cannot add photo requirements', $$insert into project_photo_requirements(project_id, label) values ('20000000-0000-0000-0000-000000000002','Extra')$$);
insert into notes (job_id, body) values ('30000000-0000-0000-0000-000000000002','Started high bays');
select pg_temp.fails('tech cannot submit with checklist incomplete', $$update jobs set status='completed' where id='30000000-0000-0000-0000-000000000002'$$);
insert into photos (project_id, job_id, kind, storage_path, uploaded_by, requirement_id) values
  ('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','completion','20000000-0000-0000-0000-000000000002/completion/mh.jpg', auth.uid(), '40000000-0000-0000-0000-000000000001');
select pg_temp.fails('still blocked when one checklist item missing', $$update jobs set status='completed' where id='30000000-0000-0000-0000-000000000002'$$);
select pg_temp.fails('cannot link requirement from other project', $$insert into photos (project_id, job_id, kind, storage_path, uploaded_by, requirement_id) values ('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','completion','20000000-0000-0000-0000-000000000002/completion/bad.jpg', auth.uid(), '40000000-0000-0000-0000-000000000003')$$);
insert into photos (project_id, job_id, kind, storage_path, uploaded_by, requirement_id) values
  ('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','completion','20000000-0000-0000-0000-000000000002/completion/wp.jpg', auth.uid(), '40000000-0000-0000-0000-000000000002');
update jobs set status='completed' where id='30000000-0000-0000-0000-000000000002';
select pg_temp.check('checklist complete allows submit', (select status from jobs where id='30000000-0000-0000-0000-000000000002')='completed');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); -- Maria manager
insert into project_photo_requirements (project_id, label, sort_order) values ('20000000-0000-0000-0000-000000000001','Operatory troffer',1);
select pg_temp.check('manager can add photo requirements', (select count(*) from project_photo_requirements where project_id='20000000-0000-0000-0000-000000000001')=2);
reset role;


-- ---- profile avatars
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a'); -- Luke admin
insert into storage.objects (bucket_id, name) values
  ('avatars','00000000-0000-0000-0000-00000000000c/a1.jpg');
update profiles set avatar_source='upload', avatar_path='00000000-0000-0000-0000-00000000000c/a1.jpg'
 where id='00000000-0000-0000-0000-00000000000c';
select pg_temp.check('admin can write avatar object for tech', exists (
  select 1 from storage.objects where bucket_id='avatars' and name='00000000-0000-0000-0000-00000000000c/a1.jpg'));
update invites set avatar_source='upload', avatar_path='pending/newhire@gmail.com/x.jpg' where email='newtech@gmail.com';
-- pending path write
insert into storage.objects (bucket_id, name) values ('avatars','pending/newtech@gmail.com/x.jpg');
select pg_temp.check('admin can stage invite avatar under pending/', exists (
  select 1 from storage.objects where name='pending/newtech@gmail.com/x.jpg'));
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000c'); -- Carlos tech
select pg_temp.check('member can read avatars bucket objects', (select count(*) from storage.objects where bucket_id='avatars') >= 1);
insert into storage.objects (bucket_id, name) values ('avatars','00000000-0000-0000-0000-00000000000c/self.jpg');
select pg_temp.check('tech can upload own avatar folder', exists (
  select 1 from storage.objects where name='00000000-0000-0000-0000-00000000000c/self.jpg'));
select pg_temp.fails('tech cannot upload into another profile folder',
  $$insert into storage.objects (bucket_id, name) values ('avatars','00000000-0000-0000-0000-00000000000b/x.jpg')$$);
select pg_temp.fails('tech cannot write pending invite avatar',
  $$insert into storage.objects (bucket_id, name) values ('avatars','pending/someone@gmail.com/x.jpg')$$);
update profiles set avatar_source='google', google_avatar_url='https://lh3.googleusercontent.com/a/test' where id=auth.uid();
select pg_temp.check('tech can set own google avatar fields', (select avatar_source from profiles where id=auth.uid())='google');
update profiles set avatar_source='upload', avatar_path='stolen.jpg' where id='00000000-0000-0000-0000-00000000000b';
select pg_temp.check('cannot change another profile avatar via RLS', (select avatar_source from profiles where id='00000000-0000-0000-0000-00000000000b')='none');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); -- Maria manager
select pg_temp.fails('manager cannot write pending invite avatar',
  $$insert into storage.objects (bucket_id, name) values ('avatars','pending/x@y.com/z.jpg')$$);
reset role;

select pg_temp.check('avatars bucket exists', exists (select 1 from storage.buckets where id='avatars' and public=false));
select pg_temp.check('avatar_source enum on profiles', exists (
  select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='avatar_source'));


-- ---- admin user lifecycle (suspend / soft-delete / audit)
select pg_temp.as_user(null); -- clear JWT so superuser updates are not blocked by guard_profile_update
-- soft-delete target: seed a deletable tech
insert into invites (email, role, full_name) values ('deleteme@example.com','tech','Delete Me') on conflict (email) do nothing;
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000aa','deleteme@example.com', now())
  on conflict (id) do nothing;
-- ensure profile exists with role (as superuser with cleared JWT)
update profiles set role='tech', active=true, full_name='Delete Me', deleted_at=null where id='00000000-0000-0000-0000-0000000000aa';

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a'); -- admin
update profiles set active=false where id='00000000-0000-0000-0000-0000000000aa';
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000aa');
select pg_temp.check('suspended user has no role', private.current_user_role() is null);
select pg_temp.check('suspended user cannot read customers', (select count(*) from customers)=0);
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into admin_audit (actor_id, action, target_email, target_profile_id, detail)
  values (auth.uid(), 'suspend', 'deleteme@example.com', '00000000-0000-0000-0000-0000000000aa', '{}'::jsonb);
select pg_temp.check('admin can write audit row', (select count(*) from admin_audit where action='suspend')>=1);
-- soft-delete
update profiles set
  email='deleted-00000000@deleted.invalid', full_name='Removed user', role=null, active=false,
  deleted_at=now(), deleted_by=auth.uid(), phone=null, title=null
 where id='00000000-0000-0000-0000-0000000000aa';
delete from invites where email='deleteme@example.com';
select pg_temp.check('soft-deleted profile marked', (select deleted_at is not null from profiles where id='00000000-0000-0000-0000-0000000000aa'));
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000c'); -- non-admin member
select pg_temp.check('non-admin cannot see soft-deleted profile', (select count(*) from profiles where id='00000000-0000-0000-0000-0000000000aa')=0);
select pg_temp.check('non-admin cannot read admin_audit', (select count(*) from admin_audit)=0);
select pg_temp.fails('non-admin cannot insert admin_audit',
  $$insert into admin_audit(actor_id, action) values (auth.uid(), 'x')$$);
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check('admin can still see soft-deleted profile', (select count(*) from profiles where id='00000000-0000-0000-0000-0000000000aa')=1);
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); -- manager
update profiles set active=false where id='00000000-0000-0000-0000-00000000000a';
select pg_temp.check('manager cannot suspend admin via RLS', (select active from profiles where id='00000000-0000-0000-0000-00000000000a')=true);
reset role;

-- ---- privilege / schema hardening (private helpers)
select pg_temp.check('private schema exists', exists (select 1 from pg_namespace where nspname='private'));
select pg_temp.check('no public.is_admin helper', not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in
     ('is_admin','is_staff','is_member','current_user_role','is_assigned_to_job','can_see_project','can_see_customer','handle_new_user','guard_job_update','guard_photo_requirement','storage_project_id')));
select pg_temp.check('private.is_admin exists', exists (
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='is_admin'));

set role authenticated;
select pg_temp.check('authenticated can execute private.is_staff (RLS helpers)', has_function_privilege('authenticated', 'private.is_staff()', 'execute'));
select pg_temp.check('authenticated can execute private.is_assigned_to_job', has_function_privilege('authenticated', 'private.is_assigned_to_job(uuid)', 'execute'));
select pg_temp.check('authenticated cannot execute private.handle_new_user', not has_function_privilege('authenticated', 'private.handle_new_user()', 'execute'));
select pg_temp.check('authenticated cannot execute private.guard_job_update', not has_function_privilege('authenticated', 'private.guard_job_update()', 'execute'));
select pg_temp.check('authenticated cannot execute private.guard_photo_requirement', not has_function_privilege('authenticated', 'private.guard_photo_requirement()', 'execute'));
select pg_temp.check('authenticated cannot execute private.sync_invite_to_profile', not has_function_privilege('authenticated', 'private.sync_invite_to_profile()', 'execute'));
select pg_temp.check('authenticated cannot execute private.set_updated_at', not has_function_privilege('authenticated', 'private.set_updated_at()', 'execute'));
select pg_temp.fails('direct call to private.handle_new_user blocked', $$select private.handle_new_user()$$);
reset role;
