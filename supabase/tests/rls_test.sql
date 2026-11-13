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
insert into photos (project_id, job_id, kind, phase, storage_path, uploaded_by) values
  ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','completion','after','20000000-0000-0000-0000-000000000001/completion/c1.jpg', auth.uid());
insert into notes (job_id, body) values ('30000000-0000-0000-0000-000000000001','24 of 42 panels done');
insert into storage.objects (bucket_id, name) values ('photos','20000000-0000-0000-0000-000000000001/completion/c1.jpg');
select pg_temp.fails('tech cannot upload a project-level photo', $$insert into photos (project_id, job_id, kind, phase, storage_path, uploaded_by) values ('20000000-0000-0000-0000-000000000001',null,'before','before','x/before/z.jpg', auth.uid())$$);
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
insert into photos (project_id, job_id, kind, phase, storage_path, uploaded_by, requirement_id) values
  ('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','completion','required','20000000-0000-0000-0000-000000000002/completion/mh.jpg', auth.uid(), '40000000-0000-0000-0000-000000000001');
select pg_temp.fails('still blocked when one checklist item missing', $$update jobs set status='completed' where id='30000000-0000-0000-0000-000000000002'$$);
select pg_temp.fails('cannot link requirement from other project', $$insert into photos (project_id, job_id, kind, storage_path, uploaded_by, requirement_id) values ('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','completion','20000000-0000-0000-0000-000000000002/completion/bad.jpg', auth.uid(), '40000000-0000-0000-0000-000000000003')$$);
insert into photos (project_id, job_id, kind, phase, storage_path, uploaded_by, requirement_id) values
  ('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','completion','required','20000000-0000-0000-0000-000000000002/completion/wp.jpg', auth.uid(), '40000000-0000-0000-0000-000000000002');
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


-- ---- author attribution (force actor on insert; no spoofing)
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); -- Maria manager
insert into messages (customer_id, channel, direction, body, sent_by)
  values ('10000000-0000-0000-0000-000000000001','call','inbound','Customer called about access', '00000000-0000-0000-0000-00000000000a');
select pg_temp.check('message sent_by forced to auth.uid (spoof blocked)',
  (select sent_by = auth.uid() from messages where body='Customer called about access' order by created_at desc limit 1));
insert into notes (project_id, body, author_id)
  values ('20000000-0000-0000-0000-000000000001','Office follow-up note', '00000000-0000-0000-0000-00000000000a');
select pg_temp.check('note author_id forced to auth.uid (spoof blocked)',
  (select author_id = auth.uid() from notes where body='Office follow-up note' order by created_at desc limit 1));
insert into photos (project_id, kind, storage_path, uploaded_by)
  values ('20000000-0000-0000-0000-000000000001','before','20000000-0000-0000-0000-000000000001/before/spoof.jpg','00000000-0000-0000-0000-00000000000a');
select pg_temp.check('photo uploaded_by forced to auth.uid (spoof blocked)',
  (select uploaded_by = auth.uid() from photos where storage_path like '%/spoof.jpg'));
-- default path (omit actor column) also stamps auth.uid()
insert into messages (customer_id, channel, direction, body)
  values ('10000000-0000-0000-0000-000000000001','note','outbound','Logged without sent_by');
select pg_temp.check('message sent_by defaults via trigger',
  (select sent_by = auth.uid() from messages where body='Logged without sent_by'));
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000c'); -- Carlos tech on job 1
insert into notes (job_id, body, author_id)
  values ('30000000-0000-0000-0000-000000000001','Tech note with spoofed author', '00000000-0000-0000-0000-00000000000a');
select pg_temp.check('tech note author_id forced to self',
  (select author_id = auth.uid() from notes where body='Tech note with spoofed author'));
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
select pg_temp.check('authenticated cannot execute private.force_row_actor', not has_function_privilege('authenticated', 'private.force_row_actor()', 'execute'));
select pg_temp.fails('direct call to private.handle_new_user blocked', $$select private.handle_new_user()$$);
reset role;

-- ---- service requests (tickets) + warranty visits
-- state here: project 1 (Lakeview) is Complete (its install visit was approved);
-- stranger@hotmail.com (…0e) is now a tech; Maria (…0b) is a manager.
reset role;
select pg_temp.check('project 1 complete before warranty work', (select status from projects where id='20000000-0000-0000-0000-000000000001')='complete');
select pg_temp.check('existing visits default to install', not exists (select 1 from jobs where kind <> 'install'));
select pg_temp.check('projects default to a 12-month warranty', (select bool_and(warranty_months = 12) from projects));

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); -- Maria (manager)
insert into service_requests (id, customer_id, project_id, channel, summary, description, priority)
values ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
        'call','Lobby panel flickering','Front desk says one lobby panel flickers.','high'),
       ('50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002',null,'email','Wall pack out','Not sure if we installed it.','normal');
select pg_temp.check('ticket numbers start at 1001', (select array_agg(number order by number) from service_requests) = array[1001,1002]);
select pg_temp.check('ticket created_by forced to staff user', (select bool_and(created_by = auth.uid()) from service_requests));
insert into service_request_events (request_id, kind, body, actor_id) values ('50000000-0000-0000-0000-000000000001','note','Inside warranty, schedule a swap','00000000-0000-0000-0000-00000000000a');
select pg_temp.check('event actor forced to auth.uid', (select actor_id = auth.uid() from service_request_events where body='Inside warranty, schedule a swap'));
select pg_temp.fails('empty ticket note rejected', $$insert into service_request_events (request_id, kind, body) values ('50000000-0000-0000-0000-000000000001','note','  ')$$);
select pg_temp.check('view: linked complete project is in warranty', (select warranty_state from service_request_list where number=1001)='in');
select pg_temp.check('view: unlinked ticket is unknown', (select warranty_state from service_request_list where number=1002)='unknown');
select pg_temp.check('view: expiry is completion + 12 months', (select warranty_expires_at = project_completed_at + interval '12 months' from service_request_list where number=1001));
select pg_temp.fails('install visit cannot carry a ticket', $$insert into jobs (project_id, title, starts_at, ends_at, service_request_id) values ('20000000-0000-0000-0000-000000000001','x','2027-01-05 15:00Z','2027-01-05 17:00Z','50000000-0000-0000-0000-000000000001')$$);
insert into jobs (id, project_id, title, starts_at, ends_at, kind, service_request_id) values
  ('30000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000001','Warranty — lobby panel','2027-01-05 15:00Z','2027-01-05 17:00Z','warranty','50000000-0000-0000-0000-000000000001');
