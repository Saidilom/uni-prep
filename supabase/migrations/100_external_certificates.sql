-- Внешний сертификат БМБА: то, что ученик получил на НАСТОЯЩЕМ экзамене.
--
-- ЗАЧЕМ. Привязка нашей шкалы к шкале БМБА (§R) выводится только эмпирически:
-- нужны пары «наш θ ↔ реальный балл сертификата», 100–150 учеников на предмет
-- (§R.2). Хранить эти пары было НЕГДЕ — поиск по всей схеме public по именам
-- вроде certificate / official / external / bma / milliy давал ноль колонок.
-- Пока хранить негде, §R.3 нечем считать, и A_scale = 10, B_scale = 50
-- остаются заглушкой.
--
-- Эта миграция даёт только ХРАНЕНИЕ. Линкинг не считается, формула θ → балл не
-- меняется, ни один существующий балл не трогается.
--
-- ═══ ГЛАВНОЕ ПРО ЭТИ ДАННЫЕ ═══
--
-- Это ЗАЯВЛЕНИЕ о государственном документе, а не наше измерение. Отсюда две
-- обязательные колонки: source (кто внёс) и verification_status (сверял ли
-- кто-нибудь с бумагой). По умолчанию доверия нет ни у одной записи — включая
-- импорт администратора: импорт означает «перенёс из таблицы», а не «держал
-- документ в руках».
--
-- Почему это строго: шкала, подогнанная под чужие опечатки, ошибочна тем
-- сильнее, чем увереннее выглядит. §E.5 требует брать в калибровку только
-- валидные данные, а §R.5 мерит MAE на held-out — на грязных данных обе
-- проверки покажут ложный успех.

CREATE TABLE IF NOT EXISTS public.external_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Предмет сертификата. Не FK: список предметов живёт в коде
  -- (MOCK_SUBJECTS), таблицы предметов в схеме нет.
  subject_id text NOT NULL,

  -- Балл по шкале БМБА, 0–75. Та же шкала, что у нас после миграции 092.
  score numeric NOT NULL,

  -- Уровень С ДОКУМЕНТА. Необязателен: на части сертификатов только балл.
  -- Хранится как напечатано, а не выводится из балла — расхождение между ними
  -- это находка, и затирать его пересчётом нельзя.
  level text,

  issued_at date NOT NULL,
  certificate_number text,

  -- Кто внёс и можно ли верить.
  source text NOT NULL,
  verification_status text NOT NULL DEFAULT 'unverified',
  verified_by text REFERENCES public.users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  -- Чем подтверждали: «сверено со скан-копией», «звонок в центр» и т.п.
  verification_note text,

  created_by text REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.external_certificates IS
  'Реальные сертификаты Milliy sertifikat, заявленные учеником или импортированные админом. Вход для линкинга §R.2–R.3. Заявление о документе, а не наше измерение.';
COMMENT ON COLUMN public.external_certificates.level IS
  'Уровень как напечатан на документе. Может расходиться с баллом — это находка, а не повод пересчитать.';
COMMENT ON COLUMN public.external_certificates.verification_status IS
  'verified — кто-то сверил с документом. unverified по умолчанию у ВСЕХ, включая импорт админа. В линкинг идут только verified (§E.5).';

-- ═══ Ограничения ═══

ALTER TABLE public.external_certificates
  DROP CONSTRAINT IF EXISTS external_certificates_source_check;
ALTER TABLE public.external_certificates
  ADD CONSTRAINT external_certificates_source_check CHECK (source IN ('admin', 'self'));

ALTER TABLE public.external_certificates
  DROP CONSTRAINT IF EXISTS external_certificates_verification_check;
ALTER TABLE public.external_certificates
  ADD CONSTRAINT external_certificates_verification_check
  CHECK (verification_status IN ('verified', 'unverified'));

-- Балл 46–75. Нижняя граница из §0.3: «< 46 — нет сертификата», значит запись
-- ниже описывает документ, которого не существует. Верхняя — потолок шкалы.
ALTER TABLE public.external_certificates
  DROP CONSTRAINT IF EXISTS external_certificates_score_range_check;
