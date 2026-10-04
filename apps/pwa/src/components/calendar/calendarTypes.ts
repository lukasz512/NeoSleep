import type AppIcon from "../AppIcon.vue";

type AppIconName = InstanceType<typeof AppIcon>["$props"]["name"];

/** One entry as the day/week/month grids draw it — already in its clinic's wall time (CORE-122). */
export interface CalendarGridEvent {
  id: string;
  title: string;
  /** "YYYY-MM-DD" of the start, in the entry's own zone. */
  dayKey: string;
  startMin: number;
  endMin: number;
  /** "10:00 – 10:30", already formatted for the locale. */
  timeLabel: string;
  startLabel: string;
  meta?: string;
  color: string;
  status: string;
  icon: AppIconName;
  responseIcon?: AppIconName;
  /** CSS colour of the response icon (confirmed, awaiting, cannot attend). */
  responseColor?: string;
  past: boolean;
}
