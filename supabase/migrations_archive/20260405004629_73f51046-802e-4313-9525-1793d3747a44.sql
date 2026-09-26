
-- Allow authenticated users to insert clinics (for onboarding)
CREATE POLICY "Authenticated users can create clinics"
ON public.clinics
FOR INSERT
TO authenticated
WITH CHECK (true);
