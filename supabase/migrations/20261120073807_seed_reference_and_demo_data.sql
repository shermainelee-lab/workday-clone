-- leave types (defaults: replace with contract figures)
insert into public.leave_types (code, name, is_paid, default_entitlement, prorate_for_joiners, over_limit_action, requires_certificate, cap_group, cap_group_limit, min_notice_days, sort_order) values
 ('AL','Annual Leave', true, 14, true, 'block', false, null, null, 3, 1),
 ('SL','Sick Leave (outpatient)', true, 14, false, 'flag', true, 'SICK', 60, 0, 2),
 ('HL','Hospitalisation Leave', true, 46, false, 'flag', true, 'SICK', 60, 0, 3),
 ('CCL','Childcare Leave', true, 6, false, 'block', false, null, null, 3, 4),
 ('CPL','Compassionate Leave', true, 3, false, 'block', false, null, null, 0, 5),
 ('UL','Unpaid Leave', false, 0, false, 'none', false, null, null, 3, 6);
update public.leave_types set must_exhaust_type_id = (select id from public.leave_types where code = 'AL') where code = 'UL';

-- claim categories (default limits: replace with finance policy)
insert into public.claim_categories (code, name, per_line_limit, requires_receipt, sort_order) values
 ('TRANSPORT','Transport / taxi', 100, true, 1),
 ('MEALS','Meals & entertainment', 150, true, 2),
 ('MEDICAL','Medical', 300, true, 3),
 ('TRAINING','Training & courses', 1000, true, 4),
 ('OFFICE','Office supplies', 200, true, 5),
 ('MILEAGE','Mileage / parking', 80, false, 6),
 ('OTHER','Other', 100, true, 7);

-- MOM gazetted public holidays 2026-2027 (plus in-lieu Mondays for 5-day weeks)
insert into public.public_holidays (holiday_date, name, is_in_lieu) values
 ('2026-01-01','New Year''s Day',false),('2026-02-17','Chinese New Year',false),('2026-02-18','Chinese New Year',false),
 ('2026-03-21','Hari Raya Puasa',false),('2026-04-03','Good Friday',false),('2026-05-01','Labour Day',false),
 ('2026-05-27','Hari Raya Haji',false),('2026-05-31','Vesak Day',false),('2026-06-01','Vesak Day (in lieu)',true),
 ('2026-08-09','National Day',false),('2026-08-10','National Day (in lieu)',true),
 ('2026-11-08','Deepavali',false),('2026-11-09','Deepavali (in lieu)',true),('2026-12-25','Christmas Day',false),
 ('2027-01-01','New Year''s Day',false),('2027-02-06','Chinese New Year',false),('2027-02-07','Chinese New Year',false),
 ('2027-02-08','Chinese New Year (in lieu)',true),('2027-03-10','Hari Raya Puasa',false),('2027-03-26','Good Friday',false),
 ('2027-05-01','Labour Day',false),('2027-05-17','Hari Raya Haji',false),('2027-05-20','Vesak Day',false),
 ('2027-08-09','National Day',false),('2027-10-28','Deepavali',false),('2027-12-25','Christmas Day',false);

-- demo company (fictional people; change the emails to real ones so staff can sign in)
insert into public.departments (name) values ('Management'),('HR & Admin'),('Operations'),('Sales'),('Finance');

insert into public.employees (employee_no, full_name, email, job_title, department_id, role, join_date) values
 ('E001','Alice Tan','alice.tan@example.com','Managing Director',(select id from public.departments where name='Management'),'director','2019-03-01'),
 ('E002','Priya Nair','priya.nair@example.com','HR Manager',(select id from public.departments where name='HR & Admin'),'hr','2026-07-01'),
 ('E003','Grace Lim','grace.lim@example.com','Office Manager',(select id from public.departments where name='HR & Admin'),'office_manager','2021-05-10'),
 ('E004','Daniel Ong','daniel.ong@example.com','Head of Operations',(select id from public.departments where name='Operations'),'employee','2020-01-06'),
 ('E005','Ahmad Yusof','ahmad.yusof@example.com','Operations Executive',(select id from public.departments where name='Operations'),'employee','2022-08-15'),
 ('E006','Wei Ling Chua','weiling.chua@example.com','Head of Sales',(select id from public.departments where name='Sales'),'employee','2020-09-01'),
 ('E007','Marcus Teo','marcus.teo@example.com','Sales Executive',(select id from public.departments where name='Sales'),'employee','2023-02-20'),
 ('E008','Siti Rahman','siti.rahman@example.com','Finance Executive',(select id from public.departments where name='Finance'),'finance','2022-01-17');

update public.employees e set manager_id = m.id
  from public.employees m
 where (e.employee_no, m.employee_no) in (('E002','E001'),('E003','E002'),('E004','E001'),('E005','E004'),('E006','E001'),('E007','E006'),('E008','E001'));

update public.departments d set head_id = e.id from public.employees e
 where (d.name, e.employee_no) in (('Management','E001'),('HR & Admin','E002'),('Operations','E004'),('Sales','E006'),('Finance','E008'));

select public.ensure_entitlements(2026), public.ensure_entitlements(2027);