insert into job_assignments values ('30000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-00000000000e');
update service_requests set status='scheduled' where id='50000000-0000-0000-0000-000000000001';
select pg_temp.check('warranty visit leaves project Complete', (select status from projects where id='20000000-0000-0000-0000-000000000001')='complete');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000e'); -- tech on the warranty visit
select pg_temp.check('tech reads only the ticket behind their visit', (select count(*) from service_requests)=1 and (select number from service_requests)=1001);
select pg_temp.check('tech cannot read ticket notes/history', (select count(*) from service_request_events)=0);
select pg_temp.check('tech cannot use the inbox view beyond their ticket', (select count(*) from service_request_list)<=1);
select pg_temp.fails('tech cannot log a ticket', $$insert into service_requests (customer_id, summary) values ('10000000-0000-0000-0000-000000000001','x')$$);
update service_requests set billable=true where id='50000000-0000-0000-0000-000000000001'; -- RLS: matches 0 rows
select pg_temp.check('tech cannot edit a ticket', (select billable from service_requests where id='50000000-0000-0000-0000-000000000001')=false);
select pg_temp.fails('tech cannot retag a visit', $$update jobs set kind='install', service_request_id=null where id='30000000-0000-0000-0000-000000000009'$$);
update jobs set status='in_progress' where id='30000000-0000-0000-0000-000000000009';
select pg_temp.check('starting a warranty visit keeps project Complete', (select status from projects where id='20000000-0000-0000-0000-000000000001')='complete');
insert into notes (job_id, body) values ('30000000-0000-0000-0000-000000000009','Swapped the lobby driver');
insert into photos (project_id, job_id, kind, phase, storage_path) values
  ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000009','completion','after','20000000-0000-0000-0000-000000000001/completion/w1.jpg');
-- project 1 has an install checklist (Lobby panel, Operatory troffer); a warranty visit doesn't need it
update jobs set status='completed' where id='30000000-0000-0000-0000-000000000009';
select pg_temp.check('warranty visit submits without the install checklist', (select status from jobs where id='30000000-0000-0000-0000-000000000009')='completed');
reset role;
select pg_temp.check('completing the visit auto-resolves the ticket', (select status = 'resolved' and resolved_job_id = '30000000-0000-0000-0000-000000000009' and resolved_by = '00000000-0000-0000-0000-00000000000e' from service_requests where number=1001));
select pg_temp.check('auto-resolve logged in history', exists (select 1 from service_request_events where request_id='50000000-0000-0000-0000-000000000001' and kind='resolved'));
select pg_temp.check('project stays Complete after warranty visit', (select status from projects where id='20000000-0000-0000-0000-000000000001')='complete');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); -- Maria sends it back
update jobs set status='in_progress', review_note='Photo is blurry', completed_at=null where id='30000000-0000-0000-0000-000000000009';
select pg_temp.check('sent-back visit puts ticket back to Scheduled', (select status from service_requests where number=1001)='scheduled');
update jobs set status='approved', approved_by=auth.uid(), approved_at=now() where id='30000000-0000-0000-0000-000000000009';
select pg_temp.check('approving the visit resolves the ticket', (select status from service_requests where number=1001)='resolved');
select pg_temp.check('approved warranty visit does not change project', (select status from projects where id='20000000-0000-0000-0000-000000000001')='complete');
-- cancelling the only visit of a scheduled ticket returns it to triage
insert into jobs (id, project_id, title, starts_at, ends_at, kind, service_request_id) values
  ('30000000-0000-0000-0000-00000000000a','20000000-0000-0000-0000-000000000002','Service — wall pack','2027-01-06 15:00Z','2027-01-06 16:00Z','service','50000000-0000-0000-0000-000000000002');
update service_requests set status='scheduled', project_id='20000000-0000-0000-0000-000000000002' where id='50000000-0000-0000-0000-000000000002';
update jobs set status='cancelled' where id='30000000-0000-0000-0000-00000000000a';
select pg_temp.check('cancelling the only visit returns ticket to Triaged', (select status from service_requests where number=1002)='triaged');
select pg_temp.check('service visit did not move project 2', (select status from projects where id='20000000-0000-0000-0000-000000000002')='awaiting_review');
update projects set warranty_months = 0 where id='20000000-0000-0000-0000-000000000001';
update service_requests set received_at = now() + interval '1 day' where number=1001;
select pg_temp.check('warranty_months is editable per project', (select warranty_state from service_request_list where number=1001)='out');
select pg_temp.fails('negative warranty rejected', $$update projects set warranty_months=-1 where id='20000000-0000-0000-0000-000000000001'$$);
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000f'); -- a tech with no visits on any ticket
select pg_temp.check('unrelated tech sees no tickets', (select count(*) from service_requests)=0 and (select count(*) from service_request_list)=0);
reset role;
set role authenticated;
select pg_temp.check('authenticated cannot execute private.sync_service_request', not has_function_privilege('authenticated', 'private.sync_service_request()', 'execute'));
reset role;
select pg_temp.check('anon has no access to tickets', not has_table_privilege('anon', 'public.service_requests', 'select') and not has_table_privilege('anon', 'public.service_request_list', 'select'));

