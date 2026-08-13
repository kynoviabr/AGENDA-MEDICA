drop policy if exists "Admin updates roles" on public.user_roles;

create policy "Admin updates roles"
on public.user_roles
for update
to authenticated
using (public.has_clinic_role((select auth.uid()), clinic_id, 'admin'::public.app_role))
with check (public.has_clinic_role((select auth.uid()), clinic_id, 'admin'::public.app_role));
