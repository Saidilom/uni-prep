-- Статусы ответа: пропуск перестаёт быть неверным ответом. ТЗ §A.3–A.4, §73–74.
--
-- ЧТО БЫЛО. Всё неотвеченное уходило в модель Раша нулём. На проде это 636
-- ответов из 4700, и 501 из них — ХВОСТОВЫЕ: ученик не дошёл до конца
-- варианта. Модель читала это как «пытался и не смог», то есть завышала
-- сложность последних заданий и занижала способность тех, кому не хватило
-- времени. Замер по тестам:
--
--   Mock Matematika  352 пропуска = 302 NOT_REACHED + 50 OMITTED
--   Ona Tili         284 пропуска = 199 NOT_REACHED + 85 OMITTED
--
-- ЧТО СТАНОВИТСЯ. Норма требует двух политик (§A.3):
--   при калибровке заданий  — пропуск это missing, а не ноль;
--   при выдаче балла ученику — пропуск не даёт баллов (политика оценивания).
--
-- Правило разметки: пропуски в хвосте — NOT_REACHED, пропуски до последнего
-- отвеченного задания — OMITTED. Самый консервативный способ различить их без
-- временных меток: ответивший на задание №40 до №39 дошёл заведомо.
--
-- Живая логика лежит в src/lib/response-status.ts и покрыта тестами; здесь —
-- та же формула для РАЗМЕТКИ УЖЕ ЛЕЖАЩИХ строк. Колонка нужна для
-- прослеживаемости (§199, §230): по одному `selected_answer` потом не
-- восстановить, чем именно этот ответ считался при выставлении балла.

-- ═══ 1. Уникальность ответа ═══
--
-- На (result_id, question_id) не было ограничения: два ответа на одно задание
-- в одной работе прошли бы молча и попали бы в модель двумя наблюдениями,
-- удвоив вес задания. Сейчас дублей нет (проверено: 0), поэтому индекс
-- строится без чистки — и заодно даёт upsert по этой паре.
CREATE UNIQUE INDEX IF NOT EXISTS mock_answer_details_result_question_uq
  ON public.mock_answer_details (result_id, question_id);

-- ═══ 2. Колонка статуса ═══
ALTER TABLE public.mock_answer_details
  ADD COLUMN IF NOT EXISTS response_state text;

COMMENT ON COLUMN public.mock_answer_details.response_state IS
  'CORRECT | INCORRECT | OMITTED | NOT_REACHED (ТЗ §73–74). OMITTED — пропустил, дальше отвечал; NOT_REACHED — не дошёл.';

ALTER TABLE public.mock_answer_details
  DROP CONSTRAINT IF EXISTS mock_answer_details_response_state_check;
ALTER TABLE public.mock_answer_details
  ADD CONSTRAINT mock_answer_details_response_state_check
  CHECK (response_state IS NULL
         OR response_state IN ('CORRECT', 'INCORRECT', 'OMITTED', 'NOT_REACHED'));

-- ═══ 3. Провенанс расчёта ═══
--
-- §109 и §199: смена метода — это новая версия, и она обязана быть видна в
-- данных. Раньше по строке калибровки нельзя было сказать ни какой политикой
-- пропусков она посчитана, ни каким оценщиком получена способность.
ALTER TABLE public.mock_item_calibration
  ADD COLUMN IF NOT EXISTS missing_policy text,
  ADD COLUMN IF NOT EXISTS person_estimator text;

COMMENT ON COLUMN public.mock_item_calibration.missing_policy IS
  'EXAM | CALIBRATION — как трактовались пропуски при оценке этих сложностей (§A.3).';
COMMENT ON COLUMN public.mock_item_calibration.person_estimator IS
  'Оценщик способности и его версия, например WLE_WARM_1989/1.0 (§C.8: WLE нельзя выдавать под именем MLE).';

ALTER TABLE public.mock_item_calibration
  DROP CONSTRAINT IF EXISTS mock_item_calibration_missing_policy_check;
