-- Remove picsum placeholder thumbnails so the app renders medical SVG covers instead.
UPDATE tbl_presentations SET thumbnail_url = NULL;
