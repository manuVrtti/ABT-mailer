import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { FIELD_META, isSubGroup, type Condition, type Node, type RuleTree } from "./schema";

/**
 * Compile a RuleTree into a Prisma `where` for MarketingContact.
 * Rejects any field/operator combination it doesn't recognize — never trust
 * a raw JSON tree that came in from a form.
 *
 * Recurses through subgroups, so "A AND (B OR C)" produces AND[A, OR[B, C]].
 */
export function compileWhere(tree: RuleTree): Prisma.MarketingContactWhereInput {
  const clauses = tree.conditions.map(compileNode);
  return tree.combinator === "AND" ? { AND: clauses } : { OR: clauses };
}

function compileNode(node: Node): Prisma.MarketingContactWhereInput {
  if (isSubGroup(node)) {
    const inner = node.conditions.map(compileCondition);
    return node.combinator === "AND" ? { AND: inner } : { OR: inner };
  }
  return compileCondition(node);
}

function compileCondition(cond: Condition): Prisma.MarketingContactWhereInput {
  const meta = FIELD_META[cond.field];
  if (!meta) throw new Error(`Unknown field: ${cond.field}`);

  const value = coerceValue(meta.type, cond.value);
  const field = cond.field as keyof Prisma.MarketingContactWhereInput;

  switch (cond.op) {
    case "eq":
      return { [field]: value } as Prisma.MarketingContactWhereInput;
    case "ne":
      return { NOT: { [field]: value } } as Prisma.MarketingContactWhereInput;
    case "contains":
      return { [field]: { contains: String(value), mode: "insensitive" } } as Prisma.MarketingContactWhereInput;
    case "startsWith":
      return { [field]: { startsWith: String(value), mode: "insensitive" } } as Prisma.MarketingContactWhereInput;
    case "in":
      return { [field]: { in: Array.isArray(value) ? value : String(value).split(",").map((s) => s.trim()) } } as Prisma.MarketingContactWhereInput;
    case "notIn":
      return { [field]: { notIn: Array.isArray(value) ? value : String(value).split(",").map((s) => s.trim()) } } as Prisma.MarketingContactWhereInput;
    case "isNull":
      return { [field]: null } as Prisma.MarketingContactWhereInput;
    case "isNotNull":
      return { NOT: { [field]: null } } as Prisma.MarketingContactWhereInput;
    case "gt":
      return { [field]: { gt: value } } as Prisma.MarketingContactWhereInput;
    case "gte":
      return { [field]: { gte: value } } as Prisma.MarketingContactWhereInput;
    case "lt":
      return { [field]: { lt: value } } as Prisma.MarketingContactWhereInput;
    case "lte":
      return { [field]: { lte: value } } as Prisma.MarketingContactWhereInput;
    default:
      throw new Error(`Unknown operator: ${cond.op as string}`);
  }
}

function coerceValue(type: string, value: unknown): unknown {
  if (value === undefined || value === null) return value;
  if (type === "number") return typeof value === "number" ? value : Number(value);
  if (type === "date") return typeof value === "string" ? new Date(value) : value;
  return value;
}

export interface AudiencePreview {
  matching: number;
  suppressed: number;
  final: number;
}

/**
 * Compute the audience: how many contacts match, how many are marketing-
 * suppressed, and the final eligible count. This is what the segment builder
 * shows above the "Save" button.
 */
export async function computeAudience(tree: RuleTree): Promise<AudiencePreview> {
  const where = compileWhere(tree);
  const matching = await db.marketingContact.count({ where });
  if (matching === 0) return { matching: 0, suppressed: 0, final: 0 };

  // Compare against email suppression rows for marketing.
  // We express this via a raw count so we don't have to page all matching rows into memory.
  const suppressed = await db.marketingContact.count({
    where: {
      ...where,
      email: {
        in: (
          await db.suppression.findMany({
            where: { OR: [{ category: "MARKETING" }, { reason: "HARD_BOUNCE" }, { reason: "COMPLAINT" }] },
            select: { email: true },
          })
        ).map((r) => r.email),
      },
    },
  });

  return { matching, suppressed, final: Math.max(0, matching - suppressed) };
}
