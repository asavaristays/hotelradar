-- North Goa beta knowledge pack: belt notes for all pilot belts.
-- Inserts missing (belt, kind) pairs; does not overwrite hand-edited notes.

INSERT INTO belt_notes (belt, kind, note, months_applicable)
SELECT v.belt, v.kind, v.note, v.months
FROM (VALUES
  -- morjim
  ('morjim', 'noise', 'Morjim is quieter than Anjuna or Baga at night; beach shacks taper earlier mid-week.', ARRAY[]::int[]),
  ('morjim', 'access', 'Beach lane can flood in heavy rain — inland approach is more reliable after storms.', ARRAY[6,7,8,9]),
  ('morjim', 'crowd', 'Turtle season and weekends draw more walkers; mid-week is calmer.', ARRAY[11,12,1,2]),
  ('morjim', 'food', 'Shack food along the beach; grocery / pharmacy denser toward Ashwem road.', ARRAY[]::int[]),
  ('morjim', 'seasonal', 'Shoulder monsoon months feel empty and green; peak Dec–Jan fills up fast.', ARRAY[6,7,8,9,12,1]),
  -- anjuna
  ('anjuna', 'noise', 'Anjuna is loud on Wednesdays and weekends — say so before sending a light sleeper.', ARRAY[]::int[]),
  ('anjuna', 'crowd', 'Flea market days and party nights pack the main strip; inland lanes stay quieter.', ARRAY[]::int[]),
  ('anjuna', 'access', 'Scooters and cabs are easy; cliff / beach parking fills on busy evenings.', ARRAY[]::int[]),
  ('anjuna', 'food', 'Strong café and global-food scene near the market; late kitchens on party nights.', ARRAY[]::int[]),
  ('anjuna', 'safety', 'Keep valuables tight on crowded market / party nights; stick to lit lanes late.', ARRAY[]::int[]),
  -- arambol
  ('arambol', 'access', 'Last stretch to Arambol can be rough in monsoon; prefer daytime arrivals.', ARRAY[6,7,8,9]),
  ('arambol', 'noise', 'Drum circles and beach parties some evenings; inland stays are quieter.', ARRAY[]::int[]),
  ('arambol', 'crowd', 'Peak season brings backpacker density on the main beach path.', ARRAY[12,1,2]),
  ('arambol', 'food', 'Budget shacks and juice stalls dominate; fewer late fine-dining options.', ARRAY[]::int[]),
  ('arambol', 'monsoon', 'Expect muddy access and occasional power blips in heavy rain months.', ARRAY[6,7,8,9]),
  -- ashwem
  ('ashwem', 'noise', 'Quieter than Anjuna; some beach bars on weekends but not Baga-level.', ARRAY[]::int[]),
  ('ashwem', 'access', 'Beach road is narrow; taxis prefer the inland connector after dusk.', ARRAY[]::int[]),
  ('ashwem', 'crowd', 'Sits between Morjim and Arambol — good buffer if guests want calmer sand.', ARRAY[]::int[]),
  ('ashwem', 'food', 'Beach shacks plus a few cafés on the main lane; denser options toward Morjim.', ARRAY[]::int[]),
  ('ashwem', 'seasonal', 'Beautiful in shoulder months; Dec–Jan sees more day-trippers from Anjuna.', ARRAY[11,12,1]),
  -- candolim
  ('candolim', 'crowd', 'Candolim packs hard Dec–Jan; price and wait times climb with footfall.', ARRAY[12,1]),
  ('candolim', 'noise', 'Livelier than Morjim but usually calmer than Baga night strip.', ARRAY[]::int[]),
  ('candolim', 'access', 'Easy taxi corridor toward Calangute / Fort Aguada; beach parking fills by afternoon in peak.', ARRAY[12,1]),
  ('candolim', 'food', 'Wide mix of shacks, cafés, and hotel restaurants along the main road.', ARRAY[]::int[]),
  ('candolim', 'seasonal', 'Christmas–New Year is the busiest stretch of the year on this belt.', ARRAY[12,1]),
  -- calangute
  ('calangute', 'crowd', 'North Goa’s busiest beach strip — expect dense footfall and hawkers in peak.', ARRAY[11,12,1,2]),
  ('calangute', 'noise', 'Evening beach road stays lively; ask for inland / quieter rooms if needed.', ARRAY[]::int[]),
  ('calangute', 'access', 'Taxis and scooters everywhere; walking the beach road is slow in high season.', ARRAY[]::int[]),
  ('calangute', 'food', 'Maximum choice — shacks, street food, and hotels; quality varies street to street.', ARRAY[]::int[]),
  ('calangute', 'safety', 'Busy tourist zone — watch bags on the beach road and confirm taxi fares.', ARRAY[]::int[]),
  -- vagator
  ('vagator', 'noise', 'Cliff and Ozran side can be party-loud on weekends; Chapora village is different energy.', ARRAY[]::int[]),
  ('vagator', 'access', 'Hill / cliff approaches; scooters help. Some properties are a walk from the beach path.', ARRAY[]::int[]),
  ('vagator', 'crowd', 'Sunset spots get packed; mornings are calmer.', ARRAY[]::int[]),
  ('vagator', 'food', 'Cafés and cliff restaurants; fewer late options inland than Anjuna.', ARRAY[]::int[]),
  ('vagator', 'seasonal', 'Strong sunset season Nov–Feb; monsoon cliffs can be slippery — warn guests.', ARRAY[6,7,8,9,11,12,1,2]),
  -- baga
  ('baga', 'noise', 'Among the loudest North Goa nights — clubs and beach strip run late.', ARRAY[]::int[]),
  ('baga', 'crowd', 'Peak evenings are packed; not ideal for guests who want quiet sleep.', ARRAY[11,12,1,2]),
  ('baga', 'access', 'Short hops to Calangute; traffic crawls on party nights.', ARRAY[]::int[]),
  ('baga', 'food', 'Bars and shacks dominate; confirm kitchen hours if arriving very late.', ARRAY[]::int[]),
  ('baga', 'safety', 'Busy nightlife — stick to known venues and arrange returns before last call.', ARRAY[]::int[])
) AS v(belt, kind, note, months)
WHERE NOT EXISTS (
  SELECT 1 FROM belt_notes b
  WHERE b.belt = v.belt AND b.kind = v.kind AND b.active = TRUE
);