-- ---- search side tables (customer_search / project_search)
select pg_temp.as_user(null);
insert into contacts (customer_id, name, phone, email) values ('10000000-0000-0000-0000-000000000001','Priya Nair','+1 (847) 555-0174','priya@lakeview.example');
update customers set address='1420 W Algonquin Rd', city='Arlington Heights', state='IL', zip='60005', phone='630.555.0127' where id='10000000-0000-0000-0000-000000000001';
select pg_temp.check('every customer has a search row', (select count(*) from customers) = (select count(*) from customer_search));
select pg_temp.check('every project has a search row', (select count(*) from projects) = (select count(*) from project_search));
select pg_temp.check('customer doc has name, contact and address', (select doc like '%lakeview dental%' and doc like '%priya nair%' and doc like '%1420 w algonquin rd%' and doc like '%60005%' from customer_search where customer_id='10000000-0000-0000-0000-000000000001'));
select pg_temp.check('phones stored digits-only, US 1 dropped', (select digits like '%8475550174%' and digits like '%6305550127%' and digits not like '%18475550174%' from customer_search where customer_id='10000000-0000-0000-0000-000000000001'));
select pg_temp.check('project search carries its customer contact + phone', (select doc like '%priya nair%' and doc like '%led troffers%' and digits like '%8475550174%' from project_search where project_id='20000000-0000-0000-0000-000000000001'));
select pg_temp.check('dashed / spaced / bare phone queries all match', (select count(*) from customer_search where digits ilike '%' || private.phone_digits('847-555-0174') || '%') = 1
  and (select count(*) from customer_search where digits ilike '%' || private.phone_digits('(847) 555 0174') || '%') = 1
  and (select count(*) from customer_search where digits ilike '%5550174%') = 1);
create temp table _upd as select id, updated_at from projects;
update contacts set name='Priya Nair-Shah' where name='Priya Nair';
select pg_temp.check('contact rename refreshes customer + project search', (select doc like '%nair-shah%' from customer_search where customer_id='10000000-0000-0000-0000-000000000001')
  and (select doc like '%nair-shah%' from project_search where project_id='20000000-0000-0000-0000-000000000001'));
select pg_temp.check('search refresh never bumps projects.updated_at', not exists (select 1 from projects p join _upd u using (id) where p.updated_at <> u.updated_at));
update projects set name='LED Troffers Phase 2' where id='20000000-0000-0000-0000-000000000001';
select pg_temp.check('project rename refreshes project search', (select doc like '%phase 2%' from project_search where project_id='20000000-0000-0000-0000-000000000001'));
delete from contacts where name='Priya Nair-Shah';
select pg_temp.check('contact delete refreshes search', (select doc not like '%nair-shah%' and digits not like '%8475550174%' from customer_search where customer_id='10000000-0000-0000-0000-000000000001'));
insert into customers (id, name, phone) values ('10000000-0000-0000-0000-0000000000f1','Search Test Co','(224) 555-0101');
update profiles set role='tech', active=true where id='00000000-0000-0000-0000-00000000000d'; -- Emily: make sure she is a tech here
select pg_temp.check('new customer gets a search row', (select digits='2245550101' from customer_search where customer_id='10000000-0000-0000-0000-0000000000f1'));
-- techs see exactly the search rows of what they can already see; nobody can write the tables
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d'); -- Emily tech
select pg_temp.check('tech is not staff', not private.is_staff() and (select count(*) from customers) < 4);
select pg_temp.check('tech customer_search = visible customers', (select coalesce(array_agg(customer_id order by customer_id), '{}') from customer_search) = (select coalesce(array_agg(id order by id), '{}') from customers));
select pg_temp.check('tech project_search = visible projects', (select coalesce(array_agg(project_id order by project_id), '{}') from project_search) = (select coalesce(array_agg(id order by id), '{}') from projects));
select pg_temp.check('tech cannot see unassigned customer search rows', not exists (select 1 from customer_search where customer_id='10000000-0000-0000-0000-0000000000f1'));
select pg_temp.fails('tech cannot write customer_search', $$update customer_search set doc='x'$$);
select pg_temp.fails('tech cannot insert project_search', $$insert into project_search (project_id, customer_id) values ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002')$$);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); -- Maria manager
select pg_temp.check('staff see all search rows', (select count(*) from customer_search) = (select count(*) from customers) and (select count(*) from project_search) = (select count(*) from projects));
select pg_temp.fails('staff cannot write project_search directly', $$delete from project_search$$);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000099'); -- signed-in id with no profile/role
select pg_temp.check('stranger sees no search rows', (select count(*) from customer_search) = 0 and (select count(*) from project_search) = 0);
reset role;
select pg_temp.check('anon has no access to search tables', not has_table_privilege('anon', 'public.customer_search', 'select') and not has_table_privilege('anon', 'public.project_search', 'select'));
select pg_temp.check('authenticated cannot run search refresh', not has_function_privilege('authenticated', 'private.refresh_customer_search(uuid[])', 'execute'));

-- ---- project / visit documents (project_files)
select pg_temp.as_user(null);
insert into projects (id, customer_id, name, scope) values
  ('20000000-0000-0000-0000-0000000000d1','10000000-0000-0000-0000-000000000001','Document packet','Scope in the attached PDF');
insert into jobs (id, project_id, title, starts_at, ends_at, status) values
  ('30000000-0000-0000-0000-0000000000d1','20000000-0000-0000-0000-0000000000d1','Install','2026-11-12 14:00Z','2026-11-12 20:00Z','in_progress');
insert into job_assignments values ('30000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-00000000000d'); -- Emily

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a'); -- Luke admin
insert into project_files (id, project_id, filename, mime, size_bytes, storage_path, uploaded_by)
  values ('50000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-0000000000d1','Lighting_scope_SOW.pdf','application/pdf',1200,'20000000-0000-0000-0000-0000000000d1/project/scope.pdf','00000000-0000-0000-0000-00000000000b');
select pg_temp.check('admin uploaded_by forced to auth.uid',
  (select uploaded_by = auth.uid() from project_files where id='50000000-0000-0000-0000-000000000001'));
insert into storage.objects (bucket_id, name) values ('project-files','20000000-0000-0000-0000-0000000000d1/project/scope.pdf');
select pg_temp.check('admin can delete a project file', (select count(*) from project_files where id='50000000-0000-0000-0000-000000000001')=1);
-- re-add a file to leave one for later select tests after a delete check
insert into project_files (id, project_id, filename, mime, size_bytes, storage_path)
  values ('50000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-0000000000d1','Fixture_schedule.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',800,'20000000-0000-0000-0000-0000000000d1/project/sheet.xlsx');
delete from project_files where id='50000000-0000-0000-0000-000000000001';
select pg_temp.check('admin deleted the first document', (select count(*) from project_files where project_id='20000000-0000-0000-0000-0000000000d1')=1);
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); -- Maria manager, can_delete default false
insert into project_files (id, project_id, filename, mime, size_bytes, storage_path)
  values ('50000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-0000000000d1','Site_plan.pdf','application/pdf',900,'20000000-0000-0000-0000-0000000000d1/project/site.pdf');
