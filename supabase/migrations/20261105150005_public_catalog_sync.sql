-- Visibility is independent of the information needed to book a service.
-- Never restore archived services or approve templates implicitly.
DO $m$ DECLARE n text;s text;updated text;part text;BEGIN
 FOREACH n IN ARRAY ARRAY['document_offer_projection','document_staff_offer_projection'] LOOP
 SELECT pg_get_functiondef(p.oid) INTO s FROM pg_proc p WHERE p.pronamespace='private'::regnamespace AND p.proname=n;
 updated:=s;
 FOREACH part IN ARRAY ARRAY[
 ' OR (sv.definition->>''quantity_min'')::integer>1',
 ' OR (sv.definition->>''quantity_max'')::integer<1',
 ' OR (sv.definition->>''participants_min'')::integer>0',
 ' OR jsonb_array_length(sv.definition->''checklist'')>0',
 ' OR jsonb_array_length(sv.definition->''fields'')>0'] LOOP updated:=replace(updated,part,'');END LOOP;
 updated:=replace(updated,'''service_code'',s.code,','''service_code'',s.code,''service_name'',sv.definition->>''name'',''can_book'',((sv.definition->>''quantity_min'')::int<=1 AND(sv.definition->>''quantity_max'')::int>=1 AND(sv.definition->>''participants_min'')::int=0 AND jsonb_array_length(sv.definition->''fields'')=0),');
 IF updated=s OR strpos(updated,'''can_book''')=0 THEN RAISE EXCEPTION 'Catalog projection patch missing';END IF;EXECUTE updated;
 END LOOP;
 -- Permit publication of approved, authorized informational offers even when
 -- participation/service-specific fields need an assisted request first.
 SELECT pg_get_functiondef('private.document_offer_manage(uuid,uuid,jsonb,integer,uuid)'::regprocedure) INTO s;updated:=s;
 FOREACH part IN ARRAY ARRAY[
 ' OR (current_sv.definition->>''quantity_min'')::integer>1',
 ' OR (current_sv.definition->>''quantity_max'')::integer<1',
 ' OR (current_sv.definition->>''participants_min'')::integer>0',
 ' OR jsonb_array_length(current_sv.definition->''checklist'')>0',
 ' OR jsonb_array_length(current_sv.definition->''fields'')>0'] LOOP updated:=replace(updated,part,'');END LOOP;
 EXECUTE updated;
 -- A checklist is a collection requirement, never a reason to hide an offer.
 -- Preserve its immutable source labels in the request; validation remains12.
 SELECT pg_get_functiondef('private.document_booking_create(uuid,jsonb,uuid)'::regprocedure) INTO s;
 updated:=replace(s,' OR jsonb_array_length(sv.definition->''checklist'')>0','');
 updated:=replace(updated,'snap,''{}'',''[]'',''[]'') RETURNING * INTO it;', 'snap,''{}'',''[]'',coalesce(sv.definition->''checklist'',''[]''::jsonb)) RETURNING * INTO it;');
 IF updated=s THEN RAISE EXCEPTION 'Catalog booking patch missing';END IF;EXECUTE updated;
END$m$;
NOTIFY pgrst,'reload schema';
