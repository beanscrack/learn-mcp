// DateEvent classification system for D2L calendar events

export enum DateType {
  DUE = "due",
  AVAILABLE_FROM = "available_from",
  CLOSES = "closes",
  OPENS = "opens",
  FEEDBACK_RELEASE = "feedback_release",
  EXAM = "exam",
  LECTURE = "lecture",
  UNKNOWN = "unknown",
}

export enum Confidence {
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
}

export interface DateEvent {
  courseId: number;
  courseName: string;
  title: string;
  datetime: string;
  dateType: DateType;
  source: string;
  url: string | null;
  confidence: Confidence;
  rawSnippet: string;
  assignmentId?: number | null;
}

const PATTERNS = {
  due: {
    high: [
      /\bdue\b/i,
      /\bdeadline\b/i,
      /\bsubmit by\b/i,
      /\bmust be submitted\b/i,
      /\bno later than\b/i,
      /\bdue date\b/i,
      /\bsubmission deadline\b/i,
    ],
    medium: [/\bsubmit\b/i, /\bhand in\b/i, /\bturn in\b/i],
  },
  available_from: {
    high: [
      /\bavailable from\b/i,
      /\bopens\b/i,
      /\breleased\b/i,
      /\bposted\b/i,
      /\bwill be available\b/i,
      /\bstarts\b/i,
      /\bbegins\b/i,
      /\bavailability\b/i,
    ],
    medium: [/\bavailable\b/i],
  },
  closes: {
    high: [
      /\bcloses\b/i,
      /\bavailable until\b/i,
      /\bwindow closes\b/i,
      /\bwill close\b/i,
      /\bends\b/i,
      /\bexpires\b/i,
      /\bfinal date\b/i,
      /\blast day\b/i,
    ],
    medium: [/\buntil\b/i, /\bby\b/i],
  },
  feedback_release: {
    high: [
      /\bfeedback\b/i,
      /\bgrade release\b/i,
      /\bresults available\b/i,
      /\bscores posted\b/i,
    ],
  },
  exam: {
    high: [/\bexam\b/i, /\btest\b/i, /\bmidterm\b/i, /\bfinal\b/i, /\bquiz\b/i],
  },
  lecture: {
    high: [
      /\blecture\b/i,
      /\bclass\b/i,
      /\blesson\b/i,
      /\bseminar\b/i,
      /\btutorial\b/i,
    ],
  },
};

export function classifyDateEvent(
  title: string,
  description = "",
  eventType: string | null = null
): { dateType: DateType; confidence: Confidence; snippet: string } {
  const text = `${title} ${description}`.toLowerCase();

  for (const [type, levels] of Object.entries(PATTERNS)) {
    if (levels.high) {
      for (const pattern of levels.high) {
        if (pattern.test(text)) {
          const match = text.match(pattern);
          return {
            dateType: type as DateType,
            confidence: Confidence.HIGH,
            snippet: match ? match[0] : text.substring(0, 50),
          };
        }
      }
    }
    if ("medium" in levels && levels.medium) {
      for (const pattern of levels.medium) {
        if (pattern.test(text)) {
          const match = text.match(pattern);
          return {
            dateType: type as DateType,
            confidence: Confidence.MEDIUM,
            snippet: match ? match[0] : text.substring(0, 50),
          };
        }
      }
    }
  }

  if (eventType) {
    if (eventType.includes("Dropbox") || eventType.includes("Assignment")) {
      return {
        dateType: DateType.DUE,
        confidence: Confidence.MEDIUM,
        snippet: "inferred from assignment type",
      };
    }
    if (eventType.includes("Quiz")) {
      return {
        dateType: DateType.EXAM,
        confidence: Confidence.MEDIUM,
        snippet: "inferred from quiz type",
      };
    }
  }

  return {
    dateType: DateType.UNKNOWN,
    confidence: Confidence.LOW,
    snippet: text.substring(0, 50),
  };
}

export function deduplicateDateEvents(events: DateEvent[]): DateEvent[] {
  const grouped = new Map<number, DateEvent[]>();
  const nonAssignment: DateEvent[] = [];

  for (const event of events) {
    if (event.assignmentId) {
      const group = grouped.get(event.assignmentId) || [];
      group.push(event);
      grouped.set(event.assignmentId, group);
    } else {
      nonAssignment.push(event);
    }
  }

  const deduplicated: DateEvent[] = [];

  for (const [, group] of grouped) {
    if (group.length === 1) {
      deduplicated.push(group[0]);
      continue;
    }
    const dueHigh = group.find(
      (e) => e.dateType === DateType.DUE && e.confidence === Confidence.HIGH
    );
    if (dueHigh) { deduplicated.push(dueHigh); continue; }

    const dueMed = group.find(
      (e) => e.dateType === DateType.DUE && e.confidence === Confidence.MEDIUM
    );
    if (dueMed) { deduplicated.push(dueMed); continue; }

    const sorted = [...group].sort(
      (a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime()
    );
    deduplicated.push(sorted[Math.floor(sorted.length / 2)]);
  }

  return [...deduplicated, ...nonAssignment];
}