select pg_temp.check('manager can add a project document', (select count(*) from project_files where id='50000000-0000-0000-0000-000000000003')=1);
delete from project_files where id='50000000-0000-0000-0000-000000000002';
delete from storage.objects where bucket_id='project-files' and name='20000000-0000-0000-0000-0000000000d1/project/scope.pdf';
select pg_temp.check('manager without delete access cannot delete a document', (select count(*) from project_files where id='50000000-0000-0000-0000-000000000002')=1);
select pg_temp.check('manager without delete access cannot remove storage object', exists (select 1 from storage.objects where bucket_id='project-files' and name='20000000-0000-0000-0000-0000000000d1/project/scope.pdf'));
select pg_temp.as_user(null);
update profiles set can_delete=true where id='00000000-0000-0000-0000-00000000000b';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
delete from project_files where id='50000000-0000-0000-0000-000000000003';
select pg_temp.check('manager with delete access can delete a document', (select count(*) from project_files where id='50000000-0000-0000-0000-000000000003')=0);
select pg_temp.as_user(null);
update profiles set can_delete=false where id='00000000-0000-0000-0000-00000000000b';

select pg_temp.as_user('00000000-0000-0000-0000-00000000000d'); -- Emily tech, assigned
select pg_temp.check('assigned tech can read project documents', (select count(*) from project_files where project_id='20000000-0000-0000-0000-0000000000d1')=1);
select pg_temp.check('assigned tech can read the storage object', (select count(*) from storage.objects where bucket_id='project-files' and name='20000000-0000-0000-0000-0000000000d1/project/scope.pdf')=1);
select pg_temp.fails('tech cannot add a project-level document', $$insert into project_files (project_id, filename, mime, size_bytes, storage_path, uploaded_by) values ('20000000-0000-0000-0000-0000000000d1','crew.pdf','application/pdf',10,'20000000-0000-0000-0000-0000000000d1/project/crew.pdf', auth.uid())$$);
select pg_temp.fails('tech cannot store a project-level object', $$insert into storage.objects (bucket_id, name) values ('project-files','20000000-0000-0000-0000-0000000000d1/project/crew.pdf')$$);
insert into project_files (project_id, job_id, filename, mime, size_bytes, storage_path, uploaded_by)
  values ('20000000-0000-0000-0000-0000000000d1','30000000-0000-0000-0000-0000000000d1','Install_notes.pdf','application/pdf',200,'20000000-0000-0000-0000-0000000000d1/visit/30000000-0000-0000-0000-0000000000d1/notes.pdf', auth.uid());
insert into storage.objects (bucket_id, name) values ('project-files','20000000-0000-0000-0000-0000000000d1/visit/30000000-0000-0000-0000-0000000000d1/notes.pdf');
select pg_temp.check('tech can add a visit document', (select count(*) from project_files where filename='Install_notes.pdf')=1);
delete from project_files where id='50000000-0000-0000-0000-000000000002';
delete from project_files where filename='Install_notes.pdf';
delete from storage.objects where bucket_id='project-files';
select pg_temp.check('tech cannot delete a project document', (select count(*) from project_files where id='50000000-0000-0000-0000-000000000002')=1);
select pg_temp.check('tech cannot delete their own visit document', (select count(*) from project_files where filename='Install_notes.pdf')=1);
select pg_temp.check('tech cannot delete a storage object', exists (select 1 from storage.objects where bucket_id='project-files'));
select pg_temp.fails('tech cannot attach a file to someone else''s visit', $$insert into project_files (project_id, job_id, filename, mime, size_bytes, storage_path, uploaded_by) values ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','x.pdf','application/pdf',10,'20000000-0000-0000-0000-000000000001/visit/30000000-0000-0000-0000-000000000001/x.pdf', auth.uid())$$);
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000c'); -- Carlos (manager after earlier tests) — not assigned as tech; still staff so can see
-- If Carlos is still a manager he can read. Use a user who is a tech on the other project only: none left.
-- Stranger has no role? 00e was invited as tech later. Use uninvited-style: 000...099
select pg_temp.as_user('00000000-0000-0000-0000-000000000099');
select pg_temp.check('signed-in user with no role sees no documents', (select count(*) from project_files)=0);
reset role;
select pg_temp.check('anon cannot read project_files', not has_table_privilege('anon', 'public.project_files', 'select'));

-- ---- visit-level required photos
select pg_temp.as_user(null);
insert into jobs (id, project_id, title, starts_at, ends_at, status, kind) values
  ('30000000-0000-0000-0000-0000000000e1','20000000-0000-0000-0000-000000000002','Install visit extras','2026-11-12 14:00Z','2026-11-12 20:00Z','in_progress','install'),
  ('30000000-0000-0000-0000-0000000000e2','20000000-0000-0000-0000-000000000002','Other install','2026-11-13 14:00Z','2026-11-13 20:00Z','scheduled','install'),
  ('30000000-0000-0000-0000-0000000000e3','20000000-0000-0000-0000-000000000002','Warranty no extras','2026-11-14 14:00Z','2026-11-14 18:00Z','in_progress','warranty'),
  ('30000000-0000-0000-0000-0000000000e4','20000000-0000-0000-0000-000000000002','Warranty with extras','2026-11-15 14:00Z','2026-11-15 18:00Z','in_progress','warranty');
insert into job_assignments values
  ('30000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-00000000000d'),
  ('30000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-00000000000d'),
  ('30000000-0000-0000-0000-0000000000e4','00000000-0000-0000-0000-00000000000d');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); -- Maria manager
