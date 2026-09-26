
CREATE POLICY "Staff uploads patient photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'patient-photos'
  AND public.is_clinic_staff(auth.uid(), (storage.foldername(name))[1]::uuid)
);

CREATE POLICY "Staff views patient photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'patient-photos'
  AND public.is_clinic_staff(auth.uid(), (storage.foldername(name))[1]::uuid)
);

CREATE POLICY "Staff deletes patient photos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'patient-photos'
  AND public.is_clinic_staff(auth.uid(), (storage.foldername(name))[1]::uuid)
);

CREATE POLICY "Patient views own photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'patient-photos'
  AND (storage.foldername(name))[1]::uuid IN (
    SELECT public.get_patient_clinic_id(auth.uid())
  )
);
