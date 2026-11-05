-- D-025: /ingest moved to the apikeys module. Owner decision 2026-11-05: reissue, copy no rows (Pulseboard is not
-- deployed; its pk_ keys could not pass resolveKey's api_ prefix check anyway).
DROP TABLE "WriteKey";