insert into project_photo_requirements (id, project_id, job_id, label, sort_order) values
  ('40000000-0000-0000-0000-0000000000e1','20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-0000000000e1','Panel close-up',0),
  ('40000000-0000-0000-0000-0000000000e2','20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-0000000000e1','Exit path',1),
  ('40000000-0000-0000-0000-0000000000e3','20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-0000000000e2','Other visit only',0),
  ('40000000-0000-0000-0000-0000000000e5','20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-0000000000e4','Battery label',0);
select pg_temp.check('manager can add visit photo requirements', (select count(*) from project_photo_requirements where job_id='30000000-0000-0000-0000-0000000000e1')=2);
select pg_temp.fails('visit item must belong to the same project', $$insert into project_photo_requirements (project_id, job_id, label) values ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-0000000000e1','Wrong project')$$);
insert into project_photo_requirements (id, project_id, job_id, label) values
  ('40000000-0000-0000-0000-0000000000e4','20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-0000000000e1','Temp');
delete from project_photo_requirements where id='40000000-0000-0000-0000-0000000000e4';
select pg_temp.check('manager can delete visit photo requirements', (select count(*) from project_photo_requirements where id='40000000-0000-0000-0000-0000000000e4')=0);

select pg_temp.as_user('00000000-0000-0000-0000-00000000000d'); -- Emily, assigned to v1 / v3 / v4 and earlier job 2
select pg_temp.check('tech can read project items plus assigned visit items', (
  select count(*) from project_photo_requirements where project_id='20000000-0000-0000-0000-000000000002'
)=5);
select pg_temp.check('tech cannot see another visit''s required photos', (select count(*) from project_photo_requirements where job_id='30000000-0000-0000-0000-0000000000e2')=0);
select pg_temp.fails('tech cannot add visit photo requirements', $$insert into project_photo_requirements (project_id, job_id, label) values ('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-0000000000e1','Extra')$$);

insert into notes (job_id, body) values ('30000000-0000-0000-0000-0000000000e1','Started extras');
insert into photos (project_id, job_id, kind, phase, storage_path, uploaded_by, requirement_id) values
  ('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-0000000000e1','completion','required','20000000-0000-0000-0000-000000000002/completion/v1-mh.jpg', auth.uid(), '40000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-0000000000e1','completion','required','20000000-0000-0000-0000-000000000002/completion/v1-wp.jpg', auth.uid(), '40000000-0000-0000-0000-000000000002');
select pg_temp.fails('tech cannot submit install with visit checklist incomplete', $$update jobs set status='completed' where id='30000000-0000-0000-0000-0000000000e1'$$);
select pg_temp.fails('cannot link a required item from another visit', $$insert into photos (project_id, job_id, kind, phase, storage_path, uploaded_by, requirement_id) values ('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-0000000000e1','completion','required','20000000-0000-0000-0000-000000000002/completion/v1-bad.jpg', auth.uid(), '40000000-0000-0000-0000-0000000000e3')$$);
insert into photos (project_id, job_id, kind, phase, storage_path, uploaded_by, requirement_id) values
  ('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-0000000000e1','completion','required','20000000-0000-0000-0000-000000000002/completion/v1-panel.jpg', auth.uid(), '40000000-0000-0000-0000-0000000000e1'),
  ('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-0000000000e1','completion','required','20000000-0000-0000-0000-000000000002/completion/v1-exit.jpg', auth.uid(), '40000000-0000-0000-0000-0000000000e2');
update jobs set status='completed' where id='30000000-0000-0000-0000-0000000000e1';
select pg_temp.check('install submit allowed when project and visit items are done', (select status from jobs where id='30000000-0000-0000-0000-0000000000e1')='completed');

insert into notes (job_id, body) values ('30000000-0000-0000-0000-0000000000e3','Warranty follow-up, no extra checklist');
insert into photos (project_id, job_id, kind, phase, storage_path, uploaded_by) values
  ('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-0000000000e3','completion','after','20000000-0000-0000-0000-000000000002/completion/v3-after.jpg', auth.uid());
update jobs set status='completed' where id='30000000-0000-0000-0000-0000000000e3';
select pg_temp.check('warranty without visit items still only needs a photo and a note', (select status from jobs where id='30000000-0000-0000-0000-0000000000e3')='completed');

insert into notes (job_id, body) values ('30000000-0000-0000-0000-0000000000e4','Replaced battery');
insert into photos (project_id, job_id, kind, phase, storage_path, uploaded_by) values
  ('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-0000000000e4','completion','after','20000000-0000-0000-0000-000000000002/completion/v4-after.jpg', auth.uid());
select pg_temp.fails('warranty with visit items is blocked until those photos are taken', $$update jobs set status='completed' where id='30000000-0000-0000-0000-0000000000e4'$$);
insert into photos (project_id, job_id, kind, phase, storage_path, uploaded_by, requirement_id) values
  ('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-0000000000e4','completion','required','20000000-0000-0000-0000-000000000002/completion/v4-batt.jpg', auth.uid(), '40000000-0000-0000-0000-0000000000e5');
update jobs set status='completed' where id='30000000-0000-0000-0000-0000000000e4';
select pg_temp.check('warranty submit allowed once visit items are done', (select status from jobs where id='30000000-0000-0000-0000-0000000000e4')='completed');
reset role;

-- ---- speed round 1: exact count RPCs match table counts under each role; InitPlan wraps
select pg_temp.as_user(null);
insert into customers (id, name) values ('10000000-0000-0000-0000-00000000c001','Count Probe Co');
insert into projects (id, customer_id, name, scope, status) values
  ('20000000-0000-0000-0000-00000000c001','10000000-0000-0000-0000-00000000c001','Hidden count probe','Staff only','proposed');
insert into notes (project_id, body, author_id) values
  ('20000000-0000-0000-0000-00000000c001','Staff-only project note','00000000-0000-0000-0000-00000000000a');
insert into tasks (id, title, created_by, status) values
  ('50000000-0000-0000-0000-00000000c001','Admin open task','00000000-0000-0000-0000-00000000000a','open'),
  ('50000000-0000-0000-0000-00000000c002','Tech open task','00000000-0000-0000-0000-00000000000a','open'),
  ('50000000-0000-0000-0000-00000000c003','Done task ignored','00000000-0000-0000-0000-00000000000a','done');
insert into task_assignees (task_id, profile_id) values
  ('50000000-0000-0000-0000-00000000c001','00000000-0000-0000-0000-00000000000a'),
  ('50000000-0000-0000-0000-00000000c002','00000000-0000-0000-0000-00000000000e'),
  ('50000000-0000-0000-0000-00000000c003','00000000-0000-0000-0000-00000000000a');

create or replace function pg_temp.expected_project_status_counts(
  p_tokens text[] default null,
  p_text text default null,
  p_digits text default null
) returns jsonb
language sql stable as $$
  with filtered as (
    select p.status
    from public.projects p
    where
      case
        when p_digits is not null then
          exists (
            select 1 from public.project_search s
            where s.project_id = p.id
              and (
                s.doc ilike ('%' || coalesce(p_text, '') || '%')
                or s.digits ilike ('%' || p_digits || '%')
              )
          )
        when p_tokens is not null and cardinality(p_tokens) > 0 then
          exists (
            select 1 from public.project_search s
            where s.project_id = p.id
              and not exists (
                select 1 from unnest(p_tokens) t
                where s.doc not ilike ('%' || t || '%')
              )
          )
        else true
      end
  ),
  by_status as (
    select status, count(*)::int as n from filtered group by status
  )
  select jsonb_build_object(
    'active',           coalesce((select sum(n) from by_status where status <> 'cancelled'), 0),
    'proposed',         coalesce((select n from by_status where status = 'proposed'), 0),
    'scheduled',        coalesce((select n from by_status where status = 'scheduled'), 0),
    'in_progress',      coalesce((select n from by_status where status = 'in_progress'), 0),
    'awaiting_review',  coalesce((select n from by_status where status = 'awaiting_review'), 0),
    'complete',         coalesce((select n from by_status where status = 'complete'), 0),
    'cancelled',        coalesce((select n from by_status where status = 'cancelled'), 0)
  );
$$;

create or replace function pg_temp.expected_home_counts(p_day_start timestamptz, p_day_end timestamptz)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'customers',        (select count(*)::int from public.customers),
    'team',             (select count(*)::int from public.profiles where role is not null and active),
    'invited',          (select count(*)::int from public.invites where accepted_at is null),
    'active_projects',  (select count(*)::int from public.projects where status in ('scheduled', 'in_progress', 'awaiting_review')),
    'proposed',         (select count(*)::int from public.projects where status = 'proposed'),
    'jobs_today',       (select count(*)::int from public.jobs where status <> 'cancelled' and starts_at >= p_day_start and starts_at < p_day_end),
    'awaiting_review',  (select count(*)::int from public.jobs where status = 'completed')
  );
