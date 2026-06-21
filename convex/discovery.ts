import { v } from "convex/values";
import { api } from "./_generated/api";
import { action, mutation } from "./_generated/server";
import { getCurrentAppUser } from "./auth";

const categoryValidator = v.union(
  v.literal("food"),
  v.literal("drinks"),
  v.literal("entertainment"),
  v.literal("activity"),
);

type DiscoveryCategory = "food" | "drinks" | "entertainment" | "activity";

type DiscoveredPlace = {
  externalId: string;
  title: string;
  description: string;
  category: DiscoveryCategory;
  subcategories: string[];
  sourceUrl: string;
  latitude: number;
  longitude: number;
  address?: string;
};

const overpassTags: Record<DiscoveryCategory, string[]> = {
  food: [
    'node["amenity"~"restaurant|cafe|fast_food|food_court|ice_cream"]',
    'way["amenity"~"restaurant|cafe|fast_food|food_court|ice_cream"]',
  ],
  drinks: ['node["amenity"~"bar|pub|biergarten"]', 'way["amenity"~"bar|pub|biergarten"]'],
  entertainment: [
    'node["amenity"~"cinema|theatre"]',
    'way["amenity"~"cinema|theatre"]',
    'node["tourism"~"museum|gallery|attraction"]',
    'way["tourism"~"museum|gallery|attraction"]',
  ],
  activity: [
    'node["leisure"~"park|fitness_centre|sports_centre|bowling_alley"]',
    'way["leisure"~"park|fitness_centre|sports_centre|bowling_alley"]',
    'node["tourism"~"zoo|aquarium"]',
    'way["tourism"~"zoo|aquarium"]',
  ],
};

function mapsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}

function categoryFromArgs(value: string): DiscoveryCategory {
  if (value === "food" || value === "drinks" || value === "entertainment" || value === "activity")
    return value;
  return "activity";
}

function normalizePlace(
  element: any,
  category: DiscoveryCategory,
  fallbackLat: number,
  fallbackLon: number,
): DiscoveredPlace | null {
  const tags = element.tags ?? {};
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  const name = typeof tags.name === "string" ? tags.name.trim() : "";
  if (!name || typeof lat !== "number" || typeof lon !== "number") return null;
  const typeTag = tags.cuisine ?? tags.amenity ?? tags.tourism ?? tags.leisure ?? category;
  const address = [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"]]
    .filter(Boolean)
    .join(" ");
  const distanceHint = Math.round(
    Math.hypot((lat - fallbackLat) * 111_000, (lon - fallbackLon) * 85_000),
  );
  return {
    externalId: `osm:${element.type}:${element.id}`,
    title: name,
    description: `${typeTag} nearby${distanceHint ? ` · about ${distanceHint}m away` : ""}`,
    category,
    subcategories: Array.from(new Set([String(typeTag), tags.cuisine].filter(Boolean))).slice(0, 4),
    sourceUrl: tags.website ?? mapsUrl(lat, lon),
    latitude: lat,
    longitude: lon,
    address: address || undefined,
  };
}

export const insertDiscovered = mutation({
  args: {
    places: v.array(
      v.object({
        externalId: v.string(),
        title: v.string(),
        description: v.string(),
        category: categoryValidator,
        subcategories: v.array(v.string()),
        sourceUrl: v.string(),
        latitude: v.number(),
        longitude: v.number(),
        address: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAppUser(ctx);
    if (!user) throw new Error("Not signed in.");
    const membership = await ctx.db
      .query("coupleMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (!membership) throw new Error("Pair with your partner first.");
    const existing = await ctx.db
      .query("planIdeas")
      .withIndex("by_couple_and_created_at", (q) => q.eq("coupleId", membership.coupleId))
      .collect();
    const existingExternalIds = new Set(existing.map((idea) => idea.externalId).filter(Boolean));
    let inserted = 0;
    for (const place of args.places) {
      if (existingExternalIds.has(place.externalId)) continue;
      await ctx.db.insert("planIdeas", {
        coupleId: membership.coupleId,
        title: place.title,
        description: place.description,
        category: place.category,
        costLevel: 1,
        durationMinutes: 90,
        subcategories: place.subcategories,
        vibeTags: place.subcategories,
        source: "osm",
        externalId: place.externalId,
        sourceUrl: place.sourceUrl,
        latitude: place.latitude,
        longitude: place.longitude,
        address: place.address,
        createdAt: Date.now(),
      });
      inserted += 1;
    }
    return { inserted };
  },
});

export const discoverNearby = action({
  args: {
    latitude: v.number(),
    longitude: v.number(),
    radiusMeters: v.optional(v.number()),
    categories: v.array(categoryValidator),
  },
  handler: async (ctx, args) => {
    const radius = Math.min(Math.max(args.radiusMeters ?? 2500, 500), 8000);
    const selected = Array.from(
      new Set(
        args.categories.length ? args.categories : ["food", "drinks", "entertainment", "activity"],
      ),
    );
    const queries = selected.flatMap((category) =>
      overpassTags[categoryFromArgs(category)].map(
        (selector) => `${selector}(around:${radius},${args.latitude},${args.longitude});`,
      ),
    );
    const body = `[out:json][timeout:25];(${queries.join("")});out center tags 40;`;
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: body }).toString(),
    });
    if (!response.ok) throw new Error(`Nearby discovery failed: ${response.status}`);
    const json = await response.json();
    const places: DiscoveredPlace[] = [];
    for (const element of json.elements ?? []) {
      const category =
        selected.find((item) =>
          overpassTags[categoryFromArgs(item)].some(
            (selector) =>
              selector.includes(element.tags?.amenity ?? "") ||
              selector.includes(element.tags?.tourism ?? "") ||
              selector.includes(element.tags?.leisure ?? ""),
          ),
        ) ?? "activity";
      const place = normalizePlace(
        element,
        categoryFromArgs(category),
        args.latitude,
        args.longitude,
      );
      if (place) places.push(place);
    }
    const unique = Array.from(
      new Map(places.map((place) => [place.externalId, place])).values(),
    ).slice(0, 40);
    const result: { inserted: number } = await ctx.runMutation(api.discovery.insertDiscovered, {
      places: unique,
    });
    return { found: unique.length, inserted: result.inserted };
  },
});
