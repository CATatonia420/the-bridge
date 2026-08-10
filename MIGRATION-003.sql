-- THE BRIDGE — Migration 003
-- Prevent accidental duplicate records for the same cat feeding slot.
-- If you run this after test feedings exist, it is still safe unless duplicates already exist.

create unique index if not exists one_feeding_per_cat_slot_per_day
on public.cat_feedings (cat_id, schedule_id, feeding_date)
where schedule_id is not null;