ALTER TABLE public.external_certificates
  ADD CONSTRAINT external_certificates_score_range_check
  CHECK (score >= 46 AND score <= 75);

-- below_c среди уровней нет по той же причине.
ALTER TABLE public.external_certificates
  DROP CONSTRAINT IF EXISTS external_certificates_level_check;
ALTER TABLE public.external_certificates
  ADD CONSTRAINT external_certificates_level_check
  CHECK (level IS NULL OR level IN ('C', 'C+', 'B', 'B+', 'A', 'A+'));

-- Подтверждение обязано быть именным: «verified» без того, кто подтвердил,
-- ничего не значит и в линкинг пускать такое нельзя.
ALTER TABLE public.external_certificates
  DROP CONSTRAINT IF EXISTS external_certificates_verified_by_check;
ALTER TABLE public.external_certificates
  ADD CONSTRAINT external_certificates_verified_by_check
  CHECK (verification_status = 'unverified' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL));

-- Номер сертификата уникален: это идентификатор документа, и два ученика с
-- одним номером означают ошибку ввода или подлог.
CREATE UNIQUE INDEX IF NOT EXISTS external_certificates_number_uq
  ON public.external_certificates (certificate_number)
  WHERE certificate_number IS NOT NULL;

-- Один ученик — один сертификат по предмету на дату. Пересдача в другом году
-- разрешена: это отдельный документ и отдельная пара для линкинга.
CREATE UNIQUE INDEX IF NOT EXISTS external_certificates_user_subject_date_uq
  ON public.external_certificates (user_id, subject_id, issued_at);

CREATE INDEX IF NOT EXISTS external_certificates_subject_idx
  ON public.external_certificates (subject_id, verification_status);

-- Расхождение уровня и балла — считаем, а не запрещаем.
--
-- Запретить нельзя: если на реальном документе так и напечатано, запись стала
-- бы невносимой. Поэтому колонка вычисляемая: она даёт разобрать расхождения
-- и не пустить их в линкинг, ничего не блокируя при вводе. Пороги те же, что
-- в §0.3 и в gradeLevelFromScore.
ALTER TABLE public.external_certificates
  ADD COLUMN IF NOT EXISTS level_matches_score boolean
  GENERATED ALWAYS AS (
    level IS NULL OR level = CASE
      WHEN score >= 70 THEN 'A+'
      WHEN score >= 65 THEN 'A'
      WHEN score >= 60 THEN 'B+'
      WHEN score >= 55 THEN 'B'
      WHEN score >= 50 THEN 'C+'
      ELSE 'C'
    END
  ) STORED;

COMMENT ON COLUMN public.external_certificates.level_matches_score IS
  'Совпадает ли напечатанный уровень с баллом по порогам §0.3. false — разбирать, в линкинг не брать.';

-- ═══ Доступ ═══

ALTER TABLE public.external_certificates ENABLE ROW LEVEL SECURITY;

-- Админ — всё.
DROP POLICY IF EXISTS external_certificates_admin ON public.external_certificates;
CREATE POLICY external_certificates_admin ON public.external_certificates
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Ученик видит свои.
DROP POLICY IF EXISTS external_certificates_own_read ON public.external_certificates;
CREATE POLICY external_certificates_own_read ON public.external_certificates
  FOR SELECT USING (user_id = auth.uid()::text);

-- Ученик вносит свой — и только как 'self' и только неподтверждённым.
-- WITH CHECK закрывает главную дыру: без него ученик вписал бы себе
-- source='admin' и verification_status='verified', то есть подтвердил бы сам
-- себя, и такая запись пошла бы в линкинг как проверенная.
DROP POLICY IF EXISTS external_certificates_own_insert ON public.external_certificates;
CREATE POLICY external_certificates_own_insert ON public.external_certificates
  FOR INSERT WITH CHECK (
    user_id = auth.uid()::text
    AND source = 'self'
    AND verification_status = 'unverified'
    AND verified_by IS NULL
    AND verified_at IS NULL
  );

