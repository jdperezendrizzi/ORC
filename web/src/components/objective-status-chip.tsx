import { objectiveStatusIcon, objectiveStatusLabel, type ObjectiveStatus } from "@/lib/objectives";
import { formatDate } from "@/lib/labels";

const TONE: Record<ObjectiveStatus, string> = { not_yet: "", in_progress: "tone-amber", achieved: "tone-green" };

/** Estado de un objetivo: siempre ícono + texto. */
export function ObjectiveStatusChip({ status, date }: { status: ObjectiveStatus | null; date?: string | null }) {
  if (!status) return <span className="chip shrink-0 text-xs">○ Sin marcar</span>;
  return (
    <span className={`chip shrink-0 text-xs ${TONE[status]}`}>
      {objectiveStatusIcon[status]} {objectiveStatusLabel[status]}
      {date ? ` (${formatDate(date)})` : ""}
    </span>
  );
}
