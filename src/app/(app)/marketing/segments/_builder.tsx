"use client";

import { useMemo, useState, useTransition } from "react";
import { Card, Input, Label, Select, Button, Badge } from "@/components/ui";
import {
  FIELD_META,
  OPERATORS,
  isSubGroup,
  type Condition,
  type FieldName,
  type Node as SegNode,
  type Operator,
  type RuleTree,
} from "@/server/segments/schema";
import { previewAudience, saveSegment } from "./actions";

type ConditionRow = Condition & { _rowId: string; _kind: "condition" };
type GroupRow = { _rowId: string; _kind: "group"; combinator: "AND" | "OR"; conditions: ConditionRow[] };
type Row = ConditionRow | GroupRow;

function newCondition(): ConditionRow {
  return { _kind: "condition", _rowId: crypto.randomUUID(), field: "college", op: "eq", value: "" };
}

function newGroup(): GroupRow {
  return { _kind: "group", _rowId: crypto.randomUUID(), combinator: "OR", conditions: [newCondition()] };
}

function nodeToRow(n: SegNode): Row {
  if (isSubGroup(n)) {
    return {
      _kind: "group",
      _rowId: crypto.randomUUID(),
      combinator: n.combinator,
      conditions: n.conditions.map((c) => ({ ...c, _kind: "condition", _rowId: crypto.randomUUID() })),
    };
  }
  return { ...n, _kind: "condition", _rowId: crypto.randomUUID() };
}

function rowToNode(r: Row): SegNode {
  if (r._kind === "group") {
    return {
      combinator: r.combinator,
      conditions: r.conditions.map(({ _rowId, _kind, ...c }) => c),
    };
  }
  const { _rowId, _kind, ...c } = r;
  return c;
}

export function SegmentBuilder({
  segmentId,
  initial,
  initialName,
  initialDescription,
}: {
  segmentId?: string;
  initial?: RuleTree;
  initialName?: string;
  initialDescription?: string;
}) {
  const initialRows: Row[] = useMemo(() => {
    if (initial && initial.conditions.length > 0) {
      return initial.conditions.map(nodeToRow);
    }
    return [newCondition()];
  }, [initial]);

  const [combinator, setCombinator] = useState<"AND" | "OR">(initial?.combinator ?? "AND");
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [preview, setPreview] = useState<{ matching: number; suppressed: number; final: number } | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const rulesJson = JSON.stringify({
    combinator,
    conditions: rows.map(rowToNode),
  } satisfies RuleTree);

  return (
    <form action={saveSegment} className="space-y-4">
      {segmentId && <input type="hidden" name="id" value={segmentId} />}
      <input type="hidden" name="rules" value={rulesJson} />

      <Card className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required defaultValue={initialName ?? ""} placeholder="4th-year ABES, not registered" />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Input id="description" name="description" defaultValue={initialDescription ?? ""} />
          </div>
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Match</div>
          <div className="flex overflow-hidden rounded-md border border-input text-xs">
            {(["AND", "OR"] as const).map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setCombinator(c)}
                className={
                  "px-3 py-1 " +
                  (combinator === c ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent")
                }
              >
                {c === "AND" ? "All conditions (AND)" : "Any condition (OR)"}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {rows.map((row, i) =>
            row._kind === "group" ? (
              <GroupBlock
                key={row._rowId}
                group={row}
                onChange={(next) => setRows((rs) => rs.map((r, idx) => (idx === i ? next : r)))}
                onRemove={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
              />
            ) : (
              <RuleRow
                key={row._rowId}
                row={row}
                onChange={(next) =>
                  setRows((rs) =>
                    rs.map((r, idx) =>
                      idx === i ? { ...next, _kind: "condition", _rowId: (r as ConditionRow)._rowId } : r,
                    ),
                  )
                }
                onRemove={rows.length > 1 ? () => setRows((rs) => rs.filter((_, idx) => idx !== i)) : undefined}
              />
            ),
          )}
        </div>

        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setRows((rs) => [...rs, newCondition()])}>
            + Add condition
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setRows((rs) => [...rs, newGroup()])}>
            + Add group (nested)
          </Button>
        </div>
      </Card>

      <Card className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs text-muted-foreground">Audience preview</div>
          {preview ? (
            <div className="mt-1 flex flex-wrap items-baseline gap-3">
              <div className="text-2xl font-semibold tabular-nums">{preview.final.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">
                {preview.matching.toLocaleString()} matching · {preview.suppressed.toLocaleString()} suppressed
              </div>
            </div>
          ) : previewErr ? (
            <div className="mt-1 text-xs text-destructive">{previewErr}</div>
          ) : (
            <div className="mt-1 text-xs text-muted-foreground">
              Click <b>Preview</b> to compute matching, suppressed and final counts.
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone="muted">Marketing suppression applied</Badge>
            <Badge tone="muted">Hard bounces excluded</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setPreviewErr(null);
                const res = await previewAudience(rulesJson);
                if (res.ok) setPreview({ matching: res.matching, suppressed: res.suppressed, final: res.final });
                else {
                  setPreview(null);
                  setPreviewErr(res.error);
                }
              })
            }
          >
            {pending ? "Computing…" : "Preview"}
          </Button>
          <Button type="submit">Save segment</Button>
        </div>
      </Card>
    </form>
  );
}

