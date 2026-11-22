# Lookout

A field guide to the Pacific Northwest: places to go, and the living things you'll see there. A sister site to [Myriad](https://github.com/prntwrld/myriad).

Plain HTML, CSS and JavaScript, with no build step. It runs on GitHub Pages and works offline as an installable web app.

## Pages
- **Front page** (`index.html`, `app/home.js`): Today (a hike in season or a flower in bloom, the same pick for everyone all day), a wall of photos, the map, and your progress.
- **Places** (`places/`, `app/places.js`): the bucket list, the map with pins for done and not done, what's in season this month, progress by region, and every place, sortable and filterable. Each place (`places/?id=maple-pass`) has its numbers, which of your books pick it ("in 4 of 6 books"), a link to current conditions, a box to tick it off with a date, a note and your own photo, "You might see here" (species recorded near the trailhead this month), a map of what's around it, and the nearest places on your list.
- **Living things** (`living/`, `app/living.js`): every plant and animal recorded in the Pacific Northwest (Washington, Oregon and British Columbia), live from iNaturalist. Browse by group, this month or all year, or search for any species. The groups (in `GROUPS` in `app/core.js`, each one or more iNaturalist taxa) are birds, mammals, plants (wildflowers, conifers, ferns, mosses and liverworts, grasses and sedges), fungi (mushrooms, lichens), insects (butterflies and moths, bees and wasps, beetles, dragonflies, flies, true bugs, grasshoppers), spiders and kin, amphibians, reptiles, fish, molluscs (slugs and snails, clams, octopus), tide pools (sea stars and urchins, anemones and jellies, crabs and barnacles, nudibranchs, chitons, sponges and sea squirts), seaweeds and kelp, worms and millipedes, and slime moulds. Each species (`living/?id=<iNaturalist number>`) has open-licensed photographs, the months it's seen here, how many sightings there are, a map of where it's been seen with your places on it, its relatives in the region, and where on your list to see it. The 300 Cascades wildflowers in `data/` (`living/?id=lupinus-latifolius`) add flowering months, elevation, colour, petals, leaves, habitat, regions and the Pojar page, and they're what the key works from.
- **The key** (`key/`, `app/key.js`): a multi-access key, in three modes. **Wildflowers** (300 Cascades species: flower colour, petals, leaf shape and arrangement, habitat, region, month, elevation) and **Birds** (150 Pacific Northwest species: size, colours, bill, habitat, what it's doing, region, month) let you answer any traits in any order; every choice shows how many species would be left, and the candidates show as photos. The month comes from today's date, and region and elevation from your location if you allow it. These two run on data already in the page, so they work with no signal. **Here & now** covers everything else: pick a group (fungi, mammals, insects…) and it shows what's been recorded near you or in a region, live from iNaturalist. No AI identification anywhere.

## Your data
Everything is JSON in `data/`. These files are yours to edit by hand:

| File | What it holds |
| --- | --- |
| `places.json` | Your bucket list: name, kind (hike, lookout, hot-spring, ghost-town, viewpoint), region, area, trailhead lat/lon, distance, gain, high point, season (first and last month), pass, books, WTA link, and an optional Wikipedia article for the photo. **The 20 places in it are samples to replace.** Check every number against WTA before you rely on it. |
| `books.json` | Your hiking books. A place's `books` lists their ids. **The six books and each place's picks are placeholders** for you to replace with your own shelf. |
| `regions.json` | The regions and their boxes, shared by places, species and the key. |
| `flower-traits.json` | The key's traits, one line per species: `colours \| petals \| leaf shape \| arrangement \| habitat`. They were written for this guide from general botanical knowledge and none of the text is copied from any field guide. Correct anything you see differently. |
| `bird-traits.json` | The bird key's traits, one line per species: `size \| colours \| bill \| habitat \| behaviour`. Also written for this guide; correct freely. |
| `pojar.json` | Page numbers in Pojar & MacKinnon, one per species, all blank to start. Fill them in and they appear on the species page as "Pojar p. 214". |

Everything else in `data/` is written by the tools, so don't edit it by hand. The page joins the hand-edited files to the built ones when it loads, so edits to traits, Pojar pages, places and books show up without a rebuild.

**Your log** (what you've done, the date, the note) is kept in the browser's local storage, and your photos are kept in its IndexedDB, both on this device only. *Places → Your log → Export* saves everything, photos included, as one JSON file, and *Import* merges such a file back in (on another device, or after clearing the browser).

## Building the data
The scripts in `tools/` (Python 3 with `requests` and `Pillow`) fetch from the open services and write compact JSON:

```sh
python3 tools/build_places.py    # about 10 minutes for 20 places
python3 tools/build_flowers.py   # about 35 minutes for 300 species; COUNT=150 for fewer
python3 tools/build_birds.py     # about 10 minutes for 150 birds; COUNT=200 for more
```

A new trait pack (mushrooms, say) follows the birds: a build script that writes `data/<name>.json`, a hand-written `data/<name>-traits.json` whose `codes.slots` names its columns, and an entry in `KEYS` in `app/key.js` with its questions.

- **`build_places.py`** writes `data/places-extra.json`. It finds the trailhead pin and named peaks, lookouts, hot springs, viewpoints, lakes and waterfalls nearby using OpenStreetMap (Overpass, or Nominatim when no Overpass server answers). It takes a photo and two sentences from Wikipedia (freely licensed photos only, with author and licence), and records what iNaturalist observers have seen within 3 km in each month.
- **`build_flowers.py`** writes `data/flowers.json` and `data/thumbs/`. It picks the most-recorded native wildflowers across the Cascade regions (`tools/flora_rules.py` leaves out grasses, sedges, shrubs, trees and pond weeds) and fetches each one's names, family and the Wikipedia summary iNaturalist carries. Photos are Creative Commons only (CC0, CC BY, CC BY-SA, CC BY-NC, CC BY-NC-SA; never "no derivatives" or all rights reserved), each credited to its photographer. iNaturalist's own picks for the species come first, then Wikipedia's lead picture, then the region's sightings, with grey, dark or flat pictures moved back. Flowering months come from sightings annotated as flowering, regions from where it has been recorded, and elevation from the heights of its sightings (Open Topo Data, SRTM 30 m). It also saves a 200 px thumbnail of each species in the repository, so the key and the guide work offline.

Every request is paced (about one a second for iNaturalist, Nominatim and Open Topo Data, as each asks) and cached in `tools/.cache/`, so a rerun only asks for what's new. Set `PAUSE_INATURALIST=2` (or `PAUSE_NOMINATIM`, `PAUSE_OPENTOPODATA`) to go slower.

## Live and saved
Living things, species pages and "You might see here" ask iNaturalist as you browse (photos follow the same Creative Commons rule as the packs; non-commercial licences are used because Lookout is a non-commercial site, so revisit that if it ever becomes commercial). The wildflower pack, the places and your log are files in the repository and on your device.

## Offline
`sw.js` is the service worker. On install it saves the app shell, the data packs and every wildflower thumbnail. Pages, scripts and data load fresh when there's a connection, so your edits show up, and come from the saved copy only when there's no connection. Photos and map tiles are saved as you view them, so a place or species you've opened before still has its pictures offline. When you change the list of shell files in `sw.js`, bump `VERSION` there.

## Later, as an iOS app
The site is built so that a native app can wrap it or read the same data without a rewrite:
- **Capacitor:** every path is relative and there's no server code, so the repository root can be the `webDir` as it is. Everything that touches the device goes through three objects in `app/core.js`: `Lookout.data` (the JSON packs), `Lookout.store` (settings and your log) and `Lookout.photos` (your photos). Swap those for Capacitor's Filesystem and Preferences plugins, and use Geolocation for the key, if you want native storage.
- **SwiftUI:** the JSON in `data/` is the app's data model. `places.json` and `places-extra.json` are joined by `id`, and `flowers.json` and `flower-traits.json` by scientific name. The key's matching rules are the `fits()` function in `app/key.js`. The log export format (`{log, photos}`) is the same on both sides.

## Testing
`tools/check_site.mjs` uses the pre-installed Playwright. It loads every kind of page at 1366, 880 and 390 px wide and checks for sideways scrolling, wrapped labels, empty sections and script errors. It then loads the site, cuts the network, and checks that the key and the pages you've already opened still work.

```sh
node tools/check_site.mjs        # screenshots go to $SHOTS (default: /tmp/lookout-shots)
```

## Credits
- Photographs: [iNaturalist](https://www.inaturalist.org) observers (Creative Commons, credited on every photo) and [Wikimedia Commons](https://commons.wikimedia.org) contributors (credited with their licences)
- Maps and places: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, ODbL
- Text: [Wikipedia](https://en.wikipedia.org), CC BY-SA
- Elevations: [Open Topo Data](https://www.opentopodata.org) (SRTM)
- [Leaflet](https://leafletjs.com) (BSD-2-Clause), [Fraunces](https://github.com/undercasetype/Fraunces) and [Source Serif 4](https://github.com/adobe-fonts/source-serif) (SIL Open Font License); their licences are in `vendor/` and `fonts/`
