import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupOrg, createTestOrg, createTestRaffle, seedNumeros, type TestOrg, type TestRaffle } from "./helpers/fixtures";

// Proves 0013_blessed_numbers_broadcast.sql's Broadcast-from-Database trigger
// (design D8, Round 2): a real anon client subscribed to org A's topic
// (`org:{organization_id}:blessed-numbers`) never receives org B's broadcast
// payloads, even when both organizations have blessed-numbers activity in
// the same window. Uses REAL anon Realtime clients over a real WebSocket
// connection against the local Supabase stack -- not a
// realtime.messages-table assertion -- because the actual guarantee being
// proven is "what does a subscribed client receive", which is the same
// guarantee the spec's realtime-updates domain and design's Testing
// Strategy table describe. Channel is deliberately non-private (see
// migration header / design D8's "Security posture" note), so no
// realtime.setAuth() token is needed to subscribe.
//
// RED until 0013_blessed_numbers_broadcast.sql exists.

const SUPABASE_URL = process.env.TEST_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.TEST_SUPABASE_ANON_KEY!;

const EVENT = "blessed_number_changed";

interface BroadcastPayload {
  numero: number;
  estado: string;
  raffle_id: string;
  organization_id: string;
}

let admin: SupabaseClient;
let anonA: SupabaseClient;
let anonB: SupabaseClient;
let orgA: TestOrg;
let orgB: TestOrg;
let raffleA: TestRaffle;
let raffleB: TestRaffle;

function topicFor(orgId: string): string {
  return `org:${orgId}:blessed-numbers`;
}

/** Subscribes to a topic and resolves once the channel is fully joined. */
function subscribeAndCollect(client: SupabaseClient, topic: string): Promise<{ channel: RealtimeChannel; received: BroadcastPayload[] }> {
  const received: BroadcastPayload[] = [];
  const channel = client.channel(topic).on("broadcast", { event: EVENT }, ({ payload }) => {
    received.push(payload as BroadcastPayload);
  });

  return new Promise((resolve, reject) => {
    channel.subscribe((status, err) => {
      if (status === "SUBSCRIBED") resolve({ channel, received });
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        reject(err ?? new Error(`Failed to subscribe to ${topic}: ${status}`));
      }
    });
  });
}

/** Polls a condition until it's true or the timeout elapses. */
async function waitFor(check: () => boolean, timeoutMs = 8000, intervalMs = 100): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  if (!check()) throw new Error(`Condition not met within ${timeoutMs}ms`);
}

beforeAll(async () => {
  admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  anonA = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  anonB = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  orgA = await createTestOrg(admin, "broadcast-a");
  orgB = await createTestOrg(admin, "broadcast-b");
  raffleA = await createTestRaffle(admin, orgA.id, "a", { maxNumero: 20 });
  raffleB = await createTestRaffle(admin, orgB.id, "b", { maxNumero: 20 });
  await seedNumeros(admin, raffleA);
  await seedNumeros(admin, raffleB);
});

afterAll(async () => {
  anonA.removeAllChannels();
  anonB.removeAllChannels();
  await cleanupOrg(admin, orgA.id);
  await cleanupOrg(admin, orgB.id);
});

describe("blessed-numbers Broadcast from Database", () => {
  it("delivers an INSERT of a blessed number to its own org's topic", async () => {
    const { channel, received } = await subscribeAndCollect(anonA, topicFor(orgA.id));

    const { error } = await admin
      .from("numeros")
      .insert({ raffle_id: raffleA.id, organization_id: orgA.id, numero: 900, estado: "disponible", es_bendecido: true });
    expect(error).toBeNull();

    await waitFor(() => received.some((p) => p.numero === 900));
    expect(received.some((p) => p.numero === 900 && p.organization_id === orgA.id)).toBe(true);

    anonA.removeChannel(channel);
  });

  it("delivers an UPDATE that changes estado on a blessed number, not an update that leaves estado unchanged", async () => {
    const { channel, received } = await subscribeAndCollect(anonA, topicFor(orgA.id));

    // Seed a blessed number in 'disponible', then touch an unrelated write
    // (re-set estado to the same value) -- must NOT broadcast.
    const { error: insertError } = await admin
      .from("numeros")
      .insert({ raffle_id: raffleA.id, organization_id: orgA.id, numero: 901, estado: "disponible", es_bendecido: true });
    expect(insertError).toBeNull();
    await waitFor(() => received.some((p) => p.numero === 901));
    const countAfterInsert = received.length;

    const { error: noopError } = await admin
      .from("numeros")
      .update({ estado: "disponible" })
      .eq("raffle_id", raffleA.id)
      .eq("numero", 901);
    expect(noopError).toBeNull();

    // Give the (absent) broadcast a real chance to arrive before asserting
    // it never did.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(received.length).toBe(countAfterInsert);

    // Now actually change estado -- must broadcast.
    const { error: updateError } = await admin
      .from("numeros")
      .update({ estado: "vendido" })
      .eq("raffle_id", raffleA.id)
      .eq("numero", 901);
    expect(updateError).toBeNull();

    await waitFor(() => received.some((p) => p.numero === 901 && p.estado === "vendido"));

    anonA.removeChannel(channel);
  });

  it("org A's topic never receives org B's broadcast payloads, even with simultaneous activity in both orgs", async () => {
    const [{ channel: channelA, received: receivedA }, { channel: channelB, received: receivedB }] = await Promise.all([
      subscribeAndCollect(anonA, topicFor(orgA.id)),
      subscribeAndCollect(anonB, topicFor(orgB.id)),
    ]);

    // Simultaneous activity in both orgs.
    const [{ error: errorA }, { error: errorB }] = await Promise.all([
      admin.from("numeros").insert({ raffle_id: raffleA.id, organization_id: orgA.id, numero: 902, estado: "disponible", es_bendecido: true }),
      admin.from("numeros").insert({ raffle_id: raffleB.id, organization_id: orgB.id, numero: 902, estado: "disponible", es_bendecido: true }),
    ]);
    expect(errorA).toBeNull();
    expect(errorB).toBeNull();

    await waitFor(() => receivedA.some((p) => p.numero === 902) && receivedB.some((p) => p.numero === 902));

    for (const payload of receivedA) {
      expect(payload.organization_id).toBe(orgA.id);
    }
    for (const payload of receivedB) {
      expect(payload.organization_id).toBe(orgB.id);
    }

    anonA.removeChannel(channelA);
    anonB.removeChannel(channelB);
  });
});
