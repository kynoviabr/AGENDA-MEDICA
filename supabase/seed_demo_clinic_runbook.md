## Seed demo clinic

Se o SQL Editor reclamar de `unterminated dollar-quoted string`, normalmente significa que o conteúdo foi colado incompleto.

O arquivo [seed_demo_clinic.sql](/Users/dempas/Documents/remix-of-clinic-journey/supabase/seed_demo_clinic.sql) está fechado corretamente com:

```sql
DO $$
...
END $$;
```

### Jeito mais seguro de rodar

1. Abra o arquivo localmente.
2. Copie **do primeiro comentário até a última linha `END $$;`**.
3. Cole no SQL Editor.
4. Clique em `Run`.

### Se ainda falhar

Rode primeiro este teste mínimo no SQL Editor:

```sql
DO $$
BEGIN
  RAISE NOTICE 'teste ok';
END $$;
```

Se esse teste falhar, o problema não está no seed; está no conteúdo colado no editor.
