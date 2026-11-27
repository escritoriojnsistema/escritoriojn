-- The full CAR format is 50 characters, including its punctuation.
DO $car_mask$
DECLARE
  signature regprocedure;
  source text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'private.category_intake_validate(jsonb,jsonb)'::regprocedure,
    'private.category_response_option_validate(text,jsonb)'::regprocedure
  ] LOOP
    source := pg_get_functiondef(signature);
    IF strpos(source,'{1,48}')=0 THEN
      RAISE EXCEPTION 'Category mask validation has drifted: %',signature;
    END IF;
    EXECUTE replace(replace(replace(replace(source,'{1,48}','{1,50}'),
      '[-0A*','[-0AH*'),'[0A*]','[0AH*]'),'[A*]','[AH*]');
  END LOOP;
  source := pg_get_functiondef('private.category_response_matches(text,text)'::regprocedure);
  IF strpos(source,$slot$WHEN '*' THEN item.character ~ '^[A-Za-z0-9]$'$slot$)=0 THEN
    RAISE EXCEPTION 'Category mask matching has drifted';
  END IF;
  EXECUTE replace(source,$slot$WHEN '*' THEN item.character ~ '^[A-Za-z0-9]$'$slot$,
    $slots$WHEN 'H' THEN item.character ~ '^[A-Fa-f0-9]$'
      WHEN '*' THEN item.character ~ '^[A-Za-z0-9]$'$slots$);
END $car_mask$;