function GroupBlock({
  group,
  onChange,
  onRemove,
}: {
  group: GroupRow;
  onChange: (next: GroupRow) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          Nested group · match
          <div className="flex overflow-hidden rounded-md border border-input text-[10px]">
            {(["AND", "OR"] as const).map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => onChange({ ...group, combinator: c })}
                className={
                  "px-2 py-0.5 " +
                  (group.combinator === c ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent")
                }
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <button type="button" onClick={onRemove} className="text-xs text-muted-foreground underline underline-offset-4 hover:text-destructive">
          Remove group
        </button>
      </div>
      <div className="space-y-2">
        {group.conditions.map((row, i) => (
          <RuleRow
            key={row._rowId}
            row={row}
            onChange={(next) =>
              onChange({
                ...group,
                conditions: group.conditions.map((r, idx) =>
                  idx === i ? { ...next, _kind: "condition", _rowId: r._rowId } : r,
                ),
              })
            }
            onRemove={
              group.conditions.length > 1
                ? () =>
                    onChange({ ...group, conditions: group.conditions.filter((_, idx) => idx !== i) })
                : undefined
            }
          />
        ))}
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="mt-2"
        onClick={() => onChange({ ...group, conditions: [...group.conditions, newCondition()] })}
      >
        + Add condition to group
      </Button>
    </div>
  );
}

function RuleRow({
  row,
  onChange,
  onRemove,
}: {
  row: ConditionRow;
  onChange: (next: Condition) => void;
  onRemove?: () => void;
}) {
  const meta = FIELD_META[row.field];
  const takesValue = row.op !== "isNull" && row.op !== "isNotNull";
  return (
    <div className="grid grid-cols-1 items-end gap-2 md:grid-cols-[minmax(0,1fr)_170px_minmax(0,1fr)_auto]">
      <div>
        <Label>Field</Label>
        <Select
          value={row.field}
          onChange={(e) => onChange({ ...row, field: e.target.value as FieldName, value: "" })}
        >
          {(Object.entries(FIELD_META) as [FieldName, (typeof FIELD_META)[FieldName]][]).map(([k, m]) => (
            <option key={k} value={k}>
              {m.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Operator</Label>
        <Select value={row.op} onChange={(e) => onChange({ ...row, op: e.target.value as Operator })}>
          {OPERATORS.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Value</Label>
        {takesValue ? (
          meta.type === "enum" && "options" in meta ? (
            <Select
              value={typeof row.value === "string" ? row.value : ""}
              onChange={(e) => onChange({ ...row, value: e.target.value })}
            >
              <option value="">Select…</option>
              {(meta.options as readonly string[]).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              type={meta.type === "number" ? "number" : meta.type === "date" ? "date" : "text"}
              value={row.value === null || row.value === undefined ? "" : String(row.value)}
              onChange={(e) => onChange({ ...row, value: e.target.value })}
              placeholder={row.op === "in" || row.op === "notIn" ? "comma,separated,values" : ""}
            />
          )
        ) : (
          <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            (no value)
          </div>
        )}
      </div>
      <div className="pb-1">
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-muted-foreground underline underline-offset-4 hover:text-destructive"
          >
            Remove
          </button>
        ) : null}
      </div>
    </div>
  );
}
