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
select pg_temp.check('projects default to a 24-month warranty', (select bool_and(warranty_months = 24) from projects));

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
select pg_temp.check('view: expiry is completion + 24 months', (select warranty_expires_at = project_completed_at + interval '24 months' from service_request_list where number=1001));
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
insert into photos (project_id, job_id, kind, storage_path) values
  ('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000009','completion','20000000-0000-0000-0000-000000000001/completion/w1.jpg');
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