$$;

create or replace function pg_temp.expected_nav_badges()
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'open_service_requests', (
      select count(*)::int from public.service_requests where status in ('new', 'triaged', 'scheduled')
    ),
    'my_open_tasks', (
      select count(*)::int from public.tasks t
      where t.status in ('open', 'in_progress')
        and exists (
          select 1 from public.task_assignees a
          where a.task_id = t.id and a.profile_id = (select auth.uid())
        )
    ),
    'unread_updates', (
      select count(*)::int from public.team_update_notifications n
      where n.user_id = (select auth.uid()) and n.read_at is null
    )
  );
$$;

-- Superuser totals (bypass RLS) to prove the tech RPC does not leak hidden rows
create temp table pg_temp_staff_totals as
  select
    (public.project_status_counts(null, null, null)->>'active')::int as active,
    (public.project_status_counts(null, null, null)->>'proposed')::int as proposed,
    (select count(*) from public.projects) as all_projects,
    (select count(*) from public.notes) as all_notes;
grant select on pg_temp_staff_totals to authenticated;

create or replace function pg_temp.check_counts(label text) returns void language plpgsql as $$
declare
  day_start timestamptz := '2026-11-02 00:00+00';
  day_end   timestamptz := '2026-11-05 00:00+00';
begin
  perform pg_temp.check(label || ' project_status_counts (no search)',
    public.project_status_counts(null, null, null) = pg_temp.expected_project_status_counts(null, null, null));
  perform pg_temp.check(label || ' project_status_counts (token search)',
    public.project_status_counts(array['troffers'], null, null)
    = pg_temp.expected_project_status_counts(array['troffers'], null, null));
  perform pg_temp.check(label || ' project_status_counts (hidden probe not in troffers search)',
    coalesce((public.project_status_counts(array['troffers'], null, null)->>'proposed')::int, 0)
    = (select count(*)::int from projects p join project_search s on s.project_id = p.id
       where p.status = 'proposed' and s.doc ilike '%troffers%'));
  perform pg_temp.check(label || ' home_counts',
    public.home_counts(day_start, day_end) = pg_temp.expected_home_counts(day_start, day_end));
  perform pg_temp.check(label || ' nav_badges',
    public.nav_badges() = pg_temp.expected_nav_badges());