ALTER TABLE public.mock_item_calibration
  ADD CONSTRAINT mock_item_calibration_missing_policy_check
  CHECK (missing_policy IS NULL OR missing_policy IN ('EXAM', 'CALIBRATION'));

-- ═══ 4. Разметка существующих ответов ═══
--
-- Позиционное правило: нумеруем задания в том порядке, в котором их видел
-- ученик (секция, потом задание), находим последнее ОТВЕЧЕННОЕ и всё пустое
-- после него объявляем NOT_REACHED.
--
-- Сочинение исключено: у него `is_correct` всегда false, оно считается вторым
-- разделом вне модели, и статус «неверно» его исказил бы.
WITH ordered AS (
  SELECT ad.id,
         ad.result_id,
         ad.is_correct,
         row_number() OVER (PARTITION BY ad.result_id ORDER BY s."order", q."order") AS pos,
         -- Неотвеченное submit_mock пишет литералом 'null'; пустая строка и
         -- SQL NULL встречаются у более старых строк.
         (ad.selected_answer IS NULL OR ad.selected_answer IN ('null', '', 'undefined')) AS blank
  FROM public.mock_answer_details ad
  JOIN public.mock_questions q ON q.id = ad.question_id
  JOIN public.mock_sections s ON s.id = q.section_id
  WHERE q.question_type <> 'essay'
),
last_answered AS (
  SELECT result_id, max(pos) FILTER (WHERE NOT blank) AS last_pos
  FROM ordered GROUP BY result_id
)
UPDATE public.mock_answer_details ad
SET response_state = CASE
      WHEN NOT o.blank AND o.is_correct THEN 'CORRECT'
      WHEN NOT o.blank THEN 'INCORRECT'
      -- Полностью пустая работа: last_pos IS NULL, значит доказательства, что
      -- ученик куда-то дошёл, нет вовсе — вся работа NOT_REACHED.
      WHEN la.last_pos IS NULL OR o.pos > la.last_pos THEN 'NOT_REACHED'
      ELSE 'OMITTED'
    END
FROM ordered o
JOIN last_answered la ON la.result_id = o.result_id
WHERE ad.id = o.id
  AND ad.response_state IS DISTINCT FROM CASE
      WHEN NOT o.blank AND o.is_correct THEN 'CORRECT'
      WHEN NOT o.blank THEN 'INCORRECT'
      WHEN la.last_pos IS NULL OR o.pos > la.last_pos THEN 'NOT_REACHED'
      ELSE 'OMITTED'
    END;

-- ═══ 5. Самопроверка ═══
--
-- Разметка обязана совпасть с замером, из которого делались выводы выше. Если
-- не совпала — изменились данные или правило, и молча продолжать нельзя.
DO $$
DECLARE
  v_unmarked int;
  v_not_reached int;
  v_omitted int;
BEGIN
  SELECT count(*) INTO v_unmarked
  FROM public.mock_answer_details ad
  JOIN public.mock_questions q ON q.id = ad.question_id
  WHERE q.question_type <> 'essay' AND ad.response_state IS NULL;

  SELECT count(*) FILTER (WHERE response_state = 'NOT_REACHED'),
         count(*) FILTER (WHERE response_state = 'OMITTED')
    INTO v_not_reached, v_omitted
  FROM public.mock_answer_details;

  IF v_unmarked > 0 THEN
    RAISE EXCEPTION 'У % не-эссе ответов статус не проставлен — правило не покрыло все строки', v_unmarked;
  END IF;

  RAISE NOTICE 'Разметка: NOT_REACHED = %, OMITTED = %', v_not_reached, v_omitted;
END;
$$;

-- Существующие баллы этой миграцией НЕ пересчитываются: она только помечает
-- ответы и добавляет колонки. Балл изменится при следующем прогоне
-- /api/rasch/recalculate — и вот там уже понадобится ревизия (§239), потому
-- что вместе с политикой пропусков поменяется и оценщик способности (WLE).

NOTIFY pgrst, 'reload schema';
