-- =======================================================
-- SCRIPT: Limpiar productos duplicados
-- =======================================================
-- PROBLEMA: La importación SQL no verificaba duplicados,
--           generando productos repetidos con el mismo código.
-- ACCIÓN:   Para cada (business_id, code), conserva el
--           producto con el ID más antiguo (el original)
--           y hace soft delete de los duplicados.
-- =======================================================

-- Paso 1: Ver duplicados ANTES de borrar (solo lectura)
SELECT
    business_id,
    code,
    COUNT(*) AS cantidad,
    STRING_AGG(id::text, ', ' ORDER BY created_at) AS ids
FROM products
WHERE deleted_at IS NULL
GROUP BY business_id, code
HAVING COUNT(*) > 1
ORDER BY cantidad DESC, code;

-- =======================================================
-- Paso 2: Soft delete de duplicados (conservar el más antiguo)
-- =======================================================
-- IMPORTANTE: Descomentar las líneas de UPDATE para ejecutar.
--             Primero corré el SELECT de arriba para verificar
--             que los datos sean correctos.
--
-- UPDATE products
-- SET deleted_at = NOW()
-- WHERE id IN (
--     SELECT p.id
--     FROM products p
--     INNER JOIN (
--         SELECT business_id, code, MIN(created_at) AS min_created_at
--         FROM products
--         WHERE deleted_at IS NULL
--         GROUP BY business_id, code
--         HAVING COUNT(*) > 1
--     ) orig ON p.business_id = orig.business_id AND p.code = orig.code
--     WHERE p.deleted_at IS NULL
--       AND p.created_at > orig.min_created_at
-- );

-- =======================================================
-- Paso 3: Verificar que quedó limpio
-- =======================================================
SELECT
    business_id,
    code,
    COUNT(*) AS cantidad
FROM products
WHERE deleted_at IS NULL
GROUP BY business_id, code
HAVING COUNT(*) > 1;

-- Si el resultado es 0 filas, significa que no hay más duplicados.
