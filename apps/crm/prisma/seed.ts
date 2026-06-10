/**
 * Seed 200 realistic StyleArc customers (a mid-market Indian fashion label) with order
 * histories whose SHAPE matches each persona — so segmentation, analytics and the agent's
 * reasoning all have genuine signal:
 *   HIGH_SPENDER   — many recent orders, high amounts, high LTV
 *   DORMANT        — real history but no order in 5+ months (the win-back target)
 *   NEW            — joined recently, 1–2 small orders
 *   DISCOUNT_HUNTER— frequent but low-value orders
 *   BRAND_LOYAL    — steady cadence, mid-high value, recent
 *
 * Deterministic (seeded RNG) so re-seeds and the demo are reproducible.
 */
import { PrismaClient, Persona, Channel, OrderChannel } from "@prisma/client";

const prisma = new PrismaClient();

// ---- deterministic RNG (mulberry32) ----
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260611);
const rand = () => rng();
const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const round100 = (n: number) => Math.round(n / 100) * 100;

// ---- name pools (real-sounding Indian names) ----
const FIRST = [
  "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Reyansh", "Kabir", "Ananya", "Diya",
  "Saanvi", "Aadhya", "Ishaan", "Krishna", "Rohan", "Ayaan", "Riya", "Myra", "Sara",
  "Anika", "Navya", "Kiara", "Aarohi", "Siddharth", "Dhruv", "Kavya", "Tara", "Meera",
  "Ishita", "Rhea", "Aryan", "Kabir", "Naina", "Advait", "Shaurya", "Pari", "Avni",
  "Neha", "Pooja", "Rahul", "Karan", "Nikhil", "Sneha", "Priya", "Varun", "Tanvi",
  "Yash", "Ritika", "Manish", "Deepak", "Shreya",
];
const LAST = [
  "Sharma", "Verma", "Gupta", "Iyer", "Nair", "Reddy", "Patel", "Mehta", "Shah", "Rao",
  "Kapoor", "Malhotra", "Chopra", "Bose", "Banerjee", "Mukherjee", "Desai", "Joshi",
  "Pillai", "Menon", "Agarwal", "Bhat", "Kulkarni", "Naidu", "Chauhan", "Sethi", "Khanna",
  "Saxena", "Trivedi", "Das",
];

const CATEGORIES = ["Tops", "Denim", "Dresses", "Accessories", "Footwear"];
const CHANNELS: Channel[] = [Channel.WHATSAPP, Channel.SMS, Channel.EMAIL, Channel.RCS];

// persona → 200 distribution: 20/25/20/20/15 %
const PERSONA_PLAN: { persona: Persona; count: number }[] = [
  { persona: Persona.HIGH_SPENDER, count: 40 },
  { persona: Persona.DORMANT, count: 50 },
  { persona: Persona.NEW, count: 40 },
  { persona: Persona.DISCOUNT_HUNTER, count: 40 },
  { persona: Persona.BRAND_LOYAL, count: 30 },
];

type PersonaProfile = {
  orders: [number, number]; // [min,max] order count
  amount: [number, number]; // [min,max] INR per order
  window: [number, number]; // [minDaysAgo, maxDaysAgo] order spread
  forceRecentMax?: number; // force most-recent order within this many days ago
};
const PROFILES: Record<Persona, PersonaProfile> = {
  HIGH_SPENDER: { orders: [5, 8], amount: [5000, 12000], window: [2, 300], forceRecentMax: 30 },
  DORMANT: { orders: [2, 5], amount: [1500, 6000], window: [150, 360] }, // no recent order
  NEW: { orders: [1, 2], amount: [1000, 4000], window: [1, 50], forceRecentMax: 25 },
  DISCOUNT_HUNTER: { orders: [3, 7], amount: [800, 2500], window: [10, 330], forceRecentMax: 60 },
  BRAND_LOYAL: { orders: [4, 8], amount: [3000, 8000], window: [5, 340], forceRecentMax: 45 },
};

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysAgo = (d: number) => new Date(now - d * DAY);

async function main() {
  console.log("Seeding StyleArc customers…");
  await prisma.communicationEvent.deleteMany();
  await prisma.order.deleteMany();
  await prisma.communication.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.segment.deleteMany();
  await prisma.agentRun.deleteMany();

  let i = 0;
  for (const { persona, count } of PERSONA_PLAN) {
    const profile = PROFILES[persona];
    for (let k = 0; k < count; k++) {
      i++;
      const first = pick(FIRST);
      const last = pick(LAST);
      const email = `${first}.${last}${i}`.toLowerCase() + "@example.com";
      const phone = "+9198" + String(randInt(10000000, 99999999)).padStart(8, "0");
      const preferredChannel = pick(CHANNELS);

      const orderCount = randInt(profile.orders[0], profile.orders[1]);
      const offsets: number[] = [];
      for (let o = 0; o < orderCount; o++) {
        offsets.push(randInt(profile.window[0], profile.window[1]));
      }
      // force a recent order for active personas so recency filters behave as intended
      if (profile.forceRecentMax !== undefined) {
        offsets[0] = randInt(1, profile.forceRecentMax);
      }
      offsets.sort((a, b) => b - a); // oldest first

      const orders = offsets.map((off) => ({
        amount: round100(randInt(profile.amount[0], profile.amount[1])),
        category: pick(CATEGORIES),
        channel: rand() < 0.7 ? OrderChannel.ONLINE : OrderChannel.OFFLINE,
        createdAt: daysAgo(off),
      }));

      const ltv = orders.reduce((s, o) => s + o.amount, 0);
      const lastOrderDate = daysAgo(Math.min(...offsets));
      const customerCreatedAt = daysAgo(Math.max(...offsets) + randInt(2, 25));

      await prisma.customer.create({
        data: {
          name: `${first} ${last}`,
          email,
          phone,
          persona,
          preferredChannel,
          ltv,
          totalOrders: orderCount,
          lastOrderDate,
          createdAt: customerCreatedAt,
          orders: { create: orders },
        },
      });
    }
  }

  const total = await prisma.customer.count();
  const orderTotal = await prisma.order.count();
  const byPersona = await prisma.customer.groupBy({ by: ["persona"], _count: true });
  console.log(`Seeded ${total} customers, ${orderTotal} orders.`);
  console.table(byPersona.map((p) => ({ persona: p.persona, count: p._count })));
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
