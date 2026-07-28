-- 1. Добавляем колонку версии токена для пользователей
ALTER TABLE crm_users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 1;

-- 2. Удаляем старую функцию с прежней сигнатурой возвращаемой таблицы
DROP FUNCTION IF EXISTS verify_crm_user(text, text);

-- 3. Создаем обновленную функцию с новой сигнатурой (возвращает token_version)
CREATE OR REPLACE FUNCTION verify_crm_user(p_username text, p_password text)
RETURNS TABLE (id uuid, username text, role text, token_version int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF length(coalesce(p_username, '')) < 2
    OR length(coalesce(p_username, '')) > 80
    OR length(coalesce(p_password, '')) < 1
    OR length(coalesce(p_password, '')) > 256 THEN
    RETURN;
  END IF;

  UPDATE crm_users u
  SET last_login_at = now(), updated_at = now()
  WHERE lower(u.username) = lower(trim(p_username))
    AND u.active = true
    AND u.password_hash = extensions.crypt(p_password, u.password_hash);

  RETURN QUERY
  SELECT u.id, u.username, u.role, u.token_version
  FROM crm_users u
  WHERE lower(u.username) = lower(trim(p_username))
    AND u.active = true
    AND u.password_hash = extensions.crypt(p_password, u.password_hash)
  LIMIT 1;
END;
$$;

-- 4. Переприменяем права на выполнение функции (так как drop function сбрасывает их)
REVOKE ALL ON FUNCTION verify_crm_user(text, text) FROM public;
GRANT EXECUTE ON FUNCTION verify_crm_user(text, text) TO anon, authenticated;