-- Правит ученик только СВОИ и только ещё не подтверждённые: подтверждённую
-- запись он изменить не может, иначе проверка теряет смысл. И после правки
-- она обязана остаться неподтверждённой.
DROP POLICY IF EXISTS external_certificates_own_update ON public.external_certificates;
CREATE POLICY external_certificates_own_update ON public.external_certificates
  FOR UPDATE
  USING (user_id = auth.uid()::text AND verification_status = 'unverified' AND source = 'self')
  WITH CHECK (
    user_id = auth.uid()::text
    AND source = 'self'
    AND verification_status = 'unverified'
    AND verified_by IS NULL
    AND verified_at IS NULL
  );

DROP POLICY IF EXISTS external_certificates_own_delete ON public.external_certificates;
CREATE POLICY external_certificates_own_delete ON public.external_certificates
  FOR DELETE USING (
    user_id = auth.uid()::text AND verification_status = 'unverified' AND source = 'self'
  );

-- ═══ Подтверждение — отдельным действием ═══
--
-- Отдельный RPC, а не UPDATE из клиента: подтверждение обязано проставить того,
-- кто подтвердил, и время. Через голый UPDATE их легко забыть, и в базе
-- появились бы «проверенные неизвестно кем» записи.
CREATE OR REPLACE FUNCTION public.verify_external_certificate(
  p_certificate_id uuid,
  p_verified boolean,
  p_note text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.external_certificates;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.external_certificates
  SET verification_status = CASE WHEN p_verified THEN 'verified' ELSE 'unverified' END,
      verified_by = CASE WHEN p_verified THEN auth.uid()::text ELSE NULL END,
      verified_at = CASE WHEN p_verified THEN now() ELSE NULL END,
      verification_note = NULLIF(trim(p_note), ''),
      updated_at = now()
  WHERE id = p_certificate_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN RAISE EXCEPTION 'Certificate not found'; END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'verificationStatus', v_row.verification_status,
    'levelMatchesScore', v_row.level_matches_score
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_external_certificate(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_external_certificate(uuid, boolean, text) TO authenticated;

-- ═══ Готовность к линкингу ═══
--
-- §R.2 требует 100–150 учеников НА ПРЕДМЕТ. Без этого счётчика «данные вроде
-- есть» будет означать что угодно. Представление отвечает на один вопрос:
-- сколько пригодных пар набрано по каждому предмету и сколько ещё нужно.
--
-- Пара засчитывается, только если сертификат подтверждён, уровень с баллом не
-- расходится, И у того же ученика есть НАШ балл по тому же предмету — без
-- второй половины пары линкингу нечего сопоставлять.
CREATE OR REPLACE VIEW public.linking_readiness
WITH (security_invoker = true) AS
SELECT ec.subject_id,
       count(*) FILTER (WHERE ec.verification_status = 'verified'
                          AND ec.level_matches_score
                          AND mr.id IS NOT NULL) AS usable_pairs,
       count(*) FILTER (WHERE ec.verification_status = 'verified') AS verified_certificates,
       count(*) AS certificates_total,
       count(*) FILTER (WHERE NOT ec.level_matches_score) AS level_mismatches,
       count(*) FILTER (WHERE ec.source = 'self') AS self_reported,
       -- §R.2: нижняя граница выборки на предмет.
       greatest(0, 100 - count(*) FILTER (WHERE ec.verification_status = 'verified'
                                            AND ec.level_matches_score
                                            AND mr.id IS NOT NULL)) AS still_needed
FROM public.external_certificates ec
LEFT JOIN LATERAL (
  SELECT r.id
  FROM public.mock_results r
  JOIN public.mock_tests mt ON mt.id = r.mock_test_id
  WHERE r.user_id = ec.user_id
    AND mt.subject_id = ec.subject_id
    AND r.level_score IS NOT NULL
  LIMIT 1
) mr ON true
GROUP BY ec.subject_id;

COMMENT ON VIEW public.linking_readiness IS
  'Сколько пар «наш балл ↔ реальный сертификат» набрано по предмету и сколько ещё нужно до 100 (§R.2). Считает только подтверждённые и без расхождения уровня.';

-- Линкинг этой миграцией НЕ считается, формула θ → балл не меняется:
-- A_scale = 10 и B_scale = 50 остаются заглушкой до §R.3. Ни один балл на
-- проде не тронут.

NOTIFY pgrst, 'reload schema';