end $$;

-- Luke admin, Maria manager, stranger-turned-tech (…00e)
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check_counts('admin');
select pg_temp.check('admin sees the staff-only probe project',
  exists (select 1 from projects where id = '20000000-0000-0000-0000-00000000c001'));
select pg_temp.check('admin my_open_tasks is 1 (done task excluded)',
  (public.nav_badges()->>'my_open_tasks')::int = 1);

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check_counts('manager');
select pg_temp.check('manager sees the same project totals as superuser (staff)',
  (public.project_status_counts(null, null, null)->>'active')::int = (select active from pg_temp_staff_totals)
  and (public.project_status_counts(null, null, null)->>'proposed')::int = (select proposed from pg_temp_staff_totals));
select pg_temp.check('manager proposed count includes hidden probe',
  (public.project_status_counts(null, null, null)->>'proposed')::int
  = (select proposed from pg_temp_staff_totals));
select pg_temp.check('manager invited is 0 (invites are admin-only)',
  (public.home_counts('2026-11-02 00:00+00','2026-11-05 00:00+00')->>'invited')::int = 0);
select pg_temp.check('manager my_open_tasks is 0',
  (public.nav_badges()->>'my_open_tasks')::int = 0);

select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.check_counts('tech');
select pg_temp.check('tech does not see the staff-only probe project',
  not exists (select 1 from projects where id = '20000000-0000-0000-0000-00000000c001'));
select pg_temp.check('tech project_status_counts hides staff-only rows',
  (public.project_status_counts(null, null, null)->>'active')::int
    < (select active from pg_temp_staff_totals)
  and (public.project_status_counts(null, null, null)->>'proposed')::int
    < (select proposed from pg_temp_staff_totals));
select pg_temp.check('tech my_open_tasks is 1',
  (public.nav_badges()->>'my_open_tasks')::int = 1);
select pg_temp.check('tech notes.project_id listing cannot see staff-only note',
  (select count(*) from notes where project_id = '20000000-0000-0000-0000-00000000c001') = 0);

select pg_temp.as_user(null);
select pg_temp.check('jobs_status_idx exists', exists (select 1 from pg_class where relname = 'jobs_status_idx'));
select pg_temp.check('jobs_status_completed_at_idx exists', exists (select 1 from pg_class where relname = 'jobs_status_completed_at_idx'));
select pg_temp.check('jobs_starts_ends_idx exists', exists (select 1 from pg_class where relname = 'jobs_starts_ends_idx'));
select pg_temp.check('notes_project_idx exists', exists (select 1 from pg_class where relname = 'notes_project_idx'));

-- InitPlan wraps present; permissive policies were not merged (still more than one per table/action)
select pg_temp.check('all 8 initplan policies wrap auth.uid() in a subselect',
  (select count(*) from pg_policies
    where policyname in (
      'profiles_update_self','profiles_select','project_files_tech_insert','notes_tech_insert',
      'admin_audit_admin_insert','fleet_vehicles_select','photos_tech_insert','photos_tech_delete_own'
    )
    and (
      coalesce(qual, '') ilike '%select auth.uid()%'
      or coalesce(with_check, '') ilike '%select auth.uid()%'
    )
  ) = 8
);
select pg_temp.check('jobs still has separate staff and tech_read policies',
  exists (select 1 from pg_policies where tablename = 'jobs' and policyname = 'jobs_staff')
  and exists (select 1 from pg_policies where tablename = 'jobs' and policyname = 'jobs_tech_read'));
select pg_temp.check('photos still has separate staff and tech_read policies',
  exists (select 1 from pg_policies where tablename = 'photos' and policyname = 'photos_staff')
  and exists (select 1 from pg_policies where tablename = 'photos' and policyname = 'photos_tech_read'));
reset role;

-- ---- Sales CRM
reset role;
insert into public.invites (email, role, full_name) values ('ronan@example.com','sales','Ronan Sales');
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-000000000021','ronan@example.com', now());
insert into public.sales_deals (id, pipeline_slug, stage_slug, title, owner_id, source, monday_item_id, monday_board_id)
values ('50000000-0000-0000-0000-000000000001','single_family_whe','potential_lead','Test WHE deal','00000000-0000-0000-0000-000000000021','manual',null,null);

select pg_temp.as_user('00000000-0000-0000-0000-000000000021');
select pg_temp.check('sales can read sales pipelines', (select count(*) from sales_pipelines) >= 2);
select pg_temp.check('sales can see the whole pipeline', (select count(*) from sales_deals) = 1);
select pg_temp.check('sales cannot delete a deal', not exists (
  select 1 from sales_deals where id='50000000-0000-0000-0000-000000000001' and private.can_delete()
));
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000d'); -- Emily tech
select pg_temp.check('tech cannot read sales deals', (select count(*) from sales_deals)=0);
select pg_temp.check('tech cannot read sales pipelines', (select count(*) from sales_pipelines)=0);
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); -- Maria manager
select pg_temp.check('manager can read sales deals', (select count(*) from sales_deals)=1);
reset role;

select pg_temp.check('authenticated has table grants on sales_deals', has_table_privilege('authenticated', 'public.sales_deals', 'select'));
select pg_temp.check('anon has no access to sales_deals', not has_table_privilege('anon', 'public.sales_deals', 'select'));

-- Net prod state after the sales table-policy hotfix and the revoked RPC grants.
reset role;
select pg_temp.check('no sales SELECT policies on customers, projects, or jobs',
  not exists (
    select 1 from pg_policies
    where policyname in ('sales_customers_read','sales_projects_read','sales_jobs_read')
  ));
select pg_temp.check('anon cannot execute ingest_sales_lead',
  not has_function_privilege('anon', 'public.ingest_sales_lead(text, text, text, text, text, text, text, text, text, text, jsonb)', 'execute'));
select pg_temp.check('anon cannot execute sign_sales_proposal',
  not has_function_privilege('anon', 'public.sign_sales_proposal(text, text, boolean, text)', 'execute'));
select pg_temp.check('anon cannot execute convert_sales_deal',
  not has_function_privilege('anon', 'public.convert_sales_deal(uuid, timestamptz, timestamptz)', 'execute'));
select pg_temp.check('authenticated can execute convert_sales_deal',
  has_function_privilege('authenticated', 'public.convert_sales_deal(uuid, timestamptz, timestamptz)', 'execute'));
select pg_temp.check('authenticated cannot execute ingest_sales_lead',
  not has_function_privilege('authenticated', 'public.ingest_sales_lead(text, text, text, text, text, text, text, text, text, text, jsonb)', 'execute'));
select pg_temp.check('service_role can execute ingest, sign, and convert',
  has_function_privilege('service_role', 'public.ingest_sales_lead(text, text, text, text, text, text, text, text, text, text, jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.sign_sales_proposal(text, text, boolean, text)', 'execute')
  and has_function_privilege('service_role', 'public.convert_sales_deal(uuid, timestamptz, timestamptz)', 'execute'));

-- ---- Team Updates (deal + converted project history)
reset role;
insert into public.team_updates (id, deal_id, author_id, author_name, author_email, body, monday_update_id, created_at)
values (
  '60000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000021',
  'Ronan Sales',
  'ronan@example.com',
  'Can we confirm the attic baffles before we schedule?',
  'mon-karla-1',
  '2026-07-23T18:00:00Z'
);
insert into public.team_updates (id, deal_id, parent_id, author_id, author_name, body, monday_update_id, created_at)
values (
  '60000000-0000-0000-0000-000000000002',
  '50000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000021',
  'Ronan Sales',
  'Yes — Thursday afternoon works.',
  'mon-karla-2',
  '2026-07-23T19:00:00Z'
);

select pg_temp.as_user('00000000-0000-0000-0000-000000000021');
select pg_temp.check('sales can read deal updates', (select count(*) from team_updates where deal_id='50000000-0000-0000-0000-000000000001')=2);
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000d'); -- Emily tech
select pg_temp.check('tech cannot read unconverted deal updates', (select count(*) from team_updates)=0);
reset role;

update public.sales_deals
   set converted_project_id = '20000000-0000-0000-0000-000000000002'
 where id = '50000000-0000-0000-0000-000000000001';

select pg_temp.check('converting a deal copies project_id onto its updates',
  (select project_id from team_updates where id='60000000-0000-0000-0000-000000000001')
  = '20000000-0000-0000-0000-000000000002');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000d'); -- Emily, assigned to project 2
select pg_temp.check('tech can read updates on an assigned converted project', (select count(*) from team_updates)=2);
select pg_temp.check('tech sees the full reply under the question',
  (select parent_id from team_updates where id='60000000-0000-0000-0000-000000000002')
  = '60000000-0000-0000-0000-000000000001');

-- Tech can post on the project they can see.
select public.post_team_update(
  null,
  '20000000-0000-0000-0000-000000000002',
  '60000000-0000-0000-0000-000000000001',
  'On site Thursday. I will send photos.',
  '{}'
);
select pg_temp.check('tech can reply on a converted project thread',
  (select count(*) from team_updates where parent_id='60000000-0000-0000-0000-000000000001')=2);

select pg_temp.fails('tech cannot delete someone else''s update',
  $$select public.delete_team_update('60000000-0000-0000-0000-000000000001')$$);
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-000000000021');
select pg_temp.check('deal owner is notified of the tech reply',
  (select count(*) from team_update_notifications
    where user_id='00000000-0000-0000-0000-000000000021' and kind in ('owner','thread')) >= 1);
select pg_temp.check('nav_badges includes unread updates',
  (public.nav_badges()->>'unread_updates')::int >= 1);
select public.delete_team_update('60000000-0000-0000-0000-000000000002');
select pg_temp.check('author can soft-delete their own update',
  (select deleted_at is not null from team_updates where id='60000000-0000-0000-0000-000000000002'));
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b'); -- Maria manager, can_delete default false
select pg_temp.fails('manager without Delete access cannot delete someone else''s update',
  $$select public.delete_team_update('60000000-0000-0000-0000-000000000001')$$);
select pg_temp.as_user(null);
update public.profiles set can_delete=true where id='00000000-0000-0000-0000-00000000000b';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.delete_team_update('60000000-0000-0000-0000-000000000001');
select pg_temp.check('manager with Delete access can delete someone else''s update',
  (select deleted_at is not null from team_updates where id='60000000-0000-0000-0000-000000000001'));
select pg_temp.as_user(null);
update public.profiles set can_delete=false where id='00000000-0000-0000-0000-00000000000b';

-- Notifications are only visible to the recipient.
insert into public.team_update_notifications (id, user_id, update_id, kind, title, body, link)
values (
  '70000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-00000000000d',
  '60000000-0000-0000-0000-000000000001',
  'assignee',
  'New update',
  'preview',
  '/projects/20000000-0000-0000-0000-000000000002#update-60000000-0000-0000-0000-000000000001'
);
select pg_temp.as_user('00000000-0000-0000-0000-000000000021');
select pg_temp.check('sales cannot read another user''s update notifications',
  (select count(*) from team_update_notifications where id='70000000-0000-0000-0000-000000000001')=0);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.check('recipient can read their update notification',
  (select count(*) from team_update_notifications where id='70000000-0000-0000-0000-000000000001')=1);
reset role;

select pg_temp.check('team updates still added no sales SELECT policies on customers, projects, or jobs',
  not exists (
    select 1 from pg_policies
    where policyname in ('sales_customers_read','sales_projects_read','sales_jobs_read')
  ));
select pg_temp.check('authenticated has table grants on team_updates',
  has_table_privilege('authenticated', 'public.team_updates', 'select'));
select pg_temp.check('anon has no access to team_updates',
  not has_table_privilege('anon', 'public.team_updates', 'select'));
